import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Platform, useWindowDimensions } from "react-native";
import { useColors } from "@/hooks/use-colors";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const isTablet = width >= 768;
  const isDesktop = width >= 1025;

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
