import type { Router } from 'expo-router';

/**
 * 외근 종료 직후 동선 — 항상 review 화면으로 보낸다.
 *
 * - active.tsx 의 finalizeEnd 와 trips/[id].tsx 의 promptReportAfterEnd 가
 *   각자 다른 alert/redirect 를 띄우던 분기를 단일 진입로로 통일.
 * - 보고서 작성 prompt 는 review 화면 footer 의 CTA 가 가져감.
 * - web/native 모두 expo-router 의 replace 사용 — window.location.assign 으로
 *   full reload 시 visitStore/fieldStore 같은 비영속 store 가 휘발하면서
 *   review 화면이 EmptyState 로 깜빡이던 회로 차단.
 */
export function navigateToReview(router: Router, tripId: string): void {
  router.replace(`/(tabs)/trips/review?tripId=${tripId}` as never);
}
