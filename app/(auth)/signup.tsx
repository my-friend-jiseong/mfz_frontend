import { useRef, useState } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, View, type TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { KeyboardAvoid } from '@/components/ui/KeyboardAvoid';
import { useAuthStore } from '@/stores/authStore';
import { safeBack } from '@/utils/backNavigation';
import { LEGAL_DOCS, LOCATION_TERMS_AVAILABLE, TERMS_URL } from '@/utils/contact';
import { checkPasswordPolicy, PASSWORD_HINT, PASSWORD_MESSAGES } from '@/utils/password';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { Button2 } from '@/components/ui/Button2';
import { Checkbox2 } from '@/components/ui/Checkbox2';
import { FieldMessage, FormField, TextField2 } from '@/components/ui/FormField2';
import { PageHeader } from '@/components/ui/PageHeader';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { SafeScreen } from '@/components/SafeScreen';
import { c2, radius2, space } from '@/theme/v2';

interface FieldErrors {
  email?: string;
  name?: string;
  password?: string;
  passwordConfirm?: string;
  terms?: string;
  form?: string;
}

// 필수 약관 — 모두 동의해야 가입 가능. 각 라벨은 사용자 화면 표시, url 은 외부 페이지.
// URL 은 profile/index.tsx 와 같은 단일 출처(utils/contact.ts LEGAL_DOCS)에서 가져온다 —
// LEGAL_DOCS.location.effectiveDate 만 올리면 여기 URL 도 자동으로 /location-terms 로 바뀐다.
const REQUIRED_TERMS = [
  { key: 'service', label: '이용약관', url: LEGAL_DOCS.service.url },
  { key: 'privacy', label: '개인정보 처리방침', url: LEGAL_DOCS.privacy.url },
  { key: 'location', label: '위치정보 이용약관', url: LOCATION_TERMS_AVAILABLE ? LEGAL_DOCS.location.url : TERMS_URL },
] as const;
type TermKey = (typeof REQUIRED_TERMS)[number]['key'];

function openExternal(url: string, fallbackTitle: string) {
  // 외부 URL — web 에선 새 탭, 모바일은 외부 브라우저. profile/index.tsx 의 openExternal 과 같은 패턴.
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
      Alert.alert(fallbackTitle, `${url}\n\n웹 브라우저에서 위 주소로 열어 주세요.`);
    });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 백엔드 error.code → 어느 칸 아래에 붙일지. 문구는 2차 11-3 '-해요'체로 바꿔 단다.
const CODE_TO_FIELD: Record<string, [keyof FieldErrors, string | null]> = {
  email_already_exists: ['email', '이미 가입된 이메일이에요'],
  email_invalid: ['email', '이메일 형식이 맞지 않아요'],
  invalid_email: ['email', '이메일 형식이 맞지 않아요'],
  name_required: ['name', '이름을 입력해 주세요'],
  password_too_short: ['password', PASSWORD_MESSAGES.tooShort],
  password_policy_violation: ['password', null],
  password_confirm_mismatch: ['passwordConfirm', PASSWORD_MESSAGES.mismatch],
  terms_required: ['terms', '필수 약관 3개에 모두 동의해 주세요'],
};

export default function Signup() {
  const router = useRouter();
  const signup = useAuthStore((s) => s.signup);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [name, setName] = useState('');
  // 약관 동의 칸은 처음에 모두 비어 있다(인수인계 용어·문구 규칙).
  const [agreedTerms, setAgreedTerms] = useState<Record<TermKey, boolean>>({
    service: false,
    privacy: false,
    location: false,
  });
  const allAgreed = REQUIRED_TERMS.every((t) => agreedTerms[t.key]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const nameRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const passwordConfirmRef = useRef<TextInput>(null);

  const clearFieldErr = (key: keyof FieldErrors) =>
    setFieldErrors((p) => (p[key] ? { ...p, [key]: undefined } : p));

  const validate = (): FieldErrors => {
    const errs: FieldErrors = {};
    if (!email.trim()) errs.email = '이메일을 입력해 주세요';
    else if (!EMAIL_RE.test(email.trim())) errs.email = '이메일 형식이 맞지 않아요';
    if (!name.trim()) errs.name = '이름을 입력해 주세요';
    const pwErr = checkPasswordPolicy(password);
    if (pwErr) errs.password = pwErr;
    if (passwordConfirm !== password) errs.passwordConfirm = PASSWORD_MESSAGES.mismatch;
    if (!allAgreed) errs.terms = '필수 약관 3개에 모두 동의해 주세요';
    return errs;
  };

  const toggleAll = () => {
    const next = !allAgreed;
    setAgreedTerms({ service: next, privacy: next, location: next });
    clearFieldErr('terms');
  };

  const toggleOne = (key: TermKey) => {
    setAgreedTerms((p) => ({ ...p, [key]: !p[key] }));
    clearFieldErr('terms');
  };

  // 버튼은 오류 중에도 눌린다 — 누를 때마다 다시 검사한다(인수인계 11-3·11-12).
  const handleSignup = async () => {
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    const result = await signup(email.trim(), password, passwordConfirm, name.trim());

    if (result.ok) {
      // login.tsx 와 동일 — 성공 시 setSubmitting(false) 금지(같은 커밋 폼 재셔플이
      // 전환 중 Fabric addViewAt FATAL 유발) + 최종 목적지 직행.
      router.replace('/(tabs)/trips');
      return;
    }
    setSubmitting(false);

    const mapped = result.code ? CODE_TO_FIELD[result.code] : undefined;
    if (mapped) {
      setFieldErrors({ [mapped[0]]: mapped[1] ?? result.error });
      return;
    }
    setFieldErrors({ form: result.error });
  };

  const termsInvalid = !!fieldErrors.terms;

  return (
    <SafeScreen background={c2.bg.canvas}>
      <PageHeader
        title="회원가입"
        onBack={() => safeBack(router, '/(auth)/login')}
        right={{ label: '로그인', onPress: () => safeBack(router, '/(auth)/login') }}
      />
      <KeyboardAvoid style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <FormField label="이메일" error={fieldErrors.email}>
            <TextField2
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                clearFieldErr('email');
              }}
              invalid={!!fieldErrors.email}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
              autoComplete="email"
              returnKeyType="next"
              onSubmitEditing={() => nameRef.current?.focus()}
              editable={!submitting}
              placeholder="example@domain.com"
              accessibilityLabel="이메일"
            />
          </FormField>

          <FormField label="이름" error={fieldErrors.name}>
            <TextField2
              ref={nameRef}
              value={name}
              onChangeText={(v) => {
                setName(v);
                clearFieldErr('name');
              }}
              invalid={!!fieldErrors.name}
              textContentType="name"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              editable={!submitting}
              placeholder="홍길동"
              accessibilityLabel="이름"
            />
          </FormField>

          <FormField label="비밀번호" error={fieldErrors.password} helper={PASSWORD_HINT}>
            <TextField2
              ref={passwordRef}
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                clearFieldErr('password');
              }}
              invalid={!!fieldErrors.password}
              secureTextEntry
              textContentType="newPassword"
              autoComplete="new-password"
              returnKeyType="next"
              onSubmitEditing={() => passwordConfirmRef.current?.focus()}
              editable={!submitting}
              placeholder="비밀번호"
              accessibilityLabel="비밀번호"
            />
          </FormField>

          <FormField label="비밀번호 확인" error={fieldErrors.passwordConfirm}>
            <TextField2
              ref={passwordConfirmRef}
              value={passwordConfirm}
              onChangeText={(v) => {
                setPasswordConfirm(v);
                clearFieldErr('passwordConfirm');
              }}
              invalid={!!fieldErrors.passwordConfirm}
              secureTextEntry
              textContentType="newPassword"
              autoComplete="new-password"
              returnKeyType="done"
              onSubmitEditing={() => void handleSignup()}
              editable={!submitting}
              placeholder="한 번 더 입력"
              accessibilityLabel="비밀번호 확인"
            />
          </FormField>

          <View>
            <View style={[styles.termsBox, termsInvalid && styles.termsBoxInvalid]}>
              <Touchable
                onPress={toggleAll}
                noAutoHitSlop
                style={styles.agreeAllRow}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: allAgreed }}
              >
                <Checkbox2 checked={allAgreed} invalid={termsInvalid} />
                <Text v2="bodyL.bold" tone="primary">
                  약관에 모두 동의
                </Text>
              </Touchable>
              <View style={styles.termList}>
                {REQUIRED_TERMS.map((t) => {
                  const checked = agreedTerms[t.key];
                  return (
                    <View key={t.key} style={styles.termRow}>
                      <Touchable
                        onPress={() => toggleOne(t.key)}
                        noAutoHitSlop
                        style={styles.termCheck}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked }}
                        accessibilityLabel={`(필수) ${t.label}`}
                      >
                        <Checkbox2 checked={checked} invalid={termsInvalid} />
                        <Text v2="bodyM.regular" tone="tertiary" style={styles.termLabel}>
                          (필수)
                          <Text v2="bodyM.regular" tone="primary">{` ${t.label}`}</Text>
                        </Text>
                      </Touchable>
                      <Touchable
                        onPress={() => openExternal(t.url, t.label)}
                        style={styles.termView}
                        accessibilityRole="link"
                        accessibilityLabel={`${t.label} 보기`}
                      >
                        <Text v2="bodyS.semibold" tone="secondary">
                          보기
                        </Text>
                      </Touchable>
                    </View>
                  );
                })}
              </View>
            </View>
            {fieldErrors.terms ? <FieldMessage message={fieldErrors.terms} style={styles.below} /> : null}
          </View>

          {fieldErrors.form ? <FieldMessage message={fieldErrors.form} /> : null}
        </ScrollView>
        <BottomActionBar>
          <Button2 onPress={() => void handleSignup()} loading={submitting} fullWidth>
            가입하고 시작하기
          </Button2>
        </BottomActionBar>
      </KeyboardAvoid>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: c2.bg.canvas },
  scroll: {
    paddingHorizontal: space[20],
    paddingTop: space[12],
    paddingBottom: space[24],
    gap: space[16],
  },
  termsBox: {
    borderWidth: 1,
    borderColor: c2.border.default,
    borderRadius: radius2.xl,
    paddingHorizontal: space[14],
    paddingTop: space[4],
    paddingBottom: space[6],
  },
  // 11-3: 동의하지 않고 누르면 상자 테두리가 빨강 2.
  termsBoxInvalid: { borderWidth: 2, borderColor: c2.danger, paddingHorizontal: space[14] - 1 },
  agreeAllRow: {
    height: 49,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[10],
    borderBottomWidth: 1,
    borderBottomColor: c2.border.subtle,
  },
  termList: { paddingTop: space[2] },
  termRow: { height: 44, flexDirection: 'row', alignItems: 'center' },
  termCheck: { flex: 1, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: space[10] },
  termLabel: { flex: 1 },
  termView: { height: 44, justifyContent: 'center', paddingHorizontal: space[4] },
  below: { marginTop: space[6] },
});
