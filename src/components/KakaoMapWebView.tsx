import { useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildKakaoMapHtml, type MapDisplayMode } from '@/assets/kakaoMapHtml';
import type { Field, FieldStatus } from '@/types/entities';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';
import { groupSameLocationMarkers } from '@/utils/groupSameLocationMarkers';

// KWCAG 1.4.1 — 색 단독 의미 전달 금지. status 별 색 + 형상 + 라벨 3중 인코딩.
export type MarkerShape = 'triangle' | 'circle' | 'check';

const STATUS_TO_SHAPE: Record<FieldStatus, MarkerShape> = {
  pending: 'triangle',
  in_progress: 'circle',
  done: 'check',
};

const STATUS_TO_BADGE: Record<FieldStatus, string> = {
  pending: '대기',
  in_progress: '진행',
  done: '완료',
};

export interface KakaoMapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  color: string;
  shape?: MarkerShape;
  badge?: string;
}

interface Props {
  markers: KakaoMapMarker[];
  center?: { lat: number; lng: number };
  displayMode?: MapDisplayMode;
  showBoundary?: boolean;
  onMarkerPress?: (fieldId: string) => void;
}

const DEFAULT_CENTER = { lat: 35.17, lng: 129.07 }; // 부산 중심

export function KakaoMapWebView({
  markers,
  center,
  displayMode = 'markers',
  showBoundary = false,
  onMarkerPress,
}: Props) {
  const webRef = useRef<WebView>(null);
  const [activeGroup, setActiveGroup] = useState<KakaoMapMarker[] | null>(null);

  const kakaoJsKey = process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '';

  // 동일 좌표 마커는 head 1개로 압축하고 count/groupIds 메타를 첨부 → HTML 측은 단순히 표시만.
  const groupedMarkers = useMemo(() => {
    return groupSameLocationMarkers(markers).map((group) => ({
      ...group[0],
      count: group.length,
      groupIds: group.length > 1 ? group.map((m) => m.id) : undefined,
    }));
  }, [markers]);

  const html = useMemo(
    () =>
      buildKakaoMapHtml({
        kakaoJsKey,
        markers: groupedMarkers,
        center: center ?? DEFAULT_CENTER,
        displayMode,
        showBoundary,
      }),
    [kakaoJsKey, groupedMarkers, center, displayMode, showBoundary],
  );

  return (
    <View style={styles.container}>
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html }}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="compatibility"
        onMessage={(event) => {
          try {
            const msg = JSON.parse(event.nativeEvent.data);
            if (msg.type === 'markerPress' && typeof msg.fieldId === 'string') {
              onMarkerPress?.(msg.fieldId);
            } else if (msg.type === 'markerGroupPress' && Array.isArray(msg.groupIds)) {
              const ids = new Set<string>(msg.groupIds);
              const group = markers.filter((m) => ids.has(m.id));
              if (group.length > 0) setActiveGroup(group);
            }
          } catch {
            // ignore
          }
        }}
        style={styles.web}
      />
      <Modal
        visible={activeGroup !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveGroup(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setActiveGroup(null)}
        >
          <Pressable
            style={styles.modalCard}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle}>
              이 위치의 현장 {activeGroup?.length ?? 0}건
            </Text>
            <ScrollView style={styles.modalList}>
              {activeGroup?.map((m) => (
                <Pressable
                  key={m.id}
                  style={({ pressed }) => [
                    styles.modalItem,
                    pressed && styles.modalItemPressed,
                  ]}
                  onPress={() => {
                    setActiveGroup(null);
                    onMarkerPress?.(m.id);
                  }}
                >
                  {m.badge ? (
                    <View
                      style={[styles.modalItemBadge, { backgroundColor: m.color }]}
                    >
                      <Text style={styles.modalItemBadgeText}>{m.badge}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.modalItemLabel} numberOfLines={1}>
                    {m.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export function fieldsToMarkers(fields: Field[]): KakaoMapMarker[] {
  return fields.map((f) => ({
    id: f.id,
    lat: f.latitude,
    lng: f.longitude,
    label: f.address.split(' ').slice(-1)[0] || '현장',
    color: colors.fieldStatus[f.status],
    shape: STATUS_TO_SHAPE[f.status],
    badge: STATUS_TO_BADGE[f.status],
  }));
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  web: { flex: 1, backgroundColor: 'transparent' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '80%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  modalTitle: {
    fontSize: fontSize.base,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  modalList: { maxHeight: 360 },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  modalItemPressed: { backgroundColor: colors.background },
  modalItemBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  modalItemBadgeText: {
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  modalItemLabel: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
  },
});
