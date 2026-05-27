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
import { safeBack } from '@/utils/backNavigation';
import { useTripStore } from '@/stores/tripStore';
import { useAuthStore } from '@/stores/authStore';
import { useVisitStore } from '@/stores/visitStore';
import { pickPhoto, promptPhotoSource, type UploadFile } from '@/utils/media';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

// ERD v2 통합 보고서 작성 — 본문(content) 제거. 두 분기:
//   ✨ AI 초안: POST /api/reports/generate (notes 필수, 조치 전·후 사진 활용 — fieldId 연결 시 field_report 저장)
//   ✏ 직접 저장: POST /api/reports (title 필수). 현장별 전·중·후 사진은 상세 화면에서 관리.

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ComposeReport() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string }>();

  const generate = useReportStore((s) => s.generate);
  const create = useReportStore((s) => s.create);
  const allReports = useReportStore((s) => s.reports);
  const allTrips = useTripStore((s) => s.trips);
  const userId = useAuthStore((s) => s.user?.id);
  const visitsByTrip = useVisitStore((s) => s.byTrip);

  const [tripId, setTripId] = useState<string | null>(params.tripId ?? null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [beforePhoto, setBeforePhoto] = useState<UploadFile | null>(null);
  const [afterPhoto, setAfterPhoto] = useState<UploadFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'ai' | 'manual' | null>(null);
  const [lastAiFailed, setLastAiFailed] = useState(false);
  const [tripPickerOpen, setTripPickerOpen] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const myTrips = useMemo(() => {
    if (!userId) return [];
    return allTrips
      .filter((t) => t.workerId === userId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }, [allTrips, userId]);

  const selectedTrip = useMemo(
    () => (tripId ? (myTrips.find((t) => t.id === tripId) ?? null) : null),
    [myTrips, tripId],
  );

  const tripLabel = (t: { startedAt: string; endedAt: string | null; title?: string | null; id: string }) => {
    const head = `${fmtDate(t.startedAt)}${t.title ? ` · ${t.title}` : ''}`;
    const visitCount = visitsByTrip(t.id).length;
    const meta =
      `${fmtTime(t.startedAt)}` +
      (t.endedAt ? `–${fmtTime(t.endedAt)}` : ' · 진행 중') +
      (visitCount > 0 ? ` · 방문 ${visitCount}건` : ' · 방문 없음');
    return { head, meta };
  };

  // 같은 외근 안 동일 제목 경고 — 직접 저장 분기에서만 의미.
  const dupWarning = useMemo(() => {
    if (!tripId || !title.trim()) return null;
    const dup = allReports.some(
      (r) => r.tripId === tripId && r.title.trim() === title.trim(),
    );
    return dup ? '이 외근에 같은 제목의 보고서가 이미 있습니다.' : null;
  }, [allReports, tripId, title]);

  const pickBefore = () =>
    promptPhotoSource(async (src) => {
      const f = await pickPhoto(src);
      if (f && mountedRef.current) setBeforePhoto(f);
    });

  const pickAfter = () =>
    promptPhotoSource(async (src) => {
      const f = await pickPhoto(src);
      if (f && mountedRef.current) setAfterPhoto(f);
    });

  // AI 진행 시각화 — 백엔드 streaming 미지원이라 시간 cutoff 시뮬레이션.
  const [elapsedSec, setElapsedSec] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTickerRef = useRef<((reset: boolean) => void) | null>(null);
  startTickerRef.current = (reset: boolean) => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (reset) setElapsedSec(0);
    tickRef.current = setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
  };
  const stopTicker = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };
  useEffect(() => () => stopTicker(), []);

  const handleAiGenerate = async () => {
    setError(null);
    setLastAiFailed(false);
    if (!notes.trim()) {
      setError('현장 메모를 입력해주세요');
      return;
    }
    setBusy('ai');
    startTickerRef.current?.(true);
    try {
      const r = await generate({
        notes: notes.trim(),
        title: title.trim() || undefined,
        tripId: tripId ?? undefined,
        beforePhoto: beforePhoto ?? undefined,
        afterPhoto: afterPhoto ?? undefined,
      });
      if (!mountedRef.current) return;
      if (r.ok) {
        router.replace(`/(tabs)/reports/${r.data.reportId ?? r.data.id}` as never);
      } else {
        setError(r.error);
        setLastAiFailed(true);
      }
    } finally {
      if (mountedRef.current) {
        setBusy(null);
        stopTicker();
      } else {
        stopTicker();
      }
    }
  };

  const handleManualSave = async () => {
    setError(null);
    if (!userId) return;
    const t = title.trim();
    if (t.length < 1 || t.length > 100) {
      setError('제목은 1~100자로 입력해주세요');
      return;
    }
    setBusy('manual');
    const result = await create({
      title: t,
      tripId: tripId ?? undefined,
    });
    if (!mountedRef.current) return;
    setBusy(null);
    if (result.ok) {
      router.replace(`/(tabs)/reports/${result.report.id}` as never);
    } else {
      Alert.alert('보고서 저장 실패', result.error);
    }
  };

  const stepLabel = (() => {
    if (elapsedSec < 3) return { idx: 1, text: '메모·사진 업로드 중' };
    if (elapsedSec < 12) return { idx: 2, text: 'AI 분석 중' };
    return { idx: 3, text: '문서 작성 중' };
  })();
  const remainEstSec = Math.max(0, 30 - elapsedSec);
  const isBusy = busy !== null;

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
        <Text style={styles.title}>보고서 작성</Text>
        <Text style={styles.subtitle}>
          제목을 입력하고 'AI 초안 받기' 또는 '직접 저장' 을 선택하세요. 현장별 전·중·후 사진은 저장 후 상세 화면에서 추가합니다.
        </Text>

        <Text style={styles.label}>연결할 외근 (선택)</Text>
        {myTrips.length === 0 ? (
          <Text style={styles.hint}>등록된 외근이 없습니다.</Text>
        ) : selectedTrip ? (
          <View style={styles.tripCardSelected}>
            <View style={styles.tripCardBody}>
              <Text style={[styles.tripItemDate, styles.tripItemTextActive]}>
                {tripLabel(selectedTrip).head}
              </Text>
              <Text style={[styles.tripItemMeta, styles.tripItemMetaActive]}>
                {tripLabel(selectedTrip).meta}
              </Text>
            </View>
            <View style={styles.tripCardActions}>
              <Pressable
                onPress={() => setTripPickerOpen(true)}
                style={({ pressed }) => [styles.tripCardBtn, pressed && styles.pressed]}
              >
                <Text style={styles.tripCardBtnText}>변경</Text>
              </Pressable>
              <Pressable
                onPress={() => setTripId(null)}
                style={({ pressed }) => [
                  styles.tripCardBtn,
                  styles.tripCardBtnGhost,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.tripCardBtnGhostText}>해제</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => setTripPickerOpen(true)}
            style={({ pressed }) => [styles.tripPickerBtn, pressed && styles.pressed]}
          >
            <Text style={styles.tripPickerBtnText}>+ 외근 선택</Text>
          </Pressable>
        )}

        <View style={styles.notesHeader}>
          <Text style={[styles.label, styles.labelInline]}>제목 *</Text>
          <Text style={styles.counter}>{title.length} / 100</Text>
        </View>
        <TextInput
          value={title}
          onChangeText={setTitle}
          style={styles.input}
          placeholder="예: 4/27 해운대 배수구 점검"
          maxLength={100}
        />
        <Text style={styles.hint}>AI 초안 시 미입력하면 AI 가 제목을 제안합니다.</Text>
        {dupWarning ? <Text style={styles.warn}>{dupWarning}</Text> : null}

        <View style={styles.notesHeader}>
          <Text style={[styles.label, styles.labelInline]}>현장 메모 (AI 초안용)</Text>
          <Text style={styles.counter}>{notes.length} / 50,000</Text>
        </View>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          style={[styles.input, styles.multiline]}
          placeholder="현장에서 관찰한 내용·조치 사항 — AI 초안 생성에 사용됩니다."
          multiline
          maxLength={50000}
        />

        <View style={styles.sectionDivider}>
          <View style={styles.dividerLine} />
          <Text style={styles.sectionDividerText}>조치 전·후 사진 (AI 초안용)</Text>
          <View style={styles.dividerLine} />
        </View>

        <Text style={styles.label}>조치 전 사진</Text>
        <View style={styles.photoBox}>
          {beforePhoto ? (
            <Image source={{ uri: beforePhoto.uri }} style={styles.photoPreview} />
          ) : null}
          <View style={styles.photoActions}>
            <Pressable
              onPress={pickBefore}
              style={({ pressed }) => [
                styles.photoBtn,
                styles.photoBtnPrimary,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.photoBtnText}>
                {beforePhoto ? '다시 선택' : '+ 사진 첨부'}
              </Text>
            </Pressable>
            {beforePhoto ? (
              <Pressable
                onPress={() => setBeforePhoto(null)}
                style={({ pressed }) => [styles.photoBtn, styles.photoBtnGhost, pressed && styles.pressed]}
              >
                <Text style={styles.photoBtnGhostText}>제거</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <Text style={styles.label}>조치 후 사진</Text>
        <View style={styles.photoBox}>
          {afterPhoto ? (
            <Image source={{ uri: afterPhoto.uri }} style={styles.photoPreview} />
          ) : null}
          <View style={styles.photoActions}>
            <Pressable
              onPress={pickAfter}
              style={({ pressed }) => [
                styles.photoBtn,
                styles.photoBtnPrimary,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.photoBtnText}>
                {afterPhoto ? '다시 선택' : '+ 사진 첨부'}
              </Text>
            </Pressable>
            {afterPhoto ? (
              <Pressable
                onPress={() => setAfterPhoto(null)}
                style={({ pressed }) => [styles.photoBtn, styles.photoBtnGhost, pressed && styles.pressed]}
              >
                <Text style={styles.photoBtnGhostText}>제거</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {busy === 'ai' ? (
          <View style={styles.progressBox}>
            <View style={styles.progressSteps}>
              {[1, 2, 3].map((i) => {
                const done = i < stepLabel.idx;
                const active = i === stepLabel.idx;
                return (
                  <View
                    key={i}
                    style={[
                      styles.progressDot,
                      done && styles.progressDotDone,
                      active && styles.progressDotActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.progressDotText,
                        (done || active) && styles.progressDotTextActive,
                      ]}
                    >
                      {i}
                    </Text>
                  </View>
                );
              })}
            </View>
            <Text style={styles.progressTitle}>
              {stepLabel.idx}/3 · {stepLabel.text}
            </Text>
            <Text style={styles.progressMeta}>
              {elapsedSec}초 경과
              {remainEstSec > 0 ? ` · 약 ${remainEstSec}초 남음` : ' · 마무리 중'}
            </Text>
          </View>
        ) : null}

        <View style={styles.actionRow}>
          <Pressable
            onPress={handleAiGenerate}
            disabled={isBusy}
            style={({ pressed }) => [
              styles.btn,
              styles.btnAi,
              (pressed || isBusy) && styles.pressed,
            ]}
          >
            <Text style={styles.btnText}>
              {busy === 'ai'
                ? 'AI 생성 중...'
                : lastAiFailed
                  ? '↻ AI 다시 시도'
                  : '✨ AI로 초안 받기'}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleManualSave}
            disabled={isBusy}
            style={({ pressed }) => [
              styles.btn,
              styles.btnManual,
              (pressed || isBusy) && styles.pressed,
            ]}
          >
            <Text style={styles.btnText}>
              {busy === 'manual' ? '저장 중...' : '✏ 직접 저장'}
            </Text>
          </Pressable>
        </View>

        <Pressable onPress={() => safeBack(router)} style={styles.cancel}>
          <Text style={styles.cancelText}>취소</Text>
        </Pressable>

        {busy === 'ai' ? (
          <Text style={styles.foot}>
            ⚠ AI 생성에 시간이 걸릴 수 있습니다. 화면을 떠나지 마세요.
          </Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
    <Modal
      visible={tripPickerOpen}
      animationType="fade"
      transparent
      onRequestClose={() => setTripPickerOpen(false)}
    >
      <Pressable style={styles.pickerBackdrop} onPress={() => setTripPickerOpen(false)}>
        <Pressable style={styles.pickerCard} onPress={() => undefined}>
          <Text style={styles.pickerTitle}>외근 선택</Text>
          <ScrollView style={styles.pickerList} contentContainerStyle={styles.pickerListContent}>
            {myTrips.map((t) => {
              const active = t.id === tripId;
              const { head, meta } = tripLabel(t);
              return (
                <Pressable
                  key={t.id}
                  onPress={() => {
                    setTripId(active ? null : t.id);
                    setTripPickerOpen(false);
                  }}
                  style={[styles.tripItem, active && styles.tripItemActive]}
                >
                  <Text style={[styles.tripItemDate, active && styles.tripItemTextActive]}>
                    {head}
                  </Text>
                  <Text style={[styles.tripItemMeta, active && styles.tripItemMetaActive]}>
                    {meta}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable
            onPress={() => setTripPickerOpen(false)}
            style={({ pressed }) => [styles.pickerCancel, pressed && styles.pressed]}
          >
            <Text style={styles.pickerCancelText}>취소</Text>
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
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  label: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '700',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  hint: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },
  warn: { color: colors.warning, fontSize: fontSize.sm, marginTop: spacing.xs },
  tripItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tripItemActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  tripCardSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  tripCardBody: { flex: 1, gap: 2 },
  tripCardActions: { flexDirection: 'row', gap: spacing.xs },
  tripCardBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  tripCardBtnText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '700',
  },
  tripCardBtnGhost: {
    borderColor: colors.border,
  },
  tripCardBtnGhostText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '700',
  },
  tripPickerBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  tripPickerBtnText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '700',
  },
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
  pickerCancel: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  pickerCancelText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '600' },
  tripItemDate: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600' },
  tripItemMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  tripItemMetaActive: { color: colors.primary },
  tripItemTextActive: { color: colors.primary, fontWeight: '700' },
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
  multiline: { minHeight: 160, textAlignVertical: 'top' },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  labelInline: { marginTop: 0, marginBottom: 0 },
  counter: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
  },
  sectionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  sectionDividerText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '700',
  },
  photoBox: { gap: spacing.sm },
  photoPreview: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  photoActions: { flexDirection: 'row', gap: spacing.sm },
  photoBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  photoBtnPrimary: { flex: 1 },
  photoBtnGhost: {
    borderColor: colors.danger,
    backgroundColor: colors.surface,
  },
  photoBtnText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600' },
  photoBtnGhostText: { fontSize: fontSize.sm, color: colors.danger, fontWeight: '700' },
  error: { color: colors.danger, fontSize: fontSize.sm, marginTop: spacing.md },
  progressBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary + '55',
    backgroundColor: colors.primary + '0d',
  },
  progressSteps: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  progressDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressDotDone: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  progressDotActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '20',
  },
  progressDotText: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '700' },
  progressDotTextActive: { color: colors.primary },
  progressTitle: { fontSize: fontSize.sm, color: colors.text, fontWeight: '700' },
  progressMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  actionRow: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  btn: {
    flex: 1,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  btnAi: { backgroundColor: colors.success },
  btnManual: { backgroundColor: colors.primary },
  btnText: { color: '#fff', fontSize: fontSize.base, fontWeight: '700' },
  pressed: { opacity: 0.85 },
  cancel: { alignItems: 'center', paddingVertical: spacing.md },
  cancelText: { color: colors.textMuted, fontSize: fontSize.sm },
  foot: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
