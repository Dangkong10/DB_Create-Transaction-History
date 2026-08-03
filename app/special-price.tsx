/**
 * 특가 설정 전용 페이지 (팝업 → 전체 화면 전환)
 *
 * 진입: 관리 탭 거래처 목록의 [특가 설정] → /special-price?customer=거래처명
 * 뒤로가기(버튼·브라우저 back)로 관리 페이지 복귀.
 *
 * 구성 (목업 v3 확정안):
 * - 제품명 입력 + 인라인 추천 영역 (제품명과 특가 사이 전용 공간, 기본 단가 병기)
 * - 특가 스테퍼: [−단위][입력][+단위], 조정 단위 직접 입력 + 500/1,000 프리셋
 * - 기본가 연동 체크: 기본 단가 변동 시 ±차액 유지 (price_offset)
 * - 전 품목 일괄 특가 (연동 방식, 기존 특가는 확인 후 덮어쓰기)
 * - 등록된 특가 목록 (기본가 병기, 연동 배지)
 */

import { useEffect, useMemo, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Platform, ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { ResponsiveContainer } from "@/components/responsive-container";
import { useToast } from "@/lib/toast-provider";
import { useConfirm } from "@/lib/confirm-provider";
import { loadProducts, loadCustomers, updateCustomer } from "@/lib/storage";
import { searchProducts } from "@/lib/search-utils";
import type { Customer } from "@/lib/types";
import {
  getSpecialPricesByCustomer, addSpecialPrice, deleteSpecialPrice,
} from "@/lib/supabase";
import { resolveSpecialAmount } from "@/lib/unit-price";
import type { Product, SpecialPrice } from "@/lib/types";

const NAVY = "#1B365D";
const RED = "#e74c3c";
const BLUE = "#1d6fd1";
const SAGE = "#2C5F2D";

const parseNum = (v: string): number | null => {
  const n = parseInt(v.replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? null : n;
};

export default function SpecialPriceScreen() {
  const router = useRouter();
  const { customer } = useLocalSearchParams<{ customer: string }>();
  const customerName = typeof customer === "string" ? customer : "";
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  const [products, setProducts] = useState<Product[]>([]);
  const [specialPrices, setSpecialPrices] = useState<SpecialPrice[]>([]);
  const [loading, setLoading] = useState(true);

  // 거래처 정보 편집 (별칭 / 입금자명)
  const [customerRecord, setCustomerRecord] = useState<Customer | null>(null);
  const [aliasText, setAliasText] = useState("");
  const [payerText, setPayerText] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);

  // 특가 추가 폼
  const [productQuery, setProductQuery] = useState("");
  const [pickedProduct, setPickedProduct] = useState<Product | null>(null);
  const [priceText, setPriceText] = useState("");
  const [stepUnitText, setStepUnitText] = useState("1,000");
  const [linkBase, setLinkBase] = useState(false);
  // 전 품목 일괄
  const [bulkDelta, setBulkDelta] = useState<number | null>(null);
  const [bulkApplying, setBulkApplying] = useState(false);

  const stepUnit = parseNum(stepUnitText) || 1000;
  const price = parseNum(priceText);
  const basePrice = pickedProduct?.unitPrice;

  const suggestions = useMemo(() => {
    if (!productQuery.trim() || pickedProduct?.name === productQuery.trim()) return [];
    return searchProducts(products, productQuery).slice(0, 6);
  }, [products, productQuery, pickedProduct]);

  const productsWithBase = useMemo(
    () => products.filter((p) => p.unitPrice !== undefined && p.unitPrice > 0),
    [products],
  );

  const loadData = async () => {
    try {
      const [loadedProducts, prices, loadedCustomers] = await Promise.all([
        loadProducts(),
        getSpecialPricesByCustomer(customerName),
        loadCustomers(),
      ]);
      setProducts(loadedProducts);
      setSpecialPrices(prices);

      const rec = loadedCustomers.find((c) => c.name === customerName) ?? null;
      setCustomerRecord(rec);
      setAliasText((rec?.aliases ?? []).join(", "));
      setPayerText((rec?.payerNames ?? []).join(", "));
    } catch (err) {
      console.error("[special-price] load 실패:", err);
      showToast("특가 목록을 불러오는 데 실패했습니다.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!customerName) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerName]);

  /** 쉼표 구분 문자열 → 중복 제거된 배열 */
  const splitList = (text: string): string[] =>
    Array.from(new Set(text.split(",").map((s) => s.trim()).filter(Boolean)));

  /**
   * 거래처 정보 저장 (별칭 / 입금자명).
   *
   * 거래처명(name)은 여기서 바꾸지 않는다 — transactions/payments 가 customer_name 을
   * TEXT 로 들고 있어서, 이름을 바꾸면 과거 거래·입금과 연결이 끊기고 미수금이 통째로
   * 어긋난다. 이름 변경은 관련 테이블 일괄 갱신이 필요한 별도 작업이다.
   */
  const handleSaveCustomerInfo = async () => {
    if (!customerRecord) {
      showToast("거래처 정보를 찾을 수 없습니다.", "error");
      return;
    }
    const aliases = splitList(aliasText);
    const payerNames = splitList(payerText);

    setSavingInfo(true);
    try {
      await updateCustomer(customerRecord.id, { aliases, payerNames });
      setCustomerRecord({ ...customerRecord, aliases, payerNames });
      setAliasText(aliases.join(", "));
      setPayerText(payerNames.join(", "));
      showToast("거래처 정보가 저장되었습니다.", "success");
    } catch (err: any) {
      console.error("[special-price] 거래처 정보 저장 실패:", err);
      showToast(err?.message || "거래처 정보 저장에 실패했습니다.", "error");
    } finally {
      setSavingInfo(false);
    }
  };

  const handlePickProduct = (p: Product) => {
    setPickedProduct(p);
    setProductQuery(p.name);
    if (p.unitPrice !== undefined) {
      setPriceText(p.unitPrice.toLocaleString());
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const step = (dir: 1 | -1) => {
    const cur = price ?? basePrice ?? 0;
    setPriceText(Math.max(0, cur + dir * stepUnit).toLocaleString());
  };

  const diff = basePrice !== undefined && price !== null ? price - basePrice : null;

  const handleAdd = async () => {
    const name = productQuery.trim();
    if (!name || price === null) {
      showToast("제품과 특가를 입력해주세요.", "info");
      return;
    }
    if (linkBase && basePrice === undefined) {
      showToast("기본가 연동은 기본 단가가 있는 제품만 가능합니다.", "info");
      return;
    }
    try {
      await addSpecialPrice(customerName, name, price, linkBase && diff !== null ? diff : null);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(linkBase ? "연동 특가가 추가되었습니다." : "특가가 추가되었습니다.", "success");
      setProductQuery(""); setPickedProduct(null); setPriceText(""); setLinkBase(false);
      setSpecialPrices(await getSpecialPricesByCustomer(customerName));
    } catch (err: any) {
      showToast(err?.message || "특가 추가에 실패했습니다.", "error");
    }
  };

  const handleBulkApply = () => {
    if (bulkDelta === null) return;
    const targets = productsWithBase;
    const existing = specialPrices.filter((sp) => targets.some((p) => p.name === sp.productName));
    const sign = bulkDelta > 0 ? "+" : "−";
    showConfirm({
      title: "전 품목 일괄 특가",
      message:
        `제품 ${targets.length}개에 기본가 ${sign}${Math.abs(bulkDelta).toLocaleString()}원 연동 특가를 등록합니다.` +
        (existing.length > 0 ? `\n기존 특가 ${existing.length}개는 덮어씌워집니다.` : ""),
      confirmText: "등록",
      onConfirm: async () => {
        setBulkApplying(true);
        let ok = 0;
        try {
          for (const p of targets) {
            const amount = Math.max(0, (p.unitPrice ?? 0) + bulkDelta);
            await addSpecialPrice(customerName, p.name, amount, bulkDelta);
            ok += 1;
          }
          showToast(`전 품목 ${ok}개에 연동 특가를 등록했습니다.`, "success");
          setBulkDelta(null);
          setSpecialPrices(await getSpecialPricesByCustomer(customerName));
        } catch (err: any) {
          showToast(err?.message || `일괄 등록 실패 (${ok}/${targets.length}개 완료)`, "error");
        } finally {
          setBulkApplying(false);
        }
      },
    });
  };

  const handleDelete = (id: string) => {
    showConfirm({
      message: "이 특가를 삭제하시겠습니까?",
      confirmText: "삭제",
      onConfirm: async () => {
        try {
          await deleteSpecialPrice(id);
          showToast("특가가 삭제되었습니다.", "success");
          setSpecialPrices(await getSpecialPricesByCustomer(customerName));
        } catch {
          showToast("특가 삭제에 실패했습니다.", "error");
        }
      },
    });
  };

  const stepBtnStyle = (kind: "minus" | "plus") => ({
    width: 76, alignItems: "center" as const, justifyContent: "center" as const,
    borderWidth: 1.5, borderColor: "#d5ddea", borderRadius: 10, backgroundColor: "#ffffff",
  });

  return (
    <ScreenContainer style={{ backgroundColor: "#f5f5f5" }}>
      {/* 상단 바: 뒤로 + 제목 */}
      <View style={{
        flexDirection: "row", alignItems: "center", gap: 8,
        backgroundColor: NAVY, paddingHorizontal: 12, paddingVertical: 12,
      }}>
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/manage"))}
          style={{ flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 4, paddingRight: 8 }}
        >
          <MaterialIcons name="arrow-back-ios" size={18} color="#ffffff" />
          <Text style={{ color: "#ffffff", fontSize: 15, fontWeight: "600" }}>뒤로</Text>
        </TouchableOpacity>
        <Text style={{ color: "#ffffff", fontSize: 17, fontWeight: "700", flex: 1 }} numberOfLines={1}>
          {customerName} 거래처 설정
        </Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={NAVY} />
          <Text style={{ marginTop: 16, color: "#666666" }}>데이터 로딩 중...</Text>
        </View>
      ) : (
      <ResponsiveContainer className="flex-1">
        <ScrollView
          className="custom-scrollbar"
          contentContainerStyle={{ padding: 20, paddingBottom: 80 }}
          style={Platform.OS === "web" ? ({ flex: 1, minHeight: 0, maxHeight: "100%" } as any) : { flex: 1 }}
        >
          {/* 거래처 정보 카드 — 별칭 / 입금자명 */}
          <View style={{ backgroundColor: "#ffffff", borderRadius: 14, padding: 18, marginBottom: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: NAVY, marginBottom: 14 }}>
              📇 거래처 정보
            </Text>

            <Text style={{ fontSize: 14, color: "#666666", marginBottom: 6 }}>거래처명</Text>
            <View
              style={{
                backgroundColor: "#f0f0f0", borderRadius: 10, padding: 12,
                borderWidth: 1, borderColor: "#e0e0e0", marginBottom: 4,
              }}
            >
              <Text style={{ fontSize: 16, color: "#666666" }}>{customerName}</Text>
            </View>
            <Text style={{ fontSize: 12, color: "#999999", marginBottom: 16 }}>
              거래처명은 과거 거래·입금 기록과 이름으로 연결돼 있어 여기서 바꿀 수 없습니다.
            </Text>

            <Text style={{ fontSize: 14, color: "#666666", marginBottom: 6 }}>별칭 (검색용)</Text>
            <TextInput
              value={aliasText}
              onChangeText={setAliasText}
              placeholder="쉼표로 구분 (예: 7조, 켈리)"
              placeholderTextColor="#999999"
              style={{
                backgroundColor: "#f5f5f5", borderRadius: 10, padding: 12,
                borderWidth: 1, borderColor: "#e0e0e0", fontSize: 16, color: NAVY,
              }}
            />
            <Text style={{ fontSize: 12, color: "#999999", marginTop: 6, marginBottom: 16 }}>
              거래처를 빠르게 찾기 위한 이름입니다. 초성 검색도 됩니다.
            </Text>

            <Text style={{ fontSize: 14, color: "#666666", marginBottom: 6 }}>입금자명 (은행 문자용)</Text>
            <TextInput
              value={payerText}
              onChangeText={setPayerText}
              placeholder="쉼표로 구분 (예: 박태상)"
              placeholderTextColor="#999999"
              style={{
                backgroundColor: "#f5f5f5", borderRadius: 10, padding: 12,
                borderWidth: 1, borderColor: "#e0e0e0", fontSize: 16, color: NAVY,
              }}
            />
            <Text style={{ fontSize: 12, color: "#999999", marginTop: 6, marginBottom: 16 }}>
              은행 입금 문자에 찍히는 이름입니다. 거래처명 또는 이 이름과 완전히 같을 때만 입금이 자동으로 잡힙니다. 거래처 검색에는 나타나지 않습니다.
            </Text>

            <TouchableOpacity
              onPress={handleSaveCustomerInfo}
              disabled={savingInfo || !customerRecord}
              style={{
                backgroundColor: savingInfo || !customerRecord ? "#9ca3af" : NAVY,
                borderRadius: 10, paddingVertical: 14, alignItems: "center",
              }}
            >
              <Text style={{ color: "#ffffff", fontSize: 16, fontWeight: "700" }}>
                {savingInfo ? "저장 중..." : "거래처 정보 저장"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 특가 추가 카드 */}
          <View style={{ backgroundColor: "#ffffff", borderRadius: 14, padding: 18, marginBottom: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: NAVY, marginBottom: 14 }}>
              💰 특가 설정
            </Text>
            <Text style={{ fontSize: 14, color: "#666666", marginBottom: 8 }}>제품명</Text>
            <TextInput
              value={productQuery}
              onChangeText={(t) => { setProductQuery(t); setPickedProduct(null); }}
              placeholder="제품명 입력 (초성 검색 가능)"
              placeholderTextColor="#999999"
              style={{
                backgroundColor: "#f5f5f5", borderRadius: 10, padding: 12,
                borderWidth: 1, borderColor: "#e0e0e0", fontSize: 16, color: NAVY,
              }}
            />

            {/* 인라인 추천 영역 — 제품명과 특가 사이 전용 공간 (겹침 없음) */}
            {suggestions.length > 0 && (
              <View style={{
                borderWidth: 1, borderColor: "#d5ddea", backgroundColor: "#f8fafd",
                borderRadius: 10, marginTop: 6, maxHeight: 220, overflow: "hidden",
              }}>
                <Text style={{
                  fontSize: 11, color: "#8a97ab", paddingVertical: 7, paddingHorizontal: 12,
                  backgroundColor: "#f0f4fa", borderBottomWidth: 1, borderBottomColor: "#e8edf5",
                }}>
                  ↓ 아래에서 제품을 선택하세요 (기본 단가 함께 표시)
                </Text>
                <ScrollView nestedScrollEnabled style={{ maxHeight: 185 }}>
                  {suggestions.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => handlePickProduct(p)}
                      style={{
                        flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                        paddingVertical: 11, paddingHorizontal: 12,
                        borderBottomWidth: 1, borderBottomColor: "#e8edf5",
                      }}
                    >
                      <Text style={{ color: NAVY, fontWeight: "600", fontSize: 15 }}>{p.name}</Text>
                      <Text style={{ color: "#666666", fontSize: 13 }}>
                        {p.unitPrice !== undefined ? `기본 ${p.unitPrice.toLocaleString()}원` : "기본가 없음"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* 선택된 제품 표시 */}
            {pickedProduct && (
              <View style={{
                flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                backgroundColor: "#EDF1F7", borderRadius: 10, padding: 11, marginTop: 6,
              }}>
                <Text style={{ color: NAVY, fontWeight: "700" }}>✓ {pickedProduct.name}</Text>
                <Text style={{ color: "#666666", fontSize: 13 }}>
                  {basePrice !== undefined ? `기본 단가 ${basePrice.toLocaleString()}원` : "기본가 없음"}
                </Text>
              </View>
            )}

            <Text style={{ fontSize: 14, color: "#666666", marginTop: 16, marginBottom: 8 }}>
              특가 (원) — 직접 입력 또는 스테퍼
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity onPress={() => step(-1)} style={stepBtnStyle("minus")}>
                <Text style={{ color: BLUE, fontWeight: "800", fontSize: 14 }}>−{stepUnit.toLocaleString()}</Text>
              </TouchableOpacity>
              <TextInput
                value={priceText}
                onChangeText={setPriceText}
                placeholder="특가 직접 입력"
                placeholderTextColor="#999999"
                keyboardType="numeric"
                style={{
                  flex: 1, backgroundColor: "#f5f5f5", borderRadius: 10, padding: 12,
                  borderWidth: 1, borderColor: "#e0e0e0", fontSize: 18, fontWeight: "800",
                  color: NAVY, textAlign: "center",
                }}
              />
              <TouchableOpacity onPress={() => step(1)} style={stepBtnStyle("plus")}>
                <Text style={{ color: RED, fontWeight: "800", fontSize: 14 }}>+{stepUnit.toLocaleString()}</Text>
              </TouchableOpacity>
            </View>

            {/* 조정 단위 */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8 }}>
              <Text style={{ fontSize: 12, color: "#8a97ab" }}>조정 단위</Text>
              <TextInput
                value={stepUnitText}
                onChangeText={setStepUnitText}
                keyboardType="numeric"
                style={{
                  width: 88, textAlign: "center", fontWeight: "700", fontSize: 14, color: NAVY,
                  backgroundColor: "#f5f5f5", borderWidth: 1, borderColor: "#e0e0e0",
                  borderRadius: 8, paddingVertical: 6,
                }}
              />
              <Text style={{ fontSize: 12, color: "#8a97ab" }}>원</Text>
              {[500, 1000].map((u) => (
                <TouchableOpacity
                  key={u}
                  onPress={() => setStepUnitText(u.toLocaleString())}
                  style={{ borderWidth: 1.5, borderColor: "#d5ddea", borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10 }}
                >
                  <Text style={{ fontSize: 12, color: "#666666", fontWeight: "700" }}>{u.toLocaleString()}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 기본가 대비 차액 */}
            <Text style={{
              marginTop: 8, minHeight: 20, fontSize: 13, textAlign: "center",
              fontWeight: diff === null || diff === 0 ? "500" : "700",
              color: diff === null ? "#8a97ab" : diff === 0 ? "#8a97ab" : diff < 0 ? BLUE : RED,
            }}>
              {diff === null
                ? "제품을 선택하면 기본 단가가 자동으로 채워집니다"
                : diff === 0
                  ? "기본 단가와 동일"
                  : diff < 0
                    ? `기본가 대비 −${Math.abs(diff).toLocaleString()}원`
                    : `기본가 대비 +${diff.toLocaleString()}원`}
            </Text>

            {/* 기본가 연동 */}
            <TouchableOpacity
              onPress={() => setLinkBase((v) => !v)}
              activeOpacity={0.8}
              style={{
                flexDirection: "row", gap: 8, marginTop: 10, alignItems: "flex-start",
                backgroundColor: "#f8fafd", borderWidth: 1, borderColor: linkBase ? SAGE : "#d5ddea",
                borderRadius: 10, padding: 11,
              }}
            >
              <View style={{
                width: 18, height: 18, borderRadius: 4, marginTop: 1,
                borderWidth: 1.5, borderColor: linkBase ? SAGE : "#999999",
                backgroundColor: linkBase ? SAGE : "#ffffff",
                alignItems: "center", justifyContent: "center",
              }}>
                {linkBase && <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>✓</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, color: NAVY, lineHeight: 19 }}>
                  <Text style={{ fontWeight: "700" }}>기본가 연동</Text> — 나중에 제품 기본 단가가 바뀌면 특가도 ±차액을 유지한 채 자동으로 따라감
                </Text>
                {linkBase && diff !== null && basePrice !== undefined && (
                  <Text style={{ fontSize: 12, color: "#8a97ab", marginTop: 3 }}>
                    예: 기본가가 {(basePrice + 1000).toLocaleString()}원으로 오르면 특가는 {(basePrice + 1000 + diff).toLocaleString()}원으로 자동 변경
                  </Text>
                )}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleAdd}
              style={{ backgroundColor: NAVY, paddingVertical: 13, borderRadius: 10, marginTop: 14 }}
            >
              <Text style={{ color: "#fff", fontWeight: "600", textAlign: "center", fontSize: 16 }}>
                {linkBase ? "특가 추가 (기본가 연동)" : "특가 추가"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 전 품목 일괄 특가 */}
          <View style={{
            borderWidth: 1, borderStyle: "dashed", borderColor: "#b9c6da",
            borderRadius: 12, padding: 14, backgroundColor: "#f8fafd", marginBottom: 16,
          }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: NAVY }}>📦 전 품목 일괄 특가 (기본가 연동)</Text>
            <Text style={{ fontSize: 12, color: "#8a97ab", marginTop: 3, marginBottom: 10 }}>
              이 거래처의 모든 제품을 기본가±조정액으로 일괄 등록. 기본 단가가 나중에 바뀌어도 조정액이 유지됩니다
            </Text>
            <View style={{ flexDirection: "row", gap: 6, marginBottom: 10 }}>
              {[-1000, -500, 500, 1000].map((d) => {
                const on = bulkDelta === d;
                const minus = d < 0;
                const color = minus ? BLUE : RED;
                return (
                  <TouchableOpacity
                    key={d}
                    onPress={() => setBulkDelta(on ? null : d)}
                    style={{
                      flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center",
                      borderWidth: 1.5, borderColor: on ? color : "#d5ddea",
                      backgroundColor: on ? color : "#ffffff",
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "800", color: on ? "#ffffff" : color }}>
                      {minus ? "−" : "+"}{Math.abs(d).toLocaleString()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {bulkDelta !== null && (
              <View style={{ backgroundColor: "#ffffff", borderRadius: 8, padding: 10, marginBottom: 10 }}>
                <Text style={{ fontSize: 12, color: "#666666", lineHeight: 19 }}>
                  <Text style={{ fontWeight: "700" }}>제품 {productsWithBase.length}개</Text>에 기본가 {bulkDelta > 0 ? "+" : "−"}{Math.abs(bulkDelta).toLocaleString()}원 적용 예시:{"\n"}
                  {productsWithBase.slice(0, 3).map((p) =>
                    `· ${p.name}: ${(p.unitPrice ?? 0).toLocaleString()} → ${Math.max(0, (p.unitPrice ?? 0) + bulkDelta).toLocaleString()}원`
                  ).join("\n")}
                  {productsWithBase.length > 3 ? `\n· … 외 ${productsWithBase.length - 3}개` : ""}
                </Text>
              </View>
            )}
            <TouchableOpacity
              onPress={handleBulkApply}
              disabled={bulkDelta === null || bulkApplying}
              style={{
                backgroundColor: bulkDelta === null || bulkApplying ? "#c5cedb" : SAGE,
                paddingVertical: 11, borderRadius: 9,
              }}
            >
              <Text style={{ color: "#ffffff", fontWeight: "700", textAlign: "center", fontSize: 14 }}>
                {bulkApplying
                  ? "등록 중..."
                  : bulkDelta === null
                    ? "조정액을 먼저 선택하세요"
                    : `전 품목 ${productsWithBase.length}개에 ${bulkDelta > 0 ? "+" : "−"}${Math.abs(bulkDelta).toLocaleString()}원 특가 등록`}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 등록된 특가 목록 */}
          <Text style={{ fontSize: 14, fontWeight: "600", color: NAVY, marginBottom: 8 }}>
            등록된 특가 ({specialPrices.length})
          </Text>
          {specialPrices.length === 0 ? (
            <Text style={{ color: "#666666", textAlign: "center", paddingVertical: 16 }}>
              등록된 특가가 없습니다.
            </Text>
          ) : (
            specialPrices.map((item) => {
              const base = products.find((p) => p.name === item.productName)?.unitPrice;
              const effective = resolveSpecialAmount(item, base);
              const linked = item.priceOffset !== null && item.priceOffset !== undefined;
              return (
                <View key={item.id} style={{
                  backgroundColor: "#ffffff", padding: 12, borderRadius: 10, marginBottom: 8,
                  flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={{ color: NAVY, fontWeight: "500" }}>{item.productName}</Text>
                      {linked && (
                        <View style={{ backgroundColor: SAGE, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}>
                          <Text style={{ color: "#ffffff", fontSize: 10, fontWeight: "800" }}>
                            연동 {item.priceOffset! > 0 ? "+" : "−"}{Math.abs(item.priceOffset!).toLocaleString()}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ color: NAVY, fontSize: 14, fontWeight: "600", marginTop: 2 }}>
                      {effective.toLocaleString()}원
                      {base !== undefined && (
                        <Text style={{ color: "#999999", fontWeight: "400" }}>  (기본 {base.toLocaleString()}원)</Text>
                      )}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDelete(item.id)}
                    style={{ backgroundColor: RED, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}
                  >
                    <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>삭제</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
      </ResponsiveContainer>
      )}
    </ScreenContainer>
  );
}
