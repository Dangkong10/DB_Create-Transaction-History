/**
 * 미수금 조정 모달
 *
 * 흐름:
 *   1. 입금 입력 모달의 거래처 행 [조정] 버튼 클릭 → 이 모달 열림
 *   2. 현재 미수금 표시 + "조정 후 금액" 입력
 *   3. 자동 계산: 조정액 = 입력값 − 현재미수금 (±)
 *   4. [조정 저장] → saveAdjustment() → 모달 닫힘 + 입금 모달 새로고침
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useToast } from '@/lib/toast-provider';
import { saveAdjustment } from '@/lib/payments';

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString('ko-KR');
}

function parseAmount(str: string): number {
  const cleaned = str.replace(/[^0-9-]/g, '');
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : 0;
}

interface Props {
  visible: boolean;
  customerName: string;
  currentOutstanding: number;
  onClose: () => void;
  /** 저장 성공 시 호출 — 입금 모달이 거래처 리스트 새로 로드 */
  onSaved?: () => void;
}

export function AdjustmentModal({
  visible,
  customerName,
  currentOutstanding,
  onClose,
  onSaved,
}: Props) {
  const { showToast } = useToast();
  const [targetAmount, setTargetAmount] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // 모달 열릴 때마다 입력값 초기화 (현재미수금으로 미리 채움 — 차액 0)
  useEffect(() => {
    if (!visible) return;
    setTargetAmount(String(currentOutstanding));
    setSaving(false);
  }, [visible, currentOutstanding]);

  /** 조정 후 - 현재 = 차액 (저장될 amount) */
  const delta = useMemo(() => {
    const target = parseAmount(targetAmount);
    return target - currentOutstanding;
  }, [targetAmount, currentOutstanding]);

  const handleSave = useCallback(async () => {
    if (delta === 0) {
      showToast('조정할 차액이 없습니다 (현재 미수금과 동일).', 'info');
      return;
    }
    try {
      setSaving(true);
      await saveAdjustment({
        customerName,
        adjustmentDate: todayStr(),
        amount: delta,
      });
      showToast(
        `${customerName} 미수금 조정 완료 (${delta > 0 ? '+' : ''}${formatNumber(delta)}원)`,
        'success',
      );
      onSaved?.();
      onClose();
    } catch (err: any) {
      console.error('[AdjustmentModal] save error:', err);
      showToast(`조정 저장 실패: ${err.message ?? err}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [delta, customerName, showToast, onSaved, onClose]);

  const deltaColor = delta > 0 ? '#dc2626' : delta < 0 ? '#16a34a' : '#94a3b8';
  const deltaLabel = delta > 0 ? '미수금 증가' : delta < 0 ? '미수금 감소' : '변동 없음';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 16,
        }}
      >
        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 14,
            width: '100%',
            maxWidth: 440,
            overflow: 'hidden',
          }}
        >
          {/* 헤더 */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 20,
              paddingVertical: 16,
              backgroundColor: '#7c3aed',
            }}
          >
            <Text style={{ fontSize: 18, marginRight: 8 }}>⚖️</Text>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: '#fff' }}>
              미수금 조정 — {customerName}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: 'rgba(255,255,255,0.15)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 14, color: '#fff' }}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 본문 */}
          <View style={{ padding: 22 }}>
            {/* 현재 미수금 */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 14,
                paddingBottom: 14,
                borderBottomWidth: 1,
                borderBottomColor: '#e5e7eb',
              }}
            >
              <Text style={{ fontSize: 13, color: '#666' }}>현재 미수금 (시스템)</Text>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: '#1B365D',
                  ...(Platform.OS === 'web' ? ({ fontFamily: 'monospace' } as any) : {}),
                }}
              >
                {formatNumber(currentOutstanding)}원
              </Text>
            </View>

            {/* 조정 후 금액 입력 */}
            <Text style={{ fontSize: 13, color: '#1B365D', fontWeight: '600', marginBottom: 8 }}>
              조정 후 금액
            </Text>
            <TextInput
              value={targetAmount ? formatNumber(parseAmount(targetAmount)) : ''}
              onChangeText={(v) => setTargetAmount(v.replace(/[^0-9-]/g, ''))}
              placeholder="예: 3,400,000"
              placeholderTextColor="#cbd5e1"
              keyboardType="numeric"
              style={{
                height: 44,
                paddingHorizontal: 14,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: '#d1d5db',
                backgroundColor: '#fff',
                fontSize: 15,
                color: '#1B365D',
                textAlign: 'right',
                marginBottom: 16,
                ...(Platform.OS === 'web' ? ({ fontFamily: 'monospace' } as any) : {}),
              }}
            />

            {/* 차액 표시 */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 12,
                borderRadius: 8,
                backgroundColor: '#f8fafc',
                marginBottom: 18,
              }}
            >
              <View>
                <Text style={{ fontSize: 11, color: '#94a3b8' }}>차액</Text>
                <Text style={{ fontSize: 11, color: deltaColor, fontWeight: '600', marginTop: 2 }}>
                  {deltaLabel}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: '700',
                  color: deltaColor,
                  ...(Platform.OS === 'web' ? ({ fontFamily: 'monospace' } as any) : {}),
                }}
              >
                {delta > 0 ? '+' : ''}
                {formatNumber(delta)}원
              </Text>
            </View>

            {/* 버튼 */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={onClose}
                disabled={saving}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 8,
                  backgroundColor: '#e5e7eb',
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#475569' }}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving || delta === 0}
                style={{
                  flex: 1.5,
                  paddingVertical: 12,
                  borderRadius: 8,
                  backgroundColor: delta === 0 ? '#cbd5e1' : '#7c3aed',
                  alignItems: 'center',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>
                    조정 저장
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
