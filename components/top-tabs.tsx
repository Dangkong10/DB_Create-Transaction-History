/**
 * 상단 폴더 탭 — [입력 | 내역 | 영수증 출력]
 *
 * Pwa_app(재고 앱)의 toptabs 디자인 이식:
 * - 남색 띠는 화면 전체, 탭은 본문과 동일한 960px 중앙 폭
 * - 활성 탭은 본문 배경색(#f5f5f5)과 이어지는 폴더 형태 (위 모서리만 둥글고,
 *   하단 양옆에 역곡선 이음새)
 * - 활성 탭에 색 점이 스프링 모션으로 등장
 */

import { useEffect, useRef } from "react";
import { Animated, Platform, Text, TouchableOpacity, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

const NAVY = "#1B365D";
const BODY_BG = "#f5f5f5";
const FLARE = 13; // 폴더 이음새 곡선 반경 (Pwa_app 원본 값)

interface TabDef {
  key: string;
  route: string;
  label: string;
  dotColor: string;
}

const TABS: TabDef[] = [
  { key: "index", route: "/", label: "입력", dotColor: "#DA5A2A" },
  { key: "history", route: "/history", label: "내역", dotColor: "#2C5F2D" },
  { key: "receipt", route: "/receipt", label: "영수증 출력", dotColor: "#F2AA4C" },
];

/** 활성 탭 하단 양옆 역곡선 — 크림색 박스 위에 남색 원의 1/4을 겹쳐 재현 */
function Flare({ side }: { side: "left" | "right" }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        bottom: 0,
        [side]: -FLARE,
        width: FLARE,
        height: FLARE,
        backgroundColor: BODY_BG,
        overflow: "hidden",
      } as any}
    >
      <View
        style={{
          position: "absolute",
          top: -FLARE,
          [side === "left" ? "left" : "right"]: -FLARE,
          width: FLARE * 2,
          height: FLARE * 2,
          borderRadius: FLARE,
          backgroundColor: NAVY,
        } as any}
      />
    </View>
  );
}

/** 활성 탭 색 점 — 스프링(오버슈트) 등장 모션 */
function Dot({ color }: { color: string }) {
  const scale = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 4,
      tension: 120,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [scale]);
  return (
    <Animated.View
      style={{
        width: 10, height: 10, borderRadius: 5,
        backgroundColor: color, transform: [{ scale }],
      }}
    />
  );
}

export function TopTabs() {
  const router = useRouter();
  const pathname = usePathname();

  const handlePress = (tab: TabDef) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (pathname !== tab.route) {
      router.push(tab.route as any);
    }
  };

  return (
    <View style={{ backgroundColor: NAVY, paddingTop: 8, paddingHorizontal: 16 }}>
      <View style={{
        flexDirection: "row", gap: 8, alignItems: "stretch",
        maxWidth: 960, width: "100%", alignSelf: "center",
      }}>
        {TABS.map((tab) => {
          const active = pathname === tab.route;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => handlePress(tab)}
              activeOpacity={0.85}
              style={{
                flex: 1,
                minHeight: 52,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
                ...(active
                  ? {
                      marginBottom: 0,
                      paddingBottom: 4,
                      backgroundColor: BODY_BG,
                      borderTopLeftRadius: 16,
                      borderTopRightRadius: 16,
                      zIndex: 1,
                    }
                  : {
                      marginBottom: 8,
                      backgroundColor: "rgba(255,255,255,0.13)",
                      borderRadius: 12,
                    }),
              }}
            >
              {active && <Dot color={tab.dotColor} />}
              <Text style={{
                fontSize: active ? 19 : 18,
                fontWeight: active ? "800" : "700",
                color: active ? "#1f2937" : "rgba(255,255,255,0.85)",
              }}>
                {tab.label}
              </Text>
              {active && <Flare side="left" />}
              {active && <Flare side="right" />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
