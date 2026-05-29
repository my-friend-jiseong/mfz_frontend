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
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { promptChoice } from '@/components/WebChoiceModal';
import { pickPhoto, promptPhotoSource } from '@/utils/media';
import { openKakaoRouteTo } from '@/utils/kakaoMap';
import { PhotoGrid } from '@/components/AttachmentPreview';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { VISIT_STATUS_BADGE } from '@/theme/statusBadge';
import { fmtDateTime } from '@/utils/datetime';
import { Input } from '@/components/ui/Input';
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

  if (!field) {
    return (
      <MapSheetLayout title="현장 상세" onBack={() => safeBack(router)}>
        <EmptyState icon="search-outline" title="현장을 찾을 수 없습니다" />
      </MapSheetLayout>
    );
  }

  // 상태 변경 — chip tap 시 3개 상태 중 선택. patchStatus 즉시 호출.
  const statusBusyRef = useRef(false);
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
        <Text variant="caption" weight="bold" style={{ color: statusFg }}>
          {FIELD_STATUS_LABEL[field.status]}
        </Text>
        <Ionicons name="chevron-down" size={14} color={statusFg} />
      </Pressable>

      <Text variant="h3" style={styles.addr}>
        {field.address}
      </Text>
      {field.addressDetail ? (
        <Text variant="body">{field.addressDetail}</Text>
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

      <View style={styles.navRow}>
        <Button
          onPress={() =>
            void openKakaoRouteTo(field.address, field.latitude, field.longitude)
          }
          variant="secondary"
          size="sm"
          leftIcon="navigate"
        >
          길찾기
        </Button>
      </View>

      {/* 체크인은 외근 진행 화면의 currentDest 에서만 가능 — destination 경로와 일관.
          즉석 방문은 외근 진행 화면의 '현장 추가' 로 명시적 동선.
          삭제 액션은 수정 화면 안에 있음 — 라벨은 단순화. */}
      <Button
        onPress={() => router.push(`/(tabs)/fields/${field.id}/edit` as never)}
        variant="secondary"
        fullWidth
        leftIcon="create-outline"
        style={styles.editBtn}
      >
        수정
      </Button>

      <Text variant="bodySm" weight="bold" color="textMuted" style={styles.sectionTitle}>
        메모 ({directTextMemos.length})
      </Text>
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
            <Card key={m.id} padding="md" style={styles.memoItem}>
              <View style={styles.memoHead}>
                <Text variant="bodySm" style={styles.memoText}>
                  {m.text}
                </Text>
                <Pressable
                  onPress={() => handleRemoveMemo(m.id)}
                  accessibilityRole="button"
                  accessibilityLabel="메모 삭제"
                  hitSlop={8}
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

      <Text variant="bodySm" weight="bold" color="textMuted" style={styles.sectionTitle}>
        방문 이력 ({visits.length})
      </Text>
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
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState icon="footsteps-outline" title="방문 이력이 없습니다" />
        }
      />
    </MapSheetLayout>
  );
}

const styles = StyleSheet.create({
  summary: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  statusTap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  addr: { marginTop: spacing.sm },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  editBtn: { marginTop: spacing.md },
  sectionTitle: { marginTop: spacing.lg },
  memoInputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    alignItems: 'flex-end',
  },
  memoInputWrap: { flex: 1 },
  memoList: { marginTop: spacing.sm, gap: spacing.xs },
  memoItem: {},
  memoHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  memoText: { flex: 1 },
  memoDeleteBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
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
});
