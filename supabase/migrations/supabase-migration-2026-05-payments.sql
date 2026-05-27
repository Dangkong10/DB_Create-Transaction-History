-- ============================================================
-- 마이그레이션: 입금기록(payments) 테이블 추가 — 미수금 누적 시스템
-- 날짜: 2026-05-18
-- 실행 위치: Supabase SQL Editor
-- 주의: 기존 데이터(transactions, customers, products, special_prices)를 건드리지 않습니다.
-- 명세서: design_미수금시스템.html §2
-- ============================================================

-- ============================================================
-- 입금기록 테이블
-- ============================================================
-- 거래처별 입금 사건을 row 단위로 저장.
-- 현재 미수금 = SUM(transactions) - SUM(payments) 으로 자동 계산.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  payment_date DATE NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 인덱스
-- ============================================================
-- 사용자별 조회
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);

-- 거래처별 입금 내역 조회 + 현재미수금 계산 시 사용
CREATE INDEX IF NOT EXISTS idx_payments_user_customer
  ON public.payments(user_id, customer_name);

-- 날짜 기반 조회 (영수증/집계표 출력 시 입금일자 ≤ D 필터)
CREATE INDEX IF NOT EXISTS idx_payments_user_customer_date
  ON public.payments(user_id, customer_name, payment_date);

-- ============================================================
-- RLS (Row Level Security) — 다른 사용자의 입금기록 접근 차단
-- ============================================================
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own payments" ON public.payments;
CREATE POLICY "Users can select own payments"
  ON public.payments FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own payments" ON public.payments;
CREATE POLICY "Users can insert own payments"
  ON public.payments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own payments" ON public.payments;
CREATE POLICY "Users can update own payments"
  ON public.payments FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own payments" ON public.payments;
CREATE POLICY "Users can delete own payments"
  ON public.payments FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 코멘트
-- ============================================================
COMMENT ON TABLE public.payments IS '거래처 입금 기록 (1행 = 1입금 사건). 미수금은 SUM(transactions) - SUM(payments) 계산.';
COMMENT ON COLUMN public.payments.user_id IS '소유자 (Supabase Auth user)';
COMMENT ON COLUMN public.payments.customer_name IS '거래처명 (FK 아님 — transactions와 동일 스타일)';
COMMENT ON COLUMN public.payments.payment_date IS '입금일자 (사용자 입력. 기본=어제, 미래 차단)';
COMMENT ON COLUMN public.payments.amount IS '입금금액 (원, 양수만)';
COMMENT ON COLUMN public.payments.created_at IS 'row 생성 시각 (감사용)';
