import { db, nowLocalString, setLastSyncTime, type LocalTransaction, type SyncQueueItem } from './offline-db';
import { supabase, getSession, type Transaction } from './supabase';

// ==================== 타입 ====================

export type SyncState =
  | 'idle'          // 동기화 완료 상태
  | 'syncing'       // 동기화 진행 중
  | 'offline'       // 오프라인
  | 'error';        // 동기화 실패

export interface SyncStatus {
  state: SyncState;
  pendingCount: number;
  lastSyncTime: string | null;
}

type SyncListener = (status: SyncStatus) => void;

// ==================== 싱글톤 매니저 ====================

const MAX_RETRY = 5;
let isSyncing = false;
const listeners = new Set<SyncListener>();

function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

async function emitStatus(): Promise<void> {
  const pendingCount = await db.syncQueue.count();
  const lastSyncTime = typeof window !== 'undefined'
    ? localStorage.getItem('lastSyncTime')
    : null;

  let state: SyncState;
  if (!isOnline()) {
    state = 'offline';
  } else if (isSyncing) {
    state = 'syncing';
  } else if (pendingCount > 0) {
    const allQueue = await db.syncQueue.getAll();
    const hasMaxRetry = allQueue.some(item => item.retryCount >= MAX_RETRY);
    state = hasMaxRetry ? 'error' : 'idle';
  } else {
    state = 'idle';
  }

  const status: SyncStatus = { state, pendingCount, lastSyncTime };
  listeners.forEach(fn => fn(status));
}

// ==================== 퍼블릭 API ====================

/** 상태 변경 리스너 등록 */
export function subscribeSyncStatus(fn: SyncListener): () => void {
  listeners.add(fn);
  emitStatus();
  return () => { listeners.delete(fn); };
}

/**
 * 거래 데이터를 로컬에 저장하고 동기화 큐에 추가
 */
export async function saveTransactionOffline(
  txn: Omit<LocalTransaction, 'localId' | 'syncStatus' | 'createdAt' | 'updatedAt'>
): Promise<LocalTransaction> {
  const now = new Date().toISOString();
  const createdAt = nowLocalString();

  const localId = await db.transactions.add({
    ...txn,
    createdAt,
    updatedAt: now,
    syncStatus: 'pending',
  });

  const saved = (await db.transactions.get(localId))!;

  await db.syncQueue.add({
    action: 'create',
    localId,
    data: {
      customerName: txn.customerName,
      productName: txn.productName,
      quantity: txn.quantity,
      unitPrice: txn.unitPrice,
      date: txn.date,
      createdAt,
      updatedAt: now,
    },
    createdAt: now,
    retryCount: 0,
  });

  if (isOnline()) {
    processSyncQueue();
  }

  await emitStatus();
  return saved;
}

/**
 * 거래 수정을 로컬에 반영하고 동기화 큐에 추가
 */
export async function updateTransactionOffline(
  localId: number,
  updates: Partial<Pick<LocalTransaction, 'customerName' | 'productName' | 'quantity' | 'unitPrice'>>
): Promise<void> {
  const existing = await db.transactions.get(localId);
  if (!existing) throw new Error('로컬 거래를 찾을 수 없습니다.');

  const now = new Date().toISOString();
  const merged = { ...existing, ...updates, updatedAt: now, syncStatus: 'pending' as const };

  await db.transactions.put(merged);

  await db.syncQueue.add({
    action: 'update',
    localId,
    serverId: existing.serverId,
    data: {
      customerName: merged.customerName,
      productName: merged.productName,
      quantity: merged.quantity,
      unitPrice: merged.unitPrice,
      date: merged.date,
      createdAt: merged.createdAt,
      updatedAt: now,
    },
    createdAt: now,
    retryCount: 0,
  });

  if (isOnline()) processSyncQueue();
  await emitStatus();
}

/**
 * 거래 삭제를 로컬에 반영하고 동기화 큐에 추가
 */
export async function deleteTransactionOffline(localId: number): Promise<void> {
  const existing = await db.transactions.get(localId);
  if (!existing) throw new Error('로컬 거래를 찾을 수 없습니다.');

  if (!existing.serverId) {
    await db.transactions.delete(localId);
    await db.syncQueue.deleteByLocalId(localId);
    await emitStatus();
    return;
  }

  await db.transactions.delete(localId);

  await db.syncQueue.add({
    action: 'delete',
    localId,
    serverId: existing.serverId,
    data: {
      customerName: existing.customerName,
      productName: existing.productName,
      quantity: existing.quantity,
      unitPrice: existing.unitPrice,
      date: existing.date,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
    retryCount: 0,
  });

  if (isOnline()) processSyncQueue();
  await emitStatus();
}

/**
 * 동기화 큐 처리: 오래된 순서대로 하나씩 Supabase에 전송
 */
export async function processSyncQueue(): Promise<void> {
  if (isSyncing || !isOnline()) return;

  const session = await getSession();
  if (!session) return;

  isSyncing = true;
  await emitStatus();

  try {
    const queue = await db.syncQueue.getAll(); // createdAt 인덱스 순으로 정렬됨

    for (const item of queue) {
      if (!isOnline()) break;

      try {
        await processQueueItem(item, session);
        await db.syncQueue.delete(item.id!);
      } catch (err) {
        console.error('[Sync] 항목 처리 실패:', err);
        const newRetry = item.retryCount + 1;
        await db.syncQueue.update(item.id!, { retryCount: newRetry });
        if (newRetry >= MAX_RETRY && item.localId) {
          await db.transactions.update(item.localId, { syncStatus: 'failed' });
        }
      }
    }

    setLastSyncTime(nowLocalString());
  } finally {
    isSyncing = false;
    await emitStatus();
  }
}

// ==================== 내부 함수 ====================

async function processQueueItem(
  item: SyncQueueItem,
  session: { user: { id: string } }
): Promise<void> {
  const userId = session.user.id;

  switch (item.action) {
    case 'create': {
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          user_id: userId,
          customer_name: item.data.customerName,
          product_name: item.data.productName,
          quantity: item.data.quantity,
          unit_price: item.data.unitPrice ?? null,
          date: item.data.date,
        })
        .select()
        .single();

      if (error) throw error;

      if (item.localId) {
        await db.transactions.update(item.localId, {
          serverId: String(data.id),
          syncStatus: 'synced',
        });
      }
      console.log('[Sync] CREATE 성공:', data.id);
      break;
    }

    case 'update': {
      if (!item.serverId) throw new Error('serverId 없음 — update 불가');

      const updateData: Record<string, any> = {};
      if (item.data.customerName) updateData.customer_name = item.data.customerName;
      if (item.data.productName) updateData.product_name = item.data.productName;
      if (item.data.quantity !== undefined) updateData.quantity = item.data.quantity;
      if (item.data.unitPrice !== undefined) updateData.unit_price = item.data.unitPrice;
      if (item.data.date) updateData.date = item.data.date;

      const { error } = await supabase
        .from('transactions')
        .update(updateData)
        .eq('id', Number(item.serverId));

      if (error) throw error;

      if (item.localId) {
        await db.transactions.update(item.localId, { syncStatus: 'synced' });
      }
      console.log('[Sync] UPDATE 성공:', item.serverId);
      break;
    }

    case 'delete': {
      if (!item.serverId) throw new Error('serverId 없음 — delete 불가');

      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', Number(item.serverId));

      if (error) throw error;
      console.log('[Sync] DELETE 성공:', item.serverId);
      break;
    }
  }
}

/**
 * Supabase에서 전체 거래 내역을 가져와 로컬 DB를 갱신
 */
export async function pullFromServer(): Promise<Transaction[]> {
  const session = await getSession();
  if (!session) throw new Error('로그인이 필요합니다.');

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  // 서버 데이터를 로컬에 병합 (last-write-wins)
  for (const row of data) {
    const serverId = String(row.id);
    const existing = await db.transactions.findByServerId(serverId);
    const serverUpdatedAt = row.updated_at || row.created_at;

    if (existing) {
      if (!existing.updatedAt || new Date(serverUpdatedAt) >= new Date(existing.updatedAt)) {
        await db.transactions.update(existing.localId!, {
          customerName: row.customer_name,
          productName: row.product_name,
          quantity: row.quantity,
          unitPrice: row.unit_price ?? undefined,
          date: row.date,
          createdAt: formatCreatedAt(row.created_at),
          updatedAt: serverUpdatedAt,
          syncStatus: 'synced',
        });
      }
    } else {
      await db.transactions.add({
        serverId,
        customerName: row.customer_name,
        productName: row.product_name,
        quantity: row.quantity,
        unitPrice: row.unit_price ?? undefined,
        date: row.date,
        createdAt: formatCreatedAt(row.created_at),
        updatedAt: serverUpdatedAt,
        syncStatus: 'synced',
      });
    }
  }

  // 서버에 없는 synced 항목 → 로컬도 삭제
  const serverIds = new Set(data.map((row: any) => String(row.id)));
  const syncedLocal = await db.transactions.findBySyncStatus('synced');
  for (const local of syncedLocal) {
    if (local.serverId && !serverIds.has(local.serverId)) {
      await db.transactions.delete(local.localId!);
    }
  }

  setLastSyncTime(nowLocalString());
  await emitStatus();

  return data.map((row: any) => ({
    id: String(row.id),
    customerName: row.customer_name,
    productName: row.product_name,
    quantity: row.quantity,
    unitPrice: row.unit_price ?? undefined,
    date: row.date,
    createdAt: formatCreatedAt(row.created_at),
  }));
}

/** 로컬 DB에서 거래 내역 조회 */
export async function getLocalTransactions(): Promise<(LocalTransaction & { localId: number })[]> {
  const all = await db.transactions.getAll();
  // createdAt 내림차순 정렬
  all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return all as (LocalTransaction & { localId: number })[];
}

// ==================== 내부 헬퍼 ====================

function formatCreatedAt(isoString: string): string {
  const d = new Date(isoString);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
}
