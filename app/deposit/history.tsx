/**
 * 입금 / 조정 기록 보관함 (전체화면)
 *
 * 상단 탭으로 두 종류 분리:
 *   · 입금  — payments 테이블 (양수만)
 *   · 조정  — adjustments 테이블 (±, 0 금지)
 *
 * 각 행마다 수정/삭제. 검색은 거래처명/날짜로 동작.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { ResponsiveContainer } from '@/components/responsive-container';
import { useToast } from '@/lib/toast-provider';
import { useConfirm } from '@/lib/confirm-provider';
import {
  getAllPayments,
  updatePayment,
  deletePayment,
  type Payment,
  getAllAdjustments,
  updateAdjustment,
  deleteAdjustment,
  type Adjustment,
} from '@/lib/payments';

type TabKey = 'payment' | 'adjustment';

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString('ko-KR');
}

function formatSigned(n: number): string {
  return (n > 0 ? '+' : '') + formatNumber(n);
}

function parseAmountAllowNegative(str: string): number {
  const cleaned = str.replace(/[^0-9-]/g, '');
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : 0;
}

function parseAmountPositive(str: string): number {
  const n = parseInt(str.replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

// ==================== 입금 수정 모달 ====================

interface EditPaymentProps {
  payment: Payment | null;
  onClose: () => void;
  onSaved: () => void;
}

function EditPaymentModal({ payment, onClose, onSaved }: EditPaymentProps) {
  const { showToast } = useToast();
  const [customerName, setCustomerName] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!payment) return;
    setCustomerName(payment.customerName);
    setPaymentDate(payment.paymentDate);
    setAmount(String(payment.amount));
    setSaving(false);
  }, [payment]);

  const handleSave = useCallback(async () => {
    if (!payment) return;
    const newAmount = parseAmountPositive(amount);
    if (newAmount <= 0) {
      showToast('금액은 양의 정수여야 합니다.', 'error');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      showToast('날짜 형식이 잘못되었습니다 (YYYY-MM-DD).', 'error');
      return;
    }
    if (paymentDate > todayStr()) {
      showToast('미래 날짜로는 수정할 수 없습니다.', 'error');
      return;
    }
    if (!customerName.trim()) {
      showToast('거래처명이 비어있습니다.', 'error');
      return;
    }

    try {
      setSaving(true);
      await updatePayment(payment.id, {
        customerName: customerName.trim(),
        paymentDate,
        amount: newAmount,
      });
      showToast('입금 기록이 수정되었습니다.', 'success');
      onSaved();
      onClose();
    } catch (err: any) {
      console.error('[EditPaymentModal] save error:', err);
      showToast(`수정 실패: ${err.message ?? err}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [payment, customerName, paymentDate, amount, showToast, onSaved, onClose]);

  return (
    <RecordEditModal
      visible={payment !== null}
      title="✏️ 입금 기록 수정"
      headerColor="#1B365D"
      onClose={onClose}
      saving={saving}
      onSave={handleSave}
      fields={
        <>
          <LabeledTextInput label="거래처" value={customerName} onChangeText={setCustomerName} />
          <LabeledTextInput
            label="입금 날짜"
            value={paymentDate}
            onChangeText={setPaymentDate}
            placeholder="YYYY-MM-DD"
            mono
          />
          <LabeledTextInput
            label="금액 (원)"
            value={amount ? formatNumber(parseAmountPositive(amount)) : ''}
            onChangeText={(v) => setAmount(v.replace(/[^0-9]/g, ''))}
            placeholder="0"
            keyboardType="numeric"
            mono
            alignRight
          />
        </>
      }
    />
  );
}

// ==================== 조정 수정 모달 ====================

interface EditAdjustmentProps {
  adjustment: Adjustment | null;
  onClose: () => void;
  onSaved: () => void;
}

function EditAdjustmentModal({ adjustment, onClose, onSaved }: EditAdjustmentProps) {
  const { showToast } = useToast();
  const [customerName, setCustomerName] = useState('');
  const [adjustmentDate, setAdjustmentDate] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!adjustment) return;
    setCustomerName(adjustment.customerName);
    setAdjustmentDate(adjustment.adjustmentDate);
    setAmount(String(adjustment.amount));
    setSaving(false);
  }, [adjustment]);

  const handleSave = useCallback(async () => {
    if (!adjustment) return;
    const newAmount = parseAmountAllowNegative(amount);
    if (!Number.isInteger(newAmount) || newAmount === 0) {
      showToast('조정액은 0이 아닌 정수여야 합니다.', 'error');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(adjustmentDate)) {
      showToast('날짜 형식이 잘못되었습니다 (YYYY-MM-DD).', 'error');
      return;
    }
    if (adjustmentDate > todayStr()) {
      showToast('미래 날짜로는 수정할 수 없습니다.', 'error');
      return;
    }
    if (!customerName.trim()) {
      showToast('거래처명이 비어있습니다.', 'error');
      return;
    }

    try {
      setSaving(true);
      await updateAdjustment(adjustment.id, {
        customerName: customerName.trim(),
        adjustmentDate,
        amount: newAmount,
      });
      showToast('조정 내역이 수정되었습니다.', 'success');
      onSaved();
      onClose();
    } catch (err: any) {
      console.error('[EditAdjustmentModal] save error:', err);
      showToast(`수정 실패: ${err.message ?? err}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [adjustment, customerName, adjustmentDate, amount, showToast, onSaved, onClose]);

  return (
    <RecordEditModal
      visible={adjustment !== null}
      title="⚖️ 조정 내역 수정"
      headerColor="#7c3aed"
      onClose={onClose}
      saving={saving}
      onSave={handleSave}
      fields={
        <>
          <LabeledTextInput label="거래처" value={customerName} onChangeText={setCustomerName} />
          <LabeledTextInput
            label="조정 적용 날짜"
            value={adjustmentDate}
            onChangeText={setAdjustmentDate}
            placeholder="YYYY-MM-DD"
            mono
          />
          <LabeledTextInput
            label="조정액 (±원, 0 금지)"
            value={amount}
            onChangeText={(v) => setAmount(v.replace(/[^0-9-]/g, ''))}
            placeholder="예: -1500000 또는 1500000"
            keyboardType="numeric"
            mono
            alignRight
          />
          <View
            style={{
              padding: 10,
              borderRadius: 6,
              backgroundColor: '#fef3c7',
              borderWidth: 1,
              borderColor: '#fde68a',
              marginBottom: 8,
            }}
          >
            <Text style={{ fontSize: 11, color: '#92400e' }}>
              양수 = 미수금 증가 / 음수 = 미수금 감소
            </Text>
          </View>
        </>
      }
    />
  );
}

// ==================== 공통 수정 모달 셸 ====================

interface RecordEditModalProps {
  visible: boolean;
  title: string;
  headerColor: string;
  onClose: () => void;
  saving: boolean;
  onSave: () => void;
  fields: React.ReactNode;
}

function RecordEditModal({
  visible,
  title,
  headerColor,
  onClose,
  saving,
  onSave,
  fields,
}: RecordEditModalProps) {
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
            maxWidth: 440,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 20,
              paddingVertical: 16,
              backgroundColor: headerColor,
            }}
          >
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: '#fff' }}>
              {title}
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

          <View style={{ padding: 22 }}>
            {fields}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
              <TouchableOpacity
                onPress={onClose}
                disabled={saving}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 8,
                  backgroundColor: '#e5e7eb',
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#475569' }}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onSave}
                disabled={saving}
                style={{
                  flex: 1.5,
                  paddingVertical: 12,
                  borderRadius: 8,
                  backgroundColor: headerColor,
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
          </View>
        </View>
      </View>
    </Modal>
  );
}

interface LabeledTextInputProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
  mono?: boolean;
  alignRight?: boolean;
}

function LabeledTextInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  mono,
  alignRight,
}: LabeledTextInputProps) {
  return (
    <>
      <Text style={{ fontSize: 13, color: '#1B365D', fontWeight: '600', marginBottom: 6 }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#cbd5e1"
        keyboardType={keyboardType ?? 'default'}
        style={{
          height: 42,
          paddingHorizontal: 12,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: '#d1d5db',
          backgroundColor: '#fff',
          fontSize: 14,
          color: '#1B365D',
          marginBottom: 14,
          textAlign: alignRight ? 'right' : 'left',
          ...(mono && Platform.OS === 'web' ? ({ fontFamily: 'monospace' } as any) : {}),
        }}
      />
    </>
  );
}

// ==================== 메인 페이지 ====================

export default function DepositHistoryScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  const [tab, setTab] = useState<TabKey>('payment');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [editingAdjustment, setEditingAdjustment] = useState<Adjustment | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [p, a] = await Promise.all([
        getAllPayments().catch((err) => {
          console.warn('[history] payments load failed:', err);
          return [] as Payment[];
        }),
        getAllAdjustments().catch((err) => {
          console.warn('[history] adjustments load failed:', err);
          return [] as Adjustment[];
        }),
      ]);
      setPayments(p);
      setAdjustments(a);
    } catch (err: any) {
      console.error('[DepositHistoryScreen] load error:', err);
      showToast(`기록 조회 실패: ${err.message ?? err}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  /** 검색 필터 */
  const filteredPayments = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter(
      (p) =>
        p.customerName.toLowerCase().includes(q) || p.paymentDate.includes(q),
    );
  }, [payments, query]);

  const filteredAdjustments = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return adjustments;
    return adjustments.filter(
      (a) =>
        a.customerName.toLowerCase().includes(q) || a.adjustmentDate.includes(q),
    );
  }, [adjustments, query]);

  const paymentTotal = useMemo(
    () => filteredPayments.reduce((s, p) => s + p.amount, 0),
    [filteredPayments],
  );
  const adjustmentTotal = useMemo(
    () => filteredAdjustments.reduce((s, a) => s + a.amount, 0),
    [filteredAdjustments],
  );

  const handleDeletePayment = useCallback(
    (p: Payment) => {
      showConfirm({
        title: '입금 기록 삭제',
        message:
          `다음 입금 기록을 삭제하시겠습니까?\n\n` +
          `· 거래처: ${p.customerName}\n` +
          `· 날짜: ${p.paymentDate}\n` +
          `· 금액: ${formatNumber(p.amount)}원\n\n` +
          `삭제하면 해당 거래처의 미수금이 그만큼 증가합니다.`,
        confirmText: '삭제',
        cancelText: '취소',
        onConfirm: async () => {
          try {
            await deletePayment(p.id);
            showToast('입금 기록이 삭제되었습니다.', 'success');
            void loadAll();
          } catch (err: any) {
            console.error('[history] delete payment error:', err);
            showToast(`삭제 실패: ${err.message ?? err}`, 'error');
          }
        },
      });
    },
    [showConfirm, showToast, loadAll],
  );

  const handleDeleteAdjustment = useCallback(
    (a: Adjustment) => {
      showConfirm({
        title: '조정 내역 삭제',
        message:
          `다음 조정을 삭제하시겠습니까?\n\n` +
          `· 거래처: ${a.customerName}\n` +
          `· 날짜: ${a.adjustmentDate}\n` +
          `· 조정액: ${formatSigned(a.amount)}원\n\n` +
          `삭제하면 그만큼 미수금이 ${a.amount > 0 ? '감소' : '증가'}합니다.`,
        confirmText: '삭제',
        cancelText: '취소',
        onConfirm: async () => {
          try {
            await deleteAdjustment(a.id);
            showToast('조정 내역이 삭제되었습니다.', 'success');
            void loadAll();
          } catch (err: any) {
            console.error('[history] delete adjustment error:', err);
            showToast(`삭제 실패: ${err.message ?? err}`, 'error');
          }
        },
      });
    },
    [showConfirm, showToast, loadAll],
  );

  // ===== 렌더 =====

  const currentCount =
    tab === 'payment' ? filteredPayments.length : filteredAdjustments.length;
  const totalCount = tab === 'payment' ? payments.length : adjustments.length;
  const currentTotal = tab === 'payment' ? paymentTotal : adjustmentTotal;

  return (
    <ScreenContainer style={{ backgroundColor: '#f5f5f5' }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ResponsiveContainer className="flex-1">
        <View style={{ flex: 1 }}>
          {/* 헤더 */}
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
            <Text style={{ fontSize: 18, marginRight: 4 }}>📂</Text>
            <Text style={{ flex: 1, fontSize: 17, fontWeight: '700', color: '#fff' }}>
              입금 / 조정 기록 보관함
            </Text>
          </View>

          {/* 탭 */}
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: '#fff',
              borderBottomWidth: 1,
              borderBottomColor: '#e5e7eb',
            }}
          >
            {(['payment', 'adjustment'] as TabKey[]).map((key) => {
              const active = tab === key;
              const label = key === 'payment' ? '💰 입금' : '⚖️ 조정';
              const activeColor = key === 'payment' ? '#1B365D' : '#7c3aed';
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => setTab(key)}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    alignItems: 'center',
                    borderBottomWidth: 3,
                    borderBottomColor: active ? activeColor : 'transparent',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '700',
                      color: active ? activeColor : '#94a3b8',
                    }}
                  >
                    {label} ({tab === key ? currentCount : (key === 'payment' ? payments.length : adjustments.length)})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 검색 + 합계 */}
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 12,
              backgroundColor: '#fff',
              borderBottomWidth: 1,
              borderBottomColor: '#e5e7eb',
              gap: 10,
            }}
          >
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="거래처명 또는 날짜로 검색 (예: 도원, 2026-05-18)"
              placeholderTextColor="#9ca3af"
              style={{
                height: 42,
                paddingHorizontal: 14,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: '#d1d5db',
                backgroundColor: '#f9fafb',
                fontSize: 14,
                color: '#1B365D',
              }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, color: '#666' }}>
                {currentCount}건 {query ? `(전체 ${totalCount}건 중)` : ''}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: tab === 'payment' ? '#1B365D' : currentTotal >= 0 ? '#dc2626' : '#16a34a',
                  ...(Platform.OS === 'web' ? ({ fontFamily: 'monospace' } as any) : {}),
                }}
              >
                합계 {tab === 'payment' ? formatNumber(currentTotal) : formatSigned(currentTotal)}원
              </Text>
            </View>
          </View>

          {/* 본문 */}
          {loading ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <ActivityIndicator />
              <Text style={{ marginTop: 12, color: '#666' }}>기록 로딩 중...</Text>
            </View>
          ) : tab === 'payment' ? (
            <PaymentList
              rows={filteredPayments}
              totalCount={payments.length}
              onEdit={setEditingPayment}
              onDelete={handleDeletePayment}
            />
          ) : (
            <AdjustmentList
              rows={filteredAdjustments}
              totalCount={adjustments.length}
              onEdit={setEditingAdjustment}
              onDelete={handleDeleteAdjustment}
            />
          )}

          <EditPaymentModal
            payment={editingPayment}
            onClose={() => setEditingPayment(null)}
            onSaved={() => {
              void loadAll();
            }}
          />
          <EditAdjustmentModal
            adjustment={editingAdjustment}
            onClose={() => setEditingAdjustment(null)}
            onSaved={() => {
              void loadAll();
            }}
          />
        </View>
      </ResponsiveContainer>
    </ScreenContainer>
  );
}

// ==================== 리스트 컴포넌트 ====================

function PaymentList({
  rows,
  totalCount,
  onEdit,
  onDelete,
}: {
  rows: Payment[];
  totalCount: number;
  onEdit: (p: Payment) => void;
  onDelete: (p: Payment) => void;
}) {
  if (rows.length === 0) {
    return (
      <View style={{ padding: 40, alignItems: 'center' }}>
        <Text style={{ fontSize: 14, color: '#666' }}>
          {totalCount === 0 ? '저장된 입금 기록이 없습니다.' : '검색 결과가 없습니다.'}
        </Text>
      </View>
    );
  }
  return (
    <ScrollView style={{ flex: 1 }}>
      <TableHeader rightColLabel="금액" />
      {rows.map((p) => (
        <View
          key={p.id}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: '#f1f5f9',
          }}
        >
          <Text style={{ flex: 1.4, fontSize: 14, color: '#1B365D' }}>{p.customerName}</Text>
          <Text
            style={{
              flex: 1.2,
              fontSize: 13,
              color: '#475569',
              ...(Platform.OS === 'web' ? ({ fontFamily: 'monospace' } as any) : {}),
            }}
          >
            {p.paymentDate}
          </Text>
          <Text
            style={{
              flex: 1.3,
              fontSize: 14,
              color: '#1B365D',
              fontWeight: '600',
              textAlign: 'right',
              paddingRight: 8,
              ...(Platform.OS === 'web' ? ({ fontFamily: 'monospace' } as any) : {}),
            }}
          >
            {formatNumber(p.amount)}
          </Text>
          <RowActions onEdit={() => onEdit(p)} onDelete={() => onDelete(p)} />
        </View>
      ))}
    </ScrollView>
  );
}

function AdjustmentList({
  rows,
  totalCount,
  onEdit,
  onDelete,
}: {
  rows: Adjustment[];
  totalCount: number;
  onEdit: (a: Adjustment) => void;
  onDelete: (a: Adjustment) => void;
}) {
  if (rows.length === 0) {
    return (
      <View style={{ padding: 40, alignItems: 'center' }}>
        <Text style={{ fontSize: 14, color: '#666' }}>
          {totalCount === 0 ? '저장된 조정 내역이 없습니다.' : '검색 결과가 없습니다.'}
        </Text>
      </View>
    );
  }
  return (
    <ScrollView style={{ flex: 1 }}>
      <TableHeader rightColLabel="조정액 (±)" />
      {rows.map((a) => (
        <View
          key={a.id}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: '#f1f5f9',
          }}
        >
          <Text style={{ flex: 1.4, fontSize: 14, color: '#1B365D' }}>{a.customerName}</Text>
          <Text
            style={{
              flex: 1.2,
              fontSize: 13,
              color: '#475569',
              ...(Platform.OS === 'web' ? ({ fontFamily: 'monospace' } as any) : {}),
            }}
          >
            {a.adjustmentDate}
          </Text>
          <Text
            style={{
              flex: 1.3,
              fontSize: 14,
              color: a.amount > 0 ? '#dc2626' : '#16a34a',
              fontWeight: '600',
              textAlign: 'right',
              paddingRight: 8,
              ...(Platform.OS === 'web' ? ({ fontFamily: 'monospace' } as any) : {}),
            }}
          >
            {formatSigned(a.amount)}
          </Text>
          <RowActions onEdit={() => onEdit(a)} onDelete={() => onDelete(a)} />
        </View>
      ))}
    </ScrollView>
  );
}

function TableHeader({ rightColLabel }: { rightColLabel: string }) {
  return (
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
      <Text style={{ flex: 1.4, fontSize: 11, fontWeight: '700', color: '#4b5563' }}>거래처</Text>
      <Text style={{ flex: 1.2, fontSize: 11, fontWeight: '700', color: '#4b5563' }}>날짜</Text>
      <Text
        style={{
          flex: 1.3,
          fontSize: 11,
          fontWeight: '700',
          color: '#4b5563',
          textAlign: 'right',
          paddingRight: 8,
        }}
      >
        {rightColLabel}
      </Text>
      <View style={{ width: 120 }} />
    </View>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, width: 120 }}>
      <TouchableOpacity
        onPress={onEdit}
        style={{
          flex: 1,
          paddingVertical: 6,
          borderRadius: 6,
          backgroundColor: '#1B365D',
          alignItems: 'center',
        }}
      >
        <Text style={{ fontSize: 11, color: '#fff', fontWeight: '700' }}>수정</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onDelete}
        style={{
          flex: 1,
          paddingVertical: 6,
          borderRadius: 6,
          backgroundColor: '#dc2626',
          alignItems: 'center',
        }}
      >
        <Text style={{ fontSize: 11, color: '#fff', fontWeight: '700' }}>삭제</Text>
      </TouchableOpacity>
    </View>
  );
}
