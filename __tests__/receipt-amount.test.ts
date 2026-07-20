/**
 * 영수증·화면통계 금액 = 거래 시점 박제 단가 검증
 *
 * aggregateTransactions / groupByReceipt 가 거래 행의 unitPrice 로 계산한
 * 금액(amount)을 그대로 실어 날라야 한다. 이렇게 해야 영수증 품목 금액이
 * 잔고(getReceiptBalancesForDate)·집계표(aggregateDailySummary)와 같은
 * 출처를 써서, 사후에 제품 단가/특가가 바뀌어도 세 숫자가 어긋나지 않는다.
 */

import { describe, it, expect } from 'vitest';
import { aggregateTransactions, groupByReceipt, type Transaction } from '../lib/excel-utils';

function tx(over: Partial<Transaction> & Pick<Transaction, 'customerName' | 'productName' | 'quantity'>): Transaction {
  return {
    id: Math.random().toString(),
    date: '2026-07-20',
    createdAt: '2026-07-20T00:00:00Z',
    ...over,
  } as Transaction;
}

describe('영수증 금액 — 거래 시점 박제 단가', () => {
  it('aggregateTransactions 는 Σ(수량×unitPrice) 를 totalAmount 로 실어 나른다', () => {
    const rows = aggregateTransactions([
      tx({ customerName: '고려', productName: '12합', quantity: 10, unitPrice: 14000 }),
    ]);
    expect(rows[0].totalAmount).toBe(140000);
  });

  it('같은 날·같은 거래처·같은 품목은 수량과 금액이 각각 합산된다', () => {
    const rows = aggregateTransactions([
      tx({ customerName: '고려', productName: '12합', quantity: 10, unitPrice: 14000 }),
      tx({ customerName: '고려', productName: '12합', quantity: 5, unitPrice: 14000 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].totalQuantity).toBe(15);
    expect(rows[0].totalAmount).toBe(210000);
  });

  it('단가가 다른 같은 품목 거래도 각 거래 시점 단가로 합산된다 (사후 변경 무관)', () => {
    const rows = aggregateTransactions([
      tx({ customerName: '고려', productName: '12합', quantity: 10, unitPrice: 14000 }),
      tx({ customerName: '고려', productName: '12합', quantity: 10, unitPrice: 13000 }),
    ]);
    expect(rows[0].totalAmount).toBe(270000); // 140000 + 130000
  });

  it('legacy(단가 없음) 거래는 0원으로 집계된다 (잔고 계산과 일치)', () => {
    const rows = aggregateTransactions([
      tx({ customerName: '고려', productName: '옛품목', quantity: 7 }), // unitPrice undefined
    ]);
    expect(rows[0].totalAmount).toBe(0);
  });

  it('groupByReceipt 는 품목별 amount 를 영수증 그룹으로 전달한다', () => {
    const grouped = groupByReceipt(
      aggregateTransactions([
        tx({ customerName: '고려', productName: '12합', quantity: 10, unitPrice: 14000 }),
        tx({ customerName: '고려', productName: '18합', quantity: 5, unitPrice: 20000 }),
      ]),
    );
    expect(grouped).toHaveLength(1);
    const byName = Object.fromEntries(grouped[0].items.map((i) => [i.productName, i.amount]));
    expect(byName['12합']).toBe(140000);
    expect(byName['18합']).toBe(100000);
    // 영수증 총액 = 품목 금액 합 (전잔고 별도)
    const total = grouped[0].items.reduce((s, i) => s + i.amount, 0);
    expect(total).toBe(240000);
  });
});
