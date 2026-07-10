/**
 * 한글 초성 검색 유틸리티
 * 
 * 사용 예:
 * matchChosung("홍길동", "ㅎㄱㄷ") // true
 * matchChosung("홍길동", "홍길") // true
 * matchChosung("홍길동", "ㄱㄷ") // false (중간부터 시작하면 false)
 */

// 한글 초성 리스트
const CHOSUNG_LIST = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"
];

/**
 * 한글 문자에서 초성 추출
 */
function getChosung(char: string): string {
  const code = char.charCodeAt(0) - 0xAC00;
  if (code < 0 || code > 11171) return char; // 한글이 아니면 그대로 반환
  const chosungIndex = Math.floor(code / 588);
  return CHOSUNG_LIST[chosungIndex];
}

/**
 * 문자열에서 초성만 추출
 */
export function extractChosung(text: string): string {
  return text.split("").map(char => {
    const code = char.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      // 한글인 경우 초성 추출
      return getChosung(char);
    }
    return char; // 한글이 아니면 그대로
  }).join("");
}

/**
 * 초성 검색 매칭
 *
 * 검색어를 글자 단위로 비교한다:
 * - 초성 낱자(ㄷ, ㅇ …)는 대상 글자의 초성과 비교
 * - 완성된 글자(도, 원 …)·영문·숫자는 글자 그대로 비교
 *
 * 이렇게 해야 "도원"처럼 완성 글자를 입력했을 때 초성만 같은
 * 다른 거래처(덕윤모사, 대영 = ㄷㅇ…)가 함께 뜨지 않는다.
 *
 * @param text 검색 대상 텍스트 (예: "홍길동")
 * @param query 검색어 (예: "ㅎㄱㄷ", "홍길", "홍ㄱ")
 * @returns 매칭 여부
 */
export function matchChosung(text: string, query: string): boolean {
  if (!query) return true; // 검색어가 없으면 모두 매칭

  const normalizedText = text.toLowerCase();
  const normalizedQuery = query.toLowerCase();

  // 1. 일반 문자열 포함 검색 (부분 일치)
  if (normalizedText.includes(normalizedQuery)) {
    return true;
  }

  // 2. 글자 단위 앞부분 매칭 (초성 낱자만 초성 비교, 완성 글자는 그대로 비교)
  if (query.length > text.length) return false;
  for (let i = 0; i < query.length; i++) {
    const q = query[i];
    const t = text[i];
    if (CHOSUNG_LIST.includes(q)) {
      if (getChosung(t) !== q) return false;
    } else if (t.toLowerCase() !== q.toLowerCase()) {
      return false;
    }
  }
  return true;
}

/**
 * 배열을 초성 검색으로 필터링
 * @param items 검색 대상 배열
 * @param query 검색어
 * @param getSearchText 각 아이템에서 검색할 텍스트를 추출하는 함수
 * @returns 필터링된 배열
 */
export function filterByChosung<T>(
  items: T[],
  query: string,
  getSearchText: (item: T) => string
): T[] {
  if (!query) return items;
  
  return items.filter(item => {
    const searchText = getSearchText(item);
    return matchChosung(searchText, query);
  });
}
