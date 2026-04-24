import { db } from './offline-db';

export async function getPendingSyncCount(): Promise<number> {
  try {
    return await db.syncQueue.count();
  } catch (err) {
    console.error('[SyncQueueCleaner] count 실패:', err);
    return 0;
  }
}

export async function clearPendingSync(): Promise<void> {
  try {
    const queue = await db.syncQueue.getAll();
    await Promise.all(
      queue.map((item) => (item.id !== undefined ? db.syncQueue.delete(item.id) : Promise.resolve())),
    );

    const pending = await db.transactions.findBySyncStatus('pending');
    await Promise.all(
      pending.map((t) => (t.localId !== undefined ? db.transactions.delete(t.localId) : Promise.resolve())),
    );

    const failed = await db.transactions.findBySyncStatus('failed');
    await Promise.all(
      failed.map((t) => (t.localId !== undefined ? db.transactions.delete(t.localId) : Promise.resolve())),
    );

    console.log('[SyncQueueCleaner] 미동기화 항목 정리 완료');
  } catch (err) {
    console.error('[SyncQueueCleaner] 정리 실패:', err);
  }
}
