import { useEffect, useState } from 'react';

/**
 * SSR / 첫 렌더에선 false, mount 직후 true 가 되는 플래그.
 * Supabase 세션처럼 클라이언트에서만 알 수 있는 값에 의존하는 UI 의 hydration mismatch 방지용.
 *
 * 사용 예:
 *   const mounted = useIsMounted();
 *   {mounted && user ? <UserInfo /> : <LoginButton />}
 */
export function useIsMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}
