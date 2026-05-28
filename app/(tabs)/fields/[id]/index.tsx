import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useFieldStore } from '@/stores/fieldStore';
import { safeBack } from '@/utils/backNavigation';
import { useVisitStore } from '@/stores/visitStore';
import { useTripStore } from '@/stores/tripStore';
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
import { spacing, radius, fontSize, fontWeight, lineHeight } from '@/theme/spacing';
import { opacity } from '@/theme/motion';
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
  const patchFieldStatus = useFieldStore((s) => s.patchStatus);
  const allVisits = useVisitStore((s) => s.visits);
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
  const handleStatusTap = () => {
    if (statusBusyRef.current) return;
    const others = FIELD_STATUS_VALUES.filter((s) => s !== field.status);
    promptChoice('상태 변경', `현재: ${FIELD_STATUS_LABEL[field.status]}`, [
      ...others.map((s) => ({
        label: FIELD_STATUS_LABEL[s],
        onPress: async () => {
          if (statusBusyRef.current) return;
          statusBusyRef.current = true;
          try {
            const r = await patchFieldStatus(field.id, s);
            if (!r.ok) Alert.alert('상태 변경 실패', r.error);
          } finally {
            statusBusyRef.current = false;
          }
        },
      })),
      { label: '취소', style: 'cancel' as const },
    ]);
  };

  const canCheckIn = activeTripId !== null;
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
          <Text style={styles.visitDate}>{fmtDateTime(item.visitedAt)}</Text>
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
          { backgroundColor: statusFg + '22', borderColor: statusFg },
          pressed && { opacity: opacity.pressed },
        ]}
      >
        <Text style={[styles.statusText, { color: statusFg }]}>
          {FIELD_STATUS_LABEL[field.status]}
        </Text>
        <Ionicons name="chevron-down" size={14} color={statusFg} />
      </Pressable>

      <Text style={styles.addr}>{field.address}</Text>
      {field.addressDetail ? (
        <Text style={styles.detail}>{field.addressDetail}</Text>
      ) : null}
      {field.projectName ? (
        <View style={styles.metaRow}>
          <Ionicons name="folder-outline" size={14} color={colors.textMuted} />
          <Text style={styles.metaText}>{field.projectName}</Text>
        </View>
      ) : null}
      {field.categories && field.categories.length > 0 ? (
        <View style={styles.metaRow}>
          <Ionicons name="pricetags-outline" size={14} color={colors.textMuted} />
          <Text style={styles.metaText}>{field.categories.join(', ')}</Text>
        </View>
      ) : null}

      <View style={styles.coordRow}>
        <Text style={styles.coord}>
          좌표: {field.latitude.toFixed(4)}, {field.longitude.toFixed(4)}
        </Text>
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

      <View style={styles.actions}>
        <Button
          onPress={() => router.push(`/(tabs)/fields/${field.id}/edit` as never)}
          variant="secondary"
          fullWidth
          leftIcon="create-outline"
          style={styles.actionFlex}
        >
          수정 / 삭제
        </Button>
        <Button
          onPress={() =>
            canCheckIn &&
            router.push(`/(tabs)/fields/${field.id}/checkin` as never)
          }
          disabled={!canCheckIn}
          fullWidth
          leftIcon="checkmark-circle"
          style={styles.actionFlex}
        >
          {canCheckIn ? '체크인' : '외근 시작 후 체크인 가능'}
        </Button>
      </View>

      <Text style={styles.sectionTitle}>
        현장 직접 메모 ({directTextMemos.length})
      </Text>
      <Text style={styles.directHint}>
        외근 진행 중이 아닐 때도 이 현장에 메모를 남길 수 있습니다.
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
              <Text style={styles.memoText}>{m.text}</Text>
              <Text style={styles.memoMeta}>{fmtDateTime(m.createdAt)}</Text>
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

      <PhotoGrid photos={directPhotos} />

      <Text style={styles.sectionTitle}>방문 이력 ({visits.length})</Text>
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
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  addr: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginTop: spacing.sm,
    lineHeight: lineHeight.lg,
  },
  detail: {
    fontSize: fontSize.base,
    color: colors.text,
    lineHeight: lineHeight.base,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  metaText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  coordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  coord: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionFlex: { flex: 1 },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
  directHint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  memoInputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    alignItems: 'flex-end',
  },
  memoInputWrap: { flex: 1 },
  memoList: { marginTop: spacing.sm, gap: spacing.xs },
  memoItem: {},
  memoText: {
    fontSize: fontSize.sm,
    color: colors.text,
    lineHeight: lineHeight.sm,
  },
  memoMeta: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  photoBtn: { marginTop: spacing.sm },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  visitCard: { marginBottom: spacing.xs },
  visitHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  visitDate: {
    fontSize: fontSize.sm,
    color: colors.text,
  },
});
