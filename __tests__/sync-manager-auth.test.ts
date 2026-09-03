/**
 * 세션 만료 시 동기화 큐 보존 — 2026-09-03 "N건 대기 중" 고착 수정.
 *
 * 이 테스트가 깨지면 둘 중 하나가 다시 망가진 것이다.
 *   1) 로그인이 끊긴 사이 미전송 거래가 큐에서 사라진다 (= 데이터 유실)
 *   2) 원인이 화면에 안 뜬다 ('auth' 대신 'idle' → 배지가 영원히 "대기 중")
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/offline-db', () => {
  const queue: any[] = [];
  const txns = new Map<number, any>();
  return {
    __queue: queue,
    __txns: txns,
    nowLocalString: () => '2026-09-03 10:00:00',
    generateClientId: () => 'test-client-id',
    setLastSyncTime: () => {},
    db: {
      syncQueue: {
        count: async () => queue.length,
        getAll: async () => [...queue],
        add: async (item: any) => queue.push({ ...item, id: queue.length + 1 }),
        update: async (id: number, u: any) => Object.assign(queue.find((q) => q.id === id) ?? {}, u),
        delete: async (id: number) => {
          const i = queue.findIndex((q) => q.id === id);
          if (i >= 0) queue.splice(i, 1);
        },
        deleteByLocalId: async () => {},
      },
      transactions: {
        get: async (id: number) => txns.get(id),
        add: async () => 1,
        put: async () => {},
        update: async (id: number, u: any) => txns.set(id, { ...txns.get(id), ...u }),
        delete: async () => {},
        getAll: async () => [...txns.values()],
        findByServerId: async () => undefined,
        findBySyncStatus: async () => [],
      },
    },
  };
});

vi.mock('../lib/supabase', () => {
  const state = { session: null as any, inserted: [] as any[] };
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    limit: async () => ({ data: [], error: null }),   // 멱등성 체크: 서버에 없음
    insert: (row: any) => {
      state.inserted.push(row);
      return { select: () => ({ single: async () => ({ data: { id: 777 }, error: null }) }) };
    },
  };
  return {
    __state: state,
    getSession: async () => state.session,
    supabase: { from: () => chain },
  };
});

const SESSION = { user: { id: 'user-1' } };

async function setup() {
  vi.stubGlobal('navigator', { onLine: true });
  const offline: any = await import('../lib/offline-db');
  const sb: any = await import('../lib/supabase');
  const sync = await import('../lib/sync-manager');

  offline.__queue.length = 0;
  offline.__txns.clear();
  sb.__state.inserted.length = 0;
  offline.__txns.set(1, { localId: 1, syncStatus: 'pending' });
  offline.__queue.push({
    id: 1,
    action: 'create',
    localId: 1,
    retryCount: 0,
    createdAt: '2026-09-03T01:00:00.000Z',
    data: {
      clientId: 'test-client-id',
      customerName: '고려',
      productName: '프라하',
      quantity: 3,
      unitPrice: 5000,
      date: '2026-09-03',
      createdAt: '2026-09-03 10:00:00',
      updatedAt: '2026-09-03T01:00:00.000Z',
    },
  });
  return { offline, sb, sync };
}

describe('세션 만료 중의 동기화 큐', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('로그인이 끊기면 큐를 그대로 두고 상태를 auth 로 알린다', async () => {
    const { offline, sb, sync } = await setup();
    sb.__state.session = null;

    await sync.processSyncQueue();

    expect(offline.__queue).toHaveLength(1);          // 유실 금지
    expect(sb.__state.inserted).toHaveLength(0);
    expect(offline.__txns.get(1).syncStatus).toBe('pending');
    expect(offline.__queue[0].retryCount).toBe(0);    // 재시도 횟수도 소모하지 않는다

    const status = await new Promise<any>((resolve) => {
      const off = sync.subscribeSyncStatus((s: any) => { resolve(s); off(); });
    });
    expect(status.state).toBe('auth');
    expect(status.pendingCount).toBe(1);
  });

  it('재로그인하면 같은 큐가 그대로 전송된다', async () => {
    const { offline, sb, sync } = await setup();
    sb.__state.session = null;
    await sync.processSyncQueue();

    sb.__state.session = SESSION;                     // 재로그인
    await sync.processSyncQueue();

    expect(sb.__state.inserted).toHaveLength(1);
    expect(sb.__state.inserted[0]).toMatchObject({ customer_name: '고려', quantity: 3, client_id: 'test-client-id' });
    expect(offline.__queue).toHaveLength(0);
    expect(offline.__txns.get(1)).toMatchObject({ serverId: '777', syncStatus: 'synced' });
  });
});
