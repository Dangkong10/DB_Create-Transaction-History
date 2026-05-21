import { Stack } from "expo-router";

/**
 * /deposit Stack
 *   - index   : 입금 입력 전체화면
 *   - history : 입금 기록 보관함 (수정/삭제)
 *
 * 헤더는 각 페이지에서 자체 헤더 UI 를 그리므로 여기서는 hide.
 */
export default function DepositLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="history" />
    </Stack>
  );
}
