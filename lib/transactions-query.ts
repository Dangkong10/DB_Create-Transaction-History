/**
 * 날짜별 거래 조회 (서버 직행)
 *
 * 왜 필요한가:
 *   영수증/집계표 화면은 거래를 2단계로 로드한다 —
 *     1단계) 로컬 IndexedDB 로 즉시 렌더
 *     2단계) pullFromServer() 로 전체를 받아 교체
 *   그런데 잔고(getReceiptBalancesForDate)는 **항상 서버 직행**이다.
 *   1↔2단계 사이에 출력하면 "매출은 오래된 로컬 / 미수금은 최신 서버" 가 되어
 *   어긋난 숫자가 인쇄된다. (어제·그제 입금을 넣은 직후 특히 두드러진다 —
 *   그 입금들은 전잔고에 흡수되기 때문)
 *
 *   → 출력 시점에는 잔고와 **같은 서버·같은 시점**의 거래를 쓴다.
 *
 * 하루치(보통 40~100건)만 받으므로 전체 스캔보다 훨씬 가볍다.
 */

import { supabase } from './supabase';
import type { Transaction } from './excel-utils';

/**
 * 특정 날짜(YYYY-MM-DD)의 거래를 서버에서 조회한다.
 *
 * @throws 로그인이 없거나 네트워크/쿼리 실패 시. **호출자는 반드시 catch 해서
 *         로컬 캐시로 fallback 해야 한다** — 오프라인에서도 영수증은 나와야 한다.
 */
export async function getTransactionsForDate(date: string): Promise<Transaction[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`날짜 형식 오류 (YYYY-MM-DD): ${date}`);
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('로그인이 필요합니다.');

  // 하루치라 보통 1페이지로 끝나지만, 대량 입력일에도 잘리지 않도록 페이지네이션.
  const PAGE = 1000;
  const rows: any[] = [];
  for (let i = 0; i < 20; i++) {
    const from = i * PAGE;
    const { data, error } = await supabase
      .from('transactions')
      .select('id, customer_name, product_name, quantity, unit_price, date, created_at')
      .eq('user_id', session.user.id)
      .eq('date', date)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`거래 조회 실패: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }

  return rows.map((r) => ({
    id: String(r.id),
    customerName: r.customer_name,
    productName: r.product_name,
    quantity: r.quantity,
    unitPrice: r.unit_price,
    date: r.date,
    createdAt: r.created_at,
  })) as Transaction[];
}
