# 웹용 구글 OAuth 설정 가이드

PC 웹 브라우저에서 구글 로그인이 가능하도록 웹용 OAuth 클라이언트 ID를 추가로 발급받는 방법입니다.

## 1. Google Cloud Console 접속

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 기존 프로젝트 선택 (이미 Android OAuth를 설정한 프로젝트)

## 2. 웹용 OAuth 2.0 클라이언트 ID 생성

1. 좌측 메뉴에서 **APIs & Services** → **Credentials** 클릭
2. 상단의 **+ CREATE CREDENTIALS** → **OAuth client ID** 클릭
3. Application type: **Web application** 선택
4. Name: "Web Client" 입력
5. **Authorized JavaScript origins** 섹션에서 **+ ADD URI** 클릭
   - 개발 환경: `https://8081-i0d40zpf3fm7329q0ftnt-8a3fc63e.sg1.manus.computer`
   - 로컬 테스트: `http://localhost:8081` (필요시)
6. **Authorized redirect URIs** 섹션에서 **+ ADD URI** 클릭
   - 개발 환경: `https://8081-i0d40zpf3fm7329q0ftnt-8a3fc63e.sg1.manus.computer`
   - 로컬 테스트: `http://localhost:8081` (필요시)
7. **CREATE** 버튼 클릭

## 3. 클라이언트 ID 복사

생성 완료 후 표시되는 팝업에서:
- **Client ID** 복사 (형식: `XXXXXXXXX-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.apps.googleusercontent.com`)

## 4. 환경 변수 설정

`.env` 파일에 웹용 클라이언트 ID 추가:

```env
EXPO_PUBLIC_GOOGLE_CLIENT_ID=1042960783999-of16t37q967o7pl50rb9nvnng5l2nr2b.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB=YOUR_WEB_CLIENT_ID_HERE
```

- `EXPO_PUBLIC_GOOGLE_CLIENT_ID`: 기존 Android 클라이언트 ID (그대로 유지)
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB`: 새로 발급받은 웹 클라이언트 ID

## 5. 개발 서버 재시작

```bash
pnpm dev
```

## 6. 웹 브라우저에서 테스트

1. PC 웹 브라우저에서 앱 URL 접속:
   ```
   https://8081-i0d40zpf3fm7329q0ftnt-8a3fc63e.sg1.manus.computer
   ```

2. "구글 계정으로 로그인" 버튼 클릭

3. 구글 계정 선택 및 권한 승인

4. 로그인 성공 후 앱 메인 화면으로 이동

## 주의사항

### Authorized JavaScript origins와 Redirect URIs

- 개발 환경 URL은 Manus 플랫폼이 제공하는 임시 URL입니다
- 실제 배포 시에는 배포된 도메인으로 변경해야 합니다
- 예: `https://yourdomain.com`

### 프로덕션 배포 시

프로덕션 환경에서는:
1. 실제 도메인을 Authorized JavaScript origins에 추가
2. 실제 도메인을 Authorized redirect URIs에 추가
3. `.env` 파일의 웹 클라이언트 ID를 프로덕션용으로 교체

### 보안

- `.env` 파일은 절대 Git에 커밋하지 마세요 (`.gitignore`에 추가)
- 클라이언트 ID는 공개되어도 괜찮지만, Client Secret은 절대 노출하지 마세요

## 문제 해결

### "redirect_uri_mismatch" 오류

- Google Cloud Console에서 설정한 Redirect URI와 앱에서 사용하는 URI가 정확히 일치하는지 확인
- 프로토콜(http/https), 포트 번호까지 정확히 일치해야 함

### "Access blocked: This app's request is invalid" 오류

- OAuth consent screen에서 Test users에 본인 이메일이 추가되어 있는지 확인
- Google Sheets API가 활성화되어 있는지 확인

### 로그인 후 토큰이 저장되지 않음

- 브라우저 개발자 도구 Console에서 에러 메시지 확인
- `localStorage` 또는 `sessionStorage`가 차단되어 있지 않은지 확인
