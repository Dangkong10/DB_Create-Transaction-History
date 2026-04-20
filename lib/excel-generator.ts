/**
 * ExcelJS를 사용한 영수증 양식 엑셀 파일 생성
 * 이미지 기준 정확한 레이아웃 구현
 */

import ExcelJS from "exceljs";
import { ReceiptGroup } from "./excel-utils";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { loadProducts } from "./storage";
import type { Product } from "./types";

// 셀 규격 상수
const ROW_HEIGHT = 17.4;
const COL_WIDTH = {
  A: 13,
  B: 6.2,
  C: 15.2,
  D: 2,
  E: 13,
  F: 6.2,
  G: 15.2,
};

const ROWS_PER_RECEIPT = 13; // 헤더 4행 + 품목 6행 + footer 1행 + 간격 2행
const SPACING_ROWS = 3; // 영수증 간 간격
const ROWS_PER_PAGE = 43; // A4 기준 페이지당 행 수

/**
 * 품목 수가 6개를 초과하는지 확인
 */
function isOverflow(receipt: ReceiptGroup): boolean {
  return receipt.items.length > 6;
}

/**
 * 2x3 그리드 영수증 양식 엑셀 파일 생성
 */
export async function generateReceiptExcel(
  receipts: ReceiptGroup[],
  filename?: string
): Promise<void> {
  // 제품 목록 조회 (단가 매칭용)
  const products = await loadProducts();
  
  // 특가 목록 조회
  let specialPrices: Array<{ customerName: string; productName: string; customPrice: number }> = [];
  try {
    const { getSpecialPrices } = await import('./supabase');
    specialPrices = await getSpecialPrices();
    console.log('[Excel Generator] 특가 목록 로드 성공:', specialPrices.length, '건');
    console.log('[Excel Generator] 특가 데이터:', JSON.stringify(specialPrices, null, 2));
  } catch (error) {
    console.warn('[Excel Generator] Failed to load special prices:', error);
    // 특가 목록 로드 실패 시 기본 단가만 사용
  }
  
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("영수증");

  // 기본 행 높이 설정
  worksheet.properties.defaultRowHeight = ROW_HEIGHT;

  // 열 너비 설정
  worksheet.getColumn(1).width = COL_WIDTH.A;
  worksheet.getColumn(2).width = COL_WIDTH.B;
  worksheet.getColumn(3).width = COL_WIDTH.C;
  worksheet.getColumn(4).width = COL_WIDTH.D;
  worksheet.getColumn(5).width = COL_WIDTH.E;
  worksheet.getColumn(6).width = COL_WIDTH.F;
  worksheet.getColumn(7).width = COL_WIDTH.G;

  // 품목 6개 이하와 초과 분리
  const normalReceipts: ReceiptGroup[] = [];
  const oversizedReceipts: ReceiptGroup[] = [];

  receipts.forEach((receipt) => {
    if (isOverflow(receipt)) {
      oversizedReceipts.push(receipt);
    } else {
      normalReceipts.push(receipt);
    }
  });

  let currentRow = 1;

  // 통계 정보 표시 (상단 1행)
  const statsCell = worksheet.getCell(currentRow, 1);
  statsCell.value = `금일 총 거래처 수: ${receipts.length}명`;
  statsCell.font = { bold: true, size: 11 };
  statsCell.alignment = { horizontal: "left", vertical: "middle" };
  worksheet.getRow(currentRow).height = ROW_HEIGHT;
  currentRow += 2; // 통계 + 공백 1행

  // 1. 일반 영수증 (품목 6개 이하) - 2x3 그리드로 배치
  for (let i = 0; i < normalReceipts.length; i += 6) {
    const pageReceipts = normalReceipts.slice(i, i + 6);
    const pageStartRow = currentRow;

    // 2x3 그리드로 배치
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 2; col++) {
        const idx = row * 2 + col;
        if (idx >= pageReceipts.length) break;

        const receipt = pageReceipts[idx];
        const startCol = col === 0 ? 1 : 5;
        const startRow = pageStartRow + row * ROWS_PER_RECEIPT;

        drawReceipt(worksheet, receipt, startRow, startCol, products, specialPrices);
      }
    }

    // 다음 페이지로 이동 (3행 * 13행/영수증 = 39행)
    currentRow = pageStartRow + 3 * ROWS_PER_RECEIPT;

    // 페이지 나누기 삽입 (43행 기준)
    if (i + 6 < normalReceipts.length) {
      worksheet.getRow(currentRow - 1).addPageBreak();
      
      // 모든 빈 행에도 높이 설정
      for (let r = pageStartRow; r < currentRow; r++) {
        if (!worksheet.getRow(r).height) {
          worksheet.getRow(r).height = ROW_HEIGHT;
        }
      }
    }
  }

  // 2. 품목 초과 영수증 - 별도 페이지에 배치
  oversizedReceipts.forEach((receipt, index) => {
    if (index === 0 && normalReceipts.length > 0) {
      // 첫 번째 확장 영수증 전에 페이지 나누기
      worksheet.getRow(currentRow - 1).addPageBreak();
    }

    const requiredRows = 4 + receipt.items.length + 1 + SPACING_ROWS;

    drawOversizedReceipt(worksheet, receipt, currentRow, 1, products, specialPrices);
    currentRow += requiredRows;

    // 다음 확장 영수증이 있으면 페이지 나누기
    if (index < oversizedReceipts.length - 1) {
      worksheet.getRow(currentRow - 1).addPageBreak();
    }
  });

  // 파일 저장 및 다운로드
  const buffer = await workbook.xlsx.writeBuffer();
  const now = new Date();
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const defaultFilename = `영수증_${localDate}.xlsx`;
  const finalFilename = filename || defaultFilename;

  if (Platform.OS === "web") {
    // 웹: Blob 다운로드
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = finalFilename;
    a.click();
    URL.revokeObjectURL(url);
  } else {
    // 모바일: FileSystem + Sharing
    const fileUri = `${FileSystem.documentDirectory}${finalFilename}`;
    const base64 = Buffer.from(buffer).toString("base64");
    await FileSystem.writeAsStringAsync(fileUri, base64);
    await Sharing.shareAsync(fileUri);
  }
}

/**
 * 개별 영수증 그리기 (품목 6개 이하)
 */
function drawReceipt(
  worksheet: ExcelJS.Worksheet,
  receipt: ReceiptGroup,
  startRow: number,
  startCol: number,
  products: Product[],
  specialPrices: Array<{ customerName: string; productName: string; customPrice: number }>
): void {
  let currentRowOffset = 0;

  // Row 1: 영수증 타이틀
  const titleRow = startRow + currentRowOffset;
  worksheet.getRow(titleRow).height = ROW_HEIGHT;
  const titleCell = worksheet.getCell(titleRow, startCol);
  titleCell.value = "영수증";
  titleCell.font = { bold: true, size: 12 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  worksheet.mergeCells(titleRow, startCol, titleRow, startCol + 2);
  applyBorder(titleCell);
  currentRowOffset++;

  // Row 2: 공급자 정보
  const supplierRow = startRow + currentRowOffset;
  worksheet.getRow(supplierRow).height = ROW_HEIGHT;
  const supplierCell = worksheet.getCell(supplierRow, startCol);
  supplierCell.value = "동방모사";
  supplierCell.font = { bold: true };
  supplierCell.alignment = { horizontal: "right", vertical: "middle" };
  worksheet.mergeCells(supplierRow, startCol, supplierRow, startCol + 2);
  applyBorder(supplierCell);
  currentRowOffset++;

  // Row 3: 상호
  const customerRow = startRow + currentRowOffset;
  worksheet.getRow(customerRow).height = ROW_HEIGHT;
  
  const customerLabelCell = worksheet.getCell(customerRow, startCol);
  customerLabelCell.value = "상호";
  customerLabelCell.font = { bold: true };
  customerLabelCell.alignment = { horizontal: "center", vertical: "middle" };
  applyBorder(customerLabelCell);

  const customerValueCell = worksheet.getCell(customerRow, startCol + 1);
  customerValueCell.value = receipt.customerName;
  customerValueCell.alignment = { horizontal: "center", vertical: "middle" };
  worksheet.mergeCells(customerRow, startCol + 1, customerRow, startCol + 2);
  applyBorder(customerValueCell);
  currentRowOffset++;

  // Row 4: 전표날짜
  const dateRow = startRow + currentRowOffset;
  worksheet.getRow(dateRow).height = ROW_HEIGHT;
  
  const dateLabelCell = worksheet.getCell(dateRow, startCol);
  dateLabelCell.value = "전표날짜";
  dateLabelCell.font = { bold: true };
  dateLabelCell.alignment = { horizontal: "center", vertical: "middle" };
  applyBorder(dateLabelCell);

  const dateValueCell = worksheet.getCell(dateRow, startCol + 1);
  const formattedDate = formatDate(receipt.date);
  dateValueCell.value = formattedDate;
  dateValueCell.alignment = { horizontal: "center", vertical: "middle" };
  worksheet.mergeCells(dateRow, startCol + 1, dateRow, startCol + 2);
  applyBorder(dateValueCell);
  currentRowOffset++;

  // Row 5: 품목 헤더
  const headerRow = startRow + currentRowOffset;
  worksheet.getRow(headerRow).height = ROW_HEIGHT;

  const itemNameHeader = worksheet.getCell(headerRow, startCol);
  itemNameHeader.value = "품목";
  itemNameHeader.font = { bold: true };
  itemNameHeader.alignment = { horizontal: "center", vertical: "middle" };
  applyBorder(itemNameHeader);

  const quantityHeader = worksheet.getCell(headerRow, startCol + 1);
  quantityHeader.value = "수량";
  quantityHeader.font = { bold: true };
  quantityHeader.alignment = { horizontal: "center", vertical: "middle" };
  applyBorder(quantityHeader);

  const priceHeader = worksheet.getCell(headerRow, startCol + 2);
  priceHeader.value = "공급대가";
  priceHeader.font = { bold: true };
  priceHeader.alignment = { horizontal: "center", vertical: "middle" };
  applyBorder(priceHeader);
  currentRowOffset++;

  // Row 6-11: 품목 데이터 (반드시 6행 유지)
  let totalQuantity = 0;
  let totalPrice = 0;

  for (let i = 0; i < 6; i++) {
    const itemRow = startRow + currentRowOffset + i;
    worksheet.getRow(itemRow).height = ROW_HEIGHT;
    
    const item = receipt.items[i];

    if (item) {
      const itemNameCell = worksheet.getCell(itemRow, startCol);
      itemNameCell.value = item.productName;
      itemNameCell.alignment = { horizontal: "center", vertical: "middle" };
      applyBorder(itemNameCell);

      const quantityCell = worksheet.getCell(itemRow, startCol + 1);
      quantityCell.value = item.quantity;
      quantityCell.alignment = { horizontal: "center", vertical: "middle" };
      applyBorder(quantityCell);
      totalQuantity += item.quantity;

      // 단가 매칭: 특가 우선, 없으면 기본 단가
      console.log(`[Price Match] 검색 시작 - 거래처: "${receipt.customerName}", 제품: "${item.productName}"`);
      console.log(`[Price Match] 특가 목록 전체 (${specialPrices.length}건):`, specialPrices.map(sp => `${sp.customerName}|${sp.productName}`));
      
      const specialPrice = specialPrices.find(
        sp => {
          const customerMatch = sp.customerName === receipt.customerName;
          const productMatch = sp.productName === item.productName;
          console.log(`  비교: "${sp.customerName}" === "${receipt.customerName}" ? ${customerMatch}, "${sp.productName}" === "${item.productName}" ? ${productMatch}`);
          return customerMatch && productMatch;
        }
      );
      const product = products.find(p => p.name === item.productName);
      const unitPrice = specialPrice?.customPrice ?? product?.unitPrice;
      
      console.log(`[Price Match] 특가 찾기 결과:`, specialPrice);
      console.log(`[Price Match] 기본 단가:`, product?.unitPrice);
      console.log(`[Price Match] 최종 단가:`, unitPrice);
      
      const priceCell = worksheet.getCell(itemRow, startCol + 2);
      if (unitPrice !== undefined && unitPrice > 0) {
        const itemTotal = unitPrice * item.quantity;
        priceCell.value = itemTotal;
        totalPrice += itemTotal;
      } else {
        priceCell.value = "";
      }
      priceCell.alignment = { horizontal: "center", vertical: "middle" };
      applyBorder(priceCell);
    } else {
      // 빈 행 (높이 유지)
      for (let col = 0; col < 3; col++) {
        const cell = worksheet.getCell(itemRow, startCol + col);
        cell.value = "";
        applyBorder(cell);
      }
    }
  }
  currentRowOffset += 6;

  // Row 12: Footer
  const footerRow = startRow + currentRowOffset;
  worksheet.getRow(footerRow).height = ROW_HEIGHT;

  const totalLabelCell = worksheet.getCell(footerRow, startCol);
  totalLabelCell.value = "공급가 총액";
  totalLabelCell.font = { bold: true };
  totalLabelCell.alignment = { horizontal: "center", vertical: "middle" };
  applyBorder(totalLabelCell);

  // B14 셀: 빈칸 처리 (수량 합산 제거)
  const totalQuantityCell = worksheet.getCell(footerRow, startCol + 1);
  totalQuantityCell.value = "";
  totalQuantityCell.alignment = { horizontal: "center", vertical: "middle" };
  applyBorder(totalQuantityCell);

  // C14 셀: 총 공급대가 합계
  const totalPriceCell = worksheet.getCell(footerRow, startCol + 2);
  if (totalPrice > 0) {
    totalPriceCell.value = totalPrice;
  } else {
    totalPriceCell.value = "";
  }
  totalPriceCell.alignment = { horizontal: "center", vertical: "middle" };
  applyBorder(totalPriceCell);
  currentRowOffset++;

  // Row 13-14: 간격 (빈 행)
  for (let i = 0; i < 2; i++) {
    const spacingRow = startRow + currentRowOffset + i;
    worksheet.getRow(spacingRow).height = ROW_HEIGHT;
  }
}

/**
 * 품목 6개 초과 영수증 그리기
 */
function drawOversizedReceipt(
  worksheet: ExcelJS.Worksheet,
  receipt: ReceiptGroup,
  startRow: number,
  startCol: number,
  products: Product[],
  specialPrices: Array<{ customerName: string; productName: string; customPrice: number }>
): void {
  let currentRowOffset = 0;

  // Row 1: 영수증 타이틀
  const titleRow = startRow + currentRowOffset;
  worksheet.getRow(titleRow).height = ROW_HEIGHT;
  const titleCell = worksheet.getCell(titleRow, startCol);
  titleCell.value = "영수증";
  titleCell.font = { bold: true, size: 12 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  worksheet.mergeCells(titleRow, startCol, titleRow, startCol + 2);
  applyBorder(titleCell);
  currentRowOffset++;

  // Row 2: 공급자 정보
  const supplierRow = startRow + currentRowOffset;
  worksheet.getRow(supplierRow).height = ROW_HEIGHT;
  const supplierCell = worksheet.getCell(supplierRow, startCol);
  supplierCell.value = "동방모사";
  supplierCell.font = { bold: true };
  supplierCell.alignment = { horizontal: "right", vertical: "middle" };
  worksheet.mergeCells(supplierRow, startCol, supplierRow, startCol + 2);
  applyBorder(supplierCell);
  currentRowOffset++;

  // Row 3: 상호
  const customerRow = startRow + currentRowOffset;
  worksheet.getRow(customerRow).height = ROW_HEIGHT;
  
  const customerLabelCell = worksheet.getCell(customerRow, startCol);
  customerLabelCell.value = "상호";
  customerLabelCell.font = { bold: true };
  customerLabelCell.alignment = { horizontal: "center", vertical: "middle" };
  applyBorder(customerLabelCell);

  const customerValueCell = worksheet.getCell(customerRow, startCol + 1);
  customerValueCell.value = receipt.customerName;
  customerValueCell.alignment = { horizontal: "center", vertical: "middle" };
  worksheet.mergeCells(customerRow, startCol + 1, customerRow, startCol + 2);
  applyBorder(customerValueCell);
  currentRowOffset++;

  // Row 4: 전표날짜
  const dateRow = startRow + currentRowOffset;
  worksheet.getRow(dateRow).height = ROW_HEIGHT;
  
  const dateLabelCell = worksheet.getCell(dateRow, startCol);
  dateLabelCell.value = "전표날짜";
  dateLabelCell.font = { bold: true };
  dateLabelCell.alignment = { horizontal: "center", vertical: "middle" };
  applyBorder(dateLabelCell);

  const dateValueCell = worksheet.getCell(dateRow, startCol + 1);
  const formattedDate = formatDate(receipt.date);
  dateValueCell.value = formattedDate;
  dateValueCell.alignment = { horizontal: "center", vertical: "middle" };
  worksheet.mergeCells(dateRow, startCol + 1, dateRow, startCol + 2);
  applyBorder(dateValueCell);
  currentRowOffset++;

  // Row 5: 품목 헤더
  const headerRow = startRow + currentRowOffset;
  worksheet.getRow(headerRow).height = ROW_HEIGHT;

  const itemNameHeader = worksheet.getCell(headerRow, startCol);
  itemNameHeader.value = "품목";
  itemNameHeader.font = { bold: true };
  itemNameHeader.alignment = { horizontal: "center", vertical: "middle" };
  applyBorder(itemNameHeader);

  const quantityHeader = worksheet.getCell(headerRow, startCol + 1);
  quantityHeader.value = "수량";
  quantityHeader.font = { bold: true };
  quantityHeader.alignment = { horizontal: "center", vertical: "middle" };
  applyBorder(quantityHeader);

  const priceHeader = worksheet.getCell(headerRow, startCol + 2);
  priceHeader.value = "공급대가";
  priceHeader.font = { bold: true };
  priceHeader.alignment = { horizontal: "center", vertical: "middle" };
  applyBorder(priceHeader);
  currentRowOffset++;

  // 품목 데이터 (모든 품목 표시)
  let totalQuantity = 0;
  let totalPrice = 0;

  receipt.items.forEach((item, i) => {
    const itemRow = startRow + currentRowOffset + i;
    worksheet.getRow(itemRow).height = ROW_HEIGHT;

    const itemNameCell = worksheet.getCell(itemRow, startCol);
    itemNameCell.value = item.productName;
    itemNameCell.alignment = { horizontal: "center", vertical: "middle" };
    applyBorder(itemNameCell);

    const quantityCell = worksheet.getCell(itemRow, startCol + 1);
    quantityCell.value = item.quantity;
    quantityCell.alignment = { horizontal: "center", vertical: "middle" };
    applyBorder(quantityCell);
    totalQuantity += item.quantity;

    // 단가 매칭: 특가 우선, 없으면 기본 단가
    console.log(`[Oversized Price Match] 검색 시작 - 거래처: "${receipt.customerName}", 제품: "${item.productName}"`);
    
    const specialPrice = specialPrices.find(
      sp => {
        const customerMatch = sp.customerName === receipt.customerName;
        const productMatch = sp.productName === item.productName;
        console.log(`  [오버사이즈] 비교: "${sp.customerName}" === "${receipt.customerName}" ? ${customerMatch}, "${sp.productName}" === "${item.productName}" ? ${productMatch}`);
        return customerMatch && productMatch;
      }
    );
    const product = products.find(p => p.name === item.productName);
    const unitPrice = specialPrice?.customPrice ?? product?.unitPrice;
    
    console.log(`[Oversized Price Match] 특가 찾기 결과:`, specialPrice);
    console.log(`[Oversized Price Match] 최종 단가:`, unitPrice);
    
    const priceCell = worksheet.getCell(itemRow, startCol + 2);
    if (unitPrice !== undefined && unitPrice > 0) {
      const itemTotal = unitPrice * item.quantity;
      priceCell.value = itemTotal;
      totalPrice += itemTotal;
    } else {
      priceCell.value = "";
    }
    priceCell.alignment = { horizontal: "center", vertical: "middle" };
    applyBorder(priceCell);
  });
  currentRowOffset += receipt.items.length;

  // Footer
  const footerRow = startRow + currentRowOffset;
  worksheet.getRow(footerRow).height = ROW_HEIGHT;

  const totalLabelCell = worksheet.getCell(footerRow, startCol);
  totalLabelCell.value = "공급가 총액";
  totalLabelCell.font = { bold: true };
  totalLabelCell.alignment = { horizontal: "center", vertical: "middle" };
  applyBorder(totalLabelCell);

  // B14 셀: 빈칸 처리 (수량 합산 제거)
  const totalQuantityCell = worksheet.getCell(footerRow, startCol + 1);
  totalQuantityCell.value = "";
  totalQuantityCell.alignment = { horizontal: "center", vertical: "middle" };
  applyBorder(totalQuantityCell);

  // C14 셀: 총 공급대가 합계
  const totalPriceCell = worksheet.getCell(footerRow, startCol + 2);
  if (totalPrice > 0) {
    totalPriceCell.value = totalPrice;
  } else {
    totalPriceCell.value = "";
  }
  totalPriceCell.alignment = { horizontal: "center", vertical: "middle" };
  applyBorder(totalPriceCell);
  currentRowOffset++;

  // 간격 (빈 행)
  for (let i = 0; i < SPACING_ROWS; i++) {
    const spacingRow = startRow + currentRowOffset + i;
    worksheet.getRow(spacingRow).height = ROW_HEIGHT;
  }
}

/**
 * 셀 테두리 적용
 */
function applyBorder(cell: ExcelJS.Cell): void {
  cell.border = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
}

/**
 * 날짜 포맷팅 (YYYY-MM-DD(요일) 형식)
 */
function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const dayOfWeek = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
    return `${year}-${month}-${day}(${dayOfWeek})`;
  } catch (error) {
    return dateString;
  }
}
