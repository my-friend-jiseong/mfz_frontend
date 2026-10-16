import type { Field, FieldStatus } from '@/types/entities';

/**
 * 현장의 '최근 조치 상태' — 지도 핀 색, 외근 상세 방문 행의 조치 표시(인수인계 §2 현장: 가장 최근 방문의 조치 상태).
 * 서버가 방문 단위 조치 상태를 아직 주지 않아 현장 status 로 대신한다(브리프 대체 동작).
 */
export function fieldActionStatus(field: Pick<Field, 'status' | 'latestActionStatus'> | undefined): FieldStatus {
  return field?.latestActionStatus ?? field?.status ?? 'pending';
}
