import { Platform } from 'react-native';
import type { Router } from 'expo-router';

/**
 * 외근 종료 직후 동선 — 항상 review 화면으로 보낸다.
 *
 * - active.tsx 의 finalizeEnd 와 trips/[id].tsx 의 promptReportAfterEnd 가
 *   각자 다른 alert/redirect 를 띄우던 분기를 단일 진입로로 통일.
 * - 보고서 작성 prompt 는 review 화면 footer 의 CTA 가 가져감.
 * - web 에선 expo-router 의 replace 가 같은 trips Stack 의 active 화면을
 *   떠나지 못하는 케이스가 관찰되어 (active.tsx 의 finalizeEnd 주석 참조)
 *   브라우저 navigation 으로 우회.
 */
export function navigateToReview(router: Router, tripId: string): void {
  if (Platform.OS === 'web') {
    window.location.assign(`/trips/review?tripId=${encodeURIComponent(tripId)}`);
    return;
  }
  router.replace(`/(tabs)/trips/review?tripId=${tripId}` as never);
}
