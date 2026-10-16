import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { FEATURE_PASSWORD_RESET } from '@/api/config';
import { ResetLayout } from '@/components/auth/ResetLayout';
import { Button2 } from '@/components/ui/Button2';
import { FieldMessage } from '@/components/ui/FormField2';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { safeBack } from '@/utils/backNavigation';
import {
  CODE_LENGTH,
  formatMSs,
  formatMmSs,
  parseResetMock,
  requestResetCode,
  resetTokenHolder,
  verifyResetCode,
} from '@/utils/passwordReset';
import { c2, radius2, space } from '@/theme/v2';

// 11-5 인증번호 입력 · 11-6 번호 불일치 · 11-7 5번 틀림 · 11-10 5분 지남 (+ 11-11 발송 제한 문구).
// 입력은 숨긴 TextInput 하나(maxLength 6, 숫자 키패드, 문자 자동 채우기)이고 6칸은 보여 주기만 한다.

type Status =
  | { kind: 'idle' }
  | { kind: 'invalid'; remaining: number }
  | { kind: 'exceeded' }
  | { kind: 'expired' }
  | { kind: 'limited'; minutes: number };

const toNum = (v: unknown, fallback: number) => {
  const n = typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const OTP_AUTOCOMPLETE = Platform.select({ android: 'sms-otp', default: 'one-time-code' }) as 'sms-otp' | 'one-time-code';

export default function PasswordResetCode() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; mock?: string; exp?: string; resend?: string }>();
  const mock = parseResetMock(params.mock);
  const email = typeof params.email === 'string' ? params.email : '';
  const inputRef = useRef<TextInput>(null);

  const [code, setCode] = useState('');
  const [focused, setFocused] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [expiresAt, setExpiresAt] = useState(() =>
    mock === 'expired' ? Date.now() : Date.now() + toNum(params.exp, 300) * 1000,
  );
  const [resendAt, setResendAt] = useState(() => Date.now() + toNum(params.resend, 60) * 1000);
  const [status, setStatus] = useState<Status>(() => (mock === 'locked' ? { kind: 'exceeded' } : { kind: 'idle' }));
  const [busy, setBusy] = useState(false);
  // 네트워크 같은 그 밖의 실패 — 지금 상태(11-7·11-10 포함)를 바꾸지 않고 문구만 덧붙인다.
  const [extraError, setExtraError] = useState<string | null>(null);
  // 다시 받은 뒤 입력 칸 포커스 — 칸이 다시 켜진(editable) 다음 프레임에.
  const [focusReq, setFocusReq] = useState(0);
  useEffect(() => {
    if (!focusReq) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [focusReq]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const leftSec = (expiresAt - now) / 1000;
  const resendLeft = (resendAt - now) / 1000;
  const dead = status.kind === 'exceeded' || status.kind === 'expired' || status.kind === 'limited';

  // 11-10: 5분이 지나면 입력 칸을 끄고 '새 인증번호 받기'로 바꾼다.
  useEffect(() => {
    if (!dead && leftSec <= 0) {
      setStatus({ kind: 'expired' });
      setCode('');
    }
  }, [dead, leftSec]);

  const onChange = (v: string) => {
    // 숫자만 남긴 뒤 6자리로 자른다(붙여넣기 '382-917' 같은 경우). maxLength 로 먼저 자르면 숫자가 잘린다.
    setCode(v.replace(/\D/g, '').slice(0, CODE_LENGTH));
    if (status.kind === 'invalid') setStatus({ kind: 'idle' });
    if (extraError) setExtraError(null);
  };

  const resetWith = (exp: number, resend: number) => {
    const t = Date.now();
    setNow(t);
    setExpiresAt(t + exp * 1000);
    setResendAt(t + resend * 1000);
    setCode('');
    setStatus({ kind: 'idle' });
    setExtraError(null);
  };

  // [다시 보내기]·[새 인증번호 받기] 공통. 1시간 5통을 넘기면 11-11 과 같은 문구.
  const resend = async () => {
    setBusy(true);
    setExtraError(null);
    const r = await requestResetCode(email, mock === 'locked' || mock === 'expired' ? 'ok' : mock);
    setBusy(false);
    if (r.ok) {
      resetWith(r.expiresInSec, r.resendAfterSec);
      setFocusReq((n) => n + 1);
      return;
    }
    if (r.kind === 'rate_limited') {
      setStatus({ kind: 'limited', minutes: r.retryAfterMinutes });
      setCode('');
      return;
    }
    // 그 밖의 실패(네트워크 등)는 지금 상태를 그대로 두고 문구만 덧붙인다.
    setExtraError(r.error);
  };

  const verify = async () => {
    if (code.length !== CODE_LENGTH) return;
    setBusy(true);
    setExtraError(null);
    const r = await verifyResetCode(email, code, mock);
    if (r.ok) {
      resetTokenHolder.set(r.resetToken);
      // 11-8 에서 뒤로 가면 11-4 로 — 쓴 인증번호 화면은 스택에서 뺀다(replace).
      router.replace({
        pathname: '/password-reset/new-password',
        params: { email, ...(mock ? { mock } : {}) },
      } as never);
      return;
    }
    setBusy(false);
    if (r.kind === 'invalid') setStatus({ kind: 'invalid', remaining: r.remainingAttempts });
    else if (r.kind === 'exceeded' || r.kind === 'expired') {
      setStatus({ kind: r.kind });
      setCode('');
    } else if (r.kind === 'other') setExtraError(r.error);
  };

  const statusMessage =
    status.kind === 'invalid'
      ? `인증번호가 맞지 않아요. ${status.remaining}번 더 입력할 수 있어요.`
      : status.kind === 'exceeded'
        ? '5번 틀렸어요. 새 인증번호를 받아 주세요.'
        : status.kind === 'expired'
          ? '입력 시간 5분이 지났어요. 새 인증번호를 받아 주세요.'
          : status.kind === 'limited'
            ? `1시간에 5번까지 받을 수 있어요. ${status.minutes}분 뒤에 다시 해 주세요.`
            : null;
  const message = extraError ? (statusMessage ? `${statusMessage} ${extraError}` : extraError) : statusMessage;

  const footer = dead ? (
    <Button2
      onPress={() => void resend()}
      loading={busy}
      disabled={status.kind === 'limited'}
      disabledLook="muted"
      fullWidth
    >
      새 인증번호 받기
    </Button2>
  ) : (
    <Button2
      onPress={() => void verify()}
      loading={busy}
      disabled={code.length !== CODE_LENGTH}
      disabledLook="muted"
      fullWidth
    >
      확인
    </Button2>
  );

  const invalid = status.kind === 'invalid';

  // 서버가 생기기 전엔 운영 빌드에서 열지 않는다. 이메일 없이 들어오면(직접 URL) 11-4 부터.
  if (!FEATURE_PASSWORD_RESET && !__DEV__) return <Redirect href="/login" />;
  if (!email) return <Redirect href={"/password-reset" as never} />;

  return (
    <ResetLayout
      onBack={() => safeBack(router, '/password-reset')}
      title="인증번호를 입력해 주세요"
      description={
        <Text v2="bodyM.regular" tone="secondary">
          가입된 이메일이면{' '}
          <Text v2="bodyM.bold" tone="primary">
            {email}
          </Text>
          으로 1분 안에 도착해요.
        </Text>
      }
      footer={footer}
    >
      <View>
        <View style={styles.cells}>
          {Array.from({ length: CODE_LENGTH }, (_, i) => {
            const digit = dead ? '' : code[i] ?? '';
            const active = focused && !dead && i === code.length;
            return (
              <View
                key={i}
                style={[
                  styles.cell,
                  active && styles.cellActive,
                  invalid && styles.cellInvalid,
                  dead && styles.cellDead,
                ]}
              >
                <Text v2="code.digit" tone="primary">
                  {digit}
                </Text>
              </View>
            );
          })}
          {/* 칸 위에 투명하게 겹쳐 둔다 — 어느 칸을 눌러도 키패드가 열리고, 붙여넣기·자동 채우기도 받는다. */}
          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={onChange}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            maxLength={20}
            keyboardType="number-pad"
            inputMode="numeric"
            textContentType="oneTimeCode"
            autoComplete={OTP_AUTOCOMPLETE}
            autoFocus
            editable={!dead}
            caretHidden
            accessibilityLabel="인증번호 6자리"
            style={styles.hiddenInput}
          />
        </View>

        {message ? (
          <FieldMessage message={message} style={dead ? styles.deadMsg : styles.below} />
        ) : (
          <Text v2="caption.regular" tone="tertiary" style={styles.below}>
            남은 시간{' '}
            <Text v2="caption.bold" tone="link">
              {formatMmSs(leftSec)}
            </Text>
          </Text>
        )}

        {dead ? null : (
          <View style={styles.resendRow}>
            <Text v2="bodyS.regular" tone="tertiary">
              메일이 안 왔나요?
            </Text>
            <Touchable
              onPress={() => void resend()}
              disabled={resendLeft > 0 || busy}
              accessibilityRole="button"
              accessibilityLabel={resendLeft > 0 ? `다시 보내기, ${Math.ceil(resendLeft)}초 뒤 가능` : '다시 보내기'}
              style={styles.resendBtn}
            >
              <Text v2="bodyS.bold" tone={resendLeft > 0 ? 'disabled' : 'link'}>
                다시 보내기{resendLeft > 0 ? ` ${formatMSs(resendLeft)}` : ''}
              </Text>
            </Touchable>
          </View>
        )}
      </View>
    </ResetLayout>
  );
}

const styles = StyleSheet.create({
  cells: { flexDirection: 'row', gap: space[8] },
  // 360dp 폭에서도 넘치지 않게 칸은 늘었다 줄었다 하되 48 을 넘지 않는다.
  cell: {
    flex: 1,
    maxWidth: 48,
    height: 56,
    borderRadius: radius2.md,
    borderWidth: 1,
    borderColor: c2.border.default,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c2.bg.canvas,
  },
  cellActive: { borderWidth: 1.5, borderColor: c2.border.brand },
  cellInvalid: { borderWidth: 2, borderColor: c2.danger },
  cellDead: { backgroundColor: c2.bg.subtle },
  hiddenInput: { ...StyleSheet.absoluteFillObject, opacity: 0, color: 'transparent' },
  below: { marginTop: space[10] },
  deadMsg: { marginTop: space[14] },
  resendRow: {
    marginTop: space[16],
    flexDirection: 'row',
    alignItems: 'center',
  },
  resendBtn: { height: 44, justifyContent: 'center', paddingHorizontal: space[6] },
});
