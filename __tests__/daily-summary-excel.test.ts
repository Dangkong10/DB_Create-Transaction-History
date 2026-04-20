/**
 * 당일 집계표 엑셀 생성 로직 테스트
 */

import { describe, it, expect } from 'vitest';
import { aggregateDailySummary } from '../lib/daily-summary-excel';
import type { Transaction } from '../lib/excel-utils';

describe('당일 집계표 집계 로직', () => {
  it('거래처별 매출금액을 정확히 집계해야 함', async () => {
    const transactions: Transaction[] = [
      {
        id: '1',
        customerName: '고려',
        productName: '12합',
        quantity: 10,
        date: '2026-02-21',
        createdAt: '2026-02-21T00:00:00Z',
      },
      {
        id: '2',
        customerName: '고려',
        productName: '18합 무지',
        quantity: 5,
        date: '2026-02-21',
        createdAt: '2026-02-21T00:00:00Z',
      },
      {
        id: '3',
        customerName: '경일',
        productName: '12합',
        quantity: 20,
        date: '2026-02-21',
        createdAt: '2026-02-21T00:00:00Z',
      },
    ];

    const getUnitPrice = (productName: string) => {
      const prices: Record<string, number> = {
        '12합': 14000,
        '18합 무지': 10000,
      };
      return prices[productName] || 0;
    };

    const result = await aggregateDailySummary(transactions, getUnitPrice);

    // 2개의 거래처
    expect(result.length).toBe(2);

    // 고려: 12합(10개 * 14000) + 18합 무지(5개 * 10000) = 140000 + 50000 = 190000
    const goryeo = result.find((r) => r.customerName === '고려');
    expect(goryeo).toBeDefined();
    expect(goryeo?.salesAmount).toBe(190000);
    expect(goryeo?.prevBalance).toBe(0);
    expect(goryeo?.totalBalance).toBe(190000);

    // 경일: 12합(20개 * 14000) = 280000
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
        date: '2026-02-21',
        createdAt: '2026-02-21T00:00:00Z',
      },
      {
        id: '2',
        customerName: '고려',
        productName: '12합',
        quantity: 5,
        date: '2026-02-21',
        createdAt: '2026-02-21T00:00:00Z',
      },
      {
        id: '3',
        customerName: '경일',
        productName: '12합',
        quantity: 20,
        date: '2026-02-21',
        createdAt: '2026-02-21T00:00:00Z',
      },
    ];

    const getUnitPrice = () => 14000;

    const result = await aggregateDailySummary(transactions, getUnitPrice);

    // 가나다순: 경일 → 고려 → 하우스
    expect(result[0].customerName).toBe('경일');
    expect(result[1].customerName).toBe('고려');
    expect(result[2].customerName).toBe('하우스');
  });

  it('거래처별 매출금액을 올바르게 집계해야 함', async () => {
    const transactions: Transaction[] = [
      {
        id: '1',
        customerName: '고려',
        productName: '12합',
        quantity: 10,
        date: '2026-02-21',
        createdAt: '2026-02-21T10:00:00Z',
      },
      {
        id: '2',
        customerName: '고려',
        productName: '12합',
        quantity: 5,
        date: '2026-02-21',
        createdAt: '2026-02-21T10:05:00Z',
      },
      {
        id: '3',
        customerName: '고려',
        productName: '18합 무지',
        quantity: 3,
        date: '2026-02-21',
        createdAt: '2026-02-21T10:10:00Z',
      },
    ];

    const getUnitPrice = (productName: string) => {
      if (productName === '12합') return 14000;
      if (productName === '18합 무지') return 10000;
      return 0;
    };

    const result = await aggregateDailySummary(transactions, getUnitPrice);

    expect(result.length).toBe(1);
    expect(result[0].customerName).toBe('고려');
    // 12합(10+5=15개 * 14000) + 18합 무지(3개 * 10000) = 210000 + 30000 = 240000
    expect(result[0].salesAmount).toBe(240000);
  });

  it('빈 거래 내역에 대해 빈 배열을 반환해야 함', async () => {
    const transactions: Transaction[] = [];
    const getUnitPrice = () => 0;

    const result = await aggregateDailySummary(transactions, getUnitPrice);

    expect(result.length).toBe(0);
  });
});
