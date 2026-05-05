import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useReportStore } from '@/stores/reportStore';
import { useTripStore } from '@/stores/tripStore';
import { useAuthStore } from '@/stores/authStore';
import { useVisitStore } from '@/stores/visitStore';
import { useFieldStore } from '@/stores/fieldStore';
import { pickPhoto, promptPhotoSource, type UploadFile } from '@/utils/media';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

// Phase 3 §2.1 — POST /api/reports/generate (Bearer + multipart)
//   필수: notes
//   선택: title, extraNotes, tripId, location, before_photo, after_photo

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

export default function GenerateReport() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string }>();

  const generate = useReportStore((s) => s.generate);
  const allTrips = useTripStore((s) => s.trips);
  const userId = useAuthStore((s) => s.user?.id);
  const visitsByTrip = useVisitStore((s) => s.byTrip);
  const allTextMemos = useVisitStore((s) => s.textMemos);
  const allFields = useFieldStore((s) => s.fields);

  const [tripId, setTripId] = useState<string | null>(params.tripId ?? null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [extraNotes, setExtraNotes] = useState('');
  const [location, setLocation] = useState('');
  const [beforePhoto, setBeforePhoto] = useState<UploadFile | null>(null);
  const [afterPhoto, setAfterPhoto] = useState<UploadFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // unmount 후 setState 경고 방지 — pickPhoto/generate 가 비동기라 화면 떠난 후 콜백 가능
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

  // 선택한 외근의 visit 들에 첨부된 글자 메모 — 자동 import 대상.
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

  // 외근 선택 토글 + 위치 자동 prefill (사용자가 직접 입력하지 않은 상태에서만).
  const handleSelectTrip = (newTripId: string | null) => {
    setTripId(newTripId);
    if (!newTripId) return;
    if (location.trim().length > 0) return; // 사용자 입력 보존
    const visits = visitsByTrip(newTripId);
    if (visits.length === 0) return;
    // 첫 방문 현장 주소 우선, 없으면 마지막 방문 — 다수 visit 의 일반화된 라벨로 사용.
    const firstField = allFields.find((f) => f.id === visits[0].fieldId);
    const lastField = allFields.find((f) => f.id === visits[visits.length - 1].fieldId);
    const candidate = firstField?.address ?? lastField?.address;
    if (candidate) setLocation(candidate);
  };

  const handleImportFromTrip = () => {
    if (importableMemoCount === 0) return;
    const compiled = buildImportText();
    if (!compiled) return;
    if (notes.trim().length === 0) {
      setNotes(compiled);
      return;
    }
    Alert.alert(
      '외근 메모 가져오기',
      `${importableMemoCount}건의 외근 메모를 어떻게 처리할까요?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '이어 붙이기',
          onPress: () => setNotes((prev) => `${prev}\n\n${compiled}`),
        },
        {
          text: '교체',
          style: 'destructive',
          onPress: () => setNotes(compiled),
        },
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

  // 마지막 시도 결과 — 실패 시 재시도 노출 / 성공 시 즉시 라우팅이라 무관.
  const [lastAttemptFailed, setLastAttemptFailed] = useState(false);

  const handleGenerate = async () => {
    setError(null);
    setLastAttemptFailed(false);
    if (!notes.trim()) {
      setError('현장 메모(notes)를 입력해주세요');
      return;
    }
    setBusy(true);
    const r = await generate({
      notes: notes.trim(),
      title: title.trim() || undefined,
      extraNotes: extraNotes.trim() || undefined,
      tripId: tripId ?? undefined,
      location: location.trim() || undefined,
      beforePhoto: beforePhoto ?? undefined,
      afterPhoto: afterPhoto ?? undefined,
    });
    if (!mountedRef.current) return;
    setBusy(false);
    if (r.ok) {
      router.replace(`/(tabs)/reports/${r.data.id}` as never);
    } else {
      setError(r.error);
      setLastAttemptFailed(true);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>AI 보고서 생성</Text>
        <Text style={styles.subtitle}>
          현장 메모와 조치 전·후 사진을 넘기면 Gemini 가 본문을 작성하고 Word 파일을 만들어줍니다.
        </Text>

        <Text style={styles.label}>연결할 외근 (선택)</Text>
        {myTrips.length === 0 ? (
          <Text style={styles.hint}>등록된 외근이 없습니다.</Text>
        ) : (
          <View style={styles.tripList}>
            {myTrips.map((t) => {
              const active = t.id === tripId;
              const visitCount = visitsByTrip(t.id).length;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => handleSelectTrip(active ? null : t.id)}
                  style={[styles.tripItem, active && styles.tripItemActive]}
                >
                  <Text style={[styles.tripItemDate, active && styles.tripItemTextActive]}>
                    {fmtDate(t.startedAt)}
                  </Text>
                  <Text style={[styles.tripItemMeta, active && styles.tripItemMetaActive]}>
                    {fmtTime(t.startedAt)}
                    {t.endedAt ? `–${fmtTime(t.endedAt)}` : ' · 진행 중'}
                    {visitCount > 0 ? ` · 방문 ${visitCount}건` : ' · 방문 없음'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={styles.notesHeader}>
          <Text style={[styles.label, styles.labelInline]}>제목 (선택 — 미입력 시 AI 제안)</Text>
          <Text style={styles.counter}>{title.length} / 100</Text>
        </View>
        <TextInput
          value={title}
          onChangeText={setTitle}
          style={styles.input}
          placeholder="예: 4/27 해운대 배수구 점검"
          maxLength={100}
        />

        <View style={styles.notesHeader}>
          <View style={styles.notesHeaderLeft}>
            <Text style={[styles.label, styles.labelInline]}>현장 메모 *</Text>
            <Text style={styles.counter}>{notes.length} / 5000</Text>
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
          value={notes}
          onChangeText={setNotes}
          style={[styles.input, styles.multiline]}
          placeholder="현장에서 관찰한 내용·조치 사항"
          multiline
          maxLength={5000}
        />

        <View style={styles.notesHeader}>
          <Text style={[styles.label, styles.labelInline]}>추가 메모 (선택)</Text>
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

        <Text style={styles.label}>작업 위치 (선택)</Text>
        <TextInput
          value={location}
          onChangeText={setLocation}
          style={styles.input}
          placeholder="예: 부산광역시 해운대구 우동 123"
        />

        <Text style={styles.label}>조치 전 사진 (선택)</Text>
        <View style={styles.photoBox}>
          {beforePhoto ? (
            <Image source={{ uri: beforePhoto.uri }} style={styles.photoPreview} />
          ) : null}
          <Pressable
            onPress={pickBefore}
            style={({ pressed }) => [styles.photoBtn, pressed && styles.pressed]}
          >
            <Text style={styles.photoBtnText}>
              {beforePhoto ? '다시 선택' : '+ 사진 첨부'}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.label}>조치 후 사진 (선택)</Text>
        <View style={styles.photoBox}>
          {afterPhoto ? (
            <Image source={{ uri: afterPhoto.uri }} style={styles.photoPreview} />
          ) : null}
          <Pressable
            onPress={pickAfter}
            style={({ pressed }) => [styles.photoBtn, pressed && styles.pressed]}
          >
            <Text style={styles.photoBtnText}>
              {afterPhoto ? '다시 선택' : '+ 사진 첨부'}
            </Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          onPress={handleGenerate}
          disabled={busy}
          style={({ pressed }) => [styles.btn, (pressed || busy) && styles.pressed]}
        >
          <Text style={styles.btnText}>
            {busy
              ? 'AI 생성 중... (5~30초)'
              : lastAttemptFailed
                ? '↻ 다시 시도'
                : 'AI 보고서 생성'}
          </Text>
        </Pressable>

        <Pressable onPress={() => router.back()} style={styles.cancel}>
          <Text style={styles.cancelText}>취소</Text>
        </Pressable>

        <Text style={styles.foot}>
          ⚠ 생성에 시간이 걸릴 수 있습니다. 화면을 떠나지 마세요.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
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
  hint: { fontSize: fontSize.sm, color: colors.textMuted },
  tripList: { gap: spacing.xs },
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
  multiline: { minHeight: 140, textAlignVertical: 'top' },
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
  multilineSmall: { minHeight: 80, textAlignVertical: 'top' },
  photoBox: { gap: spacing.sm },
  photoPreview: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  photoBtn: {
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  photoBtnText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600' },
  error: { color: colors.danger, fontSize: fontSize.sm, marginTop: spacing.md },
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
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
