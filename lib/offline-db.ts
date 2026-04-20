// ==================== 타입 정의 ====================

/** 로컬 캐시용 거래 데이터 (Supabase transactions 테이블과 동일 구조) */
export interface LocalTransaction {
  /** 로컬 자동 증가 ID (IndexedDB 전용) */
  localId?: number;
  /** Supabase 서버 ID (동기화 후 할당) */
  serverId?: string;
  customerName: string;
  productName: string;
  quantity: number;
  unitPrice?: number;
  date: string;        // YYYY-MM-DD
  createdAt: string;   // YYYY-MM-DD HH:mm:ss (로컬 시간)
  updatedAt: string;   // ISO 8601 — 충돌 방지용
  /** 동기화 상태 */
  syncStatus: 'synced' | 'pending' | 'failed';
}

/** 동기화 대기열 항목 */
export interface SyncQueueItem {
  id?: number;
  action: 'create' | 'update' | 'delete';
  localId?: number;
  serverId?: string;
  data: Omit<LocalTransaction, 'localId' | 'syncStatus'>;
  createdAt: string;
  retryCount: number;
}

// ==================== IndexedDB 래퍼 ====================

const DB_NAME = 'transactionsDB';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains('transactions')) {
        const txnStore = db.createObjectStore('transactions', { keyPath: 'localId', autoIncrement: true });
        txnStore.createIndex('serverId', 'serverId', { unique: false });
        txnStore.createIndex('date', 'date', { unique: false });
        txnStore.createIndex('syncStatus', 'syncStatus', { unique: false });
        txnStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains('syncQueue')) {
        const queueStore = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
        queueStore.createIndex('createdAt', 'createdAt', { unique: false });
        queueStore.createIndex('localId', 'localId', { unique: false });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => reject(request.error);
  });
}

// ==================== DB 조작 헬퍼 ====================

export const db = {
  transactions: {
    async add(item: Omit<LocalTransaction, 'localId'>): Promise<number> {
      const idb = await openDB();
      return new Promise((resolve, reject) => {
        const tx = idb.transaction('transactions', 'readwrite');
        const store = tx.objectStore('transactions');
        const req = store.add(item);
        req.onsuccess = () => resolve(req.result as number);
        req.onerror = () => reject(req.error);
      });
    },

    async get(localId: number): Promise<LocalTransaction | undefined> {
      const idb = await openDB();
      return new Promise((resolve, reject) => {
        const tx = idb.transaction('transactions', 'readonly');
        const store = tx.objectStore('transactions');
        const req = store.get(localId);
        req.onsuccess = () => resolve(req.result as LocalTransaction | undefined);
        req.onerror = () => reject(req.error);
      });
    },

    async put(item: LocalTransaction): Promise<void> {
      const idb = await openDB();
      return new Promise((resolve, reject) => {
        const tx = idb.transaction('transactions', 'readwrite');
        const store = tx.objectStore('transactions');
        const req = store.put(item);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },

    async update(localId: number, updates: Partial<LocalTransaction>): Promise<void> {
      const existing = await this.get(localId);
      if (!existing) return;
      await this.put({ ...existing, ...updates });
    },

    async delete(localId: number): Promise<void> {
      const idb = await openDB();
      return new Promise((resolve, reject) => {
        const tx = idb.transaction('transactions', 'readwrite');
        const store = tx.objectStore('transactions');
        const req = store.delete(localId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },

    async getAll(): Promise<LocalTransaction[]> {
      const idb = await openDB();
      return new Promise((resolve, reject) => {
        const tx = idb.transaction('transactions', 'readonly');
        const store = tx.objectStore('transactions');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result as LocalTransaction[]);
        req.onerror = () => reject(req.error);
      });
    },

    async findByServerId(serverId: string): Promise<LocalTransaction | undefined> {
      const idb = await openDB();
      return new Promise((resolve, reject) => {
        const tx = idb.transaction('transactions', 'readonly');
        const store = tx.objectStore('transactions');
        const index = store.index('serverId');
        const req = index.get(serverId);
        req.onsuccess = () => resolve(req.result as LocalTransaction | undefined);
        req.onerror = () => reject(req.error);
      });
    },

    async findBySyncStatus(status: string): Promise<LocalTransaction[]> {
      const idb = await openDB();
      return new Promise((resolve, reject) => {
        const tx = idb.transaction('transactions', 'readonly');
        const store = tx.objectStore('transactions');
        const index = store.index('syncStatus');
        const req = index.getAll(status);
        req.onsuccess = () => resolve(req.result as LocalTransaction[]);
        req.onerror = () => reject(req.error);
      });
    },

    async findByDate(date: string): Promise<LocalTransaction[]> {
      const idb = await openDB();
      return new Promise((resolve, reject) => {
        const tx = idb.transaction('transactions', 'readonly');
        const store = tx.objectStore('transactions');
        const index = store.index('date');
        const req = index.getAll(date);
        req.onsuccess = () => resolve(req.result as LocalTransaction[]);
        req.onerror = () => reject(req.error);
      });
    },
  },

  syncQueue: {
    async add(item: Omit<SyncQueueItem, 'id'>): Promise<number> {
      const idb = await openDB();
      return new Promise((resolve, reject) => {
        const tx = idb.transaction('syncQueue', 'readwrite');
        const store = tx.objectStore('syncQueue');
        const req = store.add(item);
        req.onsuccess = () => resolve(req.result as number);
        req.onerror = () => reject(req.error);
      });
    },

    async getAll(): Promise<SyncQueueItem[]> {
      const idb = await openDB();
      return new Promise((resolve, reject) => {
        const tx = idb.transaction('syncQueue', 'readonly');
        const store = tx.objectStore('syncQueue');
        const index = store.index('createdAt');
        const req = index.getAll();
        req.onsuccess = () => resolve(req.result as SyncQueueItem[]);
        req.onerror = () => reject(req.error);
      });
    },

    async update(id: number, updates: Partial<SyncQueueItem>): Promise<void> {
      const idb = await openDB();
      return new Promise((resolve, reject) => {
        const tx = idb.transaction('syncQueue', 'readwrite');
        const store = tx.objectStore('syncQueue');
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          if (!getReq.result) { resolve(); return; }
          const updated = { ...getReq.result, ...updates };
          const putReq = store.put(updated);
          putReq.onsuccess = () => resolve();
          putReq.onerror = () => reject(putReq.error);
        };
        getReq.onerror = () => reject(getReq.error);
      });
    },

    async delete(id: number): Promise<void> {
      const idb = await openDB();
      return new Promise((resolve, reject) => {
        const tx = idb.transaction('syncQueue', 'readwrite');
        const store = tx.objectStore('syncQueue');
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },

    async deleteByLocalId(localId: number): Promise<void> {
      const idb = await openDB();
      return new Promise((resolve, reject) => {
        const tx = idb.transaction('syncQueue', 'readwrite');
        const store = tx.objectStore('syncQueue');
        const index = store.index('localId');
        const req = index.openCursor(localId);
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            resolve();
          }
        };
        req.onerror = () => reject(req.error);
      });
    },

    async count(): Promise<number> {
      const idb = await openDB();
      return new Promise((resolve, reject) => {
        const tx = idb.transaction('syncQueue', 'readonly');
        const store = tx.objectStore('syncQueue');
        const req = store.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
  },
};

// ==================== 헬퍼 함수 ====================

/** 현재 로컬 시간 → 'YYYY-MM-DD HH:mm:ss' */
export function nowLocalString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
}

/** 마지막 동기화 시각 저장/조회 (localStorage) */
export function getLastSyncTime(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('lastSyncTime');
}

export function setLastSyncTime(time: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('lastSyncTime', time);
}
