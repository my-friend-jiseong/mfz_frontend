import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoid } from '@/components/ui/KeyboardAvoid';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/Button';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { NavHeader } from '@/components/ui/NavHeader';
import { confirm, notice } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { EmptyState } from '@/components/EmptyState';
import { SafeScreen } from '@/components/SafeScreen';
import { VisitRecordForm } from '@/components/trips/VisitRecordForm';
import { useVisitStore } from '@/stores/visitStore';
import { useFieldStore } from '@/stores/fieldStore';
import { useTripStore } from '@/stores/tripStore';
import { fieldDetailLine } from '@/utils/fieldFacets';
import { safeBack } from '@/utils/backNavigation';
import {
  memoForVisit,
  otherReasonShort,
  photosToSlots,
  saveVisitRecord,
  type VisitRecordValue,
} from '@/utils/visitRecord';
import { visitInReport } from '@/utils/visitGuards';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

// 방문 수정 (명세 v2 §4.4 — 외근 수정 화면을 대체).
// 체크인과 같은 폼을 기존 값으로 채워 연다. 진입은 외근 정리의 펼친 카드 `방문 수정` 뿐이다.
export default function VisitEdit() {
  const router = useRouter();
  const { id, visitId } = useLocalSearchParams<{ id: string; visitId: string }>();
  const tripId = id ?? '';
  const vid = visitId ?? '';

  const visit = useVisitStore((s) => s.visits.find((v) => v.id === vid));
  const photos = useVisitStore((s) => s.photosByVisit[vid]);
  const loadPhotos = useVisitStore((s) => s.loadPhotos);
  const removeVisit = useVisitStore((s) => s.remove);
  const loadTripDetail = useTripStore((s) => s.loadDetail);
  const field = useFieldStore((s) => (visit ? s.getById(visit.fieldId) : undefined));
  const attachments = useFieldStore((s) => (visit ? s.directAttachments[visit.fieldId] : undefined));
  const loadFieldDetail = useFieldStore((s) => s.loadDetail);

  const [value, setValue] = useState<VisitRecordValue | null>(null);
  // 사진·메모 로드가 끝났는지(실패 포함). 실패해도 폼은 연다 — 빈 칸으로라도 고칠 수 있게.
  const [photosLoaded, setPhotosLoaded] = useState(false);
  const [memoLoaded, setMemoLoaded] = useState(false);
  const [busy, setBusy] = useState<null | 'save' | 'delete'>(null);

  useEffect(() => {
    if (!tripId || !vid) return;
    // 새로고침으로 바로 들어오면 스토어가 비어 있다 — 외근 타임라인부터 받는다.
    if (!useVisitStore.getState().getById(vid)) void loadTripDetail(tripId);
    void loadPhotos(tripId, vid).finally(() => setPhotosLoaded(true));
  }, [tripId, vid, loadPhotos, loadTripDetail]);

  useEffect(() => {
    if (visit?.fieldId) void loadFieldDetail(visit.fieldId).finally(() => setMemoLoaded(true));
  }, [visit?.fieldId, loadFieldDetail]);

  const memo = useMemo(
    () => (visit ? memoForVisit(attachments, visit.visitedAt) : null),
    [attachments, visit],
  );

  // 기존 값을 채운 상태로 연다(FE-VED-02). 사진·메모가 도착한 뒤 한 번만 채운다.
  const filled = useRef(false);
  useEffect(() => {
    if (filled.current || !visit || !photosLoaded || !memoLoaded) return;
    filled.current = true;
    setValue({
      status: visit.status,
      reason: visit.reason ?? '',
      photos: photosToSlots(photos),
      memo: memo?.text ?? '',
    });
  }, [visit, photos, memo, photosLoaded, memoLoaded]);

  const back = () => safeBack(router, `/(tabs)/trips/${tripId}`);

  if (!visit) {
    return (
      <SafeScreen>
        <NavHeader title="방문 수정" onBack={back} />
        <EmptyState icon="search-outline" title="방문을 찾을 수 없습니다" />
      </SafeScreen>
    );
  }

  const blocked = value ? otherReasonShort(value) : true;

  const handleSave = async () => {
    if (!value || busy || blocked) return;
    setBusy('save');
    const { errors, value: next } = await saveVisitRecord({
      visitId: visit.id,
      fieldId: visit.fieldId,
      initialStatus: visit.status,
      initialMemo: memo,
      value,
    });
    setBusy(null);
    setValue(next);
    if (errors.length > 0) {
      Alert.alert('저장하지 못한 항목이 있습니다', errors.join('\n'));
      return;
    }
    toast('방문을 수정했습니다');
    back();
  };

  const handleDelete = async () => {
    if (busy) return;
    if (await visitInReport(visit.tripId, visit.fieldId)) {
      await notice('삭제할 수 없습니다', '보고서에서 먼저 삭제해야 합니다.');
      return;
    }
    const ok = await confirm({
      title: '이 방문을 삭제할까요?',
      message: '현장은 남고, 이 방문의 기록만 지워집니다.',
      confirmLabel: '삭제',
      destructive: true,
    });
    if (!ok) return;
    setBusy('delete');
    const r = await removeVisit(visit.id);
    setBusy(null);
    if (r.ok) {
      toast('방문을 삭제했습니다');
      back();
    } else if ('unsupported' in r) {
      await notice('아직 지원되지 않는 기능입니다', '방문 삭제는 서버 준비 후 사용할 수 있습니다.');
    } else {
      Alert.alert('방문 삭제 실패', r.error);
    }
  };

  return (
    <SafeScreen>
      <NavHeader title="방문 수정" onBack={back} />
      <KeyboardAvoid
        style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Card padding="lg" style={styles.header}>
            {/* Figma 방문 수정 header — 체크인을 마친 방문이라는 표시. 결과 상태는 아래 칩에서 고른다. */}
            <View style={styles.doneRow}>
              <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              <Text variant="bodySm" weight="bold" color="primary">
                방문 완료
              </Text>
            </View>
            <Text variant="body" weight="semibold">
              {field?.address ?? '알 수 없는 현장'}
            </Text>
            {field && fieldDetailLine(field) ? (
              <Text variant="bodySm" color="textMuted">
                {fieldDetailLine(field)}
              </Text>
            ) : null}
          </Card>

          {value ? (
            <VisitRecordForm value={value} onChange={setValue} disabled={busy !== null} />
          ) : (
            <View style={styles.loading}>
              <Text variant="bodySm" color="textMuted">
                기록을 불러오는 중…
              </Text>
            </View>
          )}
        </ScrollView>
        <BottomActionBar
          secondary={
            <Button
              onPress={() => void handleDelete()}
              variant="dangerSecondary"
              size="lg"
              leftIcon="trash"
              loading={busy === 'delete'}
              disabled={busy !== null}
            >
              방문 삭제
            </Button>
          }
        >
          <Button
            onPress={() => void handleSave()}
            size="lg"
            fullWidth
            leftIcon="save"
            loading={busy === 'save'}
            disabled={busy !== null || blocked}
          >
            저장
          </Button>
        </BottomActionBar>
      </KeyboardAvoid>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl },
  header: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
    marginBottom: spacing.lg,
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  loading: { paddingVertical: spacing.xl, alignItems: 'center' },
});
