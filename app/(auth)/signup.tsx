import { useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { safeBack } from '@/utils/backNavigation';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { SafeScreen } from '@/components/SafeScreen';

interface FieldErrors {
  email?: string;
  name?: string;
  password?: string;
  passwordConfirm?: string;
  terms?: string;
}

// 필수 약관 — 모두 동의해야 가입 가능. 각 라벨은 사용자 화면 표시, url 은 외부 페이지.
const REQUIRED_TERMS = [
  { key: 'service', label: '이용약관', url: 'https://ilgayo.kr/terms' },
  { key: 'privacy', label: '개인정보 처리방침', url: 'https://ilgayo.kr/privacy' },
  { key: 'location', label: '위치정보 이용약관', url: 'https://ilgayo.kr/terms' },
] as const;
type TermKey = (typeof REQUIRED_TERMS)[number]['key'];

function openExternal(url: string, fallbackTitle: string) {
  // 외부 URL — web 에선 새 탭, 모바일은 외부 브라우저. profile.tsx 의 openExternal 과 같은 패턴.
  if (Platform.OS === 'web') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  Linking.canOpenURL(url)
    .then((ok) => {
      if (ok) return Linking.openURL(url);
      throw new Error('not_supported');
    })
    .catch(() => {
      Alert.alert(fallbackTitle, `${url}\n\n웹브라우저에서 위 주소로 접속해주세요.`);
    });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_HINT = '10자 이상 · 영대/영소/숫자/특수문자 중 3종 이상 조합';

// 백엔드 정책: 10자 이상 + 영대/영소/숫자/특수문자 중 3종 이상.
// 한글은 4종 어디에도 매칭되지 않음 — 백엔드가 거부할 가능성 높아 명시적 안내.
function checkPasswordPolicy(pw: string): string | null {
  if (pw.length < 10) return '비밀번호는 10자 이상이어야 합니다';
  if (/[가-힯ᄀ-ᇿ㄰-㆏]/.test(pw)) {
    return '비밀번호에 한글은 사용할 수 없습니다';
  }
  let kinds = 0;
  if (/[A-Z]/.test(pw)) kinds++;
  if (/[a-z]/.test(pw)) kinds++;
  if (/[0-9]/.test(pw)) kinds++;
  if (/[^A-Za-z0-9]/.test(pw)) kinds++;
  if (kinds < 3) return '영대/영소/숫자/특수문자 중 3종 이상을 조합해주세요';
  return null;
}

// 백엔드 error.code → 어느 필드 인라인 에러로 매핑할지.
const CODE_TO_FIELD: Record<string, keyof FieldErrors> = {
  email_already_exists: 'email',
  email_invalid: 'email',
  invalid_email: 'email',
  name_required: 'name',
  password_too_short: 'password',
  password_confirm_mismatch: 'passwordConfirm',
  terms_required: 'terms',
};

export default function Signup() {
  const router = useRouter();
  const signup = useAuthStore((s) => s.signup);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // 약관별 동의 — 모두 true 여야 통과.
  const [agreedTerms, setAgreedTerms] = useState<Record<TermKey, boolean>>({
    service: false,
    privacy: false,
    location: false,
  });
  const allAgreed = REQUIRED_TERMS.every((t) => agreedTerms[t.key]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const nameRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const passwordConfirmRef = useRef<TextInput>(null);

  const validate = (): FieldErrors => {
    const errs: FieldErrors = {};
    if (!email.trim()) errs.email = '이메일을 입력해주세요';
    else if (!EMAIL_RE.test(email.trim())) errs.email = '이메일 형식이 올바르지 않습니다';
    if (!name.trim()) errs.name = '이름을 입력해주세요';
    const pwErr = checkPasswordPolicy(password);
    if (pwErr) errs.password = pwErr;
    if (passwordConfirm !== password) errs.passwordConfirm = '비밀번호 확인이 일치하지 않습니다';
    if (!allAgreed) errs.terms = '필수 약관 3종에 모두 동의해주세요';
    return errs;
  };

  const toggleAll = () => {
    const next = !allAgreed;
    setAgreedTerms({ service: next, privacy: next, location: next });
    if (fieldErrors.terms) clearFieldErr('terms');
  };

  const toggleOne = (key: TermKey) => {
    setAgreedTerms((p) => ({ ...p, [key]: !p[key] }));
    if (fieldErrors.terms) clearFieldErr('terms');
  };

  const clearFieldErr = (key: keyof FieldErrors) =>
    setFieldErrors((p) => ({ ...p, [key]: undefined }));

  const handleSignup = async () => {
    setGlobalError(null);
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    const result = await signup(email.trim(), password, passwordConfirm, name.trim());
    setSubmitting(false);

    if (result.ok) {
      router.replace('/(tabs)');
      return;
    }

    if (result.code === 'email_already_exists') {
      Alert.alert(
        '이미 가입된 이메일',
        '이 이메일로 이미 계정이 있습니다. 로그인 화면으로 이동할까요?',
        [
          { text: '취소', style: 'cancel' },
          { text: '로그인', onPress: () => router.replace('/(auth)/login') },
        ],
      );
      return;
    }

    if (result.code && CODE_TO_FIELD[result.code]) {
      setFieldErrors({ [CODE_TO_FIELD[result.code]]: result.error });
      return;
    }

    setGlobalError(result.error);
  };

  const passwordMatched =
    passwordConfirm.length > 0 && passwordConfirm === password && !fieldErrors.passwordConfirm;

  return (
    <SafeScreen>
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text variant="h2" weight="heavy" style={styles.title}>
          회원가입
        </Text>

        <View style={styles.form}>
          <Input
            label="이메일"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (fieldErrors.email) clearFieldErr('email');
            }}
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="next"
            onSubmitEditing={() => nameRef.current?.focus()}
            editable={!submitting}
            placeholder="example@domain.com"
            error={fieldErrors.email}
          />

          <Input
            ref={nameRef}
            label="이름"
            value={name}
            onChangeText={(v) => {
              setName(v);
              if (fieldErrors.name) clearFieldErr('name');
            }}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            editable={!submitting}
            placeholder="홍길동"
            error={fieldErrors.name}
          />

          <Input
            ref={passwordRef}
            label="비밀번호"
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              if (fieldErrors.password) clearFieldErr('password');
              if (fieldErrors.passwordConfirm) clearFieldErr('passwordConfirm');
            }}
            secureTextEntry={!showPassword}
            returnKeyType="next"
            onSubmitEditing={() => passwordConfirmRef.current?.focus()}
            editable={!submitting}
            placeholder="비밀번호"
            error={fieldErrors.password}
            helperText={fieldErrors.password ? undefined : PASSWORD_HINT}
            rightSlot={
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                accessibilityLabel={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                hitSlop={8}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.textMuted}
                />
              </Pressable>
            }
          />

          <Input
            ref={passwordConfirmRef}
            label="비밀번호 확인"
            value={passwordConfirm}
            onChangeText={(v) => {
              setPasswordConfirm(v);
              if (fieldErrors.passwordConfirm) clearFieldErr('passwordConfirm');
            }}
            secureTextEntry={!showPassword}
            returnKeyType="done"
            onSubmitEditing={() => void handleSignup()}
            editable={!submitting}
            placeholder="비밀번호 확인"
            error={fieldErrors.passwordConfirm}
            rightSlot={
              passwordMatched ? (
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              ) : undefined
            }
          />

          <View style={styles.termsBox}>
            <Pressable
              onPress={toggleAll}
              style={styles.agreeAllRow}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: allAgreed }}
            >
              <Ionicons
                name={allAgreed ? 'checkbox' : 'square-outline'}
                size={22}
                color={allAgreed ? colors.primary : colors.textMuted}
              />
              <Text variant="bodySm" weight="bold" style={styles.agreeText}>
                필수 약관에 모두 동의
              </Text>
            </Pressable>
            <View style={styles.termsDivider} />
            {REQUIRED_TERMS.map((t) => {
              const checked = agreedTerms[t.key];
              return (
                <View key={t.key} style={styles.termRow}>
                  <Pressable
                    onPress={() => toggleOne(t.key)}
                    style={styles.termCheck}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                  >
                    <Ionicons
                      name={checked ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={checked ? colors.primary : colors.textMuted}
                    />
                    <Text variant="bodySm" style={styles.termLabel}>
                      (필수) {t.label}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => openExternal(t.url, t.label)}
                    hitSlop={8}
                    accessibilityLabel={`${t.label} 보기`}
                  >
                    <Text variant="caption" color="primary">
                      보기
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
          {fieldErrors.terms ? (
            <Text variant="caption" color="danger" style={styles.termsError}>
              {fieldErrors.terms}
            </Text>
          ) : null}

          {globalError ? (
            <Text variant="bodySm" color="danger">
              {globalError}
            </Text>
          ) : null}

          <Button
            onPress={handleSignup}
            size="lg"
            loading={submitting}
            fullWidth
            style={styles.submit}
          >
            가입하고 시작하기
          </Button>

          <Button
            onPress={() => safeBack(router)}
            variant="ghost"
            size="sm"
            fullWidth
          >
            이미 계정이 있어요
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl, paddingTop: spacing.xxl * 2 },
  title: { marginBottom: spacing.xl },
  form: { gap: spacing.md },
  termsBox: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  agreeAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  agreeText: { flex: 1 },
  termsDivider: {
    height: 1,
    backgroundColor: colors.borderMuted,
    marginVertical: spacing.xs,
  },
  termRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  termCheck: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  termLabel: { flex: 1 },
  termsError: { marginTop: spacing.xs },
  submit: { marginTop: spacing.md },
});
