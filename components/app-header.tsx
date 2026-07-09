/**
 * 공용 상단 헤더 — 남색 바에 로고 / 이메일 / [관리] / [로그아웃]
 *
 * Pwa_app(재고 앱)의 appbar 디자인 이식. 내용물은 본문과 동일한 960px 중앙 폭.
 * 기존에 화면마다 중복돼 있던 이메일+로그아웃 블록을 이 컴포넌트로 통합.
 */

import { Platform, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePathname, useRouter } from "expo-router";
import { useAuth } from "@/hooks/use-auth";
import { useIsMounted } from "@/hooks/use-is-mounted";
import { useToast } from "@/lib/toast-provider";
import { useConfirm } from "@/lib/confirm-provider";

const NAVY = "#1B365D";

export function AppHeader() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const mounted = useIsMounted();
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  const onManage = pathname === "/manage";

  const handleLogout = () => {
    showConfirm({
      title: "로그아웃",
      message: "로그아웃 하시겠습니까? 로그아웃 후에도 로컬 데이터는 유지됩니다.",
      onConfirm: async () => {
        await logout();
        showToast("로그아웃되었습니다.", "success");
      },
    });
  };

  const handleLogin = () => {
    if (Platform.OS === "web") {
      window.location.href = "/login";
    }
  };

  const outlineBtn = {
    minHeight: 36,
    paddingHorizontal: 14,
    justifyContent: "center" as const,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.5)",
    borderRadius: 10,
  };

  return (
    <View style={{ backgroundColor: NAVY, paddingTop: Math.max(insets.top, 8), paddingBottom: 8, paddingHorizontal: 16 }}>
      <View style={{
        flexDirection: "row", alignItems: "center", gap: 8,
        maxWidth: 960, width: "100%", alignSelf: "center", minHeight: 44,
      }}>
        {/* 로고 */}
        <Text style={{
          fontFamily: Platform.OS === "web" ? ("ui-serif, Georgia, 'Times New Roman', serif" as any) : "serif",
          fontSize: 24, fontWeight: "700", color: "#ffffff", lineHeight: 30,
        }}>
          동방모사
        </Text>

        {/* 우측: 이메일 + 관리 + 로그아웃 (mount 전엔 빈 공간 — hydration mismatch 방지) */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginLeft: "auto" }}>
          {mounted && user && (
            <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }} numberOfLines={1}>
              {user.email}
            </Text>
          )}
          <TouchableOpacity
            onPress={() => router.push("/manage")}
            style={[outlineBtn, onManage && { backgroundColor: "rgba(255,255,255,0.18)", borderColor: "#ffffff" }]}
          >
            <Text style={{ color: "#ffffff", fontSize: 14, fontWeight: "700" }}>⚙ 관리</Text>
          </TouchableOpacity>
          {mounted && (user ? (
            <TouchableOpacity onPress={handleLogout} style={outlineBtn}>
              <Text style={{ color: "#ffffff", fontSize: 14, fontWeight: "700" }}>로그아웃</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={handleLogin} style={outlineBtn}>
              <Text style={{ color: "#ffffff", fontSize: 14, fontWeight: "700" }}>로그인</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}
