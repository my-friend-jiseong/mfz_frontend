import { useRef, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { safeBack } from '@/utils/backNavigation';
import { colors } from '@/theme/colors';
import { spacing, fontSize, fontWeight, lineHeight } from '@/theme/spacing';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface FieldErrors {
  email?: string;
  name?: string;
  password?: string;
  passwordConfirm?: string;
  terms?: string;
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
  const [agreeRequired, setAgreeRequired] = useState(false);
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
    if (!agreeRequired) errs.terms = '필수 약관에 동의해주세요';
    return errs;
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>회원가입</Text>

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

          <Pressable
            onPress={() => {
              setAgreeRequired((v) => !v);
              if (fieldErrors.terms) clearFieldErr('terms');
            }}
            style={styles.agreeRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreeRequired }}
          >
            <Ionicons
              name={agreeRequired ? 'checkbox' : 'square-outline'}
              size={22}
              color={agreeRequired ? colors.primary : colors.textMuted}
            />
            <Text style={styles.agreeText}>
              (필수) 이용약관·개인정보 처리방침·위치정보 이용약관에 동의합니다
            </Text>
          </Pressable>
          {fieldErrors.terms ? (
            <Text style={styles.termsError}>{fieldErrors.terms}</Text>
          ) : null}

          {globalError ? <Text style={styles.error}>{globalError}</Text> : null}

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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl, paddingTop: spacing.xxl * 2 },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.heavy,
    color: colors.text,
    marginBottom: spacing.xl,
    lineHeight: lineHeight.xl,
  },
  form: { gap: spacing.md },
  agreeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  agreeText: { flex: 1, fontSize: fontSize.sm, color: colors.text, lineHeight: lineHeight.sm },
  termsError: { color: colors.danger, fontSize: fontSize.xs, marginTop: spacing.xs },
  error: { color: colors.danger, fontSize: fontSize.sm },
  submit: { marginTop: spacing.md },
});
