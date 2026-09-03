import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/lib/confirm-provider';
import { getPendingSyncCount } from '@/lib/syncQueueCleaner';
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

      // 로그아웃만으로는 로컬을 절대 지우지 않는다. 미전송 건은 IndexedDB 에 남아
      // 같은 계정으로 재로그인하면 syncQueue 가 그대로 전송된다.
      // (다른 계정으로 로그인하는 경우의 소거는 아래 onAuthStateChange 가 담당)
      if (pending > 0) {
        showConfirm({
          title: '로그인 만료',
          message: `로그인이 만료되어 아직 전송되지 않은 ${pending}건이 있습니다.\n이 내용은 기기에 안전하게 남아 있으며, 다시 로그인하면 이어서 전송됩니다.`,
          confirmText: '지금 로그인',
          cancelText: '나중에',
          onConfirm: goToLogin,
          onCancel: () => {
            setStaleSession(true);
          },
        });
      } else {
        setShowToast(true);
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
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          // 오프라인이라 토큰 갱신을 못 한 것일 뿐 — 로그인 화면으로 밀어내면
          // 오프라인 입력 자체가 불가능해진다. 배너만 띄우고 앱은 유지.
          setStaleSession(true);
          return;
        }
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
      if (session) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        // 절전에서 깨어나 와이파이가 붙기 전 — 진짜 로그아웃이 아니다.
        setStaleSession(true);
        return;
      }
      handleSignedOut();
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
