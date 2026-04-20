import { describe, it, expect } from 'vitest';
import { supabase } from '../lib/supabase';

describe('Supabase Connection', () => {
  it('should connect to Supabase successfully', async () => {
    // Supabase 연결 테스트 - 간단한 쿼리 실행
    const { data, error } = await supabase.from('transactions').select('count').limit(0);
    
    // 에러가 없어야 함 (테이블이 없어도 연결은 성공해야 함)
    expect(error).toBeNull();
  });

  it('should have valid environment variables', () => {
    // 환경 변수가 설정되어 있는지 확인
    expect(import.meta.env.VITE_SUPABASE_URL).toBeDefined();
    expect(import.meta.env.VITE_SUPABASE_ANON_KEY).toBeDefined();
    expect(import.meta.env.VITE_SUPABASE_URL).toContain('supabase.co');
  });
});
