import { useEffect } from 'react';
import { router } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { getSession } from '@/lib/supabase';

/**
 * 앱 진입점 - 로그인 상태 확인 후 리다이렉트
 */
export default function Index() {
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const session = await getSession();

    if (session) {
      // 로그인 상태 - 메인 화면으로 이동
      router.replace('/(tabs)');
    } else {
      // 미로그인 상태 - 로그인 화면으로 이동
      router.replace('/login');
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" />
    </View>
  );
}
