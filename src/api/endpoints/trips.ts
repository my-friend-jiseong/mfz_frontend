import { request } from '../client';

// 백엔드 실응답 (docs/_swagger_responses.md §2)

export interface TripBanner {
  isActive: boolean;
  tripId: string | null;
  elapsedHHMM: string | null;
  message: string | null;
}

export interface TripStartResponse {
  tripId: string;
  startedAt: string;
  banner: TripBanner;
  toast: string;
}

export interface TripEndResponse {
  tripId: string;
  endedAt: string;
  banner: TripBanner;
  toast: string;
}

export interface ActiveTripResponse extends TripBanner {
  startedAt?: string;
  lifecycleStatus?: string;
  reportNoticeRequired?: boolean;
  reportNoticeMessage?: string | null;
}

export interface TripListItem {
  tripId: string;
  tripDate: string;
  startedAt: string;
  endedAt: string | null;
  durationHHMM: string;
  visitCount: number;
  siteCount: number;
  status: string;
  lifecycleStatus: string;
  abnormalTag: string | null;
}

export interface TripListResponse {
  items: TripListItem[];
  pagination: { page: number; limit: number; total: number; hasNext: boolean };
  emptyMessage: string | null;
}

export interface TripTimelineEntry {
  visitId: string;
  siteName: string;
  visitedAt: string;
  resultStatus: string;
  attachmentCounts: { text: number; photo: number; audio: number };
  memoPreview: string;
}

export interface TripDetailResponse {
  tripId: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  durationHHMM: string;
  visitCount: number;
  approximateDistanceKm: number;
  status: string;
  lifecycleStatus: string;
  timeline: TripTimelineEntry[];
  reportEntryPoint: { label: string; createUrl: string } | null;
}

// PR-I: 외근 자동화 — geofence/navigation/offline/official-notice/state-history.
// 응답 shape 은 백엔드 미명세인 곳이 많아 unknown 으로 받음 (호출 측이 안전하게 사용).

export interface GeofenceRegisterBody {
  fieldId: string;
  lat: number;
  lng: number;
  radiusMeters?: number; // 기본 150~200m 권장
}

export interface NavigationDeepLinksResponse {
  // 백엔드 응답 미명세 — 일반적으로 카카오/구글/네이버 3종 URL 묶음 추정
  [provider: string]: unknown;
}

export interface OfficialNoticeBody {
  reason?: string; // 변경 사유 (선택)
}

export interface StateHistoryResponse {
  items: unknown[];
  pagination?: { page: number; limit: number; total: number; hasNext: boolean };
}

export const trips = {
  start: (startLocation?: { lat: number; lng: number }) =>
    request<TripStartResponse>('/api/trips/start', {
      method: 'POST',
      body: startLocation ? { startLocation } : {},
    }),

  // forceEndWithoutVisit: 방문 0건 종료 확인 (409 confirm_required_zero_visits 받은 후 재호출 시)
  end: (forceEndWithoutVisit = false) =>
    request<TripEndResponse>('/api/trips/end', {
      method: 'POST',
      body: forceEndWithoutVisit ? { forceEndWithoutVisit: true } : {},
    }),

  active: () => request<ActiveTripResponse>('/api/trips/active'),

  list: (params?: { page?: number; limit?: number }) =>
    request<TripListResponse>('/api/trips', { query: params }),

  detail: (tripId: string) => request<TripDetailResponse>(`/api/trips/${tripId}`),

  // ----- PR-I: 자동화 endpoint (응답 shape 은 백엔드 §2.4 받은 후 정정) -----

  /** 현장 도착 감지를 위한 geofence 등록 — 백엔드 감사 로그용 */
  registerGeofence: (tripId: string, body: GeofenceRegisterBody) =>
    request<unknown>(`/api/trips/${tripId}/geofences/register`, {
      method: 'POST',
      body,
    }),

  /** geofence 도착 이벤트 보고 — 클라이언트가 도착 감지 시 호출 */
  notifyGeofenceArrival: (
    tripId: string,
    body: { fieldId: string; arrivedAt?: string },
  ) =>
    request<unknown>(`/api/trips/${tripId}/geofences/arrival`, {
      method: 'POST',
      body,
    }),

  /** 외부 지도 앱 길안내 딥링크 응답 — 다중 provider URL 묶음 */
  navigationDeepLinks: (
    tripId: string,
    body: { fieldId: string; lat?: number; lng?: number },
  ) =>
    request<NavigationDeepLinksResponse>(
      `/api/trips/${tripId}/navigation/deep-links`,
      { method: 'POST', body },
    ),

  /** 다중 현장 동선 최적 순서 제안 */
  optimizeNavigation: (tripId: string, body: { fieldIds: string[] }) =>
    request<{ orderedFieldIds: string[] }>(
      `/api/trips/${tripId}/navigation/optimize`,
      { method: 'POST', body },
    ),

  /** 오프라인 작업 큐 적재 — 클라이언트가 네트워크 복구 시 한 번에 flush 호출 */
  offlineQueue: (operations: unknown[]) =>
    request<unknown>('/api/trips/offline/queue', {
      method: 'POST',
      body: { operations },
    }),

  /** 오프라인 큐 서버 동기화 실행 */
  offlineFlush: () =>
    request<unknown>('/api/trips/offline/flush', { method: 'POST' }),

  /**
   * 외근 변경 시 소속기관장 보고 필요 표시 (공무원 복무규정 — 작업자 본인의 책무 보조).
   * /api/trips/active 응답의 reportNoticeRequired/Message 와 짝.
   */
  officialNotice: (tripId: string, body?: OfficialNoticeBody) =>
    request<unknown>(`/api/trips/${tripId}/official-notice`, {
      method: 'POST',
      body: body ?? {},
    }),

  /** 외근 상태 전환 이력 조회 (감사용) */
  stateHistory: (params?: { tripId?: string; page?: number; limit?: number }) =>
    request<StateHistoryResponse>('/api/trips/state-history', { query: params }),
};
