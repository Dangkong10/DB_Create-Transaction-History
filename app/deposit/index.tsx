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
import { blurActive } from '@/lib/utils';
import { useConfirm } from '@/lib/confirm-provider';
import {
  getPendingCustomersAsOfDate,
  savePayments,
  type PendingCustomerRow,
  type PaymentInput,
} from '@/lib/payments';
import { getAllPendingAlerts, setAlertStatus, type BankAlert } from '@/lib/bank-alerts';
import { matchBankSender } from '@/lib/bank-match';
import { loadCustomers } from '@/lib/storage';
import { AdjustmentModal } from '@/components/adjustment-modal';

// ==================== 유틸 ====================

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 부가세율 — 지금은 10% 고정. 거래처마다 달라지면 customers 에 비율 컬럼을 둔다. */
const VAT_RATE = 0.1;

/**
 * 부가세 포함 입금액을 공급가와 부가세로 나눈다.
 * 185,900 → { supply: 169,000, vat: 16,900 }
 *
 * 공급가를 반올림해 구하고 나머지를 부가세로 둔다. 이렇게 해야
 * supply + vat 이 **항상 실제 이체액과 정확히 같아진다** (1원도 새지 않음).
 */
function splitVat(total: number): { supply: number; vat: number } {
  const supply = Math.round(total / (1 + VAT_RATE));
  return { supply, vat: total - supply };
}

/** 문자에서 온 입금 한 건 — 화면의 한 줄에 대응 */
interface AlertRow {
  alertId: string;
  customerName: string;
  /**
   * 문자에 찍힌 거래일 (YYYY-MM-DD).
   * **저장할 때 반드시 이 값을 쓴다.** 화면에서 고른 날짜를 쓰면
   * 오늘 온 문자가 어제 날짜로 기록되는 사고가 난다.
   */
  txDate: string;
  /** 문자에 찍힌 실제 이체 금액 */
  amount: number;
  senderName: string;
  /**
   * 입금 시각 (HH:mm:ss) — 통장과 대조하기 쉽도록.
   * 초까지 넣는 이유: 연속 이체는 같은 분에 몰려 오기도 한다
   * (실측 2026-08-05 대풍 3건이 16:40:34 / :36 / :45).
   */
  time: string;
  /** 이 거래처가 부가세 포함으로 보내는가 */
  vat: boolean;
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

  /**
   * 은행 문자에서 온 입금 — **합산하지 않고 건별로** 한 줄씩 보여준다.
   * 같은 거래처가 하루에 세 번 보내면 세 줄이 되고, 저장도 세 건으로 들어간다.
   * (통장과 한 줄씩 대조할 수 있어야 하므로)
   */
  const [alertRows, setAlertRows] = useState<AlertRow[]>([]);
  /** 거래처를 못 찾은 입금 알림 — 자동 처리하지 않고 알려만 준다 */
  const [unmatchedAlerts, setUnmatchedAlerts] = useState<BankAlert[]>([]);
  /** 문자에서 온 줄의 입력값. key = 알림 id */
  const [alertInputs, setAlertInputs] = useState<Record<string, string>>({});
  /**
   * 「제외」 표시한 알림 id 들.
   * 저장할 때 ignored 로 바꿔 **다음부터 목록에 뜨지 않게** 한다.
   * (거래처와 무관한 입금 — 개인 거래, 장부 거래처 등)
   * 저장 전이면 다시 눌러 되돌릴 수 있다.
   */
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  /** 부가세 포함 입금 거래처 이름 집합 */
  const [vatCustomers, setVatCustomers] = useState<Set<string>>(new Set());

  // showToast 를 effect deps 에서 빼기 위해 ref 로 latest 참조
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  /**
   * 아직 처리하지 않은 은행 입금 알림을 **날짜와 무관하게 전부** 읽어 거래처별로 매칭한다.
   *
   * 입금은 보통 전날(또는 그 이전) 거래에 대해 들어오므로, 화면 날짜에 묶어 두면
   * 매번 날짜를 바꿔야 한다. 각 줄에 자기 날짜를 달고 저장 때 그 날짜로 기록한다.
   *
   * 실패해도 화면은 정상 동작해야 한다 — 자동 채움은 어디까지나 편의 기능이고,
   * 손으로 넣는 기존 흐름을 막아선 안 된다.
   */
  const buildAutoFill = useCallback(async (_date: string, rows: PendingCustomerRow[]) => {
    try {
      const [alerts, customers] = await Promise.all([
        getAllPendingAlerts(),
        loadCustomers(),
      ]);

      const vatSet = new Set(customers.filter((c) => c.vatIncluded).map((c) => c.name));
      const matchedRows: AlertRow[] = [];
      const unmatched: BankAlert[] = [];

      for (const a of alerts) {
        const r = matchBankSender(a.senderName, customers);
        if (r.status === 'matched' && r.customerName) {
          const d = new Date(a.receivedAt);
          matchedRows.push({
            alertId: a.id,
            customerName: r.customerName,
            txDate: a.txDate,
            amount: a.amount,
            senderName: a.senderName ?? '',
            time: [d.getHours(), d.getMinutes(), d.getSeconds()]
              .map((n) => String(n).padStart(2, '0'))
              .join(':'),
            vat: vatSet.has(r.customerName),
          });
        } else {
          // 모호(2곳 이상)하거나 못 찾은 건 자동 처리하지 않는다
          unmatched.push(a);
        }
      }

      // 날짜 → 시간 순. 통장 순서와 같게 보이도록.
      matchedRows.sort(
        (x, y) => x.txDate.localeCompare(y.txDate) || x.time.localeCompare(y.time),
      );

      setVatCustomers(vatSet);
      setAlertRows(matchedRows);
      setUnmatchedAlerts(unmatched);
      setAlertInputs(Object.fromEntries(matchedRows.map((r) => [r.alertId, String(r.amount)])));
      setExcludedIds(new Set());

      if (matchedRows.length > 0) {
        showToastRef.current(`문자에서 ${matchedRows.length}건을 불러왔습니다.`, 'success');
      }
    } catch (err) {
      console.warn('[DepositInputScreen] 입금 알림 자동 채움 실패:', err);
      setAlertRows([]);
      setUnmatchedAlerts([]);
      setAlertInputs({});
    }
  }, []);

  /**
   * 못 찾은 입금 알림 숨기기 — ignored 로 바꿔 다음부터 목록에 뜨지 않는다.
   * 앱에서 되돌리는 화면이 없으므로 (DB 에서만 복구 가능) 한 번 확인을 받는다.
   */
  function handleHideUnmatched(a: BankAlert) {
    showConfirm({
      title: '이 입금 알림 숨기기',
      message:
        `${a.senderName || '(이름없음)'} — ${formatNumber(a.amount)}원\n\n` +
        `앞으로 이 입금은 목록에 표시하지 않습니다.`,
      confirmText: '표시 안 함',
      cancelText: '취소',
      onConfirm: () => {
        void setAlertStatus([a.id], 'ignored')
          .then(() => setUnmatchedAlerts((prev) => prev.filter((x) => x.id !== a.id)))
          .catch(() => showToastRef.current('숨기기에 실패했습니다.', 'error'));
      },
    });
  }

  /** effectiveDate 기준으로 미수 거래처 재로드 */
  const reloadPending = useCallback(async () => {
    try {
      const rows = await getPendingCustomersAsOfDate(effectiveDate);
      setPendingRows(rows);
      await buildAutoFill(effectiveDate, rows);
    } catch (err) {
      console.error('[DepositInputScreen] reload error:', err);
    }
  }, [effectiveDate, buildAutoFill]);

  /** 초기 로드 (mount 시 1회) */
  useEffect(() => {
    const initial = yesterdayStr();
    setPaymentDate(initial);
    setEffectiveDate(initial);
    setLoading(true);

    getPendingCustomersAsOfDate(initial)
      .then(async (rows) => {
        setPendingRows(rows);
        await buildAutoFill(initial, rows);
      })
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
      // 날짜가 바뀌었으니 그 날짜의 문자 알림으로 다시 채운다
      await buildAutoFill(paymentDate, rows);
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

    // 저장 후 confirmed 로 바꿀 알림 id 들
    const confirmIds: string[] = [];

    // 「제외」 표시한 건 — 입금으로 기록하지 않고 ignored 로 돌려 다시 뜨지 않게 한다
    const ignoreIds = Array.from(excludedIds);

    // ① 문자에서 온 입금 — 건별로 그대로 기록
    for (const ar of alertRows) {
      if (excludedIds.has(ar.alertId)) continue;
      const amount = parseAmount(alertInputs[ar.alertId] ?? '');
      if (amount <= 0) continue;

      // ⚠️ 날짜는 **문자의 거래일(ar.txDate)** 을 쓴다. 화면에서 고른 날짜가 아니다.
      if (ar.vat) {
        // 부가세 포함 이체 → 공급가와 부가세로 나눠 기록.
        // amount(공급가)만 미수금에서 차감되고, 통장 대조는 amount+vat 로 맞는다.
        const { supply, vat } = splitVat(amount);
        items.push({
          customerName: ar.customerName,
          paymentDate: ar.txDate,
          amount: supply,
          vatAmount: vat,
          source: 'bank',
          bankAlertId: ar.alertId,
        });
      } else {
        items.push({
          customerName: ar.customerName,
          paymentDate: ar.txDate,
          amount,
          source: 'bank',
          bankAlertId: ar.alertId,
        });
      }
      confirmIds.push(ar.alertId);
    }

    // ② 손으로 넣은 입금 (기존 흐름 그대로)
    for (const row of pendingRows) {
      const raw = inputs[row.customerName] ?? '';
      const amount = parseAmount(raw);
      if (amount <= 0) continue;

      if (vatCustomers.has(row.customerName)) {
        const { supply, vat } = splitVat(amount);
        items.push({ customerName: row.customerName, paymentDate, amount: supply, vatAmount: vat });
        if (supply > row.outstanding) {
          overflows.push({ name: row.customerName, amount: supply, outstanding: row.outstanding });
        }
      } else {
        items.push({ customerName: row.customerName, paymentDate, amount });
        if (amount > row.outstanding) {
          overflows.push({ name: row.customerName, amount, outstanding: row.outstanding });
        }
      }
    }

    // 제외만 하고 저장하는 것도 유효한 동작이다 (거래처와 무관한 입금 정리)
    if (items.length === 0 && ignoreIds.length === 0) {
      showToast('입력된 입금 금액이 없습니다.', 'info');
      return;
    }

    const doSave = async () => {
      try {
        setSaving(true);
        await savePayments(items);

        // 처리된 문자의 상태를 정리한다 — 둘 다 "다시 뜨지 않게" 가 목적이다.
        //   confirmed : 입금으로 반영됨
        //   ignored   : 「제외」 표시함 (거래처와 무관한 입금)
        // 실패해도 입금 저장 자체는 이미 끝났으므로 사용자를 막지 않는다
        // (bank_alert_id 유니크 인덱스가 이중 입금은 어차피 차단한다).
        try {
          if (confirmIds.length > 0) await setAlertStatus(confirmIds, 'confirmed');
          if (ignoreIds.length > 0) await setAlertStatus(ignoreIds, 'ignored');
        } catch (e) {
          console.warn('[DepositInputScreen] 알림 상태 변경 실패:', e);
        }

        const parts = [];
        if (items.length > 0) parts.push(`${items.length}건 저장`);
        if (ignoreIds.length > 0) parts.push(`${ignoreIds.length}건 제외`);
        showToast(`${parts.join(' · ')}되었습니다.`, 'success');
        blurActive();
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
  }, [
    paymentDate,
    effectiveDate,
    pendingRows,
    inputs,
    alertRows,
    alertInputs,
    excludedIds,
    vatCustomers,
    showToast,
    showConfirm,
    router,
  ]);

  /** 실제 이체액 기준 합계 — 문자에서 온 건 + 손으로 넣은 건 (제외한 건은 빠짐) */
  const totalInput = useMemo(() => {
    let sum = 0;
    for (const ar of alertRows) {
      if (excludedIds.has(ar.alertId)) continue;
      sum += parseAmount(alertInputs[ar.alertId] ?? '');
    }
    for (const row of pendingRows) sum += parseAmount(inputs[row.customerName] ?? '');
    return sum;
  }, [inputs, pendingRows, alertRows, alertInputs, excludedIds]);

  /** 저장될 건수 — 버튼에 미리 보여줘 한 번에 확인하고 누를 수 있게 */
  const saveCount = useMemo(() => {
    let n = 0;
    for (const ar of alertRows) {
      if (excludedIds.has(ar.alertId)) continue;
      if (parseAmount(alertInputs[ar.alertId] ?? '') > 0) n++;
    }
    for (const row of pendingRows) if (parseAmount(inputs[row.customerName] ?? '') > 0) n++;
    return n;
  }, [inputs, pendingRows, alertRows, alertInputs, excludedIds]);

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
              onPress={() => { blurActive(); router.back(); }}
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
              onPress={() => { blurActive(); router.push('/deposit/history'); }}
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

              {/* ── 문자에서 온 입금 (건별, 합산하지 않음) ── */}
              {alertRows.length > 0 && (
                <View style={{ marginBottom: 8 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      backgroundColor: '#effcf9',
                      borderBottomWidth: 1,
                      borderBottomColor: '#c7f0e8',
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#0f766e' }}>
                      💬 아직 처리 안 된 입금 {alertRows.length}건
                    </Text>
                    <Text style={{ fontSize: 11, color: '#0f766e', opacity: 0.8 }}>
                      날짜별로 알아서 기록됩니다
                    </Text>
                  </View>

                  {alertRows.map((ar) => {
                    const raw = alertInputs[ar.alertId] ?? '';
                    const amt = parseAmount(raw);
                    const excluded = excludedIds.has(ar.alertId);
                    const split = !excluded && ar.vat && amt > 0 ? splitVat(amt) : null;
                    return (
                      <View
                        key={ar.alertId}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          borderBottomWidth: 1,
                          borderBottomColor: '#f1f5f9',
                          backgroundColor: excluded ? '#f8fafc' : '#fbfffe',
                          opacity: excluded ? 0.55 : 1,
                        }}
                      >
                        <View style={{ flex: 2.4, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          {/* 날짜 칩 — 이 입금이 어느 날짜로 기록되는지 */}
                          <View
                            style={{
                              paddingHorizontal: 7,
                              paddingVertical: 2,
                              borderRadius: 999,
                              backgroundColor: '#effcf9',
                              borderWidth: 1,
                              borderColor: '#c7f0e8',
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 10,
                                fontWeight: '700',
                                color: '#0f766e',
                                ...(Platform.OS === 'web' ? ({ fontFamily: 'monospace' } as any) : {}),
                              }}
                            >
                              {ar.txDate.slice(5)}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, color: '#1B365D' }} numberOfLines={1}>
                              {ar.customerName}
                              {ar.vat && (
                                <Text style={{ fontSize: 10, color: '#b45309' }}> · 부가세</Text>
                              )}
                            </Text>
                            <Text
                              style={{
                                fontSize: 10,
                                color: excluded ? '#94a3b8' : '#0f766e',
                                marginTop: 2,
                              }}
                              numberOfLines={1}
                            >
                              {excluded
                                ? '제외됨 — 저장하면 다시 뜨지 않습니다'
                                : `${ar.senderName} · ${ar.time}${
                                    split
                                      ? `  →  공급가 ${formatNumber(split.supply)} / 부가세 ${formatNumber(split.vat)}`
                                      : ''
                                  }`}
                            </Text>
                          </View>
                        </View>
                        <TextInput
                          value={raw ? formatNumber(parseAmount(raw)) : ''}
                          onChangeText={(v) =>
                            setAlertInputs((p) => ({ ...p, [ar.alertId]: v.replace(/[^0-9]/g, '') }))
                          }
                          editable={!excluded}
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
                            borderColor: excluded ? '#e2e8f0' : '#99e6d5',
                            backgroundColor: excluded ? '#f1f5f9' : raw ? '#ecfdf5' : '#fff',
                            fontSize: 14,
                            color: excluded ? '#94a3b8' : '#1B365D',
                            textAlign: 'right',
                            ...(Platform.OS === 'web'
                              ? ({
                                  fontFamily: 'monospace',
                                  ...(excluded ? { textDecorationLine: 'line-through' } : {}),
                                } as any)
                              : {}),
                          }}
                        />
                        <TouchableOpacity
                          onPress={() =>
                            setExcludedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(ar.alertId)) next.delete(ar.alertId);
                              else next.add(ar.alertId);
                              return next;
                            })
                          }
                          style={{
                            width: 60,
                            paddingVertical: 6,
                            borderRadius: 6,
                            backgroundColor: excluded ? '#64748b' : '#94a3b8',
                            alignItems: 'center',
                          }}
                        >
                          <Text style={{ fontSize: 11, color: '#fff', fontWeight: '700' }}>
                            {excluded ? '되돌리기' : '제외'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
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
                    <View style={{ flex: 1.2 }}>
                      <Text style={{ fontSize: 14, color: '#1B365D' }}>{row.customerName}</Text>
                      {vatCustomers.has(row.customerName) && (
                        <Text style={{ fontSize: 10, color: '#b45309', marginTop: 2 }}>
                          부가세 포함
                        </Text>
                      )}
                    </View>
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

              {/* 거래처를 못 찾은 입금 알림 — 자동 처리하지 않고 알려만 준다 */}
              {unmatchedAlerts.length > 0 && (
                <View
                  style={{
                    marginTop: 14,
                    marginHorizontal: 14,
                    marginBottom: 20,
                    padding: 12,
                    borderRadius: 8,
                    backgroundColor: '#fffbeb',
                    borderWidth: 1,
                    borderColor: '#fde68a',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#92400e' }}>
                    거래처를 찾지 못한 입금 {unmatchedAlerts.length}건
                  </Text>
                  {unmatchedAlerts.map((a) => (
                    <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                      <Text style={{ flex: 1, fontSize: 12, color: '#92400e' }}>
                        · {a.senderName || '(이름없음)'} — {formatNumber(a.amount)}원
                      </Text>
                      <TouchableOpacity
                        onPress={() => handleHideUnmatched(a)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ paddingHorizontal: 6 }}
                        accessibilityLabel="이 입금 알림 숨기기"
                      >
                        <Text style={{ fontSize: 13, color: '#a16207', fontWeight: '700' }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  <Text style={{ fontSize: 11, color: '#a16207', marginTop: 8, lineHeight: 16 }}>
                    거래처 것이라면 관리 탭 → 거래처 설정에서 입금자명을 등록해 주세요.
                    다음부터 자동으로 채워집니다. 개인 거래라면 그냥 두시면 됩니다.
                  </Text>
                </View>
              )}
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

          {/* 저장 영역 — 미수 목록이 비어도 문자 입금이 있으면 보여야 한다 */}
          {(pendingRows.length > 0 || alertRows.length > 0) && (
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
                disabled={saving || (totalInput === 0 && excludedIds.size === 0)}
                style={{
                  paddingVertical: 14,
                  borderRadius: 8,
                  backgroundColor:
                    totalInput === 0 && excludedIds.size === 0 ? '#cbd5e1' : '#1B365D',
                  alignItems: 'center',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
                    {[
                      saveCount > 0 ? `${saveCount}건 저장` : '',
                      excludedIds.size > 0 ? `${excludedIds.size}건 제외` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ') || '저장'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ResponsiveContainer>
    </ScreenContainer>
  );
}
