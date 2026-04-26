import { useState } from 'react';
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

export default function Signup() {
  const router = useRouter();
  const signup = useAuthStore((s) => s.signup);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [name, setName] = useState('');
  const [agreeRequired, setAgreeRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSignup = async () => {
    setError(null);
    if (!agreeRequired) {
      setError('필수 약관에 동의해주세요');
      return;
    }
    if (password !== passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다');
      return;
    }
    setSubmitting(true);
    const result = await signup(email, password, passwordConfirm, name);
    setSubmitting(false);
    if (result.ok) {
      router.replace('/(tabs)');
      return;
    }
    // 이미 가입된 이메일이면 로그인 화면으로 안내
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
    setError(result.error);
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
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
            placeholder="example@domain.com"
          />
          <Text style={styles.label}>이름</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            style={styles.input}
            placeholder="홍길동"
          />
          <Text style={styles.label}>비밀번호</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={styles.input}
            placeholder="비밀번호"
          />
          <Text style={styles.label}>비밀번호 확인</Text>
          <TextInput
            value={passwordConfirm}
            onChangeText={setPasswordConfirm}
            secureTextEntry
            style={styles.input}
            placeholder="비밀번호 확인"
          />

          <Pressable
            onPress={() => setAgreeRequired((v) => !v)}
            style={styles.agreeRow}
          >
            <View style={[styles.checkbox, agreeRequired && styles.checkboxActive]}>
              {agreeRequired ? <Text style={styles.check}>✓</Text> : null}
            </View>
            <Text style={styles.agreeText}>
              (필수) 이용약관·개인정보 처리방침·위치정보 이용약관에 동의합니다
            </Text>
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}

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
