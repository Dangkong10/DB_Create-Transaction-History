/**
 * 알약(pill) 토글 — 동방 재고체크(Pwa_app) SubPills 디자인·모션 이식
 *
 * - 인디케이터가 스프링(오버슈트)으로 미끄러지고, 이동 중 고무처럼
 *   늘어났다 되눌리는 스트레치 모션 (Pwa_app pill-stretch keyframe 재현)
 * - 이동 중 인디케이터 색이 두 옵션 색 사이에서 자연스럽게 혼합
 * - 아이콘은 라인(스트로크) 전용 — react-native-svg 로 전달
 */

import { useEffect, useRef, useState } from "react";
import { Animated, Platform, Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";

export interface PillOption {
  key: string;
  label: string;
  /** 이 옵션이 선택됐을 때 인디케이터 색 */
  color: string;
  /** 라인 아이콘 렌더 (전달받은 색으로 stroke) */
  icon?: (color: string) => React.ReactNode;
}

interface Props {
  options: [PillOption, PillOption];
  /** 선택된 옵션의 key */
  value: string;
  onChange: (key: string) => void;
}

const TRACK_PAD = 5;
const IND_GAP = 6; // 두 위치 사이 여유 (Pwa_app translateX(100% + 6px))

export function PillToggle({ options, value, onChange }: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const activeIdx = options[1].key === value ? 1 : 0;

  // 위치·색 (0 ↔ 1). 스프링 오버슈트가 색 보간을 벗어나지 않게 clamp.
  const pos = useRef(new Animated.Value(activeIdx)).current;
  // 스트레치 (이동 중 고무 느낌)
  const scaleX = useRef(new Animated.Value(1)).current;
  const scaleY = useRef(new Animated.Value(1)).current;
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      pos.setValue(activeIdx);
      return;
    }
    // 스프링 이동 (cubic-bezier(0.34, 1.56, 0.64, 1) 근사)
    Animated.spring(pos, {
      toValue: activeIdx,
      friction: 6,
      tension: 120,
      useNativeDriver: false, // 색 보간 + web 호환
    }).start();
    // 스트레치: 1 → 1.28×0.9 (40%) → 0.95×1.04 (72%) → 1 (Pwa_app pill-stretch)
    scaleX.setValue(1);
    scaleY.setValue(1);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(scaleX, { toValue: 1.28, duration: 168, useNativeDriver: false }),
        Animated.timing(scaleX, { toValue: 0.95, duration: 134, useNativeDriver: false }),
        Animated.timing(scaleX, { toValue: 1, duration: 118, useNativeDriver: false }),
      ]),
      Animated.sequence([
        Animated.timing(scaleY, { toValue: 0.9, duration: 168, useNativeDriver: false }),
        Animated.timing(scaleY, { toValue: 1.04, duration: 134, useNativeDriver: false }),
        Animated.timing(scaleY, { toValue: 1, duration: 118, useNativeDriver: false }),
      ]),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx]);

  const indWidth = trackWidth > 0 ? trackWidth / 2 - TRACK_PAD - IND_GAP / 2 - 2 : 0;
  const translateX = pos.interpolate({
    inputRange: [0, 1],
    outputRange: [0, indWidth + IND_GAP],
  });
  const bgColor = pos.interpolate({
    inputRange: [0, 1],
    outputRange: [options[0].color, options[1].color],
    extrapolate: "clamp",
  });

  const handlePress = (opt: PillOption) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (opt.key !== value) onChange(opt.key);
  };

  return (
    <View
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      style={{
        flexDirection: "row",
        backgroundColor: "#ECEAE3",
        borderRadius: 999,
        padding: TRACK_PAD,
        ...(Platform.OS === "web"
          ? ({ boxShadow: "inset 0 1px 3px rgba(0,0,0,0.06)" } as any)
          : {}),
      }}
    >
      {/* 인디케이터 */}
      {trackWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: TRACK_PAD,
            bottom: TRACK_PAD,
            left: TRACK_PAD,
            width: indWidth,
            borderRadius: 999,
            backgroundColor: bgColor,
            transform: [{ translateX }, { scaleX }, { scaleY }],
            ...(Platform.OS === "web"
              ? ({ boxShadow: "0 2px 6px rgba(0,0,0,0.25)" } as any)
              : { elevation: 3 }),
          }}
        />
      )}

      {options.map((opt) => {
        const on = opt.key === value;
        const color = on ? "#ffffff" : "#6b7280";
        return (
          <Pressable
            key={opt.key}
            onPress={() => handlePress(opt)}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 50,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              borderRadius: 999,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            })}
          >
            {opt.icon?.(color)}
            <Text style={{ fontSize: 17, fontWeight: on ? "900" : "800", color }}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
