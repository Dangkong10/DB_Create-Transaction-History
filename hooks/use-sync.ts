import { useEffect, useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import {
  subscribeSyncStatus,
  processSyncQueue,
  type SyncStatus,
} from '@/lib/sync-manager';

const INITIAL_STATUS: SyncStatus = {
  state: 'idle',
  pendingCount: 0,
  lastSyncTime: null,
};

/**
 * 온라인/오프라인 상태 + 동기화 큐 상태를 추적하는 훅
 *
 * 사용:
 *   const { syncStatus, isOnline } = useSync();
 *   syncStatus.state → 'idle' | 'syncing' | 'offline' | 'error'
 *   syncStatus.pendingCount → 대기 중인 동기화 작업 수
 */
export function useSync() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(INITIAL_STATUS);
  const [isOnline, setIsOnline] = useState(true);
  const retryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 동기화 상태 구독
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const unsubscribe = subscribeSyncStatus(setSyncStatus);
    return unsubscribe;
  }, []);

  // 온라인/오프라인 이벤트 감지
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOnline(true);
      // 온라인 복귀 → 즉시 대기열 처리
      processSyncQueue();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    // 초기 상태
    setIsOnline(navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 앱 시작 시 한 번 큐 처리 + 주기적 재시도 (30초)
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    // 시작 시 큐 처리
    processSyncQueue();

    // 30초마다 대기열 재처리 (실패 항목 재시도)
    retryTimerRef.current = setInterval(() => {
      if (navigator.onLine) {
        processSyncQueue();
      }
    }, 30_000);

    return () => {
      if (retryTimerRef.current) {
        clearInterval(retryTimerRef.current);
      }
    };
  }, []);

  const manualSync = useCallback(() => {
    processSyncQueue();
  }, []);

  return { syncStatus, isOnline, manualSync };
}
