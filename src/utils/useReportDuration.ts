import { useCallback, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { request } from '@/api/client';

// Measure foreground time on the new-report screen, including generation wait.
export function useReportDuration() {
  const elapsed = useRef(0), started = useRef<number | null>(null), recorded = useRef(false);
  useFocusEffect(useCallback(() => {
    const pause = () => { if (started.current !== null) { elapsed.current += performance.now() - started.current; started.current = null; } };
    const resume = () => {
      const visible = Platform.OS === 'web' ? !document.hidden : AppState.currentState === 'active';
      if (!visible) pause(); else if (started.current === null) started.current = performance.now();
    };
    resume();
    const sub = AppState.addEventListener('change', resume);
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', resume);
    return () => { pause(); sub.remove(); if (Platform.OS === 'web') document.removeEventListener('visibilitychange', resume); };
  }, []));
  return () => {
    if (recorded.current) return;
    recorded.current = true;
    const durationMs = Math.min(86400_000, Math.max(0, Math.round(elapsed.current + (started.current === null ? 0 : performance.now() - started.current))));
    void request('/api/analytics/events', { method: 'POST', body: { kind: 'report_completed', durationMs } }).catch(() => {});
  };
}
