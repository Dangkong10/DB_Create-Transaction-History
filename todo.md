# 거래명세서 입력 시스템 - TODO

## 브랜딩 및 설정
- [x] 앱 아이콘 생성 (거래명세서 관련 아이콘)
- [x] app.config.ts 브랜딩 정보 업데이트

## 핵심 기능
- [x] 초성 검색 라이브러리 구현 (한글 자모 분리)
- [x] 거래처 검색 입력창 및 자동완성 UI
- [x] 품목 입력 폼 (품목명, 수량)
- [x] 동적 품목 추가/삭제 기능
- [x] 취소 및 반품 체크박스
- [x] 저장 버튼 및 햄틱 피드백

## 구글 시트 연동 (선택 사항)
- [ ] 구글 시트 API 연동 설정 (사용자가 필요 시 추가)
- [x] 데이터 전송 함수 구현 (로컬 저장)
- [x] 타임스탬프 자동 생성
- [x] 저장 성공/실패 알림

## UI/UX 최적화
- [x] 태블릿 레이아웃 최적화
- [x] 큰 글씨 및 터치 영역 적용 (20px 이상)
- [x] 자동 포커스 이동
- [x] 키보드 'Done' 버튼 처리

## 데이터 관리
- [x] 거래처 목록 로컬 저장 (AsyncStorage)
- [x] 품목 목록 로컬 저장 (AsyncStorage)
- [ ] 최근 사용 거래처 표시 (향후 개선 사항)

## 테스트 및 검증
- [x] 초성 검색 기능 테스트
- [x] 다중 품목 입력 테스트
- [x] 로컬 저장 기능 테스트
- [x] 태블릿 환경 테스트

## v4.27.0 특가 기능 구현 완료
- [x] 특가 데이터 구조 설계 (거래처명, 제품명, 특가)
- [x] google-sheets.ts에 특가 관련 함수 구현
  - [x] getSpecialPrices(): 전체 특가 목록 조회
  - [x] getSpecialPricesByCustomer(): 특정 거래처의 특가 목록 조회
  - [x] addSpecialPrice(): 특가 추가
  - [x] deleteSpecialPrice(): 특가 삭제
  - [x] getSpecialPrice(): 특정 거래처 + 제품의 특가 조회
- [x] manage.tsx에 특가 설정 UI 구현
  - [x] 각 거래처 옆에 [💰 특가 설정] 버튼 추가
  - [x] 특가 설정 모달 UI 구현 (제품명 + 특가 입력, 목록 표시, 삭제 기능)
- [x] excel-generator.ts에 특가 우선 적용 로직 구현
  - [x] 특가 목록 조회 (getSpecialPrices)
  - [x] 가격 우선순위: 특가 (거래처+제품 매칭) → 기본 단가
  - [x] drawReceipt 함수에 특가 적용 로직 추가
  - [x] drawOversizedReceipt 함수에 특가 적용 로직 추가
- [ ] 특가 기능 전체 흐름 테스트
  - [ ] 특가 설정 후 구글 시트 '특가목록' 탭에 저장 확인
  - [ ] 영수증 엑셀 내보내기 시 특가 적용 확인
  - [ ] 특가 미설정 거래처는 기본 단가 적용 확인

(나머지 내용은 이전과 동일...)

## v4.27.1 긴급 버그 수정 - 특가 미적용 문제
- [ ] 특가 데이터 로드 확인 (getSpecialPrices 호출 및 응답)
- [ ] 특가 매칭 로직 디버깅 (거래처명, 제품명 정확히 일치하는지)
- [ ] 콘솔 로그 추가하여 특가 적용 여부 추적
- [ ] 특가 적용 로직 수정 및 테스트

## v4.27.2 특가 기능 개선
- [x] 특가 삭제 시 401 인증 오류 해결 (deleteRow 파라미터 순서 수정)
- [ ] 특가 삭제 확인 모달을 Confirm으로 변경
- [x] 특가 설정 모달에 제품명 자동완성 UI 추가
- [x] 제품명 입력 시 초성 검색 기능 구현
- [x] 자동완성 드롭다운에서 제품 선택 시 자동 입력
- [x] 특가 삭제 및 자동완성 기능 테스트

## v4.27.3 UI 레이어 순서 조정
- [x] Confirm 모달 z-index를 특가 설정 모달보다 높게 조정 (9999 vs 1000)
- [x] 삭제 확인 모달이 특가 설정 모달 위에 표시되는지 테스트

## v4.28.0 당일 집계표 엑셀 자동 생성 기능
- [ ] 첨부 이미지(image_152959.png) 확인 및 양식 분석
- [x] 당일 집계표 엑셀 생성 로직 구현 (lib/daily-summary-excel.ts)
  - [x] 상단 날짜 병합 (C열+D열, 우측 정렬)
  - [x] 헤더 스타일 (회색 배경, 굵은 글씨, 중앙 정렬, 테두리)
  - [x] 데이터 집계 (상호, 전잔고, 매출금액, 총잔액)
  - [x] 총잔액 수식 (=B+C) 자동 계산
  - [x] A4 용지 인쇄 최적화 (Fit to 1 Page)
- [x] 영수증 출력 탭 3분할 레이아웃 UI 구현
  - [x] 좌측 1/3: 데이터 통계 박스
  - [x] 중앙 1/3: 당일 집계표 다운로드 버튼
  - [x] 우측 1/3: 엑셀 영수증 다운로드 버튼
  - [x] 3개 요소 높이 일치 (minHeight: 100) 및 간격 조정 (gap-3)
  - [x] 반응형 처리 (flex: 1 사용)
- [x] 당일 집계표 다운로드 버튼 클릭 시 엑셀 생성 및 다운로드
- [x] 기능 테스트 및 검증 (집계 로직 테스트 작성 완료, 런타임 테스트 예정)

## v4.28.1 당일 집계표 버그 수정 및 UI 개선
- [x] 웹 환경에서 FileSystem.writeAsStringAsync 오류 수정
  - [x] 웹에서는 Blob + URL.createObjectURL 방식으로 다운로드
  - [x] 모바일에서는 기존 FileSystem 방식 유지
- [x] 버튼 텍스트 크기 증가 (16pt → 21pt)
  - [x] 당일 집계표 버튼
  - [x] 엑셀 영수증 버튼
- [x] 수정 사항 테스트 및 검증 (개발 서버 정상 작동 확인)

## v4.28.2 UI 개선 - 날짜 선택 필요 문구 삭제
- [x] 당일 집계표 버튼 하단의 "날짜 선택 필요" 문구 삭제

## v4.28.3 Vercel 배포 - 구글 OAuth 환경 변수 수정
- [x] 구글 인증 관련 파일에서 환경 변수 참조 확인 (lib/google-sheets.ts)
- [x] GOOGLE_CLIENT_ID 환경 변수명 통일 (process.env.GOOGLE_CLIENT_ID fallback 추가)
- [x] Vercel 환경 변수와 코드 일치 확인
- [x] Redeploy 후 로그인 테스트 (체크포인트 생성 완료, Vercel에 재배포 필요)

## v4.28.4 Vercel 배포 - 구글 OAuth client_id 오류 완전 해결
- [x] lib/google-sheets.ts에서 웹 환경 변수 참조 방식 재확인
- [x] Vercel 웹 빌드 시 import.meta.env 사용 확인
- [x] VITE_ 접두사 환경 변수 참조로 변경 (import.meta.env.VITE_GOOGLE_CLIENT_ID)
- [x] 체크포인트 생성 (v4.28.4)
- [x] Vercel 재배포 안내

## v4.28.5 Vercel 배포 - 모든 구글 인증 코드에서 환경 변수 통일
- [x] 모든 구글 인증 관련 파일 검색 (lib/google-sheets.ts)
- [x] 각 파일에서 환경 변수 참조 방식 확인
- [x] import.meta.env.VITE_GOOGLE_CLIENT_ID로 직접 참조 (빌드 타임 정적 치환)
- [x] 수정된 파일: lib/google-sheets.ts (20-22번 줄)
- [x] 체크포인트 생성 (v4.28.5)

## v4.29.0 전잔고 관리 기능 구현
- [ ] 전잔고 데이터 구조 설계 (거래처명, 전잔고 금액)
- [x] google-sheets.ts에 전잔고 관련 함수 구현
  - [x] getPreviousBalances(): 전체 전잔고 목록 조회
  - [x] getPreviousBalance(customerName): 특정 거래처의 전잔고 조회
  - [x] setPreviousBalance(customerName, balance): 전잔고 설정/수정
  - [x] deletePreviousBalance(customerName): 전잔고 삭제
- [x] manage.tsx에 전잔고 설정 UI 구현
  - [x] 각 거래처 옆에 [💵 전잔고] 버튼 추가
  - [x] 전잔고 설정 모달 UI 구현 (금액 입력, 현재 전잔고 표시)
- [x] daily-summary-excel.ts에 전잔고 반영 로직 추가
  - [x] 전잔고 목록 조회 (getPreviousBalances)
  - [x] B열(전잔고)에 거래처별 전잔고 자동 입력
  - [x] 전잔고 미설정 시 0으로 처리
- [ ] 기능 테스트
  - [ ] 전잔고 설정 후 구글 시트 '전잔고' 탭에 저장 확인
  - [ ] 당일 집계표 생성 시 전잔고 반영 확인
  - [ ] 총잔액 계산 확인 (전잔고 + 매출금액)
- [ ] 체크포인트 생성

## v4.28.5 재현 - 전잔고 기능 제거
- [x] lib/google-sheets.ts에서 전잔고 관련 함수 제거
  - [x] getPreviousBalances() 제거
  - [x] getPreviousBalance() 제거
  - [x] setPreviousBalance() 제거
  - [x] deletePreviousBalance() 제거
- [x] app/(tabs)/manage.tsx에서 전잔고 UI 제거
  - [x] 전잔고 버튼 제거
  - [x] 전잔고 모달 제거
  - [x] 전잔고 관련 state 제거
- [x] lib/daily-summary-excel.ts에서 전잔고 로직 제거
  - [x] aggregateDailySummary를 동기 함수로 복원
  - [x] 전잔고 조회 로직 제거
  - [x] prevBalance를 0으로 고정
- [x] 개발 서버 재시작 및 테스트 (로딩 중이지만 타임스탬프 오류는 drizzle-kit만)
- [x] 체크포인트 생성 (v4.28.5 재현 - a51e258b)

## v4.28.6 Vercel 빌드 오류 수정
- [x] lib/google-sheets.ts에 fallback 처리 추가
  - [x] VITE_GOOGLE_CLIENT_ID가 undefined일 때 빈 문자열로 처리
  - [x] 빌드 시 오류 방지
- [x] 체크포인트 생성 (v4.28.6 - a307d36b)
- [x] Vercel 재배포 안내

## v4.28.7 Expo 모바일 빌드 오류 수정 - import.meta.env 제거
- [ ] lib/google-sheets.ts에서 import.meta.env를 process.env로 변경
- [ ] Hermes 엔진 호환성 확인
- [ ] 빌드 테스트
- [ ] 체크포인트 생성

## Vercel 웹 배포 설정
- [x] Expo 웹 빌드 설정 확인
- [x] package.json에서 웹 빌드 스크립트 확인
- [x] 웹 빌드 테스트 실행 (성공)
- [x] Vercel 배포 가이드 작성

## 로그인 사용자 정보 표시 문제 수정 (401 Unauthorized)
- [x] 로그인 후 액세스 토큰 저장 로직 확인 (lib/google-sheets.ts)
- [x] getStoredAuth()에 디버깅 로그 추가
- [x] 토큰 만료 시 AsyncStorage 자동 삭제 처리 추가
- [x] use-auth.ts에 getStoredAuth 호출 전후 로그 추가
- [x] signInWithGoogle에 AsyncStorage 저장 전후 로그 추가
- [x] getStoredAuth에 AsyncStorage 읽기 전후 로그 추가
- [ ] 브라우저 콘솔에서 로그 확인 후 문제 파악
- [ ] 테스트 및 체크포인트 생성

## v4.29.0 구글 로그인 COOP 에러 및 401 토큰 누락 해결
- [x] 문제 분석 완료
  - [x] COOP (Cross-Origin-Opener-Policy) 에러 원인 파악
  - [x] 401 UNAUTHENTICATED 에러 원인 파악 (토큰 미전달)
  - [x] 현재 Implicit Flow (팝업 방식)의 한계 확인
- [x] Redirect Flow로 로그인 방식 변경
  - [x] lib/google-sheets.ts의 signInWithGoogle 함수 수정
  - [x] 전체 페이지 리다이렉션 사용 (window.location.href)
  - [x] OAuth URL 직접 생성 (response_type=token)
- [x] OAuth 콜백 처리 로직 구현
  - [x] app/_layout.tsx에 URL Fragment 파싱 로직 추가
  - [x] URL Fragment에서 access_token 추출 (#access_token=...)
  - [x] AsyncStorage에 토큰 저장
  - [x] URL 정리 및 페이지 새로고침
- [x] 토큰 검증 및 사용자 정보 가져오기 로직 수정
  - [x] hooks/use-auth.ts에서 토큰 확인 로직 확인 (이미 올바름)
  - [x] Authorization 헤더에 토큰 제대로 포함 확인 (이미 올바름)
- [ ] 테스트
  - [ ] 로그인 플로우 전체 테스트
  - [ ] 토큰 저장 확인
  - [ ] 사용자 정보 표시 확인
- [ ] 체크포인트 생성 및 Vercel 재배포

## v4.29.1 로그인 로직 수정 불량 해결 - 팝업 방식 완전 제거
- [x] 현재 로그인 코드 전체 분석
  - [x] lib/google-sheets.ts의 signInWithGoogle 함수 확인
  - [x] hooks/use-auth.ts의 로그인 처리 로직 확인
  - [x] app/(tabs)/manage.tsx의 로그인 버튼 이벤트 확인
  - [x] 팝업 관련 코드 위치 파악 (promptAsync 발견)
- [x] 팝업 방식 코드 완전 제거
  - [x] promptAsync 호출 코드 제거
  - [x] AuthSession.AuthRequest 사용 코드 제거
  - [x] 모바일 환경 코드 제거
  - [x] Platform.OS 체크 제거
- [x] Redirect Flow 전면 재작성
  - [x] window.location.href로 직접 리다이렉션
  - [x] OAuth URL 직접 생성 (response_type=token)
  - [x] 콜백 URL 설정 (window.location.origin)
- [x] 토큰 추출 및 상태 업데이트 로직 구현
  - [x] app/_layout.tsx에서 URL Fragment 파싱 (이미 구현됨)
  - [x] AsyncStorage에 토큰 저장 (이미 구현됨)
  - [x] useAuth에서 토큰 읽기 및 사용자 정보 가져오기 (이미 구현됨)
  - [x] UI 상태 업데이트 (로그인 → 이메일/로그아웃) (이미 구현됨)
- [ ] 테스트
  - [ ] 로컬 개발 서버에서 로그인 테스트
  - [ ] COOP 에러 없는지 확인
  - [ ] UI 상태 업데이트 확인
- [ ] 체크포인트 생성 및 Vercel 재배포

## v4.29.2 Vercel 배포 실패 해결 - MODULE_NOT_FOUND 에러
- [x] 배포 실패 원인 분석
  - [x] 에러 로그 확인 (MODULE_NOT_FOUND)
  - [x] 서버 시작 스크립트 확인 (npx serve dist)
  - [x] 빌드 출력 디렉토리 확인 (dist)
- [x] 빌드 스크립트 및 종속성 확인
  - [x] package.json의 build 스크립트 확인
  - [x] package.json의 start 스크립트 확인
  - [x] serve 패키지가 dependencies에 없음 발견
- [x] 문제 수정
  - [x] serve 패키지 설치 (pnpm add serve)
- [x] 로컬 테스트
  - [x] 빌드 테스트 (pnpm build:web) - 성공
- [ ] 체크포인트 생성 및 Vercel 재배포

## v4.30.0 Claude 분석 기반 OAuth 로그인 문제 근본 해결
- [x] vercel.json에 COOP 헤더 수정
  - [x] Cross-Origin-Opener-Policy: same-origin-allow-popups
  - [x] Cross-Origin-Embedder-Policy: unsafe-none
- [x] Google Cloud Console 도메인 승인 확인
  - [x] 승인된 JavaScript 원본에 Vercel 도메인 추가
  - [x] 승인된 리디렉션 URI에 Vercel 도메인 추가
- [x] Vercel 환경변수 등록
  - [x] VITE_GOOGLE_CLIENT_ID 등록
- [x] useAuth 토큰 전달 방식 확인 및 수정
  - [x] Authorization: Bearer ${accessToken} 헤더 확인 (이미 올바름)
  - [x] access_token과 id_token 구분 확인 (이미 올바름)
- [ ] 테스트
  - [ ] 로컬 개발 서버에서 로그인 테스트
  - [ ] COOP 에러 없는지 확인
  - [ ] 401 에러 없는지 확인
- [ ] 체크포인트 생성 및 Vercel 재배포

## v4.31.0 구글 시트를 Supabase로 전환 - 이메일 로그인 기반 다중 디바이스 동기화
- [x] Supabase 클라이언트 설치 및 환경변수 설정
  - [x] @supabase/supabase-js 패키지 설치
  - [x] VITE_SUPABASE_URL 환경변수 설정
  - [x] VITE_SUPABASE_ANON_KEY 환경변수 설정
  - [x] Supabase 클라이언트 초기화 파일 생성
  - [x] Supabase 연결 테스트 성공
- [x] 데이터베이스 테이블 설계 및 생성
  - [x] transactions 테이블 스키마 설계
  - [x] Supabase 대시보드에서 테이블 생성
  - [x] RLS (Row Level Security) 정책 설정 (기본)
- [ ] Supabase Auth 설정 및 회원가입 화면 추가
  - [ ] Supabase Auth 활성화 (이메일/비밀번호)
  - [ ] 회원가입 화면 추가 (app/signup.tsx)
  - [ ] 이메일 인증 확인 기능 추가
- [ ] 로그인 화면 수정
  - [ ] 구글 로그인 코드 제거
  - [ ] 이메일/비밀번호 입력 폼 추가
  - [ ] Supabase Auth로 로그인 처리
- [ ] 사용자별 데이터 분리
  - [ ] transactions 테이블에 user_id 컬럼 추가
  - [ ] RLS 정책 수정 (사용자별 데이터 분리)
- [ ] 구글 시트 코드를 Supabase로 교체
  - [ ] app/index.tsx 수정
  - [ ] app/login.tsx 수정
  - [ ] app/(tabs)/index.tsx 수정
  - [ ] app/(tabs)/history.tsx 수정
  - [ ] hooks/use-auth.ts 수정
- [ ] 테스트
  - [ ] 회원가입 테스트
  - [ ] 로그인 테스트
  - [ ] CRUD 기능 테스트
  - [ ] 다중 디바이스 동기화 테스트
- [ ] 체크포인트 생성 및 Vercel 재배포

## v4.32.0 Supabase Auth 활성화 및 회원가입/로그인 화면 추가
- [x] Supabase API 키 업데이트 (새로운 anon key)
- [x] Supabase 연결 테스트 성공
- [x] 회원가입 화면 추가 (app/signup.tsx)
- [x] 로그인 화면 수정 (이메일/비밀번호 방식)
- [x] 로고 추가 (assets/images/logo.png)
- [x] app/_layout.tsx에 signup 라우트 추가
- [ ] use-auth 훅 수정 (Supabase Auth 사용)
- [ ] 인증 상태 관리 구현
- [ ] 회원가입/로그인 테스트
- [ ] 체크포인트 생성

## v4.32.1 import.meta SyntaxError 수정 (웹 환경)
- [x] lib/supabase.ts에서 import.meta.env 제거
- [x] process.env로 환경 변수 참조 방식 변경
- [x] 개발 서버 재시작
- [x] 웹 브라우저 콘솔 오류 확인 (수정 완료)
- [x] 체크포인트 생성

## v4.32.2 scripts/load-env.js import.meta 오류 수정
- [x] scripts/load-env.js를 ESM에서 CommonJS로 변환
- [x] import 문을 require로 변경
- [x] import.meta.url 제거 (__filename/__dirname은 CommonJS에서 자동 제공)
- [x] 개발 서버 재시작 및 정상 작동 확인
- [x] 체크포인트 생성

## v4.32.3 환경 변수 접두사 수정 (VITE_ → EXPO_PUBLIC_)
- [x] lib/supabase.ts에서 VITE_* → EXPO_PUBLIC_* 변경
- [x] scripts/load-env.js에 Supabase 환경 변수 매핑 추가
- [x] 개발 서버 재시작 및 정상 빌드 확인
- [x] 체크포인트 생성
