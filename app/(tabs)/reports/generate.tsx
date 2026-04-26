import { useMemo, useState } from 'react';
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

export default function GenerateReport() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string }>();

  const generate = useReportStore((s) => s.generate);
  const allTrips = useTripStore((s) => s.trips);
  const userId = useAuthStore((s) => s.user?.id);

  const [tripId, setTripId] = useState<string | null>(params.tripId ?? null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [extraNotes, setExtraNotes] = useState('');
  const [location, setLocation] = useState('');
  const [beforePhoto, setBeforePhoto] = useState<UploadFile | null>(null);
  const [afterPhoto, setAfterPhoto] = useState<UploadFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const myTrips = useMemo(() => {
    if (!userId) return [];
    return allTrips
      .filter((t) => t.workerId === userId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }, [allTrips, userId]);

  const pickBefore = () =>
    promptPhotoSource(async (src) => {
      const f = await pickPhoto(src);
      if (f) setBeforePhoto(f);
    });

  const pickAfter = () =>
    promptPhotoSource(async (src) => {
      const f = await pickPhoto(src);
      if (f) setAfterPhoto(f);
    });

  const handleGenerate = async () => {
    setError(null);
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
    setBusy(false);
    if (r.ok) {
      router.replace(`/(tabs)/reports/${r.data.id}` as never);
    } else {
      Alert.alert('AI 보고서 생성 실패', r.error);
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
            {myTrips.slice(0, 8).map((t) => {
              const active = t.id === tripId;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setTripId(active ? null : t.id)}
                  style={[styles.tripItem, active && styles.tripItemActive]}
                >
                  <Text style={[styles.tripItemText, active && styles.tripItemTextActive]}>
                    {fmtDate(t.startedAt)} · #{t.id}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <Text style={styles.label}>제목 (선택 — 미입력 시 AI 제안)</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          style={styles.input}
          placeholder="예: 4/27 해운대 배수구 점검"
          maxLength={100}
        />

        <Text style={styles.label}>현장 메모 *</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          style={[styles.input, styles.multiline]}
          placeholder="현장에서 관찰한 내용·조치 사항"
          multiline
          maxLength={5000}
        />

        <Text style={styles.label}>추가 메모 (선택)</Text>
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
            {busy ? 'AI 생성 중... (5~30초)' : 'AI 보고서 생성'}
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
  tripItemText: { fontSize: fontSize.sm, color: colors.text },
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
