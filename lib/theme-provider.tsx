import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Appearance, useColorScheme as useSystemColorScheme } from "react-native";

import { SchemeColors, type ColorScheme } from "@/constants/theme";

type ThemeContextValue = {
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // SSG와 첫 client render가 일치하도록 항상 "light"로 시작.
  // 시스템 다크모드는 mount 이후 useEffect에서 동기화한다 (React #418 방지).
  const systemScheme = useSystemColorScheme();
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>("light");

  useEffect(() => {
    if (systemScheme && systemScheme !== colorScheme) {
      setColorSchemeState(systemScheme);
    }
    // colorScheme은 의도적으로 deps에서 제외 — 사용자가 setColorScheme으로 바꾼 값을 시스템 변경이 덮어쓰지 않도록.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemScheme]);

  const applyScheme = useCallback((scheme: ColorScheme) => {
    // Apply color scheme to React Native Appearance API
    Appearance.setColorScheme?.(scheme);

    // NativeWind 의 자체 colorScheme 도 동기화 (시스템 다크 자동 적용을 막고 명시 제어).
    // — nativewind-pressable.ts 에서 모듈 로드 시점에 "light" 로 초기 설정한 뒤,
    //   ThemeProvider 의 mount/scheme 변경에 따라 여기서 갱신한다.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { colorScheme: nwColorScheme } = require("nativewind");
      nwColorScheme.set(scheme);
    } catch {
      /* nativewind 미사용 환경에서는 무시 */
    }

    // Apply color scheme to web (CSS variables and dark class)
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.dataset.theme = scheme;
      root.classList.toggle("dark", scheme === "dark");

      // Set CSS variables for Tailwind CSS
      const palette = SchemeColors[scheme];
      Object.entries(palette).forEach(([token, value]) => {
        root.style.setProperty(`--color-${token}`, value);
      });
    }
  }, []);

  const setColorScheme = useCallback((scheme: ColorScheme) => {
    setColorSchemeState(scheme);
    applyScheme(scheme);
  }, [applyScheme]);

  useEffect(() => {
    applyScheme(colorScheme);
  }, [applyScheme, colorScheme]);

  const value = useMemo(
    () => ({
      colorScheme,
      setColorScheme,
    }),
    [colorScheme, setColorScheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useThemeContext must be used within ThemeProvider");
  }
  return ctx;
}
