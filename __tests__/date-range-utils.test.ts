/**
 * 날짜 범위 유틸 테스트
 */

import { describe, it, expect } from 'vitest';
import { getQuickRange, formatDateHeader, toLocalDateStr, DATE_RE, type QuickRangeKey } from '../lib/date-range-utils';

describe('getQuickRange', () => {
  const keys: QuickRangeKey[] = ['thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'thisYear'];

  it('모든 키에서 start <= end 이고 YYYY-MM-DD 형식이어야 함', () => {
    for (const key of keys) {
      const { start, end } = getQuickRange(key);
      expect(start, key).toMatch(DATE_RE);
      expect(end, key).toMatch(DATE_RE);
      expect(start <= end, `${key}: ${start} <= ${end}`).toBe(true);
    }
  });

  it('이번 주는 월요일 시작, 7일 범위여야 함', () => {
    const { start, end } = getQuickRange('thisWeek');
    const [sy, sm, sd] = start.split('-').map(Number);
    const startDate = new Date(sy, sm - 1, sd);
    expect(startDate.getDay()).toBe(1); // 월요일
    const [ey, em, ed] = end.split('-').map(Number);
    const diffDays = (new Date(ey, em - 1, ed).getTime() - startDate.getTime()) / 86400000;
    expect(diffDays).toBe(6);
  });

  it('이번 달은 1일 시작, 말일 종료여야 함', () => {
    const { start, end } = getQuickRange('thisMonth');
    expect(start.endsWith('-01')).toBe(true);
    const [y, m] = start.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    expect(end).toBe(`${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`);
  });
});

describe('formatDateHeader', () => {
  it('날짜를 "M월 D일 (요일)" 형식으로 변환해야 함', () => {
    expect(formatDateHeader('2026-07-08')).toBe('7월 8일 (수)');
    expect(formatDateHeader('2026-07-09')).toBe('7월 9일 (목)');
    expect(formatDateHeader('2026-01-01')).toBe('1월 1일 (목)');
  });

  it('시간이 붙은 문자열도 날짜 부분만 사용해야 함', () => {
    expect(formatDateHeader('2026-07-08 14:30:00')).toBe('7월 8일 (수)');
  });
});

describe('toLocalDateStr', () => {
  it('Date를 YYYY-MM-DD로 변환해야 함', () => {
    expect(toLocalDateStr(new Date(2026, 6, 9))).toBe('2026-07-09');
    expect(toLocalDateStr(new Date(2026, 0, 1))).toBe('2026-01-01');
  });
});

describe('DATE_RE', () => {
  it('완성된 날짜만 통과시켜야 함', () => {
    expect(DATE_RE.test('2026-07-09')).toBe(true);
    expect(DATE_RE.test('2026-0')).toBe(false);
    expect(DATE_RE.test('2026-07-0')).toBe(false);
    expect(DATE_RE.test('')).toBe(false);
  });
});
