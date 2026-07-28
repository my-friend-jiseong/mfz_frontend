import { useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useAuthStore } from '@/stores/authStore';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { SafeScreen } from '@/components/SafeScreen';
import { checkPasswordPolicy, PASSWORD_HINT } from '@/utils/password';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

// backend-backlog §15 (release 2026-07-26) — PATCH /api/me · PATCH /api/me/password.
// 카드 2개를 독립 저장으로 둔다: 이름만 바꾸러 온 사용자가 비밀번호까지 입력할 이유가 없고,
// 한쪽 실패가 다른 쪽을 되돌리지 않는다.
// 이메일은 인증 식별자라 백엔드가 변경을 받지 않는다 — 읽기 전용으로 이유와 함께 보여준다.

export default function ProfileEdit() {
  const user = useAuthStore((s) => s.user);
  const updateName = useAuthStore((s) => s.updateName);
  const changePassword = useAuthStore((s) => s.changePassword);

  // ----- 이름 -----
  const [name, setName] = useState(user?.name ?? '');
  const [nameErr, setNameErr] = useState<string | null>(null);
  const [nameSaving, setNameSaving] = useState(false);
  const nameDirty = name.trim() !== (user?.name ?? '').trim();

  const handleSaveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameErr('이름을 입력해주세요');
      return;
    }
    // 백엔드 maxLength 100 — 서버 왕복 전에 잡아준다.
    if (trimmed.length > 100) {
      setNameErr('이름은 100자 이하여야 합니다');
      return;
    }
    setNameErr(null);
    setNameSaving(true);
    const r = await updateName(trimmed);
    setNameSaving(false);
    if (!r.ok) {
      setNameErr(r.error);
      return;
    }
    // web 은 webAlertPatch 가 window.alert 로 라우팅 — 분기 불필요.
    Alert.alert('저장 완료', '이름이 변경됐습니다.');
  };

  // ----- 비밀번호 -----
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPwConfirm, setNewPwConfirm] = useState('');
  const [pwErrs, setPwErrs] = useState<{
    current?: string;
    next?: string;
    confirm?: string;
  }>({});
  const [pwSaving, setPwSaving] = useState(false);

  const newPwRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  // 백엔드 error.code → 어느 입력의 인라인 에러로 붙일지 (signup 과 같은 방식).
  const codeToField: Record<string, keyof typeof pwErrs> = {
    current_password_invalid: 'current',
    password_policy_violation: 'next',
    password_confirm_mismatch: 'confirm',
  };

  const handleChangePassword = async () => {
    const next: typeof pwErrs = {};
    if (!currentPw) next.current = '현재 비밀번호를 입력해주세요';
    const policy = checkPasswordPolicy(newPw);
    if (policy) next.next = policy;
    if (newPw !== newPwConfirm) next.confirm = '새 비밀번호가 일치하지 않습니다';
    // 현재와 같은 비밀번호로 바꾸는 건 의미가 없다 — 서버 왕복 전에 알려준다.
    if (!next.next && currentPw && newPw === currentPw) {
      next.next = '현재 비밀번호와 다른 비밀번호를 입력해주세요';
    }
    setPwErrs(next);
    if (Object.keys(next).length > 0) return;

    setPwSaving(true);
    const r = await changePassword(currentPw, newPw, newPwConfirm);
    setPwSaving(false);
    if (!r.ok) {
      const field = r.code ? codeToField[r.code] : undefined;
      // 매핑되는 필드가 없으면 Alert 로 — 인라인 자리가 없는 에러가 조용히 사라지지 않게.
      if (field) setPwErrs({ [field]: r.error });
      else Alert.alert('비밀번호 변경 실패', r.error);
      return;
    }
    setCurrentPw('');
    setNewPw('');
    setNewPwConfirm('');
    setPwErrs({});
    Alert.alert('변경 완료', '비밀번호가 변경됐습니다.');
  };

  return (
    <SafeScreen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text variant="caption" weight="bold" color="textMuted" style={styles.sectionTitle}>
            이름
          </Text>
          <Card style={styles.card}>
            <Input
              label="이름"
              value={name}
              onChangeText={(v) => {
                setName(v);
                if (nameErr) setNameErr(null);
              }}
              editable={!nameSaving}
              placeholder="홍길동"
              error={nameErr ?? undefined}
              returnKeyType="done"
              onSubmitEditing={() => void handleSaveName()}
            />
            <Button
              onPress={() => void handleSaveName()}
              loading={nameSaving}
              disabled={!nameDirty}
              variant="primary"
              fullWidth
            >
              이름 저장
            </Button>
          </Card>

          <Text variant="caption" weight="bold" color="textMuted" style={styles.sectionTitle}>
            비밀번호
          </Text>
          <Card style={styles.card}>
            <Input
              label="현재 비밀번호"
              value={currentPw}
              onChangeText={(v) => {
                setCurrentPw(v);
                if (pwErrs.current) setPwErrs((p) => ({ ...p, current: undefined }));
              }}
              secureTextEntry
              autoCapitalize="none"
              editable={!pwSaving}
              error={pwErrs.current}
              returnKeyType="next"
              onSubmitEditing={() => newPwRef.current?.focus()}
            />
            <Input
              ref={newPwRef}
              label="새 비밀번호"
              value={newPw}
              onChangeText={(v) => {
                setNewPw(v);
                if (pwErrs.next) setPwErrs((p) => ({ ...p, next: undefined }));
              }}
              secureTextEntry
              autoCapitalize="none"
              editable={!pwSaving}
              error={pwErrs.next}
              helperText={PASSWORD_HINT}
              returnKeyType="next"
              onSubmitEditing={() => confirmRef.current?.focus()}
            />
            <Input
              ref={confirmRef}
              label="새 비밀번호 확인"
              value={newPwConfirm}
              onChangeText={(v) => {
                setNewPwConfirm(v);
                if (pwErrs.confirm) setPwErrs((p) => ({ ...p, confirm: undefined }));
              }}
              secureTextEntry
              autoCapitalize="none"
              editable={!pwSaving}
              error={pwErrs.confirm}
              returnKeyType="done"
              onSubmitEditing={() => void handleChangePassword()}
            />
            <Button
              onPress={() => void handleChangePassword()}
              loading={pwSaving}
              variant="primary"
              fullWidth
            >
              비밀번호 변경
            </Button>
          </Card>

          <Text variant="caption" color="textMuted" style={styles.note}>
            이메일({user?.email ?? '-'})은 로그인 식별자라 변경할 수 없습니다.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl },
  sectionTitle: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: { gap: spacing.md },
  note: { marginTop: spacing.xl, paddingHorizontal: spacing.xs },
});
