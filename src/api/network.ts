import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useOfflineQueueStore } from '@/stores/offlineQueueStore';

// 네트워크 상태 모니터링 — connected 전환 감지 시 offline 큐 자동 flush.
// 부팅 시 startNetworkWatcher 호출 → unsubscribe 함수 반환.

let lastConnected: boolean | null = null;
let unsubscribe: (() => void) | null = null;

function isConnected(state: NetInfoState): boolean {
  // isInternetReachable 가 명시적으로 false 면 연결 안 됨.
  // null/undefined 일 수 있으므로 isConnected 만 신뢰.
  return state.isConnected === true && state.isInternetReachable !== false;
}

async function handleStateChange(state: NetInfoState) {
  const connected = isConnected(state);
  if (connected && lastConnected === false) {
    // 끊김 → 복구 전환에서만 flush
    await useOfflineQueueStore.getState().flushAll();
  }
  lastConnected = connected;
}

export function startNetworkWatcher() {
  if (unsubscribe) return;
  // 부팅 시 큐 hydrate (한 번)
  void useOfflineQueueStore.getState().hydrate();
  unsubscribe = NetInfo.addEventListener((state) => {
    void handleStateChange(state);
  });
  // 첫 호출 — 현재 상태 기록 (hydrate 직후 flush 시도하지 않음)
  void NetInfo.fetch().then((state) => {
    lastConnected = isConnected(state);
    // 부팅 시 이미 connected 면 일단 한 번 flush 시도 (앱 종료 후 복귀 시 큐 처리)
    if (lastConnected) {
      void useOfflineQueueStore.getState().flushAll();
    }
  });
}

export function stopNetworkWatcher() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  lastConnected = null;
}
