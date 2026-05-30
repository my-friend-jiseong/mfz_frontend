import { useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
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
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { SafeScreen } from '@/components/SafeScreen';

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
    <SafeScreen>
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text variant="h1" color="primary" align="center">
            일가요
          </Text>
          <Text
            variant="bodySm"
            color="textMuted"
            align="center"
            style={styles.tagline}
          >
            현장 방문 업무를 함께합니다
          </Text>
        </View>

        <View style={styles.form}>
          <Input
            label="이메일"
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
            placeholder="example@domain.com"
            error={fieldErrors.email}
          />

          <Input
            ref={passwordRef}
            label="비밀번호"
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
            }}
            secureTextEntry={!showPassword}
            returnKeyType="go"
            onSubmitEditing={() => void handleLogin()}
            editable={!submitting}
            placeholder="비밀번호"
            error={fieldErrors.password}
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

          {globalError ? (
            <Text variant="bodySm" color="danger">
              {globalError}
            </Text>
          ) : null}

          <Button
            onPress={handleLogin}
            size="lg"
            loading={submitting}
            fullWidth
            style={styles.submit}
          >
            로그인
          </Button>

          <Button
            onPress={() => router.push('/(auth)/signup')}
            variant="ghost"
            size="sm"
            fullWidth
          >
            회원가입
          </Button>

          <Pressable
            onPress={() =>
              Alert.alert(
                '비밀번호 재설정',
                '운영자 이메일 support@ilgayo.kr 로 가입 이메일을 알려주시면 임시 비밀번호를 발급해드립니다. (자동 재설정 기능은 준비 중입니다)',
              )
            }
            style={styles.subtleLink}
          >
            <Text variant="caption" color="textMuted">
              비밀번호를 잊으셨나요?
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl, paddingTop: spacing.xxl * 2 },
  header: { marginBottom: spacing.xxl },
  tagline: { marginTop: spacing.sm },
  form: { gap: spacing.md },
  submit: { marginTop: spacing.md },
  subtleLink: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
});
