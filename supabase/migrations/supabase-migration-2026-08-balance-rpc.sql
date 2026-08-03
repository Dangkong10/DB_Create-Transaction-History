-- ============================================================
-- 마이그레이션: 미수금/잔고 집계를 DB 로 이전 (RPC 3종)
-- 날짜: 2026-08-01
-- 실행 위치: Supabase SQL Editor
-- 주의: 데이터를 변경하지 않습니다 (읽기 전용 함수 + 인덱스 추가만).
--
-- 배경:
--   기존 lib/payments.ts 는 transactions/payments/adjustments 를 통째로
--   클라이언트로 내려받아 JS Map 으로 합산했다. fetchAllRows 에 50페이지
--   (=5만 건) 상한이 있어, 하루 100건 페이스면 약 1년 8개월 뒤 도달한다.
--   상한을 넘으면 에러 없이 루프가 멈추고 "잘린 데이터로 계산된 틀린 잔고"가
--   경고 없이 영수증에 찍힌다.
--
--   → 합산을 Postgres 로 내려 행 수 상한을 없앤다. 클라이언트는 거래처 수
--     (~100행) 만 받는다.
--
-- 계산 공식은 lib/payments.ts 의 JS 구현과 **1원도 다르지 않아야 한다**:
--   현재미수금   = SUM(매출) - SUM(입금) + SUM(조정)
--   전잔고(D)    = SUM(매출, 매출일 < D) - SUM(입금, 입금일 < D) + SUM(조정, 조정일 <= D)
--   당일매출(D)  = SUM(매출, 매출일 = D)
--   당일입금(D)  = SUM(입금, 입금일 = D)
--   총잔액       = 전잔고 + 당일매출 - 당일입금
--
-- 주의사항 2가지 (JS 와 어긋나기 쉬운 지점):
--   1) 정수 오버플로 — quantity/unit_price 는 INTEGER 이고 Postgres 에서
--      INTEGER * INTEGER 는 INTEGER 연산이라 21억 초과 시 에러가 난다.
--      JS 는 double 이라 안 터지므로 RPC 에서만 터진다.
--      → **곱셈 전에** ::BIGINT 로 캐스팅한다.
--   2) 반품 — transactions.quantity 는 음수로 저장된다 (스키마 주석: '수량 (음수 = 반품)').
--      매출 차감이 정상 동작하도록 **음수를 필터링하지 않는다**.
--
-- 정렬은 SQL 에서 하지 않는다. 클라이언트의 localeCompare('ko-KR') 와
-- collation 결과가 미묘하게 다를 수 있으므로 정렬은 기존대로 클라이언트가 맡는다.
-- 0/음수 필터도 호출자마다 정책이 달라 SQL 은 전부 반환한다.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. 현재 미수금 (날짜 무관) — getAllOutstandings() 대체
-- ============================================================
CREATE OR REPLACE FUNCTION public.outstanding_balances()
RETURNS TABLE (customer_name TEXT, balance BIGINT)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  WITH tx AS (
    SELECT t.customer_name AS cname,
           SUM(COALESCE(t.quantity, 0)::BIGINT * COALESCE(t.unit_price, 0)::BIGINT) AS amt
    FROM public.transactions t
    WHERE t.user_id = auth.uid()
    GROUP BY t.customer_name
  ),
  pay AS (
    SELECT p.customer_name AS cname,
           SUM(COALESCE(p.amount, 0)::BIGINT) AS amt
    FROM public.payments p
    WHERE p.user_id = auth.uid()
    GROUP BY p.customer_name
  ),
  adj AS (
    SELECT a.customer_name AS cname,
           SUM(COALESCE(a.amount, 0)::BIGINT) AS amt
    FROM public.adjustments a
    WHERE a.user_id = auth.uid()
    GROUP BY a.customer_name
  ),
  names AS (
    SELECT cname FROM tx
    UNION
    SELECT cname FROM pay
    UNION
    SELECT cname FROM adj
  )
  SELECT n.cname,
         COALESCE(tx.amt, 0) - COALESCE(pay.amt, 0) + COALESCE(adj.amt, 0)
  FROM names n
  LEFT JOIN tx  ON tx.cname  = n.cname
  LEFT JOIN pay ON pay.cname = n.cname
  LEFT JOIN adj ON adj.cname = n.cname;
$$;

REVOKE ALL ON FUNCTION public.outstanding_balances() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.outstanding_balances() TO authenticated;

COMMENT ON FUNCTION public.outstanding_balances()
  IS '거래처별 현재 미수금 (날짜 무관). SUM(매출)-SUM(입금)+SUM(조정). 0/음수 필터·정렬은 클라이언트 담당.';

-- ============================================================
-- 2. D 시점 누적 미수금 — getPendingCustomersAsOfDate(date) 대체
-- ============================================================
CREATE OR REPLACE FUNCTION public.outstanding_balances_as_of(p_date DATE)
RETURNS TABLE (customer_name TEXT, balance BIGINT)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  WITH tx AS (
    SELECT t.customer_name AS cname,
           SUM(COALESCE(t.quantity, 0)::BIGINT * COALESCE(t.unit_price, 0)::BIGINT) AS amt
    FROM public.transactions t
    WHERE t.user_id = auth.uid() AND t.date <= p_date
    GROUP BY t.customer_name
  ),
  pay AS (
    SELECT p.customer_name AS cname,
           SUM(COALESCE(p.amount, 0)::BIGINT) AS amt
    FROM public.payments p
    WHERE p.user_id = auth.uid() AND p.payment_date <= p_date
    GROUP BY p.customer_name
  ),
  adj AS (
    SELECT a.customer_name AS cname,
           SUM(COALESCE(a.amount, 0)::BIGINT) AS amt
    FROM public.adjustments a
    WHERE a.user_id = auth.uid() AND a.adjustment_date <= p_date
    GROUP BY a.customer_name
  ),
  names AS (
    SELECT cname FROM tx
    UNION
    SELECT cname FROM pay
    UNION
    SELECT cname FROM adj
  )
  SELECT n.cname,
         COALESCE(tx.amt, 0) - COALESCE(pay.amt, 0) + COALESCE(adj.amt, 0)
  FROM names n
  LEFT JOIN tx  ON tx.cname  = n.cname
  LEFT JOIN pay ON pay.cname = n.cname
  LEFT JOIN adj ON adj.cname = n.cname;
$$;

REVOKE ALL ON FUNCTION public.outstanding_balances_as_of(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.outstanding_balances_as_of(DATE) TO authenticated;

COMMENT ON FUNCTION public.outstanding_balances_as_of(DATE)
  IS 'D 시점 누적 미수금. 매출/입금/조정 모두 <= D. 양수 필터·정렬은 클라이언트 담당.';

-- ============================================================
-- 3. 영수증/집계표용 잔고 — getReceiptBalancesForDate(date) 대체
--
--   전잔고   = 매출(< D) - 입금(< D) + 조정(<= D)   ← 조정만 경계가 <=
--   당일매출 = 매출(= D)
--   당일입금 = 입금(= D)
--   총잔액(= 전잔고 + 당일매출 - 당일입금) 은 클라이언트가 계산 (기존과 동일)
-- ============================================================
CREATE OR REPLACE FUNCTION public.receipt_balances_for_date(p_date DATE)
RETURNS TABLE (
  customer_name    TEXT,
  previous_balance BIGINT,
  daily_revenue    BIGINT,
  daily_payment    BIGINT
)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  WITH tx AS (
    SELECT t.customer_name AS cname,
           SUM(CASE WHEN t.date < p_date
                    THEN COALESCE(t.quantity, 0)::BIGINT * COALESCE(t.unit_price, 0)::BIGINT
                    ELSE 0 END) AS prev_rev,
           SUM(CASE WHEN t.date = p_date
                    THEN COALESCE(t.quantity, 0)::BIGINT * COALESCE(t.unit_price, 0)::BIGINT
                    ELSE 0 END) AS daily_rev
    FROM public.transactions t
    WHERE t.user_id = auth.uid() AND t.date <= p_date
    GROUP BY t.customer_name
  ),
  pay AS (
    SELECT p.customer_name AS cname,
           SUM(CASE WHEN p.payment_date < p_date THEN COALESCE(p.amount, 0)::BIGINT ELSE 0 END) AS prev_pay,
           SUM(CASE WHEN p.payment_date = p_date THEN COALESCE(p.amount, 0)::BIGINT ELSE 0 END) AS daily_pay
    FROM public.payments p
    WHERE p.user_id = auth.uid() AND p.payment_date <= p_date
    GROUP BY p.customer_name
  ),
  adj AS (
    SELECT a.customer_name AS cname,
           SUM(COALESCE(a.amount, 0)::BIGINT) AS amt
    FROM public.adjustments a
    WHERE a.user_id = auth.uid() AND a.adjustment_date <= p_date
    GROUP BY a.customer_name
  ),
  names AS (
    SELECT cname FROM tx
    UNION
    SELECT cname FROM pay
    UNION
    SELECT cname FROM adj
  )
  SELECT n.cname,
         COALESCE(tx.prev_rev, 0) - COALESCE(pay.prev_pay, 0) + COALESCE(adj.amt, 0),
         COALESCE(tx.daily_rev, 0),
         COALESCE(pay.daily_pay, 0)
  FROM names n
  LEFT JOIN tx  ON tx.cname  = n.cname
  LEFT JOIN pay ON pay.cname = n.cname
  LEFT JOIN adj ON adj.cname = n.cname;
$$;

REVOKE ALL ON FUNCTION public.receipt_balances_for_date(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receipt_balances_for_date(DATE) TO authenticated;

COMMENT ON FUNCTION public.receipt_balances_for_date(DATE)
  IS '영수증/집계표용 거래처별 전잔고·당일매출·당일입금. 총잔액은 클라이언트가 계산. 반품(음수 수량) 포함.';

-- ============================================================
-- 4. 인덱스 보강
--    현재 transactions 에는 (user_id) 와 (date) 가 따로 있어, 위 RPC 의
--    "user_id = ? AND date <= ?" 조합에 복합 인덱스가 더 효율적이다.
--    payments/adjustments 는 이미 (user_id, customer_name, *_date) 계열이 있다.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_transactions_user_date
  ON public.transactions(user_id, date);

COMMIT;

-- ============================================================
-- 검증 (선택) — 실행 계획 확인
--   위 RPC 가 실제로 인덱스를 타는지 EXPLAIN ANALYZE 로 확인한다.
--   인덱스를 못 타면 서버 집계가 오히려 느릴 수 있다.
--
--   EXPLAIN ANALYZE SELECT * FROM public.receipt_balances_for_date(CURRENT_DATE);
-- ============================================================
