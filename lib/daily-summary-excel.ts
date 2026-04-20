/**
 * 당일 집계표 엑셀 생성 로직
 */

import ExcelJS from 'exceljs';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { Transaction } from './excel-utils';

/**
 * 당일 집계표 데이터 타입
 */
export interface DailySummaryRow {
  customerName: string;
  prevBalance: number;
  salesAmount: number;
  totalBalance: number;
}

/**
 * 거래 내역을 거래처별로 집계
 */
export function aggregateDailySummary(
  transactions: Transaction[],
  getUnitPrice: (productName: string) => number
): DailySummaryRow[] {
  const summaryMap = new Map<string, { salesAmount: number }>();

  // 거래처별 매출금액 집계
  transactions.forEach((tx) => {
    const existing = summaryMap.get(tx.customerName) || { salesAmount: 0 };
    const unitPrice = getUnitPrice(tx.productName);
    const amount = unitPrice * tx.quantity;
    existing.salesAmount += amount;
    summaryMap.set(tx.customerName, existing);
  });

  // 배열로 변환 (전잔고는 일단 0으로 설정)
  const rows: DailySummaryRow[] = [];
  summaryMap.forEach((data, customerName) => {
    rows.push({
      customerName,
      prevBalance: 0, // 전잔고는 추후 수기 입력 또는 DB 연동
      salesAmount: data.salesAmount,
      totalBalance: 0 + data.salesAmount, // 전잔고 + 매출금액
    });
  });

  // 상호명 가나다순 정렬
  rows.sort((a, b) => a.customerName.localeCompare(b.customerName, 'ko-KR'));

  return rows;
}

/**
 * 당일 집계표 엑셀 파일 생성
 */
export async function generateDailySummaryExcel(
  transactions: Transaction[],
  date: Date,
  getUnitPrice: (productName: string) => number
): Promise<ArrayBuffer | string> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('당일 집계표');

  // 집계 데이터 생성
  const summaryData = aggregateDailySummary(transactions, getUnitPrice);

  // 날짜 포맷 (예: 2026-02-21)
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  // === 1. 상단 날짜 병합 (C1:D1) ===
  worksheet.mergeCells('C1:D1');
  const dateCell = worksheet.getCell('C1');
  dateCell.value = dateStr;
  dateCell.alignment = { horizontal: 'right', vertical: 'middle' };
  dateCell.font = { size: 11 };
  worksheet.getRow(1).height = 20;

  // === 2. 헤더 행 (A2:D2) ===
  const headerRow = worksheet.getRow(2);
  headerRow.values = ['상호', '전잔고', '매출금액', '총잔액'];
  headerRow.height = 25;

  // 헤더 스타일: 회색 배경, 굵은 글씨, 중앙 정렬, 테두리
  ['A2', 'B2', 'C2', 'D2'].forEach((cellAddr) => {
    const cell = worksheet.getCell(cellAddr);
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9D9D9' }, // 회색
    };
    cell.font = { bold: true, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });

  // === 3. 데이터 행 삽입 ===
  summaryData.forEach((row, index) => {
    const rowNum = index + 3; // 3행부터 시작 (1: 날짜, 2: 헤더)
    const dataRow = worksheet.getRow(rowNum);

    dataRow.values = [
      row.customerName,
      row.prevBalance,
      row.salesAmount,
      { formula: `B${rowNum}+C${rowNum}` }, // 총잔액 = 전잔고 + 매출금액
    ];

    dataRow.height = 20;

    // 데이터 셀 스타일
    ['A', 'B', 'C', 'D'].forEach((col) => {
      const cell = worksheet.getCell(`${col}${rowNum}`);
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };

      // 상호는 좌측 정렬, 나머지는 우측 정렬
      if (col === 'A') {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        // 숫자 포맷: 콤마(,) 구분
        cell.numFmt = '#,##0';
      }
    });
  });

  // === 4. 열 너비 조정 ===
  worksheet.getColumn('A').width = 25; // 상호 (넓게)
  worksheet.getColumn('B').width = 15; // 전잔고
  worksheet.getColumn('C').width = 15; // 매출금액
  worksheet.getColumn('D').width = 15; // 총잔액

  // === 5. A4 인쇄 최적화 ===
  worksheet.pageSetup = {
    paperSize: 9, // A4
    orientation: 'portrait', // 세로
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0, // 높이는 자동
    margins: {
      left: 0.5,
      right: 0.5,
      top: 0.5,
      bottom: 0.5,
      header: 0.3,
      footer: 0.3,
    },
  };

  // === 6. 엑셀 파일 저장 ===
  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = `당일집계표_${dateStr}.xlsx`;

  if (Platform.OS === 'web') {
    // 웹: Blob으로 반환 (다운로드는 downloadDailySummaryExcel에서 처리)
    return buffer as any; // buffer를 그대로 반환
  } else {
    // 모바일: FileSystem에 저장
    const uint8Array = new Uint8Array(buffer);
    const base64 = btoa(String.fromCharCode(...uint8Array));
    const fileUri = `${FileSystem.documentDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(fileUri, base64, {
      encoding: 'base64',
    });

    return fileUri;
  }
}

/**
 * 당일 집계표 엑셀 다운로드
 */
export async function downloadDailySummaryExcel(
  transactions: Transaction[],
  date: Date,
  getUnitPrice: (productName: string) => number
): Promise<void> {
  try {
    const result = await generateDailySummaryExcel(transactions, date, getUnitPrice);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const fileName = `당일집계표_${dateStr}.xlsx`;

    if (Platform.OS === 'web') {
      // 웹: Blob으로 다운로드
      const buffer = result as ArrayBuffer;
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      window.URL.revokeObjectURL(url);
    } else {
      // 모바일: 공유 시트
      const fileUri = result as string;
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: '당일 집계표 저장',
        UTI: 'com.microsoft.excel.xlsx',
      });
    }
  } catch (error) {
    console.error('Failed to download daily summary excel:', error);
    throw error;
  }
}
