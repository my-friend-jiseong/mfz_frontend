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
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

interface FieldErrors {
  email?: string;
  password?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const validate = (): FieldErrors => {
    const errs: FieldErrors = {};
    if (!email.trim()) errs.email = '이메일을 입력해주세요';
    else if (!EMAIL_RE.test(email.trim())) errs.email = '이메일 형식이 올바르지 않습니다';
    if (!password) errs.password = '비밀번호를 입력해주세요';
    return errs;
  };

  const handleLogin = async () => {
    setGlobalError(null);
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    const result = await login(email.trim(), password);
    setSubmitting(false);

    if (result.ok) {
      router.replace('/(tabs)');
      return;
    }

    // Phase 7 코드 분기 — invalid_credentials 면 비밀번호 비우고 포커스, 인라인 표시.
    if (result.code === 'invalid_credentials') {
      setPassword('');
      setFieldErrors({ password: '이메일 또는 비밀번호가 올바르지 않습니다' });
      passwordRef.current?.focus();
      return;
    }
    if (result.code === 'invalid_email' || result.code === 'email_invalid') {
      setFieldErrors({ email: result.error });
      return;
    }
    setGlobalError(result.error);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>일가요</Text>
        <Text style={styles.subtitle}>현장 방문 업무를 함께합니다</Text>

        <View style={styles.form}>
          <Text style={styles.label}>이메일</Text>
          <TextInput
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
            }}
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            editable={!submitting}
            style={[styles.input, fieldErrors.email && styles.inputError]}
            placeholder="example@domain.com"
          />
          {fieldErrors.email ? (
            <Text style={styles.fieldError}>{fieldErrors.email}</Text>
          ) : null}

          <Text style={styles.label}>비밀번호</Text>
          <View style={styles.passwordRow}>
            <TextInput
              ref={passwordRef}
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
              }}
              secureTextEntry={!showPassword}
              returnKeyType="go"
              onSubmitEditing={() => void handleLogin()}
              editable={!submitting}
              style={[
                styles.input,
                styles.passwordInput,
                fieldErrors.password && styles.inputError,
              ]}
              placeholder="비밀번호"
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              style={styles.eyeBtn}
              accessibilityLabel={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
            >
              <Text style={styles.eyeBtnText}>{showPassword ? '🙈' : '👁'}</Text>
            </Pressable>
          </View>
          {fieldErrors.password ? (
            <Text style={styles.fieldError}>{fieldErrors.password}</Text>
          ) : null}

          {globalError ? <Text style={styles.error}>{globalError}</Text> : null}

          <Pressable
            onPress={handleLogin}
            disabled={submitting}
            style={({ pressed }) => [styles.btn, (pressed || submitting) && styles.pressed]}
          >
            <Text style={styles.btnText}>{submitting ? '로그인 중...' : '로그인'}</Text>
          </Pressable>

          <Pressable onPress={() => router.push('/(auth)/signup')} style={styles.link}>
            <Text style={styles.linkText}>처음 사용하시나요? 회원가입</Text>
          </Pressable>

          <Pressable
            onPress={() =>
              Alert.alert(
                '비밀번호 찾기',
                '비밀번호 재설정은 현재 관리자에게 요청해주세요. 이메일로 임시 비밀번호를 발급해드립니다.',
              )
            }
            style={styles.link}
          >
            <Text style={styles.linkSubtle}>비밀번호를 잊으셨나요?</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl, paddingTop: spacing.xxl * 2 },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
  },
  form: { gap: spacing.sm },
  label: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '600',
    marginTop: spacing.md,
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
  inputError: { borderColor: colors.danger },
  fieldError: {
    color: colors.danger,
    fontSize: fontSize.xs,
    marginTop: 4,
    marginLeft: 4,
  },
  passwordRow: { position: 'relative' },
  passwordInput: { paddingRight: spacing.xl * 2 },
  eyeBtn: {
    position: 'absolute',
    right: spacing.md,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  eyeBtnText: { fontSize: 18 },
  error: {
    color: colors.danger,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  pressed: { opacity: 0.85 },
  btnText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: '700',
  },
  link: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  linkText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  linkSubtle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
});
