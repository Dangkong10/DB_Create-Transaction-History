-- ============================================================
-- 마이그레이션: bank_alerts (하나은행 입금 문자 원본 보관)
-- 날짜: 2026-08-04
-- 실행 위치: Supabase SQL Editor
-- 주의: 기존 데이터를 변경하지 않습니다 (테이블 신규 + payments 컬럼 추가만).
--
-- 배경:
--   맥의 메시지 DB(chat.db)에서 하나은행 입금 알림 문자를 읽어 이 테이블에 쌓는다.
--   앱은 이 테이블을 보고 /deposit 화면의 금액 칸을 미리 채운다.
--
-- 왜 원본(raw_text)까지 보관하는가:
--   실측 샘플이 15건뿐이라 아직 못 본 문자 형식이 있을 수 있다. 파싱에 실패해도
--   원문을 남겨 두면(status='unparsed') 나중에 보정할 수 있다. 조용히 버리지 않는다.
--
-- 멱등성:
--   chat.db 의 message.guid 를 UNIQUE 키로 쓴다. 브리지를 몇 번을 돌려도
--   같은 문자가 두 번 들어가지 않는다.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. bank_alerts 테이블
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bank_alerts (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- chat.db message.guid — 같은 문자의 중복 삽입을 막는 멱등 키
  message_guid TEXT NOT NULL,

  -- 문자를 실제로 받은 시각 (chat.db message.date)
  received_at  TIMESTAMPTZ NOT NULL,

  -- 거래일. 문자 본문의 MM/DD 에 수신 시각의 연도를 붙여 만든다.
  -- (미래가 되면 연도를 1 빼서 연말 경계를 처리 — 12/31 문자가 자정 넘겨 도착하는 경우)
  tx_date      DATE NOT NULL,

  -- 'in' = 입금, 'out' = 출금.
  -- 현재 브리지는 **입금만 저장**한다(사용자 확정 2026-08-03). 컬럼은 나중에
  -- 출금까지 다루게 될 때를 위해 남겨 둔다.
  direction    TEXT NOT NULL DEFAULT 'in' CHECK (direction IN ('in', 'out')),

  amount       INTEGER NOT NULL CHECK (amount > 0),

  -- 입금자명 원문. '유현수(해비치)' 처럼 괄호가 붙어 오기도 하고
  -- '김주희' 처럼 이름만 오기도 한다 — 가공하지 않고 그대로 저장한다.
  sender_name  TEXT,

  -- 계좌번호 마스킹의 뒷자리 (155******00307 → '00307').
  -- 계좌가 여러 개일 때 구분용.
  account_tail TEXT,

  -- 문자에 함께 오는 잔액. 연속성을 검증하면 문자 유실을 감지할 수 있다.
  balance      BIGINT,

  -- 문자 원문 전체 (파싱 실패 시 복구용)
  raw_text     TEXT NOT NULL,

  --   pending   : 아직 입금으로 확정되지 않음
  --   confirmed : payments 에 반영됨
  --   ignored   : 거래처와 무관한 입금(개인거래 등) — 다시 띄우지 않음
  --   unparsed  : 구조는 은행 문자인데 금액 등 파싱에 실패 — 사람이 봐야 함
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'confirmed', 'ignored', 'unparsed')),

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, message_guid)
);

-- ============================================================
-- 2. 인덱스
-- ============================================================
-- /deposit 화면: 특정 날짜의 미처리 알림 조회
CREATE INDEX IF NOT EXISTS idx_bank_alerts_user_date_status
  ON public.bank_alerts(user_id, tx_date, status);

-- 보관함 탭: 최근 순 목록
CREATE INDEX IF NOT EXISTS idx_bank_alerts_user_received
  ON public.bank_alerts(user_id, received_at DESC);

-- ============================================================
-- 3. RLS — 다른 사용자의 알림 접근 차단 (payments 정책과 동일 형태)
-- ============================================================
ALTER TABLE public.bank_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own bank_alerts" ON public.bank_alerts;
CREATE POLICY "Users can select own bank_alerts"
  ON public.bank_alerts FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own bank_alerts" ON public.bank_alerts;
CREATE POLICY "Users can insert own bank_alerts"
  ON public.bank_alerts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own bank_alerts" ON public.bank_alerts;
CREATE POLICY "Users can update own bank_alerts"
  ON public.bank_alerts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own bank_alerts" ON public.bank_alerts;
CREATE POLICY "Users can delete own bank_alerts"
  ON public.bank_alerts FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.bank_alerts IS
  '하나은행 입금 알림 문자 원본. 맥 chat.db 에서 브리지가 적재. message_guid 로 멱등 보장.';

-- ============================================================
-- 4. payments 출처 추적 컬럼
--    문자에서 자동으로 들어온 입금과 손으로 넣은 입금을 구분한다.
--    기존 행은 전부 'manual' 로 채워진다.
-- ============================================================
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS bank_alert_id BIGINT REFERENCES public.bank_alerts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.payments.source IS
  '입금 출처. manual = 손으로 입력, bank = 은행 문자에서 자동 반영.';
COMMENT ON COLUMN public.payments.bank_alert_id IS
  '이 입금의 근거가 된 bank_alerts 행. 문자에서 온 입금만 값이 있다.';

-- 같은 알림이 두 번 입금으로 반영되는 것을 막는다 (NULL 은 중복 허용)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_payments_bank_alert
  ON public.payments(bank_alert_id)
  WHERE bank_alert_id IS NOT NULL;

COMMIT;

-- ============================================================
-- 확인 (선택)
--   SELECT status, count(*) FROM public.bank_alerts GROUP BY status;
--   SELECT source, count(*) FROM public.payments GROUP BY source;
-- ============================================================
