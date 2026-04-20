import { describe, it, expect } from 'vitest';

/**
 * 웹용 구글 OAuth 클라이언트 ID 검증 테스트
 */
describe('Google OAuth Web Client ID', () => {
  it('should have valid web client ID format', () => {
    const clientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB;

    // 환경 변수가 설정되어 있는지 확인
    expect(clientId).toBeDefined();
    expect(clientId).not.toBe('');

    // 구글 클라이언트 ID 형식 검증
    expect(clientId).toMatch(/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/);
  });

  it('should be different from Android client ID', () => {
    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB;
    const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;

    // 웹과 안드로이드 클라이언트 ID는 달라야 함
    expect(webClientId).not.toBe(androidClientId);
  });

  it('should have correct domain suffix', () => {
    const clientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB;

    // .apps.googleusercontent.com으로 끝나야 함
    expect(clientId).toContain('.apps.googleusercontent.com');
  });
});
