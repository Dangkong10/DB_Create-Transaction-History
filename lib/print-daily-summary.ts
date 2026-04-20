/**
 * 당일 집계표 프린트 미리보기
 *
 * A4 반장 (148.5mm) 기준, 수정 가능한 테이블 → 프린트
 */

import { openPrintModal, formatNumber } from './print-preview';
import { aggregateDailySummary, type DailySummaryRow } from './daily-summary-excel';
import type { Transaction } from './excel-utils';

/**
 * 당일 집계표 미리보기 모달 열기
 */
export async function openDailySummaryPreview(
  transactions: Transaction[],
  dateStr: string,
  getUnitPrice: (productName: string) => number,
): Promise<void> {
  // 해당 날짜 거래만 필터
  const filtered = transactions.filter((t) => t.date.startsWith(dateStr));
  if (filtered.length === 0) {
    throw new Error('선택한 날짜에 해당하는 거래 내역이 없습니다.');
  }

  // 집계 데이터 생성
  const rows = aggregateDailySummary(filtered, getUnitPrice);

  // HTML 생성
  const contentHtml = buildDailySummaryHtml(rows, dateStr);

  openPrintModal({
    title: `📊 ${dateStr} 당일 집계표`,
    subtitle: '셀을 클릭하면 수정할 수 있어요 | 글씨 13pt · 행높이 17pt',
    contentHtml,
  });

  // 총잔액 자동 재계산 바인딩
  setTimeout(() => bindRecalculation(), 100);
}

/**
 * HTML 생성
 */
function buildDailySummaryHtml(rows: DailySummaryRow[], dateStr: string): string {
  // 합계 행 계산 (전잔고는 수기 입력이므로 0으로 시작)
  let totalSales = 0;
  rows.forEach((r) => {
    totalSales += r.salesAmount;
  });

  const dataRowsHtml = rows
    .map(
      (r, i) => `
    <tr>
      <td style="text-align:left; padding-left:6px;" contenteditable="true">${r.customerName}</td>
      <td style="text-align:right; padding-right:6px;" contenteditable="true" data-row="${i}" data-col="prev"></td>
      <td style="text-align:right; padding-right:6px;" contenteditable="true" data-row="${i}" data-col="sales">${r.salesAmount > 0 ? formatNumber(r.salesAmount) : ''}</td>
      <td style="text-align:right; padding-right:6px; font-weight:700; color:#1B365D;" data-row="${i}" data-col="total">${r.salesAmount > 0 ? formatNumber(r.salesAmount) : ''}</td>
    </tr>`,
    )
    .join('');

  return `
    <div class="a4-page half">
      <div style="text-align:center; margin-bottom:8mm;">
        <div style="font-size:16pt; font-weight:800;">당일 집계표</div>
      </div>
      <div style="text-align:right; margin-bottom:4mm; font-size:11pt;">${dateStr}</div>

      <table class="ppm-table">
        <thead>
          <tr>
            <th style="width:40%;">상호</th>
            <th style="width:20%;">전잔고</th>
            <th style="width:20%;">매출금액</th>
            <th style="width:20%;">총잔액</th>
          </tr>
        </thead>
        <tbody>
          ${dataRowsHtml}
        </tbody>
        <tfoot>
          <tr style="background:#f0f0f0; font-weight:800;">
            <td style="text-align:center;">합계</td>
            <td style="text-align:right; padding-right:6px;" id="ds-total-prev"></td>
            <td style="text-align:right; padding-right:6px;" id="ds-total-sales">${formatNumber(totalSales)}</td>
            <td style="text-align:right; padding-right:6px; color:#1B365D;" id="ds-total-balance">${formatNumber(totalSales)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

/**
 * 총잔액 자동 재계산 (전잔고/매출금액 수정 시)
 */
function bindRecalculation(): void {
  const modal = document.getElementById('print-preview-modal');
  if (!modal) return;

  modal.addEventListener('input', (e) => {
    const target = e.target as HTMLElement;
    const col = target.getAttribute('data-col');
    if (col !== 'prev' && col !== 'sales') return;

    const row = target.getAttribute('data-row');
    if (!row) return;

    // 같은 행의 전잔고, 매출금액 읽기
    const prevCell = modal.querySelector(`[data-row="${row}"][data-col="prev"]`) as HTMLElement;
    const salesCell = modal.querySelector(`[data-row="${row}"][data-col="sales"]`) as HTMLElement;
    const totalCell = modal.querySelector(`[data-row="${row}"][data-col="total"]`) as HTMLElement;

    if (!prevCell || !salesCell || !totalCell) return;

    const prev = parseFormattedNumber(prevCell.textContent || '0');
    const sales = parseFormattedNumber(salesCell.textContent || '0');
    totalCell.textContent = formatNumber(prev + sales);

    // 합계 행 재계산
    recalcTotals(modal);
  });
}

function recalcTotals(modal: HTMLElement): void {
  let totalPrev = 0;
  let totalSales = 0;
  let totalBalance = 0;

  const prevCells = modal.querySelectorAll('[data-col="prev"]');
  const salesCells = modal.querySelectorAll('[data-col="sales"]');
  const totalCells = modal.querySelectorAll('[data-col="total"]');

  prevCells.forEach((c) => { totalPrev += parseFormattedNumber(c.textContent || '0'); });
  salesCells.forEach((c) => { totalSales += parseFormattedNumber(c.textContent || '0'); });
  totalCells.forEach((c) => { totalBalance += parseFormattedNumber(c.textContent || '0'); });

  const tp = modal.querySelector('#ds-total-prev');
  const ts = modal.querySelector('#ds-total-sales');
  const tb = modal.querySelector('#ds-total-balance');
  if (tp) tp.textContent = formatNumber(totalPrev);
  if (ts) ts.textContent = formatNumber(totalSales);
  if (tb) tb.textContent = formatNumber(totalBalance);
}

function parseFormattedNumber(str: string): number {
  return parseInt(str.replace(/[^0-9-]/g, ''), 10) || 0;
}
