/**
 * 당일 집계표 프린트 미리보기
 *
 * A4 반장 (148.5mm) 기준, 수정 가능한 테이블 → 프린트
 */

import { openPrintModal, formatNumber } from './print-preview';
import { aggregateDailySummary, type DailySummaryRow } from './daily-summary-excel';
import type { Transaction } from './excel-utils';
import { getReceiptBalancesForDate } from './payments';

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

  // 전잔고 조회 (실패해도 집계표는 정상 출력)
  const balances = new Map<string, number>();
  try {
    const balanceMap = await getReceiptBalancesForDate(dateStr);
    for (const [name, b] of balanceMap) {
      balances.set(name, b.previousBalance);
    }
  } catch (err) {
    console.warn('[openDailySummaryPreview] 전잔고 조회 실패 (집계표는 그대로 출력):', err);
  }

  // 당일 매출이 없지만 전잔고(>0)가 남은 거래처도 row 로 추가.
  // — 사용자가 "당일날 가져가지 않아도 잔고가 있으면 내역서에 떠야" 한다고 요구.
  const namesInAggregated = new Set(aggregated.map((r) => r.customerName));
  const extras: DailySummaryRow[] = [];
  for (const [name, prev] of balances) {
    if (prev > 0 && !namesInAggregated.has(name)) {
      extras.push({
        customerName: name,
        prevBalance: prev,
        salesAmount: 0,
        totalBalance: prev,
      });
    }
  }

  const rows = [...aggregated, ...extras].sort((a, b) =>
    a.customerName.localeCompare(b.customerName, 'ko-KR'),
  );

  if (rows.length === 0) {
    throw new Error('선택한 날짜에 해당하는 거래 내역이 없습니다.');
  }

  // HTML 생성
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
 *
 * 즉 거래처 45개 이하면 박스 1개 (분할 X), 46개 이상부터 박스 2개로 분할.
 */
const ROWS_PER_PAGE = 45;

/**
 * HTML 생성
 *
 *   콘텐츠가 한 박스에 안 들어갈 때만 페이지 분할. ROWS_PER_PAGE 이하면 박스 1개 그대로.
 *   각 페이지에 타이틀/날짜/표 헤더 반복. 합계 행은 마지막 페이지에만 표시.
 *   여러 페이지일 땐 우상단에 'N / total' 페이지번호 표시 (한 페이지면 생략).
 */
function buildDailySummaryHtml(
  rows: DailySummaryRow[],
  dateStr: string,
  balances: Map<string, number>,
): string {
  // 전체 합계 (마지막 페이지에만 표시)
  let totalSales = 0;
  let totalPrev = 0;
  rows.forEach((r) => {
    totalSales += r.salesAmount;
    totalPrev += balances.get(r.customerName) ?? 0;
  });
  const totalBalance = totalPrev + totalSales;

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
          const prev = balances.get(r.customerName) ?? 0;
          const total = prev + r.salesAmount;
          return `
    <tr>
      <td style="text-align:left; padding-left:6px;" contenteditable="true">${r.customerName}</td>
      <td style="text-align:right; padding-right:6px;" contenteditable="true" data-row="${i}" data-col="prev">${prev > 0 ? formatNumber(prev) : ''}</td>
      <td style="text-align:right; padding-right:6px;" contenteditable="true" data-row="${i}" data-col="sales">${r.salesAmount > 0 ? formatNumber(r.salesAmount) : ''}</td>
      <td style="text-align:right; padding-right:6px; font-weight:700; color:#1B365D;" data-row="${i}" data-col="total">${total > 0 ? formatNumber(total) : ''}</td>
    </tr>`;
        })
        .join('');

      const footHtml = isLast
        ? `
        <tfoot>
          <tr style="background:#f0f0f0; font-weight:800;">
            <td style="text-align:center;">합계</td>
            <td style="text-align:right; padding-right:6px;" id="ds-total-prev">${totalPrev > 0 ? formatNumber(totalPrev) : ''}</td>
            <td style="text-align:right; padding-right:6px;" id="ds-total-sales">${formatNumber(totalSales)}</td>
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
            <th style="width:40%;">상호</th>
            <th style="width:20%;">전잔고</th>
            <th style="width:20%;">매출금액</th>
            <th style="width:20%;">총잔액</th>
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
