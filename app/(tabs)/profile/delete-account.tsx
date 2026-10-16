import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { KeyboardAvoid } from '@/components/ui/KeyboardAvoid';
import { useAuthStore } from '@/stores/authStore';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { Button2 } from '@/components/ui/Button2';
import { Checkbox2 } from '@/components/ui/Checkbox2';
import { FieldMessage, FormField, TextField2 } from '@/components/ui/FormField2';
import { PageHeader } from '@/components/ui/PageHeader';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { SafeScreen } from '@/components/SafeScreen';
import { safeBack } from '@/utils/backNavigation';
import { c2, radius2, space } from '@/theme/v2';

// 10-2 회원 탈퇴 (Figma 570:2522). Google Play 는 계정을 만드는 앱에 계정·데이터 삭제 경로를 요구한다.
// 서버 `DELETE /api/me`(backend-backlog §30-A, 배포됨): password 재인증, 불일치 400 current_password_invalid.
// 되돌릴 수 없는 동작의 안전장치는 '비밀번호 + 명시적 동의' 두 겹. 2차에는 최종 확인 창 프레임이 없어 두지 않는다.
// 끝나면 로그인 첫 화면 + 스낵바 '회원 탈퇴가 끝났어요.'(10-4) — 스낵바는 로그인 화면이 notice 로 띄운다.

const DELETED_ITEMS = ['이름과 이메일', '외근 기록과 방문 기록', '보고서', '올린 사진과 메모', '로그인 정보'] as const;

export default function DeleteAccount() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);

  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = password.length > 0 && agreed;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setPwError(null);
    setFormError(null);
    setSubmitting(true);
    const r = await deleteAccount(password);

    if (r.ok) {
      // 성공 경로에서는 폼 상태를 되돌리지 않는다 — 떠나는 화면에서 setState 와 navigate 가
      // 같은 배치로 합쳐지면 무음 크래시가 났던 이력이 있다. 화면은 어차피 버려진다.
      router.replace({ pathname: '/(auth)/login', params: { notice: 'deleted' } } as never);
      return;
    }

    setSubmitting(false);
    // 비밀번호가 틀린 건 입력 아래에 붙여야 어디를 고칠지 안다.
    if (r.code === 'current_password_invalid' || r.code === 'invalid_credentials') {
      setPwError('비밀번호가 맞지 않아요');
      return;
    }
    setFormError(r.error);
  };

  return (
    <SafeScreen background={c2.bg.canvas}>
      <PageHeader title="회원 탈퇴" onBack={() => safeBack(router, '/(tabs)/profile')} />
      <KeyboardAvoid style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text v2="title.l" tone="primary" accessibilityRole="header">
            탈퇴하면 기록이 모두 지워져요
          </Text>
          <Text v2="bodyM.regular" tone="secondary" style={styles.sub}>
            지워진 정보는 되돌릴 수 없어요.
          </Text>

          <View style={styles.box}>
            <Text v2="caption.bold" tone="secondary">
              지워지는 정보
            </Text>
            <View style={styles.items}>
              {DELETED_ITEMS.map((item) => (
                <View key={item} style={styles.item}>
                  <View style={styles.dot} />
                  <Text v2="bodyM.regular" tone="body">
                    {item}
                  </Text>
                </View>
              ))}
            </View>
            <Text v2="caption.regular" tone="tertiary" style={styles.legal}>
              법령에 따라 보관해야 하는 정보는 정해진 기간 동안 따로 보관돼요.
            </Text>
          </View>

          <View style={styles.pw}>
            <FormField
              label="비밀번호 확인"
              error={pwError}
              helper={`${user?.email ?? '이'} 계정의 비밀번호를 입력해 주세요.`}
            >
              <TextField2
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  if (pwError) setPwError(null);
                }}
                invalid={!!pwError}
                secureTextEntry
                autoCapitalize="none"
                textContentType="password"
                autoComplete="current-password"
                editable={!submitting}
                placeholder="비밀번호"
                returnKeyType="done"
                accessibilityLabel="비밀번호 확인"
              />
            </FormField>
          </View>

          <Touchable
            onPress={() => setAgreed((v) => !v)}
            disabled={submitting}
            noAutoHitSlop
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
            style={styles.agree}
          >
            <Checkbox2 checked={agreed} />
            <Text v2="bodyM.regular" tone="primary" style={styles.agreeText}>
              위 내용을 확인했고, 되돌릴 수 없다는 데 동의해요.
            </Text>
          </Touchable>

          {formError ? <FieldMessage message={formError} style={styles.formError} /> : null}
        </ScrollView>
        <BottomActionBar>
          {/* [취소][탈퇴하기] 같은 폭으로 나란히(Figma 175 + 8 + 175). */}
          <View style={styles.pair}>
            <Button2 variant="secondary" disabled={submitting} onPress={() => safeBack(router, '/(tabs)/profile')} style={styles.half}>
              취소
            </Button2>
            <Button2 variant="danger" loading={submitting} disabled={!canSubmit} onPress={() => void handleSubmit()} style={styles.half}>
              탈퇴하기
            </Button2>
          </View>
        </BottomActionBar>
      </KeyboardAvoid>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: c2.bg.canvas },
  scroll: { paddingHorizontal: space[20], paddingTop: space[16], paddingBottom: space[24] },
  sub: { marginTop: space[6] },
  box: {
    marginTop: space[20],
    padding: space[16],
    paddingTop: space[16],
    borderRadius: radius2.xl,
    backgroundColor: c2.bg.subtle,
  },
  items: { marginTop: space[10], gap: space[6] },
  item: { flexDirection: 'row', alignItems: 'center', gap: space[10] },
  dot: { width: 5, height: 5, borderRadius: radius2.full, backgroundColor: c2.status.visited },
  legal: { marginTop: space[12] },
  pw: { marginTop: space[20] },
  agree: { marginTop: space[12], minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space[10] },
  agreeText: { flex: 1 },
  formError: { marginTop: space[8] },
  pair: { flexDirection: 'row', gap: space[8] },
  half: { flex: 1 },
});
