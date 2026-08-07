/**
 * 은행 입금 알림(bank_alerts) 조회 · 상태 변경
 *
 * 문자를 적재하는 쪽은 맥에서 도는 브리지(~/L_Resources/Tools/bank-sms-bridge)이고,
 * 앱은 여기서 읽어 /deposit 화면의 금액 칸을 미리 채운다.
 */

import { supabase } from './supabase';

export type BankAlertStatus = 'pending' | 'confirmed' | 'ignored' | 'unparsed';

export interface BankAlert {
  id: string;
  /** 거래일 (YYYY-MM-DD) — 문자의 MM/DD 에 수신 연도를 붙인 값 */
  txDate: string;
  /** 문자를 받은 시각 */
  receivedAt: string;
  amount: number;
  /** 입금자명 원문. '유현수(해비치)' 처럼 괄호가 붙어 오기도 한다 */
  senderName: string | null;
  accountTail: string | null;
  balance: number | null;
  rawText: string;
  status: BankAlertStatus;
}

function rowToAlert(row: any): BankAlert {
  return {
    id: String(row.id),
    txDate: row.tx_date,
    receivedAt: row.received_at,
    amount: Number(row.amount),
    senderName: row.sender_name,
    accountTail: row.account_tail,
    balance: row.balance == null ? null : Number(row.balance),
    rawText: row.raw_text,
    status: row.status,
  };
}

async function getUserIdOrThrow(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('로그인이 필요합니다.');
  return session.user.id;
}

/**
 * 특정 날짜의 **미처리** 입금 알림.
 * /deposit 화면이 그 날짜를 열 때 호출한다.
 */
export async function getPendingAlertsForDate(date: string): Promise<BankAlert[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`날짜 형식 오류 (YYYY-MM-DD): ${date}`);
  }
  const userId = await getUserIdOrThrow();

  const { data, error } = await supabase
    .from('bank_alerts')
    .select('*')
    .eq('user_id', userId)
    .eq('tx_date', date)
    .eq('status', 'pending')
    .order('received_at', { ascending: true });

  if (error) {
    console.error('[getPendingAlertsForDate] Error:', error);
    throw new Error(`입금 알림 조회 실패: ${error.message}`);
  }
  return (data ?? []).map(rowToAlert);
}

/**
 * **날짜와 상관없이** 아직 처리하지 않은 입금 알림 전체.
 *
 * 입금 화면이 이걸 쓴다. 입금은 보통 전날(또는 그 이전) 거래에 대해 들어오므로,
 * 화면에서 날짜를 고르게 하면 매번 날짜를 바꿔야 하고 실제로 그 때문에
 * 오늘 문자가 어제 날짜로 저장되는 사고가 났다.
 * 미처리 알림을 한 번에 보여주고, 저장할 때 각자 자기 tx_date 로 기록한다.
 */
export async function getAllPendingAlerts(): Promise<BankAlert[]> {
  const userId = await getUserIdOrThrow();

  const { data, error } = await supabase
    .from('bank_alerts')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('tx_date', { ascending: true })
    .order('received_at', { ascending: true });

  if (error) {
    console.error('[getAllPendingAlerts] Error:', error);
    throw new Error(`입금 알림 조회 실패: ${error.message}`);
  }
  return (data ?? []).map(rowToAlert);
}

/**
 * 보관함 탭용 — 전체 알림 목록 (최근 순).
 * 1000건 한계를 넘지 않도록 기간을 제한할 수 있다.
 */
export async function getAllAlerts(limit = 500): Promise<BankAlert[]> {
  const userId = await getUserIdOrThrow();

  const { data, error } = await supabase
    .from('bank_alerts')
    .select('*')
    .eq('user_id', userId)
    .order('received_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[getAllAlerts] Error:', error);
    throw new Error(`입금 알림 조회 실패: ${error.message}`);
  }
  return (data ?? []).map(rowToAlert);
}

/** 알림 상태 변경 (확정 / 무시 되돌리기 등) */
export async function setAlertStatus(ids: string[], status: BankAlertStatus): Promise<void> {
  if (ids.length === 0) return;
  const userId = await getUserIdOrThrow();

  const { error } = await supabase
    .from('bank_alerts')
    .update({ status })
    .eq('user_id', userId)
    .in('id', ids);

  if (error) {
    console.error('[setAlertStatus] Error:', error);
    throw new Error(`알림 상태 변경 실패: ${error.message}`);
  }
}
