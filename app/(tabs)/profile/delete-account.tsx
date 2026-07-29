import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { SafeScreen } from '@/components/SafeScreen';
import { SUPPORT_EMAIL, supportMailto } from '@/utils/contact';
import { colors } from '@/theme/colors';
import { radius, spacing } from '@/theme/spacing';
import { opacity } from '@/theme/motion';

// docs/REQUIREMENTS_BEFORE_LAUCHING.md §1·§6 — Apple 은 계정을 만드는 앱에 **앱 내 계정 삭제**를
// 요구한다. 백엔드 DELETE /api/me 는 아직 없어(§30) 이 화면은 선반영이다.
//
// 문서의 4단계(안내 → 비밀번호 → 최종 확인 → 완료)를 화면 4개로 쪼개지 않고 한 화면에 둔다.
// 단계 분리는 이 프로젝트에서 이미 걷어낸 패턴이고, 되돌릴 수 없는 동작의 안전장치는
// 화면 수가 아니라 '비밀번호 + 명시적 동의 + 최종 확인' 세 겹이 담당한다.

const DELETED_ITEMS = [
  '회원 기본정보 (이름·이메일)',
  '외근 기록',
  '방문 기록',
  '업무 보고서',
  '등록한 사진',
  '작성한 메모',
  '로그인 세션 및 토큰',
] as const;

export default function DeleteAccount() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);

  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = password.length > 0 && agreed && !submitting;

  const performDelete = async () => {
    setSubmitting(true);
    const r = await deleteAccount(password);

    if (r.ok) {
      // 성공 경로에서는 폼 상태를 되돌리지 않는다 — 떠나는 화면에서 setState 와 navigate 가
      // 같은 배치로 합쳐지면 무음 크래시가 났던 이력이 있다. 화면은 어차피 버려진다.
      Alert.alert('탈퇴 완료', '계정과 관련 정보가 삭제됐습니다. 그동안 이용해 주셔서 감사합니다.');
      router.replace('/(auth)/login' as never);
      return;
    }

    setSubmitting(false);

    // 비밀번호가 틀린 건 입력 옆에 붙여야 사용자가 어디를 고칠지 안다.
    if (r.code === 'current_password_invalid' || r.code === 'invalid_credentials') {
      setPwError(r.error);
      return;
    }

    // 백엔드 미구현(§30) — 메일 문의로 넘길 수 있게 실행 가능한 선택지를 준다.
    if (r.code === 'delete_account_unimplemented') {
      Alert.alert('탈퇴 요청', r.error, [
        { text: '닫기', style: 'cancel' },
        {
          text: '메일로 요청',
          onPress: () => {
            const url = supportMailto(`[일가요] 회원 탈퇴 요청 (${user?.email ?? ''})`);
            void Linking.openURL(url).catch(() => {
              Alert.alert('메일 앱을 열 수 없습니다', `${SUPPORT_EMAIL} 로 직접 보내주세요.`);
            });
          },
        },
      ]);
      return;
    }

    Alert.alert('탈퇴 실패', r.error);
  };

  const handleSubmit = () => {
    setPwError(null);
    Alert.alert(
      '정말 탈퇴하시겠습니까?',
      '삭제된 정보는 복구할 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        { text: '탈퇴하기', style: 'destructive', onPress: () => void performDelete() },
      ],
    );
  };

  return (
    <SafeScreen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.warnBox}>
            <Ionicons name="alert-circle" size={22} color={colors.danger} />
            <Text variant="bodySm" weight="semibold" color="danger" style={styles.warnText}>
              탈퇴하면 아래 정보가 삭제되며 복구할 수 없습니다.
            </Text>
          </View>

          <Text variant="caption" weight="bold" color="textMuted" style={styles.sectionTitle}>
            삭제되는 정보
          </Text>
          <Card style={styles.card}>
            {DELETED_ITEMS.map((item) => (
              <View key={item} style={styles.itemRow}>
                <Ionicons name="close-circle-outline" size={16} color={colors.danger} />
                <Text variant="bodySm" style={styles.itemText}>
                  {item}
                </Text>
              </View>
            ))}
            <Text variant="caption" color="textMuted" style={styles.legalNote}>
              법령상 보관 대상 정보는 관련 법령에 따라 별도 보관될 수 있습니다.
            </Text>
          </Card>

          <Text variant="caption" weight="bold" color="textMuted" style={styles.sectionTitle}>
            본인 확인
          </Text>
          <Card style={styles.card}>
            <Input
              label="비밀번호"
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (pwError) setPwError(null);
              }}
              secureTextEntry
              autoCapitalize="none"
              editable={!submitting}
              error={pwError ?? undefined}
              helperText={`${user?.email ?? '현재 계정'} 의 비밀번호를 입력해주세요`}
              returnKeyType="done"
            />
          </Card>

          <Pressable
            onPress={() => setAgreed((v) => !v)}
            disabled={submitting}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
            accessibilityLabel="삭제 내용을 확인했으며 복구할 수 없음에 동의"
            style={({ pressed }) => [styles.agreeRow, pressed && { opacity: opacity.pressed }]}
          >
            <Ionicons
              name={agreed ? 'checkbox' : 'square-outline'}
              size={22}
              color={agreed ? colors.danger : colors.textSubtle}
            />
            <Text variant="bodySm" style={styles.agreeText}>
              위 내용을 확인했으며, 삭제된 정보는 복구할 수 없음에 동의합니다.
            </Text>
          </Pressable>

          <Button
            onPress={handleSubmit}
            disabled={!canSubmit}
            loading={submitting}
            variant="destructive"
            fullWidth
            leftIcon="trash-outline"
            style={styles.submit}
          >
            회원 탈퇴
          </Button>

          <Button onPress={() => router.back()} disabled={submitting} variant="ghost" fullWidth>
            취소
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl },
  warnBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerMuted,
  },
  warnText: { flex: 1 },
  sectionTitle: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: { gap: spacing.md },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemText: { flex: 1 },
  legalNote: { marginTop: spacing.xs },
  agreeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xs,
    minHeight: 48,
  },
  agreeText: { flex: 1 },
  submit: { marginTop: spacing.lg },
});
