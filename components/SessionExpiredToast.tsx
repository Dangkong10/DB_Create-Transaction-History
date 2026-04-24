import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';

interface Props {
  onDismiss?: () => void;
  durationMs?: number;
}

export function SessionExpiredToast({ onDismiss, durationMs = 2000 }: Props) {
  const translateY = useRef(new Animated.Value(-80)).current;

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: 0,
      duration: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();

    const timer = setTimeout(() => {
      Animated.timing(translateY, {
        toValue: -80,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      }).start(() => onDismiss?.());
    }, durationMs);

    return () => clearTimeout(timer);
  }, [durationMs, onDismiss, translateY]);

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY }] }]}
      pointerEvents="none"
    >
      <View style={styles.toast}>
        <Text style={styles.icon}>⚠️</Text>
        <View style={styles.textWrap}>
          <Text style={styles.title}>로그인이 만료되었습니다</Text>
          <Text style={styles.message}>다시 로그인해 주세요</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 16,
    zIndex: 10000,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff3cd',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 280,
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  textWrap: { flexShrink: 1 },
  icon: { fontSize: 20 },
  title: { color: '#856404', fontSize: 14, fontWeight: '600' },
  message: { color: '#856404', fontSize: 13, marginTop: 2 },
});
