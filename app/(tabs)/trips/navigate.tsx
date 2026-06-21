import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/Button';
import { KakaoMapWebView, type KakaoMapMarker } from '@/components/KakaoMapWebView';
import { openKakaoRouteTo } from '@/utils/kakaoMap';
import { requestUserLocation, type LatLng } from '@/utils/geolocation';
import { safeBack } from '@/utils/backNavigation';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { opacity } from '@/theme/motion';
import { SafeScreen } from '@/components/SafeScreen';

// 인앱 카카오 길안내 — 목적지를 카카오 JS SDK 인앱 지도(KakaoMapWebView)로 렌더한다.
// 과거엔 `https://map.kakao.com/link/to/...` 를 WebView 에 직접 로드했으나, 그 URL 은
// 렌더용 지도가 아니라 카카오맵 앱을 띄우는 딥링크 브리지라 실기기에서 kakaomap:// 스킴으로
// 리다이렉트 → WebView unknown-scheme(onError) → '지도 로드 실패' 로 깨졌다. 검증된 JS SDK
// 임베드(히트맵·현장 탭과 동일 인프라)로 목적지+내 위치를 표시하고, 실제 턴바이턴은 하단
// '카카오맵으로 열기' CTA(openKakaoRouteTo) 로 위임한다.
export default function TripNavigate() {
  const router = useRouter();
  const params = useLocalSearchParams<{ name?: string; lat?: string; lng?: string }>();
  const lat = Number(params.lat);
  const lng = Number(params.lng);
  // useLocalSearchParams 는 동일 키 중복 시 string[] 도 돌려줌 — 첫 토큰 우선.
  const rawName = params.name;
  const name = (Array.isArray(rawName) ? rawName[0] : rawName) ?? '목적지';

  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

  // 내 위치(파란 점) — 권한 거부·실패는 silent(null), 지도는 목적지 중심으로 동작.
  const [myLocation, setMyLocation] = useState<LatLng | null>(null);
  useEffect(() => {
    void requestUserLocation().then((loc) => {
      if (loc) setMyLocation(loc);
    });
  }, []);

  const markers = useMemo<KakaoMapMarker[]>(() => {
    if (!hasCoords) return [];
    // 목적지 단일 마커 — 도착 의미라 brand 색 + check 형상으로 강조.
    return [{ id: 'dest', lat, lng, label: name, color: colors.primary, shape: 'check' }];
  }, [hasCoords, lat, lng, name]);

  if (!hasCoords) {
    return (
      <SafeScreen>
        <EmptyState
          icon="navigate-outline"
          title="길안내 좌표가 없습니다"
          description="외근 화면에서 다시 시도해주세요"
          action={
            <Button onPress={() => safeBack(router)} variant="secondary" leftIcon="arrow-back">
              돌아가기
            </Button>
          }
        />
      </SafeScreen>
    );
  }

  return (
    <SafeScreen>
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={() => safeBack(router)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="뒤로 가기"
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text variant="body" weight="bold" numberOfLines={1} style={styles.title}>
          {name}
        </Text>
      </View>
      <View style={styles.web}>
        <KakaoMapWebView
          markers={markers}
          center={{ lat, lng }}
          myLocation={myLocation}
        />
      </View>
      {/* 실제 턴바이턴은 카카오맵 앱으로 위임 — 하단 칩 CTA 상시 노출. */}
      <Pressable
        onPress={() => void openKakaoRouteTo(name, lat, lng)}
        accessibilityRole="button"
        accessibilityLabel="카카오맵 앱으로 길안내 열기"
        style={({ pressed }) => [styles.fallbackChip, pressed && { opacity: opacity.pressed }]}
      >
        <Ionicons name="open-outline" size={14} color={colors.text} />
        <Text variant="caption" weight="bold">
          카카오맵으로 길안내
        </Text>
      </Pressable>
    </View>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  backBtn: { padding: 2 },
  title: { flex: 1 },
  web: { flex: 1 },
  fallbackChip: {
    position: 'absolute',
    bottom: spacing.lg,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
