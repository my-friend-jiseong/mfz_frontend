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
import { spacing } from '@/theme/spacing';

// 인앱 카카오 길안내 — 외부 앱(카카오맵/Linking.openURL) 의존 차단.
// `https://map.kakao.com/link/to/...` web URL 은 WebView 안에서 정상 렌더되며
// 카카오 정책상 단일 채널이라 backlog §1 (deep-links 단순화) 와 일관.
export default function TripNavigate() {
  const router = useRouter();
  const params = useLocalSearchParams<{ name?: string; lat?: string; lng?: string }>();
  const lat = Number(params.lat);
  const lng = Number(params.lng);
  const name = params.name ?? '목적지';
  const [error, setError] = useState<string | null>(null);

  const url = useMemo(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`;
  }, [name, lat, lng]);

  if (!url) {
    return (
      <View style={styles.root}>
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
      </View>
    );
  }

  return (
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
        // WebView 실패 시 카카오맵 직링크(앱→웹 폴백) 로 escape hatch.
        onError={() => setError('지도 로드 실패')}
        style={styles.web}
      />
      {error ? (
        <View style={styles.errorOverlay}>
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
      ) : null}
    </View>
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
});
