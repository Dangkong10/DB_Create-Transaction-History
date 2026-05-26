/**
 * 당일 집계표 집계 로직 (순수 함수)
 *
 * Excel 생성·다운로드·파일 시스템 같은 무거운 의존성과 분리해서
 * vitest 같은 빌드 환경에서도 가볍게 import 가능하도록 따로 추출.
 *
 * 단가는 transactions 행에 저장된 거래 시점 unit_price 를 사용.
 * (현재 products.unit_price 가 아님 — getReceiptBalancesForDate 의 잔고 계산과 동일 공식.
 *  단가를 사후 변경해도 옛 집계표 / 다음날 전잔고가 어긋나지 않게 하기 위함.)
 *
 * 단가가 비어있는 (legacy) 거래는 0원으로 집계되어 잔고 계산과 일치한다.
 */

import type { Transaction } from './excel-utils';

export interface DailySummaryRow {
  customerName: string;
  prevBalance: number;
  salesAmount: number;
  totalBalance: number;
}

export function aggregateDailySummary(
  transactions: Transaction[],
  _getUnitPrice?: (productName: string) => number,
): DailySummaryRow[] {
  const summaryMap = new Map<string, { salesAmount: number }>();

  transactions.forEach((tx) => {
    const existing = summaryMap.get(tx.customerName) || { salesAmount: 0 };
    const amount = (tx.unitPrice ?? 0) * tx.quantity;
    existing.salesAmount += amount;
    summaryMap.set(tx.customerName, existing);
  });

  const rows: DailySummaryRow[] = [];
  summaryMap.forEach((data, customerName) => {
    rows.push({
      customerName,
      prevBalance: 0, // 전잔고는 호출자가 별도로 채움 (예: getReceiptBalancesForDate)
      salesAmount: data.salesAmount,
      totalBalance: 0 + data.salesAmount,
    });
  });

  rows.sort((a, b) => a.customerName.localeCompare(b.customerName, 'ko-KR'));
  return rows;
}
