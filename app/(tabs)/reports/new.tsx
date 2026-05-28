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
import { safeBack } from '@/utils/backNavigation';
import { useTripStore } from '@/stores/tripStore';
import { useAuthStore } from '@/stores/authStore';
import { useVisitStore } from '@/stores/visitStore';
import { pickPhoto, promptPhotoSource, type UploadFile } from '@/utils/media';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize, fontWeight, lineHeight } from '@/theme/spacing';
import { opacity } from '@/theme/motion';

// ERD v2 통합 보고서 작성 — 본문(content) 제거. 두 분기:
//   AI 초안: POST /api/reports/generate (notes 필수, 조치 전·후 사진 활용 — fieldId 연결 시 field_report 저장)
//   직접 저장: POST /api/reports (title 필수). 현장별 전·중·후 사진은 상세 화면에서 관리.

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

  const tripLabel = (t: {
    startedAt: string;
    endedAt: string | null;
    title?: string | null;
    id: string;
  }) => {
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
            <Card padding="md" style={styles.tripCardSelected}>
              <View style={styles.tripCardBody}>
                <Text style={styles.tripItemDateActive}>
                  {tripLabel(selectedTrip).head}
                </Text>
                <Text style={styles.tripItemMetaActive}>
                  {tripLabel(selectedTrip).meta}
                </Text>
              </View>
              <View style={styles.tripCardActions}>
                <Button
                  onPress={() => setTripPickerOpen(true)}
                  variant="secondary"
                  size="sm"
                  leftIcon="swap-horizontal"
                >
                  변경
                </Button>
                <Button
                  onPress={() => setTripId(null)}
                  variant="ghost"
                  size="sm"
                >
                  해제
                </Button>
              </View>
            </Card>
          ) : (
            <Pressable
              onPress={() => setTripPickerOpen(true)}
              style={({ pressed }) => [
                styles.tripPickerBtn,
                pressed && { opacity: opacity.pressed },
              ]}
            >
              <Ionicons name="add-circle-outline" size={18} color={colors.textMuted} />
              <Text style={styles.tripPickerBtnText}>외근 선택</Text>
            </Pressable>
          )}

          <View style={styles.notesHeader}>
            <Text style={[styles.label, styles.labelInline]}>제목 *</Text>
            <Text style={styles.counter}>{title.length} / 100</Text>
          </View>
          <Input
            value={title}
            onChangeText={setTitle}
            placeholder="예: 4/27 해운대 배수구 점검"
            maxLength={100}
            helperText="AI 초안 시 미입력하면 AI 가 제목을 제안합니다."
          />
          {dupWarning ? (
            <View style={styles.warnRow}>
              <Ionicons name="warning-outline" size={14} color={colors.warning} />
              <Text style={styles.warn}>{dupWarning}</Text>
            </View>
          ) : null}

          <View style={styles.notesHeader}>
            <Text style={[styles.label, styles.labelInline]}>현장 메모 (AI 초안용)</Text>
            <Text style={styles.counter}>{notes.length} / 50,000</Text>
          </View>
          <Input
            value={notes}
            onChangeText={setNotes}
            placeholder="현장에서 관찰한 내용·조치 사항 — AI 초안 생성에 사용됩니다."
            multiline
            maxLength={50000}
            style={styles.multiline}
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
              <Button
                onPress={pickBefore}
                variant="secondary"
                fullWidth
                leftIcon="camera"
                style={styles.photoBtnFlex}
              >
                {beforePhoto ? '다시 선택' : '사진 첨부'}
              </Button>
              {beforePhoto ? (
                <Button
                  onPress={() => setBeforePhoto(null)}
                  variant="ghost"
                  leftIcon="trash"
                >
                  제거
                </Button>
              ) : null}
            </View>
          </View>

          <Text style={styles.label}>조치 후 사진</Text>
          <View style={styles.photoBox}>
            {afterPhoto ? (
              <Image source={{ uri: afterPhoto.uri }} style={styles.photoPreview} />
            ) : null}
            <View style={styles.photoActions}>
              <Button
                onPress={pickAfter}
                variant="secondary"
                fullWidth
                leftIcon="camera"
                style={styles.photoBtnFlex}
              >
                {afterPhoto ? '다시 선택' : '사진 첨부'}
              </Button>
              {afterPhoto ? (
                <Button
                  onPress={() => setAfterPhoto(null)}
                  variant="ghost"
                  leftIcon="trash"
                >
                  제거
                </Button>
              ) : null}
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {busy === 'ai' ? (
            <Card padding="md" style={styles.progressBox}>
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
            </Card>
          ) : null}

          <View style={styles.actionRow}>
            <Button
              onPress={handleAiGenerate}
              disabled={isBusy}
              loading={busy === 'ai'}
              size="lg"
              leftIcon={lastAiFailed ? 'refresh' : 'sparkles'}
              style={styles.actionFlex}
            >
              {lastAiFailed ? 'AI 다시 시도' : 'AI 초안 받기'}
            </Button>
            <Button
              onPress={handleManualSave}
              disabled={isBusy}
              loading={busy === 'manual'}
              variant="secondary"
              size="lg"
              leftIcon="save"
              style={styles.actionFlex}
            >
              직접 저장
            </Button>
          </View>

          <Button onPress={() => safeBack(router)} variant="ghost" size="sm" fullWidth>
            취소
          </Button>

          {busy === 'ai' ? (
            <View style={styles.footRow}>
              <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
              <Text style={styles.foot}>
                AI 생성에 시간이 걸릴 수 있습니다. 화면을 떠나지 마세요.
              </Text>
            </View>
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
                    style={({ pressed }) => [
                      styles.tripItem,
                      active && styles.tripItemActive,
                      pressed && { opacity: opacity.pressed },
                    ]}
                  >
                    <Text style={[styles.tripItemDate, active && styles.tripItemDateActive]}>
                      {head}
                    </Text>
                    <Text style={[styles.tripItemMeta, active && styles.tripItemMetaActive]}>
                      {meta}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Button
              onPress={() => setTripPickerOpen(false)}
              variant="ghost"
              size="sm"
              fullWidth
            >
              취소
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
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.heavy,
    color: colors.text,
    lineHeight: lineHeight.xl,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
    lineHeight: lineHeight.sm,
  },
  label: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: fontWeight.bold,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  hint: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },
  warnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  warn: { color: colors.warning, fontSize: fontSize.sm },
  // 외근 선택 — 선택된 카드
  tripCardSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  tripCardBody: { flex: 1, gap: 2 },
  tripCardActions: { flexDirection: 'row', gap: spacing.xs },
  // 외근 선택 — 미선택 dashed 진입
  tripPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tripPickerBtnText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: fontWeight.bold,
  },
  // 외근 picker modal
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
    backgroundColor: colors.primaryMuted,
  },
  tripItemDate: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: fontWeight.semibold,
  },
  tripItemMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  tripItemDateActive: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: fontWeight.bold,
  },
  tripItemMetaActive: {
    fontSize: fontSize.xs,
    color: colors.primary,
    marginTop: 2,
  },
  // 입력
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
    fontWeight: fontWeight.semibold,
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
    fontWeight: fontWeight.bold,
  },
  // 사진
  photoBox: { gap: spacing.sm },
  photoPreview: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  photoActions: { flexDirection: 'row', gap: spacing.sm },
  photoBtnFlex: { flex: 1 },
  // 에러
  error: { color: colors.danger, fontSize: fontSize.sm, marginTop: spacing.md },
  // AI 진행 박스
  progressBox: {
    marginTop: spacing.md,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
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
    backgroundColor: colors.surface,
  },
  progressDotText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: fontWeight.bold,
  },
  progressDotTextActive: { color: colors.primary },
  progressTitle: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: fontWeight.bold,
  },
  progressMeta: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  // 액션
  actionRow: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionFlex: { flex: 1 },
  // 푸터
  footRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  foot: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
