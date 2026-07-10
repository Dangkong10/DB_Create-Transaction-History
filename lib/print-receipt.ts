/**
 * 영수증 프린트 미리보기
 *
 * A4 한 장에 2x3 그리드(6칸) 배치.
 * 품목이 많은 영수증은 같은 폭·같은 디자인에서 품목 행만 늘어나
 * 세로 2~3칸을 차지하고, 일반 페이지 뒤(마지막 페이지)에 모아 배치한다.
 * 일반 영수증 자투리(마지막 장 잔여분)는 초과 페이지 빈 슬롯에 전부
 * 들어갈 수 있으면 흡수해 장 수를 아낀다.
 * 수정 가능한 셀 → 프린트
 */

import { openPrintModal, formatDateWithDay, formatNumber } from './print-preview';
import { aggregateTransactions, groupByReceipt, filterByDate, type ReceiptGroup } from './excel-utils';
import { loadProducts } from './storage';
import type { Transaction } from './excel-utils';
import type { Product } from './types';
import { resolveSpecialAmount, type SpecialPriceLite } from './unit-price';
import { getReceiptBalancesForDate, type ReceiptBalances } from './payments';

const COMPANY_NAME = '동방모사';

// 칸(slot) 수별 품목 행 수. 1칸 = 기존 일반 영수증과 동일한 8행.
// 2·3칸은 헤더(제목/회사/상호/날짜/열헤더/총액)가 한 번만 있으므로
// 칸이 늘어난 만큼보다 품목 행이 더 들어간다 (행높이 17pt 기준 여유 포함).
const SPAN_ITEM_ROWS: Record<number, number> = { 1: 8, 2: 20, 3: 32 };
const SLOTS_PER_PAGE = 6;
const ROWS_PER_COL = 3;

/** 배치 계산이 끝난 영수증 */
interface PlacedReceipt {
  receipt: ReceiptGroup;
  /** 전잔고 (0이면 표기 안 함) */
  prev: number;
  /** 세로로 차지하는 칸 수 (1 = 일반) */
  span: number;
  /** 품목 영역 행 수 */
  maxRows: number;
}

/**
 * 영수증 미리보기 모달 열기
 */
export async function openReceiptPreview(
  transactions: Transaction[],
  dateStr: string,
  titleOverride?: string,
): Promise<void> {
  // 제품 목록 (단가 매칭용)
  const products = await loadProducts();

  // 특가 목록
  let specialPrices: SpecialPriceLite[] = [];
  try {
    const { getSpecialPrices } = await import('./supabase');
    specialPrices = await getSpecialPrices();
  } catch { /* 특가 없이 진행 */ }

  // 집계 & 그룹핑
  const aggregated = aggregateTransactions(transactions as Transaction[]);
  let receipts = groupByReceipt(aggregated);
  if (dateStr) receipts = filterByDate(receipts, dateStr);

  if (receipts.length === 0) {
    throw new Error('선택한 조건에 해당하는 거래 내역이 없습니다.');
  }

  // 전잔고 조회 (날짜 지정된 경우만). 실패해도 영수증은 정상 출력 (전잔고만 빈 채로).
  // 전잔고 유무가 필요 행 수(→ 칸 수)에 영향을 주므로 배치 계산 전에 조회한다.
  let balancesByCustomer: Map<string, ReceiptBalances> = new Map();
  if (dateStr) {
    try {
      balancesByCustomer = await getReceiptBalancesForDate(dateStr);
    } catch (err) {
      console.warn('[openReceiptPreview] 전잔고 조회 실패 (영수증은 그대로 출력):', err);
    }
  }

  // 필요 행 수(품목 + 전잔고 행) 기준으로 칸 수 계산 → 일반 / 초과 분리
  const normal: PlacedReceipt[] = [];
  const oversized: PlacedReceipt[] = [];
  receipts.forEach((r) => {
    const prev = receiptPrev(balancesByCustomer.get(r.customerName));
    const rowsNeeded = r.items.length + (prev > 0 ? 1 : 0);
    const span = spanForRows(rowsNeeded);
    const maxRows = Math.max(SPAN_ITEM_ROWS[span], rowsNeeded);
    const placed: PlacedReceipt = { receipt: r, prev, span, maxRows };
    (span > 1 ? oversized : normal).push(placed);
  });

  // HTML 생성
  const contentHtml = buildReceiptHtml(normal, oversized, products, specialPrices);

  openPrintModal({
    title: titleOverride || `🧾 ${dateStr || '전체'} 영수증 (${receipts.length}건)`,
    subtitle: `일반 ${normal.length}건 · 품목초과 ${oversized.length}건 | 셀을 클릭하면 수정 가능`,
    contentHtml,
  });
}

// =================================================================
//  HTML 생성
// =================================================================

/**
 * 영수증 한 장에 적힐 「전잔고」 값.
 *
 *   집계표용 prev (= D 직전 잔고, 당일 입금 차감 안 됨)에서
 *   당일 입금까지 마저 빼서 "지금 받을 돈" 의미로 되돌린다.
 *
 *   prev_for_receipt = SUM(매출<D) − SUM(입금≤D) + SUM(조정≤D)
 *
 *   영수증 총액 = prev_for_receipt + 당일 매출
 *               = 거래처가 이번에 줘야 할 돈
 */
function receiptPrev(b: ReceiptBalances | undefined): number {
  if (!b) return 0;
  return b.previousBalance - b.dailyPayment;
}

/** 필요 행 수 → 세로 칸 수 (최대 3칸 = 한 페이지의 한 열) */
function spanForRows(rowsNeeded: number): number {
  if (rowsNeeded <= SPAN_ITEM_ROWS[1]) return 1;
  if (rowsNeeded <= SPAN_ITEM_ROWS[2]) return 2;
  return 3;
}

function buildReceiptHtml(
  normal: PlacedReceipt[],
  oversized: PlacedReceipt[],
  products: Product[],
  specialPrices: SpecialPriceLite[],
): string {
  // 초과 영수증 페이지 배치 (2열 × 3행 칸 단위 패킹)
  const overPages = packOversized(oversized);

  // 자투리 흡수: 일반 영수증 마지막 장의 잔여분이 초과 페이지 빈 슬롯에
  // 전부 들어가면 옮겨서 한 장을 아낀다. 일부만 들어가는 경우는 흡수해도
  // 장 수가 줄지 않으므로 그대로 둔다.
  const freeSlots = collectFreeSlots(overPages);
  const leftover = normal.length % SLOTS_PER_PAGE;
  if (leftover > 0 && leftover <= freeSlots.length) {
    const absorbed = normal.splice(normal.length - leftover, leftover);
    absorbed.forEach((p, i) => {
      const slot = freeSlots[i];
      slot.page.slots.push({ placed: p, col: slot.col, row: slot.row });
      slot.page.colsUsed[slot.col - 1] += 1;
    });
  }

  const parts: string[] = [];
  let pageNum = 0;
  const totalPages = Math.ceil(normal.length / SLOTS_PER_PAGE) + overPages.length;

  // --- 일반 영수증 페이지 (6개씩) ---
  for (let i = 0; i < normal.length; i += SLOTS_PER_PAGE) {
    pageNum++;
    const pageReceipts = normal.slice(i, i + SLOTS_PER_PAGE);

    parts.push(`<div class="page-divider normal">📄 ${pageNum}페이지 — 일반 영수증</div>`);
    // padding 0 으로 A4 가장자리까지 사용, grid 가 페이지 본문을 전부 채워 6칸이 균등 분배되도록.
    // 실제 프린트의 인쇄 가능 영역(보통 5mm 안전 여백)은 프린터 드라이버가 자동 처리.
    parts.push(`<div class="a4-page full" style="padding:0; min-height:297mm; position:relative;"><span class="a4-label" style="top:2mm; right:3mm;">${pageNum} / ${totalPages}</span>`);
    parts.push('<div class="r-grid" style="height:297mm; grid-template-rows:repeat(3, 1fr); gap:0;">');

    for (let slot = 0; slot < SLOTS_PER_PAGE; slot++) {
      if (slot < pageReceipts.length) {
        const p = pageReceipts[slot];
        parts.push('<div class="r-block" style="padding:2mm; border:0.5px solid #ddd; display:flex; flex-direction:column; overflow:hidden;">');
        parts.push(buildSingleReceipt(p.receipt, products, specialPrices, p.maxRows, p.prev));
        parts.push('</div>');
      } else {
        parts.push(emptySlotHtml());
      }
    }

    parts.push('</div></div>');
  }

  // --- 초과 영수증 페이지 (마지막에 모아 배치, 칸 단위 세로 확장) ---
  overPages.forEach((page) => {
    pageNum++;
    parts.push(`<div class="page-divider over">📄 ${pageNum}페이지 — 품목 초과 영수증</div>`);
    parts.push(`<div class="a4-page full" style="padding:0; min-height:297mm; position:relative;"><span class="a4-label" style="top:2mm; right:3mm;">${pageNum} / ${totalPages}</span>`);
    parts.push('<div class="r-grid" style="height:297mm; grid-template-rows:repeat(3, 1fr); gap:0;">');

    page.slots.forEach(({ placed, col, row }) => {
      parts.push(`<div class="r-block" style="grid-column:${col}; grid-row:${row} / span ${placed.span}; padding:2mm; border:0.5px solid #ddd; display:flex; flex-direction:column; overflow:hidden;">`);
      parts.push(buildSingleReceipt(placed.receipt, products, specialPrices, placed.maxRows, placed.prev));
      parts.push('</div>');
    });

    // 남은 빈 슬롯
    for (let c = 0; c < 2; c++) {
      for (let r = page.colsUsed[c]; r < ROWS_PER_COL; r++) {
        parts.push(emptySlotHtml(`grid-column:${c + 1}; grid-row:${r + 1};`));
      }
    }

    parts.push('</div></div>');
  });

  return parts.join('');
}

function emptySlotHtml(gridStyle: string = ''): string {
  return `<div class="r-block" style="${gridStyle} padding:2mm; border:0.5px solid #ddd; display:flex; flex-direction:column;"><div class="empty-slot" style="flex:1;"><div class="empty-slot-inner">빈 슬롯</div></div></div>`;
}

// =================================================================
//  단일 영수증 HTML
// =================================================================

function buildSingleReceipt(
  receipt: ReceiptGroup,
  products: Product[],
  specialPrices: SpecialPriceLite[],
  maxRows: number,
  previousBalance: number = 0,
): string {
  const date = formatDateWithDay(receipt.date);
  let totalPrice = 0;

  // 품목 행
  const itemRows: string[] = [];
  for (let i = 0; i < maxRows; i++) {
    const item = receipt.items[i];
    if (item) {
      const sp = specialPrices.find(
        (s) => s.customerName === receipt.customerName && s.productName === item.productName,
      );
      const prod = products.find((p) => p.name === item.productName);
      const unitPrice = sp ? resolveSpecialAmount(sp, prod?.unitPrice) : prod?.unitPrice;
      const itemTotal = unitPrice && unitPrice > 0 ? unitPrice * item.quantity : 0;
      totalPrice += itemTotal;

      itemRows.push(`
        <tr class="ri">
          <td contenteditable="true">${item.productName}</td>
          <td contenteditable="true">${item.quantity}</td>
          <td contenteditable="true">${itemTotal > 0 ? formatNumber(itemTotal) : ''}</td>
        </tr>`);
    } else {
      // 빈 행 (행 수 맞추기)
      itemRows.push(`
        <tr class="ri">
          <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
        </tr>`);
    }
  }

  // 전잔고: 항상 표기 — '공급가 총액' 바로 윗 행.
  // maxRows 는 배치 단계에서 품목 + 전잔고 행까지 감안해 계산되므로
  // 마지막 행은 항상 빈 행이지만, 만약을 위해 꽉 찬 경우 행을 추가한다.
  if (previousBalance > 0) {
    const prevRow = `
      <tr class="ri">
        <td contenteditable="true" style="text-align:right; font-weight:600; color:#92400e;">전잔고</td>
        <td>&nbsp;</td>
        <td contenteditable="true" style="text-align:right; font-weight:600; color:#92400e;">${formatNumber(previousBalance)}</td>
      </tr>`;
    if (receipt.items.length < maxRows) {
      itemRows[itemRows.length - 1] = prevRow;
    } else {
      itemRows.push(prevRow);
    }
    totalPrice += previousBalance;
  }

  return `
    <table class="receipt-table">
      <tr><td colspan="3" class="rh">영수증</td></tr>
      <tr><td colspan="3" class="rc">${COMPANY_NAME}</td></tr>
      <tr>
        <td class="rl">상호</td>
        <td colspan="2" class="rv" contenteditable="true">${receipt.customerName}</td>
      </tr>
      <tr>
        <td class="rl">전표날짜</td>
        <td colspan="2" class="rv">${date}</td>
      </tr>
      <tr class="ri"><th style="width:35%;">품목</th><th style="width:20%;">수량</th><th style="width:45%;">공급대가</th></tr>
      ${itemRows.join('')}
      <tr class="rt">
        <td colspan="2">공급가 총액</td>
        <td contenteditable="true" style="text-align:right;">${totalPrice > 0 ? formatNumber(totalPrice) : ''}</td>
      </tr>
    </table>`;
}

// =================================================================
//  초과 영수증 페이지 배치 (2열 × 3행 칸 단위 패킹)
// =================================================================

interface OversizedPage {
  /** 열별 사용된 칸 수 [왼쪽, 오른쪽] */
  colsUsed: [number, number];
  slots: { placed: PlacedReceipt; col: number; row: number }[];
}

interface FreeSlot {
  page: OversizedPage;
  col: number;
  row: number;
}

/**
 * 초과 영수증을 2열 × 3행(칸) 그리드에 채운다.
 *
 * 1. 칸 수 내림차순 정렬 (큰 것부터 — first-fit decreasing)
 * 2. 기존 페이지의 열 중 남은 칸이 충분한 곳에 배치
 * 3. 없으면 새 페이지
 */
function packOversized(oversized: PlacedReceipt[]): OversizedPage[] {
  const sorted = [...oversized].sort((a, b) => b.span - a.span);
  const pages: OversizedPage[] = [];

  sorted.forEach((p) => {
    const span = Math.min(p.span, ROWS_PER_COL);
    for (const page of pages) {
      for (let c = 0; c < 2; c++) {
        if (ROWS_PER_COL - page.colsUsed[c] >= span) {
          page.slots.push({ placed: p, col: c + 1, row: page.colsUsed[c] + 1 });
          page.colsUsed[c] += span;
          return;
        }
      }
    }
    pages.push({ colsUsed: [span, 0], slots: [{ placed: p, col: 1, row: 1 }] });
  });

  return pages;
}

/** 초과 페이지들의 빈 슬롯 목록 (페이지 → 열 → 행 순서) */
function collectFreeSlots(pages: OversizedPage[]): FreeSlot[] {
  const free: FreeSlot[] = [];
  pages.forEach((page) => {
    for (let c = 0; c < 2; c++) {
      for (let r = page.colsUsed[c]; r < ROWS_PER_COL; r++) {
        free.push({ page, col: c + 1, row: r + 1 });
      }
    }
  });
  return free;
}
