import { useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { FEATURE_PASSWORD_RESET } from '@/api/config';
import { ResetLayout } from '@/components/auth/ResetLayout';
import { Button2 } from '@/components/ui/Button2';
import { FormField, TextField2 } from '@/components/ui/FormField2';
import { safeBack } from '@/utils/backNavigation';
import { parseResetMock, requestResetCode } from '@/utils/passwordReset';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 11-4 비밀번호 찾기(이메일) · 11-11 발송 제한.
// 진입 링크는 FEATURE_PASSWORD_RESET 플래그 뒤에 있고, 화면은 URL 로 직접 열 수 있다(검토용).
export default function PasswordResetEmail() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; mock?: string }>();
  const mock = parseResetMock(params.mock);
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [error, setError] = useState<string | null>(null);
  // 11-11: 1시간 5통을 넘기면 버튼을 끈다. 이메일을 바꾸면 다시 켠다(제한은 주소 단위).
  const [limited, setLimited] = useState(false);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const e = email.trim();
    if (!e) return setError('이메일을 입력해 주세요');
    if (!EMAIL_RE.test(e)) return setError('이메일 형식이 맞지 않아요');
    setError(null);
    setSending(true);
    const r = await requestResetCode(e, mock);
    if (r.ok) {
      // 떠나는 화면의 폼은 되돌리지 않는다(같은 틱 setState + 이동 금지). 돌아오면 다시 누를 수 있게
      // sending 은 다음 프레임에 푼다.
      router.push({
        pathname: '/password-reset/code',
        params: { email: e, exp: String(r.expiresInSec), resend: String(r.resendAfterSec), ...(mock ? { mock } : {}) },
      } as never);
      requestAnimationFrame(() => setSending(false));
      return;
    }
    setSending(false);
    if (r.kind === 'rate_limited') {
      setLimited(true);
      setError(`1시간에 5번까지 받을 수 있어요. ${r.retryAfterMinutes}분 뒤에 다시 해 주세요.`);
      return;
    }
    setError(r.error);
  };

  // 서버가 생기기 전엔 운영 빌드에서 열지 않는다(개발 빌드는 검토용으로 연다).
  if (!FEATURE_PASSWORD_RESET && !__DEV__) return <Redirect href="/login" />;

  return (
    <ResetLayout
      onBack={() => safeBack(router, '/(auth)/login')}
      title="가입한 이메일을 알려 주세요"
      description="이 주소로 인증번호 6자리를 보내 드려요."
      footer={
        <Button2
          onPress={() => void submit()}
          loading={sending}
          disabled={limited}
          disabledLook="muted"
          fullWidth
        >
          인증번호 받기
        </Button2>
      }
    >
      <FormField label="이메일" error={error}>
        <TextField2
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            if (error) setError(null);
            if (limited) setLimited(false);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          autoComplete="email"
          returnKeyType="send"
          onSubmitEditing={() => {
            if (!limited) void submit();
          }}
          placeholder="example@domain.com"
          accessibilityLabel="이메일"
        />
      </FormField>
    </ResetLayout>
  );
}
