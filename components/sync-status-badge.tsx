import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Platform } from 'react-native';
import { useSync } from '@/hooks/use-sync';

/**
 * 동기화 상태 표시 배지
 *
 * - 동기화 완료: 초록색 점 + "동기화 완료" (2초 후 자동 숨김)
 * - 동기화 중: teal 점 + "동기화 중..." + 회전 애니메이션
 * - 오프라인: 주황색 점 + "오프라인" + 대기 건수
 * - 실패: 빨간색 점 + "동기화 실패"
 */
export function SyncStatusBadge() {
  const { syncStatus, isOnline } = useSync();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // 동기화 중일 때 점 깜빡임 애니메이션
  useEffect(() => {
    if (syncStatus.state === 'syncing') {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [syncStatus.state]);

  // idle + 대기 없음 → 표시 안 함
  if (syncStatus.state === 'idle' && syncStatus.pendingCount === 0) {
    return null;
  }

  const config = getConfig(syncStatus.state, syncStatus.pendingCount, isOnline);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        backgroundColor: config.bgColor,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
        gap: 6,
        ...(Platform.OS === 'web'
          ? { boxShadow: '0 1px 4px rgba(0,0,0,0.1)' } as any
          : { elevation: 2 }),
      }}
    >
      <Animated.View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: config.dotColor,
          opacity: pulseAnim,
        }}
      />
      <Text style={{ fontSize: 12, color: config.textColor, fontWeight: '600' }}>
        {config.label}
      </Text>
    </View>
  );
}

function getConfig(
  state: string,
  pendingCount: number,
  isOnline: boolean
): { dotColor: string; bgColor: string; textColor: string; label: string } {
  if (!isOnline || state === 'offline') {
    return {
      dotColor: '#F59E0B',
      bgColor: '#FFF7ED',
      textColor: '#92400E',
      label: pendingCount > 0
        ? `오프라인 — ${pendingCount}건 동기화 대기 중`
        : '오프라인 — 데이터가 기기에 저장됩니다',
    };
  }

  if (state === 'syncing') {
    return {
      dotColor: '#1B365D',
      bgColor: '#EDF1F7',
      textColor: '#0F2340',
      label: '동기화 중...',
    };
  }

  if (state === 'error') {
    return {
      dotColor: '#e74c3c',
      bgColor: '#FEF2F2',
      textColor: '#991B1B',
      label: '동기화 실패 — 재시도 중',
    };
  }

  // idle but pendingCount > 0 (큐가 아직 남아있는 경우)
  if (pendingCount > 0) {
    return {
      dotColor: '#1B365D',
      bgColor: '#EDF1F7',
      textColor: '#0F2340',
      label: `${pendingCount}건 동기화 대기 중`,
    };
  }

  // idle + 완료
  return {
    dotColor: '#22C55E',
    bgColor: '#F0FDF4',
    textColor: '#166534',
    label: '동기화 완료',
  };
}
