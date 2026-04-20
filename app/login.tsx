import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, Image } from 'react-native';
import { router } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { supabase } from '@/lib/supabase';

/**
 * 로그인 화면 (이메일/비밀번호)
 */
export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    // 입력 검증
    if (!email || !password) {
      setError('이메일과 비밀번호를 입력해주세요.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw signInError;

      if (data.user) {
        // 로그인 성공 - 메인 화면으로 이동
        router.replace('/(tabs)');
      }
    } catch (err: any) {
      console.error('[Login] Error:', err);
      setError(err.message || '로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer className="bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 justify-center px-6">
          {/* 로고 */}
          <View className="items-center mb-8">
            <Image
              source={require('@/assets/images/logo.png')}
              style={{ width: 120, height: 120 }}
              resizeMode="contain"
            />
          </View>

          {/* 제목 */}
          <View className="mb-8">
            <Text className="text-3xl font-bold text-foreground mb-2 text-center">거래명세서 입력 시스템</Text>
            <Text className="text-base text-muted text-center">로그인하여 시작하세요</Text>
          </View>

          {/* 이메일 입력 */}
          <View className="mb-4">
            <Text className="text-sm font-medium text-foreground mb-2">이메일</Text>
            <TextInput
              className="bg-surface border border-border rounded-lg px-4 py-3 text-foreground"
              placeholder="example@email.com"
              placeholderTextColor="#9BA1A6"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!loading}
            />
          </View>

          {/* 비밀번호 입력 */}
          <View className="mb-6">
            <Text className="text-sm font-medium text-foreground mb-2">비밀번호</Text>
            <TextInput
              className="bg-surface border border-border rounded-lg px-4 py-3 text-foreground"
              placeholder="비밀번호를 입력하세요"
              placeholderTextColor="#9BA1A6"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
              editable={!loading}
            />
          </View>

          {/* 오류 메시지 */}
          {error && (
            <View className="mb-4 bg-error/10 p-4 rounded-xl">
              <Text className="text-error text-center">{error}</Text>
            </View>
          )}

          {/* 로그인 버튼 */}
          <TouchableOpacity
            className="bg-primary rounded-lg py-4 mb-4"
            onPress={handleLogin}
            disabled={loading}
            style={{ opacity: loading ? 0.6 : 1 }}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-background text-center font-semibold text-base">로그인</Text>
            )}
          </TouchableOpacity>

          {/* 회원가입 링크 */}
          <View className="flex-row justify-center">
            <Text className="text-muted">계정이 없으신가요?{' '}</Text>
            <TouchableOpacity onPress={() => router.push('/signup')} disabled={loading}>
              <Text className="text-primary font-semibold">회원가입</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
