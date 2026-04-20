/**
 * 거래명세서 입력 시스템 타입 정의
 */

/**
 * 거래처 정보
 */
export interface Customer {
  id: string;
  name: string;
  /** 별칭 목록 (검색 시 사용) */
  aliases: string[];
}

/**
 * 제품 카테고리
 */
export interface ProductCategory {
  id: string;
  name: string;
  order: number;
}

/**
 * 품목 정보
 */
export interface Product {
  id: string;
  name: string;
  /** 카테고리 ID (summer, winter, accessories) */
  category: string;
  /** 별칭 목록 (검색 시 사용) */
  aliases: string[];
  /** 단가 (공급가, 원 단위) */
  unitPrice?: number;
}

/**
 * 거래 품목 입력 항목
 */
export interface TransactionItem {
  id: string;
  productName: string;
  quantity: number;
  unitPrice?: number;
}

/**
 * 거래 기록
 */
export interface TransactionRecord {
  timestamp: string;
  customerName: string;
  items: TransactionItem[];
  isCancellation: boolean;
}

/**
 * 구글 시트 행 데이터
 */
export interface SheetRow {
  timestamp: string;
  customerName: string;
  productName: string;
  quantity: number;
  cancellation: string;
}

/**
 * 거래처별 특가 정보
 */
export interface SpecialPrice {
  id: string;
  /** 거래처명 */
  customerName: string;
  /** 제품명 */
  productName: string;
  /** 특가 (원 단위) */
  customPrice: number;
}
