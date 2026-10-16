import { useRef, useState } from 'react';
import type { TextInput } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { FEATURE_PASSWORD_RESET } from '@/api/config';
import { ResetLayout } from '@/components/auth/ResetLayout';
import { Button2 } from '@/components/ui/Button2';
import { FieldMessage, FormField, TextField2 } from '@/components/ui/FormField2';
import { safeBack } from '@/utils/backNavigation';
import { checkNewPassword, PASSWORD_HINT } from '@/utils/password';
import { confirmNewPassword, parseResetMock, resetTokenHolder } from '@/utils/passwordReset';

// 11-8 새 비밀번호 · 11-12 규칙 위반·확인 불일치.
// 바꾸면 로그인으로 돌아가 이메일을 미리 채우고 스낵바(11-9). 자동 로그인은 하지 않는다.
export default function PasswordResetNew() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; mock?: string }>();
  const mock = parseResetMock(params.mock);
  const email = typeof params.email === 'string' ? params.email : '';
  const confirmRef = useRef<TextInput>(null);

  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errs, setErrs] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  // 11-8 뒤로 → 11-4. 쓴 인증번호 화면은 이미 스택에서 빠져 있다(code.tsx 의 replace).
  const back = () => safeBack(router, '/password-reset');

  // 버튼은 오류 중에도 눌린다 — 누르면 다시 검사(11-3 과 같음).
  const submit = async () => {
    const next = checkNewPassword(pw, confirm);
    setErrs(next);
    if (next.password || next.confirm) return;
    setSaving(true);
    const r = await confirmNewPassword(resetTokenHolder.get() ?? '', pw, confirm, mock);
    if (r.ok) {
      resetTokenHolder.set(null);
      // 로그인 화면이 notice 를 받아 스낵바를 띄운다 — 떠나는 이 화면에서는 상태를 건드리지 않는다.
      router.dismissTo({ pathname: '/login', params: { email, notice: 'reset' } } as never);
      return;
    }
    setSaving(false);
    if (r.kind === 'password') setErrs({ password: r.error });
    else if (r.kind === 'confirm') setErrs({ confirm: r.error });
    else if (r.kind === 'token') setErrs({ form: '인증 시간이 지났어요. 인증번호를 다시 받아 주세요.' });
    else setErrs({ form: r.error });
  };

  if (!FEATURE_PASSWORD_RESET && !__DEV__) return <Redirect href="/login" />;
  // 이메일 없이 들어오면(직접 URL) 11-4 부터.
  if (!email) return <Redirect href={"/password-reset" as never} />;

  return (
    <ResetLayout
      onBack={back}
      title="새 비밀번호를 정해 주세요"
      description="바꾸면 다른 기기에서는 로그아웃돼요."
      footer={
        <Button2 onPress={() => void submit()} loading={saving} fullWidth>
          비밀번호 바꾸기
        </Button2>
      }
    >
      <FormField label="새 비밀번호" error={errs.password} helper={PASSWORD_HINT}>
        <TextField2
          value={pw}
          onChangeText={(v) => {
            setPw(v);
            if (errs.password) setErrs((p) => ({ ...p, password: undefined }));
          }}
          invalid={!!errs.password}
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
          placeholder="새 비밀번호"
          accessibilityLabel="새 비밀번호"
        />
      </FormField>
      <FormField label="새 비밀번호 확인" error={errs.confirm}>
        <TextField2
          ref={confirmRef}
          value={confirm}
          onChangeText={(v) => {
            setConfirm(v);
            if (errs.confirm) setErrs((p) => ({ ...p, confirm: undefined }));
          }}
          invalid={!!errs.confirm}
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
          placeholder="한 번 더 입력"
          accessibilityLabel="새 비밀번호 확인"
        />
      </FormField>
      {errs.form ? <FieldMessage message={errs.form} /> : null}
    </ResetLayout>
  );
}
