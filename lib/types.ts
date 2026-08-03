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
  /**
   * 은행 입금 문자에 찍히는 입금자명 목록 (예: ["박태상"]).
   *
   * aliases 와 **역할이 다르다** — aliases 는 거래처 검색(초성 포함)에 쓰이고,
   * payerNames 는 입금 자동 매칭에만 쓰인다. 여기에 넣은 사람 이름은
   * 거래처 검색창에 노출되지 않는다.
   *
   * optional 인 이유: data.ts 의 기존 시드 거래처들이 이 필드를 갖고 있지 않다.
   * 읽을 때는 `?? []` 로 처리한다.
   */
  payerNames?: string[];
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
  /** 단가를 사용자가 수동 수정했는지 — true면 거래처 변경 시 특가 자동 재계산에서 제외 */
  priceEdited?: boolean;
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
  /** 특가 (원 단위) — 연동 특가면 저장 시점 계산값(스냅샷) */
  customPrice: number;
  /**
   * 기본가 연동 조정액 (예: -1000 = 기본가보다 1,000원 낮게 유지).
   * 값이 있으면 제품 기본 단가가 바뀔 때 특가도 자동으로 따라간다.
   * null/undefined = 고정 특가.
   */
  priceOffset?: number | null;
}
