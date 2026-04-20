# Google Apps Script 설정 가이드

구글 시트에 데이터를 자동으로 전송하기 위한 Google Apps Script 설정 방법입니다.

## 1. Google Apps Script 프로젝트 생성

1. 구글 시트 열기: https://docs.google.com/spreadsheets/d/1uMh8MIBGdsYMIuQDyiSUnuB1TaPu2-wRBy4RYNOMI44/edit
2. **확장 프로그램** > **Apps Script** 클릭
3. 기존 코드를 모두 삭제하고 아래 코드 붙여넣기

## 2. Apps Script 코드

```javascript
/**
 * 거래명세서 입력 시스템 - Google Apps Script
 * 모바일 앱에서 전송된 데이터를 구글 시트에 저장
 */

// 스프레드시트 ID (현재 시트의 ID)
const SPREADSHEET_ID = '1uMh8MIBGdsYMIuQDyiSUnuB1TaPu2-wRBy4RYNOMI44';

/**
 * POST 요청 처리
 */
function doPost(e) {
  try {
    // JSON 데이터 파싱
    const data = JSON.parse(e.postData.contents);
    const records = data.records;
    
    if (!records || !Array.isArray(records)) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: 'Invalid data format' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // 스프레드시트 열기
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getActiveSheet();
    
    // 데이터 추가
    records.forEach(record => {
      sheet.appendRow([
        record.timestamp,
        record.customerName,
        record.productName,
        record.quantity,
        record.cancellation
      ]);
    });
    
    return ContentService
      .createTextOutput(JSON.stringify({ 
        success: true, 
        count: records.length 
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('Error: ' + error.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ 
        success: false, 
        error: error.toString() 
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * GET 요청 처리 (테스트용)
 */
function doGet(e) {
  return ContentService
    .createTextOutput('거래명세서 입력 시스템 API가 정상 작동 중입니다.')
    .setMimeType(ContentService.MimeType.TEXT);
}
```

## 3. 배포

1. Apps Script 편집기 우측 상단의 **배포** > **새 배포** 클릭
2. **유형 선택** > **웹 앱** 선택
3. 설정:
   - **설명**: 거래명세서 입력 API
   - **실행 계정**: **나**
   - **액세스 권한**: **모든 사용자** (로그인 불필요)
4. **배포** 클릭
5. **웹 앱 URL** 복사 (예: `https://script.google.com/macros/s/AKfycby.../exec`)

## 4. 모바일 앱에 URL 설정

복사한 Web App URL을 모바일 앱의 설정 화면에 입력하세요.

앱 실행 후:
1. **관리** 탭 클릭
2. **구글 시트 설정** 섹션에서 Web App URL 입력
3. **저장** 클릭

## 5. 테스트

1. 모바일 앱에서 거래 내역 입력
2. **저장하기** 버튼 클릭
3. 구글 시트에서 데이터 확인

## 문제 해결

### 데이터가 저장되지 않는 경우

1. **Apps Script 로그 확인**:
   - Apps Script 편집기에서 **실행** > **로그 보기**
   
2. **배포 권한 확인**:
   - 배포 시 "액세스 권한"이 **모든 사용자**로 설정되어 있는지 확인
   
3. **스프레드시트 ID 확인**:
   - Apps Script 코드의 `SPREADSHEET_ID`가 올바른지 확인
   
4. **Web App URL 확인**:
   - 모바일 앱에 입력한 URL이 정확한지 확인
   - URL 끝에 `/exec`가 포함되어 있어야 함

### 권한 오류가 발생하는 경우

1. Apps Script 편집기에서 **실행** > **doPost 실행**
2. 권한 승인 팝업에서 **권한 검토** 클릭
3. Google 계정 선택 후 **허용** 클릭

## 시트 헤더 설정

구글 시트 첫 번째 행에 다음 헤더를 추가하세요:

| A열 | B열 | C열 | D열 | E열 |
|-----|-----|-----|-----|-----|
| 타임스탬프 | 고객사 이름 | 품목명 | 수량 | 취소, 반 품목 |

---

**참고**: 이 설정은 한 번만 수행하면 됩니다. 이후 모바일 앱에서 저장한 모든 데이터가 자동으로 구글 시트에 추가됩니다.
