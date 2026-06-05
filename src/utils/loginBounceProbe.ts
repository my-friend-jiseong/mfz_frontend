import { AppState, BackHandler, Keyboard, Platform } from 'react-native';
import { useAuthStore } from '@/stores/authStore';

// 최초 로그인 직후 앱이 백그라운드로 내려가는 버그(원인 미상)의 실측 프로브.
// 원인 확정 후 제거 예정 — 모든 로그는 [probe] 태그.
// dev 모드에선 미재현(2026-06-05 실측) → 프로덕션 번들에서도 찍히도록 __DEV__ 게이트 해제.
// (--no-dev --minify 는 Metro 콘솔, 배포 빌드는 adb logcat -s ReactNativeJS 로 수집)
//
// 목적: background 전환(AppState) 직전에 무엇이 선행하는지 타임라인 확정.
// - hardwareBackPress 가 찍히면: back 이벤트가 JS 체인 끝까지 와서 네이티브 기본
//   동작(moveTaskToBack)으로 흘러간 것 → screens/back 디스패치 경로 확정.
// - back 없이 background 만 찍히면: 네이티브 측 단독 전환 → adb logcat 으로 추적.

const t0 = Date.now();
const ts = () => `+${String(Date.now() - t0).padStart(6, ' ')}ms`;

export function probeLog(tag: string, ...args: unknown[]) {
  console.log(`[probe ${ts()}] ${tag}`, ...args);
}

let armed = false;

export function startLoginBounceProbe() {
  if (armed) return;
  armed = true;

  AppState.addEventListener('change', (s) => probeLog('appstate →', s));

  // 루트에서 가장 먼저 등록 → RN 은 최근 등록 리스너부터 호출하므로 이 리스너는
  // "아무도 소비하지 않은" back 이벤트만 받는다. false 반환으로 기본 동작은 그대로
  // 진행시켜 관찰만 한다(개입 금지).
  if (Platform.OS === 'android') {
    BackHandler.addEventListener('hardwareBackPress', () => {
      probeLog('hardwareBackPress — 미소비 back 이 기본 동작(moveTaskToBack)으로 흘러감');
      return false;
    });
  }

  Keyboard.addListener('keyboardDidShow', () => probeLog('keyboardDidShow'));
  Keyboard.addListener('keyboardDidHide', () => probeLog('keyboardDidHide'));

  useAuthStore.subscribe((s, prev) => {
    if (s.isAuthenticated !== prev.isAuthenticated || s.isHydrating !== prev.isHydrating) {
      probeLog('auth', { isAuthenticated: s.isAuthenticated, isHydrating: s.isHydrating });
    }
  });

  probeLog('probe armed');
}
