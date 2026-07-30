import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTripStore } from '@/stores/tripStore';
import { safeBack } from '@/utils/backNavigation';
import { EmptyState } from '@/components/EmptyState';
import { SafeScreen } from '@/components/SafeScreen';
import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
import { FieldLabel } from '@/components/ui/FieldLabel';
import { Button } from '@/components/ui/Button';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { fmtDate } from '@/utils/datetime';

// backend-backlog §2 — 외근 제목 수정. 시간 보정(startedAt/endedAt)은 피커 도입 후 후속 사이클.
// 진입은 trips/[id] 의 '수정' CTA (종료된 외근 전용).
const TITLE_MAX = 50;

export default function EditTrip() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const tripId = id ?? '';
  const router = useRouter();

  const trip = useTripStore((s) => (tripId ? s.getById(tripId) : undefined));
  const activeTripId = useTripStore((s) => s.activeTripId);
  const loadDetail = useTripStore((s) => s.loadDetail);
  const update = useTripStore((s) => s.update);
  const remove = useTripStore((s) => s.remove);

  const fetchedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!tripId) return;
    if (fetchedRef.current === tripId) return;
    fetchedRef.current = tripId;
    void loadDetail(tripId);
  }, [tripId, loadDetail]);

  const initialTitle = trip?.title ?? '';
  const initialRef = useRef(initialTitle);
  const [title, setTitle] = useState(initialTitle);
  // 스토어 hydrate 가 늦게 끝나 trip 이 뒤늦게 들어오는 경우 — 사용자가 손대기 전이면 초기값 동기화.
  const touchedRef = useRef(false);
  useEffect(() => {
    if (touchedRef.current) return;
    initialRef.current = trip?.title ?? '';
    setTitle(trip?.title ?? '');
  }, [trip?.title]);

  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!trip) {
    return (
      <SafeScreen>
        <View style={styles.center}>
          <EmptyState
            icon="search-outline"
            title="외근을 찾을 수 없습니다"
            action={
              <Button
                onPress={() => router.replace('/(tabs)/trips' as never)}
                variant="secondary"
                leftIcon="arrow-back"
              >
                외근 목록으로
              </Button>
            }
          />
        </View>
      </SafeScreen>
    );
  }

  const titleTrim = title.trim();
  const hasChanges = titleTrim !== initialRef.current.trim();

  const handleSave = async () => {
    if (!hasChanges || submitting || deleting) return;
    if (titleTrim.length === 0) {
      setError('제목을 입력해주세요');
      return;
    }
    if (titleTrim.length > TITLE_MAX) {
      setError(`제목은 ${TITLE_MAX}자 이하여야 합니다`);
      return;
    }
    // 진행 중 외근은 수정 진입 자체가 막혀 있어야 하지만, race 방어로 한 번 더 차단.
    if (activeTripId === tripId) {
      setError('진행 중인 외근은 종료 후 수정할 수 있습니다');
      return;
    }
    setError(null);
    setSubmitting(true);
    const r = await update(tripId, { title: titleTrim });
    setSubmitting(false);
    if (r.ok) {
      safeBack(router);
    } else {
      setError(r.error);
    }
  };

  // 삭제(파괴적)는 화면 하단 '위험 구역'에 배치 — 상세 제목행의 빨강 휴지통에서 이동.
  const handleDelete = () => {
    if (deleting) return;
    const label = trip.title || `${fmtDate(trip.startedAt)} 외근`;
    const runDelete = async (force: boolean) => {
      setDeleting(true);
      const r = await remove(tripId, force);
      setDeleting(false);
      if (r.ok) {
        router.replace('/(tabs)/trips' as never);
        return;
      }
      if ('needsConfirm' in r) {
        // 방문·보고서 연결 → 강제 삭제 재확인(백엔드 ?force=true). 백엔드 원문은 노출 안 함.
        Alert.alert(
          '연결된 기록이 있어요',
          '이 외근에는 방문·보고서 기록이 연결돼 있습니다.\n방문·보고서까지 모두 삭제하고 외근을 지울까요?',
          [
            { text: '취소', style: 'cancel' },
            { text: '강제 삭제', style: 'destructive', onPress: () => void runDelete(true) },
          ],
        );
        return;
      }
      Alert.alert('삭제 실패', r.error);
    };
    Alert.alert(
      '외근 삭제',
      `${label} 을(를) 삭제할까요?\n방문 기록도 함께 사라지며 되돌릴 수 없습니다.`,
      [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => void runDelete(false) },
      ],
    );
  };

  const handleCancel = () => {
    if (!hasChanges) {
      safeBack(router);
      return;
    }
    Alert.alert('수정 취소', '저장하지 않은 변경 사항이 있습니다. 계속 취소할까요?', [
      { text: '계속 작성', style: 'cancel' },
      { text: '버리고 나가기', style: 'destructive', onPress: () => safeBack(router) },
    ]);
  };

  return (
    <SafeScreen>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text variant="h2" weight="heavy">
            외근 수정
          </Text>
          <Text variant="bodySm" color="textMuted" style={styles.sub}>
            {fmtDate(trip.startedAt)} 시작
          </Text>

          <FieldLabel counter={`${title.length} / ${TITLE_MAX}`}>제목</FieldLabel>
          <Input
            value={title}
            onChangeText={(v) => {
              touchedRef.current = true;
              setTitle(v);
              if (error) setError(null);
            }}
            editable={!submitting && !deleting}
            maxLength={TITLE_MAX}
            placeholder="예: 오전 순회"
            returnKeyType="done"
          />

          {error ? (
            <Text variant="bodySm" color="danger" style={styles.error}>
              {error}
            </Text>
          ) : null}

          <Button
            onPress={handleSave}
            disabled={!hasChanges || deleting}
            loading={submitting}
            size="lg"
            fullWidth
            leftIcon="save"
            style={styles.submit}
          >
            {hasChanges ? '저장' : '변경 사항 없음'}
          </Button>

          <Button onPress={handleCancel} variant="ghost" size="sm" fullWidth disabled={deleting}>
            취소
          </Button>

          {/* 위험 구역 — 파괴적 삭제는 저장 동선과 분리, 낮은 비중(ghost)으로 하단 배치. */}
          <View style={styles.dangerZone}>
            <Button
              onPress={handleDelete}
              variant="dangerGhost"
              size="sm"
              fullWidth
              leftIcon="trash"
              loading={deleting}
              style={styles.deleteBtn}
            >
              외근 삭제
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl * 2 },
  center: { flex: 1, justifyContent: 'center' },
  sub: { marginTop: spacing.xs },
  error: { marginTop: spacing.md },
  submit: { marginTop: spacing.xl },
  dangerZone: {
    marginTop: spacing.xxl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
  },
  deleteBtn: { marginTop: spacing.xs },
});
