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
  name?: string;
  password?: string;
  passwordConfirm?: string;
  terms?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_HINT =
  '10자 이상 · 영대/영소/숫자/특수문자 중 3종 이상 조합';

// 백엔드 정책: 10자 이상 + 영대/영소/숫자/특수문자 중 3종 이상.
function checkPasswordPolicy(pw: string): string | null {
  if (pw.length < 10) return '비밀번호는 10자 이상이어야 합니다';
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

  // 글자 변경 시 해당 필드 에러 자동 클리어 — 사용자가 즉각 수정했음을 가정.
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

    // 이미 가입된 이메일이면 로그인 화면으로 안내 (기존 흐름 유지).
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

    // 백엔드 코드 → 인라인 필드 에러 매핑.
    if (result.code && CODE_TO_FIELD[result.code]) {
      setFieldErrors({ [CODE_TO_FIELD[result.code]]: result.error });
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
        <Text style={styles.title}>회원가입</Text>

        <View style={styles.form}>
          <Text style={styles.label}>이메일</Text>
          <TextInput
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
            style={[styles.input, fieldErrors.email && styles.inputError]}
            placeholder="example@domain.com"
          />
          {fieldErrors.email ? (
            <Text style={styles.fieldError}>{fieldErrors.email}</Text>
          ) : null}

          <Text style={styles.label}>이름</Text>
          <TextInput
            ref={nameRef}
            value={name}
            onChangeText={(v) => {
              setName(v);
              if (fieldErrors.name) clearFieldErr('name');
            }}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            editable={!submitting}
            style={[styles.input, fieldErrors.name && styles.inputError]}
            placeholder="홍길동"
          />
          {fieldErrors.name ? (
            <Text style={styles.fieldError}>{fieldErrors.name}</Text>
          ) : null}

          <Text style={styles.label}>비밀번호</Text>
          <View style={styles.passwordRow}>
            <TextInput
              ref={passwordRef}
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (fieldErrors.password) clearFieldErr('password');
                // 확인 필드와 일치 여부 변하면 그쪽 에러도 클리어
                if (fieldErrors.passwordConfirm) clearFieldErr('passwordConfirm');
              }}
              secureTextEntry={!showPassword}
              returnKeyType="next"
              onSubmitEditing={() => passwordConfirmRef.current?.focus()}
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
          ) : (
            <Text style={styles.hint}>{PASSWORD_HINT}</Text>
          )}

          <Text style={styles.label}>비밀번호 확인</Text>
          <TextInput
            ref={passwordConfirmRef}
            value={passwordConfirm}
            onChangeText={(v) => {
              setPasswordConfirm(v);
              if (fieldErrors.passwordConfirm) clearFieldErr('passwordConfirm');
            }}
            secureTextEntry={!showPassword}
            returnKeyType="done"
            onSubmitEditing={() => void handleSignup()}
            editable={!submitting}
            style={[styles.input, fieldErrors.passwordConfirm && styles.inputError]}
            placeholder="비밀번호 확인"
          />
          {fieldErrors.passwordConfirm ? (
            <Text style={styles.fieldError}>{fieldErrors.passwordConfirm}</Text>
          ) : passwordConfirm.length > 0 && passwordConfirm === password ? (
            <Text style={styles.matchOk}>✓ 비밀번호 일치</Text>
          ) : null}

          <Pressable
            onPress={() => {
              setAgreeRequired((v) => !v);
              if (fieldErrors.terms) clearFieldErr('terms');
            }}
            style={styles.agreeRow}
          >
            <View style={[styles.checkbox, agreeRequired && styles.checkboxActive]}>
              {agreeRequired ? <Text style={styles.check}>✓</Text> : null}
            </View>
            <Text style={styles.agreeText}>
              (필수) 이용약관·개인정보 처리방침·위치정보 이용약관에 동의합니다
            </Text>
          </Pressable>
          {fieldErrors.terms ? (
            <Text style={styles.fieldError}>{fieldErrors.terms}</Text>
          ) : null}

          {globalError ? <Text style={styles.error}>{globalError}</Text> : null}

          <Pressable
            onPress={handleSignup}
            disabled={submitting}
            style={({ pressed }) => [styles.btn, (pressed || submitting) && styles.pressed]}
          >
            <Text style={styles.btnText}>{submitting ? '가입 중...' : '가입하고 시작하기'}</Text>
          </Pressable>

          <Pressable onPress={() => router.back()} style={styles.link}>
            <Text style={styles.linkText}>이미 계정이 있어요</Text>
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
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.xl,
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
  hint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 4,
    marginLeft: 4,
  },
  matchOk: {
    color: colors.success,
    fontSize: fontSize.xs,
    marginTop: 4,
    marginLeft: 4,
    fontWeight: '700',
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
  agreeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  check: { color: '#fff', fontSize: 14, fontWeight: '800' },
  agreeText: { flex: 1, fontSize: fontSize.sm, color: colors.text },
  error: { color: colors.danger, fontSize: fontSize.sm, marginTop: spacing.sm },
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  pressed: { opacity: 0.85 },
  btnText: { color: '#fff', fontSize: fontSize.base, fontWeight: '700' },
  link: { alignItems: 'center', paddingVertical: spacing.md },
  linkText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' },
});
