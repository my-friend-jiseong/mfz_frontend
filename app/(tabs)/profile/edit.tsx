import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, type TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { KeyboardAvoid } from '@/components/ui/KeyboardAvoid';
import { useAuthStore } from '@/stores/authStore';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { Button2 } from '@/components/ui/Button2';
import { FieldMessage, FormField, ReadonlyField, TextField2 } from '@/components/ui/FormField2';
import { PageHeader } from '@/components/ui/PageHeader';
import { Text } from '@/components/ui/Text';
import { snackbar } from '@/components/ui/Snackbar';
import { SafeScreen } from '@/components/SafeScreen';
import { safeBack } from '@/utils/backNavigation';
import { checkNewPassword, PASSWORD_HINT } from '@/utils/password';
import { c2, space } from '@/theme/v2';

// 10-1 내 정보 수정 · 10-3 현재 비밀번호 오류 (Figma 584:2640, 727:1906).
// 이름과 비밀번호는 따로 저장한다: 이름만 바꾸러 온 사용자가 비밀번호까지 넣을 이유가 없고,
// 한쪽 실패가 다른 쪽을 되돌리지 않는다. 이메일은 인증 식별자라 서버가 바꾸지 않는다(읽기 전용).

type PwErrs = { current?: string; next?: string; confirm?: string; form?: string };

export default function ProfileEdit() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const updateName = useAuthStore((s) => s.updateName);
  const changePassword = useAuthStore((s) => s.changePassword);
  const goBack = () => safeBack(router, '/(tabs)/profile');

  // ----- 이름 -----
  const [name, setName] = useState(user?.name ?? '');
  const [nameErr, setNameErr] = useState<string | null>(null);
  const [nameSaving, setNameSaving] = useState(false);

  // [저장] → 10 내 정보로 돌아간다(결정 v85).
  const handleSaveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) return setNameErr('이름을 입력해 주세요');
    // 백엔드 maxLength 100 — 서버 왕복 전에 잡아준다.
    if (trimmed.length > 100) return setNameErr('이름은 100자까지 쓸 수 있어요');
    if (trimmed === (user?.name ?? '').trim()) return goBack();
    setNameErr(null);
    setNameSaving(true);
    const r = await updateName(trimmed);
    if (r.ok) {
      // 떠나는 화면의 폼은 되돌리지 않는다(같은 틱 setState + 이동 금지).
      goBack();
      return;
    }
    setNameSaving(false);
    setNameErr(r.error);
  };

  // ----- 비밀번호 -----
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPwConfirm, setNewPwConfirm] = useState('');
  const [pwErrs, setPwErrs] = useState<PwErrs>({});
  const [pwSaving, setPwSaving] = useState(false);
  const newPwRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const clearPwErr = (k: keyof PwErrs) => setPwErrs((p) => (p[k] || p.form ? { ...p, [k]: undefined, form: undefined } : p));

  const handleChangePassword = async () => {
    const check = checkNewPassword(newPw, newPwConfirm);
    const next: PwErrs = { next: check.password, confirm: check.confirm };
    if (!currentPw) next.current = '현재 비밀번호를 입력해 주세요';
    // 지금과 같은 비밀번호로 바꾸는 건 의미가 없다 — 서버 왕복 전에 알려준다.
    if (!next.next && currentPw && newPw === currentPw) next.next = '현재 비밀번호와 다르게 정해 주세요';
    setPwErrs(next);
    if (next.current || next.next || next.confirm) return;

    setPwSaving(true);
    const r = await changePassword(currentPw, newPw, newPwConfirm);
    if (r.ok) {
      // 10 으로 돌아가며 스낵바(인수인계: 그리지 않음). 이동과 같은 틱에 띄우지 않는다.
      goBack();
      requestAnimationFrame(() => snackbar.show({ message: '비밀번호를 바꿨어요' }));
      return;
    }
    setPwSaving(false);
    if (r.code === 'current_password_invalid') setPwErrs({ current: '현재 비밀번호가 맞지 않아요' });
    else if (r.code === 'password_policy_violation') setPwErrs({ next: r.error });
    else if (r.code === 'password_confirm_mismatch') setPwErrs({ confirm: '비밀번호가 서로 달라요' });
    else setPwErrs({ form: r.error });
  };

  return (
    <SafeScreen background={c2.bg.canvas}>
      <PageHeader title="내 정보 수정" onBack={goBack} />
      <KeyboardAvoid style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <FormField label="이메일" helper="로그인에 쓰는 주소라 바꿀 수 없어요.">
            <ReadonlyField value={user?.email ?? '-'} />
          </FormField>

          <View style={styles.gapL}>
            <FormField label="이름" error={nameErr}>
              <View style={styles.nameRow}>
                <TextField2
                  value={name}
                  onChangeText={(v) => {
                    setName(v);
                    if (nameErr) setNameErr(null);
                  }}
                  invalid={!!nameErr}
                  editable={!nameSaving}
                  placeholder="홍길동"
                  textContentType="name"
                  returnKeyType="done"
                  onSubmitEditing={() => void handleSaveName()}
                  accessibilityLabel="이름"
                  style={styles.nameInput}
                />
                <Button2 variant="secondary" size="M" loading={nameSaving} onPress={() => void handleSaveName()} style={styles.nameSave}>
                  저장
                </Button2>
              </View>
            </FormField>
          </View>

          <View style={styles.pwSection}>
            <Text v2="bodyM.bold" tone="primary" accessibilityRole="header">
              비밀번호 변경
            </Text>
            <View style={styles.pwFields}>
              <FormField label="현재 비밀번호" error={pwErrs.current}>
                <TextField2
                  value={currentPw}
                  onChangeText={(v) => {
                    setCurrentPw(v);
                    clearPwErr('current');
                  }}
                  invalid={!!pwErrs.current}
                  secureTextEntry
                  autoCapitalize="none"
                  textContentType="password"
                  autoComplete="current-password"
                  editable={!pwSaving}
                  placeholder="현재 비밀번호"
                  returnKeyType="next"
                  onSubmitEditing={() => newPwRef.current?.focus()}
                  accessibilityLabel="현재 비밀번호"
                />
              </FormField>
              <FormField label="새 비밀번호" error={pwErrs.next} helper={PASSWORD_HINT}>
                <TextField2
                  ref={newPwRef}
                  value={newPw}
                  onChangeText={(v) => {
                    setNewPw(v);
                    clearPwErr('next');
                  }}
                  invalid={!!pwErrs.next}
                  secureTextEntry
                  autoCapitalize="none"
                  textContentType="newPassword"
                  autoComplete="new-password"
                  editable={!pwSaving}
                  placeholder="새 비밀번호"
                  returnKeyType="next"
                  onSubmitEditing={() => confirmRef.current?.focus()}
                  accessibilityLabel="새 비밀번호"
                />
              </FormField>
              <FormField label="새 비밀번호 확인" error={pwErrs.confirm}>
                <TextField2
                  ref={confirmRef}
                  value={newPwConfirm}
                  onChangeText={(v) => {
                    setNewPwConfirm(v);
                    clearPwErr('confirm');
                  }}
                  invalid={!!pwErrs.confirm}
                  secureTextEntry
                  autoCapitalize="none"
                  textContentType="newPassword"
                  autoComplete="new-password"
                  editable={!pwSaving}
                  placeholder="한 번 더 입력"
                  returnKeyType="done"
                  onSubmitEditing={() => void handleChangePassword()}
                  accessibilityLabel="새 비밀번호 확인"
                />
              </FormField>
              {pwErrs.form ? <FieldMessage message={pwErrs.form} /> : null}
            </View>
          </View>
        </ScrollView>
        <BottomActionBar>
          <Button2 onPress={() => void handleChangePassword()} loading={pwSaving} fullWidth>
            비밀번호 변경
          </Button2>
        </BottomActionBar>
      </KeyboardAvoid>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: c2.bg.canvas },
  scroll: { paddingHorizontal: space[20], paddingTop: space[16], paddingBottom: space[24] },
  gapL: { marginTop: space[20] + space[2] },
  nameRow: { flexDirection: 'row', gap: space[8] },
  nameInput: { flex: 1 },
  nameSave: { height: 52 },
  // Figma 10-1: 이름 칸 아래 22 에 옅은 구분선, 그 아래 18 에 '비밀번호 변경'.
  pwSection: {
    marginTop: space[20] + space[2],
    paddingTop: space[16] + space[2],
    borderTopWidth: 1,
    borderTopColor: c2.border.subtle,
  },
  pwFields: { marginTop: space[12], gap: space[12] },
});
