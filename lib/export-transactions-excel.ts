/**
 * 기간 집계 엑셀 내보내기
 *
 * ERP 호환 표준 양식 (8컬럼):
 * 전표번호 · 거래일자 · 구분 · 거래처명 · 품목명 · 수량 · 단가 · 공급가액
 */

import { Platform } from 'react-native';
import type { Transaction } from './supabase';

export interface ExportOptions {
  transactions: Transaction[];
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  selectedCustomers: Set<string>; // 비어있거나 전체 포함 시 "all"로 간주
}

export interface ExportResult {
  rowCount: number;
  fileName: string;
}

/**
 * 파일명 생성: transactions_YYYYMMDD[_YYYYMMDD][_suffix].xlsx
 */
export function generateFileName(
  startDate: string,
  endDate: string,
  selectedCustomers: Set<string>,
  allCustomerCount: number,
): string {
  const start = startDate.replace(/-/g, '');
  const end = endDate.replace(/-/g, '');

  // 단일 날짜
  if (start === end) {
    return `transactions_${start}.xlsx`;
  }

  // 전체 선택 또는 아무것도 선택 안 됨 (= 전체로 간주)
  const isAll = selectedCustomers.size === 0 || selectedCustomers.size === allCustomerCount;
  if (isAll) {
    return `transactions_${start}_${end}_all.xlsx`;
  }

  // 부분 선택: selected{N}
  return `transactions_${start}_${end}_selected${selectedCustomers.size}.xlsx`;
}

/**
 * 엑셀 파일 생성 및 다운로드
 */
export async function exportTransactionsToExcel(
  options: ExportOptions,
): Promise<ExportResult> {
  const { transactions, startDate, endDate, selectedCustomers } = options;

  // 1) 기간 + 거래처 필터
  const allCustomers = new Set(transactions.map((t) => t.customerName));
  const customerFilter =
    selectedCustomers.size === 0 || selectedCustomers.size === allCustomers.size
      ? null // 전체
      : selectedCustomers;

  let filtered = transactions.filter((t) => {
    const d = (t.date || '').slice(0, 10);
    if (d < startDate || d > endDate) return false;
    if (customerFilter && !customerFilter.has(t.customerName)) return false;
    return true;
  });

  // 2) 정렬: 날짜 오름차순, 같은 날짜는 시간 오름차순
  filtered.sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  });

  if (filtered.length === 0) {
    throw new Error('선택한 기간에 해당하는 거래 내역이 없습니다.');
  }

  // 3) 전표번호 자동 생성 (IO-YYYYMMDD-NNN)
  const docNoCounter: Record<string, number> = {};
  const rows = filtered.map((t) => {
    const dateStr = t.date.replace(/-/g, '');
    docNoCounter[dateStr] = (docNoCounter[dateStr] || 0) + 1;
    const docNo = `IO-${dateStr}-${String(docNoCounter[dateStr]).padStart(3, '0')}`;

    const isReturn = t.quantity < 0;
    const absQty = Math.abs(t.quantity);
    const unitPrice = t.unitPrice || 0;
    const supplyAmount = absQty * unitPrice;

    return {
      '전표번호': docNo,
      '거래일자': t.date,
      '구분': isReturn ? 'RETURN' : 'OUT',
      '거래처명': t.customerName,
      '품목명': t.productName,
      '수량': absQty,
      '단가': unitPrice,
      '공급가액': supplyAmount,
    };
  });

  // 4) ExcelJS로 워크북 생성
  const ExcelJSModule: any = await import('exceljs');
  const ExcelJS = ExcelJSModule.default ?? ExcelJSModule;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('transactions');

  // 컬럼 정의 + 너비
  worksheet.columns = [
    { header: '전표번호', key: '전표번호', width: 20 },
    { header: '거래일자', key: '거래일자', width: 12 },
    { header: '구분', key: '구분', width: 8 },
    { header: '거래처명', key: '거래처명', width: 15 },
    { header: '품목명', key: '품목명', width: 20 },
    { header: '수량', key: '수량', width: 8 },
    { header: '단가', key: '단가', width: 10 },
    { header: '공급가액', key: '공급가액', width: 12 },
  ];

  // 데이터 삽입
  rows.forEach((row) => worksheet.addRow(row));

  // 헤더 스타일
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1B365D' },
  };
  headerRow.height = 22;

  // 숫자 컬럼 포맷 (천단위 콤마): 수량, 단가, 공급가액
  ['F', 'G', 'H'].forEach((col) => {
    worksheet.getColumn(col).numFmt = '#,##0';
    worksheet.getColumn(col).alignment = { horizontal: 'right' };
  });

  // 5) 버퍼 생성
  const buffer = await workbook.xlsx.writeBuffer();

  // 6) 파일명
  const fileName = generateFileName(startDate, endDate, selectedCustomers, allCustomers.size);

  // 7) 다운로드 (플랫폼별)
  if (Platform.OS === 'web') {
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  } else {
    const FileSystem: any = await import('expo-file-system/legacy');
    const Sharing: any = await import('expo-sharing');
    const uint8 = new Uint8Array(buffer);
    const base64 = btoa(String.fromCharCode(...uint8));
    const fileUri = `${FileSystem.documentDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: 'base64' });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: '거래 내역 엑셀 저장',
      });
    }
  }

  return { rowCount: rows.length, fileName };
}
