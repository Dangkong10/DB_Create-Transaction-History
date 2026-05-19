/**
 * Disable Pressable className support in NativeWind
 * 
 * NativeWind's Pressable className has known issues with state management.
 * This file disables it globally to prevent render loops and stale state.
 * 
 * Use style prop instead:
 * <Pressable style={({ pressed }) => [styles.button, pressed && styles.pressed]} />
 */

import { Platform } from "react-native";

// NativeWind 의 colorScheme 을 모듈 로드 시점에 "light" 로 고정한다.
//   - SSG(빌드 머신의 OS dark/light 와 무관)와 첫 client render 양쪽이
//     동일한 theme variable(예: --color-muted = #666666)을 갖도록 보장.
//   - 시스템 다크모드는 ThemeProvider 가 mount 후 colorScheme.set 으로 전환
//     (즉 hydration *완료* 후에만 dark 적용 → React #418 회피).
try {
  // require 로 가져와 SSR/번들 환경에서 안전하게 fallback.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { colorScheme } = require("nativewind");
  colorScheme.set("light");
} catch {
  /* nativewind 미사용 환경에서는 무시 */
}

if (Platform.OS !== "web") {
  // Disable Pressable className in NativeWind
  // This prevents issues with pressed states and re-renders
  try {
    const { cssInterop } = require("nativewind");
    const { Pressable } = require("react-native");
    
    cssInterop(Pressable, {
      className: false,
    });
  } catch (error) {
    // Silently fail if nativewind is not available
    console.warn("Failed to configure NativeWind Pressable:", error);
  }
}
