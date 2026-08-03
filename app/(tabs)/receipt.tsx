import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Keyboard,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import "../custom-scrollbar.css";
import { MaterialIcons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/screen-container";
import { ResponsiveContainer } from "@/components/responsive-container";
import { ScrollToTopFab } from "@/components/scroll-to-top-fab";
import { useToast } from "@/lib/toast-provider";
import { blurActive } from "@/lib/utils";
import { type Transaction } from "@/lib/supabase";
import { pullFromServer, getLocalTransactions } from "@/lib/sync-manager";
import { loadProducts, loadCustomers } from "@/lib/storage";
import { searchCustomers } from "@/lib/search-utils";
import { matchChosung } from "@/lib/hangul-utils";
import { aggregateTransactions, groupByReceipt, filterByDate, type ReceiptGroup } from "@/lib/excel-utils";
import { getPendingCustomers } from "@/lib/payments";
import { safeGetSpecialPrices, type SpecialPriceLite } from "@/lib/unit-price";
import { MonthlyCalendar } from "@/components/monthly-calendar";
import { toLocalDateStr } from "@/lib/date-range-utils";
import { useRouter } from "expo-router";
import type { Customer, Product } from "@/lib/types";
import * as Haptics from "expo-haptics";

const SHADOW = Platform.OS === 'web'
  ? { boxShadow: '0 2px 12px rgba(0,0,0,0.06)' } as any
  : { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 };

export default function ReceiptScreen() {
  const { showToast } = useToast();
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  /** 거래처별 특가 (조회 실패 시 빈 배열 → 기본 단가로 동작) */
  const [specialPrices, setSpecialPrices] = useState<SpecialPriceLite[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarWrapperRef = useRef<View>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  /** 입금 입력 대기 중인 거래처 수 (미수 > 0). 마이그레이션 미적용 시 0. */
  const [pendingCount, setPendingCount] = useState(0);

  /** 미수 거래처 수 갱신 (실패해도 UI 안 깨짐) */
  const refreshPendingCount = async () => {
    try {
      const rows = await getPendingCustomers();
      setPendingCount(rows.length);
    } catch (err) {
      // payments 테이블 마이그레이션 미적용 시 등 — 조용히 0 처리
      console.warn("[refreshPendingCount] 실패:", err);
      setPendingCount(0);
    }
  };

  /** [입금 입력] 카드 클릭 — /deposit 전체화면으로 이동 */
  const handleDepositInputClick = () => {
    blurActive(); // 화면 전환 시 aria-hidden 포커스 경고 방지
    router.push('/deposit');
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    setShowScrollTop(y > 200);
  };

  const handleScrollToTop = () => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  /**
   * loadData
   *   isInitial=true  → 첫 mount 1회. isLoading=true 로 full-screen spinner 표시.
   *   isInitial=false → focus / transaction:changed 등의 background refresh.
   *                     isLoading 을 건드리지 않아 receipt 트리가 unmount/remount 되지 않게 함.
   *                     (이전엔 isLoading 토글로 트리 전체가 갈리며 DepositInputModal 이
   *                      매번 새로 마운트되어 fetch 가 여러 번 일어남.)
   */
  const loadData = async (isInitial = false) => {
    try {
      if (isInitial) setIsLoading(true);

      // 거래처/제품은 독립적으로 로드 (AsyncStorage, 항상 성공)
      const [loadedCustomers, loadedProducts] = await Promise.all([
        loadCustomers(),
        loadProducts(),
      ]);
      setCustomers(loadedCustomers);
      setProducts(loadedProducts);

      // 특가는 논블로킹 로드 (실패해도 화면은 기본 단가로 표시)
      safeGetSpecialPrices().then(setSpecialPrices);

      // 1) 로컬 IndexedDB 먼저 표시 (오프라인/세션 만료 시에도 동작)
      const localAll = await getLocalTransactions();
      const localMapped: Transaction[] = localAll.map((t) => ({
        id: t.serverId || `local-${t.localId}`,
        customerName: t.customerName,
        productName: t.productName,
        quantity: t.quantity,
        unitPrice: t.unitPrice,
        date: t.date,
        createdAt: t.createdAt,
      }));
      // id 기준 중복 제거
      const seenIds = new Set<string>();
      const uniqueLocal = localMapped.filter((t) => {
        if (seenIds.has(t.id)) return false;
        seenIds.add(t.id);
        return true;
      });
      setTransactions(uniqueLocal);

      // 2) 온라인이면 서버 동기화 시도 (실패해도 로컬 유지)
      if (typeof navigator !== "undefined" && navigator.onLine) {
        try {
          const serverAll = await pullFromServer();
          setTransactions(serverAll);
        } catch (serverErr) {
          console.warn("서버 동기화 실패, 로컬 데이터 사용:", serverErr);
        }
      }

      // 3) 미수 거래처 수 갱신 (실패해도 무시)
      await refreshPendingCount();
    } catch (error) {
      console.error("거래 내역 조회 실패:", error);
      showToast("거래 내역을 불러오는데 실패했습니다.", "error");
    } finally {
      if (isInitial) setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData(true); // 첫 mount — full-screen spinner 표시
  }, []);

  // 다른 페이지에서 저장/수정/삭제 시 즉시 반영
  useEffect(() => {
    const handleChanged = () => loadData();
    window.addEventListener('transaction:changed', handleChanged);
    const handleFocus = () => loadData();
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('transaction:changed', handleChanged);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // 선택 날짜의 영수증 그룹 (거래처별)
  const dateReceipts = useMemo(() => {
    if (!selectedDate) return [];
    const aggregated = aggregateTransactions(transactions as any);
    const grouped = groupByReceipt(aggregated);
    return filterByDate(grouped, selectedDate);
  }, [selectedDate, transactions]);

  // 거래처별 통계 (품목 수, 총액)
  // 금액은 거래 시점 박제 단가(item.amount) — 영수증·집계표·잔고와 동일 출처.
  const customerStats = useMemo(() => {
    return dateReceipts.map((r) => {
      const total = r.items.reduce((sum, item) => sum + (item.amount > 0 ? item.amount : 0), 0);
      return {
        customerName: r.customerName,
        itemCount: r.items.length,
        totalAmount: total,
        isOverflow: r.items.length > 6,
        receipt: r,
      };
    });
  }, [dateReceipts]);

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

  /**
   * 출력용 거래 로드 — 서버 우선, 실패 시 로컬 캐시 fallback.
   *
   * 잔고(RPC)와 **같은 서버·같은 시점**의 거래를 써야 영수증 숫자가 어긋나지 않는다.
   * 화면 표시는 로컬 캐시로 빠르게 하되, 인쇄물만큼은 서버 기준으로 맞춘다.
   *
   * ⚠️ 서버 조회가 실패해도 **출력을 막지 않는다.** 창고에서 인터넷이 끊겨도
   *    영수증은 나와야 한다 (기존 동작 유지). 대신 오프라인 데이터임을 알린다.
   */
  const loadPrintTransactions = async (
    date: string,
  ): Promise<{ rows: any[]; stale: boolean }> => {
    try {
      const { getTransactionsForDate } = await import("@/lib/transactions-query");
      return { rows: await getTransactionsForDate(date), stale: false };
    } catch (err) {
      console.warn("[receipt] 서버 거래 조회 실패 — 로컬 캐시로 출력합니다:", err);
      const local = transactions.filter((t: any) => t.date === date || t.date?.startsWith(date));
      return { rows: local, stale: true };
    }
  };

  // 특정 거래처 영수증 미리보기
  const handleCustomerReceiptPreview = async (receipt: ReceiptGroup) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { openReceiptPreview } = await import("@/lib/print-receipt");
      const { rows, stale } = await loadPrintTransactions(selectedDate);
      if (stale) showToast("오프라인 데이터 기준으로 출력합니다.", "info");
      const filtered = rows.filter((t: any) => t.customerName === receipt.customerName);
      await openReceiptPreview(
        filtered as any,
        selectedDate,
        `${receipt.customerName} 영수증 - ${selectedDate}`,
      );
    } catch (error: any) {
      showToast(error?.message || "영수증 생성 실패", "error");
    }
  };

  // 달력 팝업: 바깥 클릭 / ESC 로 닫기 (web 전용 — history 탭과 동일 패턴)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (!calendarOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const node = calendarWrapperRef.current as unknown as HTMLElement | null;
      if (node && !node.contains(e.target as Node)) {
        setCalendarOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCalendarOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [calendarOpen]);

  const handleYesterdayClick = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    setSelectedDate(toLocalDateStr(d));
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
      const { openDailySummaryPreview } = await import("@/lib/print-daily-summary");
      const { rows, stale } = await loadPrintTransactions(selectedDate);
      if (stale) showToast("오프라인 데이터 기준으로 출력합니다.", "info");
      await openDailySummaryPreview(rows as any, selectedDate);
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
      const { rows, stale } = await loadPrintTransactions(selectedDate);
      if (stale) showToast("오프라인 데이터 기준으로 출력합니다.", "info");
      await openReceiptPreview(rows as any, selectedDate);
    } catch (error: any) {
      showToast(error?.message || "영수증 생성 실패", "error");
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <ScreenContainer style={{ backgroundColor: '#f5f5f5' }}>
        {/* 화면 정중앙 로딩 표시 */}
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#1B365D" />
          <Text style={{ marginTop: 16, color: '#666666' }}>데이터 로딩 중...</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer style={{ backgroundColor: '#f5f5f5' }}>
      <ResponsiveContainer className="flex-1">
        <ScrollView
          ref={scrollViewRef}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          className="custom-scrollbar"
          contentContainerStyle={{ flexGrow: 1, padding: 20, paddingBottom: 100 }}
          style={Platform.OS === 'web' ? ({ flex: 1, minHeight: 0, maxHeight: '100%' } as any) : { flex: 1 }}
        >
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

            {/* 날짜 선택 — 입력칸을 누르면 달력 팝업 */}
            <View style={{
              backgroundColor: '#ffffff', borderRadius: 14, padding: 16,
              borderWidth: 1, borderColor: '#e0e0e0', ...SHADOW,
              zIndex: 100,
            }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#1B365D', marginBottom: 12 }}>
                날짜 선택
              </Text>
              <View ref={calendarWrapperRef} style={{ flexDirection: 'row', gap: 8, position: 'relative', zIndex: 100 }}>
                <TextInput
                  value={selectedDate}
                  onChangeText={setSelectedDate}
                  onFocus={() => setCalendarOpen(true)}
                  placeholder="YYYY-MM-DD (예: 2026-04-18)"
                  placeholderTextColor="#666666"
                  style={{
                    flex: 1, backgroundColor: '#f5f5f5', borderWidth: 1,
                    borderColor: calendarOpen ? '#1B365D' : '#e0e0e0',
                    borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: '#1B365D',
                  }}
                />
                <TouchableOpacity
                  onPress={() => { handleYesterdayClick(); setCalendarOpen(false); }}
                  style={{
                    backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#1B365D',
                    paddingHorizontal: 16, height: 48, minWidth: 64,
                    alignItems: 'center', justifyContent: 'center', borderRadius: 10,
                  }}
                >
                  <Text style={{ color: '#1B365D', fontWeight: '600', fontSize: 15 }}>어제</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { handleTodayClick(); setCalendarOpen(false); }}
                  style={{
                    backgroundColor: '#1B365D',
                    paddingHorizontal: 16, height: 48, minWidth: 64,
                    alignItems: 'center', justifyContent: 'center', borderRadius: 10,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>오늘</Text>
                </TouchableOpacity>

                {/* 달력 팝업 */}
                {calendarOpen && (
                  <View
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: 8,
                      width: 300,
                      maxWidth: 320,
                      zIndex: 100,
                      backgroundColor: '#ffffff',
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: '#e0e0e0',
                      padding: 14,
                      ...(Platform.OS === 'web'
                        ? { boxShadow: '0 4px 16px rgba(0,0,0,0.10)' } as any
                        : { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 16, elevation: 8 }),
                    }}
                  >
                    <MonthlyCalendar
                      selectedDate={selectedDate || toLocalDateStr(new Date())}
                      onDateSelect={(date) => {
                        setSelectedDate(date);
                        setCalendarOpen(false);
                      }}
                      onGoToToday={() => {
                        handleTodayClick();
                        setCalendarOpen(false);
                      }}
                    />
                  </View>
                )}
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

              {/* 입금 입력 (Task 5 — 카드만 추가, 모달은 Task 6) */}
              <TouchableOpacity
                onPress={handleDepositInputClick}
                disabled={isExporting}
                style={{
                  flex: 1, minHeight: 140, justifyContent: 'center', alignItems: 'center',
                  backgroundColor: '#f59e0b', borderRadius: 14, padding: 20,
                  opacity: isExporting ? 0.5 : 1,
                  position: 'relative',
                  ...SHADOW,
                }}
                activeOpacity={0.7}
              >
                {pendingCount > 0 && (
                  <View style={{
                    position: 'absolute', top: 10, right: 10,
                    backgroundColor: '#dc2626', borderRadius: 12,
                    paddingHorizontal: 8, paddingVertical: 2,
                    minWidth: 24, alignItems: 'center',
                  }}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                      {pendingCount}
                    </Text>
                  </View>
                )}
                <MaterialIcons name="payments" size={36} color="#ffffff" style={{ marginBottom: 8 }} />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18, marginBottom: 4 }}>
                  입금 입력
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>
                  어제 미수 정리 →
                </Text>
              </TouchableOpacity>
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

              {/* (4) 검색 결과 리스트
                  — 거래처명 입력 전엔 표시 X (날짜만으로는 표시 안 됨) */}
              {!customerQuery.trim() ? (
                <View style={{ padding: 32, alignItems: 'center' }}>
                  <Text style={{ fontSize: 15, color: '#666666' }}>
                    거래처명을 입력해 검색해주세요
                  </Text>
                  <Text style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                    (날짜만 선택해서는 표시되지 않음)
                  </Text>
                </View>
              ) : !selectedDate ? (
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
        <ScrollToTopFab visible={showScrollTop} onPress={handleScrollToTop} />
      </ResponsiveContainer>
    </ScreenContainer>
  );
}
