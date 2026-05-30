import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/Button';
import { openKakaoRouteTo } from '@/utils/kakaoMap';
import { safeBack } from '@/utils/backNavigation';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { opacity } from '@/theme/motion';
import { SafeScreen } from '@/components/SafeScreen';

// 인앱 카카오 길안내 — 외부 앱(카카오맵/Linking.openURL) 의존 차단.
// `https://map.kakao.com/link/to/...` web URL 은 WebView 안에서 정상 렌더되며
// 카카오 정책상 단일 채널이라 backlog §1 (deep-links 단순화) 와 일관.
export default function TripNavigate() {
  const router = useRouter();
  const params = useLocalSearchParams<{ name?: string; lat?: string; lng?: string }>();
  const lat = Number(params.lat);
  const lng = Number(params.lng);
  // useLocalSearchParams 는 동일 키 중복 시 string[] 도 돌려줌 — 첫 토큰 우선.
  const rawName = params.name;
  const name = (Array.isArray(rawName) ? rawName[0] : rawName) ?? '목적지';
  const [error, setError] = useState<string | null>(null);

  const url = useMemo(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`;
  }, [name, lat, lng]);

  if (!url) {
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
      <WebView
        source={{ uri: url }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        // onError 는 renderer/network 실패에만 발화 — kakao 가 200 으로 dead page 를 돌려주는
        // case 까지는 못 잡음. onHttpError 도 함께 등록 + 항상 노출되는 'open in app' 폴백 CTA 유지.
        onError={() => setError('지도 로드 실패')}
        onHttpError={(syntheticEvent) => {
          const code = syntheticEvent.nativeEvent.statusCode;
          if (code >= 400) setError(`지도 응답 오류 (HTTP ${code})`);
        }}
        renderError={() => (
          <View style={styles.errorOverlay} pointerEvents="box-none">
            <EmptyState
              icon="warning-outline"
              title="인앱 길안내를 불러올 수 없습니다"
              description="카카오맵 앱 또는 외부 브라우저로 열어보세요"
              action={
                <Button
                  onPress={() => void openKakaoRouteTo(name, lat, lng)}
                  leftIcon="open-outline"
                >
                  카카오맵으로 열기
                </Button>
              }
            />
          </View>
        )}
        style={styles.web}
      />
      {error ? (
        <View style={styles.errorOverlay}>
          <EmptyState
            icon="warning-outline"
            title="인앱 길안내를 불러올 수 없습니다"
            description={error}
            action={
              <Button
                onPress={() => void openKakaoRouteTo(name, lat, lng)}
                leftIcon="open-outline"
              >
                카카오맵으로 열기
              </Button>
            }
          />
        </View>
      ) : (
        // 침묵 실패(kakao 가 200 으로 dead page 를 돌려주는 경우) 대비 — 사용자가 항상 외부로
        // 탈출할 수 있도록 하단 작은 칩 CTA 를 상시 노출. 정상 동선이면 무시 가능.
        <Pressable
          onPress={() => void openKakaoRouteTo(name, lat, lng)}
          accessibilityRole="button"
          accessibilityLabel="카카오맵 앱으로 열기"
          style={({ pressed }) => [styles.fallbackChip, pressed && { opacity: opacity.pressed }]}
        >
          <Ionicons name="open-outline" size={14} color={colors.text} />
          <Text variant="caption" weight="bold">
            카카오맵 앱으로 열기
          </Text>
        </Pressable>
      )}
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
  errorOverlay: {
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
