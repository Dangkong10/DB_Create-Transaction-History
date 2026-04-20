import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, signOut } from "@/lib/supabase";
import type { User as SupabaseUser } from "@supabase/supabase-js";

type UseAuthOptions = {
  autoFetch?: boolean;
};

export interface User {
  email: string;
}

export function useAuth(options?: UseAuthOptions) {
  const { autoFetch = true } = options ?? {};
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const mapUser = (supabaseUser: SupabaseUser | null): User | null => {
    if (!supabaseUser?.email) return null;
    return { email: supabaseUser.email };
  };

  const fetchUser = useCallback(async () => {
    console.log("[useAuth] fetchUser called");
    try {
      setLoading(true);
      setError(null);

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error("[useAuth] Session error:", sessionError);
        setUser(null);
        return;
      }

      if (session?.user) {
        console.log("[useAuth] User found:", session.user.email);
        setUser(mapUser(session.user));
      } else {
        console.log("[useAuth] No session, setting user to null");
        setUser(null);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to fetch user");
      console.error("[useAuth] fetchUser error:", error);
      setError(error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await signOut();
      setUser(null);
      setError(null);
      console.log("[useAuth] Logged out successfully");
    } catch (err) {
      console.error("[useAuth] Logout error:", err);
      setUser(null);
      setError(null);
    }
  }, []);

  const isAuthenticated = useMemo(() => Boolean(user), [user]);

  // 초기 로드
  useEffect(() => {
    if (autoFetch) {
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [autoFetch, fetchUser]);

  // Supabase 인증 상태 리스너
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        console.log("[useAuth] Auth state changed:", _event);
        setUser(mapUser(session?.user ?? null));
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return {
    user,
    loading,
    error,
    isAuthenticated,
    refresh: fetchUser,
    logout,
  };
}
