import { request } from '../client';

// ERD v2 정렬 — geofence / offline-queue / state-history / official-notice 제거됨.
// trips 는 status('active'|'ended') 단순화. 시작 시 title 만, startLocation·plannedFields 제거.

export interface TripBanner {
  isActive: boolean;
  tripId: string | null;
  elapsedHHMM: string | null;
  message: string | null;
}

export interface TripStartBody {
  // ERD v2: title 만. startLocation·plannedFields 제거.
  title?: string;
}

// v2 검증(2026-05-28): start/end 응답엔 banner·toast 없음 — optional.
export interface TripStartResponse {
  tripId: string;
  startedAt: string;
  title?: string;
  banner?: TripBanner;
  toast?: string;
}

export interface TripEndResponse {
  tripId: string;
  endedAt: string;
  durationMinutes?: number;
  visitCount?: number;
  banner?: TripBanner;
  toast?: string;
}

// v2 검증: { isActive, tripId, elapsedMinutes }. elapsedHHMM·message 는 없음(배너는 startedAt 로 자체 계산).
export interface ActiveTripResponse {
  isActive: boolean;
  tripId: string | null;
  elapsedMinutes?: number;
  elapsedHHMM?: string | null;
  message?: string | null;
  startedAt?: string;
  status?: 'active' | 'ended' | string;
  lifecycleStatus?: string;
}

export interface TripListItem {
  tripId: string;
  tripDate: string;
  startedAt: string;
  endedAt: string | null;
  title?: string;
  durationHHMM: string;
  visitCount: number;
  siteCount: number;
  // ERD v2: 'active' | 'ended'. lifecycleStatus·abnormalTag 는 v2 존속 불확실 — optional (§8).
  status: string;
  lifecycleStatus?: string;
  abnormalTag?: string | null;
}

export interface TripListResponse {
  items: TripListItem[];
  pagination: { page: number; limit: number; total: number; hasNext: boolean };
  emptyMessage: string | null;
}

// ERD v2: visit 첨부·result_status 제거 → timeline 은 방문 기록만. 잔여 필드는 방어적 optional.
export interface TripTimelineEntry {
  visitId: string;
  // backend-backlog §16 — 응답에 fieldId 가 들어오기 시작하면 visitStore 가 곧장 사용.
  // 현재(2026-05-31)는 미포함 → syncFromTimeline 이 빈 fieldId 로 흡수.
  fieldId?: string;
  siteName?: string;        // 현장명 (field.name)
  visitedAt: string;
  status?: string;          // visits.status
  memoPreview?: string;
}

export interface TripDetailResponse {
  tripId: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  title?: string;
  durationHHMM: string;
  visitCount: number;
  approximateDistanceKm?: number;
  status: string;
  lifecycleStatus?: string;
  timeline: TripTimelineEntry[];
  reportEntryPoint: { label: string; createUrl: string } | null;
}

// ----- 동선 최적화 / 길안내 딥링크 (dropped 테이블에 의존하지 않는 stateless 헬퍼) -----

export interface NavigationDeepLinksBody {
  fieldId?: string;
  destinationName?: string;
  destinationLat: number;
  destinationLng: number;
}

export interface NavigationDeepLinksResponse {
  tripId: string;
  fieldId: string | null;
  destinationName: string;
  providers: {
    kakao: string;
    google: string;
    naver: string;
  };
}

export interface OptimizedOrderItem {
  fieldId: string;
  name?: string;
  lat: number;
  lng: number;
  distanceFromPrevKm: number;
  etaMinutes: number;
}

export interface OptimizePreviewBody {
  startLat: number;
  startLng: number;
  fields: Array<{ fieldId: string; name?: string; lat: number; lng: number }>;
}

export interface OptimizePreviewResponse {
  optimizedOrder: OptimizedOrderItem[];
  summary: { algorithm: string; totalDistanceKm: number; totalEtaMinutes: number };
}

export interface OptimizeNavigationBody {
  startLat: number;
  startLng: number;
  fields: Array<{ fieldId: string; name?: string; lat: number; lng: number }>;
}

export interface OptimizeNavigationResponse {
  tripId: string;
  optimizedOrder: OptimizedOrderItem[];
  summary: { algorithm: string; totalDistanceKm: number; totalEtaMinutes: number };
}

export const trips = {
  start: (body?: TripStartBody) =>
    request<TripStartResponse>('/api/trips/start', {
      method: 'POST',
      body: body ?? {},
    }),

  // forceEndWithoutVisit: 방문 0건 종료 확인 (409 confirm_required_zero_visits 후 재호출)
  end: (forceEndWithoutVisit = false) =>
    request<TripEndResponse>('/api/trips/end', {
      method: 'POST',
      body: forceEndWithoutVisit ? { forceEndWithoutVisit: true } : {},
    }),

  // ERD v2: userId 쿼리·관리자 대리조회 제거 — 본인 활성 외근만.
  active: () => request<ActiveTripResponse>('/api/trips/active'),

  list: (params?: { page?: number; limit?: number }) =>
    request<TripListResponse>('/api/trips', { query: params }),

  detail: (tripId: string) => request<TripDetailResponse>(`/api/trips/${tripId}`),

  /** 외부 지도 앱 길안내 딥링크 — providers wrap 객체로 응답 */
  navigationDeepLinks: (tripId: string, body: NavigationDeepLinksBody) =>
    request<NavigationDeepLinksResponse>(
      `/api/trips/${tripId}/navigation/deep-links`,
      { method: 'POST', body },
    ),

  /** 외근 시작 전 동선 최적화 — tripId 불필요 */
  optimizePreview: (body: OptimizePreviewBody) =>
    request<OptimizePreviewResponse>('/api/trips/navigation/optimize-preview', {
      method: 'POST',
      body,
    }),

  /** 다중 현장 동선 최적 순서 제안 — 외근 시작 후 */
  optimizeNavigation: (tripId: string, body: OptimizeNavigationBody) =>
    request<OptimizeNavigationResponse>(
      `/api/trips/${tripId}/navigation/optimize`,
      { method: 'POST', body },
    ),
};
