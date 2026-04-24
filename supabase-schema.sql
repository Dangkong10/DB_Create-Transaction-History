-- ============================================================
-- 거래명세서 입력 시스템 - Supabase 스키마 (정본)
-- ============================================================
-- 신규 Supabase 프로젝트 초기 셋업 시 전체 실행.
-- 기존 프로젝트에 테이블 추가 시에는 supabase-migration-*.sql 을 사용할 것.
-- ============================================================

-- 기존 테이블 삭제 (초기 셋업 시에만 사용)
DROP TABLE IF EXISTS public.products;
DROP TABLE IF EXISTS public.customers;
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

-- ============================================================
-- 3. 거래처 테이블
-- ============================================================
CREATE TABLE public.customers (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, name)
);

CREATE INDEX idx_customers_user_id ON public.customers(user_id);
CREATE INDEX idx_customers_user_name ON public.customers(user_id, name);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own customers"
  ON public.customers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own customers"
  ON public.customers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own customers"
  ON public.customers FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own customers"
  ON public.customers FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.customers IS '거래처 목록 (계정별)';
COMMENT ON COLUMN public.customers.aliases IS '검색용 별칭 배열 (JSONB)';

-- ============================================================
-- 4. 품목 테이블
-- ============================================================
CREATE TABLE public.products (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  unit_price INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, name)
);

CREATE INDEX idx_products_user_id ON public.products(user_id);
CREATE INDEX idx_products_user_category ON public.products(user_id, category);
CREATE INDEX idx_products_user_name ON public.products(user_id, name);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own products"
  ON public.products FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own products"
  ON public.products FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own products"
  ON public.products FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own products"
  ON public.products FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.products IS '품목 목록 (계정별). unit_price 는 기본 단가';
COMMENT ON COLUMN public.products.category IS '카테고리 식별자 (summer/winter/accessories 등)';
COMMENT ON COLUMN public.products.aliases IS '검색용 별칭 배열 (JSONB)';
COMMENT ON COLUMN public.products.unit_price IS '기본 단가 (원). NULL 가능 — 특가(special_prices)가 우선';

-- ============================================================
-- updated_at 자동 갱신 트리거 (customers, products)
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
