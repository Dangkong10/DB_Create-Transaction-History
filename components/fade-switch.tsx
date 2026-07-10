/**
 * FadeSwitch — switchKey가 바뀔 때마다 내용이 살짝 아래에서 페이드인.
 *
 * 알약 토글(출고/반품, 당일/기간) 등으로 화면 내용이 즉시 갈릴 때
 * 뚝 끊기는 느낌 대신 부드러운 전환을 준다. children은 remount되지 않아
 * 입력 포커스·스크롤 등 상태가 유지된다.
 * (이징은 Pwa_app 슬라이드 곡선 cubic-bezier(0.32, 0.72, 0.34, 1) 재사용)
 */

import { useEffect, useRef } from "react";
import { Animated, Easing, type StyleProp, type ViewStyle } from "react-native";

interface Props {
  /** 이 값이 바뀔 때마다 페이드인 재생 */
  switchKey: string | number | boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** true면 처음 mount될 때도 페이드인 (조건부로 나타나는 배너 등) */
  appear?: boolean;
}

export function FadeSwitch({ switchKey, children, style, appear = false }: Props) {
  const opacity = useRef(new Animated.Value(appear ? 0 : 1)).current;
  const translateY = useRef(new Animated.Value(appear ? 8 : 0)).current;
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current && !appear) {
      isFirst.current = false;
      return;
    }
    isFirst.current = false;
    opacity.setValue(0);
    translateY.setValue(8);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 250,
        easing: Easing.bezier(0.32, 0.72, 0.34, 1),
        useNativeDriver: false,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 250,
        easing: Easing.bezier(0.32, 0.72, 0.34, 1),
        useNativeDriver: false,
      }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [switchKey]);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}
