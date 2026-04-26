import { useEffect, useState } from 'react';
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
import { VISIT_STATUS_VALUES, type VisitStatus } from '@/types/entities';
import { EmptyState } from '@/components/EmptyState';
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
  const memosByVisit = useVisitStore((s) => s.memosByVisit);
  const photosByVisit = useVisitStore((s) => s.photosByVisit);
  const findDestination = useDestinationStore((s) => s.findByTripField);
  const markDestinationArrived = useDestinationStore((s) => s.markArrived);

  const [visitId, setVisitId] = useState<string | null>(null);
  const [memoText, setMemoText] = useState('');
  const [status, setStatus] = useState<VisitStatus>('완료');
  const [etcReason, setEtcReason] = useState('');

  useEffect(() => {
    if (activeTripId !== null && fieldId && visitId === null) {
      void (async () => {
        const r = await checkIn(activeTripId, fieldId);
        if (r.ok) {
          setVisitId(r.visit.id);
        } else {
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

  const handleAddPhoto = () => {
    Alert.alert(
      '사진 첨부',
      '카메라/사진 라이브러리 통합은 아직 미구현입니다. (백엔드 multipart 엔드포인트는 준비됨)',
    );
  };

  const handleSaveResult = async () => {
    if (!visitId) return;
    if (status === '기타' && etcReason.trim().length < 10) {
      return;
    }
    const reason = status === '기타' ? etcReason.trim() : undefined;
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

        <Text style={styles.sectionTitle}>사진</Text>
        <Pressable
          onPress={handleAddPhoto}
          style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}
        >
          <Text style={styles.smallBtnText}>+ 사진 첨부 (placeholder)</Text>
        </Pressable>
        {photos.length > 0 ? (
          <Text style={styles.photoCount}>첨부된 사진: {photos.length}장</Text>
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
                  {s}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {status === '기타' ? (
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
          disabled={status === '기타' && etcReason.trim().length < 10}
          style={({ pressed }) => [
            styles.btn,
            pressed && styles.pressed,
            status === '기타' && etcReason.trim().length < 10 && styles.btnDisabled,
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
