import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Platform, useWindowDimensions } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useIsMounted } from "@/hooks/use-is-mounted";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const mounted = useIsMounted();

  // SSR(빌드 타임)과 첫 클라이언트 렌더는 0 으로 통일 → 둘 다 mobile 값.
  // mount 후 실제 width 로 전환되어 태블릿/데스크톱 사이즈 적용. (React #418 hydration mismatch 방지)
  const effectiveWidth = mounted ? width : 0;
  const isTablet = effectiveWidth >= 768;
  const isDesktop = effectiveWidth >= 1025;

  const bottomPadding = Platform.OS === "web"
    ? (isDesktop ? 14 : isTablet ? 12 : 10)
    : Math.max(insets.bottom + 8, 16);

  const iconSize = isDesktop ? 26 : isTablet ? 24 : 22;
  const labelFontSize = isDesktop ? 13 : isTablet ? 12 : 11;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarLabelStyle: {
          fontSize: labelFontSize,
          marginTop: 4,
        },
        tabBarIconStyle: {
          marginBottom: 0,
        },
        tabBarStyle: {
          paddingTop: isDesktop ? 12 : isTablet ? 10 : 8,
          paddingBottom: bottomPadding,
          minHeight: 56,
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "입력",
          tabBarIcon: ({ color }) => <IconSymbol size={iconSize} name="pencil" color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "내역",
          tabBarIcon: ({ color }) => <IconSymbol size={iconSize} name="clock.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="receipt"
        options={{
          title: "영수증 출력",
          tabBarIcon: ({ color }) => <IconSymbol size={iconSize} name="printer.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="manage"
        options={{
          title: "관리",
          tabBarIcon: ({ color }) => <IconSymbol size={iconSize} name="slider.horizontal.3" color={color} />,
        }}
      />

    </Tabs>
  );
}
