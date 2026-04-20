import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Keyboard,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/screen-container";
import { ResponsiveContainer } from "@/components/responsive-container";
import { useToast } from "@/lib/toast-provider";
import { getTransactions, type Transaction } from "@/lib/supabase";
import { loadProducts, loadCustomers } from "@/lib/storage";
import { searchCustomers } from "@/lib/search-utils";
import { matchChosung } from "@/lib/hangul-utils";
import { aggregateTransactions, groupByReceipt, filterByDate, type ReceiptGroup } from "@/lib/excel-utils";
import type { Customer, Product } from "@/lib/types";
import * as Haptics from "expo-haptics";

const SHADOW = Platform.OS === 'web'
  ? { boxShadow: '0 2px 12px rgba(0,0,0,0.06)' } as any
  : { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 };

export default function ReceiptScreen() {
  const { showToast } = useToast();
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        const [all, loadedCustomers, loadedProducts] = await Promise.all([
          getTransactions(),
          loadCustomers(),
          loadProducts(),
        ]);
        setTransactions(all);
        setCustomers(loadedCustomers);
        setProducts(loadedProducts);
      } catch (error) {
        console.error("거래 내역 조회 실패:", error);
        showToast("거래 내역을 불러오는데 실패했습니다.", "error");
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // 선택 날짜의 영수증 그룹 (거래처별)
  const dateReceipts = useMemo(() => {
    if (!selectedDate) return [];
    const aggregated = aggregateTransactions(transactions as any);
    const grouped = groupByReceipt(aggregated);
    return filterByDate(grouped, selectedDate);
  }, [selectedDate, transactions]);

  // 단가 조회 헬퍼
  const getUnitPrice = (productName: string) =>
    products.find((p) => p.name === productName)?.unitPrice || 0;

  // 거래처별 통계 (품목 수, 총액)
  const customerStats = useMemo(() => {
    return dateReceipts.map((r) => {
      let total = 0;
      r.items.forEach((item) => {
        const price = getUnitPrice(item.productName);
        total += price * item.quantity;
      });
      return {
        customerName: r.customerName,
        itemCount: r.items.length,
        totalAmount: total,
        isOverflow: r.items.length > 6,
        receipt: r,
      };
    });
  }, [dateReceipts, products]);

  // 전체 기간 거래처 수 (날짜 미선택 시 표시용)
  const allCustomerCount = useMemo(() => {
    const names = new Set(transactions.map((t: any) => t.customerName));
    return names.size;
  }, [transactions]);

  // 검색 필터링된 거래처 목록
  const filteredStats = useMemo(() => {
    if (!customerQuery.trim()) return customerStats;
    // customers 목록에서 검색 매칭된 이름 추출
    const matchedNames = new Set(
      searchCustomers(customers, customerQuery).map((c) => c.name),
    );
    // 거래처 이름으로 직접 초성/부분 일치도 체크
    return customerStats.filter((s) => {
      if (matchedNames.has(s.customerName)) return true;
      return matchChosung(s.customerName, customerQuery.trim());
    });
  }, [customerQuery, customerStats, customers]);

  // 특정 거래처 영수증 미리보기
  const handleCustomerReceiptPreview = async (receipt: ReceiptGroup) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { openReceiptPreview } = await import("@/lib/print-receipt");
      const filtered = transactions.filter(
        (t: any) => t.customerName === receipt.customerName && t.date.startsWith(selectedDate),
      );
      await openReceiptPreview(
        filtered as any,
        selectedDate,
        `${receipt.customerName} 영수증 - ${selectedDate}`,
      );
    } catch (error: any) {
      showToast(error?.message || "영수증 생성 실패", "error");
    }
  };

  const handleTodayClick = () => {
    const d = new Date();
    setSelectedDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  };

  // ===== 당일 집계표 미리보기 =====
  const handleDailySummaryPreview = async () => {
    if (!selectedDate) {
      showToast("날짜를 먼저 선택해주세요.", "error");
      return;
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsExporting(true);
    try {
      const products = await loadProducts();
      const getUnitPrice = (name: string) => products.find((p) => p.name === name)?.unitPrice || 0;

      const { openDailySummaryPreview } = await import("@/lib/print-daily-summary");
      await openDailySummaryPreview(transactions as any, selectedDate, getUnitPrice);
    } catch (error: any) {
      showToast(error?.message || "집계표 생성 실패", "error");
    } finally {
      setIsExporting(false);
    }
  };

  // ===== 영수증 미리보기 =====
  const handleReceiptPreview = async () => {
    if (!selectedDate) {
      showToast("날짜를 먼저 선택해주세요.", "error");
      return;
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsExporting(true);
    try {
      const { openReceiptPreview } = await import("@/lib/print-receipt");
      await openReceiptPreview(transactions as any, selectedDate);
    } catch (error: any) {
      showToast(error?.message || "영수증 생성 실패", "error");
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <ScreenContainer style={{ backgroundColor: '#f5f5f5', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#1B365D" />
        <Text style={{ marginTop: 16, color: '#666666' }}>데이터 로딩 중...</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer style={{ backgroundColor: '#f5f5f5' }}>
      <ResponsiveContainer>
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20, paddingBottom: 100 }}>
          <View style={{ gap: 20 }}>
            {/* 타이틀 */}
            <View>
              <Text style={{ fontSize: 22, fontWeight: '800', color: '#1B365D', letterSpacing: -0.5 }}>
                영수증 출력
              </Text>
              <Text style={{ marginTop: 8, fontSize: 14, color: '#666666' }}>
                거래 내역을 영수증 양식으로 출력합니다
              </Text>
            </View>

            {/* 날짜 선택 */}
            <View style={{
              backgroundColor: '#ffffff', borderRadius: 14, padding: 16,
              borderWidth: 1, borderColor: '#e0e0e0', ...SHADOW,
            }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#1B365D', marginBottom: 12 }}>
                날짜 선택
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  value={selectedDate}
                  onChangeText={setSelectedDate}
                  placeholder="YYYY-MM-DD (예: 2026-04-18)"
                  placeholderTextColor="#666666"
                  style={{
                    flex: 1, backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0',
                    borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: '#1B365D',
                  }}
                />
                <TouchableOpacity
                  onPress={handleTodayClick}
                  style={{ backgroundColor: '#1B365D', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10 }}
                >
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>오늘</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 당일 집계표 + 영수증 출력 버튼 */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {/* 당일 집계표 */}
              <TouchableOpacity
                onPress={handleDailySummaryPreview}
                disabled={isExporting || !selectedDate}
                style={{
                  flex: 1, minHeight: 140, justifyContent: 'center', alignItems: 'center',
                  backgroundColor: '#1B365D', borderRadius: 14, padding: 20,
                  opacity: (isExporting || !selectedDate) ? 0.5 : 1,
                  ...SHADOW,
                }}
                activeOpacity={0.7}
              >
                <MaterialIcons name="bar-chart" size={36} color="#ffffff" style={{ marginBottom: 8 }} />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18, marginBottom: 4 }}>
                  당일 집계표
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
                  누르면 미리보기 →
                </Text>
              </TouchableOpacity>

              {/* 영수증 출력 */}
              <TouchableOpacity
                onPress={handleReceiptPreview}
                disabled={isExporting || !selectedDate}
                style={{
                  flex: 1, minHeight: 140, justifyContent: 'center', alignItems: 'center',
                  backgroundColor: '#1B365D', borderRadius: 14, padding: 20,
                  opacity: (isExporting || !selectedDate) ? 0.5 : 1,
                  ...SHADOW,
                }}
                activeOpacity={0.7}
              >
                <MaterialIcons name="receipt-long" size={36} color="#ffffff" style={{ marginBottom: 8 }} />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18, marginBottom: 4 }}>
                  영수증 출력
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
                  누르면 미리보기 →
                </Text>
              </TouchableOpacity>
            </View>

            {/* 흐름 안내 */}
            <View style={{
              backgroundColor: '#f0f0f0', borderRadius: 14, padding: 16,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              flexWrap: 'wrap', gap: 8,
            }}>
              <View style={{
                backgroundColor: '#ffffff', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8,
              }}>
                <Text style={{ fontSize: 14, color: '#1B365D', fontWeight: '600' }}>
                  👆 위 버튼을 누르면
                </Text>
              </View>
              <Text style={{ fontSize: 14, color: '#999' }}>→</Text>
              <View style={{
                backgroundColor: '#ffffff', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8,
              }}>
                <Text style={{ fontSize: 14, color: '#1B365D', fontWeight: '600' }}>
                  미리보기 팝업이 열림
                </Text>
              </View>
              <Text style={{ fontSize: 14, color: '#999' }}>→</Text>
              <View style={{
                backgroundColor: '#ffffff', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8,
              }}>
                <Text style={{ fontSize: 14, color: '#1B365D', fontWeight: '600' }}>
                  내용 수정 가능
                </Text>
              </View>
              <Text style={{ fontSize: 14, color: '#999' }}>→</Text>
              <View style={{
                backgroundColor: '#ffffff', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8,
              }}>
                <Text style={{ fontSize: 14, color: '#1B365D', fontWeight: '600' }}>
                  🖨️ 프린트 버튼으로 인쇄
                </Text>
              </View>
            </View>

            {/* ===== 특정 거래처 영수증 섹션 ===== */}
            <View style={{ gap: 16 }}>
              {/* (1) 섹션 구분선 + 타이틀 */}
              <View style={{ borderTopWidth: 0.5, borderTopColor: '#e0e0e0', paddingTop: 20 }}>
                <Text style={{ fontSize: 18, fontWeight: '600', color: '#1B365D' }}>
                  특정 거래처 영수증
                </Text>
              </View>

              {/* (2) 데이터 통계 카드 */}
              <View style={{
                backgroundColor: '#ffffff', borderRadius: 14, padding: 16,
                borderWidth: 0.5, borderColor: '#e0e0e0',
              }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#1B365D', marginBottom: 6 }}>
                  데이터 통계
                </Text>
                <Text style={{ fontSize: 15, color: '#666666' }}>
                  {selectedDate
                    ? `${selectedDate} 거래처 수: ${customerStats.length}명`
                    : `전체 기간 거래처 수: ${allCustomerCount}명`}
                </Text>
              </View>

              {/* (3) 거래처 검색창 */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  value={customerQuery}
                  onChangeText={setCustomerQuery}
                  placeholder="거래처 이름 또는 초성 입력 (예: ㅎㅂ)"
                  placeholderTextColor="#666666"
                  style={{
                    flex: 1, backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0',
                    borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: '#1B365D',
                  }}
                />
                <TouchableOpacity
                  onPress={() => Keyboard.dismiss()}
                  style={{
                    backgroundColor: '#1B365D', paddingHorizontal: 16, paddingVertical: 12,
                    borderRadius: 10, justifyContent: 'center', alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 15 }}>검색</Text>
                </TouchableOpacity>
              </View>

              {/* (4) 검색 결과 리스트 */}
              {!selectedDate ? (
                <View style={{ padding: 32, alignItems: 'center' }}>
                  <Text style={{ fontSize: 15, color: '#666666' }}>
                    날짜를 먼저 선택해주세요
                  </Text>
                </View>
              ) : filteredStats.length === 0 ? (
                <View style={{ padding: 32, alignItems: 'center' }}>
                  <Text style={{ fontSize: 15, color: '#666666', textAlign: 'center' }}>
                    해당 날짜에 거래 내역이 있는 일치하는 거래처가 없습니다
                  </Text>
                </View>
              ) : (
                <View style={{
                  backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 0.5,
                  borderColor: '#e0e0e0', overflow: 'hidden',
                }}>
                  {filteredStats.map((stat, index) => (
                    <View
                      key={stat.customerName}
                      style={{
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                        paddingVertical: 14, paddingHorizontal: 16,
                        borderTopWidth: index > 0 ? 0.5 : 0, borderTopColor: '#e0e0e0',
                      }}
                    >
                      <View style={{ flex: 1, gap: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ fontSize: 16, fontWeight: '500', color: '#1B365D' }}>
                            {stat.customerName}
                          </Text>
                          {stat.isOverflow && (
                            <View style={{
                              backgroundColor: '#FAEEDA', borderRadius: 10,
                              paddingHorizontal: 8, paddingVertical: 2,
                            }}>
                              <Text style={{ color: '#633806', fontSize: 12, fontWeight: '600' }}>
                                초과 영수증
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ fontSize: 14, color: '#666666' }}>
                          품목 {stat.itemCount}개 · {stat.totalAmount > 0 ? `${stat.totalAmount.toLocaleString('ko-KR')}원` : '-'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleCustomerReceiptPreview(stat.receipt)}
                        style={{
                          backgroundColor: '#1B365D', borderRadius: 10,
                          paddingVertical: 10, paddingHorizontal: 14,
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 14 }}>
                          영수증 보기
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* (5) 사용 안내 박스 */}
              <View style={{
                backgroundColor: '#EDF1F7', borderRadius: 14, padding: 16,
              }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#1B365D', marginBottom: 6 }}>
                  사용 안내
                </Text>
                <Text style={{ fontSize: 14, color: '#1B365D', lineHeight: 22 }}>
                  {'· 거래처 이름 또는 초성(예: ㅎㅂ)으로 검색\n· [영수증 보기] 클릭 → 미리보기 팝업\n· 내용 수정 후 프린트 가능'}
                </Text>
              </View>
            </View>

          </View>
        </ScrollView>
      </ResponsiveContainer>
    </ScreenContainer>
  );
}
