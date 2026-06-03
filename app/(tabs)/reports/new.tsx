import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useReportStore } from '@/stores/reportStore';
import { useTripStore } from '@/stores/tripStore';
import { useAuthStore } from '@/stores/authStore';
import { useVisitStore } from '@/stores/visitStore';
import { useFieldStore } from '@/stores/fieldStore';
import { safeBack } from '@/utils/backNavigation';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { KakaoMapWebView, fieldsToMarkers } from '@/components/KakaoMapWebView';
import type { Field } from '@/types/entities';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { opacity } from '@/theme/motion';
import { fmtDate, fmtTime } from '@/utils/datetime';
import { SafeScreen } from '@/components/SafeScreen';

// 새 양식(2026-05-31 결정) — 본문/AI/보고서 레벨 사진 제거.
// 제목 + 외근 선택 → 그 외근의 visits 마다 빈 FieldReport 자동 스캐폴드
// → 마법사(2026-06-04 결정): 스캐폴드된 현장 보고를 차례로 채우는 단계로 진입.
//   스캐폴드가 없으면(방문 0건·전체 실패) 기존처럼 상세로.

export default function ComposeReport() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string }>();

  const createWithVisitScaffold = useReportStore((s) => s.createWithVisitScaffold);
  const allTrips = useTripStore((s) => s.trips);
  const loadTripDetail = useTripStore((s) => s.loadDetail);
  const userId = useAuthStore((s) => s.user?.id);
  const allVisits = useVisitStore((s) => s.visits);
  const allFields = useFieldStore((s) => s.fields);
  const loadFieldDetail = useFieldStore((s) => s.loadDetail);

  const [tripId, setTripId] = useState<string | null>(params.tripId ?? null);
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [tripPickerOpen, setTripPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const myTrips = useMemo(() => {
    if (!userId) return [];
    return allTrips
      .filter((t) => t.workerId === userId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }, [allTrips, userId]);

  // 무결성 검증 (G4/F6) — params.tripId 가 본인 외근이 아니면 reset.
  // myTrips 가 비어있을 동안엔 보류 (refreshList race) — 한 번이라도 로드된 뒤 검증.
  useEffect(() => {
    if (!params.tripId) return;
    if (myTrips.length === 0) return;
    if (!myTrips.some((t) => t.id === params.tripId)) {
      setTripId(null);
      setError('전달된 외근이 본인 소유가 아니어서 선택을 해제했습니다. 외근을 직접 선택해주세요.');
    }
  }, [params.tripId, myTrips]);

  // tripHydrating 은 tripStore.detailStatus 가 단일 진실 출처 (G10/G3) — local useState 제거.
  // stale finally 가 새 fetch in-flight 인 채 false 로 flip 하던 race 가 store 측 set 으로 해소.
  const tripHydrating = useTripStore(
    (s) => (tripId ? s.detailStatus[tripId] === 'loading' : false),
  );

  // tripId 가 본인 소유 외근인지 — 안정적 boolean. myTrips 배열 참조가 아니라 이 값에 의존해야
  // 아래 detail 동기화 effect 가 무한 루프에 빠지지 않는다 (loadTripDetail → trips 새 배열 →
  // myTrips 새 참조 → effect 재실행 → … 304 가 끝없이 도는 회로). 멤버십이 그대로면 true 유지.
  const tripIsOwned = useMemo(
    () => (tripId ? myTrips.some((t) => t.id === tripId) : false),
    [tripId, myTrips],
  );

  // 선택된 외근의 detail (visits) 동기화 — 본인 소유 검증 통과해야 호출 (G4).
  // 본인 소유 아닌 foreign tripId 가 백엔드로 leak 되는 회로 차단. tripId/소유여부가 바뀔 때만 1회.
  useEffect(() => {
    if (!tripId || !tripIsOwned) return;
    void loadTripDetail(tripId);
  }, [tripId, tripIsOwned, loadTripDetail]);

  const selectedTrip = useMemo(
    () => (tripId ? myTrips.find((t) => t.id === tripId) ?? null : null),
    [myTrips, tripId],
  );

  // 선택 외근의 visits — 자동 스캐폴드 대상.
  const tripVisits = useMemo(() => {
    if (!tripId) return [];
    return allVisits
      .filter((v) => v.tripId === tripId)
      .sort((a, b) => a.visitedAt.localeCompare(b.visitedAt));
  }, [tripId, allVisits]);

  const scaffoldFieldIds = tripVisits.map((v) => v.fieldId).filter(Boolean);

  // 위치도 — 선택 외근의 방문 현장 객체(좌표 포함)를 fieldStore 에서 lookup (중복 제거).
  const previewFields = useMemo(() => {
    const byId = new Map(allFields.map((f) => [f.id, f]));
    const seen = new Set<string>();
    const out: Field[] = [];
    for (const v of tripVisits) {
      const fid = v.fieldId;
      if (!fid || seen.has(fid)) continue;
      const f = byId.get(fid);
      if (f) {
        out.push(f);
        seen.add(fid);
      }
    }
    return out;
  }, [allFields, tripVisits]);

  const previewMarkers = useMemo(
    () => fieldsToMarkers(previewFields),
    [previewFields],
  );

  // 위치도용 현장 좌표 확보 — visits 의 fieldId 중 fieldStore 에 아직 없는 것만 detail 로드.
  // tripVisits/loadFieldDetail 에만 의존하고 allFields 엔 의존하지 않음 → loadFieldDetail 이
  // fields 를 갱신해도 재발화하지 않아 무한 루프 없음(getById 가드가 이미 받은 건 skip).
  useEffect(() => {
    for (const v of tripVisits) {
      const fid = v.fieldId;
      if (!fid) continue;
      if (useFieldStore.getState().getById(fid)) continue;
      void loadFieldDetail(fid);
    }
  }, [tripVisits, loadFieldDetail]);

  // submit 가드 — 외근 없는 사용자 동선 안내 (F5).
  const noTripsAtAll = myTrips.length === 0;

  const handleSubmit = async () => {
    setError(null);
    const t = title.trim();
    if (t.length < 1 || t.length > 100) {
      setError('제목은 1~100자로 입력해주세요');
      return;
    }
    if (!tripId) {
      setError('외근을 선택해주세요');
      return;
    }
    if (tripHydrating) {
      // race 차단 (F3) — disabled prop 이 막지만 한 번 더 명시.
      setError('외근 정보를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    setSubmitting(true);
    const r = await createWithVisitScaffold({ title: t, tripId }, scaffoldFieldIds);
    setSubmitting(false);
    if (!r.ok) {
      Alert.alert('보고서 생성 실패', r.error);
      return;
    }
    // 부분 실패 안내 (F4/G8) — failedFieldIds 로 현장명까지 노출.
    if (r.failedFieldIds.length > 0) {
      const getField = useFieldStore.getState().getById;
      const names = r.failedFieldIds
        .slice(0, 5)
        .map((fid) => getField(fid)?.address ?? `현장 ${fid.slice(0, 6)}`)
        .join('\n· ');
      const overflow = r.failedFieldIds.length > 5
        ? `\n· 외 ${r.failedFieldIds.length - 5}건`
        : '';
      const msg = `현장 보고 ${r.attemptedFieldIds.length}건 중 ${r.failedFieldIds.length}건 자동 생성에 실패했습니다.\n\n· ${names}${overflow}\n\n상세 화면에서 직접 추가할 수 있어요.`;
      Alert.alert('일부 현장 보고 누락', msg);
    }
    // 마법사 진입 — 스토어가 스캐폴드 후 상세 순서 기준 첫 현장 보고 id 를 돌려준다.
    // null 이면(방문 0건·loadDetail 실패) 기존처럼 상세로. 에디터 화면이 hydrated
    // detailCache 에 의존하므로 캐시 없이 마법사 진입은 불가 — 폴백이 올바른 동작.
    if (r.firstFieldReportId) {
      router.replace(
        `/(tabs)/reports/${r.report.id}/field-report?frId=${r.firstFieldReportId}&wizard=1` as never,
      );
    } else {
      router.replace(`/(tabs)/reports/${r.report.id}` as never);
    }
  };

  return (
    <SafeScreen>
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => safeBack(router)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="뒤로 가기"
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: opacity.pressed }]}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Text variant="h3" weight="heavy">
            보고서 작성
          </Text>
        </View>

        <Input
          label="제목"
          value={title}
          onChangeText={setTitle}
          placeholder="예: 2026-05-31 사하구 가로수 보수"
          maxLength={100}
          containerStyle={styles.titleField}
        />

        <Text variant="bodySm" weight="bold" color="textMuted" style={styles.label}>
          연결 외근
        </Text>
        {selectedTrip ? (
          <Card padding="md" style={styles.tripCard}>
            <View style={styles.tripCardHead}>
              <Ionicons name="briefcase" size={16} color={colors.primary} />
              <Text variant="body" weight="semibold" style={styles.tripCardTitle}>
                {selectedTrip.title || `${fmtDate(selectedTrip.startedAt)} 외근`}
              </Text>
            </View>
            <Text variant="caption" color="textMuted" style={styles.tripCardMeta}>
              {fmtDate(selectedTrip.startedAt)} {fmtTime(selectedTrip.startedAt)}
              {selectedTrip.endedAt ? ` ~ ${fmtTime(selectedTrip.endedAt)}` : ' · 진행 중'}
              {' · 방문 '}{tripVisits.length}건
            </Text>
            {/* params.tripId 가 있으면 외근이 외부에서 지정된 동선 — picker 잠금. 아니면 변경 가능. */}
            {!params.tripId ? (
              <Button
                onPress={() => setTripPickerOpen(true)}
                variant="ghost"
                size="sm"
                leftIcon="swap-horizontal"
                style={styles.changeBtn}
              >
                외근 변경
              </Button>
            ) : null}
          </Card>
        ) : (
          <Button
            onPress={() => setTripPickerOpen(true)}
            variant="secondary"
            fullWidth
            leftIcon="briefcase-outline"
            style={styles.pickTripBtn}
          >
            외근 선택
          </Button>
        )}

        {selectedTrip && tripHydrating ? (
          <Text variant="caption" color="textMuted" style={styles.scaffoldHint}>
            외근 정보를 불러오는 중…
          </Text>
        ) : selectedTrip && scaffoldFieldIds.length > 0 ? (
          <Text variant="caption" color="textMuted" style={styles.scaffoldHint}>
            보고서를 만들면 방문한 현장 {scaffoldFieldIds.length}곳의 현장 보고가
            자동으로 만들어지고, 이어서 현장별 사진·캡션을 차례로 채우는 단계로
            넘어갑니다. 건너뛴 현장은 상세 화면에서 나중에 채울 수 있어요.
          </Text>
        ) : selectedTrip ? (
          <Text variant="caption" color="textMuted" style={styles.scaffoldHint}>
            이 외근은 방문 기록이 없어 현장 보고가 자동 생성되지 않습니다.
            보고서 생성 후 상세 화면에서 직접 추가할 수 있어요.
          </Text>
        ) : null}

        {/* 위치도 — 연결 외근의 방문 현장 전체를 한 화면에 담는 미리보기 지도 (fitToMarkers).
            좌표가 비동기로 도착하면 마커가 채워지며 자동 재프레이밍. */}
        {selectedTrip && previewMarkers.length > 0 ? (
          <>
            <Text variant="bodySm" weight="bold" color="textMuted" style={styles.label}>
              위치도 — 현장 {previewMarkers.length}곳
            </Text>
            <View style={styles.previewMap}>
              <KakaoMapWebView markers={previewMarkers} fitToMarkers />
            </View>
          </>
        ) : null}

        {/* 외근 없는 사용자 — 보고서 생성 자체가 불가하므로 외근부터 시작하도록 안내 (F5) */}
        {noTripsAtAll ? (
          <Card padding="md" style={styles.noTripsCard}>
            <Text variant="bodySm" weight="bold">
              아직 작성된 외근이 없어요
            </Text>
            <Text variant="caption" color="textMuted" style={styles.noTripsBody}>
              보고서는 외근 단위로 만들어집니다. 먼저 외근을 시작하고 현장을 방문하면
              그 외근에 대한 보고서를 작성할 수 있어요.
            </Text>
            <Button
              onPress={() => router.replace('/(tabs)/trips/new/select' as never)}
              variant="secondary"
              size="sm"
              leftIcon="play-circle"
              style={styles.noTripsCta}
            >
              외근 시작
            </Button>
          </Card>
        ) : null}

        {error ? (
          <Text variant="bodySm" color="danger" style={styles.error}>
            {error}
          </Text>
        ) : null}

        <Button
          onPress={handleSubmit}
          disabled={
            !tripId || !title.trim() || submitting || tripHydrating || noTripsAtAll
          }
          loading={submitting || tripHydrating}
          size="lg"
          fullWidth
          leftIcon="document-text"
          style={styles.submitBtn}
        >
          보고서 만들기
        </Button>
      </ScrollView>

      <Modal
        visible={tripPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTripPickerOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setTripPickerOpen(false)}
        >
          <Pressable
            style={styles.modalCard}
            onPress={(e) => e.stopPropagation()}
          >
            <Text variant="body" weight="bold" style={styles.modalTitle}>
              연결할 외근 선택
            </Text>
            <ScrollView style={styles.modalList}>
              {myTrips.map((t) => {
                const visitCount = allVisits.reduce(
                  (n, v) => (v.tripId === t.id ? n + 1 : n),
                  0,
                );
                const active = t.id === tripId;
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => {
                      setTripId(t.id);
                      setTripPickerOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.modalItem,
                      active && styles.modalItemActive,
                      pressed && { opacity: opacity.pressed },
                    ]}
                  >
                    <View style={styles.modalItemHead}>
                      <Ionicons
                        name={active ? 'radio-button-on' : 'radio-button-off'}
                        size={16}
                        color={active ? colors.primary : colors.textMuted}
                      />
                      <Text variant="body" weight="semibold" style={styles.modalItemTitle}>
                        {t.title || `${fmtDate(t.startedAt)} 외근`}
                      </Text>
                    </View>
                    <Text variant="caption" color="textMuted" style={styles.modalItemMeta}>
                      {fmtDate(t.startedAt)} {fmtTime(t.startedAt)}
                      {t.endedAt ? ` ~ ${fmtTime(t.endedAt)}` : ' · 진행 중'}
                      {' · 방문 '}{visitCount}건
                    </Text>
                  </Pressable>
                );
              })}
              {myTrips.length === 0 ? (
                <Text variant="bodySm" color="textMuted" style={styles.modalEmpty}>
                  작성된 외근이 없습니다.
                </Text>
              ) : null}
            </ScrollView>
            <Button
              onPress={() => setTripPickerOpen(false)}
              variant="ghost"
              fullWidth
              style={styles.modalClose}
            >
              닫기
            </Button>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl * 2 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  backBtn: { padding: 2 },
  titleField: { marginBottom: spacing.md },
  label: { marginTop: spacing.md, marginBottom: spacing.xs },
  tripCard: { gap: spacing.xs },
  tripCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  tripCardTitle: { flex: 1 },
  tripCardMeta: { marginTop: 2 },
  changeBtn: { alignSelf: 'flex-start', marginTop: spacing.xs },
  pickTripBtn: { marginTop: spacing.xs },
  scaffoldHint: { marginTop: spacing.md },
  previewMap: {
    height: 300,
    marginTop: spacing.xs,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  noTripsCard: {
    marginTop: spacing.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 0,
    gap: spacing.xs,
  },
  noTripsBody: { marginTop: 2 },
  noTripsCta: { alignSelf: 'flex-start', marginTop: spacing.sm },
  error: { marginTop: spacing.sm },
  submitBtn: { marginTop: spacing.xl },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  modalTitle: { marginBottom: spacing.md },
  modalList: { maxHeight: 420 },
  modalItem: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
    gap: 4,
  },
  modalItemActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  modalItemHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  modalItemTitle: { flex: 1 },
  modalItemMeta: { paddingLeft: 24 },
  modalEmpty: { padding: spacing.lg, textAlign: 'center' },
  modalClose: { marginTop: spacing.sm },
});
