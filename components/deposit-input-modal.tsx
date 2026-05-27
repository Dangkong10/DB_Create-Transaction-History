/**
 * 입금 입력 모달 — 미수금 누적 시스템
 *
 * 명세서: docs/design_미수금시스템.html §5
 *
 * 흐름:
 *   1. 모달 열림 → getPendingCustomers()로 미수 거래처 로드
 *   2. 거래처별: [현재 미수금 표시] · [입금받은 금액 입력] · [전액 입금 버튼]
 *   3. [저장]:
 *      - 입력값 > 0 인 거래처만 저장 대상
 *      - 입력값 > 현재미수금 인 거래처가 있으면 Q1 경고 → 확인 시 저장
 *      - 음수 미수금 허용 (선입금/환불 케이스)
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useConfirm } from '@/lib/confirm-provider';
import {
  getPendingCustomersAsOfDate,
  savePayments,
  type PendingCustomerRow,
  type PaymentInput,
} from '@/lib/payments';
import { AdjustmentModal } from './adjustment-modal';

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

// ==================== 컴포넌트 ====================

interface Props {
  visible: boolean;
  onClose: () => void;
  /** 저장 성공 시 호출 (영수증 페이지의 카운트 갱신용) */
  onSaved?: () => void;
}

export function DepositInputModal({ visible, onClose, onSaved }: Props) {
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  /** 사용자가 인풋·"어제"·"오늘" 버튼으로 *편집 중*인 날짜 */
  const [paymentDate, setPaymentDate] = useState<string>(yesterdayStr());
  /**
   * 실제로 미수금 계산에 *적용된* 날짜 (= 헤더 "~ {effectiveDate}" 의 기준).
   * 모달 열림 시 yesterdayStr() 로 초기화되고, 그 외에는 [확인] 클릭 시에만 갱신.
   */
  const [effectiveDate, setEffectiveDate] = useState<string>(yesterdayStr());
  const [pendingRows, setPendingRows] = useState<PendingCustomerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  /** key=customerName, value=문자열 입력 (빈 문자열이면 미입력) */
  const [inputs, setInputs] = useState<Record<string, string>>({});
  /** [전액] 버튼 클릭한 거래처 — 시각 피드백용 */
  const [fullClicked, setFullClicked] = useState<Set<string>>(new Set());
  /** 조정 모달 — 현재 조정 중인 거래처 (null이면 닫힘) */
  const [adjustingRow, setAdjustingRow] = useState<PendingCustomerRow | null>(null);

  /** 미수 거래처 재로드 — 조정 후 미수금 갱신용. effectiveDate 기준. */
  const reloadPending = useCallback(async () => {
    try {
      const rows = await getPendingCustomersAsOfDate(effectiveDate);
      setPendingRows(rows);
    } catch (err) {
      console.error('[DepositInputModal] reload error:', err);
    }
  }, [effectiveDate]);

  // showToast 를 effect deps 에서 빼기 위해 ref 로 latest 참조.
  // — context provider 의 value object 가 매 렌더마다 새로 만들어지는 경우에도
  //   effect 재실행을 막아 모달 열림 직후 잦은 reload 를 방지.
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  /** 모달 열릴 때 1회만 미수 거래처 로드 + 상태 초기화 */
  useEffect(() => {
    if (!visible) return;

    const initial = yesterdayStr();
    setPaymentDate(initial);
    setEffectiveDate(initial);
    setInputs({});
    setFullClicked(new Set());
    setLoading(true);

    getPendingCustomersAsOfDate(initial)
      .then((rows: PendingCustomerRow[]) => setPendingRows(rows))
      .catch((err: any) => {
        console.error('[DepositInputModal] load error:', err);
        showToastRef.current(`미수 거래처 로드 실패: ${err.message ?? err}`, 'error');
        setPendingRows([]);
      })
      .finally(() => setLoading(false));
  }, [visible]);

  // ===== 핸들러 =====

  const handleQuickDate = useCallback((preset: 'yesterday' | 'today') => {
    setPaymentDate(preset === 'yesterday' ? yesterdayStr() : todayStr());
  }, []);

  /** [확인] 버튼 — paymentDate 를 effectiveDate 로 적용하고 그 시점의 미수금 재로드 */
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
      console.error('[DepositInputModal] apply date error:', err);
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
    // 숫자만 허용
    const cleaned = raw.replace(/[^0-9]/g, '');
    setInputs((prev) => ({ ...prev, [customerName]: cleaned }));
    setFullClicked((prev) => {
      if (!prev.has(customerName)) return prev;
      const next = new Set(prev);
      next.delete(customerName);
      return next;
    });
  }, []);

  /** 저장 — Q1 경고 + savePayments() */
  const handleSave = useCallback(async () => {
    // 1. 날짜 검증
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      showToast('입금 날짜 형식이 잘못되었습니다 (YYYY-MM-DD).', 'error');
      return;
    }
    if (paymentDate > todayStr()) {
      showToast('미래 날짜로는 입금을 입력할 수 없습니다.', 'error');
      return;
    }
    // 화면에 표시된 미수금(effectiveDate 기준)과 저장하려는 paymentDate 가 다르면
    // 사용자가 [확인] 을 누르지 않은 채 저장을 시도한 것 → 잔고 오인 방지.
    if (paymentDate !== effectiveDate) {
      showToast('입금 날짜를 바꾼 뒤 [확인] 을 먼저 눌러주세요.', 'error');
      return;
    }

    // 2. 저장 대상 추출 (입력값 > 0)
    const items: PaymentInput[] = [];
    const overflows: { name: string; amount: number; outstanding: number }[] = [];

    for (const row of pendingRows) {
      const raw = inputs[row.customerName] ?? '';
      const amount = parseAmount(raw);
      if (amount <= 0) continue;

      items.push({
        customerName: row.customerName,
        paymentDate,
        amount,
      });

      // Q1: 입력값 > 현재미수금
      if (amount > row.outstanding) {
        overflows.push({
          name: row.customerName,
          amount,
          outstanding: row.outstanding,
        });
      }
    }

    if (items.length === 0) {
      showToast('입력된 입금 금액이 없습니다.', 'info');
      return;
    }

    // 3. 실제 저장 함수 (Q1 확인 후 호출용)
    const doSave = async () => {
      try {
        setSaving(true);
        await savePayments(items);
        showToast(`${items.length}건 저장되었습니다.`, 'success');
        onSaved?.();
        onClose();
      } catch (err: any) {
        console.error('[DepositInputModal] save error:', err);
        showToast(`저장 실패: ${err.message ?? err}`, 'error');
      } finally {
        setSaving(false);
      }
    };

    // 4. Q1 경고 — 입력값 > 현재미수금 거래처 있으면
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
  }, [paymentDate, effectiveDate, pendingRows, inputs, showToast, showConfirm, onSaved, onClose]);

  // ===== 파생 =====

  const totalInput = useMemo(() => {
    let sum = 0;
    for (const row of pendingRows) {
      sum += parseAmount(inputs[row.customerName] ?? '');
    }
    return sum;
  }, [inputs, pendingRows]);

  // ===== 렌더 =====

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 16,
        }}
      >
        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 14,
            width: '100%',
            maxWidth: 640,
            maxHeight: '90%',
            overflow: 'hidden',
          }}
        >
          {/* 헤더 */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 20,
              paddingVertical: 16,
              backgroundColor: '#1B365D',
            }}
          >
            <Text style={{ fontSize: 18, marginRight: 8 }}>💰</Text>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: '#fff' }}>
              입금 입력
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: 'rgba(255,255,255,0.15)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 14, color: '#fff' }}>✕</Text>
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
            {/* [확인] — paymentDate 를 effectiveDate 로 적용. 미적용 상태에선 강조. */}
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
              <Text
                style={{
                  fontSize: 12,
                  color: '#fff',
                  fontWeight: '700',
                }}
              >
                확인
              </Text>
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

          {/* 본문 — rows 가 한 번이라도 들어왔으면 reload 중에도 ScrollView 유지하여
              스크롤 가용성이 끊기지 않도록 함. */}
          {pendingRows.length === 0 && loading ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <ActivityIndicator />
              <Text style={{ marginTop: 12, color: '#666' }}>미수 거래처 로딩 중...</Text>
            </View>
          ) : pendingRows.length === 0 ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, color: '#666' }}>
                정리할 미수가 없습니다.
              </Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 420 }}>
              {/* 재로드 중에도 ScrollView 유지 — 얇은 indicator 만 헤더 위에 표시 */}
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
                    <Text style={{ flex: 1.2, fontSize: 13, color: '#1B365D' }}>
                      {row.customerName}
                    </Text>
                    <Text
                      style={{
                        flex: 1.2,
                        fontSize: 13,
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
                        height: 32,
                        marginHorizontal: 6,
                        paddingHorizontal: 8,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: '#d1d5db',
                        backgroundColor: value ? '#ecfdf5' : '#fff',
                        fontSize: 13,
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

          {/* 조정 모달 (nested) — effectiveDate 기준으로 조정 저장 */}
          <AdjustmentModal
            visible={adjustingRow !== null}
            customerName={adjustingRow?.customerName ?? ''}
            currentOutstanding={adjustingRow?.outstanding ?? 0}
            adjustmentDate={effectiveDate}
            onClose={() => setAdjustingRow(null)}
            onSaved={() => {
              // 조정 저장 후 거래처 리스트 새로 로드 + 외부에도 알림 (카운트 갱신)
              void reloadPending();
              onSaved?.();
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
                <Text style={{ fontSize: 12, color: '#666' }}>입력 합계</Text>
                <Text
                  style={{
                    fontSize: 14,
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
                  paddingVertical: 12,
                  borderRadius: 8,
                  backgroundColor: totalInput === 0 ? '#cbd5e1' : '#1B365D',
                  alignItems: 'center',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>저장</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
