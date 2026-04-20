/**
 * 거래처·제품 엑셀 내보내기/가져오기 유틸리티
 *
 * exceljs 사용 (이미 설치됨)
 */

import ExcelJS from 'exceljs';
import type { Customer, Product } from './types';

// ─── 공통 헬퍼 ───

function todayStr(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function downloadBuffer(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── 내보내기 (Export) ───

export async function exportCustomers(customers: Customer[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('거래처');

  ws.columns = [
    { header: '이름(필수)', key: 'name', width: 20 },
    { header: '별칭(쉼표 구분)', key: 'aliases', width: 30 },
  ];

  // 헤더 스타일
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
  });

  customers.forEach((c) => {
    ws.addRow({ name: c.name, aliases: (c.aliases || []).join(', ') });
  });

  const buffer = await wb.xlsx.writeBuffer();
  downloadBuffer(buffer as ArrayBuffer, `거래처_목록_${todayStr()}.xlsx`);
}

export async function exportProducts(products: Product[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('제품');

  ws.columns = [
    { header: '이름(필수)', key: 'name', width: 20 },
    { header: '단가(숫자, 필수)', key: 'unitPrice', width: 15 },
    { header: '카테고리(선택)', key: 'category', width: 15 },
    { header: '별칭(쉼표 구분)', key: 'aliases', width: 30 },
  ];

  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
  });

  products.forEach((p) => {
    ws.addRow({
      name: p.name,
      unitPrice: p.unitPrice || 0,
      category: p.category || '',
      aliases: (p.aliases || []).join(', '),
    });
  });

  const buffer = await wb.xlsx.writeBuffer();
  downloadBuffer(buffer as ArrayBuffer, `제품_목록_${todayStr()}.xlsx`);
}

// ─── 빈 양식 다운로드 ───

export async function downloadCustomerTemplate(): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('거래처');

  ws.columns = [
    { header: '이름(필수)', key: 'name', width: 20 },
    { header: '별칭(쉼표 구분)', key: 'aliases', width: 30 },
  ];

  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
  });

  // 샘플 행
  const sampleRow = ws.addRow({ name: '(샘플) 한빛상회', aliases: '7조, 켈리' });
  sampleRow.eachCell((cell) => {
    cell.font = { color: { argb: 'FF999999' }, italic: true };
  });

  const buffer = await wb.xlsx.writeBuffer();
  downloadBuffer(buffer as ArrayBuffer, '거래처_양식.xlsx');
}

export async function downloadProductTemplate(): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('제품');

  ws.columns = [
    { header: '이름(필수)', key: 'name', width: 20 },
    { header: '단가(숫자, 필수)', key: 'unitPrice', width: 15 },
    { header: '카테고리(선택)', key: 'category', width: 15 },
    { header: '별칭(쉼표 구분)', key: 'aliases', width: 30 },
  ];

  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
  });

  const sampleRow = ws.addRow({ name: '(샘플) 사과', unitPrice: 3000, category: 'summer', aliases: '' });
  sampleRow.eachCell((cell) => {
    cell.font = { color: { argb: 'FF999999' }, italic: true };
  });

  const buffer = await wb.xlsx.writeBuffer();
  downloadBuffer(buffer as ArrayBuffer, '제품_양식.xlsx');
}

// ─── 가져오기 (Import) ───

export interface ImportCustomerRow {
  name: string;
  aliases: string[];
  status: 'new' | 'duplicate' | 'error';
  note: string;
}

export interface ImportProductRow {
  name: string;
  unitPrice: number;
  category: string;
  aliases: string[];
  status: 'new' | 'duplicate' | 'error';
  note: string;
}

export type DuplicateMode = 'skip' | 'overwrite' | 'addAll';

/** 파일 선택 다이얼로그를 열고 File 객체를 반환 */
export function pickExcelFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv';
    input.onchange = () => {
      const file = input.files?.[0] || null;
      if (file && file.size > 5 * 1024 * 1024) {
        resolve(null); // 5MB 초과
        return;
      }
      resolve(file);
    };
    input.click();
  });
}

/** 거래처 엑셀 파싱 + 유효성 검사 */
export async function parseCustomerExcel(
  file: File,
  existingCustomers: Customer[],
): Promise<ImportCustomerRow[]> {
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();

  if (file.name.endsWith('.csv')) {
    const text = new TextDecoder('utf-8').decode(buffer);
    const lines = text.split('\n');
    const ws = wb.addWorksheet('Sheet1');
    lines.forEach((line) => {
      const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      ws.addRow(cells);
    });
  } else {
    await wb.xlsx.load(buffer);
  }

  const ws = wb.worksheets[0];
  if (!ws) throw new Error('시트를 찾을 수 없습니다.');

  const existingNames = new Set(existingCustomers.map((c) => c.name.trim()));
  const rows: ImportCustomerRow[] = [];

  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return; // 헤더 건너뛰기

    const nameCell = row.getCell(1).value;
    const aliasCell = row.getCell(2).value;

    const name = String(nameCell || '').trim();
    const aliasStr = String(aliasCell || '').trim();
    const aliases = aliasStr
      ? aliasStr.split(',').map((a) => a.trim()).filter((a) => a)
      : [];

    if (!name) {
      rows.push({ name: '', aliases, status: 'error', note: '이름 없음' });
    } else if (name.length > 100) {
      rows.push({ name, aliases, status: 'error', note: '이름 길이 초과' });
    } else if (existingNames.has(name)) {
      rows.push({ name, aliases, status: 'duplicate', note: '이미 존재' });
    } else {
      rows.push({ name, aliases, status: 'new', note: '' });
    }
  });

  return rows;
}

/** 제품 엑셀 파싱 + 유효성 검사 */
export async function parseProductExcel(
  file: File,
  existingProducts: Product[],
): Promise<ImportProductRow[]> {
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();

  if (file.name.endsWith('.csv')) {
    const text = new TextDecoder('utf-8').decode(buffer);
    const lines = text.split('\n');
    const ws = wb.addWorksheet('Sheet1');
    lines.forEach((line) => {
      const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      ws.addRow(cells);
    });
  } else {
    await wb.xlsx.load(buffer);
  }

  const ws = wb.worksheets[0];
  if (!ws) throw new Error('시트를 찾을 수 없습니다.');

  const existingNames = new Set(existingProducts.map((p) => p.name.trim()));
  const rows: ImportProductRow[] = [];

  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;

    const nameCell = row.getCell(1).value;
    const priceCell = row.getCell(2).value;
    const catCell = row.getCell(3).value;
    const aliasCell = row.getCell(4).value;

    const name = String(nameCell || '').trim();
    const priceNum = Number(priceCell);
    const category = String(catCell || 'summer').trim() || 'summer';
    const aliasStr = String(aliasCell || '').trim();
    const aliases = aliasStr
      ? aliasStr.split(',').map((a) => a.trim()).filter((a) => a)
      : [];

    if (!name) {
      rows.push({ name: '', unitPrice: 0, category, aliases, status: 'error', note: '이름 없음' });
    } else if (isNaN(priceNum) || priceNum < 0) {
      rows.push({ name, unitPrice: 0, category, aliases, status: 'error', note: '단가 형식 오류' });
    } else if (existingNames.has(name)) {
      rows.push({ name, unitPrice: Math.floor(priceNum), category, aliases, status: 'duplicate', note: '이미 존재' });
    } else {
      rows.push({ name, unitPrice: Math.floor(priceNum), category, aliases, status: 'new', note: '' });
    }
  });

  return rows;
}

/** 거래처 가져오기 실행 */
export function applyCustomerImport(
  rows: ImportCustomerRow[],
  existingCustomers: Customer[],
  mode: DuplicateMode,
): { customers: Customer[]; newCount: number; updateCount: number; skipCount: number } {
  const result = [...existingCustomers];
  let newCount = 0;
  let updateCount = 0;
  let skipCount = 0;

  for (const row of rows) {
    if (row.status === 'error') continue;

    if (row.status === 'new') {
      result.push({ id: `customer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: row.name, aliases: row.aliases });
      newCount++;
    } else if (row.status === 'duplicate') {
      if (mode === 'skip') {
        skipCount++;
      } else if (mode === 'overwrite') {
        const idx = result.findIndex((c) => c.name.trim() === row.name);
        if (idx >= 0) {
          result[idx] = { ...result[idx], aliases: row.aliases };
          updateCount++;
        }
      } else {
        // addAll — 중복 이름에 번호 붙이기
        let suffix = 2;
        while (result.some((c) => c.name === `${row.name}(${suffix})`)) suffix++;
        result.push({ id: `customer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: `${row.name}(${suffix})`, aliases: row.aliases });
        newCount++;
      }
    }
  }

  return { customers: result, newCount, updateCount, skipCount };
}

/** 제품 가져오기 실행 */
export function applyProductImport(
  rows: ImportProductRow[],
  existingProducts: Product[],
  mode: DuplicateMode,
): { products: Product[]; newCount: number; updateCount: number; skipCount: number } {
  const result = [...existingProducts];
  let newCount = 0;
  let updateCount = 0;
  let skipCount = 0;

  for (const row of rows) {
    if (row.status === 'error') continue;

    if (row.status === 'new') {
      result.push({
        id: `product-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: row.name,
        category: row.category,
        aliases: row.aliases,
        unitPrice: row.unitPrice,
      });
      newCount++;
    } else if (row.status === 'duplicate') {
      if (mode === 'skip') {
        skipCount++;
      } else if (mode === 'overwrite') {
        const idx = result.findIndex((p) => p.name.trim() === row.name);
        if (idx >= 0) {
          result[idx] = { ...result[idx], aliases: row.aliases, unitPrice: row.unitPrice, category: row.category };
          updateCount++;
        }
      } else {
        let suffix = 2;
        while (result.some((p) => p.name === `${row.name}(${suffix})`)) suffix++;
        result.push({
          id: `product-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: `${row.name}(${suffix})`,
          category: row.category,
          aliases: row.aliases,
          unitPrice: row.unitPrice,
        });
        newCount++;
      }
    }
  }

  return { products: result, newCount, updateCount, skipCount };
}
