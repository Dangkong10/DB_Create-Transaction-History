/**
 * 당일 집계표 프린트 미리보기
 *
 * A4 반장 (148.5mm) 기준, 수정 가능한 테이블 → 프린트.
 *
 * 5열 구조:
 *   상호 / 전잔고 / 매출금액 / 입금 / 총잔액
 *   총잔액 = 전잔고 + 매출금액 − 입금   (payments.ts 의 식과 동일)
 */

import { openPrintModal, formatNumber } from './print-preview';
import { aggregateDailySummary, type DailySummaryRow } from './daily-summary-excel';
import type { Transaction } from './excel-utils';
import { getReceiptBalancesForDate } from './payments';

interface RowBalance {
  /** 전잔고 — D 직전 잔고 */
  prev: number;
  /** 당일 입금 */
  payment: number;
}

/**
 * 당일 집계표 미리보기 모달 열기
 */
export async function openDailySummaryPreview(
  transactions: Transaction[],
  dateStr: string,
  getUnitPrice: (productName: string) => number,
): Promise<void> {
  // 해당 날짜 거래만 필터 → 당일 매출 있는 거래처 row 생성
  const filtered = transactions.filter((t) => t.date.startsWith(dateStr));
  const aggregated = aggregateDailySummary(filtered, getUnitPrice);

  // 전잔고 / 당일입금 조회 (실패해도 집계표는 정상 출력)
  const balances = new Map<string, RowBalance>();
  try {
    const balanceMap = await getReceiptBalancesForDate(dateStr);
    for (const [name, b] of balanceMap) {
      balances.set(name, { prev: b.previousBalance, payment: b.dailyPayment });
    }
  } catch (err) {
    console.warn('[openDailySummaryPreview] 잔고 조회 실패 (집계표는 그대로 출력):', err);
  }

  // 당일 매출이 없어도 (전잔고 OR 입금 OR 0이 아닌 잔고) 있으면 row 로 추가.
  const namesInAggregated = new Set(aggregated.map((r) => r.customerName));
  const extras: DailySummaryRow[] = [];
  for (const [name, b] of balances) {
    if (namesInAggregated.has(name)) continue;
    if (b.prev > 0 || b.payment > 0) {
      extras.push({
        customerName: name,
        prevBalance: b.prev,
        salesAmount: 0,
        totalBalance: b.prev - b.payment,
      });
    }
  }

  const rows = [...aggregated, ...extras].sort((a, b) =>
    a.customerName.localeCompare(b.customerName, 'ko-KR'),
  );

  if (rows.length === 0) {
    throw new Error('선택한 날짜에 해당하는 거래 내역이 없습니다.');
  }

  const contentHtml = buildDailySummaryHtml(rows, dateStr, balances);

  openPrintModal({
    title: `📊 ${dateStr} 당일 집계표`,
    subtitle: '셀을 클릭하면 수정할 수 있어요 | 글씨 11pt · 행높이 14pt',
    contentHtml,
  });

  // 총잔액 자동 재계산 바인딩
  setTimeout(() => bindRecalculation(), 100);
}

/**
 * 한 박스(A4 한 장)에 안전하게 들어가는 행 수.
 *   A4 297mm × 210mm, padding 12mm 위아래 → 본문 273mm.
 *   타이틀/날짜/페이지번호/표헤더 ≈ 32mm, 합계 행/여유 ≈ 10mm,
 *   잔여 ~231mm, 한 행 14pt(≈5.1mm) → 45행 확보.
 */
const ROWS_PER_PAGE = 45;

function buildDailySummaryHtml(
  rows: DailySummaryRow[],
  dateStr: string,
  balances: Map<string, RowBalance>,
): string {
  // 전체 합계 (마지막 페이지에만 표시)
  let totalPrev = 0;
  let totalSales = 0;
  let totalPayment = 0;
  rows.forEach((r) => {
    const b = balances.get(r.customerName);
    totalPrev += b?.prev ?? 0;
    totalSales += r.salesAmount;
    totalPayment += b?.payment ?? 0;
  });
  const totalBalance = totalPrev + totalSales - totalPayment;

  // 페이지 chunk
  const pages: DailySummaryRow[][] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) {
    pages.push(rows.slice(i, i + ROWS_PER_PAGE));
  }
  if (pages.length === 0) pages.push([]);

  const totalPages = pages.length;

  return pages
    .map((chunk, pageIdx) => {
      const isLast = pageIdx === totalPages - 1;
      const startGlobalIdx = pageIdx * ROWS_PER_PAGE;

      const dataRowsHtml = chunk
        .map((r, local) => {
          const i = startGlobalIdx + local;
          const b = balances.get(r.customerName);
          const prev = b?.prev ?? 0;
          const payment = b?.payment ?? 0;
          const total = prev + r.salesAmount - payment;
          return `
    <tr>
      <td style="text-align:left; padding-left:6px;" contenteditable="true">${r.customerName}</td>
      <td style="text-align:right; padding-right:6px;" contenteditable="true" data-row="${i}" data-col="prev">${prev !== 0 ? formatNumber(prev) : ''}</td>
      <td style="text-align:right; padding-right:6px;" contenteditable="true" data-row="${i}" data-col="sales">${r.salesAmount !== 0 ? formatNumber(r.salesAmount) : ''}</td>
      <td style="text-align:right; padding-right:6px; color:#15803d;" contenteditable="true" data-row="${i}" data-col="payment">${payment !== 0 ? formatNumber(payment) : ''}</td>
      <td style="text-align:right; padding-right:6px; font-weight:700; color:#1B365D;" data-row="${i}" data-col="total">${total !== 0 ? formatNumber(total) : ''}</td>
    </tr>`;
        })
        .join('');

      const footHtml = isLast
        ? `
        <tfoot>
          <tr style="background:#f0f0f0; font-weight:800;">
            <td style="text-align:center;">합계</td>
            <td style="text-align:right; padding-right:6px;" id="ds-total-prev">${totalPrev !== 0 ? formatNumber(totalPrev) : ''}</td>
            <td style="text-align:right; padding-right:6px;" id="ds-total-sales">${formatNumber(totalSales)}</td>
            <td style="text-align:right; padding-right:6px; color:#15803d;" id="ds-total-payment">${totalPayment !== 0 ? formatNumber(totalPayment) : ''}</td>
            <td style="text-align:right; padding-right:6px; color:#1B365D;" id="ds-total-balance">${formatNumber(totalBalance)}</td>
          </tr>
        </tfoot>`
        : '';

      const pageBadgeHtml =
        totalPages > 1
          ? `<div style="text-align:right; font-size:10pt; color:#666; margin-bottom:2mm;">${pageIdx + 1} / ${totalPages}</div>`
          : '';

      return `
    <div class="a4-page full">
      <div style="text-align:center; margin-bottom:8mm;">
        <div style="font-size:16pt; font-weight:800;">당일 집계표</div>
      </div>
      <div style="text-align:right; margin-bottom:4mm; font-size:11pt;">${dateStr}</div>
      ${pageBadgeHtml}

      <table class="ppm-table">
        <thead>
          <tr>
            <th style="width:32%;">상호</th>
            <th style="width:17%;">전잔고</th>
            <th style="width:17%;">매출금액</th>
            <th style="width:17%;">입금</th>
            <th style="width:17%;">총잔액</th>
          </tr>
        </thead>
        <tbody>
          ${dataRowsHtml}
        </tbody>${footHtml}
      </table>
    </div>
  `;
    })
    .join('');
}

/**
 * 총잔액 자동 재계산 — 전잔고/매출금액/입금 셀 수정 시.
 *   total = prev + sales − payment
 */
function bindRecalculation(): void {
  const modal = document.getElementById('print-preview-modal');
  if (!modal) return;

  modal.addEventListener('input', (e) => {
    const target = e.target as HTMLElement;
    const col = target.getAttribute('data-col');
    if (col !== 'prev' && col !== 'sales' && col !== 'payment') return;

    const row = target.getAttribute('data-row');
    if (!row) return;

    const prevCell = modal.querySelector(`[data-row="${row}"][data-col="prev"]`) as HTMLElement;
    const salesCell = modal.querySelector(`[data-row="${row}"][data-col="sales"]`) as HTMLElement;
    const paymentCell = modal.querySelector(`[data-row="${row}"][data-col="payment"]`) as HTMLElement;
    const totalCell = modal.querySelector(`[data-row="${row}"][data-col="total"]`) as HTMLElement;

    if (!prevCell || !salesCell || !paymentCell || !totalCell) return;

    const prev = parseFormattedNumber(prevCell.textContent || '0');
    const sales = parseFormattedNumber(salesCell.textContent || '0');
    const payment = parseFormattedNumber(paymentCell.textContent || '0');
    totalCell.textContent = formatNumber(prev + sales - payment);

    recalcTotals(modal);
  });
}

function recalcTotals(modal: HTMLElement): void {
  let totalPrev = 0;
  let totalSales = 0;
  let totalPayment = 0;
  let totalBalance = 0;

  modal.querySelectorAll('[data-col="prev"]').forEach((c) => {
    totalPrev += parseFormattedNumber(c.textContent || '0');
  });
  modal.querySelectorAll('[data-col="sales"]').forEach((c) => {
    totalSales += parseFormattedNumber(c.textContent || '0');
  });
  modal.querySelectorAll('[data-col="payment"]').forEach((c) => {
    totalPayment += parseFormattedNumber(c.textContent || '0');
  });
  modal.querySelectorAll('[data-col="total"]').forEach((c) => {
    totalBalance += parseFormattedNumber(c.textContent || '0');
  });

  const tp = modal.querySelector('#ds-total-prev');
  const ts = modal.querySelector('#ds-total-sales');
  const tpay = modal.querySelector('#ds-total-payment');
  const tb = modal.querySelector('#ds-total-balance');
  if (tp) tp.textContent = formatNumber(totalPrev);
  if (ts) ts.textContent = formatNumber(totalSales);
  if (tpay) tpay.textContent = formatNumber(totalPayment);
  if (tb) tb.textContent = formatNumber(totalBalance);
}

function parseFormattedNumber(str: string): number {
  return parseInt(str.replace(/[^0-9-]/g, ''), 10) || 0;
}
