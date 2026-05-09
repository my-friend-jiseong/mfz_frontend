import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useFieldStore } from '@/stores/fieldStore';
import { useVisitStore } from '@/stores/visitStore';
import { useTripStore } from '@/stores/tripStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import {
  pickPhoto,
  promptPhotoSource,
  createVoiceRecorder,
  VOICE_MAX_SECONDS,
  type VoiceRecorder,
} from '@/utils/media';
import { openKakaoRouteTo } from '@/utils/kakaoMap';
import { PhotoGrid, VoiceMemoList } from '@/components/AttachmentPreview';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';
import {
  FIELD_STATUS_VALUES,
  VISIT_STATUS_LABEL,
  FIELD_STATUS_LABEL,
  type FieldStatus,
  type Visit,
} from '@/types/entities';

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('ko-KR');
}

export default function FieldDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const fieldId = id ?? '';

  const allFields = useFieldStore((s) => s.fields);
  const directAttachmentsMap = useFieldStore((s) => s.directAttachments);
  const loadFieldDetail = useFieldStore((s) => s.loadDetail);
  const addFieldTextMemo = useFieldStore((s) => s.addTextMemo);
  const addFieldPhoto = useFieldStore((s) => s.addPhoto);
  const addFieldVoiceMemo = useFieldStore((s) => s.addVoiceMemo);
  const patchFieldStatus = useFieldStore((s) => s.patchStatus);
  const allVisits = useVisitStore((s) => s.visits);
  const allTextMemos = useVisitStore((s) => s.textMemos);
  const allPhotos = useVisitStore((s) => s.photos);
  const allVoiceMemos = useVisitStore((s) => s.voiceMemos);
  const activeTripId = useTripStore((s) => s.activeTripId);

  // 진입 시 detail 페치 (directAttachments 채우기)
  useEffect(() => {
    if (fieldId) void loadFieldDetail(fieldId);
  }, [fieldId, loadFieldDetail]);

  const field = useMemo(
    () => allFields.find((f) => f.id === fieldId),
    [allFields, fieldId],
  );
  const directAttachments = directAttachmentsMap[fieldId] ?? [];
  const directTextMemos = directAttachments.filter((a) => a.type === 'text');
  const directPhotos = directAttachments
    .filter((a) => a.type === 'photo' && a.fileUrl)
    .map((a) => ({ id: a.id, fileUrl: a.fileUrl as string }));
  const directVoices = directAttachments
    .filter((a) => a.type === 'audio' && a.fileUrl)
    .map((a) => ({
      id: a.id,
      fileUrl: a.fileUrl as string,
      durationSec: a.durationSec ?? a.durationSeconds,
      createdAt: a.createdAt,
    }));
  const directPhotoCount = directPhotos.length;
  const directAudioCount = directVoices.length;

  const [memoInput, setMemoInput] = useState('');
  const [memoSubmitting, setMemoSubmitting] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleAddDirectMemo = async () => {
    const t = memoInput.trim();
    if (!t) return;
    setMemoSubmitting(true);
    const r = await addFieldTextMemo(fieldId, t);
    setMemoSubmitting(false);
    if (r.ok) {
      setMemoInput('');
    } else {
      Alert.alert('메모 추가 실패', r.error);
    }
  };

  const uploadDirectPhoto = async (source: 'camera' | 'library') => {
    setPhotoBusy(true);
    try {
      const file = await pickPhoto(source);
      if (!file) return;
      const r = await addFieldPhoto(fieldId, file);
      if (!r.ok) Alert.alert('사진 추가 실패', r.error);
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleAddDirectPhoto = () => {
    if (photoBusy) return;
    promptPhotoSource((src) => void uploadDirectPhoto(src));
  };

  const startDirectRecording = async () => {
    if (recording) return;
    const rec = createVoiceRecorder();
    const ok = await rec.start();
    if (!ok) return;
    recorderRef.current = rec;
    setRecording(true);
    setRecordSec(0);
    tickRef.current = setInterval(() => {
      setRecordSec((s) => {
        if (s + 1 >= VOICE_MAX_SECONDS) {
          void stopDirectRecording();
          return VOICE_MAX_SECONDS;
        }
        return s + 1;
      });
    }, 1000);
  };

  const stopDirectRecording = async () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setRecording(false);
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (!rec) return;
    const result = await rec.stop();
    if (!result) return;
    const r = await addFieldVoiceMemo(fieldId, result.file, result.durationSec);
    if (!r.ok) Alert.alert('음성 메모 추가 실패', r.error);
  };

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      void recorderRef.current?.cancel();
    };
  }, []);
  const visits = useMemo(
    () =>
      allVisits
        .filter((v) => v.fieldId === fieldId)
        .sort((a, b) => b.visitedAt.localeCompare(a.visitedAt)),
    [allVisits, fieldId],
  );

  if (!field) {
    return (
      <MapSheetLayout title="현장 상세" onBack={() => router.back()}>
        <EmptyState title="현장을 찾을 수 없습니다" />
      </MapSheetLayout>
    );
  }

  const memoCount = (visitId: string) =>
    allTextMemos.filter((m) => m.visitId === visitId).length;
  const photoCount = (visitId: string) =>
    allPhotos.filter((p) => p.visitId === visitId).length;
  const voiceCount = (visitId: string) =>
    allVoiceMemos.filter((m) => m.visitId === visitId).length;

  const renderVisit = ({ item }: { item: Visit }) => {
    const c = colors.visitStatus[item.status];
    const m = memoCount(item.id);
    const p = photoCount(item.id);
    const v = voiceCount(item.id);
    const totalAtt = m + p + v;
    return (
      <Pressable
        onPress={() =>
          router.push(
            `/(tabs)/trips/visit?tripId=${item.tripId}&visitId=${item.id}` as never,
          )
        }
        style={({ pressed }) => [styles.visitRow, pressed && styles.pressed]}
      >
        <View style={styles.visitRowMain}>
          <Text style={styles.visitDate}>{fmtDateTime(item.visitedAt)}</Text>
          <View style={[styles.statusChip, { backgroundColor: c + '22' }]}>
            <Text style={[styles.statusText, { color: c }]}>
              {VISIT_STATUS_LABEL[item.status]}
            </Text>
          </View>
        </View>
        {totalAtt > 0 ? (
          <Text style={styles.visitAttachments}>
            {m > 0 ? `메모 ${m}` : ''}
            {m > 0 && (p > 0 || v > 0) ? ' · ' : ''}
            {p > 0 ? `사진 ${p}` : ''}
            {p > 0 && v > 0 ? ' · ' : ''}
            {v > 0 ? `음성 ${v}` : ''}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  const canCheckIn = activeTripId !== null;

  // 상태 변경 — chip tap 시 3개 상태 중 선택. patchStatus 즉시 호출.
  // 빠른 연속 탭 race 방지를 위해 in-flight ref 가드.
  const statusBusyRef = useRef(false);
  const handleStatusTap = () => {
    if (statusBusyRef.current) return;
    const others = FIELD_STATUS_VALUES.filter((s) => s !== field.status);
    Alert.alert('상태 변경', `현재: ${FIELD_STATUS_LABEL[field.status]}`, [
      { text: '취소', style: 'cancel' },
      ...others.map((s) => ({
        text: FIELD_STATUS_LABEL[s],
        onPress: async () => {
          if (statusBusyRef.current) return;
          statusBusyRef.current = true;
          try {
            const r = await patchFieldStatus(field.id, s);
            if (!r.ok) Alert.alert('상태 변경 실패', r.error);
          } finally {
            statusBusyRef.current = false;
          }
        },
      })),
    ]);
  };

  // ListHeaderComponent 에 함수 컴포넌트 ref 를 매번 새로 넘기면 BottomSheetFlatList 가
  // 헤더를 매 render 마다 unmount/remount → 헤더 안 TextInput 의 포커스가 한 글자
  // 입력마다 사라지는 회귀가 발생. element 인스턴스 (View) 로 전달하면 type 안정 유지.
  const headerElement = (
    <View style={styles.summary}>
      <Pressable
        onPress={handleStatusTap}
        style={({ pressed }) => [
          styles.statusChipTappable,
          {
            backgroundColor: colors.fieldStatus[field.status] + '22',
            borderColor: colors.fieldStatus[field.status],
          },
          pressed && styles.pressed,
        ]}
      >
        <Text
          style={[
            styles.statusText,
            { color: colors.fieldStatus[field.status] },
          ]}
        >
          {FIELD_STATUS_LABEL[field.status]} ▾
        </Text>
      </Pressable>
      <Text style={styles.addr}>{field.title || field.address}</Text>
      {field.title ? (
        <Text style={styles.detail}>{field.address}</Text>
      ) : null}
      {field.addressDetail ? (
        <Text style={styles.detail}>{field.addressDetail}</Text>
      ) : null}
      <View style={styles.coordRow}>
        <Text style={styles.coord}>
          좌표: {field.latitude.toFixed(4)}, {field.longitude.toFixed(4)}
        </Text>
        <Pressable
          onPress={() =>
            void openKakaoRouteTo(field.address, field.latitude, field.longitude)
          }
          style={({ pressed }) => [styles.routeBtn, pressed && styles.pressed]}
        >
          <Text style={styles.routeBtnText}>길찾기</Text>
        </Pressable>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() =>
            router.push(`/(tabs)/fields/${field.id}/edit` as never)
          }
          style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
        >
          <Text style={styles.actionText}>수정 / 삭제</Text>
        </Pressable>
        <Pressable
          onPress={() =>
            canCheckIn &&
            router.push(`/(tabs)/fields/${field.id}/checkin` as never)
          }
          disabled={!canCheckIn}
          style={({ pressed }) => [
            styles.actionBtn,
            styles.primaryBtn,
            !canCheckIn && styles.disabledBtn,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.actionText, styles.primaryText]}>
            {canCheckIn ? '체크인' : '외근 시작 후 체크인 가능'}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>현장 직접 메모 ({directTextMemos.length})</Text>
      <Text style={styles.directHint}>
        외근 진행 중이 아닐 때도 이 현장에 메모를 남길 수 있습니다.
      </Text>
      <View style={styles.memoInputRow}>
        <TextInput
          value={memoInput}
          onChangeText={setMemoInput}
          style={styles.memoInput}
          placeholder="현장에 남길 메모"
          maxLength={2000}
          multiline
        />
        <Pressable
          onPress={handleAddDirectMemo}
          disabled={memoSubmitting || !memoInput.trim()}
          style={({ pressed }) => [
            styles.memoBtn,
            (pressed || memoSubmitting || !memoInput.trim()) && styles.pressed,
          ]}
        >
          <Text style={styles.memoBtnText}>
            {memoSubmitting ? '추가 중...' : '추가'}
          </Text>
        </Pressable>
      </View>
      {directTextMemos.length > 0 ? (
        <View style={styles.memoList}>
          {directTextMemos.map((m) => (
            <View key={m.id} style={styles.memoItem}>
              <Text style={styles.memoText}>{m.text}</Text>
              <Text style={styles.memoMeta}>{fmtDateTime(m.createdAt)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.directMediaRow}>
        <Pressable
          onPress={handleAddDirectPhoto}
          disabled={photoBusy}
          style={({ pressed }) => [
            styles.mediaBtn,
            (pressed || photoBusy) && styles.pressed,
          ]}
        >
          <Text style={styles.mediaBtnText}>
            📷 사진 {directPhotoCount > 0 ? `(${directPhotoCount})` : ''}
            {photoBusy ? ' · 업로드 중' : ''}
          </Text>
        </Pressable>
        {recording ? (
          <Pressable
            onPress={() => void stopDirectRecording()}
            style={({ pressed }) => [
              styles.mediaBtn,
              styles.recordingBtn,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.mediaBtnText, styles.recordingText]}>
              ● 녹음 중지 ({Math.floor(recordSec / 60)}:{String(recordSec % 60).padStart(2, '0')})
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => void startDirectRecording()}
            style={({ pressed }) => [styles.mediaBtn, pressed && styles.pressed]}
          >
            <Text style={styles.mediaBtnText}>
              🎙 음성 {directAudioCount > 0 ? `(${directAudioCount})` : ''}
            </Text>
          </Pressable>
        )}
      </View>

      <PhotoGrid photos={directPhotos} />
      <VoiceMemoList memos={directVoices} />

      <Text style={styles.sectionTitle}>방문 이력 ({visits.length})</Text>
    </View>
  );

  return (
    <MapSheetLayout
      title="현장 상세"
      onBack={() => router.back()}
      initialIndex={2}
    >
      <BottomSheetFlatList
        data={visits}
        keyExtractor={(v) => String(v.id)}
        renderItem={renderVisit}
        ListHeaderComponent={headerElement}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<EmptyState title="방문 이력이 없습니다" />}
      />
    </MapSheetLayout>
  );
}

const styles = StyleSheet.create({
  summary: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  statusChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  statusChipTappable: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  statusText: { fontSize: fontSize.xs, fontWeight: '700' },
  addr: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  detail: { fontSize: fontSize.base, color: colors.text },
  coordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  coord: { fontSize: fontSize.xs, color: colors.textMuted },
  routeBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  routeBtnText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  primaryBtn: { backgroundColor: colors.primary, borderColor: colors.primary },
  disabledBtn: { backgroundColor: colors.border, borderColor: colors.border },
  actionText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  primaryText: { color: '#fff' },
  pressed: { opacity: 0.85 },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  visitRow: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
    gap: 4,
  },
  visitRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  visitDate: { fontSize: fontSize.sm, color: colors.text },
  visitAttachments: { fontSize: fontSize.xs, color: colors.textMuted },
  directHint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  memoInputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    alignItems: 'flex-end',
  },
  memoInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: fontSize.sm,
    color: colors.text,
    minHeight: 44,
  },
  memoBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  memoBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700' },
  memoList: { marginTop: spacing.sm, gap: spacing.xs },
  memoItem: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  memoText: { fontSize: fontSize.sm, color: colors.text },
  memoMeta: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  directMediaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  mediaBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  mediaBtnText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600' },
  recordingBtn: { backgroundColor: colors.danger + '15', borderColor: colors.danger },
  recordingText: { color: colors.danger },
});
