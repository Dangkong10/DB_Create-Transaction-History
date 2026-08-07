-- ============================================================
-- 마이그레이션: 부가세 포함 입금 처리
-- 날짜: 2026-08-06
-- 실행 위치: Supabase SQL Editor
-- 주의: 기존 데이터를 변경하지 않습니다 (컬럼 추가 + 함수 재정의).
--
-- 배경:
--   일부 거래처는 공급가에 부가세 10% 를 더해 이체한다.
--   미수금은 SUM(transactions) 즉 **공급가** 기준이라, 부가세까지 입금으로
--   적으면 미수금이 음수가 된다 (169,000 받을 곳에서 185,900 이 들어오면 -16,900).
--
-- 채택한 방식 (사용자 확정 2026-08-06 — '다안: 공급가 + 부가세 분리'):
--   payments.amount      = 169,000  ← 미수금 계산에 쓰이는 공급가
--   payments.vat_amount  =  16,900  ← 미수금과 무관. 부가세 집계용
--   실제 입금액          = 185,900  ← amount + vat_amount, 통장과 일치
--
--   · 미수금 공식(SUM(매출) - SUM(입금) + SUM(조정))은 amount 만 보므로 그대로 0 이 된다
--   · 통장 대조는 amount + vat_amount 로 맞는다
--   · 부가세 신고는 SUM(vat_amount) 로 바로 뽑는다
--   → 잔고 RPC 3종은 수정할 필요가 없다 (amount 만 쓰므로)
-- ============================================================

BEGIN;

-- ============================================================
-- 1. 거래처: 부가세 포함 입금 여부
-- ============================================================
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS vat_included BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.customers.vat_included IS
  'true 면 이 거래처는 공급가에 부가세를 더해 이체한다. 입금 화면의 기준 금액이 부가세 포함으로 표시된다.';

-- ============================================================
-- 2. 입금: 부가세 금액
--    amount 는 그대로 공급가다. 미수금 계산식을 건드리지 않기 위함.
-- ============================================================
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS vat_amount INTEGER NOT NULL DEFAULT 0 CHECK (vat_amount >= 0);

COMMENT ON COLUMN public.payments.vat_amount IS
  '함께 받은 부가세. 미수금 계산에는 쓰이지 않는다. 실제 이체액 = amount + vat_amount.';

-- ============================================================
-- 3. add_payments RPC — vat_amount 받도록 확장
--    생략하면 0 (기존 호출부 수정 불필요)
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_payments(p_items JSONB)
RETURNS SETOF public.payments
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  item JSONB;
  uid  UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    RETURN QUERY
      INSERT INTO public.payments (
        user_id, customer_name, payment_date, amount, vat_amount, source, bank_alert_id
      )
      VALUES (
        uid,
        item->>'customer_name',
        (item->>'payment_date')::date,
        (item->>'amount')::integer,
        COALESCE(NULLIF(item->>'vat_amount', '')::integer, 0),
        COALESCE(NULLIF(item->>'source', ''), 'manual'),
        NULLIF(item->>'bank_alert_id', '')::bigint
      )
      RETURNING *;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.add_payments(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_payments(JSONB) TO authenticated;

COMMENT ON FUNCTION public.add_payments(JSONB)
  IS '입금 행 단위 INSERT (배치). user_id 는 auth.uid() 로 강제. amount 는 공급가, vat_amount 는 함께 받은 부가세. source/bank_alert_id 생략 시 manual/NULL.';

COMMIT;

-- ============================================================
-- 확인 (선택)
--   SELECT name, vat_included FROM public.customers WHERE vat_included;
--   SELECT source, count(*), sum(amount) AS 공급가, sum(vat_amount) AS 부가세
--     FROM public.payments GROUP BY source;
-- ============================================================
