import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
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
import { useFieldStore } from '@/stores/fieldStore';
import { useVisitStore } from '@/stores/visitStore';
import { fields as fieldsApi, API_BASE_URL } from '@/api';
import { pickPhoto, promptPhotoSource } from '@/utils/media';
import { safeBack } from '@/utils/backNavigation';
import { EmptyState } from '@/components/EmptyState';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { opacity } from '@/theme/motion';
import { SafeScreen } from '@/components/SafeScreen';

// ERD v2: 보고서 본문 = 현장별 전·중·후 사진+캡션(field_reports). 추가/수정 화면.
// 마법사 모드(2026-06-04 결정): 보고서 생성 직후 ?wizard=1 로 진입해 스캐폴드된
// 현장 보고를 차례로 채움 — 저장하면 다음 현장으로, 마지막이면 상세로.

type Phase = 'before' | 'pending' | 'after';
const PHASES: { key: Phase; label: string }[] = [
  { key: 'before', label: '조치 전' },
  { key: 'pending', label: '조치 중' },
  { key: 'after', label: '조치 후' },
];

function resolveUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  return u.startsWith('http') ? u : `${API_BASE_URL}${u}`;
}

export default function FieldReportEditorScreen() {
  const { id, frId } = useLocalSearchParams<{ id: string; frId?: string }>();
  // 마법사 단계 전환은 같은 라우트에서 frId 만 바뀜 — key 로 강제 remount 해
  // 슬롯·제목·prefill ref 가 이전 현장 것으로 남는 회로 차단.
  return <FieldReportEditor key={`${id ?? ''}:${frId ?? 'new'}`} />;
}

function FieldReportEditor() {
  const { id, frId, wizard } = useLocalSearchParams<{
    id: string;
    frId?: string;
    wizard?: string;
  }>();
  const reportId = id ?? '';
  const isEdit = !!frId;
  const isWizard = wizard === '1';
  const router = useRouter();

  const detailCache = useReportStore((s) => s.detailCache);
  const addFieldReport = useReportStore((s) => s.addFieldReport);
  const updateFieldReport = useReportStore((s) => s.updateFieldReport);
  const allFields = useFieldStore((s) => s.fields);
  const refreshFields = useFieldStore((s) => s.refresh);
  // 이 보고서가 연결된 trip 의 visits — 그 fields 가 picker 에서 우선 노출.
  const reportTripId = useReportStore(
    (s) => s.detailCache[reportId]?.tripId ?? null,
  );
  // selector 안에서 .filter() 호출하면 매 호출마다 새 array reference →
  // useSyncExternalStoreWithSelector 가 무한 re-render → React error #185. raw 구독 + useMemo.
  const allVisits = useVisitStore((s) => s.visits);
  const tripVisits = useMemo(
    () => (reportTripId ? allVisits.filter((v) => v.tripId === reportTripId) : []),
    [allVisits, reportTripId],
  );

  useEffect(() => {
    if (allFields.length === 0) void refreshFields();
  }, [allFields.length, refreshFields]);

  const existing = useMemo(
    () => detailCache[reportId]?.fieldReports?.find((fr) => fr.id === frId),
    [detailCache, reportId, frId],
  );

  // 마법사 단계 정보 — detailCache 의 fieldReports 순서가 단계 순서.
  // frId 가 목록에 없으면(캐시 미스 등) null → 일반 수정 화면으로 동작.
  const wizardSeq = useMemo(() => {
    if (!isWizard) return null;
    const frs = detailCache[reportId]?.fieldReports ?? [];
    const idx = frs.findIndex((fr) => fr.id === frId);
    if (idx < 0) return null;
    return {
      step: idx + 1,
      total: frs.length,
      nextFrId: idx + 1 < frs.length ? frs[idx + 1].id : null,
    };
  }, [isWizard, detailCache, reportId, frId]);

  // 다음 단계로 (마지막이면 상세로) — '저장 후 다음'과 '건너뛰기' 공용.
  // push 가 아닌 replace — 마법사 단계들이 back 스택에 쌓여 뒤로가기가 이전 현장으로
  // 되돌아가는(이미 저장된 단계 재진입) 혼선 차단.
  const goWizardNext = () => {
    if (wizardSeq?.nextFrId) {
      router.replace(
        `/(tabs)/reports/${reportId}/field-report?frId=${wizardSeq.nextFrId}&wizard=1` as never,
      );
    } else {
      router.replace(`/(tabs)/reports/${reportId}` as never);
    }
  };

  const [fieldId, setFieldId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [slots, setSlots] = useState<
    Record<Phase, { url: string | null; caption: string }>
  >({
    before: { url: null, caption: '' },
    pending: { url: null, caption: '' },
    after: { url: null, caption: '' },
  });
  const [uploading, setUploading] = useState<Phase | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const prefilled = useRef(false);

  // picker 후보 — 이 trip 의 visit fields 우선, 나머지 그 다음. 검색 시 모두 한 줄로 흐르되 우선군은 위쪽.
  const pickerGroups = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    const tripFieldIds = new Set(tripVisits.map((v) => v.fieldId));
    const matches = (f: typeof allFields[number]) => {
      if (!q) return true;
      return (
        f.address.toLowerCase().includes(q) ||
        (f.addressDetail ?? '').toLowerCase().includes(q)
      );
    };
    const trip = allFields.filter((f) => tripFieldIds.has(f.id) && matches(f));
    const others = allFields.filter((f) => !tripFieldIds.has(f.id) && matches(f));
    return { trip, others };
  }, [allFields, tripVisits, pickerQuery]);

  // 수정 모드 prefill — 1회.
  useEffect(() => {
    if (!isEdit || prefilled.current || !existing) return;
    prefilled.current = true;
    setFieldId(existing.fieldId);
    setTitle(existing.title ?? '');
    setSlots({
      before: {
        url: existing.beforePhotoUrl ?? null,
        caption: existing.beforePhotoCaption ?? '',
      },
      pending: {
        url: existing.pendingPhotoUrl ?? null,
        caption: existing.pendingPhotoCaption ?? '',
      },
      after: {
        url: existing.afterPhotoUrl ?? null,
        caption: existing.afterPhotoCaption ?? '',
      },
    });
  }, [isEdit, existing]);

  // 새 보고 모드 + fieldId 선택됨 → 그 field 의 phase 사진을 슬롯에 자동 prefill.
  // 결정 §4 (2026-05-31): backend-backlog §9 응답에 phase 가 포함되면 자동 동작.
  // §9 머지 전엔 attachment.phase 가 모두 undefined → 슬롯은 빈 상태 유지 (회로 정상).
  // 마법사 모드도 대상 — 빈 스캐폴드를 채우는 흐름이라 의미상 '새 보고 작성'과 동일.
  // 슬롯이 이미 찬 경우 prev.url ?? 로 보존되므로 기존 사진을 덮어쓰지 않음.
  const fieldAttachments = useFieldStore(
    (s) => (fieldId ? s.directAttachments[fieldId] : undefined),
  );
  const loadFieldDetail = useFieldStore((s) => s.loadDetail);
  // 마법사 단계의 현장 첨부 로드 — §4 prefill 재료. 캐시에 이미 있으면 skip.
  useEffect(() => {
    if (!isWizard || !fieldId) return;
    if (useFieldStore.getState().directAttachments[fieldId]) return;
    void loadFieldDetail(fieldId);
  }, [isWizard, fieldId, loadFieldDetail]);
  // Set 으로 fieldId 별 1회 가드 (F8) — 단일 ref 였을 때 A→B→A 전환에서 A 의 prefill 이
  // 재실행되어 사용자가 clear 한 슬롯이 부활하던 회로 차단.
  const phasePrefilledFieldsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (isEdit && !isWizard) return;
    if (!fieldId || !fieldAttachments) return;
    if (phasePrefilledFieldsRef.current.has(fieldId)) return;
    const byPhase: { before?: string; pending?: string; after?: string } = {};
    for (const a of fieldAttachments) {
      if (a.type !== 'photo' || !a.fileUrl) continue;
      // attachment.phase: §9 머지 후 들어옴. before/after 그대로, 'during' → 'pending' 매핑.
      if (!a.phase) continue;
      const slotKey: Phase = a.phase === 'during' ? 'pending' : a.phase;
      if (!byPhase[slotKey]) byPhase[slotKey] = a.fileUrl;
    }
    if (Object.keys(byPhase).length === 0) return; // §9 미해소 — 회로 정상
    phasePrefilledFieldsRef.current.add(fieldId);
    setSlots((prev) => ({
      before: { ...prev.before, url: prev.before.url ?? byPhase.before ?? null },
      pending: { ...prev.pending, url: prev.pending.url ?? byPhase.pending ?? null },
      after: { ...prev.after, url: prev.after.url ?? byPhase.after ?? null },
    }));
  }, [isEdit, isWizard, fieldId, fieldAttachments]);

  const selectedField = useMemo(
    () => allFields.find((f) => f.id === fieldId),
    [allFields, fieldId],
  );

  const pickPhase = (phase: Phase) => {
    if (!fieldId) {
      Alert.alert('현장 먼저 선택', '사진을 올릴 현장을 먼저 선택해주세요.');
      return;
    }
    promptPhotoSource(async (src) => {
      const file = await pickPhoto(src);
      if (!file) return;
      setUploading(phase);
      try {
        const res = await fieldsApi.addPhoto(fieldId, file);
        setSlots((prev) => ({
          ...prev,
          [phase]: { ...prev[phase], url: res.photo.fileUrl },
        }));
      } catch {
        Alert.alert('사진 업로드 실패', '잠시 후 다시 시도해주세요.');
      } finally {
        setUploading(null);
      }
    });
  };

  const setCaption = (phase: Phase, caption: string) =>
    setSlots((prev) => ({ ...prev, [phase]: { ...prev[phase], caption } }));

  const clearPhoto = (phase: Phase) =>
    setSlots((prev) => ({ ...prev, [phase]: { ...prev[phase], url: null } }));

  const handleSave = async () => {
    setError(null);
    if (!fieldId) {
      setError('현장을 선택해주세요');
      return;
    }
    const body = {
      fieldId,
      title: title.trim() || undefined,
      beforePhotoUrl: slots.before.url ?? undefined,
      beforePhotoCaption: slots.before.caption.trim() || undefined,
      pendingPhotoUrl: slots.pending.url ?? undefined,
      pendingPhotoCaption: slots.pending.caption.trim() || undefined,
      afterPhotoUrl: slots.after.url ?? undefined,
      afterPhotoCaption: slots.after.caption.trim() || undefined,
    };
    setSubmitting(true);
    const r = isEdit
      ? await updateFieldReport(reportId, frId!, body)
      : await addFieldReport(reportId, body);
    setSubmitting(false);
    if (r.ok) {
      // 마법사: 다음 현장으로 이어가기, 일반: 진입했던 화면(상세)으로 복귀.
      if (wizardSeq) goWizardNext();
      else safeBack(router);
    } else {
      setError(r.error);
    }
  };

  if (isEdit && !existing) {
    return (
      <SafeScreen>
        <EmptyState
          icon="document-text-outline"
          title="현장 보고를 찾을 수 없습니다"
          description="보고서 상세에서 다시 진입해주세요"
          action={
            <Button
              onPress={() =>
                router.replace(`/(tabs)/reports/${reportId}` as never)
              }
              variant="secondary"
              leftIcon="arrow-back"
            >
              보고서 상세로
            </Button>
          }
        />
      </SafeScreen>
    );
  }

  return (
    <SafeScreen>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text variant="h2" weight="heavy" style={styles.heading}>
            {wizardSeq
              ? `현장 보고 작성 (${wizardSeq.step}/${wizardSeq.total})`
              : isEdit
                ? '현장 보고 수정'
                : '현장 보고 추가'}
          </Text>
          {wizardSeq ? (
            <Text variant="bodySm" color="textMuted" style={styles.wizardHint}>
              방문한 현장마다 전·중·후 사진을 채워주세요. 지금 건너뛰어도 보고서
              상세에서 언제든 채울 수 있어요.
            </Text>
          ) : null}

          <Text variant="bodySm" weight="bold" color="textMuted" style={styles.label}>
            현장 *
          </Text>
          {isEdit ? (
            <Card padding="md" style={styles.readonly}>
              <Text variant="body">
                {selectedField?.address ?? '알 수 없는 현장'}
              </Text>
            </Card>
          ) : (
            <Pressable
              onPress={() => setFieldPickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={
                selectedField ? `현장: ${selectedField.address}` : '현장 선택'
              }
              style={({ pressed }) => [
                styles.fieldPickBtn,
                pressed && { opacity: opacity.pressed },
              ]}
            >
              <Ionicons
                name={selectedField ? 'location' : 'add-circle-outline'}
                size={18}
                color={selectedField ? colors.primary : colors.textMuted}
              />
              <Text
                variant="body"
                weight={selectedField ? 'semibold' : 'bold'}
                color={selectedField ? 'text' : 'textMuted'}
                style={styles.fieldPickText}
              >
                {selectedField ? selectedField.address : '현장 선택'}
              </Text>
            </Pressable>
          )}

          <Input
            label="제목 (선택)"
            value={title}
            onChangeText={setTitle}
            placeholder="예: 1번 가로수 가지치기"
            maxLength={100}
            containerStyle={styles.titleField}
          />

          {PHASES.map((p) => {
            const slot = slots[p.key];
            const img = resolveUrl(slot.url);
            return (
              <Card key={p.key} padding="md" style={styles.phaseBox}>
                <Text variant="bodySm" weight="bold">
                  {p.label}
                </Text>
                {img ? (
                  <Image
                    source={{ uri: img }}
                    style={styles.phasePhoto}
                    resizeMode="cover"
                    accessibilityLabel={`${p.label} 사진`}
                  />
                ) : (
                  <View style={[styles.phasePhoto, styles.phasePhotoEmpty]}>
                    <Text variant="bodySm" color="textMuted">
                      {uploading === p.key ? '업로드 중...' : '사진 없음'}
                    </Text>
                  </View>
                )}
                <View style={styles.phaseActions}>
                  <Button
                    onPress={() => pickPhase(p.key)}
                    disabled={uploading !== null}
                    variant="secondary"
                    size="sm"
                    leftIcon="camera"
                    style={styles.phaseBtnFlex}
                  >
                    {slot.url ? '사진 변경' : '사진'}
                  </Button>
                  {slot.url ? (
                    <Button
                      onPress={() => clearPhoto(p.key)}
                      variant="ghost"
                      size="sm"
                      leftIcon="trash"
                    >
                      제거
                    </Button>
                  ) : null}
                </View>
                <Input
                  value={slot.caption}
                  onChangeText={(v) => setCaption(p.key, v)}
                  placeholder={`${p.label} 캡션 (선택)`}
                  maxLength={200}
                  containerStyle={styles.captionField}
                />
              </Card>
            );
          })}

          {error ? (
            <Text variant="bodySm" color="danger" style={styles.error}>
              {error}
            </Text>
          ) : null}

          <Button
            onPress={handleSave}
            disabled={uploading !== null}
            loading={submitting}
            size="lg"
            fullWidth
            leftIcon="save"
            style={styles.submit}
          >
            {wizardSeq
              ? wizardSeq.nextFrId
                ? '저장 후 다음 현장'
                : '저장 후 완료'
              : '저장'}
          </Button>
          {wizardSeq ? (
            <>
              <Button
                onPress={goWizardNext}
                disabled={uploading !== null || submitting}
                variant="ghost"
                size="sm"
                fullWidth
              >
                {wizardSeq.nextFrId ? '이 현장 건너뛰기' : '건너뛰고 완료'}
              </Button>
              {wizardSeq.nextFrId ? (
                <Button
                  onPress={() =>
                    router.replace(`/(tabs)/reports/${reportId}` as never)
                  }
                  disabled={submitting}
                  variant="ghost"
                  size="sm"
                  fullWidth
                >
                  나중에 작성하기
                </Button>
              ) : null}
            </>
          ) : (
            <Button onPress={() => safeBack(router)} variant="ghost" size="sm" fullWidth>
              취소
            </Button>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={fieldPickerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setFieldPickerOpen(false)}
      >
        <Pressable
          style={styles.pickerBackdrop}
          onPress={() => setFieldPickerOpen(false)}
        >
          <Pressable style={styles.pickerCard} onPress={() => undefined}>
            <Text variant="h3">현장 선택</Text>
            <Input
              value={pickerQuery}
              onChangeText={setPickerQuery}
              placeholder="주소·상세주소 검색"
              autoCapitalize="none"
              clearButtonMode="while-editing"
              containerStyle={styles.pickerSearch}
            />
            <ScrollView
              style={styles.pickerList}
              contentContainerStyle={styles.pickerListContent}
            >
              {allFields.length === 0 ? (
                <Text variant="bodySm" color="textMuted" style={styles.pickerEmpty}>
                  등록된 현장이 없습니다.
                </Text>
              ) : pickerGroups.trip.length === 0 && pickerGroups.others.length === 0 ? (
                <Text variant="bodySm" color="textMuted" style={styles.pickerEmpty}>
                  검색 결과가 없습니다.
                </Text>
              ) : (
                <>
                  {pickerGroups.trip.length > 0 ? (
                    <Text
                      variant="caption"
                      weight="bold"
                      color="textMuted"
                      style={styles.pickerGroupLabel}
                    >
                      이 외근에 방문한 현장
                    </Text>
                  ) : null}
                  {pickerGroups.trip.map((f) => (
                    <Pressable
                      key={f.id}
                      onPress={() => {
                        setFieldId(f.id);
                        setFieldPickerOpen(false);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: f.id === fieldId }}
                      accessibilityLabel={
                        f.addressDetail
                          ? `${f.address}, ${f.addressDetail}`
                          : f.address
                      }
                      style={({ pressed }) => [
                        styles.pickerItem,
                        f.id === fieldId && styles.pickerItemActive,
                        pressed && { opacity: opacity.pressed },
                      ]}
                    >
                      <Text
                        variant="bodySm"
                        weight={f.id === fieldId ? 'bold' : 'semibold'}
                        color={f.id === fieldId ? 'primary' : 'text'}
                      >
                        {f.address}
                      </Text>
                      {f.addressDetail ? (
                        <Text variant="caption" color="textMuted" style={styles.pickerItemMeta}>
                          {f.addressDetail}
                        </Text>
                      ) : null}
                    </Pressable>
                  ))}
                  {pickerGroups.others.length > 0 ? (
                    <Text
                      variant="caption"
                      weight="bold"
                      color="textMuted"
                      style={styles.pickerGroupLabel}
                    >
                      다른 현장
                    </Text>
                  ) : null}
                  {pickerGroups.others.map((f) => (
                    <Pressable
                      key={f.id}
                      onPress={() => {
                        setFieldId(f.id);
                        setFieldPickerOpen(false);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: f.id === fieldId }}
                      accessibilityLabel={
                        f.addressDetail
                          ? `${f.address}, ${f.addressDetail}`
                          : f.address
                      }
                      style={({ pressed }) => [
                        styles.pickerItem,
                        f.id === fieldId && styles.pickerItemActive,
                        pressed && { opacity: opacity.pressed },
                      ]}
                    >
                      <Text
                        variant="bodySm"
                        weight={f.id === fieldId ? 'bold' : 'semibold'}
                        color={f.id === fieldId ? 'primary' : 'text'}
                      >
                        {f.address}
                      </Text>
                      {f.addressDetail ? (
                        <Text variant="caption" color="textMuted" style={styles.pickerItemMeta}>
                          {f.addressDetail}
                        </Text>
                      ) : null}
                    </Pressable>
                  ))}
                </>
              )}
            </ScrollView>
            <Button
              onPress={() => setFieldPickerOpen(false)}
              variant="ghost"
              size="sm"
              fullWidth
            >
              닫기
            </Button>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl },
  heading: { marginBottom: spacing.md },
  wizardHint: { marginTop: -spacing.xs, marginBottom: spacing.sm },
  label: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  readonly: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 0,
  },
  fieldPickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  fieldPickText: { flex: 1 },
  titleField: { marginTop: spacing.md },
  phaseBox: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  phasePhoto: {
    width: '100%',
    height: 160,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  phasePhotoEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  phaseActions: { flexDirection: 'row', gap: spacing.sm },
  phaseBtnFlex: { flex: 1 },
  captionField: { marginTop: spacing.sm },
  error: { marginTop: spacing.md },
  submit: { marginTop: spacing.xl },
  // picker modal
  pickerBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  pickerCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  pickerList: { flexGrow: 0 },
  pickerListContent: { gap: spacing.xs, paddingVertical: spacing.xs },
  pickerEmpty: { paddingVertical: spacing.md },
  pickerSearch: { marginTop: spacing.sm },
  pickerGroupLabel: {
    marginTop: spacing.xs,
    marginBottom: 2,
    paddingHorizontal: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pickerItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pickerItemActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  pickerItemMeta: { marginTop: 2 },
});
