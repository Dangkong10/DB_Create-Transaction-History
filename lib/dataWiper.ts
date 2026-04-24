import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const ASYNC_STORAGE_KEYS = [
  '@transaction_app:customers',
  '@transaction_app:products',
];

export async function wipeAllLocalData(): Promise<void> {
  const tasks: Promise<unknown>[] = [];

  if (Platform.OS === 'web' && typeof indexedDB !== 'undefined') {
    tasks.push(wipeIndexedDB().catch((err) => console.error('[DataWiper] IndexedDB 소거 실패:', err)));
  }

  tasks.push(
    AsyncStorage.multiRemove(ASYNC_STORAGE_KEYS).catch((err) =>
      console.error('[DataWiper] AsyncStorage 소거 실패:', err),
    ),
  );

  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem('lastSyncTime');
    } catch (err) {
      console.error('[DataWiper] localStorage 소거 실패:', err);
    }
  }

  await Promise.all(tasks);
  console.log('[DataWiper] 로컬 데이터 소거 완료');
}

function wipeIndexedDB(): Promise<void> {
  return new Promise((resolve, reject) => {
    const openReq = indexedDB.open('transactionsDB');
    openReq.onsuccess = () => {
      const db = openReq.result;
      const storeNames = Array.from(db.objectStoreNames);
      if (storeNames.length === 0) {
        db.close();
        resolve();
        return;
      }
      const tx = db.transaction(storeNames, 'readwrite');
      storeNames.forEach((name) => tx.objectStore(name).clear());
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    };
    openReq.onerror = () => reject(openReq.error);
  });
}
