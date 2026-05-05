import { useEffect, useRef, useState } from 'react';
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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFieldStore } from '@/stores/fieldStore';
import { useTripStore } from '@/stores/tripStore';
import { useVisitStore } from '@/stores/visitStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { VISIT_STATUS_VALUES, VISIT_STATUS_LABEL, type VisitStatus } from '@/types/entities';
import { EmptyState } from '@/components/EmptyState';
import {
  pickPhoto,
  pickDocument,
  promptPhotoSource,
  createVoiceRecorder,
  VOICE_MAX_SECONDS,
  type VoiceRecorder,
} from '@/utils/media';
import * as FileSystem from 'expo-file-system';
import { PhotoGrid, VoiceMemoList } from '@/components/AttachmentPreview';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

export default function FieldCheckin() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const fieldId = id ?? '';
  const router = useRouter();

  const field = useFieldStore((s) => s.getById(fieldId));
  const activeTripId = useTripStore((s) => s.activeTripId);
  const checkIn = useVisitStore((s) => s.checkIn);
  const setResult = useVisitStore((s) => s.setResult);
  const addTextMemo = useVisitStore((s) => s.addTextMemo);
  const addPhoto = useVisitStore((s) => s.addPhoto);
  const addVoiceMemo = useVisitStore((s) => s.addVoiceMemo);
  const memosByVisit = useVisitStore((s) => s.memosByVisit);
  const photosByVisit = useVisitStore((s) => s.photosByVisit);
  const allVoiceMemos = useVisitStore((s) => s.voiceMemos);
  const findDestination = useDestinationStore((s) => s.findByTripField);
  const markDestinationArrived = useDestinationStore((s) => s.markArrived);

  const [visitId, setVisitId] = useState<string | null>(null);
  const [memoText, setMemoText] = useState('');
  const [status, setStatus] = useState<VisitStatus>('normal');
  const [etcReason, setEtcReason] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // checkIn 중복 호출 가드 — StrictMode dev 더블 마운트 / 빠른 재 mount 시 visit 두 번 생성 방지
  const checkInGuardRef = useRef(false);

  useEffect(() => {
    if (
      activeTripId !== null &&
      fieldId &&
      visitId === null &&
      !checkInGuardRef.current
    ) {
      checkInGuardRef.current = true;
      void (async () => {
        const r = await checkIn(activeTripId, fieldId);
        if (r.ok) {
          setVisitId(r.visit.id);
        } else {
          checkInGuardRef.current = false;
          Alert.alert('체크인 실패', r.error);
        }
      })();
    }
  }, [activeTripId, fieldId, visitId, checkIn]);

  if (!field) {
    return <EmptyState title="현장을 찾을 수 없습니다" />;
  }

  if (activeTripId === null) {
    return (
      <EmptyState
        title="외근 시작 후 체크인 가능합니다"
        description="외근 탭에서 외근을 시작해주세요"
      />
    );
  }

  const memos = visitId !== null ? memosByVisit(visitId) : [];
  const photos = visitId !== null ? photosByVisit(visitId) : [];

  const handleAddMemo = async () => {
    if (!visitId || !memoText.trim()) return;
    const r = await addTextMemo(visitId, memoText.trim());
    if (r.ok) {
      setMemoText('');
    } else {
      Alert.alert('메모 추가 실패', r.error);
    }
  };

  const uploadPhoto = async (source: 'camera' | 'library') => {
    if (!visitId) return;
    setPhotoBusy(true);
    try {
      const file = await pickPhoto(source);
      if (!file) return;
      const r = await addPhoto(visitId, file);
      if (!r.ok) Alert.alert('사진 추가 실패', r.error);
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleAddPhoto = () => {
    if (!visitId || photoBusy) return;
    promptPhotoSource((src) => void uploadPhoto(src));
  };

  // 일반 파일 첨부 — mime 별 라우팅:
  //   image/* → 사진 endpoint, audio/* → 음성 endpoint, text/* → 본문 텍스트 메모, 기타 → 안내
  const handlePickDocument = async () => {
    if (!visitId) return;
    const file = await pickDocument();
    if (!file) return;
    const mime = (file.type || '').toLowerCase();
    setPhotoBusy(true);
    try {
      if (mime.startsWith('image/')) {
        const r = await addPhoto(visitId, file);
        if (!r.ok) Alert.alert('파일 업로드 실패', r.error);
        return;
      }
      if (mime.startsWith('audio/')) {
        const r = await addVoiceMemo(visitId, file);
        if (!r.ok) Alert.alert('파일 업로드 실패', r.error);
        return;
      }
      if (mime.startsWith('text/')) {
        // 텍스트 파일 → 본문 메모로 변환. RN Android 는 fetch 가 file:// 를 지원 안 하므로
        // expo-file-system 의 readAsStringAsync 사용.
        try {
          const text = await FileSystem.readAsStringAsync(file.uri);
          const trimmed = text.slice(0, 2000);
          if (!trimmed.trim()) {
            Alert.alert('빈 파일', '내용이 없는 파일입니다.');
            return;
          }
          const r = await addTextMemo(visitId, `[${file.name}]\n${trimmed}`);
          if (!r.ok) Alert.alert('파일 업로드 실패', r.error);
        } catch (e) {
          Alert.alert(
            '파일 업로드 실패',
            e instanceof Error ? e.message : '파일을 읽을 수 없습니다',
          );
        }
        return;
      }
      Alert.alert(
        '지원하지 않는 형식',
        `'${file.name}'\n현재 사진(image/*)·음성(audio/*)·텍스트(text/*) 형식만 첨부 가능합니다.`,
      );
    } finally {
      setPhotoBusy(false);
    }
  };

  const startRecording = async () => {
    if (!visitId || recording) return;
    const rec = createVoiceRecorder();
    const ok = await rec.start();
    if (!ok) return;
    recorderRef.current = rec;
    setRecording(true);
    setRecordSec(0);
    tickRef.current = setInterval(() => {
      setRecordSec((s) => {
        if (s + 1 >= VOICE_MAX_SECONDS) {
          void stopRecording();
          return VOICE_MAX_SECONDS;
        }
        return s + 1;
      });
    }, 1000);
  };

  const stopRecording = async () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setRecording(false);
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (!rec || !visitId) return;
    const result = await rec.stop();
    if (!result) return;
    const r = await addVoiceMemo(visitId, result.file, result.durationSec);
    if (!r.ok) Alert.alert('음성 메모 추가 실패', r.error);
  };

  // 화면 떠날 때 녹음 정리
  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      void recorderRef.current?.cancel();
    };
  }, []);

  const handleSaveResult = async () => {
    if (!visitId) return;
    if (status === 'other' && etcReason.trim().length < 10) {
      return;
    }
    const reason = status === 'other' ? etcReason.trim() : undefined;
    const r = await setResult(visitId, status, reason);
    if (!r.ok) {
      Alert.alert('상태 저장 실패', r.error);
      return;
    }
    if (activeTripId !== null) {
      const dest = findDestination(activeTripId, fieldId);
      if (dest && dest.status === 'pending') {
        markDestinationArrived(dest.id);
      }
    }
    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.headerTitle}>체크인 완료</Text>
          <Text style={styles.headerSub}>{field.address}</Text>
          <Text style={styles.headerSubMuted}>{field.addressDetail}</Text>
        </View>

        <Text style={styles.sectionTitle}>텍스트 메모</Text>
        <TextInput
          value={memoText}
          onChangeText={setMemoText}
          style={[styles.input, { minHeight: 80 }]}
          placeholder="메모를 입력하세요 (최대 2000자)"
          multiline
          maxLength={2000}
        />
        <Pressable
          onPress={handleAddMemo}
          style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}
        >
          <Text style={styles.smallBtnText}>메모 추가</Text>
        </Pressable>
        {memos.length > 0 ? (
          <View style={styles.memoList}>
            {memos.map((m) => (
              <View key={m.id} style={styles.memoItem}>
                <Text style={styles.memoText}>{m.content}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>사진·파일</Text>
        <View style={styles.btnRow}>
          <Pressable
            onPress={handleAddPhoto}
            disabled={photoBusy || !visitId}
            style={({ pressed }) => [
              styles.smallBtn,
              (pressed || photoBusy) && styles.pressed,
            ]}
          >
            <Text style={styles.smallBtnText}>
              {photoBusy ? '업로드 중...' : '+ 사진'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void handlePickDocument()}
            disabled={photoBusy || !visitId}
            style={({ pressed }) => [
              styles.smallBtn,
              (pressed || photoBusy) && styles.pressed,
            ]}
          >
            <Text style={styles.smallBtnText}>📎 파일 첨부</Text>
          </Pressable>
        </View>
        <PhotoGrid photos={photos.map((p) => ({ id: p.id, fileUrl: p.fileUrl }))} />

        <Text style={styles.sectionTitle}>음성 메모 (최대 5분)</Text>
        {recording ? (
          <Pressable
            onPress={() => void stopRecording()}
            style={({ pressed }) => [
              styles.smallBtn,
              styles.recordingBtn,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.smallBtnText, styles.recordingText]}>
              ● 녹음 중지 ({Math.floor(recordSec / 60)}:{String(recordSec % 60).padStart(2, '0')})
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => void startRecording()}
            disabled={!visitId}
            style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}
          >
            <Text style={styles.smallBtnText}>+ 음성 녹음 시작</Text>
          </Pressable>
        )}
        {visitId ? (
          <VoiceMemoList
            memos={allVoiceMemos
              .filter((m) => m.visitId === visitId)
              .map((m) => ({ id: m.id, fileUrl: m.content, createdAt: m.createdAt }))}
          />
        ) : null}

        <Text style={styles.sectionTitle}>방문 결과 상태</Text>
        <View style={styles.statusGrid}>
          {VISIT_STATUS_VALUES.map((s) => {
            const active = status === s;
            const c = colors.visitStatus[s];
            return (
              <Pressable
                key={s}
                onPress={() => setStatus(s)}
                style={[
                  styles.statusChip,
                  active && { backgroundColor: c + '22', borderColor: c },
                ]}
              >
                <Text
                  style={[
                    styles.statusChipText,
                    active && { color: c, fontWeight: '700' },
                  ]}
                >
                  {VISIT_STATUS_LABEL[s]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {status === 'other' ? (
          <>
            <TextInput
              value={etcReason}
              onChangeText={setEtcReason}
              style={[styles.input, { marginTop: spacing.sm }]}
              placeholder="기타 사유 (10자 이상 필수)"
            />
            {etcReason.length > 0 && etcReason.length < 10 ? (
              <Text style={styles.errorText}>10자 이상 입력해주세요</Text>
            ) : null}
          </>
        ) : null}

        <Pressable
          onPress={handleSaveResult}
          disabled={status === 'other' && etcReason.trim().length < 10}
          style={({ pressed }) => [
            styles.btn,
            pressed && styles.pressed,
            status === 'other' && etcReason.trim().length < 10 && styles.btnDisabled,
          ]}
        >
          <Text style={styles.btnText}>결과 저장하고 완료</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl * 2 },
  header: {
    backgroundColor: colors.primary + '10',
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  headerTitle: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '700' },
  headerSub: { fontSize: fontSize.base, color: colors.text, marginTop: 2 },
  headerSubMuted: { fontSize: fontSize.sm, color: colors.textMuted },
  sectionTitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '700',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: fontSize.base,
    color: colors.text,
  },
  smallBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'flex-start',
  },
  smallBtnText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600' },
  btnRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  recordingBtn: { backgroundColor: colors.danger + '15', borderColor: colors.danger },
  recordingText: { color: colors.danger },
  memoList: { marginTop: spacing.sm, gap: spacing.xs },
  memoItem: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  memoText: { fontSize: fontSize.sm, color: colors.text },
  photoCount: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.sm },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  statusChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  statusChipText: { fontSize: fontSize.sm, color: colors.textMuted },
  errorText: { color: colors.danger, fontSize: fontSize.xs, marginTop: spacing.xs },
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  btnDisabled: { backgroundColor: colors.border },
  pressed: { opacity: 0.85 },
  btnText: { color: '#fff', fontSize: fontSize.base, fontWeight: '700' },
});
