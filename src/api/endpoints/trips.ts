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

// backend-backlog §22 — release 2026-07-26: 카카오모빌리티 자동차 경로 프록시.
// REST 키가 서버 전용이라 백엔드를 통해야 한다. 응답 vertexes 로 직선 폴리라인을 대체.
export interface LatLng {
  lat: number;
  lng: number;
}
export interface RouteBody {
  origin: LatLng;
  destination: LatLng;
  /** 경유지 — 스펙상 최대 30개. 초과분을 잘라내면 실제로 가지 않는 경로가 그려지므로 호출 측이 포기할 것. */
  waypoints?: LatLng[];
}
/** 백엔드 응답 — distance(m), duration(초). 본문 미보장 대비로 전부 optional. */
export interface RouteResponse {
  distance?: number;
  duration?: number;
  vertexes?: LatLng[];
}

/** 스펙 명시 상한 — 호출 측 가드에서 공유. */
export const ROUTE_MAX_WAYPOINTS = 30;

/**
 * 외근 하나에 담을 수 있는 계획 목적지 수 — **제품 가드**.
 *
 * 백엔드 하드 상한은 200 이다(OpenAPI 미기재, 실호출로 확인: 433건 요청 시 400
 * "plannedFields 는 200건 이하로 보내주세요", 2026-07-28). 프론트가 미리 막지 않으면
 * 사용자가 현장을 다 고르고 순서까지 정한 뒤 마지막 단계에서 튕긴다.
 *
 * 그런데 200 곳은 하루 외근으로 현실성이 없다 — 실제 하루 방문은 많아야 수십 곳이다.
 * 백엔드 한계선이 아니라 **현실적인 상한**을 노출하는 편이 사용자에게 정직하고,
 * 200곳짜리 목록·지도 마커·경로 계산이 만드는 성능 부담도 미리 막는다.
 * 그래서 백엔드 상한보다 낮은 50 을 쓴다.
 *
 * ※ 로드맵 03(현장 재정의: 거점 → 점/가로수)이 들어오면 한 외근의 목적지 수가
 *   구조적으로 늘 수 있다. 그때 이 값을 재검토할 것.
 */
export const TRIP_MAX_PLANNED_FIELDS = 50;

/** 백엔드가 실제로 거절하는 경계 — 위 제품 가드의 근거이자 상한. */
export const TRIP_BACKEND_MAX_PLANNED_FIELDS = 200;

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
  // backend-backlog §2 — 방문·보고서 연결 외근은 409 has_related_trip_records →
  // ?force=true 재호출로 강제 삭제(release 2026-06).
  remove: (tripId: string, force = false) =>
    request<Record<string, never>>(`/api/trips/${tripId}`, {
      method: 'DELETE',
      query: force ? { force: true } : undefined,
    }),

  // backend-backlog §2 — release 2026-06: 제목·시간 보정.
  // 운영은 TripDetailResponse 본문을 반환하나(OpenAPI 엔 미기재) 그 detail 의 status 는
  // normal|abnormal(=resultStatus)이라 Trip.status(active|ended)로 쓰면 어긋난다 → 응답을
  // 읽지 않고 호출 측이 보낸 body 로 로컬 패치한다(응답 비의존, void 로 둠).
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

  // backend-backlog §24 — release 2026-06-19: 진행 중(active) 외근에 목적지 단건 추가.
  // order 미지정 시 백엔드가 말미 append(max(order)+1). 중복 fieldId 는 멱등 — 기존
  // destination 을 그대로 반환(새로 만들지 않음). 미배포 시 404 가 떨어지면 호출 측이
  // 로컬 temp 로 graceful degrade.
  addDestination: (tripId: string, body: { fieldId: string; order?: number }) =>
    request<DestinationResponse>(`/api/trips/${tripId}/destinations`, {
      method: 'POST',
      body,
    }),

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

  // backend-backlog §22 — 실도로 차량 경로. 503 kakao_provider_unavailable 은 정상적으로
  // 발생할 수 있는 실패다(외부 제공자 장애) — 호출 측은 직선 폴리라인으로 폴백할 것.
  route: (tripId: string, body: RouteBody) =>
    request<RouteResponse>(`/api/trips/${tripId}/route`, {
      method: 'POST',
      body,
    }),
};
