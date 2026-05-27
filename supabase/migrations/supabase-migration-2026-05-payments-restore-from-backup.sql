-- ============================================================
-- 마이그레이션 (prod 전용): payments 합산 복원
-- 날짜: 2026-05-27
-- 실행 위치: Supabase SQL Editor 또는 psql
--
-- 배경:
--   2026-05-26 의 payments-upsert 마이그레이션이 (user, customer, date)
--   중복 행을 amount SUM 하여 한 행으로 합쳤다. 백업 테이블에 원본 51행이
--   살아있고, 사용자는 합산 후 그 행들을 수정한 적이 없다 (사전 검증 완료).
--
-- 전제:
--   1. supabase-migration-2026-05-payments-no-merge.sql 이 먼저 적용되어
--      UNIQUE (user_id, customer_name, payment_date) 제약이 제거되어야 함.
--   2. public.payments_backup_2026_05_26 테이블이 존재하고 비어있지 않음.
--   3. 합산된 그룹의 현재 amount 가 백업 SUM 과 일치 (= 사용자가 그 후 수정 안 함).
--      → 이 검증이 본 트랜잭션 안에서 자동 수행되며, 어긋나면 전체 롤백.
--
-- 동작:
--   1. 사전 검증 — UNIQUE 부재 / 백업 존재 / 합산 행 amount 일치
--   2. kept_id (각 그룹의 MIN(id)) 행의 amount 를 백업의 원본 값으로 되돌림
--   3. 백업의 나머지 행 (kept_id 가 아닌 행) 을 id/created_at 그대로 INSERT
--   4. 시퀀스를 MAX(id) 이상으로 setval (다음 INSERT 가 id 충돌 안 나게)
--   5. 사후 검증 — 행 수가 백업과 일치, 합산된 그룹이 다시 N 행씩
--
-- 멱등성:
--   재실행 시 — 이미 복원되어 있다면 2단계 UPDATE 는 동일 값, 3단계 INSERT 는
--   NOT EXISTS 가드로 skip. 안전하게 두 번 돌려도 결과 동일.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. 사전 검증
-- ============================================================
DO $$
DECLARE
  uniq_exists  BOOLEAN;
  backup_count INTEGER;
  mismatch     INTEGER;
BEGIN
  -- 1a. UNIQUE 제약이 이미 제거되었는지 (있으면 INSERT 충돌)
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_user_customer_date_uniq'
      AND conrelid = 'public.payments'::regclass
  ) INTO uniq_exists;

  IF uniq_exists THEN
    RAISE EXCEPTION
      'UNIQUE 제약(payments_user_customer_date_uniq) 이 아직 살아있습니다. '
      'supabase-migration-2026-05-payments-no-merge.sql 을 먼저 적용하세요.';
  END IF;

  -- 1b. 백업 테이블이 존재하고 비어있지 않은지
  SELECT COUNT(*) INTO backup_count FROM public.payments_backup_2026_05_26;
  IF backup_count = 0 THEN
    RAISE EXCEPTION '백업 테이블(payments_backup_2026_05_26) 이 비어있습니다. 복원할 데이터가 없습니다.';
  END IF;

  -- 1c. 합산된 그룹의 현재 amount 가 백업 SUM 과 일치하는지
  --     (사용자가 합산 후 그 행들을 수정했다면 복원이 위험 → 중단)
  SELECT COUNT(*) INTO mismatch
  FROM (
    SELECT user_id, customer_name, payment_date,
           MIN(id) AS kept_id,
           SUM(amount) AS expected_sum
    FROM public.payments_backup_2026_05_26
    GROUP BY 1,2,3
    HAVING COUNT(*) > 1
  ) g
  JOIN public.payments p ON p.id = g.kept_id
  WHERE p.amount <> g.expected_sum;

  IF mismatch > 0 THEN
    RAISE EXCEPTION
      '합산된 행 중 %건의 amount 가 백업 SUM 과 일치하지 않습니다. '
      '합산 이후 사용자가 그 행을 수정한 흔적 — 자동 복원 중단.', mismatch;
  END IF;

  RAISE NOTICE '사전 검증 통과 — 백업 %건, 합산 그룹 정상.', backup_count;
END $$;

-- ============================================================
-- 2. kept_id 행의 amount 를 백업의 원본 값으로 되돌림
--    (kept_id 는 각 그룹의 MIN(id) — 그 행이 합산 후에도 살아남았던 행)
-- ============================================================
WITH groups AS (
  SELECT
    MIN(id) AS kept_id,
    user_id,
    customer_name,
    payment_date
  FROM public.payments_backup_2026_05_26
  GROUP BY user_id, customer_name, payment_date
  HAVING COUNT(*) > 1
),
backup_kept AS (
  SELECT b.id, b.amount
  FROM public.payments_backup_2026_05_26 b
  JOIN groups g ON g.kept_id = b.id
)
UPDATE public.payments p
SET amount = bk.amount
FROM backup_kept bk
WHERE p.id = bk.id
  AND p.amount <> bk.amount;  -- 멱등: 이미 같으면 skip

-- ============================================================
-- 3. 백업의 나머지 행 (kept_id 가 아닌 = 합산 시 삭제된 행) 을 다시 INSERT
--    id, created_at 모두 백업 값 보존.
--    NOT EXISTS 가드로 멱등성 확보.
-- ============================================================
WITH groups AS (
  SELECT
    MIN(id) AS kept_id,
    user_id,
    customer_name,
    payment_date
  FROM public.payments_backup_2026_05_26
  GROUP BY user_id, customer_name, payment_date
  HAVING COUNT(*) > 1
),
to_restore AS (
  SELECT b.*
  FROM public.payments_backup_2026_05_26 b
  JOIN groups g
    ON g.user_id = b.user_id
   AND g.customer_name = b.customer_name
   AND g.payment_date = b.payment_date
  WHERE b.id <> g.kept_id
)
INSERT INTO public.payments (id, user_id, customer_name, payment_date, amount, created_at)
SELECT id, user_id, customer_name, payment_date, amount, created_at
FROM to_restore r
WHERE NOT EXISTS (
  SELECT 1 FROM public.payments p WHERE p.id = r.id
);

-- ============================================================
-- 4. 시퀀스 바운스 — 다음 INSERT 가 복원된 최대 id 보다 큰 id 를 받도록
-- ============================================================
SELECT setval(
  pg_get_serial_sequence('public.payments', 'id'),
  GREATEST(
    (SELECT COALESCE(MAX(id), 0) FROM public.payments),
    (SELECT last_value FROM public.payments_id_seq)
  )
);

-- ============================================================
-- 5. 사후 검증
-- ============================================================
DO $$
DECLARE
  backup_count  INTEGER;
  current_count INTEGER;
  bad_groups    INTEGER;
BEGIN
  SELECT COUNT(*) INTO backup_count FROM public.payments_backup_2026_05_26;
  SELECT COUNT(*) INTO current_count FROM public.payments;

  IF current_count < backup_count THEN
    RAISE EXCEPTION
      '복원 후 행 수 (%) 가 백업 (%) 보다 적습니다. 무언가 빠졌습니다.',
      current_count, backup_count;
  END IF;

  -- 합산되었던 그룹이 다시 백업과 같은 행 수로 복원되었는지
  SELECT COUNT(*) INTO bad_groups
  FROM (
    SELECT user_id, customer_name, payment_date, COUNT(*) AS expected
    FROM public.payments_backup_2026_05_26
    GROUP BY 1,2,3
    HAVING COUNT(*) > 1
  ) b
  JOIN (
    SELECT user_id, customer_name, payment_date, COUNT(*) AS actual
    FROM public.payments
    GROUP BY 1,2,3
  ) c USING (user_id, customer_name, payment_date)
  WHERE b.expected <> c.actual;

  IF bad_groups > 0 THEN
    RAISE EXCEPTION
      '복원 후 %개 그룹의 행 수가 백업과 다릅니다.', bad_groups;
  END IF;

  RAISE NOTICE '복원 완료 — 행 수: % (backup: %), 합산 그룹 모두 정상 복원.',
    current_count, backup_count;
END $$;

COMMIT;
