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
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useReportStore } from '@/stores/reportStore';
import { useFieldStore } from '@/stores/fieldStore';
import { fields as fieldsApi, API_BASE_URL } from '@/api';
import { pickPhoto, promptPhotoSource } from '@/utils/media';
import { safeBack } from '@/utils/backNavigation';
import { EmptyState } from '@/components/EmptyState';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

// ERD v2: 보고서 본문 = 현장별 전·중·후 사진+캡션(field_reports). 추가/수정 화면.
// 사진은 현장 사진 업로드(/api/fields/:id/photos)로 URL 을 얻어 field-report 에 연결.

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

export default function FieldReportEditor() {
  const { id, frId } = useLocalSearchParams<{ id: string; frId?: string }>();
  const reportId = id ?? '';
  const isEdit = !!frId;
  const router = useRouter();

  const detailCache = useReportStore((s) => s.detailCache);
  const addFieldReport = useReportStore((s) => s.addFieldReport);
  const updateFieldReport = useReportStore((s) => s.updateFieldReport);
  const allFields = useFieldStore((s) => s.fields);
  const refreshFields = useFieldStore((s) => s.refresh);

  // 현장 목록이 비었으면(딥링크 등) 한 번 로드.
  useEffect(() => {
    if (allFields.length === 0) void refreshFields();
  }, [allFields.length, refreshFields]);

  const existing = useMemo(
    () => detailCache[reportId]?.fieldReports?.find((fr) => fr.id === frId),
    [detailCache, reportId, frId],
  );

  const [fieldId, setFieldId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [slots, setSlots] = useState<Record<Phase, { url: string | null; caption: string }>>({
    before: { url: null, caption: '' },
    pending: { url: null, caption: '' },
    after: { url: null, caption: '' },
  });
  const [uploading, setUploading] = useState<Phase | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const prefilled = useRef(false);

  // 수정 모드 prefill — 1회.
  useEffect(() => {
    if (!isEdit || prefilled.current || !existing) return;
    prefilled.current = true;
    setFieldId(existing.fieldId);
    setTitle(existing.title ?? '');
    setSlots({
      before: { url: existing.beforePhotoUrl ?? null, caption: existing.beforePhotoCaption ?? '' },
      pending: { url: existing.pendingPhotoUrl ?? null, caption: existing.pendingPhotoCaption ?? '' },
      after: { url: existing.afterPhotoUrl ?? null, caption: existing.afterPhotoCaption ?? '' },
    });
  }, [isEdit, existing]);

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
        setSlots((prev) => ({ ...prev, [phase]: { ...prev[phase], url: res.photo.fileUrl } }));
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
      safeBack(router);
    } else {
      setError(r.error);
    }
  };

  if (isEdit && !existing) {
    return (
      <View style={styles.container}>
        <EmptyState title="현장 보고를 찾을 수 없습니다" description="보고서 상세에서 다시 진입해주세요" />
      </View>
    );
  }

  return (
    <>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.heading}>{isEdit ? '현장 보고 수정' : '현장 보고 추가'}</Text>

          <Text style={styles.label}>현장 *</Text>
          {isEdit ? (
            <View style={styles.readonly}>
              <Text style={styles.readonlyText}>{selectedField?.address ?? fieldId}</Text>
            </View>
          ) : (
            <Pressable
              onPress={() => setFieldPickerOpen(true)}
              style={({ pressed }) => [styles.fieldPickBtn, pressed && styles.pressed]}
            >
              <Text style={selectedField ? styles.fieldPickText : styles.fieldPickPlaceholder}>
                {selectedField ? selectedField.address : '+ 현장 선택'}
              </Text>
            </Pressable>
          )}

          <Text style={styles.label}>제목 (선택)</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            style={styles.input}
            placeholder="예: 1번 가로수 가지치기"
            maxLength={100}
          />

          {PHASES.map((p) => {
            const slot = slots[p.key];
            const img = resolveUrl(slot.url);
            return (
              <View key={p.key} style={styles.phaseBox}>
                <Text style={styles.phaseLabel}>{p.label}</Text>
                {img ? (
                  <Image source={{ uri: img }} style={styles.phasePhoto} resizeMode="cover" />
                ) : (
                  <View style={[styles.phasePhoto, styles.phasePhotoEmpty]}>
                    <Text style={styles.phasePhotoEmptyText}>
                      {uploading === p.key ? '업로드 중...' : '사진 없음'}
                    </Text>
                  </View>
                )}
                <View style={styles.phaseActions}>
                  <Pressable
                    onPress={() => pickPhase(p.key)}
                    disabled={uploading !== null}
                    style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.smallBtnText}>{slot.url ? '사진 변경' : '+ 사진'}</Text>
                  </Pressable>
                  {slot.url ? (
                    <Pressable
                      onPress={() => clearPhoto(p.key)}
                      style={({ pressed }) => [styles.smallBtn, styles.ghostBtn, pressed && styles.pressed]}
                    >
                      <Text style={styles.ghostBtnText}>제거</Text>
                    </Pressable>
                  ) : null}
                </View>
                <TextInput
                  value={slot.caption}
                  onChangeText={(v) => setCaption(p.key, v)}
                  style={styles.input}
                  placeholder={`${p.label} 캡션 (선택)`}
                  maxLength={200}
                />
              </View>
            );
          })}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={handleSave}
            disabled={submitting || uploading !== null}
            style={({ pressed }) => [
              styles.btn,
              (submitting || uploading !== null) && styles.btnDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.btnText}>{submitting ? '저장 중...' : '저장'}</Text>
          </Pressable>
          <Pressable onPress={() => safeBack(router)} style={styles.cancel}>
            <Text style={styles.cancelText}>취소</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={fieldPickerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setFieldPickerOpen(false)}
      >
        <Pressable style={styles.pickerBackdrop} onPress={() => setFieldPickerOpen(false)}>
          <Pressable style={styles.pickerCard} onPress={() => undefined}>
            <Text style={styles.pickerTitle}>현장 선택</Text>
            <ScrollView style={styles.pickerList} contentContainerStyle={styles.pickerListContent}>
              {allFields.length === 0 ? (
                <Text style={styles.pickerEmpty}>등록된 현장이 없습니다.</Text>
              ) : (
                allFields.map((f) => (
                  <Pressable
                    key={f.id}
                    onPress={() => {
                      setFieldId(f.id);
                      setFieldPickerOpen(false);
                    }}
                    style={[styles.pickerItem, f.id === fieldId && styles.pickerItemActive]}
                  >
                    <Text style={[styles.pickerItemText, f.id === fieldId && styles.pickerItemTextActive]}>
                      {f.address}
                    </Text>
                    {f.addressDetail ? (
                      <Text style={styles.pickerItemMeta}>{f.addressDetail}</Text>
                    ) : null}
                  </Pressable>
                ))
              )}
            </ScrollView>
            <Pressable
              onPress={() => setFieldPickerOpen(false)}
              style={({ pressed }) => [styles.pickerCancel, pressed && styles.pressed]}
            >
              <Text style={styles.pickerCancelText}>닫기</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl },
  heading: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text, marginBottom: spacing.md },
  label: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '700',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
    color: colors.text,
  },
  readonly: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  readonlyText: { fontSize: fontSize.base, color: colors.text },
  fieldPickBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  fieldPickText: { fontSize: fontSize.base, color: colors.text, fontWeight: '600' },
  fieldPickPlaceholder: { fontSize: fontSize.base, color: colors.textMuted, fontWeight: '700' },
  phaseBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  phaseLabel: { fontSize: fontSize.sm, color: colors.text, fontWeight: '700' },
  phasePhoto: {
    width: '100%',
    height: 160,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
  },
  phasePhotoEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  phasePhotoEmptyText: { fontSize: fontSize.sm, color: colors.textMuted },
  phaseActions: { flexDirection: 'row', gap: spacing.sm },
  smallBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  smallBtnText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '700' },
  ghostBtn: { borderColor: colors.danger },
  ghostBtnText: { fontSize: fontSize.sm, color: colors.danger, fontWeight: '700' },
  error: { color: colors.danger, fontSize: fontSize.sm, marginTop: spacing.md },
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  btnDisabled: { backgroundColor: colors.border },
  btnText: { color: '#fff', fontSize: fontSize.base, fontWeight: '700' },
  cancel: { alignItems: 'center', paddingVertical: spacing.md },
  cancelText: { color: colors.textMuted, fontSize: fontSize.sm },
  pressed: { opacity: 0.85 },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
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
  pickerTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  pickerList: { flexGrow: 0 },
  pickerListContent: { gap: spacing.xs, paddingVertical: spacing.xs },
  pickerEmpty: { fontSize: fontSize.sm, color: colors.textMuted, paddingVertical: spacing.md },
  pickerItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pickerItemActive: { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
  pickerItemText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600' },
  pickerItemTextActive: { color: colors.primary, fontWeight: '700' },
  pickerItemMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  pickerCancel: { alignItems: 'center', paddingVertical: spacing.md },
  pickerCancelText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '600' },
});
