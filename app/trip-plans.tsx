import { useCallback, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { request } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { useTripStore } from '@/stores/tripStore';
import { colors } from '@/theme/colors';
type Plan = { id: string; title: string; date: string; time: string; siteIds: string[]; memo: string };
export default function TripPlans() {
  const authenticated = useAuthStore(s => s.isAuthenticated);
  const [plans, setPlans] = useState<Plan[]>([]), [loading, setLoading] = useState(true), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const load = useCallback(async () => { setLoading(true); setError(''); try { const result = await request<{ items: Plan[] }>('/api/trip-plans'); setPlans(result.items); } catch (e) { setError(e instanceof Error ? e.message : '예정 외근을 불러오지 못했습니다.'); } finally { setLoading(false); } }, []);
  useFocusEffect(useCallback(() => { if (authenticated) void load(); }, [authenticated, load]));
  if (!authenticated) return <Redirect href="/(auth)/login"/>;
  return <ScrollView contentContainerStyle={styles.container}><Pressable accessibilityRole="button" onPress={() => router.back()}><Text>‹ 돌아가기</Text></Pressable><Text style={styles.title}>예정 외근</Text><Text>웹에서 같은 계정으로 저장한 계획입니다.</Text>{loading && <ActivityIndicator/>}{error && <Text style={{ color: colors.danger }}>{error}</Text>}<Pressable accessibilityRole="button" onPress={() => void load()}><Text style={styles.link}>새로고침</Text></Pressable>{!loading && !plans.length && <Text>예정된 외근이 없습니다.</Text>}{plans.map(plan => <View key={plan.id} style={styles.card}><Text style={styles.name}>{plan.title}</Text><Text>{plan.date} {plan.time} · {plan.siteIds.length}개 현장</Text>{!!plan.memo && <Text>{plan.memo}</Text>}<Pressable accessibilityRole="button" disabled={!!busy} style={[styles.start, !!busy && { opacity: .5 }]} onPress={async () => { setBusy(plan.id); setError(''); try { await request(`/api/trip-plans/${encodeURIComponent(plan.id)}/start`, { method: 'POST', body: {} }); await useTripStore.getState().hydrate(); router.replace('/(tabs)/trips/active' as never); } catch (e) { setError(e instanceof Error ? e.message : '외근을 시작하지 못했습니다.'); } finally { setBusy(''); } }}><Text style={{ color: 'white' }}>{busy === plan.id ? '시작 중…' : '이 계획으로 외근 시작'}</Text></Pressable></View>)}</ScrollView>;
}
const styles = StyleSheet.create({ container: { padding: 24, gap: 18, backgroundColor: colors.background, flexGrow: 1 }, title: { fontSize: 25, fontWeight: '700' }, name: { fontSize: 17, fontWeight: '600' }, link: { color: colors.primary }, card: { backgroundColor: colors.surface, borderRadius: 12, padding: 20, gap: 12, borderWidth: 1, borderColor: colors.border }, start: { padding: 14, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center' } });
