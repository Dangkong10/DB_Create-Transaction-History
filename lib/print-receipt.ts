/**
 * 영수증 프린트 미리보기
 *
 * A4 한 장에 2x3 그리드 배치 (일반) + 초과 영수증 별도 페이지 배치
 * 수정 가능한 셀 → 프린트
 */

import { openPrintModal, formatDateWithDay, formatNumber } from './print-preview';
import { aggregateTransactions, groupByReceipt, filterByDate, type ReceiptGroup } from './excel-utils';
import { loadProducts } from './storage';
import type { Transaction } from './excel-utils';
import type { Product } from './types';

// 영수증 높이 계산 상수 (pt 단위)
const ROW_HEIGHT_PT = 17;
const RECEIPT_HEADER_ROWS = 6; // 제목(1) + 회사명(1) + 상호(1) + 날짜(1) + 열헤더(1) + 총액(1)
const A4_USABLE_HEIGHT_PT = 780; // 약 267mm
const COMPANY_NAME = '동방모사';

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
  let specialPrices: Array<{ customerName: string; productName: string; customPrice: number }> = [];
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

  // 일반 (≤6) / 초과 (>6) 분리
  const normal: ReceiptGroup[] = [];
  const oversized: ReceiptGroup[] = [];
  receipts.forEach((r) => (r.items.length > 6 ? oversized : normal).push(r));

  // HTML 생성
  const contentHtml = buildReceiptHtml(normal, oversized, products, specialPrices);

  openPrintModal({
    title: titleOverride || `🧾 ${dateStr || '전체'} 영수증 (${receipts.length}건)`,
    subtitle: `일반 ${normal.length}건 · 초과 ${oversized.length}건 | 셀을 클릭하면 수정 가능`,
    contentHtml,
  });
}

// =================================================================
//  HTML 생성
// =================================================================

function buildReceiptHtml(
  normal: ReceiptGroup[],
  oversized: ReceiptGroup[],
  products: Product[],
  specialPrices: Array<{ customerName: string; productName: string; customPrice: number }>,
): string {
  const parts: string[] = [];
  let pageNum = 0;

  // --- 일반 영수증 페이지 (6개씩) ---
  const totalNormalPages = Math.ceil(normal.length / 6) || 0;
  const totalOversizedPages = estimateOversizedPages(oversized);
  const totalPages = totalNormalPages + totalOversizedPages;

  for (let i = 0; i < normal.length; i += 6) {
    pageNum++;
    const pageReceipts = normal.slice(i, i + 6);

    parts.push(`<div class="page-divider normal">📄 ${pageNum}페이지 — 일반 영수증</div>`);
    parts.push(`<div class="a4-page full"><span class="a4-label">${pageNum} / ${totalPages}</span>`);
    parts.push('<div class="r-grid">');

    for (let slot = 0; slot < 6; slot++) {
      if (slot < pageReceipts.length) {
        parts.push('<div class="r-block">');
        parts.push(buildSingleReceipt(pageReceipts[slot], products, specialPrices, 6));
        parts.push('</div>');
      } else {
        parts.push('<div class="r-block"><div class="empty-slot"><div class="empty-slot-inner">빈 슬롯</div></div></div>');
      }
    }

    parts.push('</div></div>');
  }

  // --- 초과 영수증 페이지 (높이 기반 패킹) ---
  if (oversized.length > 0) {
    const oversizedPages = layoutOversized(oversized);

    oversizedPages.forEach((page) => {
      pageNum++;
      parts.push(`<div class="page-divider over">⚠️ ${pageNum}페이지 — 초과 항목 영수증</div>`);
      parts.push(`<div class="a4-page full"><span class="a4-label">${pageNum} / ${totalPages}</span>`);

      page.forEach((row) => {
        if (row.length === 2) {
          parts.push('<div class="over-grid-2" style="margin-bottom:6mm;">');
          row.forEach((r) => {
            parts.push(`<div>${buildSingleReceipt(r, products, specialPrices, r.items.length)}</div>`);
          });
          parts.push('</div>');
        } else {
          parts.push('<div class="over-grid-1" style="margin-bottom:6mm;">');
          parts.push(`<div>${buildSingleReceipt(row[0], products, specialPrices, row[0].items.length)}</div>`);
          parts.push('</div>');
        }
      });

      parts.push('</div>');
    });
  }

  return parts.join('');
}

// =================================================================
//  단일 영수증 HTML
// =================================================================

function buildSingleReceipt(
  receipt: ReceiptGroup,
  products: Product[],
  specialPrices: Array<{ customerName: string; productName: string; customPrice: number }>,
  maxRows: number,
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
      const unitPrice = sp?.customPrice ?? prod?.unitPrice;
      const itemTotal = unitPrice && unitPrice > 0 ? unitPrice * item.quantity : 0;
      totalPrice += itemTotal;

      itemRows.push(`
        <tr class="ri">
          <td contenteditable="true">${item.productName}</td>
          <td contenteditable="true">${item.quantity}</td>
          <td contenteditable="true">${itemTotal > 0 ? formatNumber(itemTotal) : ''}</td>
        </tr>`);
    } else {
      // 빈 행 (일반 영수증: 6행 맞추기)
      itemRows.push(`
        <tr class="ri">
          <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
        </tr>`);
    }
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
//  초과 영수증 레이아웃 알고리즘
// =================================================================

/** 영수증 높이 계산 (pt) */
function calcReceiptHeight(receipt: ReceiptGroup): number {
  return (receipt.items.length + RECEIPT_HEADER_ROWS) * ROW_HEIGHT_PT;
}

/** 초과 영수증 페이지 수 추정 */
function estimateOversizedPages(oversized: ReceiptGroup[]): number {
  if (oversized.length === 0) return 0;
  return layoutOversized(oversized).length;
}

/**
 * 초과 영수증 페이지 배치 알고리즘
 *
 * 1. 품목 수 기준 오름차순 정렬
 * 2. 두 개씩 짝을 지어 나란히(2열) 배치 시도
 * 3. 현재 페이지 남은 높이에 맞으면 배치, 아니면 새 페이지
 * 4. 홀수 개가 남으면 단독(1열) 배치
 *
 * 반환: 페이지[] → 행[] → 영수증[] (1~2개)
 */
function layoutOversized(oversized: ReceiptGroup[]): ReceiptGroup[][][] {
  const sorted = [...oversized].sort((a, b) => a.items.length - b.items.length);

  const pages: ReceiptGroup[][][] = [];
  let currentPage: ReceiptGroup[][] = [];
  let remainingHeight = A4_USABLE_HEIGHT_PT;

  let i = 0;
  while (i < sorted.length) {
    if (i + 1 < sorted.length) {
      // 두 개씩 짝짓기
      const a = sorted[i];
      const b = sorted[i + 1];
      const pairHeight = Math.max(calcReceiptHeight(a), calcReceiptHeight(b));

      if (pairHeight <= remainingHeight) {
        currentPage.push([a, b]);
        remainingHeight -= pairHeight + 20; // 간격 여유
        i += 2;
      } else if (currentPage.length === 0) {
        // 빈 페이지에도 안 들어가면 그냥 넣기
        currentPage.push([a, b]);
        pages.push(currentPage);
        currentPage = [];
        remainingHeight = A4_USABLE_HEIGHT_PT;
        i += 2;
      } else {
        // 새 페이지
        pages.push(currentPage);
        currentPage = [];
        remainingHeight = A4_USABLE_HEIGHT_PT;
      }
    } else {
      // 홀수: 단독 배치
      const single = sorted[i];
      const h = calcReceiptHeight(single);

      if (h <= remainingHeight) {
        currentPage.push([single]);
        remainingHeight -= h + 20;
      } else if (currentPage.length === 0) {
        currentPage.push([single]);
        pages.push(currentPage);
        currentPage = [];
        remainingHeight = A4_USABLE_HEIGHT_PT;
      } else {
        pages.push(currentPage);
        currentPage = [[single]];
        remainingHeight = A4_USABLE_HEIGHT_PT - h - 20;
      }
      i++;
    }
  }

  if (currentPage.length > 0) pages.push(currentPage);
  return pages;
}
