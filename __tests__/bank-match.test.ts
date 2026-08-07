/**
 * 은행 입금자명 → 거래처 매칭 테스트
 *
 * 2026-08-06 기준 **실제 하나은행 문자 16건**과 실제 등록 상태로 고정한다.
 * 규칙을 바꿀 때 이 테스트가 깨지면, 실무에서 잡히던 입금이 안 잡히게 된다는 뜻이다.
 */
import { describe, it, expect } from 'vitest';
import { matchBankSender, stripSuffix } from '../lib/bank-match';
import type { Customer } from '../lib/types';

/** 실제 등록 상태 (payer_names 가 있는 거래처 + 매칭에 관여하는 거래처) */
const CUSTOMERS: Customer[] = [
  { id: '1', name: '고려', aliases: [], payerNames: ['박태상'] },
  { id: '2', name: '고운실', aliases: [], payerNames: ['지원숙'] },
  { id: '3', name: '대풍', aliases: [], payerNames: ['박삼순'] },
  { id: '4', name: '동신', aliases: [], payerNames: ['박남선'] },
  { id: '5', name: '뜨개세상', aliases: [], payerNames: ['김주희'] },
  { id: '6', name: '삼성토탈', aliases: [], payerNames: ['박정만'] },
  { id: '7', name: '서울모사', aliases: [], payerNames: ['박명화'] },
  { id: '8', name: '실바구니', aliases: [], payerNames: ['장시경'] },
  { id: '9', name: '영화모사', aliases: [], payerNames: ['최문자'] },
  { id: '10', name: '장미모사', aliases: [], payerNames: ['김채원'] },
  { id: '11', name: '해비치', aliases: [], payerNames: ['유현수'] },
  { id: '12', name: '형제섬유', aliases: [], payerNames: ['이규녀'] },
  { id: '13', name: '혜원', aliases: [], payerNames: ['문명희'] },
  // 입금자명이 등록되지 않은 거래처들 (거래처명으로만 매칭 가능)
  { id: '14', name: '대화사', aliases: [], payerNames: [] },
  { id: '15', name: '우진모사', aliases: ['7조'], payerNames: [] },
];

const nameOf = (sender: string) => matchBankSender(sender, CUSTOMERS).customerName;

describe('실측 입금자명 — 매칭되어야 하는 것', () => {
  it.each([
    ['지원숙', '고운실'],
    ['장시경', '실바구니'],
    ['김주희', '뜨개세상'],
    ['박명화', '서울모사'],
    ['박삼순', '대풍'],
  ])('이름만 오는 경우: %s → %s', (sender, expected) => {
    expect(nameOf(sender)).toBe(expected);
  });

  it.each([
    ['박태상(고려사)', '고려'],
    ['박남선(동신모사)', '동신'],
    ['유현수(해비치)', '해비치'],
  ])('이름(상호) 형태: %s → %s', (sender, expected) => {
    expect(nameOf(sender)).toBe(expected);
  });

  it('괄호 안 상호가 거래처명과 달라도 사람 이름으로 잡힌다', () => {
    // 거래처는 '고려' 인데 문자에는 '고려사' 로 온다
    const r = matchBankSender('박태상(고려사)', CUSTOMERS);
    expect(r.status).toBe('matched');
    expect(r.via).toBe('exact'); // 사람 이름이 완전 일치하므로 1단계
  });
});

describe('접미사 정규화 (2단계)', () => {
  it('상호에서 사를 생략해도 잡힌다: 대화 → 대화사', () => {
    const r = matchBankSender('대화', CUSTOMERS);
    expect(r.status).toBe('matched');
    expect(r.customerName).toBe('대화사');
    expect(r.via).toBe('suffix');
  });

  it('상호에서 모사를 생략해도 잡힌다: 우진 → 우진모사', () => {
    expect(nameOf('우진')).toBe('우진모사');
  });

  it('거래처명이 더 길게 와도 잡힌다: 형제 → 형제섬유', () => {
    expect(nameOf('형제')).toBe('형제섬유');
  });

  it('임의 접두사는 잡지 않는다 — 고려물산은 고려가 아니다', () => {
    expect(matchBankSender('고려물산', CUSTOMERS).status).toBe('none');
  });

  it('접미사를 뗀 결과가 2자 미만이면 인정하지 않는다', () => {
    expect(stripSuffix('모사')).toBe('모사'); // '' 가 되면 안 됨
    expect(stripSuffix('장미모사')).toBe('장미');
    expect(stripSuffix('성남섬유')).toBe('성남');
    expect(stripSuffix('삼성토탈')).toBe('삼성토탈'); // 목록에 없는 꼬리말은 그대로
  });
});

describe('매칭되지 않아야 하는 것 — 등록 안 된 입금자', () => {
  it.each(['안준범', '홍지웅', '두민선', '김순례', '뜨개온김혜경'])(
    '%s 은 어느 거래처에도 붙지 않는다',
    (sender) => {
      expect(matchBankSender(sender, CUSTOMERS).status).toBe('none');
    },
  );
});

describe('안전장치', () => {
  it('같은 이름이 두 거래처에 등록되면 자동 처리하지 않는다', () => {
    const dup: Customer[] = [
      { id: 'a', name: '가나', aliases: [], payerNames: ['홍길동'] },
      { id: 'b', name: '다라', aliases: [], payerNames: ['홍길동'] },
    ];
    const r = matchBankSender('홍길동', dup);
    expect(r.status).toBe('ambiguous');
    expect(r.candidates).toEqual(['가나', '다라']);
    expect(r.customerName).toBeUndefined();
  });

  it('접미사를 뗐을 때 겹치면 자동 처리하지 않는다', () => {
    const dup: Customer[] = [
      { id: 'a', name: '장미', aliases: [], payerNames: [] },
      { id: 'b', name: '장미모사', aliases: [], payerNames: [] },
    ];
    // '장미모사' 는 1단계에서 정확히 하나만 맞으므로 확정된다
    expect(matchBankSender('장미모사', dup).customerName).toBe('장미모사');
    // 반면 접미사를 떼야 하는 형태로 오면 두 곳이 걸려 사람에게 넘어간다
    expect(matchBankSender('장미섬유', dup).status).toBe('ambiguous');
  });

  it('완전 일치가 접미사 정규화보다 우선한다', () => {
    const both: Customer[] = [
      { id: 'a', name: '동신', aliases: [], payerNames: [] },
      { id: 'b', name: '동신모사', aliases: [], payerNames: [] },
    ];
    expect(matchBankSender('동신', both).customerName).toBe('동신');
    expect(matchBankSender('동신모사', both).customerName).toBe('동신모사');
  });

  it('aliases 는 매칭에 쓰지 않는다', () => {
    // 우진모사의 별칭 '7조' 로는 잡히면 안 된다
    expect(matchBankSender('7조', CUSTOMERS).status).toBe('none');
  });

  it('빈 값·공백은 매칭하지 않는다', () => {
    expect(matchBankSender('', CUSTOMERS).status).toBe('none');
    expect(matchBankSender(null, CUSTOMERS).status).toBe('none');
    expect(matchBankSender('   ', CUSTOMERS).status).toBe('none');
  });

  it('전각 공백이 붙어 와도 정리된다', () => {
    expect(nameOf('김주희　　　')).toBe('뜨개세상');
  });
});
