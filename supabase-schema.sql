-- ============================================================
-- 거래명세서 입력 시스템 - Supabase 스키마
-- Google Sheets → Supabase 전환용 재설계
-- ============================================================

-- 기존 테이블 삭제 (초기 셋업 시에만 사용)
DROP TABLE IF EXISTS public.special_prices;
DROP TABLE IF EXISTS public.transactions;

-- ============================================================
-- 1. 거래내역 테이블 (플랫 구조: 1행 = 1품목)
-- ============================================================
CREATE TABLE public.transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price INTEGER,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX idx_transactions_date ON public.transactions(date DESC);
CREATE INDEX idx_transactions_user_date ON public.transactions(user_id, date DESC);
CREATE INDEX idx_transactions_customer ON public.transactions(customer_name);

-- RLS 활성화
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own transactions"
  ON public.transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions"
  ON public.transactions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions"
  ON public.transactions FOR DELETE
  USING (auth.uid() = user_id);

-- 코멘트
COMMENT ON TABLE public.transactions IS '거래내역 (1행 = 1품목)';
COMMENT ON COLUMN public.transactions.user_id IS '소유자 (Supabase Auth user)';
COMMENT ON COLUMN public.transactions.customer_name IS '거래처명';
COMMENT ON COLUMN public.transactions.product_name IS '품목명';
COMMENT ON COLUMN public.transactions.quantity IS '수량 (음수 = 반품)';
COMMENT ON COLUMN public.transactions.unit_price IS '단가 (원)';
COMMENT ON COLUMN public.transactions.date IS '거래일';
COMMENT ON COLUMN public.transactions.created_at IS '입력 시각';

-- ============================================================
-- 2. 특가목록 테이블
-- ============================================================
CREATE TABLE public.special_prices (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  product_name TEXT NOT NULL,
  custom_price INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, customer_name, product_name)
);

-- 인덱스
CREATE INDEX idx_special_prices_user_id ON public.special_prices(user_id);
CREATE INDEX idx_special_prices_customer ON public.special_prices(user_id, customer_name);

-- RLS 활성화
ALTER TABLE public.special_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own special_prices"
  ON public.special_prices FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own special_prices"
  ON public.special_prices FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own special_prices"
  ON public.special_prices FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own special_prices"
  ON public.special_prices FOR DELETE
  USING (auth.uid() = user_id);

-- 코멘트
COMMENT ON TABLE public.special_prices IS '거래처별 특가 목록';
COMMENT ON COLUMN public.special_prices.customer_name IS '거래처명';
COMMENT ON COLUMN public.special_prices.product_name IS '제품명';
COMMENT ON COLUMN public.special_prices.custom_price IS '특가 (원 단위)';
