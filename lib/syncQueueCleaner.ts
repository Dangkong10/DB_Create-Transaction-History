import { db } from './offline-db';

export async function getPendingSyncCount(): Promise<number> {
  try {
    return await db.syncQueue.count();
  } catch (err) {
    console.error('[SyncQueueCleaner] count 실패:', err);
    return 0;
  }
}
