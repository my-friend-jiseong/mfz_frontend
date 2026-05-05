import { AppState, type AppStateStatus } from 'react-native';
import { system } from '@/api';
import { useAuthStore } from './authStore';

// 세션 idle timeout 정책 보조 — foreground 진입 시 + 주기적으로 백엔드에 활동 신호 전송.
// 백엔드의 sessionIdleMinutes 정책 (보통 30분) 안에 ping 이 도달하면 세션 살아 있음.
//
// 정책:
// - 부팅 시 시작 (인증된 상태일 때만 실제 ping)
// - foreground 진입 시 즉시 1회 ping
// - 활성 상태에서 PING_INTERVAL_MS 마다 ping
// - 인증 상태 아니면 ping skip
// - logout / unmount 시 정리

const PING_INTERVAL_MS = 5 * 60 * 1000; // 5분

let timer: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;
let started = false;

async function ping() {
  const { isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated) return;
  try {
    await system.sessionActivity();
  } catch {
    // best-effort — refresh / 로그아웃 흐름은 client.ts 가 담당
  }
}

function handleAppStateChange(state: AppStateStatus) {
  if (state === 'active') {
    void ping();
  }
}

export function startSessionActivity() {
  if (started) return;
  started = true;
  timer = setInterval(() => {
    void ping();
  }, PING_INTERVAL_MS);
  appStateSub = AppState.addEventListener('change', handleAppStateChange);
  // 첫 ping 은 즉시 (인증 상태 확인 후 실제 호출 여부 결정)
  void ping();
}

export function stopSessionActivity() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (appStateSub) {
    appStateSub.remove();
    appStateSub = null;
  }
  started = false;
}
