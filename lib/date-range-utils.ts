/**
 * 날짜 범위 공용 유틸
 *
 * 기간 집계 모달(period-export-modal)과 거래 내역 기간 모드(history)가 공유.
 */

export const toLocalDateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export type QuickRangeKey = 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'thisYear';

export function getQuickRange(key: QuickRangeKey): { start: string; end: string } {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const dow = now.getDay();

  let start: Date;
  let end: Date;

  switch (key) {
    case 'thisWeek': {
      const mon = new Date(now);
      mon.setDate(d - (dow === 0 ? 6 : dow - 1));
      start = mon;
      end = new Date(mon);
      end.setDate(mon.getDate() + 6);
      break;
    }
    case 'lastWeek': {
      const thisMon = new Date(now);
      thisMon.setDate(d - (dow === 0 ? 6 : dow - 1));
      end = new Date(thisMon);
      end.setDate(thisMon.getDate() - 1);
      start = new Date(end);
      start.setDate(end.getDate() - 6);
      break;
    }
    case 'thisMonth':
      start = new Date(y, m, 1);
      end = new Date(y, m + 1, 0);
      break;
    case 'lastMonth':
      start = new Date(y, m - 1, 1);
      end = new Date(y, m, 0);
      break;
    case 'thisYear':
      start = new Date(y, 0, 1);
      end = new Date(y, 11, 31);
      break;
    default:
      start = now;
      end = now;
  }
  return { start: toLocalDateStr(start), end: toLocalDateStr(end) };
}

/** 완성된 YYYY-MM-DD 인지 — 수동 입력 타이핑 중간값에 데이터 로드가 돌지 않게 하는 가드 */
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "2026-07-08" → "7월 8일 (수)"
 * new Date('YYYY-MM-DD')는 UTC로 해석돼 타임존에 따라 하루 밀릴 수 있으므로 직접 파싱.
 */
export function formatDateHeader(dateStr: string): string {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dow = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
  return `${m}월 ${d}일 (${dow})`;
}
