/**
 * 당일 집계표 집계 로직 테스트
 *
 * 단가는 transactions 행에 저장된 unitPrice 를 사용한다.
 * (잔고 계산과 동일 식 — 사후에 품목 단가가 바뀌어도 옛 집계표가 흔들리지 않게.)
 */

import { describe, it, expect } from 'vitest';
import { aggregateDailySummary } from '../lib/daily-summary-aggregate';
import { createUnitPriceResolver } from '../lib/unit-price';
import type { Transaction } from '../lib/excel-utils';
import type { Product } from '../lib/types';

describe('당일 집계표 집계 로직', () => {
  it('거래처별 매출금액을 정확히 집계해야 함', async () => {
    const transactions: Transaction[] = [
      {
        id: '1',
        customerName: '고려',
        productName: '12합',
        quantity: 10,
        unitPrice: 14000,
        date: '2026-02-21',
        createdAt: '2026-02-21T00:00:00Z',
      },
      {
        id: '2',
        customerName: '고려',
        productName: '18합 무지',
        quantity: 5,
        unitPrice: 10000,
        date: '2026-02-21',
        createdAt: '2026-02-21T00:00:00Z',
      },
      {
        id: '3',
        customerName: '경일',
        productName: '12합',
        quantity: 20,
        unitPrice: 14000,
        date: '2026-02-21',
        createdAt: '2026-02-21T00:00:00Z',
      },
    ];

    const result = aggregateDailySummary(transactions);

    expect(result.length).toBe(2);

    const goryeo = result.find((r) => r.customerName === '고려');
    expect(goryeo).toBeDefined();
    expect(goryeo?.salesAmount).toBe(190000);
    expect(goryeo?.prevBalance).toBe(0);
    expect(goryeo?.totalBalance).toBe(190000);

    const gyeongil = result.find((r) => r.customerName === '경일');
    expect(gyeongil).toBeDefined();
    expect(gyeongil?.salesAmount).toBe(280000);
    expect(gyeongil?.prevBalance).toBe(0);
    expect(gyeongil?.totalBalance).toBe(280000);
  });

  it('거래처명을 가나다순으로 정렬해야 함', async () => {
    const transactions: Transaction[] = [
      {
        id: '1',
        customerName: '하우스',
        productName: '12합',
        quantity: 10,
        unitPrice: 14000,
        date: '2026-02-21',
        createdAt: '2026-02-21T00:00:00Z',
      },
      {
        id: '2',
        customerName: '고려',
        productName: '12합',
        quantity: 5,
        unitPrice: 14000,
        date: '2026-02-21',
        createdAt: '2026-02-21T00:00:00Z',
      },
      {
        id: '3',
        customerName: '경일',
        productName: '12합',
        quantity: 20,
        unitPrice: 14000,
        date: '2026-02-21',
        createdAt: '2026-02-21T00:00:00Z',
      },
    ];

    const result = aggregateDailySummary(transactions);

    expect(result[0].customerName).toBe('경일');
    expect(result[1].customerName).toBe('고려');
    expect(result[2].customerName).toBe('하우스');
  });

  it('같은 거래처의 같은 품목 여러 행을 합산해야 함', async () => {
    const transactions: Transaction[] = [
      {
        id: '1',
        customerName: '고려',
        productName: '12합',
        quantity: 10,
        unitPrice: 14000,
        date: '2026-02-21',
        createdAt: '2026-02-21T10:00:00Z',
      },
      {
        id: '2',
        customerName: '고려',
        productName: '12합',
        quantity: 5,
        unitPrice: 14000,
        date: '2026-02-21',
        createdAt: '2026-02-21T10:05:00Z',
      },
      {
        id: '3',
        customerName: '고려',
        productName: '18합 무지',
        quantity: 3,
        unitPrice: 10000,
        date: '2026-02-21',
        createdAt: '2026-02-21T10:10:00Z',
      },
    ];

    const result = aggregateDailySummary(transactions);

    expect(result.length).toBe(1);
    expect(result[0].customerName).toBe('고려');
    // 12합(10+5=15개 × 14000) + 18합 무지(3개 × 10000) = 210000 + 30000 = 240000
    expect(result[0].salesAmount).toBe(240000);
  });

  it('빈 거래 내역에 대해 빈 배열을 반환해야 함', async () => {
    const result = aggregateDailySummary([]);
    expect(result.length).toBe(0);
  });

  it('unitPrice 가 없는 legacy 거래는 0원으로 집계되어 잔고와 일치한다', async () => {
    const transactions: Transaction[] = [
      {
        id: '1',
        customerName: '고려',
        productName: '12합',
        quantity: 10,
        // unitPrice 누락 — 옛날 데이터.
        date: '2026-02-21',
        createdAt: '2026-02-21T00:00:00Z',
      },
    ];

    const result = aggregateDailySummary(transactions);
    expect(result[0].salesAmount).toBe(0);
  });

  it('품목 단가를 사후 변경해도 옛 집계표는 거래 시점 단가를 유지한다', async () => {
    // 거래는 단가 1,000 으로 들어갔다. 나중에 products.unit_price 가 1,200 으로 바뀐 상황을 시뮬레이션.
    const transactions: Transaction[] = [
      {
        id: '1',
        customerName: '고려',
        productName: '12합',
        quantity: 10,
        unitPrice: 1000, // 거래 시점 가격
        date: '2026-05-25',
        createdAt: '2026-05-25T00:00:00Z',
      },
    ];

    const result = aggregateDailySummary(transactions);
    // 1,200 × 10 = 12,000 이 아니라 1,000 × 10 = 10,000 이 나와야 잔고와 일관됨.
    expect(result[0].salesAmount).toBe(10000);
  });
});

describe('단가 리졸버 (특가 반영)', () => {
  const products: Product[] = [
    { id: 'p1', name: '12합', category: 'summer', aliases: [], unitPrice: 14000 },
    { id: 'p2', name: '18합 무지', category: 'summer', aliases: [], unitPrice: 10000 },
    { id: 'p3', name: '단가없음', category: 'summer', aliases: [] },
  ];
  const specialPrices = [
    { customerName: '고려', productName: '12합', customPrice: 12000 },
    { customerName: '경일', productName: '18합 무지', customPrice: 0 },
  ];

  it('특가가 설정된 (거래처, 제품)은 특가를 반환해야 함', () => {
    const resolve = createUnitPriceResolver(products, specialPrices);
    expect(resolve('고려', '12합')).toBe(12000);
  });

  it('특가가 없으면 제품 기본 단가로 폴백해야 함', () => {
    const resolve = createUnitPriceResolver(products, specialPrices);
    expect(resolve('하우스', '12합')).toBe(14000); // 다른 거래처
    expect(resolve('고려', '18합 무지')).toBe(10000); // 같은 거래처, 다른 제품
  });

  it('0원 특가도 유효한 값으로 취급해야 함 (기본 단가로 폴백 X)', () => {
    const resolve = createUnitPriceResolver(products, specialPrices);
    expect(resolve('경일', '18합 무지')).toBe(0);
  });

  it('특가도 기본 단가도 없으면 0을 반환해야 함', () => {
    const resolve = createUnitPriceResolver(products, specialPrices);
    expect(resolve('고려', '단가없음')).toBe(0);
    expect(resolve('고려', '미등록제품')).toBe(0);
  });

  it('특가로 저장된 거래는 저장 단가 그대로 집계된다 (입력 화면 특가 자동 저장과 합쳐져 특가 반영)', async () => {
    // 입력 화면이 특가 거래처에 12000을 저장, 일반 거래처에 14000을 저장한 상황
    const transactions: Transaction[] = [
      {
        id: '1',
        customerName: '고려',
        productName: '12합',
        quantity: 10,
        unitPrice: 12000, // 특가로 저장됨
        date: '2026-02-21',
        createdAt: '2026-02-21T00:00:00Z',
      },
      {
        id: '2',
        customerName: '하우스',
        productName: '12합',
        quantity: 10,
        unitPrice: 14000, // 기본 단가로 저장됨
        date: '2026-02-21',
        createdAt: '2026-02-21T00:00:00Z',
      },
    ];

    const result = aggregateDailySummary(transactions);

    const goryeo = result.find((r) => r.customerName === '고려');
    const house = result.find((r) => r.customerName === '하우스');
    expect(goryeo?.salesAmount).toBe(120000);
    expect(house?.salesAmount).toBe(140000);
  });
});
