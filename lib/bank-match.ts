/**
 * 은행 입금 문자의 입금자명 → 거래처 매칭
 *
 * 규칙 (사용자 확정 2026-08-03, 실측 16건으로 검증)
 *
 *   1단계 — 완전 일치 (우선)
 *     조각이 거래처명(name) 또는 등록된 입금자명(payerNames)과 정확히 같으면 확정.
 *     여기서 찾으면 2단계는 보지 않는다.
 *
 *   2단계 — 접미사 정규화 후 일치 (1단계에서 0곳일 때만)
 *     '모사'·'섬유'·'사' 만 떼고 비교한다. 거래처가 상호에서 이 꼬리말을
 *     생략하고 입금하는 경우가 실제로 있다 (고려사→고려, 우진→우진모사).
 *     **거래처명에만** 적용한다 — 사람 이름에 접미사 규칙을 걸 이유가 없다.
 *
 *   판정
 *     정확히 1곳 → 자동 입금 / 0곳·2곳 이상 → 자동 처리 안 함 (사람에게)
 *
 * 하지 않는 것
 *   · 임의 접두사 매칭 — '고려물산'이 '고려'로 잡히면 안 된다. 화이트리스트만
 *   · 초성·유사도·부분 문자열 포함
 *   · aliases 는 매칭에 쓰지 않는다. 내부 축약어("7조"·"켈리")가 은행 문자에
 *     찍힐 일이 없고, 우연히 겹치면 오배정 위험만 생긴다
 *
 * 입금자명 형태 (실측)
 *   '유현수(해비치)' 처럼 이름(상호) 로 오기도 하고 '김주희' 처럼 이름만 오기도 한다.
 *   같은 계좌인데 섞여서 오므로 괄호를 분리해 각 조각을 따로 대조한다.
 */

import type { Customer } from './types';

/** 거래처가 상호에서 흔히 생략하는 꼬리말. 긴 것부터 검사해야 '모사'가 '사'보다 먼저 잡힌다. */
const SUFFIXES = ['모사', '섬유', '사'] as const;

/** 접미사를 뗀 결과가 이보다 짧으면 인정하지 않는다 */
const MIN_CORE = 2;

export type MatchStatus = 'matched' | 'ambiguous' | 'none';

export interface BankMatchResult {
  status: MatchStatus;
  /** status === 'matched' 일 때만 값이 있다 */
  customerName?: string;
  /** 매칭된(또는 모호한) 거래처 목록 */
  candidates: string[];
  /** 어느 단계에서 잡혔는지 — 'exact' | 'suffix' | null */
  via: 'exact' | 'suffix' | null;
}

/** 전각 공백(U+3000)이 실제로 붙어 온다. 공백을 정리한다. */
function normalize(s: string): string {
  return s.replace(/　/g, ' ').trim().replace(/\s+/g, ' ');
}

/** '이름(상호)' 를 두 조각으로. 괄호가 없으면 그 자체가 한 조각. */
function splitPieces(sender: string): string[] {
  const s = normalize(sender);
  if (!s) return [];
  const m = s.match(/^(.+?)\s*\((.+?)\)$/);
  if (!m) return [s];
  return [m[1].trim(), m[2].trim()].filter(Boolean);
}

/** 끝에 붙은 접미사를 1회 제거. 뗄 게 없거나 너무 짧아지면 원본 그대로. */
export function stripSuffix(s: string): string {
  for (const suf of SUFFIXES) {
    if (s.length > suf.length && s.endsWith(suf)) {
      const core = s.slice(0, -suf.length);
      if (core.length >= MIN_CORE) return core;
    }
  }
  return s;
}

/**
 * 입금자명으로 거래처를 찾는다.
 *
 * @param sender   문자에 찍힌 입금자명 원문 (예: '유현수(해비치)')
 * @param customers 거래처 목록 (name + payerNames 만 사용)
 */
export function matchBankSender(
  sender: string | null | undefined,
  customers: Customer[],
): BankMatchResult {
  const none: BankMatchResult = { status: 'none', candidates: [], via: null };
  if (!sender) return none;

  const pieces = splitPieces(sender);
  if (pieces.length === 0) return none;

  // ---- 1단계: 완전 일치 (거래처명 + 등록된 입금자명) ----
  const exact = new Set<string>();
  for (const c of customers) {
    const payers = c.payerNames ?? [];
    for (const p of pieces) {
      if (p === c.name || payers.includes(p)) {
        exact.add(c.name);
        break;
      }
    }
  }
  if (exact.size > 0) return decide(exact, 'exact');

  // ---- 2단계: 접미사 정규화 (거래처명에만) ----
  const suffix = new Set<string>();
  for (const c of customers) {
    const coreName = stripSuffix(c.name);
    for (const p of pieces) {
      if (stripSuffix(p) === coreName) {
        suffix.add(c.name);
        break;
      }
    }
  }
  if (suffix.size > 0) return decide(suffix, 'suffix');

  return none;
}

function decide(hits: Set<string>, via: 'exact' | 'suffix'): BankMatchResult {
  const candidates = Array.from(hits).sort((a, b) => a.localeCompare(b, 'ko-KR'));
  if (candidates.length === 1) {
    return { status: 'matched', customerName: candidates[0], candidates, via };
  }
  // 2곳 이상이면 자동 처리하지 않는다 — 돈이 걸린 문제라 사람에게 넘긴다
  return { status: 'ambiguous', candidates, via };
}
