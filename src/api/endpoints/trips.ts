import { request } from '../client';

// ERD v2 정렬 — geofence / offline-queue / state-history / official-notice 제거됨.
// trips 는 status('active'|'ended') 단순화. 시작 시 title 만, startLocation·plannedFields 제거.

export interface TripBanner {
  isActive: boolean;
  tripId: string | null;
  elapsedHHMM: string | null;
  message: string | null;
}

// backend-backlog §11 — release 2026-06: 외근 시작 시 계획 목적지 영속.
export interface PlannedFieldInput {
  fieldId: string;
  order: number;
}

export interface TripStartBody {
  title?: string;
  // 계획 목적지 (최대 200건). 미전달 시 빈 배열 처리(legacy 호환).
  plannedFields?: PlannedFieldInput[];
}

// backend-backlog §11 — destinations 서버 영속 응답.
export interface DestinationResponse {
  destinationId: string;
  fieldId: string;
  order: number;
  status: 'pending' | 'arrived' | 'skipped';
  siteName?: string;
  siteAddress?: string;
}

// v2 검증(2026-05-28): start/end 응답엔 banner·toast 없음 — optional.
// backend-backlog §2 — release 2026-06: PATCH /api/trips/:tripId.
// startedAt/endedAt(ISO8601) 도 백엔드가 수용하나, 프론트 UI 는 제목만 우선 노출(피커 미도입).
export interface TripUpdateBody {
  title?: string;
  startedAt?: string;
  endedAt?: string;
}

export interface TripStartResponse {
  tripId: string;
  startedAt: string;
  title?: string;
  // backend-backlog §11 — 계획 목적지 영속 후 응답에 포함. legacy 백엔드는 미포함.
  destinations?: DestinationResponse[];
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
  // backend-backlog §21 — release 2026-06: status='other' 사유 영속·노출.
  reason?: string;
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
  // backend-backlog §11 — 계획 목적지 (다른 기기·세션에서도 조회). legacy 백엔드는 미포함.
  destinations?: DestinationResponse[];
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

  // backend-backlog §2 — DELETE /api/trips/:tripId 신설 요청. 미배포 상태에서 호출 시
  // 404/405 가 떨어지면 호출 측에서 ApiError 로 잡아 안내. 응답 body 는 빈 객체로 가정.
  remove: (tripId: string) =>
    request<Record<string, never>>(`/api/trips/${tripId}`, { method: 'DELETE' }),

  // backend-backlog §2 — release 2026-06: 제목·시간 보정. 운영 OpenAPI 확인 결과
  // 본문 없이 200 만 반환 → 호출 측은 보낸 body 로 로컬 패치(응답 의존 금지).
  update: (tripId: string, body: TripUpdateBody) =>
    request<void>(`/api/trips/${tripId}`, { method: 'PATCH', body }),

  // backend-backlog §11 — release 2026-06: 계획 목적지 조회·상태/순서 갱신.
  listDestinations: (tripId: string) =>
    request<{ items: DestinationResponse[] }>(`/api/trips/${tripId}/destinations`),

  updateDestination: (
    tripId: string,
    destinationId: string,
    body: { status?: 'arrived' | 'skipped'; order?: number },
  ) =>
    request<DestinationResponse>(
      `/api/trips/${tripId}/destinations/${destinationId}`,
      { method: 'PATCH', body },
    ),

  /** 외부 지도 앱 길안내 딥링크 — providers wrap 객체로 응답 */
  navigationDeepLinks: (tripId: string, body: NavigationDeepLinksBody) =>
    request<NavigationDeepLinksResponse>(
      `/api/trips/${tripId}/navigation/deep-links`,
      { method: 'POST', body },
    ),

  /** 다중 현장 동선 최적 순서 제안 — 외근 시작 후 */
  optimizeNavigation: (tripId: string, body: OptimizeNavigationBody) =>
    request<OptimizeNavigationResponse>(
      `/api/trips/${tripId}/navigation/optimize`,
      { method: 'POST', body },
    ),
};
