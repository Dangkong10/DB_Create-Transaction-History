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
}

/**
 * (거래처, 제품)에 설정된 특가 조회 — 없으면 undefined (0원 특가는 유효값)
 */
export function findSpecialPrice(
  specialPrices: SpecialPriceLite[],
  customerName: string,
  productName: string,
): number | undefined {
  return specialPrices.find(
    (s) => s.customerName === customerName && s.productName === productName,
  )?.customPrice;
}

/**
 * (거래처명, 제품명) → 단가 조회 함수 생성
 */
export function createUnitPriceResolver(
  products: Product[],
  specialPrices: SpecialPriceLite[],
): (customerName: string, productName: string) => number {
  return (customerName, productName) => {
    const sp = findSpecialPrice(specialPrices, customerName, productName);
    if (sp !== undefined) return sp;
    return products.find((p) => p.name === productName)?.unitPrice ?? 0;
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
