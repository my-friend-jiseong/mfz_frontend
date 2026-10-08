import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { support, localizeError, type SupportCategory, type SupportInquiryPage } from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { SafeScreen } from '@/components/SafeScreen';
import { KeyboardAvoid } from '@/components/ui/KeyboardAvoid';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { GroupLabel } from '@/components/ui/GroupLabel';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';

const categories: SupportCategory[] = ['기능 문의', '개선 제안', '오류 제보', '일반 문의'];
const privacyNotice = '이름, 연락처, 이메일, 계정 정보, 현장명·주소·좌표를 입력하지 마세요.';
const emptyPage: SupportInquiryPage = { items: [], total: 0, page: 1, limit: 20 };

export default function SupportScreen() {
  const userId = useAuthStore((state) => state.user?.id);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<SupportCategory>('일반 문의');
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SupportInquiryPage>(emptyPage);
  const [selectedId, setSelectedId] = useState('');
  const [listError, setListError] = useState('');
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const sending = useRef(false);
  const mutationVersion = useRef(0);
  const mounted = useRef(false);
  const [lastUpdated, setLastUpdated] = useState('');

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useFocusEffect(useCallback(() => {
    if (!userId) return;
    let active = true, inFlight = false;
    setLoading(true); setListError('');
    async function refresh(background = false) {
      const hidden = Platform.OS === 'web' ? document.hidden : AppState.currentState !== 'active';
      if (!active || inFlight || sending.current || (background && hidden)) return;
      inFlight = true;
      const beforeMutation = mutationVersion.current;
      try {
        const result = await support.list(page);
        if (!active || beforeMutation !== mutationVersion.current) return;
        setData(result); setListError('');
        setLastUpdated(new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date()));
      } catch (error) {
        if (active) setListError(localizeError(error));
      } finally { inFlight = false; if (active && !background) setLoading(false); }
    }
    void refresh();
    const timer = setInterval(() => { void refresh(true); }, 5000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(true); });
    const resume = () => { if (!document.hidden) void refresh(true); };
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', resume);
    return () => {
      active = false; clearInterval(timer); subscription.remove();
      if (Platform.OS === 'web') document.removeEventListener('visibilitychange', resume);
    };
  }, [userId, page, version]));

  async function submit() {
    if (sending.current || !userId) return;
    setSubmitError(''); setSuccess('');
    if (!title.trim() || !body.trim()) { setSubmitError('제목과 내용을 모두 입력해 주세요.'); return; }
    if (!acknowledged) { setSubmitError('개인정보·현장정보를 포함하지 않았는지 확인해 주세요.'); return; }
    sending.current = true; mutationVersion.current++; setSubmitting(true);
    try {
      const item = await support.create({ title: title.trim(), body: body.trim(), category, privacyAcknowledged: true });
      if (!mounted.current || useAuthStore.getState().user?.id !== userId) return;
      setTitle(''); setBody(''); setAcknowledged(false); setSelectedId(item.id);
      setPage(1); setVersion((value) => value + 1);
      setSuccess('문의가 접수되었습니다. 아래 내 문의에서 처리 상태와 답변을 확인하세요.');
    } catch (error) { if (mounted.current && useAuthStore.getState().user?.id === userId) setSubmitError(localizeError(error)); }
    finally { sending.current = false; if (mounted.current) setSubmitting(false); }
  }

  return <SafeScreen edges={[]}><KeyboardAvoid style={styles.flex}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <GroupLabel style={styles.firstGroup}>새 문의 작성</GroupLabel>
      <Card style={styles.card}>
        <Text variant="bodySm" color="textMuted">서비스 이용 중 궁금한 점이나 개선 의견을 남겨 주세요. 답변은 아래 내 문의에서 확인할 수 있습니다.</Text>
        <Text variant="bodySm" weight="semibold">문의 분류</Text>
        <View style={styles.categories}>{categories.map((value) => <Button key={value} size="sm" variant={category === value ? 'primary' : 'secondary'} disabled={submitting} onPress={() => setCategory(value)} accessibilityLabel={`문의 분류: ${value}`}>{value}</Button>)}</View>
        <Input label="문의 제목" accessibilityLabel="문의 제목" value={title} onChangeText={setTitle} maxLength={100} editable={!submitting} placeholder="제목을 입력해 주세요" />
        <Input label="문의 내용" accessibilityLabel="문의 내용" value={body} onChangeText={setBody} maxLength={3000} editable={!submitting} multiline textAlignVertical="top" style={styles.bodyInput} placeholder="어떤 기능에서 무엇이 궁금하거나 불편한지 알려 주세요" helperText={`${body.length}/3000자`} />
        <View style={styles.privacy}><Text variant="bodySm" color="textMuted">{privacyNotice}</Text></View>
        <Pressable accessibilityRole="checkbox" accessibilityLabel="개인정보와 현장정보를 포함하지 않았습니다" accessibilityState={{ checked: acknowledged, disabled: submitting }} disabled={submitting} onPress={() => setAcknowledged((value) => !value)} style={styles.check}>
          <Ionicons name={acknowledged ? 'checkbox' : 'square-outline'} size={24} color={colors.primary} />
          <Text variant="bodySm" style={styles.checkText}>개인정보와 현장정보를 포함하지 않았습니다.</Text>
        </Pressable>
        {submitError ? <Text accessibilityRole="alert" style={styles.error}>{submitError}</Text> : null}
        {success ? <Text accessibilityRole="alert" color="primary">{success}</Text> : null}
        <Button loading={submitting} fullWidth onPress={() => void submit()}>문의 접수</Button>
      </Card>
      <View style={styles.listHeading}><GroupLabel>내 문의</GroupLabel><Button size="sm" variant="ghost" disabled={loading || submitting} onPress={() => setVersion((value) => value + 1)}>새로고침</Button></View>
      <Text variant="caption" color="textMuted">5초마다 답변 확인 · 마지막 갱신 {lastUpdated || '대기 중'}</Text>
      {listError ? <Text accessibilityRole="alert" style={styles.error}>{listError}</Text> : null}
      {loading ? <Text color="textMuted">내 문의를 불러오는 중…</Text> : <>
        {!data.items.length && !listError ? <Card><Text color="textMuted">아직 접수한 문의가 없습니다.</Text></Card> : null}
        {data.items.map((item) => <Card key={item.id} style={styles.card}>
          <Pressable accessibilityRole="button" accessibilityLabel={`문의 상세: ${item.title}`} accessibilityState={{ expanded: selectedId === item.id }} onPress={() => setSelectedId((current) => current === item.id ? '' : item.id)} style={styles.inquiryHeading}>
            <View style={styles.flex}><Text weight="semibold">{item.title}</Text><Text variant="caption" color="textMuted">{item.category} · {item.date}</Text></View>
            <Text variant="bodySm" color={item.status === '답변 완료' ? 'primary' : 'textMuted'}>{item.status}</Text>
          </Pressable>
          {selectedId === item.id ? <>
            <Text>{item.body}</Text>
            <View style={styles.reply}><Text weight="semibold">운영팀 답변</Text><Text>{item.reply || '아직 답변이 등록되지 않았습니다.'}</Text></View>
          </> : null}
        </Card>)}
        {data.total > data.limit ? <View style={styles.pagination}>
          <Button variant="secondary" size="sm" disabled={page === 1} onPress={() => setPage((value) => value - 1)}>이전</Button>
          <Text variant="bodySm">{page} / {Math.ceil(data.total / data.limit)}</Text>
          <Button variant="secondary" size="sm" disabled={page * data.limit >= data.total} onPress={() => setPage((value) => value + 1)}>다음</Button>
        </View> : null}
      </>}
    </ScrollView>
  </KeyboardAvoid></SafeScreen>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
  firstGroup: { marginTop: 0 },
  card: { gap: spacing.md },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  bodyInput: { minHeight: 150 },
  privacy: { backgroundColor: colors.surfacePressed, borderRadius: radius.md, padding: spacing.md },
  check: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48 },
  checkText: { flex: 1 },
  error: { color: colors.danger },
  listHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inquiryHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
  reply: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfacePressed },
  pagination: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
