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
import { useFieldStore } from '@/stores/fieldStore';
import { pickPhoto, promptPhotoSource, downloadToUploadFile, type UploadFile } from '@/utils/media';
import { promptChoice } from '@/components/WebChoiceModal';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

// 통합 보고서 작성 화면 — 같은 폼에서 두 가지 결과 분기:
//   ✨ AI 초안: POST /api/reports/generate (notes 필수, 사진/위치/추가 메모 활용)
//   ✏ 직접 저장: POST /api/reports (title 1-100, content 10-50000, summary 선택)
// 본문 입력은 두 분기 공통 — generate 의 'notes' 와 create 의 'content' 가 같은 텍스트.

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  const allTextMemos = useVisitStore((s) => s.textMemos);
  const allPhotos = useVisitStore((s) => s.photos);
  const allFields = useFieldStore((s) => s.fields);

  const [tripId, setTripId] = useState<string | null>(params.tripId ?? null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [summary, setSummary] = useState('');
  const [extraNotes, setExtraNotes] = useState('');
  const [location, setLocation] = useState('');
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

  const importableBlocks = useMemo(() => {
    if (!tripId) return [];
    const visits = visitsByTrip(tripId);
    return visits.map((v) => {
      const field = allFields.find((f) => f.id === v.fieldId);
      const memos = allTextMemos.filter((m) => m.visitId === v.id);
      return { visit: v, field, memos };
    });
  }, [tripId, visitsByTrip, allTextMemos, allFields]);

  const importableMemoCount = useMemo(
    () => importableBlocks.reduce((sum, b) => sum + b.memos.length, 0),
    [importableBlocks],
  );

  const importablePhotos = useMemo(() => {
    if (!tripId) return [];
    const visits = visitsByTrip(tripId);
    const visitIds = new Set(visits.map((v) => v.id));
    return allPhotos
      .filter((p) => p.visitId && visitIds.has(p.visitId))
      .filter((p) => p.fileUrl && /^https?:\/\//.test(p.fileUrl))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [tripId, visitsByTrip, allPhotos]);

  // 같은 외근 안 동일 제목 경고 — 직접 저장 분기에서만 의미. AI 분기는 백엔드가 새 제목 생성 가능.
  const dupWarning = useMemo(() => {
    if (!tripId || !title.trim()) return null;
    const dup = allReports.some(
      (r) =>
        r.tripId === tripId &&
        r.deletedAt === null &&
        r.title.trim() === title.trim(),
    );
    return dup ? '이 외근에 같은 제목의 보고서가 이미 있습니다.' : null;
  }, [allReports, tripId, title]);

  const [importingPhoto, setImportingPhoto] = useState<string | null>(null);

  const importPhotoToSlot = async (photoUrl: string, slot: 'before' | 'after') => {
    setImportingPhoto(photoUrl);
    const file = await downloadToUploadFile(photoUrl);
    if (!mountedRef.current) return;
    setImportingPhoto(null);
    if (!file) {
      Alert.alert('사진 가져오기 실패', '사진을 다운로드할 수 없습니다. 네트워크를 확인해주세요.');
      return;
    }
    if (slot === 'before') setBeforePhoto(file);
    else setAfterPhoto(file);
  };

  const handleImportPhotoTap = (photoUrl: string) => {
    promptChoice('사진 위치 선택', '어느 슬롯에 넣을까요?', [
      { label: '조치 전', onPress: () => void importPhotoToSlot(photoUrl, 'before') },
      { label: '조치 후', onPress: () => void importPhotoToSlot(photoUrl, 'after') },
      { label: '취소', style: 'cancel' },
    ]);
  };

  const buildImportText = () => {
    const blocks = importableBlocks
      .filter((b) => b.memos.length > 0)
      .map((b) => {
        const time = fmtDateTime(b.visit.visitedAt);
        const where = b.field?.address ?? '알 수 없는 현장';
        const lines = b.memos.map((m) => `- ${m.content}`).join('\n');
        return `[${time} · ${where}]\n${lines}`;
      });
    return blocks.join('\n\n');
  };

  const handleSelectTrip = (newTripId: string | null) => {
    setTripId(newTripId);
    if (!newTripId) return;
    if (location.trim().length > 0) return;
    const visits = visitsByTrip(newTripId);
    if (visits.length === 0) return;
    const firstField = allFields.find((f) => f.id === visits[0].fieldId);
    const lastField = allFields.find((f) => f.id === visits[visits.length - 1].fieldId);
    const candidate = firstField?.address ?? lastField?.address;
    if (candidate) setLocation(candidate);
  };

  const handleImportFromTrip = () => {
    if (importableMemoCount === 0) return;
    const compiled = buildImportText();
    if (!compiled) return;
    if (body.trim().length === 0) {
      setBody(compiled);
      return;
    }
    promptChoice(
      '외근 메모 가져오기',
      `${importableMemoCount}건의 외근 메모를 어떻게 처리할까요?`,
      [
        { label: '이어 붙이기', onPress: () => setBody((prev) => `${prev}\n\n${compiled}`) },
        { label: '교체', style: 'destructive', onPress: () => setBody(compiled) },
        { label: '취소', style: 'cancel' },
      ],
    );
  };

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
    if (!body.trim()) {
      setError('본문(현장 메모)을 입력해주세요');
      return;
    }
    setBusy('ai');
    startTickerRef.current?.(true);
    try {
      const r = await generate({
        notes: body.trim(),
        title: title.trim() || undefined,
        extraNotes: extraNotes.trim() || undefined,
        tripId: tripId ?? undefined,
        location: location.trim() || undefined,
        beforePhoto: beforePhoto ?? undefined,
        afterPhoto: afterPhoto ?? undefined,
      });
      if (!mountedRef.current) return;
      if (r.ok) {
        router.replace(`/(tabs)/reports/${r.data.id}` as never);
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
    const c = body.trim();
    if (t.length < 1 || t.length > 100) {
      setError('직접 저장 시 제목은 1~100자로 입력해주세요');
      return;
    }
    if (c.length < 10 || c.length > 50000) {
      setError('직접 저장 시 본문은 10~50,000자로 입력해주세요');
      return;
    }
    setBusy('manual');
    const result = await create({
      title: t,
      content: c,
      summary: summary.trim() || undefined,
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
          본문을 작성한 뒤 하단에서 'AI 초안 받기' 또는 '직접 저장' 을 선택하세요.
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
                onPress={() => handleSelectTrip(null)}
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
          <Text style={[styles.label, styles.labelInline]}>제목</Text>
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
          <View style={styles.notesHeaderLeft}>
            <Text style={[styles.label, styles.labelInline]}>본문 *</Text>
            <Text style={styles.counter}>{body.length} / 50,000</Text>
          </View>
          {tripId && importableMemoCount > 0 ? (
            <Pressable
              onPress={handleImportFromTrip}
              style={({ pressed }) => [styles.importBtn, pressed && styles.pressed]}
            >
              <Text style={styles.importBtnText}>
                📎 외근 메모 {importableMemoCount}건 가져오기
              </Text>
            </Pressable>
          ) : null}
        </View>
        <TextInput
          value={body}
          onChangeText={setBody}
          style={[styles.input, styles.multiline]}
          placeholder="현장에서 관찰한 내용·조치 사항"
          multiline
          maxLength={50000}
        />

        <View style={styles.notesHeader}>
          <Text style={[styles.label, styles.labelInline]}>요약 (선택)</Text>
          <Text style={styles.counter}>{summary.length} / 200</Text>
        </View>
        <TextInput
          value={summary}
          onChangeText={setSummary}
          style={styles.input}
          placeholder="한 줄 요약 — 직접 저장 시 목록·공유에 노출"
          maxLength={200}
        />

        <View style={styles.sectionDivider}>
          <View style={styles.dividerLine} />
          <Text style={styles.sectionDividerText}>AI 초안 부가 자료</Text>
          <View style={styles.dividerLine} />
        </View>
        <Text style={styles.sectionHint}>
          아래 항목은 'AI 초안 받기' 시에만 사용됩니다. 직접 저장 시에는 무시됩니다.
        </Text>

        <View style={styles.notesHeader}>
          <Text style={[styles.label, styles.labelInline]}>추가 메모</Text>
          <Text style={styles.counter}>{extraNotes.length} / 2000</Text>
        </View>
        <TextInput
          value={extraNotes}
          onChangeText={setExtraNotes}
          style={[styles.input, styles.multilineSmall]}
          placeholder="기타 보충 사항"
          multiline
          maxLength={2000}
        />

        <Text style={styles.label}>작업 위치</Text>
        <TextInput
          value={location}
          onChangeText={setLocation}
          style={styles.input}
          placeholder="예: 부산광역시 해운대구 우동 123"
        />

        {tripId && importablePhotos.length > 0 ? (
          <View>
            <Text style={styles.label}>외근 사진 가져오기 ({importablePhotos.length}장)</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.galleryRow}
            >
              {importablePhotos.map((p) => {
                const isLoading = importingPhoto === p.fileUrl;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => handleImportPhotoTap(p.fileUrl)}
                    disabled={isLoading}
                    style={({ pressed }) => [
                      styles.galleryThumbBox,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Image source={{ uri: p.fileUrl }} style={styles.galleryThumb} />
                    {isLoading ? (
                      <View style={styles.galleryThumbOverlay}>
                        <Text style={styles.galleryThumbOverlayText}>가져오는 중...</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={styles.hint}>썸네일을 누르면 조치 전·후 슬롯에 배치합니다.</Text>
          </View>
        ) : null}

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
                    handleSelectTrip(active ? null : t.id);
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
  multilineSmall: { minHeight: 80, textAlignVertical: 'top' },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  notesHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  labelInline: { marginTop: 0, marginBottom: 0 },
  counter: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
  },
  importBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primary + '15',
  },
  importBtnText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '700',
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
  sectionHint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  galleryRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  galleryThumbBox: {
    width: 88,
    height: 88,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  galleryThumb: { width: '100%', height: '100%' },
  galleryThumbOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryThumbOverlayText: {
    color: '#fff',
    fontSize: fontSize.xs,
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
