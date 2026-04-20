import { describe, it, expect } from 'vitest';
import { supabase } from './supabase';

describe('Supabase Connection', () => {
  it('should connect to Supabase successfully', async () => {
    // Supabase 연결 테스트: 간단한 쿼리 실행
    const { data, error } = await supabase
      .from('transactions')
      .select('count')
      .limit(1);

    // 에러가 없거나, 테이블이 없다는 에러만 허용 (테이블은 아직 생성 전)
    if (error) {
      // 테이블이 없는 경우는 정상 (아직 생성 안 함)
      expect(
        error.message.includes('transactions') && 
        (error.message.includes('does not exist') || error.message.includes('not find'))
      ).toBe(true);
    } else {
      // 연결 성공
      expect(data).toBeDefined();
    }
  });

  it('should have valid Supabase URL and key', () => {
    const url = import.meta.env?.VITE_SUPABASE_URL || '';
    const key = import.meta.env?.VITE_SUPABASE_ANON_KEY || '';

    expect(url).toBeTruthy();
    expect(url).toContain('supabase.co');
    expect(key).toBeTruthy();
    expect(key.startsWith('sb_')).toBe(true);
  });
});
