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
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useReportStore } from '@/stores/reportStore';
import { useFieldStore } from '@/stores/fieldStore';
import { fields as fieldsApi, API_BASE_URL } from '@/api';
import { pickPhoto, promptPhotoSource } from '@/utils/media';
import { safeBack } from '@/utils/backNavigation';
import { EmptyState } from '@/components/EmptyState';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize, fontWeight, lineHeight } from '@/theme/spacing';
import { opacity } from '@/theme/motion';

// ERD v2: 보고서 본문 = 현장별 전·중·후 사진+캡션(field_reports). 추가/수정 화면.

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

  useEffect(() => {
    if (allFields.length === 0) void refreshFields();
  }, [allFields.length, refreshFields]);

  const existing = useMemo(
    () => detailCache[reportId]?.fieldReports?.find((fr) => fr.id === frId),
    [detailCache, reportId, frId],
  );

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
  const prefilled = useRef(false);

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
      safeBack(router);
    } else {
      setError(r.error);
    }
  };

  if (isEdit && !existing) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="document-text-outline"
          title="현장 보고를 찾을 수 없습니다"
          description="보고서 상세에서 다시 진입해주세요"
        />
      </View>
    );
  }

  return (
    <>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.heading}>
            {isEdit ? '현장 보고 수정' : '현장 보고 추가'}
          </Text>

          <Text style={styles.label}>현장 *</Text>
          {isEdit ? (
            <Card padding="md" style={styles.readonly}>
              <Text style={styles.readonlyText}>
                {selectedField?.address ?? fieldId}
              </Text>
            </Card>
          ) : (
            <Pressable
              onPress={() => setFieldPickerOpen(true)}
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
                style={
                  selectedField ? styles.fieldPickText : styles.fieldPickPlaceholder
                }
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
                <Text style={styles.phaseLabel}>{p.label}</Text>
                {img ? (
                  <Image
                    source={{ uri: img }}
                    style={styles.phasePhoto}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.phasePhoto, styles.phasePhotoEmpty]}>
                    <Text style={styles.phasePhotoEmptyText}>
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

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            onPress={handleSave}
            disabled={uploading !== null}
            loading={submitting}
            size="lg"
            fullWidth
            leftIcon="save"
            style={styles.submit}
          >
            저장
          </Button>
          <Button onPress={() => safeBack(router)} variant="ghost" size="sm" fullWidth>
            취소
          </Button>
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
            <Text style={styles.pickerTitle}>현장 선택</Text>
            <ScrollView
              style={styles.pickerList}
              contentContainerStyle={styles.pickerListContent}
            >
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
                    style={({ pressed }) => [
                      styles.pickerItem,
                      f.id === fieldId && styles.pickerItemActive,
                      pressed && { opacity: opacity.pressed },
                    ]}
                  >
                    <Text
                      style={[
                        styles.pickerItemText,
                        f.id === fieldId && styles.pickerItemTextActive,
                      ]}
                    >
                      {f.address}
                    </Text>
                    {f.addressDetail ? (
                      <Text style={styles.pickerItemMeta}>{f.addressDetail}</Text>
                    ) : null}
                  </Pressable>
                ))
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
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl },
  heading: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.heavy,
    color: colors.text,
    marginBottom: spacing.md,
    lineHeight: lineHeight.xl,
  },
  label: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: fontWeight.bold,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  readonly: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 0,
  },
  readonlyText: {
    fontSize: fontSize.base,
    color: colors.text,
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
  fieldPickText: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.text,
    fontWeight: fontWeight.semibold,
  },
  fieldPickPlaceholder: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.textMuted,
    fontWeight: fontWeight.bold,
  },
  titleField: { marginTop: spacing.md },
  phaseBox: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  phaseLabel: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: fontWeight.bold,
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
  phasePhotoEmptyText: { fontSize: fontSize.sm, color: colors.textMuted },
  phaseActions: { flexDirection: 'row', gap: spacing.sm },
  phaseBtnFlex: { flex: 1 },
  captionField: { marginTop: spacing.sm },
  error: { color: colors.danger, fontSize: fontSize.sm, marginTop: spacing.md },
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
  pickerTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  pickerList: { flexGrow: 0 },
  pickerListContent: { gap: spacing.xs, paddingVertical: spacing.xs },
  pickerEmpty: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    paddingVertical: spacing.md,
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
  pickerItemText: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: fontWeight.semibold,
  },
  pickerItemTextActive: {
    color: colors.primary,
    fontWeight: fontWeight.bold,
  },
  pickerItemMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
});
