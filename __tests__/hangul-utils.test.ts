/**
 * 한글 초성 검색 유틸리티 테스트
 */

import { describe, it, expect } from 'vitest';
import {
  isHangul,
  isChosung,
  getChosung,
  extractChosung,
  matchChosung,
  searchByChosung,
} from '../lib/hangul-utils';

describe('한글 유틸리티', () => {
  describe('isHangul', () => {
    it('한글 문자를 올바르게 인식해야 함', () => {
      expect(isHangul('가')).toBe(true);
      expect(isHangul('해')).toBe(true);
      expect(isHangul('힣')).toBe(true);
    });

    it('한글이 아닌 문자를 올바르게 인식해야 함', () => {
      expect(isHangul('a')).toBe(false);
      expect(isHangul('1')).toBe(false);
      expect(isHangul('ㄱ')).toBe(false);
    });
  });

  describe('isChosung', () => {
    it('초성 문자를 올바르게 인식해야 함', () => {
      expect(isChosung('ㄱ')).toBe(true);
      expect(isChosung('ㅎ')).toBe(true);
      expect(isChosung('ㅂ')).toBe(true);
    });

    it('초성이 아닌 문자를 올바르게 인식해야 함', () => {
      expect(isChosung('가')).toBe(false);
      expect(isChosung('a')).toBe(false);
    });
  });

  describe('getChosung', () => {
    it('한글 문자에서 초성을 추출해야 함', () => {
      expect(getChosung('해')).toBe('ㅎ');
      expect(getChosung('비')).toBe('ㅂ');
      expect(getChosung('치')).toBe('ㅊ');
    });

    it('한글이 아닌 문자는 그대로 반환해야 함', () => {
      expect(getChosung('a')).toBe('a');
      expect(getChosung('1')).toBe('1');
    });
  });

  describe('extractChosung', () => {
    it('문자열에서 초성만 추출해야 함', () => {
      expect(extractChosung('해비치')).toBe('ㅎㅂㅊ');
      expect(extractChosung('한올')).toBe('ㅎㅇ');
      expect(extractChosung('동방모사')).toBe('ㄷㅂㅁㅅ');
    });
  });

  describe('matchChosung', () => {
    it('초성 검색이 올바르게 매칭되어야 함', () => {
      expect(matchChosung('해비치', 'ㅎㅂ')).toBe(true);
      expect(matchChosung('해비치', 'ㅎㅂㅊ')).toBe(true);
      expect(matchChosung('한올', 'ㅎㅇ')).toBe(true);
    });

    it('완전 일치 검색이 올바르게 매칭되어야 함', () => {
      expect(matchChosung('해비치', '해비')).toBe(true);
      expect(matchChosung('해비치', '해비치')).toBe(true);
    });

    it('매칭되지 않는 경우를 올바르게 처리해야 함', () => {
      expect(matchChosung('해비치', 'ㄱㄴ')).toBe(false);
      expect(matchChosung('해비치', '동방')).toBe(false);
    });
  });

  describe('searchByChosung', () => {
    const customers = [
      { id: '1', name: '해비치' },
      { id: '2', name: '한올' },
      { id: '3', name: '한일모사' },
      { id: '4', name: '동방' },
      { id: '5', name: '동신' },
    ];

    it('초성 검색으로 항목을 필터링해야 함', () => {
      const result = searchByChosung(customers, 'ㅎㅂ', (c) => c.name);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('해비치');
    });

    it('여러 항목이 매칭될 수 있어야 함', () => {
      const result = searchByChosung(customers, 'ㅎ', (c) => c.name);
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result.some((c) => c.name === '해비치')).toBe(true);
      expect(result.some((c) => c.name === '한올')).toBe(true);
    });

    it('빈 검색어는 모든 항목을 반환해야 함', () => {
      const result = searchByChosung(customers, '', (c) => c.name);
      expect(result).toHaveLength(customers.length);
    });
  });
});
