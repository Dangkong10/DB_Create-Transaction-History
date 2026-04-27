/**
 * 기간 집계 / 엑셀 내보내기 모달
 *
 * 기능:
 * - 시작일/종료일 선택 (직접 입력 + 빠른 선택 칩)
 * - 실시간 집계 (건수/거래처/누적 매출)
 * - 거래처 가나다순 체크박스 리스트 (개별 통계)
 * - 전체 선택/해제
 * - ERP 호환 엑셀 내보내기 (8컬럼)
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useToast } from '@/lib/toast-provider';
import { getLocalTransactions, pullFromServer } from '@/lib/sync-manager';
import { exportTransactionsToExcel, generateFileName } from '@/lib/export-transactions-excel';
import type { Transaction } from '@/lib/supabase';

const toLocalDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

type QuickRangeKey = 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'thisYear';

function getQuickRange(key: QuickRangeKey): { start: string; end: string } {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const dow = now.getDay();

  let start: Date;
  let end: Date;

  switch (key) {
    case 'thisWeek': {
      const mon = new Date(now);
      mon.setDate(d - (dow === 0 ? 6 : dow - 1));
      start = mon;
      end = new Date(mon);
      end.setDate(mon.getDate() + 6);
      break;
    }
    case 'lastWeek': {
      const thisMon = new Date(now);
      thisMon.setDate(d - (dow === 0 ? 6 : dow - 1));
      end = new Date(thisMon);
      end.setDate(thisMon.getDate() - 1);
      start = new Date(end);
      start.setDate(end.getDate() - 6);
      break;
    }
    case 'thisMonth':
      start = new Date(y, m, 1);
      end = new Date(y, m + 1, 0);
      break;
    case 'lastMonth':
      start = new Date(y, m - 1, 1);
      end = new Date(y, m, 0);
      break;
    case 'thisYear':
      start = new Date(y, 0, 1);
      end = new Date(y, 11, 31);
      break;
    default:
      start = now;
      end = now;
  }
  return { start: toLocalDateStr(start), end: toLocalDateStr(end) };
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function PeriodExportModal({ visible, onClose }: Props) {
  const { showToast } = useToast();

  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [activeQuick, setActiveQuick] = useState<QuickRangeKey | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 모달 오픈 시 기본값 = 이번 달 + 데이터 로드
  useEffect(() => {
    if (!visible) return;
    const { start, end } = getQuickRange('thisMonth');
    setStartDate(start);
    setEndDate(end);
    setActiveQuick('thisMonth');
    setSelected(new Set());
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const readFromLocal = async (): Promise<Transaction[]> => {
    const local = await getLocalTransactions();
    const mapped: Transaction[] = local.map((t) => ({
      id: t.serverId || `local-${t.localId}`,
      customerName: t.customerName,
      productName: t.productName,
      quantity: t.quantity,
      unitPrice: t.unitPrice,
      date: t.date,
      createdAt: t.createdAt,
    }));
    const seen = new Set<string>();
    return mapped.filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // 1) 로컬 즉시 표시 (pending 항목까지 포함)
      setAllTransactions(await readFromLocal());

      // 2) 온라인이면 pullFromServer 가 로컬 IDB 에 머지하므로 다시 로컬을 읽음.
      //    이렇게 해야 아직 syncQueue 에서 처리 중인 pending 항목이 집계에서 빠지지 않음.
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          await pullFromServer();
          setAllTransactions(await readFromLocal());
        } catch (err) {
          console.warn('서버 동기화 실패, 로컬 데이터 사용:', err);
        }
      }
    } catch (err) {
      console.error('거래 내역 조회 실패:', err);
      showToast('데이터 로드 실패', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 기간 내 거래 필터
  const inRange = useMemo(() => {
    if (!startDate || !endDate) return [];
    return allTransactions.filter((t) => {
      const d = (t.date || '').slice(0, 10);
      return d >= startDate && d <= endDate;
    });
  }, [allTransactions, startDate, endDate]);

  // 유효성 검사
  const dateError = startDate && endDate && startDate > endDate;

  // 거래처별 통계 (가나다순)
  const customerStats = useMemo(() => {
    const map = new Map<string, { name: string; count: number; total: number }>();
    for (const t of inRange) {
      const name = t.customerName;
      const existing = map.get(name) || { name, count: 0, total: 0 };
      existing.count += 1;
      existing.total += Math.abs(t.quantity) * (t.unitPrice || 0);
      map.set(name, existing);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'));
  }, [inRange]);

  // 전체 집계
  const summary = useMemo(() => {
    const count = inRange.length;
    const customers = customerStats.length;
    const revenue = inRange.reduce(
      (sum, t) => sum + Math.abs(t.quantity) * (t.unitPrice || 0),
      0,
    );
    return { count, customers, revenue };
  }, [inRange, customerStats]);

  // 선택 집계
  const selectedSummary = useMemo(() => {
    if (selected.size === 0) return null;
    let count = 0;
    let revenue = 0;
    for (const t of inRange) {
      if (selected.has(t.customerName)) {
        count += 1;
        revenue += Math.abs(t.quantity) * (t.unitPrice || 0);
      }
    }
    return { count, revenue, customerCount: selected.size };
  }, [inRange, selected]);

  // 핸들러
  const applyQuick = (key: QuickRangeKey) => {
    const { start, end } = getQuickRange(key);
    setStartDate(start);
    setEndDate(end);
    setActiveQuick(key);
  };

  const toggleCustomer = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(customerStats.map((c) => c.name)));
  const clearAll = () => setSelected(new Set());

  const handleExport = async () => {
    if (dateError) {
      showToast('종료일이 시작일보다 앞에 있습니다.', 'error');
      return;
    }
    if (inRange.length === 0) {
      showToast('선택한 기간에 거래 내역이 없습니다.', 'error');
      return;
    }
    setExporting(true);
    try {
      const result = await exportTransactionsToExcel({
        transactions: inRange,
        startDate,
        endDate,
        selectedCustomers: selected,
      });
      showToast(`엑셀 다운로드 완료 (${result.rowCount}건)`, 'success');
      onClose();
    } catch (err: any) {
      showToast(err?.message || '엑셀 생성 실패', 'error');
    } finally {
      setExporting(false);
    }
  };

  // 예상 파일명
  const previewFileName = useMemo(() => {
    if (!startDate || !endDate) return '';
    return generateFileName(startDate, endDate, selected, customerStats.length);
  }, [startDate, endDate, selected, customerStats]);

  // 버튼 라벨
  const buttonLabel = useMemo(() => {
    if (selected.size === 0) {
      return `⬇️ 전체 내보내기 (${summary.count}건)`;
    }
    return `⬇️ 선택 ${selected.size}곳 내보내기 (${selectedSummary?.count || 0}건)`;
  }, [selected, summary, selectedSummary]);

  const formatWon = (n: number) => `${n.toLocaleString('ko-KR')}원`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{
        flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center', alignItems: 'center', padding: 16,
      }}>
        <View style={{
          backgroundColor: '#fff', borderRadius: 14, width: '100%', maxWidth: 560,
          maxHeight: '90%', overflow: 'hidden',
        }}>
          {/* 헤더 */}
          <View style={{
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            paddingHorizontal: 20, paddingVertical: 16,
            borderBottomWidth: 1, borderBottomColor: '#e0e0e0',
          }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#1B365D' }}>
              📊 기간 집계 / 내보내기
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={{
                width: 30, height: 30, borderRadius: 15, backgroundColor: '#f0f0f0',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 14, color: '#1B365D' }}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ padding: 20 }}>
            {/* 기간 설정 */}
            <Text style={{ fontSize: 12, fontWeight: '500', color: '#666', marginBottom: 8 }}>
              📅 기간 설정
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Text style={{ fontSize: 13, color: '#666', width: 50 }}>시작일</Text>
              <TextInput
                value={startDate}
                onChangeText={(v) => { setStartDate(v); setActiveQuick(null); }}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#999"
                style={{
                  flex: 1, height: 40, paddingHorizontal: 12, borderRadius: 8,
                  borderWidth: 1, borderColor: '#e0e0e0', fontSize: 14, color: '#1B365D',
                }}
              />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Text style={{ fontSize: 13, color: '#666', width: 50 }}>종료일</Text>
              <TextInput
                value={endDate}
                onChangeText={(v) => { setEndDate(v); setActiveQuick(null); }}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#999"
                style={{
                  flex: 1, height: 40, paddingHorizontal: 12, borderRadius: 8,
                  borderWidth: dateError ? 2 : 1,
                  borderColor: dateError ? '#e74c3c' : '#e0e0e0',
                  fontSize: 14, color: '#1B365D',
                }}
              />
            </View>

            {dateError && (
              <Text style={{ fontSize: 12, color: '#e74c3c', marginBottom: 8 }}>
                종료일이 시작일보다 앞에 있습니다
              </Text>
            )}

            {/* 빠른 선택 칩 */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {([
                { key: 'thisWeek', label: '이번 주' },
                { key: 'lastWeek', label: '지난 주' },
                { key: 'thisMonth', label: '이번 달' },
                { key: 'lastMonth', label: '지난 달' },
                { key: 'thisYear', label: '올해' },
              ] as { key: QuickRangeKey; label: string }[]).map((chip) => {
                const active = activeQuick === chip.key;
                return (
                  <TouchableOpacity
                    key={chip.key}
                    onPress={() => applyQuick(chip.key)}
                    style={{
                      paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16,
                      backgroundColor: active ? '#1B365D' : '#EDF1F7',
                    }}
                  >
                    <Text style={{
                      fontSize: 12, fontWeight: '500',
                      color: active ? '#fff' : '#1B365D',
                    }}>{chip.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 집계 카드 */}
            {loading ? (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#1B365D" />
                <Text style={{ fontSize: 12, color: '#666', marginTop: 8 }}>불러오는 중...</Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                <View style={{
                  flex: 1, backgroundColor: '#EDF1F7', borderRadius: 10,
                  padding: 10, alignItems: 'center',
                }}>
                  <Text style={{ fontSize: 10, color: '#666', marginBottom: 2 }}>거래 건수</Text>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#1B365D' }}>
                    {summary.count}건
                  </Text>
                </View>
                <View style={{
                  flex: 1, backgroundColor: '#EDF1F7', borderRadius: 10,
                  padding: 10, alignItems: 'center',
                }}>
                  <Text style={{ fontSize: 10, color: '#666', marginBottom: 2 }}>거래처 수</Text>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#1B365D' }}>
                    {summary.customers}명
                  </Text>
                </View>
                <View style={{
                  flex: 1.2, backgroundColor: '#1B365D', borderRadius: 10,
                  padding: 10, alignItems: 'center',
                }}>
                  <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginBottom: 2 }}>
                    누적 매출 ⭐
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>
                    {summary.revenue.toLocaleString('ko-KR')}원
                  </Text>
                </View>
              </View>
            )}

            {/* 거래처 선택 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '500', color: '#666' }}>
                🏢 거래처 선택 (가나다순)
              </Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity
                  onPress={selectAll}
                  style={{
                    paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6,
                    backgroundColor: '#EDF1F7',
                  }}
                >
                  <Text style={{ fontSize: 11, color: '#1B365D', fontWeight: '500' }}>☑ 전체선택</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={clearAll}
                  style={{
                    paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6,
                    backgroundColor: '#f0f0f0',
                  }}
                >
                  <Text style={{ fontSize: 11, color: '#666', fontWeight: '500' }}>☐ 전체해제</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{
              borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8,
              maxHeight: 240, marginBottom: 12, overflow: 'hidden',
            }}>
              <ScrollView nestedScrollEnabled>
                {customerStats.length === 0 ? (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, color: '#999' }}>거래 내역 없음</Text>
                  </View>
                ) : (
                  customerStats.map((c, idx) => {
                    const checked = selected.has(c.name);
                    return (
                      <TouchableOpacity
                        key={c.name}
                        onPress={() => toggleCustomer(c.name)}
                        activeOpacity={0.7}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 10,
                          paddingVertical: 10, paddingHorizontal: 12,
                          backgroundColor: checked ? '#EDF1F7' : '#fff',
                          borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: '#f0f0f0',
                        }}
                      >
                        <View style={{
                          width: 20, height: 20, borderRadius: 4,
                          borderWidth: 1.5, borderColor: checked ? '#1B365D' : '#999',
                          backgroundColor: checked ? '#1B365D' : '#fff',
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          {checked && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text>}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, color: '#1B365D', fontWeight: '500' }}>
                            {c.name}
                          </Text>
                          <Text style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                            {c.count}건 · {formatWon(c.total)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            </View>

            {/* 선택 상태 표시 */}
            {selectedSummary && (
              <View style={{
                backgroundColor: '#fffbe6', borderRadius: 8,
                padding: 10, marginBottom: 12,
              }}>
                <Text style={{ fontSize: 12, color: '#885c00' }}>
                  ✓ 선택 {selectedSummary.customerCount}곳 · {selectedSummary.count}건 · {formatWon(selectedSummary.revenue)}
                </Text>
              </View>
            )}

            {/* 파일명 미리보기 */}
            {previewFileName && (
              <View style={{ marginBottom: 4 }}>
                <Text style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>📄 파일명</Text>
                <View style={{
                  backgroundColor: '#f5f5f5', borderRadius: 6,
                  paddingHorizontal: 10, paddingVertical: 8,
                }}>
                  <Text style={{ fontSize: 11, color: '#1B365D', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
                    {previewFileName}
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* 푸터 */}
          <View style={{
            flexDirection: 'row', gap: 8,
            paddingHorizontal: 20, paddingVertical: 14,
            borderTopWidth: 1, borderTopColor: '#e0e0e0',
          }}>
            <TouchableOpacity
              onPress={onClose}
              style={{
                flex: 1, paddingVertical: 12, borderRadius: 8,
                borderWidth: 1, borderColor: '#1B365D', alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#1B365D' }}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleExport}
              disabled={exporting || loading || !!dateError || summary.count === 0}
              style={{
                flex: 2, paddingVertical: 12, borderRadius: 8,
                backgroundColor: '#1B365D', alignItems: 'center',
                flexDirection: 'row', justifyContent: 'center', gap: 6,
                opacity: (exporting || loading || !!dateError || summary.count === 0) ? 0.5 : 1,
              }}
            >
              {exporting ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>생성 중...</Text>
                </>
              ) : (
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>{buttonLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
