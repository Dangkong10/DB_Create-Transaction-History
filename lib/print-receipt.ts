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
import { getReceiptBalancesForDate, type ReceiptBalances } from './payments';

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

  // 전잔고 조회 (날짜 지정된 경우만). 실패해도 영수증은 정상 출력 (전잔고만 빈 채로).
  let balancesByCustomer: Map<string, ReceiptBalances> = new Map();
  if (dateStr) {
    try {
      balancesByCustomer = await getReceiptBalancesForDate(dateStr);
    } catch (err) {
      console.warn('[openReceiptPreview] 전잔고 조회 실패 (영수증은 그대로 출력):', err);
    }
  }

  // HTML 생성
  const contentHtml = buildReceiptHtml(normal, oversized, products, specialPrices, balancesByCustomer);

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
  balancesByCustomer: Map<string, ReceiptBalances>,
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
    // padding 0 으로 A4 가장자리까지 사용, grid 가 페이지 본문을 전부 채워 6칸이 균등 분배되도록.
    // 실제 프린트의 인쇄 가능 영역(보통 5mm 안전 여백)은 프린터 드라이버가 자동 처리.
    parts.push(`<div class="a4-page full" style="padding:0; min-height:297mm; position:relative;"><span class="a4-label" style="top:2mm; right:3mm;">${pageNum} / ${totalPages}</span>`);
    parts.push('<div class="r-grid" style="height:297mm; grid-template-rows:repeat(3, 1fr); gap:0;">');

    for (let slot = 0; slot < 6; slot++) {
      if (slot < pageReceipts.length) {
        parts.push('<div class="r-block" style="padding:2mm; border:0.5px solid #ddd; display:flex; flex-direction:column; overflow:hidden;">');
        // maxRows: 6 → 8 (사용자 요구로 품목 행 2개 추가). 행 8개여도
        // 글씨/행높이 기준으로 1/3 페이지 99mm 안에 들어가도록 행 높이 17pt 유지.
        parts.push(buildSingleReceipt(pageReceipts[slot], products, specialPrices, 8, balancesByCustomer.get(pageReceipts[slot].customerName)?.previousBalance ?? 0));
        parts.push('</div>');
      } else {
        parts.push('<div class="r-block" style="padding:2mm; border:0.5px solid #ddd; display:flex; flex-direction:column;"><div class="empty-slot" style="flex:1;"><div class="empty-slot-inner">빈 슬롯</div></div></div>');
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
            parts.push(`<div>${buildSingleReceipt(r, products, specialPrices, r.items.length, balancesByCustomer.get(r.customerName)?.previousBalance ?? 0)}</div>`);
          });
          parts.push('</div>');
        } else {
          parts.push('<div class="over-grid-1" style="margin-bottom:6mm;">');
          parts.push(`<div>${buildSingleReceipt(row[0], products, specialPrices, row[0].items.length, balancesByCustomer.get(row[0].customerName)?.previousBalance ?? 0)}</div>`);
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

  // 전잔고 자동 채움: 빈 행이 있을 때만 '공급가 총액' 바로 윗 칸에 표기.
  // 명세서 §6 — 출력 폼 변형 금지. 6칸 꽉 차면 자동 채움 X.
  if (previousBalance > 0 && receipt.items.length < maxRows) {
    itemRows[itemRows.length - 1] = `
      <tr class="ri">
        <td contenteditable="true" style="text-align:right; font-weight:600; color:#92400e;">전잔고</td>
        <td>&nbsp;</td>
        <td contenteditable="true" style="text-align:right; font-weight:600; color:#92400e;">${formatNumber(previousBalance)}</td>
      </tr>`;
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
