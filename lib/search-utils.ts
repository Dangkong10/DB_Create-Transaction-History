/**
 * 검색 유틸리티 - 별칭 검색 지원
 */

import { matchChosung } from './hangul-utils';
import type { Customer, Product } from './types';

/**
 * 거래처 검색 (이름 + 별칭)
 * 
 * @param customers 거래처 목록
 * @param query 검색어
 * @returns 매칭된 거래처 목록
 */
export function searchCustomers(customers: Customer[], query: string): Customer[] {
  if (!query.trim()) {
    return customers;
  }

  return customers.filter((customer) => {
    // 이름으로 검색
    if (matchChosung(customer.name, query)) {
      return true;
    }

    // 별칭으로 검색
    return customer.aliases.some((alias) => matchChosung(alias, query));
  });
}

/**
 * 제품 검색 (이름 + 별칭)
 * 
 * @param products 제품 목록
 * @param query 검색어
 * @param categoryFilter 카테고리 필터 (선택)
 * @returns 매칭된 제품 목록
 */
export function searchProducts(
  products: Product[],
  query: string,
  categoryFilter?: string
): Product[] {
  let filtered = products;

  // 카테고리 필터 적용
  if (categoryFilter) {
    filtered = filtered.filter((p) => p.category === categoryFilter);
  }

  // 검색어가 없으면 필터링된 전체 목록 반환
  if (!query.trim()) {
    return filtered;
  }

  // 이름 또는 별칭으로 검색
  return filtered.filter((product) => {
    // 이름으로 검색
    if (matchChosung(product.name, query)) {
      return true;
    }

    // 별칭으로 검색
    return product.aliases.some((alias) => matchChosung(alias, query));
  });
}

/**
 * 거래처 이름 표시 (별칭 포함)
 * 
 * @param customer 거래처
 * @returns 표시할 이름
 */
export function getCustomerDisplayName(customer: Customer): string {
  if (customer.aliases.length === 0) {
    return customer.name;
  }
  return `${customer.name} (${customer.aliases.join(', ')})`;
}

/**
 * 제품 이름 표시 (별칭 포함)
 * 
 * @param product 제품
 * @returns 표시할 이름
 */
export function getProductDisplayName(product: Product): string {
  if (product.aliases.length === 0) {
    return product.name;
  }
  return `${product.name} (${product.aliases.join(', ')})`;
}
