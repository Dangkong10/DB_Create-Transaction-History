import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast-provider';

/**
 * 회원가입 화면
 */
export default function SignupScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const handleSignup = async () => {
    // 입력 검증
    if (!email || !password || !confirmPassword) {
      showToast('모든 필드를 입력해주세요.', 'error');
      return;
    }

    if (password !== confirmPassword) {
      showToast('비밀번호가 일치하지 않습니다.', 'error');
      return;
    }

    if (password.length < 6) {
      showToast('비밀번호는 최소 6자 이상이어야 합니다.', 'error');
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        showToast('회원가입 성공! 로그인해주세요.', 'success');
        router.replace('/login');
      }
    } catch (error: any) {
      console.error('[Signup] Error:', error);
      showToast(error.message || '회원가입에 실패했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer className="bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 justify-center px-6">
          {/* 제목 */}
          <View className="mb-8">
            <Text className="text-3xl font-bold text-foreground mb-2">회원가입</Text>
            <Text className="text-base text-muted">거래명세서 입력 시스템</Text>
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
          <View className="mb-4">
            <Text className="text-sm font-medium text-foreground mb-2">비밀번호</Text>
            <TextInput
              className="bg-surface border border-border rounded-lg px-4 py-3 text-foreground"
              placeholder="최소 6자 이상"
              placeholderTextColor="#9BA1A6"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
              editable={!loading}
            />
          </View>

          {/* 비밀번호 확인 입력 */}
          <View className="mb-6">
            <Text className="text-sm font-medium text-foreground mb-2">비밀번호 확인</Text>
            <TextInput
              className="bg-surface border border-border rounded-lg px-4 py-3 text-foreground"
              placeholder="비밀번호를 다시 입력하세요"
              placeholderTextColor="#9BA1A6"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
              editable={!loading}
            />
          </View>

          {/* 회원가입 버튼 */}
          <TouchableOpacity
            className="bg-primary rounded-lg py-4 mb-4"
            onPress={handleSignup}
            disabled={loading}
            style={{ opacity: loading ? 0.6 : 1 }}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-background text-center font-semibold text-base">회원가입</Text>
            )}
          </TouchableOpacity>

          {/* 로그인 링크 */}
          <View className="flex-row justify-center">
            <Text className="text-muted">이미 계정이 있으신가요?{' '}</Text>
            <TouchableOpacity onPress={() => router.replace('/login')} disabled={loading}>
              <Text className="text-primary font-semibold">로그인</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
