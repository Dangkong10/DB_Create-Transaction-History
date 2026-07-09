import { Tabs } from "expo-router";
import { View } from "react-native";

import { AppHeader } from "@/components/app-header";
import { TopTabs } from "@/components/top-tabs";

/**
 * 탭 레이아웃 — 하단 탭 바 대신 상단 헤더 + 폴더 탭 (Pwa_app 디자인 이식).
 *
 * expo-router Tabs 는 라우팅/화면 유지용으로만 쓰고 (tabBar 숨김),
 * 실제 내비게이션 UI는 AppHeader(관리·로그아웃) + TopTabs(입력/내역/영수증 출력).
 * manage 는 탭 목록엔 없지만 라우트로 유지 — 헤더의 [관리] 버튼으로 진입.
 */
export default function TabLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: "#f5f5f5" }}>
      <AppHeader />
      <TopTabs />
      <Tabs
        tabBar={() => null}
        screenOptions={{ headerShown: false }}
      >
        <Tabs.Screen name="index" options={{ title: "입력" }} />
        <Tabs.Screen name="history" options={{ title: "내역" }} />
        <Tabs.Screen name="receipt" options={{ title: "영수증 출력" }} />
        <Tabs.Screen name="manage" options={{ title: "관리" }} />
      </Tabs>
    </View>
  );
}
