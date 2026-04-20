/**
 * 검색 유틸리티 테스트 - 별칭 검색 포함
 */

import { describe, it, expect } from 'vitest';
import { searchCustomers, searchProducts } from '../lib/search-utils';
import type { Customer, Product } from '../lib/types';

describe('검색 유틸리티', () => {
  const customers: Customer[] = [
    { id: '1', name: '해비치', aliases: [] },
    { id: '2', name: '한올', aliases: [] },
    { id: '3', name: '켈리케이(Kelly.K)', aliases: ['7조'] },
    { id: '4', name: '태광섬유', aliases: ['호남사'] },
    { id: '5', name: '실바구니', aliases: ['정읍사'] },
  ];

  const products: Product[] = [
    { id: 'p1', name: '18색사', category: 'summer', aliases: [] },
    { id: 'p2', name: '24색사', category: 'summer', aliases: [] },
    { id: 'p3', name: '래빗', category: 'winter', aliases: [] },
    { id: 'p4', name: '앙고라_그라데이션, 앙그라', category: 'winter', aliases: [] },
    { id: 'p5', name: '실리콘코', category: 'accessories', aliases: [] },
  ];

  describe('searchCustomers', () => {
    it('거래처 이름으로 검색해야 함', () => {
      const result = searchCustomers(customers, '해비');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('해비치');
    });

    it('초성으로 거래처를 검색해야 함', () => {
      const result = searchCustomers(customers, 'ㅎㅂ');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('해비치');
    });

    it('별칭으로 거래처를 검색해야 함', () => {
      const result = searchCustomers(customers, '7조');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('켈리케이(Kelly.K)');
    });

    it('별칭 초성으로 거래처를 검색해야 함', () => {
      const result = searchCustomers(customers, 'ㅎㄴㅅ');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('태광섬유');
    });

    it('여러 거래처가 매칭될 수 있어야 함', () => {
      const result = searchCustomers(customers, 'ㅎ');
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('빈 검색어는 모든 거래처를 반환해야 함', () => {
      const result = searchCustomers(customers, '');
      expect(result).toHaveLength(customers.length);
    });
  });

  describe('searchProducts', () => {
    it('제품 이름으로 검색해야 함', () => {
      const result = searchProducts(products, '18색');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('18색사');
    });

    it('초성으로 제품을 검색해야 함', () => {
      const result = searchProducts(products, 'ㄹㅂ');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('래빗');
    });

    it('카테고리 필터가 작동해야 함', () => {
      const result = searchProducts(products, '', 'summer');
      expect(result).toHaveLength(2);
      expect(result.every((p) => p.category === 'summer')).toBe(true);
    });

    it('검색어와 카테고리 필터를 함께 사용할 수 있어야 함', () => {
      const result = searchProducts(products, '색사', 'summer');
      expect(result).toHaveLength(2);
      expect(result.every((p) => p.category === 'summer')).toBe(true);
    });

    it('빈 검색어는 모든 제품을 반환해야 함', () => {
      const result = searchProducts(products, '');
      expect(result).toHaveLength(products.length);
    });
  });
});
