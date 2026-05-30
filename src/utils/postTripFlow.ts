import type { Router } from 'expo-router';

/**
 * 외근 종료 직후 동선 — 종료된 외근의 상세(detail = 외근 정리) 화면으로 단일 진입.
 *
 * - active.tsx 의 finalizeEnd 가 각각 다른 alert/redirect 를 띄우던 분기를 통일.
 * - 보고서 작성 prompt 는 detail 화면 footer 의 CTA 가 가져감.
 * - 종료된 외근은 [id] 화면(이전 review)이 visit 결과 정정 + 메모/사진 편집을 처리.
 */
export function navigateToTripDetail(router: Router, tripId: string): void {
  router.replace(`/(tabs)/trips/${tripId}` as never);
}
