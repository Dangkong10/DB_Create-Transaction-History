/**
 * 엑셀 영수증 출력을 위한 유틸리티 함수
 */

export interface Transaction {
  id: string;
  customerName: string;
  productName: string;
  quantity: number;
  date: string; // YYYY-MM-DD
  createdAt: string; // ISO string
}

export interface AggregatedTransaction {
  date: string; // YYYY-MM-DD
  customerName: string;
  productName: string;
  totalQuantity: number;
}

export interface ReceiptGroup {
  date: string;
  customerName: string;
  items: {
    productName: string;
    quantity: number;
  }[];
}

/**
 * 거래 내역을 날짜/거래처/품목별로 그룹화하고 수량 합산
 */
export function aggregateTransactions(
  transactions: Transaction[]
): AggregatedTransaction[] {
  const grouped = new Map<string, AggregatedTransaction>();

  for (const transaction of transactions) {
    const date = transaction.date;
    const key = `${date}|${transaction.customerName}|${transaction.productName}`;

    if (grouped.has(key)) {
      const existing = grouped.get(key)!;
      existing.totalQuantity += transaction.quantity;
    } else {
      grouped.set(key, {
        date,
        customerName: transaction.customerName,
        productName: transaction.productName,
        totalQuantity: transaction.quantity,
      });
    }
  }

  return Array.from(grouped.values()).sort((a, b) => {
    // 날짜 → 거래처 → 품목 순으로 정렬
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.customerName !== b.customerName)
      return a.customerName.localeCompare(b.customerName);
    return a.productName.localeCompare(b.productName);
  });
}

/**
 * 합산된 거래 내역을 영수증 그룹으로 변환
 * (날짜 + 거래처별로 품목을 묶음)
 */
export function groupByReceipt(
  aggregated: AggregatedTransaction[]
): ReceiptGroup[] {
  const grouped = new Map<string, ReceiptGroup>();

  for (const item of aggregated) {
    const key = `${item.date}|${item.customerName}`;

    if (grouped.has(key)) {
      grouped.get(key)!.items.push({
        productName: item.productName,
        quantity: item.totalQuantity,
      });
    } else {
      grouped.set(key, {
        date: item.date,
        customerName: item.customerName,
        items: [
          {
            productName: item.productName,
            quantity: item.totalQuantity,
          },
        ],
      });
    }
  }

  return Array.from(grouped.values()).sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.customerName.localeCompare(b.customerName);
  });
}

/**
 * 한글 초성 추출
 */
const CHO_HANGUL = [
  "ㄱ",
  "ㄲ",
  "ㄴ",
  "ㄷ",
  "ㄸ",
  "ㄹ",
  "ㅁ",
  "ㅂ",
  "ㅃ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅉ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
];

function getChosung(char: string): string {
  const code = char.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return char; // 한글이 아니면 그대로 반환
  return CHO_HANGUL[Math.floor(code / 588)];
}

/**
 * 거래처 이름의 초성 추출
 */
export function extractChosung(name: string): string {
  return name
    .split("")
    .map((char) => getChosung(char))
    .join("");
}

/**
 * 초성 검색 필터
 */
export function filterByChosung(
  receipts: ReceiptGroup[],
  chosungQuery: string
): ReceiptGroup[] {
  if (!chosungQuery.trim()) return receipts;

  const query = chosungQuery.trim().toUpperCase();

  return receipts.filter((receipt) => {
    const chosung = extractChosung(receipt.customerName);
    return chosung.includes(query) || receipt.customerName.includes(query);
  });
}

/**
 * 날짜 필터
 */
export function filterByDate(
  receipts: ReceiptGroup[],
  targetDate: string
): ReceiptGroup[] {
  if (!targetDate) return receipts;
  return receipts.filter((receipt) => receipt.date.startsWith(targetDate));
}
