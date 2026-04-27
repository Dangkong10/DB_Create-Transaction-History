import React, { useState, useEffect } from "react";
import {
  ScrollView,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  Platform,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { ResponsiveContainer } from "@/components/responsive-container";
import { useColors } from "@/hooks/use-colors";
import { useToast } from "@/lib/toast-provider";
import { useConfirm } from "@/lib/confirm-provider";
import { deleteTransaction, updateTransaction, type Transaction } from "@/lib/supabase";
import { pullFromServer, getLocalTransactions } from "@/lib/sync-manager";
import { getLastSyncTime } from "@/lib/offline-db";
import { useAuth } from "@/hooks/use-auth";
import { useIsMounted } from "@/hooks/use-is-mounted";
import { useSync } from "@/hooks/use-sync";
import { SyncStatusBadge } from "@/components/sync-status-badge";
import { filterByChosung } from "@/lib/chosung-utils";
import { MonthlyCalendar } from "@/components/monthly-calendar";

// 같은 거래처+시간으로 거래를 그룹핑하기 위한 타입
interface TransactionGroup {
  customerName: string;
  createdAt: string;
  items: Transaction[];
}

export default function HistoryScreen() {
  const colors = useColors();
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();
  const { user, logout } = useAuth();
  const mounted = useIsMounted();

  const handleLogin = () => {
    if (Platform.OS === "web") {
      window.location.href = "/login";
    }
  };
  // SSR/첫 렌더에선 빈 문자열로 두고 mount 후 오늘 날짜로 채움 — new Date() 가 SSR 빌드 시각과
  // 클라이언트 시각이 달라 발생하던 hydration mismatch (React error #418) 방지
  const [selectedDate, setSelectedDate] = useState<string>("");
  useEffect(() => {
    if (selectedDate) return;
    const d = new Date();
    setSelectedDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }, [selectedDate]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activeTab, setActiveTab] = useState<"today" | "calendar">("today");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    customerName: string;
    productName: string;
    quantity: string;
  }>({ customerName: "", productName: "", quantity: "" });

  const { isOnline } = useSync();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [pendingLocalIds, setPendingLocalIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  const mapLocalToTransaction = (t: Awaited<ReturnType<typeof getLocalTransactions>>[number]): Transaction => ({
    id: t.serverId || `local-${t.localId}`,
    customerName: t.customerName,
    productName: t.productName,
    quantity: t.quantity,
    unitPrice: t.unitPrice,
    date: t.date,
    createdAt: t.createdAt,
  });

  const renderFromLocal = async () => {
    const localAll = await getLocalTransactions();
    const localFiltered = localAll.filter((t) => t.date.startsWith(selectedDate));

    const seen = new Set<string>();
    const mapped: Transaction[] = [];
    for (const t of localFiltered) {
      const m = mapLocalToTransaction(t);
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      mapped.push(m);
    }
    setTransactions(mapped);

    setPendingLocalIds(
      new Set(
        localFiltered
          .filter((t) => t.syncStatus !== 'synced')
          .map((t) => t.serverId || `local-${t.localId}`),
      ),
    );
  };

  const loadTransactions = async () => {
    try {
      setLoading(true);

      // 1) 먼저 로컬 데이터를 즉시 표시 (오프라인이거나 서버 풀이 늦어도 사용자 눈에는 보임)
      await renderFromLocal();

      // 2) 온라인이면 서버 풀 → pullFromServer 가 로컬 IDB 에 머지하므로 다시 로컬을 읽어 표시
      //    (이렇게 해야 아직 syncQueue 에서 처리 중인 pending 항목이 화면에서 사라지지 않음)
      if (navigator.onLine) {
        try {
          await pullFromServer();
          await renderFromLocal();
        } catch (serverErr: any) {
          console.warn("서버 동기화 실패, 로컬 데이터 사용:", serverErr);
        }
      }
    } catch (error: any) {
      console.error("거래 내역 조회 실패:", error);
      showToast(error?.message || "거래 내역을 불러오는데 실패했습니다.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedDate) return;
    loadTransactions();
  }, [selectedDate]);

  // 다른 페이지에서 저장/수정/삭제 시 즉시 반영
  useEffect(() => {
    if (!selectedDate) return;
    const handleChanged = () => loadTransactions();
    window.addEventListener('transaction:changed', handleChanged);
    // 탭 전환 시에도 최신 데이터 로드 (web)
    const handleFocus = () => loadTransactions();
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('transaction:changed', handleChanged);
      window.removeEventListener('focus', handleFocus);
    };
  }, [selectedDate]);

  const handleDeleteTransaction = async (id: string) => {
    try {
      await deleteTransaction(id);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      showToast("거래 내역이 삭제되었습니다.", "success");
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('transaction:changed'));
      }
      await loadTransactions();
    } catch (error) {
      console.error("[삭제] 실패:", error);
      showToast("삭제에 실패했습니다.", "error");
    }
  };

  const handleUpdateTransaction = async () => {
    try {
      if (!editingId) return;
      const quantity = parseInt(editForm.quantity);
      if (isNaN(quantity) || quantity === 0) {
        showToast("수량은 0이 아닌 숫자여야 합니다.", "error");
        return;
      }
      await updateTransaction(editingId, {
        customerName: editForm.customerName,
        productName: editForm.productName,
        quantity,
      });
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      showToast("거래 내역이 수정되었습니다.", "success");
      setEditingId(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('transaction:changed'));
      }
      await loadTransactions();
    } catch (error) {
      console.error("[수정] 실패:", error);
      showToast("수정에 실패했습니다.", "error");
    }
  };

  const handleDelete = async (id: string) => {
    showConfirm({
      message: "이 거래 내역을 삭제하시겠습니까?",
      confirmText: "삭제",
      onConfirm: () => handleDeleteTransaction(id),
    });
  };

  const handleEdit = (transaction: Transaction) => {
    setEditingId(transaction.id);
    setEditForm({
      customerName: transaction.customerName,
      productName: transaction.productName,
      quantity: transaction.quantity.toString(),
    });
  };

  const handleSaveEdit = () => {
    handleUpdateTransaction();
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const formatTime = (dateString: string) => {
    try {
      if (!dateString || typeof dateString !== 'string' || dateString.trim() === '') {
        return '-';
      }
      // createdAt 형식: "2026-04-17 14:30:00"
      // 공백 포함 시 시간 부분 직접 추출
      if (dateString.includes(' ')) {
        const timePart = dateString.split(' ')[1]; // "14:30:00"
        if (timePart) {
          const [h, m] = timePart.split(':');
          return `${h}:${m}`;
        }
      }
      // "T" 포함 ISO 형식 → 로컬 Date로 파싱
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    } catch (error) {
      return dateString;
    }
  };

  const formatDate = (dateString: string) => {
    try {
      if (!dateString || typeof dateString !== 'string' || dateString.trim() === '') {
        return '-';
      }
      // "2026-04-17 14:30:00" 형식 직접 파싱
      if (dateString.includes(' ')) {
        const [datePart, timePart] = dateString.split(' ');
        const [, mm, dd] = datePart.split('-');
        const [h, m] = (timePart || '').split(':');
        return `${mm}. ${dd}. ${h}:${m}`;
      }
      // ISO 형식 등
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const h = String(date.getHours()).padStart(2, '0');
      const m = String(date.getMinutes()).padStart(2, '0');
      return `${mm}. ${dd}. ${h}:${m}`;
    } catch (error) {
      return dateString;
    }
  };

  const toLocalDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const goToPreviousDay = () => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const date = new Date(y, m - 1, d - 1);
    setSelectedDate(toLocalDateStr(date));
  };

  const goToNextDay = () => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const date = new Date(y, m - 1, d + 1);
    setSelectedDate(toLocalDateStr(date));
  };

  const goToToday = () => {
    setSelectedDate(toLocalDateStr(new Date()));
  };

  const handleExportExcel = async () => {
    try {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      const dataToExport = filteredTransactions;
      if (dataToExport.length === 0) {
        showToast("내보낼 데이터가 없습니다.", "error");
        return;
      }
      const ExcelJSModule: any = await import("exceljs");
      const ExcelJS = ExcelJSModule.default ?? ExcelJSModule;
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("거래 내역");
      worksheet.columns = [
        { header: "날짜", key: "date", width: 15 },
        { header: "시간", key: "time", width: 12 },
        { header: "거래처", key: "customerName", width: 20 },
        { header: "품목", key: "productName", width: 25 },
        { header: "수량", key: "quantity", width: 10 },
      ];
      dataToExport.forEach((transaction) => {
        const formattedDateTime = formatDate(transaction.createdAt);
        let dateStr = transaction.date;
        let timeStr = "";
        try {
          if (formattedDateTime.includes('.')) {
            const parts = formattedDateTime.split(' ');
            if (parts.length >= 3) {
              dateStr = `${parts[0]} ${parts[1]}`;
              timeStr = parts[2];
            }
          } else {
            timeStr = formattedDateTime;
          }
        } catch (error) {
          timeStr = transaction.createdAt;
        }
        worksheet.addRow({
          date: dateStr,
          time: timeStr,
          customerName: transaction.customerName,
          productName: transaction.productName,
          quantity: transaction.quantity,
        });
      });
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).alignment = { horizontal: "center", vertical: "middle" };
      const buffer = await workbook.xlsx.writeBuffer();
      const d = new Date();
      const today = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      const filename = `거래내역_${selectedDate}_${today}.xlsx`;
      if (Platform.OS === "web") {
        const blob = new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const FileSystem = await import("expo-file-system/legacy");
        const Sharing = await import("expo-sharing");
        const base64 = Buffer.from(buffer).toString("base64");
        const fileUri = `${FileSystem.documentDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(fileUri, base64, {
          encoding: "base64" as any,
        });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri);
        } else {
          alert("파일이 저장되었습니다: " + fileUri);
        }
      }
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      showToast(`엑셀 파일이 생성되었습니다. (${dataToExport.length}건)`, "success");
    } catch (error) {
      showToast("엑셀 파일 생성에 실패했습니다.", "error");
      console.error("엑셀 내보내기 오류:", error);
    }
  };

  // 검색 필터링
  const filteredTransactions = filterByChosung(
    transactions,
    searchQuery,
    (t) => t.customerName
  );

  // 정렬
  const sortedTransactions = [...filteredTransactions].sort((a, b) => {
    const dateA = new Date(a.createdAt.split(' ')[0]).getTime();
    const dateB = new Date(b.createdAt.split(' ')[0]).getTime();
    return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
  });

  // 거래 그룹핑 (같은 거래처 + 같은 시간)
  const groupTransactions = (txns: Transaction[]): TransactionGroup[] => {
    const groups: TransactionGroup[] = [];
    const groupMap = new Map<string, Transaction[]>();

    txns.forEach(t => {
      const key = `${t.customerName}___${t.createdAt}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, []);
      }
      groupMap.get(key)!.push(t);
    });

    groupMap.forEach((items, key) => {
      const [customerName] = key.split('___');
      groups.push({
        customerName,
        createdAt: items[0].createdAt,
        items,
      });
    });

    return groups;
  };

  const transactionGroups = groupTransactions(sortedTransactions);

  const totalTransactions = sortedTransactions.length;

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest');
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  // 공통 스타일 상수
  const SHADOW = Platform.OS === 'web'
    ? { boxShadow: '0 2px 12px rgba(0,0,0,0.06)' } as any
    : { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 };

  return (
    <ScreenContainer style={{ backgroundColor: '#f5f5f5' }}>
      <ResponsiveContainer className="flex-1">
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
          style={{ flex: 1 }}
        >
          {/* 로그인 정보 헤더 — mount 전엔 빈 공간으로 hydration mismatch 방지 */}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 12, gap: 12, minHeight: 20 }}>
            {mounted && (user ? (
              <>
                <Text style={{ fontSize: 14, color: '#666666' }}>{user.email}</Text>
                <TouchableOpacity
                  onPress={() => {
                    showConfirm({
                      title: "로그아웃",
                      message: "로그아웃 하시겠습니까?",
                      onConfirm: async () => {
                        await logout();
                        showToast("로그아웃되었습니다.", "success");
                      },
                    });
                  }}
                >
                  <Text style={{ fontSize: 14, color: '#e74c3c', fontWeight: '600' }}>로그아웃</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity onPress={handleLogin}>
                <Text style={{ fontSize: 14, color: '#1B365D', fontWeight: '600' }}>로그인</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 헤더 */}
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#1B365D', letterSpacing: -0.5, marginBottom: 8 }}>
            거래 내역
          </Text>

          {/* 동기화 상태 */}
          <View style={{ marginBottom: 12 }}>
            <SyncStatusBadge />
            {!isOnline && (
              <Text style={{ fontSize: 12, color: '#92400E', textAlign: 'center', marginTop: 4 }}>
                마지막 동기화: {getLastSyncTime() || '없음'}
              </Text>
            )}
          </View>

          {/* 날짜 네비게이션 */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: '#ffffff', borderRadius: 12, padding: 10, paddingHorizontal: 4,
            ...SHADOW,
          }}>
            <TouchableOpacity
              onPress={goToPreviousDay}
              style={{ backgroundColor: '#1B365D', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>◀ 이전</Text>
            </TouchableOpacity>
            <Text style={{ fontWeight: '700', fontSize: 16, color: '#1B365D' }}>
              {selectedDate
                ? new Date(selectedDate).toLocaleDateString("ko-KR", {
                    year: "numeric", month: "long", day: "numeric",
                  })
                : ""}
            </Text>
            <TouchableOpacity
              onPress={goToNextDay}
              style={{ backgroundColor: '#1B365D', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>다음 ▶</Text>
            </TouchableOpacity>
          </View>

          {/* 액션 바 */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <TouchableOpacity
              onPress={() => {
                setActiveTab("today");
                setSearchQuery("");
              }}
              style={{
                flex: 1, padding: 10, borderRadius: 10, backgroundColor: activeTab === 'today' ? '#ffffff' : '#ffffff',
                borderWidth: 1, borderColor: activeTab === 'today' ? '#1B365D' : '#e0e0e0',
              }}
            >
              <Text style={{
                textAlign: 'center', fontSize: 13, fontWeight: '600',
                color: activeTab === 'today' ? '#1B365D' : '#1B365D',
              }}>당일 전체 내역 보기</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab("calendar")}
              style={{
                flex: 1, padding: 10, borderRadius: 10, backgroundColor: '#ffffff',
                borderWidth: 1, borderColor: activeTab === 'calendar' ? '#1B365D' : '#e0e0e0',
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}
            >
              <MaterialIcons name="calendar-today" size={16} color={activeTab === 'calendar' ? '#1B365D' : '#666666'} />
              <Text style={{
                fontSize: 13, fontWeight: '600',
                color: activeTab === 'calendar' ? '#1B365D' : '#1B365D',
              }}>달력</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleExportExcel}
              disabled={transactions.length === 0}
              style={{
                flex: 1, padding: 10, borderRadius: 10, backgroundColor: '#1B365D',
                opacity: transactions.length === 0 ? 0.5 : 1,
              }}
            >
              <Text style={{ textAlign: 'center', fontSize: 13, fontWeight: '600', color: '#fff' }}>
                엑셀 내보내기
              </Text>
            </TouchableOpacity>
          </View>

          {/* 통계 + 검색 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <View style={{
              backgroundColor: '#ffffff', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10,
              ...SHADOW, flex: 0.3,
            }}>
              <Text style={{ fontSize: 13, color: '#1B365D' }}>오늘의 총 거래 건수</Text>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#1B365D' }}>{totalTransactions}건</Text>
            </View>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="거래처 이름 또는 초성 입력(예: ㅜ ㄷ)"
              placeholderTextColor="#666666"
              style={{
                flex: 0.7, height: 48, backgroundColor: '#ffffff', borderRadius: 10,
                paddingHorizontal: 12, fontSize: 14, color: '#1B365D',
                borderWidth: 1, borderColor: '#e0e0e0',
              }}
            />
          </View>

          {/* 정렬 버튼 */}
          <TouchableOpacity
            onPress={toggleSortOrder}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12,
              backgroundColor: '#ffffff', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8,
              borderWidth: 1, borderColor: '#e0e0e0',
            }}
          >
            <MaterialIcons
              name={sortOrder === 'newest' ? 'arrow-downward' : 'arrow-upward'}
              size={18}
              color="#1B365D"
            />
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#1B365D' }}>
              {sortOrder === 'newest' ? '최신순' : '오래된순'}
            </Text>
          </TouchableOpacity>

          {/* 달력 탭 */}
          {activeTab === "calendar" && (
            <View style={{ marginTop: 12 }}>
              <MonthlyCalendar
                selectedDate={selectedDate}
                onDateSelect={(date) => {
                  setSelectedDate(date);
                  setActiveTab("today");
                }}
                onGoToToday={goToToday}
              />
            </View>
          )}

          {/* 테이블 형식 거래 내역 */}
          {activeTab === "today" && (
            <View style={{
              marginTop: 12, backgroundColor: '#ffffff', borderRadius: 14, overflow: 'hidden',
              alignSelf: 'center', width: '100%',
              ...SHADOW,
            }}>
              {/* 테이블 헤더 */}
              <View style={{
                flexDirection: 'row', backgroundColor: '#1B365D', paddingVertical: 14, paddingHorizontal: 12,
              }}>
                <Text style={{ width: 80, fontSize: 15, fontWeight: '700', color: '#fff', textAlign: 'left' }}>시간</Text>
                <Text style={{ width: 100, fontSize: 15, fontWeight: '700', color: '#fff', textAlign: 'left' }}>거래처</Text>
                <Text style={{ width: 150, fontSize: 15, fontWeight: '700', color: '#fff', textAlign: 'left' }}>품목</Text>
                <Text style={{ width: 70, fontSize: 15, fontWeight: '700', color: '#fff', textAlign: 'center' }}>수량</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff', textAlign: 'right' }}>관리</Text>
                </View>
              </View>

              {/* 테이블 바디 */}
              {sortedTransactions.length === 0 ? (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <Text style={{ fontSize: 16, color: '#666666' }}>선택한 날짜에 거래 내역이 없습니다.</Text>
                </View>
              ) : (
                transactionGroups.map((group, groupIdx) => (
                  group.items.map((item, itemIdx) => {
                    const isEditing = editingId === item.id;
                    const isFirstInGroup = itemIdx === 0;
                    const groupSize = group.items.length;
                    const isLastGroup = groupIdx === transactionGroups.length - 1;
                    const isLastInGroup = itemIdx === groupSize - 1;

                    if (isEditing) {
                      return (
                        <View key={item.id} style={{
                          padding: 16, backgroundColor: '#EDF1F7',
                          borderBottomWidth: 1, borderBottomColor: '#e0e0e0',
                        }}>
                          <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>
                            수정 모드 — {formatTime(item.createdAt)}
                          </Text>
                          <View style={{ gap: 8 }}>
                            <View>
                              <Text style={{ fontSize: 13, color: '#666666', marginBottom: 4 }}>거래처</Text>
                              <TextInput
                                value={editForm.customerName}
                                onChangeText={(text) => setEditForm({ ...editForm, customerName: text })}
                                style={{
                                  backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e0e0e0',
                                  borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 16, color: '#1B365D',
                                }}
                              />
                            </View>
                            <View>
                              <Text style={{ fontSize: 13, color: '#666666', marginBottom: 4 }}>품목</Text>
                              <TextInput
                                value={editForm.productName}
                                onChangeText={(text) => setEditForm({ ...editForm, productName: text })}
                                style={{
                                  backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e0e0e0',
                                  borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 16, color: '#1B365D',
                                }}
                              />
                            </View>
                            <View>
                              <Text style={{ fontSize: 13, color: '#666666', marginBottom: 4 }}>수량</Text>
                              <TextInput
                                value={editForm.quantity}
                                onChangeText={(text) => setEditForm({ ...editForm, quantity: text })}
                                keyboardType="numeric"
                                style={{
                                  backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e0e0e0',
                                  borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 16, color: '#1B365D',
                                }}
                              />
                            </View>
                            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                              <TouchableOpacity
                                onPress={handleSaveEdit}
                                style={{ flex: 1, backgroundColor: '#1B365D', paddingVertical: 10, borderRadius: 8 }}
                              >
                                <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '600', fontSize: 15 }}>저장</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={handleCancelEdit}
                                style={{ flex: 1, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e0e0e0', paddingVertical: 10, borderRadius: 8 }}
                              >
                                <Text style={{ color: '#1B365D', textAlign: 'center', fontWeight: '600', fontSize: 15 }}>취소</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      );
                    }

                    return (
                      <View
                        key={item.id}
                        style={{
                          flexDirection: 'row', alignItems: 'center',
                          paddingVertical: 14, paddingHorizontal: 12,
                          borderBottomWidth: (isLastGroup && isLastInGroup) ? 0 : 1,
                          borderBottomColor: '#e0e0e0',
                          backgroundColor: '#ffffff',
                        }}
                      >
                        {/* 시간 — 그룹 첫 행에만 표시 */}
                        <View style={{ width: 80 }}>
                          {isFirstInGroup && (
                            <Text style={{ fontSize: 16, color: '#1B365D', textAlign: 'left' }}>
                              {formatTime(item.createdAt)}
                            </Text>
                          )}
                        </View>

                        {/* 거래처 — 그룹 첫 행에만 표시 */}
                        <View style={{ width: 100 }}>
                          {isFirstInGroup && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Text style={{ fontSize: 17, fontWeight: '700', color: '#1B365D', textAlign: 'left' }} numberOfLines={1}>
                                {item.customerName || '-'}
                              </Text>
                              {item.quantity < 0 && (
                                <View style={{ backgroundColor: '#e74c3c', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>반품</Text>
                                </View>
                              )}
                              {pendingLocalIds.has(item.id) && (
                                <View style={{ backgroundColor: '#F59E0B', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>동기화 대기</Text>
                                </View>
                              )}
                            </View>
                          )}
                        </View>

                        {/* 품목 */}
                        <View style={{ width: 150 }}>
                          <Text style={{ fontSize: 16, color: '#1B365D', textAlign: 'left' }} numberOfLines={1}>
                            {item.productName || '-'}
                          </Text>
                        </View>

                        {/* 수량 */}
                        <View style={{ width: 70, alignItems: 'center' }}>
                          <Text style={{ fontSize: 16, fontWeight: '700', color: '#1B365D', textAlign: 'center' }}>
                            {item.quantity}
                          </Text>
                        </View>

                        {/* 관리 버튼 — 그룹 첫 행에만 표시 */}
                        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 6 }}>
                          {isFirstInGroup && (
                            <>
                              <TouchableOpacity
                                onPress={() => handleEdit(item)}
                                style={{
                                  borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 6,
                                  paddingHorizontal: 10, paddingVertical: 5,
                                }}
                              >
                                <Text style={{ fontSize: 14, color: '#666666' }}>수정</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => handleDelete(item.id)}
                                style={{
                                  borderWidth: 1, borderColor: '#fdd', borderRadius: 6,
                                  paddingHorizontal: 10, paddingVertical: 5,
                                }}
                              >
                                <Text style={{ fontSize: 14, color: '#e74c3c' }}>삭제</Text>
                              </TouchableOpacity>
                            </>
                          )}
                        </View>
                      </View>
                    );
                  })
                ))
              )}
            </View>
          )}
        </ScrollView>
      </ResponsiveContainer>
    </ScreenContainer>
  );
}
