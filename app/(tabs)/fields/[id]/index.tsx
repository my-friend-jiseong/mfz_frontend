import { useEffect, useMemo, useRef, useState } from 'react';
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
import { promptChoice } from '@/components/WebChoiceModal';
import { pickPhoto, promptPhotoSource } from '@/utils/media';
import { openKakaoRouteTo } from '@/utils/kakaoMap';
import { PhotoGrid } from '@/components/AttachmentPreview';
import { Card } from '@/components/ui/Card';
import { Badge, BADGE_SHAPE_GLYPH } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FIELD_STATUS_BADGE, VISIT_STATUS_BADGE } from '@/theme/statusBadge';
import { fmtDateTime } from '@/utils/datetime';
import { Input } from '@/components/ui/Input';
import { GroupLabel } from '@/components/ui/GroupLabel';
import { fieldSubtitle, fieldTitle } from '@/utils/fieldFacets';
import { colors } from '@/theme/colors';
import { spacing, radius, touchTarget } from '@/theme/spacing';

// 메모 삭제 버튼은 22px — 목록이 두꺼워지지 않게 크기는 두고 터치 영역만 44 로 채운다.
const MEMO_DELETE_HIT_SLOP = (touchTarget.control - 22) / 2;
import { opacity } from '@/theme/motion';
import { withAlpha } from '@/theme/withAlpha';
import {
  FIELD_STATUS_VALUES,
  VISIT_STATUS_LABEL,
  FIELD_STATUS_LABEL,
  type Visit,
} from '@/types/entities';

// ERD v2: 메모·사진은 현장(field) 전용. 음성 메모·방문 첨부 제거.

export default function FieldDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const fieldId = id ?? '';

  const allFields = useFieldStore((s) => s.fields);
  const directAttachmentsMap = useFieldStore((s) => s.directAttachments);
  const loadFieldDetail = useFieldStore((s) => s.loadDetail);
  const addFieldTextMemo = useFieldStore((s) => s.addTextMemo);
  const addFieldPhoto = useFieldStore((s) => s.addPhoto);
  const removeTextMemo = useFieldStore((s) => s.removeTextMemo);
  const removePhoto = useFieldStore((s) => s.removePhoto);
  const patchFieldStatus = useFieldStore((s) => s.patchStatus);
  const allVisits = useVisitStore((s) => s.visits);

  // 진입 시 detail 페치 (directAttachments 채우기)
  useEffect(() => {
    if (fieldId) void loadFieldDetail(fieldId);
  }, [fieldId, loadFieldDetail]);

  const field = useMemo(
    () => allFields.find((f) => f.id === fieldId),
    [allFields, fieldId],
  );
  const directAttachments = directAttachmentsMap[fieldId] ?? [];
  const directTextMemos = directAttachments.filter((a) => a.type === 'text');
  const directPhotos = directAttachments
    .filter((a) => a.type === 'photo' && a.fileUrl)
    .map((a) => ({ id: a.id, fileUrl: a.fileUrl as string }));
  const directPhotoCount = directPhotos.length;

  const [memoInput, setMemoInput] = useState('');
  const [memoSubmitting, setMemoSubmitting] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const handleAddDirectMemo = async () => {
    const t = memoInput.trim();
    if (!t) return;
    setMemoSubmitting(true);
    const r = await addFieldTextMemo(fieldId, t);
    setMemoSubmitting(false);
    if (r.ok) {
      setMemoInput('');
    } else {
      Alert.alert('메모 추가 실패', r.error);
    }
  };

  const uploadDirectPhoto = async (source: 'camera' | 'library') => {
    setPhotoBusy(true);
    try {
      const file = await pickPhoto(source);
      if (!file) return;
      const r = await addFieldPhoto(fieldId, file);
      if (!r.ok) Alert.alert('사진 추가 실패', r.error);
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleAddDirectPhoto = () => {
    if (photoBusy) return;
    promptPhotoSource((src) => void uploadDirectPhoto(src));
  };

  const handleRemoveMemo = (memoId: string) => {
    promptChoice('메모 삭제', '이 메모를 삭제할까요?', [
      { label: '취소', style: 'cancel' as const },
      {
        label: '삭제',
        style: 'destructive' as const,
        onPress: async () => {
          const r = await removeTextMemo(fieldId, memoId);
          if (!r.ok) Alert.alert('메모 삭제 실패', r.error);
        },
      },
    ]);
  };

  const handleRemovePhoto = (photoId: string) => {
    promptChoice('사진 삭제', '이 사진을 삭제할까요?', [
      { label: '취소', style: 'cancel' as const },
      {
        label: '삭제',
        style: 'destructive' as const,
        onPress: async () => {
          const r = await removePhoto(fieldId, photoId);
          if (!r.ok) Alert.alert('사진 삭제 실패', r.error);
        },
      },
    ]);
  };

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
  const handleStatusTap = () => {
    if (statusBusyRef.current) return;
    const others = FIELD_STATUS_VALUES.filter((s) => s !== field.status);
    promptChoice('상태 변경', `현재: ${FIELD_STATUS_LABEL[field.status]}`, [
      ...others.map((s) => ({
        label: FIELD_STATUS_LABEL[s],
        onPress: () => {
          // done 으로 가는 전환만 한 번 더 confirm — '완료' 는 종결 상태라 실수 보호.
          // 자연 진행(pending→in_progress, in_progress→done 의 중간 흐름) 도 done 만
          // 한 번 더 확인. 그 외 전환은 즉시 적용 (promptChoice 자체가 1차 선택).
          if (s === 'done') {
            promptChoice(
              '조치 완료 처리',
              '이 현장을 조치 완료로 변경할까요?',
              [
                { label: '취소', style: 'cancel' as const },
                {
                  label: '완료',
                  style: 'destructive' as const,
                  onPress: () => void applyStatus(s),
                },
              ],
            );
          } else {
            void applyStatus(s);
          }
        },
      })),
      { label: '취소', style: 'cancel' as const },
    ]);
  };

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

      {/* 삭제는 여기 두지 않는다 — 되돌릴 수 없는 동작은 '수정' 안의 위험 구역 하나로 모은다.
          외근은 이미 같은 이동을 했다(trips/[id]/edit 주석: "상세 제목행의 빨강 휴지통에서 이동").
          차단 정책(방문 기록 있으면 거부)도 그쪽에 같은 내용으로 있어 경로가 중복이었다.

          길찾기·수정은 동급 액션이라 한 줄 2분할 — CurrentDestCard 가 같은 이유로 이미 쓰는
          배치다("이동 중 가장 자주 누르는 길찾기가 가장 작게 눌려 있던 셈"). 이 화면도 같은
          역전이 있었다: 현장 동선의 행동(길찾기)이 size="sm" 작은 버튼이고 관리 행동(수정)이
          전폭이라, 큰 쪽이 덜 쓰는 동작이었다. 순서는 실사용대로 찾아간다 → 고친다. */}
      <View style={styles.actionRow}>
        <Button
          onPress={() =>
            void openKakaoRouteTo(field.address, field.latitude, field.longitude)
          }
          variant="secondary"
          leftIcon="navigate"
          style={styles.actionBtn}
        >
          길찾기
        </Button>
        <Button
          onPress={() => router.push(`/(tabs)/fields/${field.id}/edit` as never)}
          variant="secondary"
          leftIcon="create-outline"
          style={styles.actionBtn}
        >
          수정
        </Button>
      </View>

      <GroupLabel>메모 ({directTextMemos.length})</GroupLabel>
      <View style={styles.memoInputRow}>
        <Input
          value={memoInput}
          onChangeText={setMemoInput}
          placeholder="현장에 남길 메모"
          maxLength={2000}
          multiline
          numberOfLines={2}
          containerStyle={styles.memoInputWrap}
        />
        <Button
          onPress={handleAddDirectMemo}
          disabled={!memoInput.trim()}
          loading={memoSubmitting}
        >
          추가
        </Button>
      </View>
      {directTextMemos.length > 0 ? (
        <View style={styles.memoList}>
          {directTextMemos.map((m) => (
            <Card key={m.id} padding="md">
              <View style={styles.memoHead}>
                <Text variant="bodySm" style={styles.memoText}>
                  {m.text}
                </Text>
                <Pressable
                  onPress={() => handleRemoveMemo(m.id)}
                  accessibilityRole="button"
                  accessibilityLabel="메모 삭제"
                  hitSlop={MEMO_DELETE_HIT_SLOP}
                  style={({ pressed }) => [
                    styles.memoDeleteBtn,
                    pressed && { opacity: opacity.pressed },
                  ]}
                >
                  <Ionicons name="close" size={14} color={colors.textMuted} />
                </Pressable>
              </View>
              <Text variant="caption" color="textMuted" style={styles.memoMeta}>
                {fmtDateTime(m.createdAt)}
              </Text>
            </Card>
          ))}
        </View>
      ) : null}

      <Button
        onPress={handleAddDirectPhoto}
        variant="secondary"
        fullWidth
        leftIcon="camera"
        loading={photoBusy}
        style={styles.photoBtn}
      >
        사진 추가
        {directPhotoCount > 0 ? ` (${directPhotoCount})` : ''}
      </Button>

      <PhotoGrid photos={directPhotos} onDelete={handleRemovePhoto} />

      <GroupLabel>방문 이력 ({visits.length})</GroupLabel>
    </View>
  );

  return (
    <MapSheetLayout
      title="현장 상세"
      onBack={() => safeBack(router)}
      initialIndex={2}
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
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionBtn: { flex: 1 },
  memoInputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    alignItems: 'flex-end',
  },
  memoInputWrap: { flex: 1 },
  memoList: { marginTop: spacing.sm, gap: spacing.xs },
  memoHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  memoText: { flex: 1 },
  memoDeleteBtn: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memoMeta: { marginTop: spacing.xs },
  photoBtn: { marginTop: spacing.sm },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  visitCard: { marginBottom: spacing.xs },
  visitHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  visitReason: { marginTop: spacing.xs },
});
