import { AppState, Platform } from 'react-native';
import { request } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';

export function startAnalyticsActivity() {
  let stopped = false, inFlight = false;
  const send = () => {
    const visible = Platform.OS === 'web' ? !document.hidden : AppState.currentState === 'active';
    if (stopped || inFlight || !visible || !useAuthStore.getState().isAuthenticated) return;
    inFlight = true;
    void request('/api/analytics/events', { method: 'POST', body: { kind: 'activity' } }).catch(() => {})
      .finally(() => { inFlight = false; });
  };
  const timer = setInterval(send, 5 * 60_000);
  const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') send(); });
  const unsubscribe = useAuthStore.subscribe((state, previous) => { if (state.isAuthenticated && state.accessToken !== previous.accessToken) send(); });
  if (Platform.OS === 'web') { document.addEventListener('visibilitychange', send); window.addEventListener('focus', send); }
  send();
  return () => {
    stopped = true; clearInterval(timer); subscription.remove(); unsubscribe();
    if (Platform.OS === 'web') { document.removeEventListener('visibilitychange', send); window.removeEventListener('focus', send); }
  };
}
