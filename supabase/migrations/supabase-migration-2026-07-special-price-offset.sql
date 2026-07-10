-- 특가 기본가 연동 (2026-07)
--
-- 특가를 고정 금액이 아니라 "기본가 ± 조정액"으로 저장하는 연동 특가 지원.
-- 제품 기본 단가(products.unit_price)가 바뀌면 연동 특가도 자동으로 따라간다.
-- (계산은 앱의 lib/unit-price.ts resolveSpecialAmount 에서 수행)
--
-- 적용: Supabase SQL Editor 에서 실행 (idempotent — 여러 번 실행해도 안전)

ALTER TABLE public.special_prices
  ADD COLUMN IF NOT EXISTS price_offset INTEGER;

COMMENT ON COLUMN public.special_prices.price_offset IS
  '기본가 연동 조정액 (예: -1000 = 기본가보다 1,000원 낮게 유지). NULL = 고정 특가. custom_price 는 저장 시점 스냅샷.';
