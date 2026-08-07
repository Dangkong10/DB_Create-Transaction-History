-- ============================================================
-- 마이그레이션: add_payments RPC 에 출처(source, bank_alert_id) 추가
-- 날짜: 2026-08-06
-- 실행 위치: Supabase SQL Editor
-- 주의: 데이터를 변경하지 않습니다 (함수 재정의만).
--
-- 배경:
--   은행 문자에서 자동 반영된 입금과 손으로 넣은 입금을 구분해야 한다.
--   또 같은 문자가 두 번 입금 처리되는 것을 막아야 한다
--   (uniq_payments_bank_alert 유니크 인덱스가 DB 차원에서 차단).
--
-- 하위호환:
--   p_items 의 각 원소에 source / bank_alert_id 가 **없으면** 기존과 동일하게
--   'manual' / NULL 로 들어간다. 기존 호출부(수동 입금 입력)는 수정 불필요.
-- ============================================================

BEGIN;

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
        user_id, customer_name, payment_date, amount, source, bank_alert_id
      )
      VALUES (
        uid,
        item->>'customer_name',
        (item->>'payment_date')::date,
        (item->>'amount')::integer,
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
  IS '입금 행 단위 INSERT (배치). user_id 는 auth.uid() 로 강제. source/bank_alert_id 생략 시 manual/NULL.';

COMMIT;
