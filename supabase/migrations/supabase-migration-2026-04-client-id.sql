-- ============================================================
-- 거래 멱등성용 client_id 컬럼 추가
-- ============================================================
-- 목적:
--   동일 데이터(거래처/품목/수량/날짜/시간)를 한 번에 여러 건 입력하거나
--   네트워크 재시도가 일어나도 클라이언트가 발급한 UUID로 중복 INSERT를 방지.
--
-- 영향:
--   - 기존 데이터 그대로 유지 (NULL 허용)
--   - 부분 unique index 라 client_id 가 NULL 인 과거 행은 중복 검사 대상 아님
-- ============================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS client_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_user_client_id
  ON public.transactions(user_id, client_id)
  WHERE client_id IS NOT NULL;

COMMENT ON COLUMN public.transactions.client_id IS
  '클라이언트가 발급한 UUID (멱등성 키). 동일 user_id 안에서 unique.';
