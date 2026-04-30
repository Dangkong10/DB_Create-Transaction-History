import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/lib/confirm-provider';
import { getPendingSyncCount, clearPendingSync } from '@/lib/syncQueueCleaner';
import { wipeAllLocalData } from '@/lib/dataWiper';
import { SessionExpiredToast } from './SessionExpiredToast';

const AUTH_PATHS = ['/login', '/signup'];

function isOnAuthRoute(path: string | null | undefined): boolean {
  if (!path) return false;
  return AUTH_PATHS.some((p) => path === p || path.startsWith(p + '/'));
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { showConfirm } = useConfirm();

  const [showToast, setShowToast] = useState(false);
  const [staleSession, setStaleSession] = useState(false);

  const handlingRef = useRef(false);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  // 직전에 인증된 user.id. SIGNED_OUT 시에는 비우지 않아 "앱 유지" 후 다른 계정으로
  // 곧바로 로그인하는 경우에도 이전 사용자의 로컬 캐시가 남지 않도록 비교 가능.
  const lastUserIdRef = useRef<string | null>(null);

  const goToLogin = useCallback(() => {
    setStaleSession(false);
    router.replace('/login');
  }, [router]);

  const handleSignedOut = useCallback(async () => {
    if (handlingRef.current) return;
    if (isOnAuthRoute(pathnameRef.current)) return;
    handlingRef.current = true;

    try {
      const pending = await getPendingSyncCount();

      if (pending > 0) {
        showConfirm({
          title: '로그인 만료',
          message: `로그인이 만료되어 동기화되지 않은 ${pending}건의 내용이 있습니다.\n이 내용은 저장되지 않습니다. 계속하시겠습니까?`,
          confirmText: '로그인 화면으로',
          cancelText: '앱 유지',
          onConfirm: async () => {
            await Promise.all([clearPendingSync(), wipeAllLocalData()]);
            goToLogin();
          },
          onCancel: () => {
            setStaleSession(true);
          },
        });
      } else {
        setShowToast(true);
        wipeAllLocalData().catch((err) => console.error('[AuthGuard] wipe 실패:', err));
        router.replace('/login');
      }
    } finally {
      handlingRef.current = false;
    }
  }, [goToLogin, router, showConfirm]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session && !isOnAuthRoute(pathnameRef.current)) {
        router.replace('/login');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const newUserId = session?.user?.id ?? null;

      // 다른 user.id 로 새 세션이 붙으면(=계정 전환) 이전 사용자의 로컬 캐시 소거.
      // 명시적 로그아웃 경로(handleSignedOut)와 별개로, "앱 유지" 후 곧바로 다른 계정으로
      // 로그인하는 빈틈을 막기 위함.
      if (newUserId) {
        if (lastUserIdRef.current && lastUserIdRef.current !== newUserId) {
          try {
            await wipeAllLocalData();
          } catch (err) {
            console.error('[AuthGuard] 계정 전환 시 로컬 데이터 소거 실패:', err);
          }
        }
        lastUserIdRef.current = newUserId;
      }

      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        setStaleSession(false);
        return;
      }
      if (event === 'SIGNED_OUT' || !session) {
        handleSignedOut();
      }
    });
    return () => subscription.unsubscribe();
  }, [handleSignedOut]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return;
      if (isOnAuthRoute(pathnameRef.current)) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) handleSignedOut();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [handleSignedOut]);

  return (
    <View style={styles.root}>
      {staleSession && !isOnAuthRoute(pathname) && (
        <View style={styles.banner}>
          <Text style={styles.bannerText} numberOfLines={2}>
            🔴  로그인이 필요합니다 — 입력한 내용은 저장되지 않습니다
          </Text>
          <Pressable
            onPress={goToLogin}
            style={({ pressed }) => [styles.bannerButton, pressed && styles.bannerButtonPressed]}
          >
            <Text style={styles.bannerButtonText}>지금 로그인하기</Text>
          </Pressable>
        </View>
      )}
      <View style={styles.children}>{children}</View>
      {showToast && <SessionExpiredToast onDismiss={() => setShowToast(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  children: { flex: 1 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: '#FCEBEB',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  bannerText: {
    color: '#791F1F',
    fontSize: 13,
    flexShrink: 1,
  },
  bannerButton: {
    backgroundColor: '#1B365D',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  bannerButtonPressed: { opacity: 0.8 },
  bannerButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});
