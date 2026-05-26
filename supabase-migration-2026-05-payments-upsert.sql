-- ============================================================
-- 마이그레이션: payments — (user, customer, date) 유니크 + 누적 입금 RPC
-- 날짜: 2026-05-26
-- 실행 위치: Supabase SQL Editor
--
-- 목적:
--   savePayments 를 INSERT → "있으면 합산, 없으면 추가" 로 바꾼다.
--   "한 거래처 × 한 날짜 = 한 행" 보장.
--   다시 저장하면 기존 amount 에 새 amount 가 **더해진다 (누적)**.
--
-- 동작:
--   1) 같은 (user_id, customer_name, payment_date) 인 기존 중복 행 → amount 합산해 한 행으로 병합.
--      가장 오래된 id 를 살리고 나머지는 DELETE.
--   2) UNIQUE (user_id, customer_name, payment_date) 제약 추가.
--   3) RPC 함수 add_payments(jsonb) 생성 — 클라이언트는 이걸 호출해서 누적 저장.
--
-- 비가역: 백업 권장 (특히 step 1 의 DELETE).
--   CREATE TABLE payments_backup_2026_05_26 AS SELECT * FROM public.payments;
-- ============================================================

BEGIN;

-- ============================================================
-- 0. 안전 백업 테이블 — 필요시 롤백용
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payments_backup_2026_05_26 AS
  SELECT * FROM public.payments;

-- ============================================================
-- 1. 중복 행 병합
--    (user_id, customer_name, payment_date) 가 같은 그룹에서
--    keep_id = MIN(id) (가장 먼저 들어온 행)
--    keep_id 의 amount := 그룹 SUM(amount)
--    나머지 행은 삭제.
-- ============================================================

-- 1a. 그룹별 SUM 과 살릴 id 계산
WITH grouped AS (
  SELECT
    user_id,
    customer_name,
    payment_date,
    MIN(id) AS keep_id,
    SUM(amount) AS total_amount
  FROM public.payments
  GROUP BY user_id, customer_name, payment_date
  HAVING COUNT(*) > 1
)
UPDATE public.payments p
SET amount = g.total_amount
FROM grouped g
WHERE p.id = g.keep_id;

-- 1b. 살린 id 외 나머지 중복 행 삭제
DELETE FROM public.payments p
WHERE EXISTS (
  SELECT 1
  FROM public.payments q
  WHERE q.user_id = p.user_id
    AND q.customer_name = p.customer_name
    AND q.payment_date = p.payment_date
    AND q.id < p.id  -- 더 오래된 행 있으면 현재 행은 삭제
);

-- ============================================================
-- 2. UNIQUE 제약 추가 (이미 있으면 skip)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payments_user_customer_date_uniq'
      AND conrelid = 'public.payments'::regclass
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_user_customer_date_uniq
      UNIQUE (user_id, customer_name, payment_date);
  END IF;
END $$;

-- ============================================================
-- 3. RPC 함수 add_payments(jsonb) — 누적 upsert
--
--    클라이언트가 이렇게 호출:
--      supabase.rpc('add_payments', { p_items: [
--        { customer_name: '고려', payment_date: '2026-05-25', amount: 50000 },
--        ...
--      ]})
--
--    같은 (user, customer, date) 가 이미 있으면 amount += 새 amount.
--    없으면 새 행 INSERT.
--    user_id 는 auth.uid() 로 강제 — 클라이언트가 임의의 user_id 를 못 넣음.
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
      ON CONFLICT (user_id, customer_name, payment_date)
      DO UPDATE SET amount = payments.amount + EXCLUDED.amount
      RETURNING *;
  END LOOP;
END;
$$;

-- 익명·게스트 차단. authenticated 만 실행 가능.
REVOKE ALL ON FUNCTION public.add_payments(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_payments(JSONB) TO authenticated;

-- ============================================================
-- 4. 검증 쿼리 (수동 확인용)
-- ============================================================
-- 중복이 더 이상 없는지:
--   SELECT user_id, customer_name, payment_date, COUNT(*)
--   FROM public.payments
--   GROUP BY 1,2,3 HAVING COUNT(*) > 1;
-- → 0행이어야 함.

-- ============================================================
-- 5. 코멘트
-- ============================================================
COMMENT ON CONSTRAINT payments_user_customer_date_uniq ON public.payments
  IS '한 거래처 × 한 날짜 = 한 행. add_payments() 가 충돌 시 amount 합산.';

COMMENT ON FUNCTION public.add_payments(JSONB)
  IS '입금 누적 upsert. (user, customer, date) 충돌 시 amount += EXCLUDED.amount.';

COMMIT;
