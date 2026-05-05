import { useState } from 'react';
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
import { useRouter } from 'expo-router';
import { useFieldStore } from '@/stores/fieldStore';
import { useAuthStore } from '@/stores/authStore';
import type { FieldStatus } from '@/types/entities';
import { FIELD_STATUS_VALUES } from '@/types/entities';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

// 주소 검색 mock — 실제로는 Daum 우편번호 서비스 WebView 팝업 사용
const MOCK_ADDRESSES = [
  { address: '부산광역시 해운대구 우동', lat: 35.1587, lng: 129.1603 },
  { address: '부산광역시 서면 부전동', lat: 35.1577, lng: 129.0593 },
  { address: '부산광역시 중구 광복동', lat: 35.1006, lng: 129.0348 },
  { address: '대구광역시 중구 동성로', lat: 35.8696, lng: 128.5953 },
  { address: '대구광역시 수성구 두산동', lat: 35.8276, lng: 128.6222 },
];

const STATUS_LABEL: Record<FieldStatus, string> = {
  pending: '대기',
  in_progress: '진행중',
  done: '완료',
};

export default function NewField() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const createField = useFieldStore((s) => s.create);

  const [step, setStep] = useState<1 | 2>(1);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<typeof MOCK_ADDRESSES[number] | null>(null);
  const [detail, setDetail] = useState('');
  const [status, setStatus] = useState<FieldStatus>('pending');

  const results =
    query.length < 2
      ? []
      : MOCK_ADDRESSES.filter(
          (a) => a.address.includes(query) || query.includes(a.address.slice(0, 4)),
        );

  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!user || !selected) return;
    const baseBody = {
      name: selected.address,
      status,
      roadAddress: selected.address,
      jibunAddress: selected.address,
      detailAddress: detail,
      lat: selected.lat,
      lng: selected.lng,
    };

    setSubmitting(true);
    const result = await createField(baseBody);
    setSubmitting(false);

    if (result.ok) {
      router.replace(`/(tabs)/fields/${result.field.id}` as never);
      return;
    }

    if ('needsConfirm' in result) {
      // Phase 7 duplicate_address_warning_required — confirm 후 forceCreateWithDuplicate 로 재호출
      const proceed = (yes: boolean) => {
        if (!yes) return;
        void (async () => {
          setSubmitting(true);
          const forced = await createField({ ...baseBody, forceCreateWithDuplicate: true });
          setSubmitting(false);
          if (forced.ok) {
            router.replace(`/(tabs)/fields/${forced.field.id}` as never);
          } else if (!('needsConfirm' in forced)) {
            Alert.alert('등록 실패', forced.error);
          }
        })();
      };
      const msg = result.duplicateCount > 0
        ? `같은 주소의 기존 현장이 ${result.duplicateCount}건 있습니다.\n계속 진행할까요?`
        : `${result.message}\n계속 진행할까요?`;
      if (Platform.OS === 'web') {
        if (confirm(msg)) proceed(true);
      } else {
        Alert.alert('중복 주소 확인', msg, [
          { text: '취소', style: 'cancel' },
          { text: '그래도 등록', onPress: () => proceed(true) },
        ]);
      }
      return;
    }

    Alert.alert('등록 실패', result.error);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>
          {step === 1 ? '1단계. 주소 검색' : '2단계. 상세 입력'}
        </Text>

        {step === 1 ? (
          <>
            <Text style={styles.label}>주소 또는 건물명</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              style={styles.input}
              placeholder="예: 해운대, 동성로"
              autoFocus
            />
            <Text style={styles.hint}>
              프로토타입: 목업 주소 목록에서 검색됩니다 (실제 배포에선 Daum 우편번호 서비스 연동)
            </Text>
            <View style={{ marginTop: spacing.md }}>
              {results.map((r) => (
                <Pressable
                  key={r.address}
                  onPress={() => {
                    setSelected(r);
                    setStep(2);
                  }}
                  style={({ pressed }) => [styles.addrItem, pressed && styles.pressed]}
                >
                  <Text style={styles.addrText}>{r.address}</Text>
                  <Text style={styles.addrCoord}>
                    {r.lat.toFixed(4)}, {r.lng.toFixed(4)}
                  </Text>
                </Pressable>
              ))}
              {query.length >= 2 && results.length === 0 ? (
                <Text style={styles.hint}>검색 결과가 없습니다</Text>
              ) : null}
            </View>
          </>
        ) : (
          <>
            <Pressable onPress={() => setStep(1)}>
              <Text style={styles.backLink}>← 주소 다시 선택</Text>
            </Pressable>

            <View style={styles.selectedBox}>
              <Text style={styles.selectedLabel}>선택한 주소</Text>
              <Text style={styles.selectedAddr}>{selected?.address}</Text>
            </View>

            <Text style={styles.label}>상세 주소 (동/호수 등)</Text>
            <TextInput
              value={detail}
              onChangeText={setDetail}
              style={styles.input}
              placeholder="예: 101동 1203호"
            />

            <Text style={styles.label}>상태</Text>
            <View style={styles.statusRow}>
              {FIELD_STATUS_VALUES.map((s) => {
                const active = status === s;
                const c = colors.fieldStatus[s];
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
                      {STATUS_LABEL[s]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={handleCreate}
              disabled={submitting}
              style={({ pressed }) => [styles.btn, (pressed || submitting) && styles.pressed]}
            >
              <Text style={styles.btnText}>{submitting ? '등록 중...' : '현장 등록'}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '600',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
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
  hint: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },
  addrItem: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  pressed: { opacity: 0.7 },
  addrText: { fontSize: fontSize.base, color: colors.text, fontWeight: '600' },
  addrCoord: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  backLink: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  selectedBox: {
    backgroundColor: colors.primary + '10',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  selectedLabel: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '600' },
  selectedAddr: { fontSize: fontSize.base, color: colors.text, marginTop: 2 },
  statusRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  statusChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  statusChipText: { fontSize: fontSize.sm, color: colors.textMuted },
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  btnText: { color: '#fff', fontSize: fontSize.base, fontWeight: '700' },
});
