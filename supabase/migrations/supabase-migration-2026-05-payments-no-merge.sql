-- ============================================================
-- 마이그레이션: payments — UNIQUE 제거 + RPC 누적합산 해제
-- 날짜: 2026-05-27
-- 실행 위치: Supabase SQL Editor 또는 psql
--
-- 배경:
--   2026-05-26 의 payments-upsert 마이그레이션이 "한 거래처 × 한 날짜 = 한 행" 을
--   DB 차원에서 강제했음 (UNIQUE 제약 + ON CONFLICT DO UPDATE 로 amount 누적합산).
--   → 같은 날 두 번 입금을 입력해도 한 행에 amount 가 더해질 뿐, 두 행으로 분리 불가.
--
-- 정책 변경:
--   "보관함은 입력 단위(=행 단위) 그대로 보존, 합산은 당일 집계표/잔고 계산 쿼리에서만."
--   → UNIQUE 제약 해제, RPC 는 순수 INSERT 만 수행.
--
-- 호환성:
--   - 이미 합쳐진 행의 amount 는 합계 그대로 남음 (1+1=2 를 다시 1,1 로 쪼갤 정보 없음).
--   - 잔고/미수금/집계표 계산은 모두 SUM 기반이라 영향 없음.
--   - updatePayment / deletePayment 는 id 로 타깃팅하므로 행별 독립 수정/삭제 가능.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. UNIQUE 제약 해제
--    (있으면 제거, 없으면 NOOP — dev/prod 환경 차이에도 안전)
-- ============================================================
ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_user_customer_date_uniq;

-- ============================================================
-- 2. add_payments RPC 재정의 — ON CONFLICT 절 제거
--    배치 INSERT 와 auth.uid() 강제 user_id 주입은 그대로 유지.
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_payments(p_items JSONB)
RETURNS SETOF public.payments
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  item   JSONB;
  uid    UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    RETURN QUERY
      INSERT INTO public.payments (user_id, customer_name, payment_date, amount)
      VALUES (
        uid,
        item->>'customer_name',
        (item->>'payment_date')::date,
        (item->>'amount')::integer
      )
      RETURNING *;
  END LOOP;
END;
$$;

-- 권한은 그대로 유지 (혹시 CREATE OR REPLACE 가 권한을 리셋할 경우 대비해 재부여)
REVOKE ALL ON FUNCTION public.add_payments(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_payments(JSONB) TO authenticated;

-- ============================================================
-- 3. 코멘트 갱신
-- ============================================================
COMMENT ON FUNCTION public.add_payments(JSONB)
  IS '입금 행 단위 INSERT (배치). user_id 는 auth.uid() 로 강제. 합산은 쿼리 시점에 수행.';

-- ============================================================
-- 4. 검증 쿼리 (수동 확인용)
-- ============================================================
-- 제약이 빠졌는지:
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'public.payments'::regclass AND contype = 'u';
--   → payments_user_customer_date_uniq 가 없어야 함.

COMMIT;
