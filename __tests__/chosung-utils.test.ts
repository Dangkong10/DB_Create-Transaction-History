/**
 * 초성 검색 매칭 테스트 (chosung-utils — 내역 화면 거래처 검색에서 사용)
 *
 * 핵심 회귀: 완성 글자 검색어("도원")가 초성으로 변환되어
 * 초성만 같은 거래처(덕윤모사, 대영)까지 매칭되던 버그.
 */

import { describe, it, expect } from 'vitest';
import { matchChosung, filterByChosung } from '../lib/chosung-utils';

describe('matchChosung (chosung-utils)', () => {
  it('완성 글자 검색어는 해당 글자 거래처만 매칭해야 함 (초성 동일 거래처 제외)', () => {
    expect(matchChosung('도원', '도원')).toBe(true);
    expect(matchChosung('덕윤모사', '도원')).toBe(false); // ㄷㅇ 초성 같지만 글자 다름
    expect(matchChosung('대영', '도원')).toBe(false); // ㄷㅇ 초성 같지만 글자 다름
  });

  it('초성 낱자 검색은 그대로 동작해야 함', () => {
    expect(matchChosung('도원', 'ㄷㅇ')).toBe(true);
    expect(matchChosung('덕윤모사', 'ㄷㅇ')).toBe(true);
    expect(matchChosung('대영', 'ㄷㅇ')).toBe(true);
    expect(matchChosung('고려', 'ㄷㅇ')).toBe(false);
  });

  it('완성 글자 + 초성 혼합 검색을 지원해야 함', () => {
    expect(matchChosung('도원', '도ㅇ')).toBe(true);
    expect(matchChosung('덕윤모사', '도ㅇ')).toBe(false);
    expect(matchChosung('홍길동', '홍ㄱ')).toBe(true);
  });

  it('부분 문자열(중간 글자) 검색은 유지되어야 함', () => {
    expect(matchChosung('도원', '원')).toBe(true);
    expect(matchChosung('사람과뜨개', '뜨개')).toBe(true);
  });

  it('초성이 중간부터 시작하면 매칭하지 않아야 함 (앞부분 기준)', () => {
    expect(matchChosung('홍길동', 'ㄱㄷ')).toBe(false);
    expect(matchChosung('홍길동', 'ㅎㄱㄷ')).toBe(true);
  });

  it('빈 검색어는 모두 매칭해야 함', () => {
    expect(matchChosung('도원', '')).toBe(true);
  });

  it('filterByChosung — "도원" 검색 시 도원만 남아야 함', () => {
    const customers = ['덕윤모사', '대영', '도원', '고려'];
    const result = filterByChosung(customers, '도원', (c) => c);
    expect(result).toEqual(['도원']);
  });
});
