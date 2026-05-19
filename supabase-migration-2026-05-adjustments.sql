-- ============================================================
-- 마이그레이션: 미수금 조정(adjustments) 테이블 추가
-- 날짜: 2026-05-19
-- 실행 위치: Supabase SQL Editor
-- 주의: 기존 데이터(transactions, customers, products, special_prices, payments)를 건드리지 않습니다.
--
-- 용도:
--   시스템 계산 미수금(SUM(transactions) - SUM(payments))이 실제 미수금과
--   다를 때 (시스템 도입 전 누적분, 외부 거래, 분쟁 조정 등) 차액을 row 로 기록.
--
-- 현재미수금 공식 확장:
--   = SUM(transactions) - SUM(payments) + SUM(adjustments)
--
-- amount 부호:
--   + 양수: 미수금 증가 방향 (예: 실제 미수금이 시스템보다 많을 때)
--   - 음수: 미수금 감소 방향 (예: 실제 미수금이 시스템보다 적을 때)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.adjustments (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  adjustment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount INTEGER NOT NULL CHECK (amount <> 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 인덱스
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_adjustments_user_id
  ON public.adjustments(user_id);
CREATE INDEX IF NOT EXISTS idx_adjustments_user_customer
  ON public.adjustments(user_id, customer_name);
CREATE INDEX IF NOT EXISTS idx_adjustments_user_customer_date
  ON public.adjustments(user_id, customer_name, adjustment_date);

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
ALTER TABLE public.adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own adjustments" ON public.adjustments;
CREATE POLICY "Users can select own adjustments"
  ON public.adjustments FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own adjustments" ON public.adjustments;
CREATE POLICY "Users can insert own adjustments"
  ON public.adjustments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own adjustments" ON public.adjustments;
CREATE POLICY "Users can update own adjustments"
  ON public.adjustments FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own adjustments" ON public.adjustments;
CREATE POLICY "Users can delete own adjustments"
  ON public.adjustments FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 코멘트
-- ============================================================
COMMENT ON TABLE public.adjustments IS '미수금 수동 조정 기록 (1행 = 1조정). 시스템 계산값과 실제값 차이 보정용.';
COMMENT ON COLUMN public.adjustments.user_id IS '소유자';
COMMENT ON COLUMN public.adjustments.customer_name IS '거래처명 (transactions/payments와 동일 스타일)';
COMMENT ON COLUMN public.adjustments.adjustment_date IS '조정 적용 날짜 (기본 = 오늘)';
COMMENT ON COLUMN public.adjustments.amount IS '조정액 (원). 양수=미수금 증가, 음수=미수금 감소. 0 금지.';
