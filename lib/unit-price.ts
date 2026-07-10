/**
 * 거래처별 특가를 반영한 공용 단가 리졸버
 *
 * 영수증 출력(print-receipt.ts)과 동일한 규칙:
 * 특가(거래처+제품) 우선 → 없으면 제품 기본 단가 → 그것도 없으면 0.
 * 0원 특가도 유효한 값으로 취급한다.
 */

import type { Product } from './types';

export interface SpecialPriceLite {
  customerName: string;
  productName: string;
  customPrice: number;
  /** 기본가 연동 조정액 (예: -1000 = 기본가−1,000원 유지). null/undefined = 고정 특가 */
  priceOffset?: number | null;
}

/**
 * (거래처, 제품)에 설정된 특가 레코드 조회 — 없으면 undefined
 */
export function findSpecialPriceRecord(
  specialPrices: SpecialPriceLite[],
  customerName: string,
  productName: string,
): SpecialPriceLite | undefined {
  return specialPrices.find(
    (s) => s.customerName === customerName && s.productName === productName,
  );
}

/**
 * 특가 레코드의 실제 금액 계산.
 * - 연동 특가(priceOffset 있음) + 기본가 있음 → 기본가 + 조정액 (0원 미만 방지)
 * - 그 외 → 저장된 customPrice (0원 특가도 유효값)
 */
export function resolveSpecialAmount(
  sp: SpecialPriceLite,
  basePrice: number | undefined,
): number {
  if (sp.priceOffset !== null && sp.priceOffset !== undefined && basePrice !== undefined) {
    return Math.max(0, basePrice + sp.priceOffset);
  }
  return sp.customPrice;
}

/**
 * (거래처, 제품)에 설정된 특가 금액 조회 — 없으면 undefined (0원 특가는 유효값)
 * 연동 특가는 basePrice 기준으로 계산.
 */
export function findSpecialPrice(
  specialPrices: SpecialPriceLite[],
  customerName: string,
  productName: string,
  basePrice?: number,
): number | undefined {
  const sp = findSpecialPriceRecord(specialPrices, customerName, productName);
  return sp ? resolveSpecialAmount(sp, basePrice) : undefined;
}

/**
 * (거래처명, 제품명) → 단가 조회 함수 생성
 */
export function createUnitPriceResolver(
  products: Product[],
  specialPrices: SpecialPriceLite[],
): (customerName: string, productName: string) => number {
  return (customerName, productName) => {
    const base = products.find((p) => p.name === productName)?.unitPrice;
    const sp = findSpecialPriceRecord(specialPrices, customerName, productName);
    if (sp) return resolveSpecialAmount(sp, base);
    return base ?? 0;
  };
}

/**
 * 특가 목록 조회 — 오프라인/조회 실패 시 빈 배열 (기본 단가로 동작)
 */
export async function safeGetSpecialPrices(): Promise<SpecialPriceLite[]> {
  try {
    const { getSpecialPrices } = await import('./supabase');
    return await getSpecialPrices();
  } catch {
    return [];
  }
}
