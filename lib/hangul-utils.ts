/**
 * 한글 초성 검색 유틸리티
 * 
 * 한글 자모 분리 및 초성 검색 기능을 제공합니다.
 */

// 한글 유니코드 범위
const HANGUL_START = 0xac00; // '가'
const HANGUL_END = 0xd7a3; // '힣'

// 초성, 중성, 종성 개수
const CHOSUNG_COUNT = 19;
const JUNGSUNG_COUNT = 21;
const JONGSUNG_COUNT = 28;

// 초성 리스트
const CHOSUNG_LIST = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ',
  'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ',
  'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
];

/**
 * 한글 문자인지 확인
 */
export function isHangul(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= HANGUL_START && code <= HANGUL_END;
}

/**
 * 초성 문자인지 확인
 */
export function isChosung(char: string): boolean {
  return CHOSUNG_LIST.includes(char);
}

/**
 * 한글 문자에서 초성 추출
 */
export function getChosung(char: string): string {
  if (!isHangul(char)) {
    return char;
  }
  
  const code = char.charCodeAt(0) - HANGUL_START;
  const chosungIndex = Math.floor(code / (JUNGSUNG_COUNT * JONGSUNG_COUNT));
  return CHOSUNG_LIST[chosungIndex];
}

/**
 * 문자열에서 초성만 추출
 */
export function extractChosung(text: string): string {
  return text.split('').map(char => {
    if (isHangul(char)) {
      return getChosung(char);
    }
    return char;
  }).join('');
}

/**
 * 초성 검색 매칭
 * 
 * @param target 검색 대상 문자열 (예: "해비치")
 * @param query 검색어 (예: "ㅎㅂ" 또는 "해비")
 * @returns 매칭 여부
 */
export function matchChosung(target: string, query: string): boolean {
  if (!query || !target) {
    return false;
  }

  // 쿼리를 소문자로 변환 (영문 검색 지원)
  const lowerQuery = query.toLowerCase();
  const lowerTarget = target.toLowerCase();

  // 완전 일치 또는 부분 일치 검색
  if (lowerTarget.includes(lowerQuery)) {
    return true;
  }

  // 초성 검색
  let targetIndex = 0;
  let queryIndex = 0;

  while (targetIndex < target.length && queryIndex < query.length) {
    const targetChar = target[targetIndex];
    const queryChar = query[queryIndex];

    // 쿼리가 초성인 경우
    if (isChosung(queryChar)) {
      if (isHangul(targetChar)) {
        const targetChosung = getChosung(targetChar);
        if (targetChosung === queryChar) {
          queryIndex++;
        }
      }
      targetIndex++;
    } 
    // 쿼리가 일반 문자인 경우
    else {
      if (targetChar === queryChar) {
        queryIndex++;
      }
      targetIndex++;
    }
  }

  return queryIndex === query.length;
}

/**
 * 배열에서 초성 검색
 * 
 * @param items 검색 대상 배열
 * @param query 검색어
 * @returns 매칭된 항목들
 */
export function searchByChosung<T>(
  items: T[],
  query: string,
  getSearchText: (item: T) => string
): T[] {
  if (!query.trim()) {
    return items;
  }

  return items.filter(item => {
    const searchText = getSearchText(item);
    return matchChosung(searchText, query);
  });
}
