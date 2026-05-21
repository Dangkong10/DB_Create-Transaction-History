/**
 * 입금 입력 (전체화면)
 *
 * 이전: components/deposit-input-modal.tsx (Modal 형태)
 * 변경 이유: 입금 기록 보관함(/deposit/history)으로 가는 통로를 자연스럽게 두기 위해
 *           모달 → 전체화면 페이지로 승격.
 *
 * 흐름: receipt 페이지 "입금 입력" 카드 → router.push('/deposit') → 이 페이지.
 *      저장/취소 시 router.back()으로 영수증 복귀.
 *      "기록보관함" 버튼 → router.push('/deposit/history').
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { ResponsiveContainer } from '@/components/responsive-container';
import { useToast } from '@/lib/toast-provider';
import { useConfirm } from '@/lib/confirm-provider';
import {
  getPendingCustomersAsOfDate,
  savePayments,
  type PendingCustomerRow,
  type PaymentInput,
} from '@/lib/payments';
import { AdjustmentModal } from '@/components/adjustment-modal';

// ==================== 유틸 ====================

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toLocalDateStr(d);
}

function todayStr(): string {
  return toLocalDateStr(new Date());
}

function formatNumber(n: number): string {
  return n.toLocaleString('ko-KR');
}

function parseAmount(str: string): number {
  const n = parseInt(str.replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

// ==================== 페이지 ====================

export default function DepositInputScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  const [paymentDate, setPaymentDate] = useState<string>(yesterdayStr());
  const [effectiveDate, setEffectiveDate] = useState<string>(yesterdayStr());
  const [pendingRows, setPendingRows] = useState<PendingCustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [fullClicked, setFullClicked] = useState<Set<string>>(new Set());
  const [adjustingRow, setAdjustingRow] = useState<PendingCustomerRow | null>(null);

  // showToast 를 effect deps 에서 빼기 위해 ref 로 latest 참조
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  /** effectiveDate 기준으로 미수 거래처 재로드 */
  const reloadPending = useCallback(async () => {
    try {
      const rows = await getPendingCustomersAsOfDate(effectiveDate);
      setPendingRows(rows);
    } catch (err) {
      console.error('[DepositInputScreen] reload error:', err);
    }
  }, [effectiveDate]);

  /** 초기 로드 (mount 시 1회) */
  useEffect(() => {
    const initial = yesterdayStr();
    setPaymentDate(initial);
    setEffectiveDate(initial);
    setLoading(true);

    getPendingCustomersAsOfDate(initial)
      .then((rows) => setPendingRows(rows))
      .catch((err: any) => {
        console.error('[DepositInputScreen] load error:', err);
        showToastRef.current(`미수 거래처 로드 실패: ${err.message ?? err}`, 'error');
        setPendingRows([]);
      })
      .finally(() => setLoading(false));
  }, []);

  // ===== 핸들러 =====

  const handleQuickDate = useCallback((preset: 'yesterday' | 'today') => {
    setPaymentDate(preset === 'yesterday' ? yesterdayStr() : todayStr());
  }, []);

  /** [확인] — paymentDate 를 effectiveDate 로 적용 후 미수금 재로드 */
  const handleApplyDate = useCallback(async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      showToast('날짜 형식이 잘못되었습니다 (YYYY-MM-DD).', 'error');
      return;
    }
    if (paymentDate > todayStr()) {
      showToast('미래 날짜는 선택할 수 없습니다.', 'error');
      return;
    }
    setLoading(true);
    try {
      const rows = await getPendingCustomersAsOfDate(paymentDate);
      setPendingRows(rows);
      setEffectiveDate(paymentDate);
      setInputs({});
      setFullClicked(new Set());
    } catch (err: any) {
      console.error('[DepositInputScreen] apply date error:', err);
      showToast(`미수 거래처 로드 실패: ${err.message ?? err}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [paymentDate, showToast]);

  const handleFullPayment = useCallback(
    (customerName: string, outstanding: number) => {
      setInputs((prev) => ({ ...prev, [customerName]: String(outstanding) }));
      setFullClicked((prev) => {
        const next = new Set(prev);
        next.add(customerName);
        return next;
      });
    },
    [],
  );

  const handleInputChange = useCallback((customerName: string, raw: string) => {
    const cleaned = raw.replace(/[^0-9]/g, '');
    setInputs((prev) => ({ ...prev, [customerName]: cleaned }));
    setFullClicked((prev) => {
      if (!prev.has(customerName)) return prev;
      const next = new Set(prev);
      next.delete(customerName);
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      showToast('입금 날짜 형식이 잘못되었습니다 (YYYY-MM-DD).', 'error');
      return;
    }
    if (paymentDate > todayStr()) {
      showToast('미래 날짜로는 입금을 입력할 수 없습니다.', 'error');
      return;
    }
    if (paymentDate !== effectiveDate) {
      showToast('입금 날짜를 바꾼 뒤 [확인] 을 먼저 눌러주세요.', 'error');
      return;
    }

    const items: PaymentInput[] = [];
    const overflows: { name: string; amount: number; outstanding: number }[] = [];

    for (const row of pendingRows) {
      const raw = inputs[row.customerName] ?? '';
      const amount = parseAmount(raw);
      if (amount <= 0) continue;
      items.push({ customerName: row.customerName, paymentDate, amount });
      if (amount > row.outstanding) {
        overflows.push({ name: row.customerName, amount, outstanding: row.outstanding });
      }
    }

    if (items.length === 0) {
      showToast('입력된 입금 금액이 없습니다.', 'info');
      return;
    }

    const doSave = async () => {
      try {
        setSaving(true);
        await savePayments(items);
        showToast(`${items.length}건 저장되었습니다.`, 'success');
        router.back();
      } catch (err: any) {
        console.error('[DepositInputScreen] save error:', err);
        showToast(`저장 실패: ${err.message ?? err}`, 'error');
      } finally {
        setSaving(false);
      }
    };

    if (overflows.length > 0) {
      const lines = overflows
        .map(
          (o) =>
            `· ${o.name}: 미수 ${formatNumber(o.outstanding)}원, 입력 ${formatNumber(o.amount)}원`,
        )
        .join('\n');
      showConfirm({
        title: '미수금보다 큰 금액',
        message:
          `다음 거래처의 입력 금액이 현재 미수금보다 큽니다:\n\n${lines}\n\n` +
          `정말 저장하시겠습니까? (선입금으로 처리됩니다)`,
        confirmText: '저장',
        cancelText: '취소',
        onConfirm: () => {
          void doSave();
        },
      });
    } else {
      await doSave();
    }
  }, [paymentDate, effectiveDate, pendingRows, inputs, showToast, showConfirm, router]);

  const totalInput = useMemo(() => {
    let sum = 0;
    for (const row of pendingRows) {
      sum += parseAmount(inputs[row.customerName] ?? '');
    }
    return sum;
  }, [inputs, pendingRows]);

  // ===== 렌더 =====

  return (
    <ScreenContainer style={{ backgroundColor: '#f5f5f5' }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ResponsiveContainer className="flex-1">
        <View style={{ flex: 1 }}>
          {/* 헤더 — 뒤로가기 + 타이틀 + 보관함 진입 */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 14,
              backgroundColor: '#1B365D',
              gap: 8,
            }}
          >
            <TouchableOpacity
              onPress={() => router.back()}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: 'rgba(255,255,255,0.15)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 16, color: '#fff', fontWeight: '700' }}>←</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 18, marginRight: 4 }}>💰</Text>
            <Text style={{ flex: 1, fontSize: 17, fontWeight: '700', color: '#fff' }}>
              입금 입력
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/deposit/history')}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 8,
                backgroundColor: 'rgba(255,255,255,0.15)',
              }}
            >
              <Text style={{ fontSize: 13, color: '#fff', fontWeight: '600' }}>
                📂 기록보관함
              </Text>
            </TouchableOpacity>
          </View>

          {/* 날짜 입력 행 */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 20,
              paddingVertical: 14,
              backgroundColor: '#fffbe6',
              borderBottomWidth: 1,
              borderBottomColor: '#fde68a',
              flexWrap: 'wrap',
            }}
          >
            <Text style={{ fontSize: 13, color: '#92400e', fontWeight: '600' }}>
              입금 날짜:
            </Text>
            <TextInput
              value={paymentDate}
              onChangeText={setPaymentDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#999"
              style={{
                width: 130,
                height: 36,
                paddingHorizontal: 10,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: '#fde68a',
                backgroundColor: '#fff',
                fontSize: 13,
                color: '#1B365D',
                ...(Platform.OS === 'web' ? ({ fontFamily: 'monospace' } as any) : {}),
              }}
            />
            <TouchableOpacity
              onPress={() => handleQuickDate('yesterday')}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 6,
                backgroundColor: paymentDate === yesterdayStr() ? '#f59e0b' : '#fff',
                borderWidth: 1,
                borderColor: '#fde68a',
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: paymentDate === yesterdayStr() ? '#fff' : '#92400e',
                  fontWeight: '600',
                }}
              >
                어제
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleQuickDate('today')}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 6,
                backgroundColor: paymentDate === todayStr() ? '#f59e0b' : '#fff',
                borderWidth: 1,
                borderColor: '#fde68a',
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: paymentDate === todayStr() ? '#fff' : '#92400e',
                  fontWeight: '600',
                }}
              >
                오늘
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleApplyDate}
              disabled={paymentDate === effectiveDate || loading}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 6,
                backgroundColor:
                  paymentDate === effectiveDate ? '#cbd5e1' : '#1B365D',
                borderWidth: 1,
                borderColor:
                  paymentDate === effectiveDate ? '#cbd5e1' : '#1B365D',
                opacity: loading ? 0.6 : 1,
              }}
            >
              <Text style={{ fontSize: 12, color: '#fff', fontWeight: '700' }}>확인</Text>
            </TouchableOpacity>
            <Text
              style={{
                marginLeft: 'auto',
                fontSize: 11,
                color: '#94a3b8',
              }}
            >
              기본값: 어제
            </Text>
          </View>

          {/* 본문 */}
          {pendingRows.length === 0 && loading ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <ActivityIndicator />
              <Text style={{ marginTop: 12, color: '#666' }}>미수 거래처 로딩 중...</Text>
            </View>
          ) : pendingRows.length === 0 ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, color: '#666' }}>정리할 미수가 없습니다.</Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }}>
              {loading && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    paddingVertical: 6,
                    backgroundColor: '#eff6ff',
                    borderBottomWidth: 1,
                    borderBottomColor: '#dbeafe',
                  }}
                >
                  <ActivityIndicator size="small" />
                  <Text style={{ fontSize: 11, color: '#1e40af' }}>갱신 중...</Text>
                </View>
              )}

              {/* 테이블 헤더 */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  backgroundColor: '#f9fafb',
                  borderBottomWidth: 1,
                  borderBottomColor: '#e5e7eb',
                }}
              >
                <Text style={{ flex: 1.2, fontSize: 11, fontWeight: '700', color: '#4b5563' }}>
                  거래처
                </Text>
                <Text
                  style={{
                    flex: 1.2,
                    fontSize: 11,
                    fontWeight: '700',
                    color: '#4b5563',
                    textAlign: 'right',
                  }}
                >
                  ~ {effectiveDate}
                </Text>
                <Text
                  style={{
                    flex: 1.6,
                    fontSize: 11,
                    fontWeight: '700',
                    color: '#4b5563',
                    textAlign: 'right',
                    paddingRight: 8,
                  }}
                >
                  입금받은 금액
                </Text>
                <View style={{ width: 60 }} />
                <View style={{ width: 60 }} />
              </View>

              {/* 거래처 행 */}
              {pendingRows.map((row) => {
                const value = inputs[row.customerName] ?? '';
                const isFull = fullClicked.has(row.customerName);
                return (
                  <View
                    key={row.customerName}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderBottomWidth: 1,
                      borderBottomColor: '#f1f5f9',
                    }}
                  >
                    <Text style={{ flex: 1.2, fontSize: 14, color: '#1B365D' }}>
                      {row.customerName}
                    </Text>
                    <Text
                      style={{
                        flex: 1.2,
                        fontSize: 14,
                        color: '#1B365D',
                        textAlign: 'right',
                        ...(Platform.OS === 'web' ? ({ fontFamily: 'monospace' } as any) : {}),
                      }}
                    >
                      {formatNumber(row.outstanding)}
                    </Text>
                    <TextInput
                      value={value ? formatNumber(parseAmount(value)) : ''}
                      onChangeText={(v) => handleInputChange(row.customerName, v)}
                      placeholder="0"
                      placeholderTextColor="#cbd5e1"
                      keyboardType="numeric"
                      style={{
                        flex: 1.6,
                        height: 36,
                        marginHorizontal: 6,
                        paddingHorizontal: 8,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: '#d1d5db',
                        backgroundColor: value ? '#ecfdf5' : '#fff',
                        fontSize: 14,
                        color: '#1B365D',
                        textAlign: 'right',
                        ...(Platform.OS === 'web' ? ({ fontFamily: 'monospace' } as any) : {}),
                      }}
                    />
                    <TouchableOpacity
                      onPress={() => handleFullPayment(row.customerName, row.outstanding)}
                      style={{
                        width: 60,
                        paddingVertical: 6,
                        borderRadius: 6,
                        backgroundColor: isFull ? '#16a34a' : '#f59e0b',
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 11, color: '#fff', fontWeight: '700' }}>
                        {isFull ? '✓ 전액' : '전액'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setAdjustingRow(row)}
                      style={{
                        width: 60,
                        marginLeft: 4,
                        paddingVertical: 6,
                        borderRadius: 6,
                        backgroundColor: '#7c3aed',
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 11, color: '#fff', fontWeight: '700' }}>조정</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {/* 조정 모달 (nested) */}
          <AdjustmentModal
            visible={adjustingRow !== null}
            customerName={adjustingRow?.customerName ?? ''}
            currentOutstanding={adjustingRow?.outstanding ?? 0}
            adjustmentDate={effectiveDate}
            onClose={() => setAdjustingRow(null)}
            onSaved={() => {
              void reloadPending();
            }}
          />

          {/* 저장 영역 */}
          {pendingRows.length > 0 && (
            <View
              style={{
                paddingHorizontal: 20,
                paddingVertical: 14,
                borderTopWidth: 1,
                borderTopColor: '#e5e7eb',
                backgroundColor: '#fafbfc',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                }}
              >
                <Text style={{ fontSize: 13, color: '#666' }}>입력 합계</Text>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: '700',
                    color: '#1B365D',
                    ...(Platform.OS === 'web' ? ({ fontFamily: 'monospace' } as any) : {}),
                  }}
                >
                  {formatNumber(totalInput)}원
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving || totalInput === 0}
                style={{
                  paddingVertical: 14,
                  borderRadius: 8,
                  backgroundColor: totalInput === 0 ? '#cbd5e1' : '#1B365D',
                  alignItems: 'center',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>저장</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ResponsiveContainer>
    </ScreenContainer>
  );
}
