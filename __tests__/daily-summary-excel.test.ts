/**
 * 당일 집계표 집계 로직 테스트
 *
 * 단가는 transactions 행에 저장된 unitPrice 를 사용한다.
 * (잔고 계산과 동일 식 — 사후에 품목 단가가 바뀌어도 옛 집계표가 흔들리지 않게.)
 */

import { describe, it, expect } from 'vitest';
import { aggregateDailySummary } from '../lib/daily-summary-aggregate';
import type { Transaction } from '../lib/excel-utils';

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
