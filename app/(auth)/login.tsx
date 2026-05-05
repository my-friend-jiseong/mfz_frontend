import { useState } from 'react';
import {
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

export default function Login() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async () => {
    setError(null);
    setSubmitting(true);
    const result = await login(email, password);
    setSubmitting(false);
    if (result.ok) {
      router.replace('/(tabs)');
    } else {
      setError(result.error);
    }
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
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
            placeholder="example@domain.com"
          />
          <Text style={styles.label}>비밀번호</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={styles.input}
            placeholder="비밀번호"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={handleLogin}
            disabled={submitting}
            style={({ pressed }) => [styles.btn, (pressed || submitting) && styles.pressed]}
          >
            <Text style={styles.btnText}>{submitting ? '로그인 중...' : '로그인'}</Text>
          </Pressable>

          <Pressable onPress={() => router.push('/(auth)/signup')} style={styles.link}>
            <Text style={styles.linkText}>회원가입</Text>
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
  hint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
