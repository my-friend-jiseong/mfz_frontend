import { useEffect, useMemo, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useFieldStore } from '@/stores/fieldStore';
import { safeBack } from '@/utils/backNavigation';
import { useVisitStore } from '@/stores/visitStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout, sheetScrollableStyle } from '@/components/MapSheetLayout';
import { openKakaoRouteTo } from '@/utils/kakaoMap';
import { PhotoGrid } from '@/components/AttachmentPreview';
import { OverflowButton } from '@/components/ui/NavHeader';
import { showActionSheet } from '@/components/ui/ActionSheet';
import { confirm, notice } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { useTripStore } from '@/stores/tripStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { Card } from '@/components/ui/Card';
import { Badge, BADGE_SHAPE_GLYPH } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FIELD_STATUS_BADGE, VISIT_STATUS_BADGE } from '@/theme/statusBadge';
import { fmtDateTime } from '@/utils/datetime';
import { GroupLabel } from '@/components/ui/GroupLabel';
import { fieldSubtitle, fieldTitle } from '@/utils/fieldFacets';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { opacity } from '@/theme/motion';
import { withAlpha } from '@/theme/withAlpha';
import {
  FIELD_STATUS_VALUES,
  VISIT_STATUS_LABEL,
  FIELD_STATUS_LABEL,
  type Visit,
} from '@/types/entities';

// 현장 상세 (명세 v2 §5). 메모·사진은 **조회 전용** — 쓰는 곳은 체크인과 방문 수정뿐이다(§1.3).
// 사진은 현장 직접 사진 + 이 현장 방문들의 사진을 최신순으로 합친다(방문 사진은 현장 상세 응답에
// 없어 방문마다 따로 받는다 — 백로그 §35). 수정·삭제는 헤더 `···` 시트로.

export default function FieldDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const fieldId = id ?? '';

  const allFields = useFieldStore((s) => s.fields);
  const directAttachmentsMap = useFieldStore((s) => s.directAttachments);
  const loadFieldDetail = useFieldStore((s) => s.loadDetail);
  const removeField = useFieldStore((s) => s.remove);
  const patchFieldStatus = useFieldStore((s) => s.patchStatus);
  const allVisits = useVisitStore((s) => s.visits);
  const photosByVisit = useVisitStore((s) => s.photosByVisit);
  const loadVisitPhotos = useVisitStore((s) => s.loadPhotos);
  const activeTripId = useTripStore((s) => s.activeTripId);

  // 진입 시 detail 페치 (directAttachments 채우기)
  useEffect(() => {
    if (fieldId) void loadFieldDetail(fieldId);
  }, [fieldId, loadFieldDetail]);

  const field = useMemo(
    () => allFields.find((f) => f.id === fieldId),
    [allFields, fieldId],
  );
  const directAttachments = directAttachmentsMap[fieldId] ?? [];
  // 최신순 (FE-SITE-05).
  const directTextMemos = directAttachments
    .filter((a) => a.type === 'text')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const visits = useMemo(
    () =>
      allVisits
        .filter((v) => v.fieldId === fieldId)
        .sort((a, b) => b.visitedAt.localeCompare(a.visitedAt)),
    [allVisits, fieldId],
  );

  // 상태 변경 중복 호출 가드. ★ early return **위**에 있어야 한다 —
  // 아래 `if (!field)` 뒤에 두면 현장이 아직 스토어에 없는 첫 렌더에선 훅이 6개,
  // loadDetail 이 채운 뒤 렌더에선 7개가 되어 "Rendered more hooks than during the
  // previous render" 로 화면이 죽는다. URL 직접 진입·콜드스타트에서 재현됐다
  // (목록에서 눌러 들어가면 이미 하이드레이트돼 있어 안 터진다).
  const statusBusyRef = useRef(false);

  // 방문 사진 — 방문마다 한 번. 현장 사진과 합쳐 최신순으로 보여준다.
  const fetchedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const v of visits) {
      if (fetchedRef.current.has(v.id)) continue;
      fetchedRef.current.add(v.id);
      // 실패하면 표시를 지워 다음 렌더(방문 목록 갱신 등)에서 다시 시도한다.
      void loadVisitPhotos(v.tripId, v.id).then((ok) => {
        if (!ok) fetchedRef.current.delete(v.id);
      });
    }
  }, [visits, loadVisitPhotos]);

  const photos = useMemo(() => {
    const all: { id: string; fileUrl: string; createdAt: string }[] = [];
    for (const a of directAttachments) {
      if (a.type === 'photo' && a.fileUrl) all.push({ id: a.id, fileUrl: a.fileUrl, createdAt: a.createdAt });
    }
    for (const v of visits) {
      for (const ph of photosByVisit[v.id] ?? []) {
        all.push({ id: ph.attachmentId, fileUrl: ph.fileUrl, createdAt: ph.createdAt });
      }
    }
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [directAttachments, visits, photosByVisit]);

  if (!field) {
    return (
      <MapSheetLayout title="현장 상세" onBack={() => safeBack(router)}>
        <EmptyState icon="search-outline" title="현장을 찾을 수 없습니다" />
      </MapSheetLayout>
    );
  }

  // 상태 변경 — chip tap 시 3개 상태 중 선택. patchStatus 즉시 호출.
  const applyStatus = async (s: typeof field.status) => {
    if (statusBusyRef.current) return;
    statusBusyRef.current = true;
    try {
      const r = await patchFieldStatus(field.id, s);
      if (!r.ok) Alert.alert('상태 변경 실패', r.error);
    } finally {
      statusBusyRef.current = false;
    }
  };
  // 상태 변경 — 액션 시트에서 고른다. '조치 완료' 는 종결 상태라 한 번 더 확인.
  const handleStatusTap = () => {
    if (statusBusyRef.current) return;
    const others = FIELD_STATUS_VALUES.filter((s) => s !== field.status);
    showActionSheet(
      others.map((s) => ({
        label: FIELD_STATUS_LABEL[s],
        onPress: async () => {
          if (s === 'done') {
            const ok = await confirm({
              title: '조치 완료 처리',
              message: '이 현장을 조치 완료로 변경할까요?',
              confirmLabel: '완료',
            });
            if (!ok) return;
          }
          void applyStatus(s);
        },
      })),
      `현재 상태: ${FIELD_STATUS_LABEL[field.status]}`,
    );
  };

  // FE-SITE-06 — 현장 삭제는 이 경로에서만. 진행 중 외근의 목적지면 먼저 막는다.
  const handleDelete = async () => {
    const inActiveTrip =
      activeTripId !== null &&
      useDestinationStore.getState().byTrip(activeTripId).some((d) => d.fieldId === field.id);
    if (inActiveTrip) {
      await notice('삭제할 수 없습니다', '외근 종료 후 삭제할 수 있습니다.');
      return;
    }
    // 서버는 방문 기록이 있는 현장의 삭제를 거부한다(백로그 §40) — 묻고 나서 거절하지 않게 먼저 알린다.
    if (visits.length > 0) {
      await notice('삭제할 수 없습니다', `방문 기록이 ${visits.length}건 있는 현장은 아직 삭제할 수 없습니다.`);
      return;
    }
    const ok = await confirm({
      title: '이 현장을 삭제할까요?',
      message: '되돌릴 수 없습니다.',
      confirmLabel: '삭제',
      destructive: true,
    });
    if (!ok) return;
    const r = await removeField(field.id);
    if (r.ok) {
      toast('현장을 삭제했습니다');
      router.replace('/(tabs)/fields' as never);
    } else if ('needsConfirm' in r) {
      // 서버는 방문 기록이 있는 현장의 삭제를 거부한다(백로그 §40 — 명세 FE-SITE-09 와 충돌).
      await notice('삭제할 수 없습니다', '방문 기록이 있는 현장은 아직 삭제할 수 없습니다.');
    } else {
      Alert.alert('삭제 실패', r.error);
    }
  };

  const openMore = () =>
    showActionSheet([
      {
        label: '현장 정보 수정',
        icon: 'create-outline',
        onPress: () => router.push(`/(tabs)/fields/${field.id}/edit` as never),
      },
      { label: '현장 삭제', icon: 'trash-outline', tone: 'danger', onPress: () => void handleDelete() },
    ]);

  // 목록 카드와 동일한 규칙 — fieldTitle(name || address) + fieldSubtitle(제목이 안 보여준 나머지).
  const title = fieldTitle(field);
  const subtitle = fieldSubtitle(field, title);

  const statusFg = colors.fieldStatus[field.status];

  const renderVisit = ({ item }: { item: Visit }) => {
    const badge = VISIT_STATUS_BADGE[item.status];
    return (
      <Card
        onPress={() =>
          router.push(
            `/(tabs)/trips/visit?tripId=${item.tripId}&visitId=${item.id}` as never,
          )
        }
        padding="md"
        style={styles.visitCard}
      >
        <View style={styles.visitHead}>
          <Text variant="bodySm">{fmtDateTime(item.visitedAt)}</Text>
          <Badge label={VISIT_STATUS_LABEL[item.status]} tone={badge.tone} shape={badge.shape} />
        </View>
        {item.status === 'other' && item.reason ? (
          <Text variant="caption" color="textMuted" numberOfLines={2} style={styles.visitReason}>
            사유: {item.reason}
          </Text>
        ) : null}
      </Card>
    );
  };

  const headerElement = (
    <View style={styles.summary}>
      <Pressable
        onPress={handleStatusTap}
        accessibilityRole="button"
        accessibilityLabel={`현재 상태: ${FIELD_STATUS_LABEL[field.status]}. 변경하려면 누르세요`}
        style={({ pressed }) => [
          styles.statusTap,
          { backgroundColor: withAlpha(statusFg, 0.13), borderColor: statusFg },
          pressed && { opacity: opacity.pressed },
        ]}
      >
        {/* 형상 — 목록 카드와 같은 단일 출처를 거친다(6절). 이 칩은 색+라벨뿐이라
            같은 상태가 목록에선 ●, 상세에선 형상 없이 보이고 있었다(강령 2). */}
        <Text variant="bodySm" style={{ color: statusFg }}>
          {BADGE_SHAPE_GLYPH[FIELD_STATUS_BADGE[field.status].shape]}
        </Text>
        {/* 이 화면의 focal 은 상태다. 그런데 caption(12)이라 화면에서 가장 작은 축이었고
            제목(h3 18)보다 작았다 — 가장 중요한 것이 가장 작으면 위계가 없다. bodySm 로 올린다.
            '변경' 은 보조라 caption 을 유지해 한 칩 안에서도 위계가 남게 한다. */}
        <Text variant="bodySm" weight="bold" style={{ color: statusFg }}>
          {FIELD_STATUS_LABEL[field.status]}
        </Text>
        <View style={styles.statusDivider} />
        <Ionicons name="swap-horizontal" size={12} color={statusFg} />
        <Text variant="caption" weight="semibold" style={{ color: statusFg }}>
          변경
        </Text>
      </Pressable>

      {/* 제목은 목록 카드와 같은 셀렉터를 쓴다 — 이름을 붙였는데 상세에서 안 보이면
          "저장이 안 됐나" 로 읽힌다(2026-07-30: 이름 입력을 넣고 실제로 그 상태였다).
          제목이 이름이면 주소는 그 아래로, 제목이 곧 주소면 한 번만 보여준다. */}
      <Text variant="h3" style={styles.addr}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="body" color="textMuted" style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
      {field.projectName ? (
        <View style={styles.metaRow}>
          <Ionicons name="folder-outline" size={14} color={colors.textMuted} />
          <Text variant="bodySm" color="textMuted">
            {field.projectName}
          </Text>
        </View>
      ) : null}
      {field.categories && field.categories.length > 0 ? (
        <View style={styles.metaRow}>
          <Ionicons name="pricetags-outline" size={14} color={colors.textMuted} />
          <Text variant="bodySm" color="textMuted">
            {field.categories.join(', ')}
          </Text>
        </View>
      ) : null}

      {/* 길찾기만 본문에 — 수정·삭제는 헤더 `···` 로 옮겼다(명세 FE-SITE-06). */}
      <Button
        onPress={() => void openKakaoRouteTo(field.address, field.latitude, field.longitude)}
        variant="secondary"
        leftIcon="navigate"
        fullWidth
        style={styles.navBtn}
      >
        길찾기
      </Button>

      <GroupLabel>메모 ({directTextMemos.length})</GroupLabel>
      {directTextMemos.length > 0 ? (
        <View style={styles.memoList}>
          {directTextMemos.map((m) => (
            <Card key={m.id} padding="md">
              <Text variant="bodySm">{m.text}</Text>
              <Text variant="caption" color="textMuted" style={styles.memoMeta} numeric>
                {fmtDateTime(m.createdAt)}
              </Text>
            </Card>
          ))}
        </View>
      ) : (
        <Text variant="bodySm" color="textSubtle" style={styles.empty}>
          체크인에서 남긴 메모가 여기에 보입니다
        </Text>
      )}

      <GroupLabel>사진 ({photos.length})</GroupLabel>
      {photos.length > 0 ? (
        <PhotoGrid photos={photos} />
      ) : (
        <Text variant="bodySm" color="textSubtle" style={styles.empty}>
          체크인에서 찍은 사진이 여기에 보입니다
        </Text>
      )}

      <GroupLabel>방문 이력 ({visits.length})</GroupLabel>
    </View>
  );

  return (
    <MapSheetLayout
      title="현장 상세"
      onBack={() => safeBack(router)}
      initialIndex={2}
      headerRight={<OverflowButton onPress={openMore} label="현장 상세 더보기" />}
    >
      <BottomSheetFlatList
        data={visits}
        keyExtractor={(v) => String(v.id)}
        renderItem={renderVisit}
        ListHeaderComponent={headerElement}
        style={sheetScrollableStyle}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState icon="footsteps-outline" title="방문 이력이 없습니다" />
        }
      />
    </MapSheetLayout>
  );
}

const styles = StyleSheet.create({
  // 간격을 gap 과 marginTop 으로 이중 관리하고 있었다 — gap(xs) 위에 각 요소가 marginTop 을
  // 덧칠해 실제 간격이 4·6·12·16·20 처럼 tier 밖 값이 됐다(2.1절). gap 을 걷고 요소마다
  // '무엇과 무엇 사이인가' 로 토큰을 준다: 정체성 블록 안은 xs, 블록 사이는 md.
  summary: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  statusTap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  statusDivider: {
    // 1px hairline — 높이는 caption 글자 높이에 맞춘 값이다. 좌우 여백은 칩의 gap(xs)이 준다.
    width: 1,
    height: 10,
    backgroundColor: colors.borderMuted,
  },
  addr: { marginTop: spacing.md },
  subtitle: { marginTop: spacing.xs },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  navBtn: { marginTop: spacing.md },
  empty: { marginTop: spacing.xs },
  memoList: { marginTop: spacing.sm, gap: spacing.xs },
  memoMeta: { marginTop: spacing.xs },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  visitCard: { marginBottom: spacing.xs },
  visitHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  visitReason: { marginTop: spacing.xs },
});
