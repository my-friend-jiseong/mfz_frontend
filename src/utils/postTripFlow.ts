import type { Router } from 'expo-router';

/**
 * 외근 종료 직후 동선 — 종료된 외근의 상세(detail = 외근 정리) 화면으로 단일 진입.
 *
 * - ActiveTripScreen 의 finalizeEnd 가 각각 다른 alert/redirect 를 띄우던 분기를 통일.
 * - 보고서 작성 prompt 는 detail 화면 footer 의 CTA 가 가져감.
 * - 종료된 외근은 [id] 화면(이전 review)이 visit 결과 정정 + 메모/사진 편집을 처리.
 * - 외근 진행 화면은 외근 탭 첫 화면(index) 자체라 replace 하면 스택에 상세만 남는다 — push 로 쌓아
 *   뒤로 가면 외근 내역(1)으로 돌아오게 한다.
 */
export function navigateToTripDetail(router: Router, tripId: string): void {
  router.push(`/(tabs)/trips/${tripId}` as never);
}
