import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, type TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { KeyboardAvoid } from '@/components/ui/KeyboardAvoid';
import { useAuthStore } from '@/stores/authStore';
import { Button2 } from '@/components/ui/Button2';
import { FormField, TextField2 } from '@/components/ui/FormField2';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { snackbar } from '@/components/ui/Snackbar';
import { Icon } from '@/components/icons';
import { SafeScreen } from '@/components/SafeScreen';
import { FEATURE_PASSWORD_RESET } from '@/api/config';
import { c2, radius2, space } from '@/theme/v2';

interface FieldErrors {
  email?: string;
  password?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 다른 화면에서 로그인으로 돌아오며 띄우는 한 줄(11-9 재설정 완료, 10-4 탈퇴 완료).
// 떠나는 화면이 아니라 여기서 띄워야 화면 교체와 스낵바가 한 배치에 섞이지 않는다.
const NOTICES = {
  reset: '비밀번호를 바꿨어요. 새 비밀번호로 로그인해 주세요.',
  deleted: '회원 탈퇴가 끝났어요.',
} as const;

export default function Login() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; notice?: string }>();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  // 11-9: 재설정한 이메일을 미리 채우고 스낵바. 한 번 띄운 뒤 notice 를 지워 새로고침에 다시 뜨지 않게.
  useEffect(() => {
    if (typeof params.email === 'string' && params.email) setEmail(params.email);
    const raw = params.notice;
    const notice =
      typeof raw === 'string' && Object.prototype.hasOwnProperty.call(NOTICES, raw)
        ? (raw as keyof typeof NOTICES)
        : undefined;
    if (notice) {
      // 이전 시도의 오류·비밀번호는 지운다(재설정·탈퇴 뒤 새로 들어온 것과 같게).
      setFormError(null);
      setFieldErrors({});
      setPassword('');
      // 앱을 이 URL 로 바로 열면 스낵바 호스트가 이 화면보다 늦게 붙는다 — 한 프레임 미룬다.
      // (notice 를 지우면 effect 가 다시 돌므로 정리 함수로 취소하지 않는다.)
      requestAnimationFrame(() =>
        snackbar.show({ message: NOTICES[notice], duration: 4000, bottomOffset: space[8] }),
      );
      router.setParams({ notice: undefined });
    }
  }, [params.email, params.notice, router]);

  const validate = (): FieldErrors => {
    const errs: FieldErrors = {};
    if (!email.trim()) errs.email = '이메일을 입력해 주세요';
    else if (!EMAIL_RE.test(email.trim())) errs.email = '이메일 형식이 맞지 않아요';
    if (!password) errs.password = '비밀번호를 입력해 주세요';
    return errs;
  };

  const handleLogin = async () => {
    setFormError(null);
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    const result = await login(email.trim(), password);

    if (result.ok) {
      // 성공 시 setSubmitting(false) 를 일부러 호출하지 않는다 — editable/loading 플립이
      // Fabric 뷰 플래트닝 재계산(EditText 재부모화)을 일으키고, 같은 JS 틱의 replace 와
      // 한 마운트 배치로 합쳐지면 전환 중 RNSScreen 의 removeView 가 자식을 분리하지 않아
      // (screens#3249) addViewAt "child already has a parent" FATAL — 로그인 직후 앱이
      // 조용히 죽던(내려가 보이던) 버그의 진범. 떠나는 화면이라 리셋 불필요, 스피너 유지가
      // UX 로도 자연스럽다. adb logcat 마운트 배치 덤프로 실측 확인(2026-06-05).
      // 목적지는 '/(tabs)' 가 아닌 '/(tabs)/trips' 직행 — (tabs)/index <Redirect> 경유
      // 이중 전환 회피.
      router.replace('/(tabs)/trips');
      return;
    }
    setSubmitting(false);

    // 11-1: 이메일·비밀번호 불일치는 칸이 아니라 버튼 위 빨간 상자 한 줄. 입력값은 그대로 둔다.
    if (result.code === 'invalid_credentials') {
      setFormError('이메일 또는 비밀번호가 맞지 않아요.');
      return;
    }
    if (result.code === 'invalid_email' || result.code === 'email_invalid') {
      setFieldErrors({ email: '이메일 형식이 맞지 않아요' });
      return;
    }
    setFormError(result.error);
  };

  const openReset = () => {
    const e = email.trim();
    router.push((e ? `/password-reset?email=${encodeURIComponent(e)}` : '/password-reset') as never);
  };

  return (
    <SafeScreen edges={['top', 'bottom']} background={c2.bg.canvas}>
      <KeyboardAvoid style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text v2="logo" tone="link" accessibilityRole="header">
            일가요
          </Text>
          <Text v2="bodyL.regular" tone="secondary" style={styles.tagline}>
            현장 방문 업무를 함께합니다
          </Text>

          <View style={styles.form}>
            <FormField label="이메일" error={fieldErrors.email}>
              <TextField2
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
                }}
                invalid={!!fieldErrors.email}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="username"
                autoComplete="email"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                editable={!submitting}
                placeholder="example@domain.com"
                accessibilityLabel="이메일"
              />
            </FormField>
            <FormField label="비밀번호" error={fieldErrors.password}>
              <TextField2
                ref={passwordRef}
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
                }}
                invalid={!!fieldErrors.password}
                secureTextEntry
                textContentType="password"
                autoComplete="current-password"
                returnKeyType="go"
                onSubmitEditing={() => void handleLogin()}
                editable={!submitting}
                placeholder="비밀번호"
                accessibilityLabel="비밀번호"
              />
            </FormField>

            {formError ? (
              <View style={styles.alert} accessibilityRole="alert" accessibilityLiveRegion="polite">
                <Icon name="alert" size={16} color={c2.text.danger} />
                <Text v2="bodyS.semibold" tone="danger" style={styles.alertText}>
                  {formError}
                </Text>
              </View>
            ) : null}

            <Button2 onPress={() => void handleLogin()} loading={submitting} fullWidth style={styles.submit}>
              로그인
            </Button2>
          </View>

          <View style={styles.links}>
            <Touchable
              onPress={() => router.push('/(auth)/signup')}
              accessibilityRole="button"
              style={styles.link}
            >
              <Text v2="bodyM.bold" tone="link">
                회원가입
              </Text>
            </Touchable>
            {/* 비밀번호 찾기는 서버 API 가 생기면 연다(FEATURE_PASSWORD_RESET). */}
            {FEATURE_PASSWORD_RESET ? (
              <>
                <View style={styles.divider} />
                <Touchable onPress={openReset} accessibilityRole="button" style={styles.link}>
                  <Text v2="bodyM.semibold" tone="secondary">
                    비밀번호를 잊었어요
                  </Text>
                </Touchable>
              </>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoid>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: c2.bg.canvas },
  // Figma 11: 상태 표시줄 아래 88 에 로고, 좌우 24.
  scroll: {
    paddingHorizontal: space[24],
    paddingTop: space[32] * 2 + space[24],
    paddingBottom: space[24],
  },
  tagline: { marginTop: space[6] },
  form: { marginTop: space[32] + space[8], gap: space[16] },
  alert: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[8],
    paddingHorizontal: space[14],
    paddingVertical: space[10],
    borderRadius: radius2.lg,
    backgroundColor: c2.bg.dangerSubtle,
  },
  alertText: { flex: 1 },
  submit: { marginTop: space[8] },
  links: {
    marginTop: space[20],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[4],
  },
  link: { height: 44, justifyContent: 'center', paddingHorizontal: space[12] },
  divider: { width: 1, height: 14, backgroundColor: c2.bg.placeholder },
});
