/**
 * 미수금 누적 시스템 — 입금/조정 기록 & 잔고 계산
 *
 * 명세서: design_미수금시스템.html §3 (핵심 계산 공식)
 *
 * 계산 원칙:
 *   - 현재미수금은 어디에도 저장하지 않음.
 *   - 매번 SUM(transactions) - SUM(payments) + SUM(adjustments) 로 자동 계산.
 *   - "전잔고" = D 영업 시작 전 미수금 (매출 < D, 입금 ≤ D, 조정 ≤ D)
 *
 * adjustments.amount 부호:
 *   + 양수: 미수금 증가 방향
 *   - 음수: 미수금 감소 방향
 */

import { supabase } from './supabase';

// ==================== 타입 ====================

export interface Payment {
  id: string;
  customerName: string;
  paymentDate: string; // YYYY-MM-DD
  amount: number;
  createdAt: string;   // YYYY-MM-DD HH:mm:ss
}

/**
 * 영수증·집계표 출력 시 한 거래처에 필요한 잔고 정보
 */
export interface ReceiptBalances {
  customerName: string;
  /** 전잔고 — D 영업 시작 전 미수금 */
  previousBalance: number;
  /** 당일매출 — date=D 의 매출 합 */
  dailyRevenue: number;
  /** 총잔액 — previousBalance + dailyRevenue */
  total: number;
}

// ==================== 헬퍼 ====================

function formatCreatedAt(isoString: string): string {
  const d = new Date(isoString);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
}

function rowToPayment(row: any): Payment {
  return {
    id: String(row.id),
    customerName: row.customer_name,
    paymentDate: row.payment_date,
    amount: row.amount,
    createdAt: formatCreatedAt(row.created_at),
  };
}

async function getUserIdOrThrow(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('로그인이 필요합니다.');
  return session.user.id;
}

/**
 * Supabase REST 의 기본 페이지 크기(1000) 한계를 우회하기 위한 페이지네이션 헬퍼.
 *   buildQuery: 매 호출마다 *새로운* PostgrestFilterBuilder 를 반환해야 한다
 *   (PostgrestFilterBuilder 는 한 번 await 하면 재사용 불가하므로).
 *
 * 1000 건씩 끊어 누적. 한 페이지가 1000 미만이면 종료.
 */
async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  let from = 0;
  // 안전장치: 50 페이지(=5만 건) 이상은 비정상 — 무한 루프 방지.
  for (let i = 0; i < 50; i++) {
    const to = from + PAGE - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// ==================== 계산 — 현재 미수금 ====================

/**
 * 모든 거래처의 현재 미수금 Map.
 *   currentOutstanding = SUM(transactions) - SUM(payments) + SUM(adjustments)  (날짜 무관)
 *
 * @returns Map<customerName, balance>. balance 가 0인 거래처는 제외.
 *          음수 balance (선입금) 도 포함 — Q1 정책에 따라 허용.
 */
export async function getAllOutstandings(): Promise<Map<string, number>> {
  const userId = await getUserIdOrThrow();

  // 매출 총합 (거래처별) — 1000건 한계 우회 위해 페이지네이션
  let txRows: { customer_name: string; quantity: number | null; unit_price: number | null }[];
  try {
    txRows = await fetchAllRows<{ customer_name: string; quantity: number | null; unit_price: number | null }>((from, to) =>
      supabase
        .from('transactions')
        .select('customer_name, quantity, unit_price')
        .eq('user_id', userId)
        .range(from, to),
    );
  } catch (txErr: any) {
    console.error('[getAllOutstandings] tx error:', txErr);
    throw new Error(`매출 조회 실패: ${txErr.message ?? txErr}`);
  }

  // 입금 총합 (거래처별)
  let payRows: { customer_name: string; amount: number }[];
  try {
    payRows = await fetchAllRows<{ customer_name: string; amount: number }>((from, to) =>
      supabase
        .from('payments')
        .select('customer_name, amount')
        .eq('user_id', userId)
        .range(from, to),
    );
  } catch (payErr: any) {
    console.error('[getAllOutstandings] pay error:', payErr);
    throw new Error(`입금 조회 실패: ${payErr.message ?? payErr}`);
  }

  // 조정 총합 (거래처별). 테이블 미적용 환경에서도 0으로 fallback.
  let adjRows: { customer_name: string; amount: number }[] = [];
  try {
    adjRows = await fetchAllRows<{ customer_name: string; amount: number }>((from, to) =>
      supabase
        .from('adjustments')
        .select('customer_name, amount')
        .eq('user_id', userId)
        .range(from, to),
    );
  } catch (err: any) {
    console.warn('[getAllOutstandings] adjustments fetch 실패 (0으로 처리):', err.message ?? err);
  }

  const map = new Map<string, number>();

  for (const r of txRows ?? []) {
    const amount = (r.quantity ?? 0) * (r.unit_price ?? 0);
    map.set(r.customer_name, (map.get(r.customer_name) ?? 0) + amount);
  }
  for (const r of payRows ?? []) {
    map.set(r.customer_name, (map.get(r.customer_name) ?? 0) - (r.amount ?? 0));
  }
  for (const r of adjRows) {
    map.set(r.customer_name, (map.get(r.customer_name) ?? 0) + (r.amount ?? 0));
  }

  // 0인 거래처 제거 (현재 미수금 0 = 정산 완료, 화면에 보일 필요 X)
  for (const [name, bal] of Array.from(map.entries())) {
    if (bal === 0) map.delete(name);
  }

  return map;
}

/**
 * 특정 거래처의 현재 미수금.
 */
export async function getCurrentOutstanding(customerName: string): Promise<number> {
  const all = await getAllOutstandings();
  return all.get(customerName) ?? 0;
}

// ==================== 계산 — 영수증/집계표 출력 ====================

/**
 * 날짜 D 의 영수증·집계표 출력에 필요한 모든 거래처별 잔고 정보.
 *
 *   전잔고(X, D) = SUM(매출, 매출일 < D)  -  SUM(입금, 입금일 ≤ D)
 *   당일매출(X, D) = SUM(매출, 매출일 = D)
 *   총잔액 = 전잔고 + 당일매출
 *
 * @returns 모든 거래처 결과 Map. 호출자가 출력 정책에 따라 필터링.
 *   - 영수증 출력: 당일매출>0 인 것만 (전잔고만 있는 것은 출력 X)
 *   - 집계표:     당일매출>0 인 것만
 */
export async function getReceiptBalancesForDate(
  date: string,
): Promise<Map<string, ReceiptBalances>> {
  const userId = await getUserIdOrThrow();

  // 매출 — 전체 (전잔고 계산 위해 < D 필요, 당일매출 위해 = D 필요). 1000건 한계 우회.
  let txRows: { customer_name: string; quantity: number | null; unit_price: number | null; date: string }[];
  try {
    txRows = await fetchAllRows((from, to) =>
      supabase
        .from('transactions')
        .select('customer_name, quantity, unit_price, date')
        .eq('user_id', userId)
        .lte('date', date)
        .range(from, to),
    );
  } catch (txErr: any) {
    console.error('[getReceiptBalancesForDate] tx error:', txErr);
    throw new Error(`매출 조회 실패: ${txErr.message ?? txErr}`);
  }

  // 입금 — 입금일 ≤ D
  let payRows: { customer_name: string; amount: number; payment_date: string }[];
  try {
    payRows = await fetchAllRows((from, to) =>
      supabase
        .from('payments')
        .select('customer_name, amount, payment_date')
        .eq('user_id', userId)
        .lte('payment_date', date)
        .range(from, to),
    );
  } catch (payErr: any) {
    console.error('[getReceiptBalancesForDate] pay error:', payErr);
    throw new Error(`입금 조회 실패: ${payErr.message ?? payErr}`);
  }

  // 조정 — 조정일 ≤ D (테이블 미적용 환경에서도 안전)
  let adjRows: { customer_name: string; amount: number; adjustment_date: string }[] = [];
  try {
    adjRows = await fetchAllRows((from, to) =>
      supabase
        .from('adjustments')
        .select('customer_name, amount, adjustment_date')
        .eq('user_id', userId)
        .lte('adjustment_date', date)
        .range(from, to),
    );
  } catch (err: any) {
    console.warn('[getReceiptBalancesForDate] adjustments fetch 실패 (0으로 처리):', err.message ?? err);
  }

  // 거래처별로 prev/daily 누적
  const result = new Map<string, ReceiptBalances>();
  const getOrInit = (name: string): ReceiptBalances => {
    let r = result.get(name);
    if (!r) {
      r = { customerName: name, previousBalance: 0, dailyRevenue: 0, total: 0 };
      result.set(name, r);
    }
    return r;
  };

  for (const r of txRows ?? []) {
    const amount = (r.quantity ?? 0) * (r.unit_price ?? 0);
    const entry = getOrInit(r.customer_name);
    if (r.date < date) {
      entry.previousBalance += amount;
    } else if (r.date === date) {
      entry.dailyRevenue += amount;
    }
  }

  for (const r of payRows ?? []) {
    const entry = getOrInit(r.customer_name);
    entry.previousBalance -= r.amount ?? 0;
  }

  // 조정은 전잔고에 가산 (양수=미수↑, 음수=미수↓)
  for (const r of adjRows) {
    const entry = getOrInit(r.customer_name);
    entry.previousBalance += r.amount ?? 0;
  }

  // total 계산
  for (const entry of result.values()) {
    entry.total = entry.previousBalance + entry.dailyRevenue;
  }

  return result;
}

/**
 * 한 거래처의 잔고 정보만 필요한 경우 (특정 거래처 영수증 검색용).
 */
export async function getReceiptBalancesForCustomer(
  customerName: string,
  date: string,
): Promise<ReceiptBalances> {
  const all = await getReceiptBalancesForDate(date);
  return (
    all.get(customerName) ?? {
      customerName,
      previousBalance: 0,
      dailyRevenue: 0,
      total: 0,
    }
  );
}

// ==================== 입금 기록 조회 (audit) ====================

// ==================== 미수 거래처 리스트 (모달용) ====================

/**
 * 입금 입력 모달의 거래처 행 1개.
 */
export interface PendingCustomerRow {
  customerName: string;
  /** 현재 미수금. 양수가 일반. 음수 가능(선입금 후 상태) — Q1 정책. */
  outstanding: number;
}

/**
 * 입금 입력 모달용 — 현재 미수금이 있는 거래처 리스트.
 *   - 양수 미수금만 포함 (음수 = 선입금 상태는 모달에 안 보임)
 *   - 가나다순 정렬 (ko-KR)
 *
 * NOTE: 음수 미수금(선입금) 거래처를 모달에 노출할지는 추후 결정 가능.
 *       기본 정책: 입금 입력 화면 = "받아야 할 돈" 화면 → 양수만.
 */
export async function getPendingCustomers(): Promise<PendingCustomerRow[]> {
  const all = await getAllOutstandings();

  const rows: PendingCustomerRow[] = [];
  for (const [name, balance] of all) {
    if (balance > 0) {
      rows.push({ customerName: name, outstanding: balance });
    }
  }

  rows.sort((a, b) => a.customerName.localeCompare(b.customerName, 'ko-KR'));
  return rows;
}

/**
 * 입금 입력 모달용 — 특정 날짜 D 시점의 누적 미수금이 있는 거래처 리스트.
 *
 *   balance(D) = SUM(매출 ≤ D) - SUM(입금 ≤ D) + SUM(조정 ≤ D)
 *
 *   - 양수 미수금만 포함 (음수=선입금 상태는 모달에 안 보임)
 *   - 가나다순 정렬 (ko-KR)
 *
 * 입금 입력 화면에서 헤더 "~ YYYY-MM-DD" 의 기준이 되는 잔고를 계산.
 */
export async function getPendingCustomersAsOfDate(
  date: string,
): Promise<PendingCustomerRow[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`날짜 형식 오류 (YYYY-MM-DD): ${date}`);
  }

  const userId = await getUserIdOrThrow();

  // 1000건 한계 우회 위해 페이지네이션
  let txRows: { customer_name: string; quantity: number | null; unit_price: number | null }[];
  try {
    txRows = await fetchAllRows((from, to) =>
      supabase
        .from('transactions')
        .select('customer_name, quantity, unit_price')
        .eq('user_id', userId)
        .lte('date', date)
        .range(from, to),
    );
  } catch (txErr: any) {
    throw new Error(`매출 조회 실패: ${txErr.message ?? txErr}`);
  }

  let payRows: { customer_name: string; amount: number }[];
  try {
    payRows = await fetchAllRows((from, to) =>
      supabase
        .from('payments')
        .select('customer_name, amount')
        .eq('user_id', userId)
        .lte('payment_date', date)
        .range(from, to),
    );
  } catch (payErr: any) {
    throw new Error(`입금 조회 실패: ${payErr.message ?? payErr}`);
  }

  let adjRows: { customer_name: string; amount: number }[] = [];
  try {
    adjRows = await fetchAllRows((from, to) =>
      supabase
        .from('adjustments')
        .select('customer_name, amount')
        .eq('user_id', userId)
        .lte('adjustment_date', date)
        .range(from, to),
    );
  } catch (err: any) {
    console.warn(
      '[getPendingCustomersAsOfDate] adjustments fetch 실패 (0으로 처리):',
      err.message ?? err,
    );
  }

  const map = new Map<string, number>();
  for (const r of txRows ?? []) {
    const amount = (r.quantity ?? 0) * (r.unit_price ?? 0);
    map.set(r.customer_name, (map.get(r.customer_name) ?? 0) + amount);
  }
  for (const r of payRows ?? []) {
    map.set(r.customer_name, (map.get(r.customer_name) ?? 0) - (r.amount ?? 0));
  }
  for (const r of adjRows) {
    map.set(r.customer_name, (map.get(r.customer_name) ?? 0) + (r.amount ?? 0));
  }

  const rows: PendingCustomerRow[] = [];
  for (const [name, balance] of map) {
    if (balance > 0) rows.push({ customerName: name, outstanding: balance });
  }
  rows.sort((a, b) => a.customerName.localeCompare(b.customerName, 'ko-KR'));
  return rows;
}

// ==================== 입금 저장 ====================

/**
 * 입금 입력 모달에서 [저장] 시 사용하는 입력 타입.
 */
export interface PaymentInput {
  customerName: string;
  /** YYYY-MM-DD */
  paymentDate: string;
  /** 양의 정수 */
  amount: number;
}

/**
 * 오늘 날짜 (YYYY-MM-DD) — 로컬 타임존 기준.
 */
function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * PaymentInput 유효성 검증.
 *   - amount > 0 (양의 정수)
 *   - customerName 비어있지 않음
 *   - paymentDate YYYY-MM-DD 형식
 *   - paymentDate ≤ 오늘 (Q3 — 미래 날짜 차단)
 *
 * NOTE: amount > 현재미수금 검증 (Q1 경고)은 FE 모달에서 처리.
 *       BE는 단순 INSERT만 담당 (음수 미수금 허용).
 */
function validatePaymentInput(item: PaymentInput): void {
  if (!Number.isInteger(item.amount) || item.amount <= 0) {
    throw new Error(`입금금액은 양의 정수여야 합니다 (거래처: ${item.customerName}).`);
  }
  if (!item.customerName || !item.customerName.trim()) {
    throw new Error('거래처명이 비어있습니다.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.paymentDate)) {
    throw new Error(`입금일자 형식 오류 (YYYY-MM-DD): ${item.paymentDate}`);
  }
  if (item.paymentDate > todayStr()) {
    throw new Error(`미래 날짜로는 입금을 입력할 수 없습니다: ${item.paymentDate}`);
  }
}

/**
 * 여러 거래처의 입금을 한 번에 저장 (일괄 INSERT).
 *
 * 트랜잭션 보장: Supabase는 단일 .insert([...])를 atomic batch로 처리.
 * 하나라도 RLS·constraint 위반이면 전체 롤백.
 *
 * @returns 저장된 Payment 행들 (DB에서 부여받은 id 포함)
 */
export async function savePayments(items: PaymentInput[]): Promise<Payment[]> {
  if (items.length === 0) return [];

  // 사전 검증 (저장 시도 전에 모두 통과해야 INSERT)
  items.forEach(validatePaymentInput);

  const userId = await getUserIdOrThrow();

  const rows = items.map((it) => ({
    user_id: userId,
    customer_name: it.customerName,
    payment_date: it.paymentDate,
    amount: it.amount,
  }));

  const { data, error } = await supabase
    .from('payments')
    .insert(rows)
    .select();

  if (error) {
    console.error('[savePayments] Error:', error);
    throw new Error(`입금 저장 실패: ${error.message}`);
  }

  console.log('[savePayments] Saved:', data?.length ?? 0, '건');
  return (data ?? []).map(rowToPayment);
}

// ==================== 미수금 조정 ====================

/**
 * 조정 저장용 입력 타입.
 */
export interface AdjustmentInput {
  customerName: string;
  /** 조정 적용 일자 (YYYY-MM-DD). 기본=오늘 */
  adjustmentDate: string;
  /** 조정액. 양수=미수↑, 음수=미수↓. 0 금지. */
  amount: number;
}

/**
 * 조정 기록 한 줄.
 */
export interface Adjustment {
  id: string;
  customerName: string;
  /** YYYY-MM-DD */
  adjustmentDate: string;
  /** ±정수. 양수=미수↑, 음수=미수↓ */
  amount: number;
  /** YYYY-MM-DD HH:mm:ss */
  createdAt: string;
}

function rowToAdjustment(row: any): Adjustment {
  return {
    id: String(row.id),
    customerName: row.customer_name,
    adjustmentDate: row.adjustment_date,
    amount: row.amount,
    createdAt: formatCreatedAt(row.created_at),
  };
}

/**
 * 모든 조정 내역 — 날짜 내림차순 (보관함용).
 */
export async function getAllAdjustments(): Promise<Adjustment[]> {
  const userId = await getUserIdOrThrow();

  const { data, error } = await supabase
    .from('adjustments')
    .select('*')
    .eq('user_id', userId)
    .order('adjustment_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[getAllAdjustments] Error:', error);
    throw new Error(`조정 내역 조회 실패: ${error.message}`);
  }

  return (data ?? []).map(rowToAdjustment);
}

/**
 * 조정 수정 — 거래처/날짜/금액 모두 변경 가능.
 *   - amount ≠ 0 (정수)
 *   - adjustmentDate ≤ 오늘
 */
export async function updateAdjustment(
  id: string,
  fields: { customerName?: string; adjustmentDate?: string; amount?: number },
): Promise<Adjustment> {
  if (fields.amount !== undefined) {
    if (!Number.isInteger(fields.amount) || fields.amount === 0) {
      throw new Error('조정액은 0이 아닌 정수여야 합니다.');
    }
  }
  if (fields.adjustmentDate !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.adjustmentDate)) {
      throw new Error(`조정 일자 형식 오류 (YYYY-MM-DD): ${fields.adjustmentDate}`);
    }
    if (fields.adjustmentDate > todayStr()) {
      throw new Error(`미래 날짜로는 수정할 수 없습니다: ${fields.adjustmentDate}`);
    }
  }
  if (fields.customerName !== undefined && !fields.customerName.trim()) {
    throw new Error('거래처명이 비어있습니다.');
  }

  const userId = await getUserIdOrThrow();

  const patch: Record<string, any> = {};
  if (fields.customerName !== undefined) patch.customer_name = fields.customerName;
  if (fields.adjustmentDate !== undefined) patch.adjustment_date = fields.adjustmentDate;
  if (fields.amount !== undefined) patch.amount = fields.amount;

  const { data, error } = await supabase
    .from('adjustments')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('[updateAdjustment] Error:', error);
    throw new Error(`조정 수정 실패: ${error.message}`);
  }

  return rowToAdjustment(data);
}

/**
 * 조정 삭제.
 */
export async function deleteAdjustment(id: string): Promise<void> {
  const userId = await getUserIdOrThrow();

  const { error } = await supabase
    .from('adjustments')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    console.error('[deleteAdjustment] Error:', error);
    throw new Error(`조정 삭제 실패: ${error.message}`);
  }
}

/**
 * 미수금 조정 저장.
 *
 *   "조정 후 미수금" UI 입력 → 호출자가 (조정후 - 현재미수금) = 차액 계산 → 이 함수에 amount 로 전달.
 *
 * 예: 현재미수금 1,046,000 → 사용자가 3,400,000 입력
 *     amount = 3,400,000 - 1,046,000 = +2,354,000 저장
 */
export async function saveAdjustment(item: AdjustmentInput): Promise<void> {
  if (!Number.isInteger(item.amount) || item.amount === 0) {
    throw new Error('조정액은 0이 아닌 정수여야 합니다.');
  }
  if (!item.customerName || !item.customerName.trim()) {
    throw new Error('거래처명이 비어있습니다.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.adjustmentDate)) {
    throw new Error(`조정 일자 형식 오류 (YYYY-MM-DD): ${item.adjustmentDate}`);
  }

  const userId = await getUserIdOrThrow();

  const { error } = await supabase
    .from('adjustments')
    .insert({
      user_id: userId,
      customer_name: item.customerName,
      adjustment_date: item.adjustmentDate,
      amount: item.amount,
    });

  if (error) {
    console.error('[saveAdjustment] Error:', error);
    throw new Error(`조정 저장 실패: ${error.message}`);
  }

  console.log('[saveAdjustment] Saved:', item.customerName, item.amount);
}

// ==================== 입금 기록 조회 (audit) ====================

/**
 * 모든 입금 기록 — 날짜 내림차순 (보관함용).
 */
export async function getAllPayments(): Promise<Payment[]> {
  const userId = await getUserIdOrThrow();

  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('user_id', userId)
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[getAllPayments] Error:', error);
    throw new Error(`입금 기록 조회 실패: ${error.message}`);
  }

  return (data ?? []).map(rowToPayment);
}

/**
 * 입금 기록 수정 — 거래처/날짜/금액 모두 변경 가능.
 *   - amount > 0
 *   - paymentDate ≤ 오늘
 */
export async function updatePayment(
  id: string,
  fields: { customerName?: string; paymentDate?: string; amount?: number },
): Promise<Payment> {
  if (fields.amount !== undefined) {
    if (!Number.isInteger(fields.amount) || fields.amount <= 0) {
      throw new Error('입금금액은 양의 정수여야 합니다.');
    }
  }
  if (fields.paymentDate !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.paymentDate)) {
      throw new Error(`입금일자 형식 오류 (YYYY-MM-DD): ${fields.paymentDate}`);
    }
    if (fields.paymentDate > todayStr()) {
      throw new Error(`미래 날짜로는 수정할 수 없습니다: ${fields.paymentDate}`);
    }
  }
  if (fields.customerName !== undefined && !fields.customerName.trim()) {
    throw new Error('거래처명이 비어있습니다.');
  }

  const userId = await getUserIdOrThrow();

  const patch: Record<string, any> = {};
  if (fields.customerName !== undefined) patch.customer_name = fields.customerName;
  if (fields.paymentDate !== undefined) patch.payment_date = fields.paymentDate;
  if (fields.amount !== undefined) patch.amount = fields.amount;

  const { data, error } = await supabase
    .from('payments')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('[updatePayment] Error:', error);
    throw new Error(`입금 수정 실패: ${error.message}`);
  }

  return rowToPayment(data);
}

/**
 * 입금 기록 삭제.
 */
export async function deletePayment(id: string): Promise<void> {
  const userId = await getUserIdOrThrow();

  const { error } = await supabase
    .from('payments')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    console.error('[deletePayment] Error:', error);
    throw new Error(`입금 삭제 실패: ${error.message}`);
  }
}

/**
 * 특정 거래처의 입금 기록 전체 (날짜 내림차순).
 * — Q2 (수정/삭제 화면) 구현 시 사용 예정.
 */
export async function getPaymentsByCustomer(customerName: string): Promise<Payment[]> {
  const userId = await getUserIdOrThrow();

  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('user_id', userId)
    .eq('customer_name', customerName)
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[getPaymentsByCustomer] Error:', error);
    throw new Error(`입금 기록 조회 실패: ${error.message}`);
  }

  return (data ?? []).map(rowToPayment);
}
