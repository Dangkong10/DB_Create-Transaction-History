import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Platform } from "react-native";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import { ToastProvider } from "@/lib/toast-provider";
import { ConfirmProvider } from "@/lib/confirm-provider";
import { AuthGuard } from "@/components/AuthGuard";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";


import { initManusRuntime, subscribeSafeAreaInsets } from "@/lib/_core/manus-runtime";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

// unstable_settings.anchor 는 의도적으로 *설정하지 않음*.
//   anchor 를 두면 expo-router 가 SSG 시 모든 라우트 HTML 에 anchor route 트리를
//   미리 박아 넣고(예: /login.html 안에 (tabs)/index 의 입력 화면 전체가 display:none
//   상태로 들어감), 클라이언트 hydrate 단계에서 그 트리가 어긋나 React #418
//   (hydration mismatch) 가 발생. login → router.replace('/') 흐름에는 anchor 가
//   불필요하므로 제거.

export default function RootLayout() {
  // SSG와 첫 client render가 일치하도록 항상 DEFAULT 값으로 시작.
  // initialWindowMetrics는 module-load 시점에 평가되는데 SSG=null, client=window 기반 값으로 다르기 때문.
  // 실제 값은 mount 후 useEffect에서 동기화한다 (React #418 방지).
  const [insets, setInsets] = useState<EdgeInsets>(DEFAULT_WEB_INSETS);
  const [frame, setFrame] = useState<Rect>(DEFAULT_WEB_FRAME);

  useEffect(() => {
    if (initialWindowMetrics) {
      setInsets(initialWindowMetrics.insets);
      setFrame(initialWindowMetrics.frame);
    }
  }, []);

  // Initialize Manus runtime for cookie injection from parent container
  useEffect(() => {
    initManusRuntime();
  }, []);


  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  // Create clients once and reuse them
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Disable automatic refetching on window focus for mobile
            refetchOnWindowFocus: false,
            // Retry failed requests once
            retry: 1,
          },
        },
      }),
  );


  // SafeAreaProvider 의 initialMetrics 도 SSG/client 일관되게 DEFAULT 기반으로.
  // (initialWindowMetrics 직접 참조 시 frame.width/height 가 module-load 시점에 평가돼 SSG와 어긋남)
  const providerInitialMetrics = useMemo(
    () => ({
      insets: {
        ...DEFAULT_WEB_INSETS,
        top: Math.max(DEFAULT_WEB_INSETS.top, 16),
        bottom: Math.max(DEFAULT_WEB_INSETS.bottom, 12),
      },
      frame: DEFAULT_WEB_FRAME,
    }),
    [],
  );

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ToastProvider>
        <ConfirmProvider>
          <QueryClientProvider client={queryClient}>
          <AuthGuard>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="login" />
              <Stack.Screen name="signup" />
              <Stack.Screen name="(tabs)" />
            </Stack>
          </AuthGuard>
          <StatusBar style="auto" />
          </QueryClientProvider>
        </ConfirmProvider>
      </ToastProvider>
    </GestureHandlerRootView>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>
              {content}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider>
    </ThemeProvider>
  );
}
