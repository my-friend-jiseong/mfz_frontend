import { request } from '../client';

// 백엔드 실응답 (docs/_swagger_responses.md §2)

export interface TripBanner {
  isActive: boolean;
  tripId: string | null;
  elapsedHHMM: string | null;
  message: string | null;
}

export interface TripStartBody {
  startLocation?: { lat: number; lng: number };
  // 사용자 입력 제목 — 프론트 선행. 백엔드 미구현이면 무시되어도 안전.
  title?: string;
}

export interface TripStartResponse {
  tripId: string;
  startedAt: string;
  // 백엔드가 구현하면 응답에도 echo. 미구현 단계에선 undefined.
  title?: string;
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
  // 사용자 입력 제목 — 백엔드 미구현 단계에선 응답에 없음.
  title?: string;
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
  title?: string;
  durationHHMM: string;
  visitCount: number;
  approximateDistanceKm: number;
  status: string;
  lifecycleStatus: string;
  timeline: TripTimelineEntry[];
  reportEntryPoint: { label: string; createUrl: string } | null;
}

// 외근 자동화 — geofence / navigation / offline / official-notice / state-history.
// 백엔드 handoff-response §6 의 실제 contract 정렬 (이전 typed 가정과 다름).

// §6a — Geofence 등록은 한 번에 여러 현장 batch 등록.
export interface GeofenceRegisterBody {
  platform: 'android' | 'ios';
  fields: Array<{
    fieldId: string;
    name?: string;
    lat: number;
    lng: number;
  }>;
  radiusMeters?: number; // 150~200, 기본 180
}

export interface GeofenceRegisterResponse {
  subscriptionId: string;
  tripId: string;
  platform: 'android' | 'ios';
  geofenceCount: number;
  radiusMeters: number;
  policy: {
    recommendedRange: [number, number];
    enterOnlyHighAccuracyBoost: boolean;
  };
}

// §6b — body 의 arrivedAt 이 아니라 detectedAt. 응답에 notification + action.
export interface GeofenceArrivalBody {
  fieldId: string;
  detectedAt?: string; // ISO8601 (생략 시 서버 시각)
}

export interface GeofenceArrivalResponse {
  tripId: string;
  fieldId: string;
  detectedAt: string;
  notification: {
    title: string;
    message: string;
  };
  action: {
    type: 'open_checkin' | string;
    url: string;
  };
}

// §6c — body 에 destinationLat/Lng 필수, 응답은 providers 객체로 wrap.
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

export interface OfficialNoticeBody {
  reason?: string; // 변경 사유 (선택)
}

// §6d — state-history 응답은 data.items wrap, items[i].timeline 이 transition 단위.
// pagination 미구현 (백엔드 lookback 30일 default).
export interface TripStateTransition {
  id: string;
  tripId: string;
  userId: string;
  fromStatus: string | null;
  toStatus: string;
  changedAt: string;
  reason: string | null;
}

export interface TripStateHistoryListItem {
  tripId: string;
  tripDate: string; // YYYY-MM-DD
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  visitCount: number;
  siteCount: number;
  status: 'normal' | 'abnormal' | string;
  lifecycleStatus: 'active' | 'abnormal_open' | 'ended' | string;
  abnormalTag: string | null;
  needsOfficialReportNotice: boolean;
  timeline: TripStateTransition[];
  adminExtra: { totalDistanceKm: number; visitCount: number } | null;
}

export interface StateHistoryResponse {
  data: {
    items: TripStateHistoryListItem[];
    retentionPolicy: {
      minimumYears: number;
      sensitiveInfoYears: number;
      note: string;
    };
  };
}

// §9b — 외근 시작 전 동선 최적화 신규 endpoint. tripId 불필요.
export interface OptimizePreviewBody {
  startLat: number;
  startLng: number;
  fields: Array<{
    fieldId: string;
    name?: string;
    lat: number;
    lng: number;
  }>;
}

export interface OptimizePreviewResponse {
  optimizedOrder: OptimizedOrderItem[];
  summary: {
    algorithm: string;
    totalDistanceKm: number;
    totalEtaMinutes: number;
  };
}

// 다중 경로 최적화 — POST /api/trips/{tripId}/navigation/optimize
export interface OptimizeNavigationBody {
  startLat: number;
  startLng: number;
  fields: Array<{
    fieldId: string;
    name?: string;
    lat: number;
    lng: number;
  }>;
}

export interface OptimizedOrderItem {
  fieldId: string;
  name?: string;
  lat: number;
  lng: number;
  distanceFromPrevKm: number;
  etaMinutes: number;
}

export interface OptimizeNavigationResponse {
  tripId: string;
  optimizedOrder: OptimizedOrderItem[];
  summary: {
    algorithm: string;            // 예: 'nearest_neighbor'
    totalDistanceKm: number;
    totalEtaMinutes: number;
  };
}

export const trips = {
  start: (body?: TripStartBody) =>
    request<TripStartResponse>('/api/trips/start', {
      method: 'POST',
      body: body ?? {},
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

  // ----- 외근 자동화 endpoint (handoff §6 contract) -----

  /** 현장 도착 감지를 위한 geofence 등록 — tripId 별 fields[] 배치 (handoff §6a) */
  registerGeofence: (tripId: string, body: GeofenceRegisterBody) =>
    request<GeofenceRegisterResponse>(`/api/trips/${tripId}/geofences/register`, {
      method: 'POST',
      body,
    }),

  /** geofence 도착 이벤트 보고 — 클라이언트가 위치 watcher 로 도착 감지 시 호출 */
  notifyGeofenceArrival: (tripId: string, body: GeofenceArrivalBody) =>
    request<GeofenceArrivalResponse>(`/api/trips/${tripId}/geofences/arrival`, {
      method: 'POST',
      body,
    }),

  /** 외부 지도 앱 길안내 딥링크 응답 — providers wrap 객체로 옴 (handoff §6c) */
  navigationDeepLinks: (
    tripId: string,
    body: NavigationDeepLinksBody,
  ) =>
    request<NavigationDeepLinksResponse>(
      `/api/trips/${tripId}/navigation/deep-links`,
      { method: 'POST', body },
    ),

  /** 외근 시작 전 동선 최적화 — tripId 불필요, 후보 현장만으로 호출 (handoff §9b) */
  optimizePreview: (body: OptimizePreviewBody) =>
    request<OptimizePreviewResponse>('/api/trips/navigation/optimize-preview', {
      method: 'POST',
      body,
    }),

  /** 다중 현장 동선 최적 순서 제안 — 외근 시작 후 (nearest neighbor 등) */
  optimizeNavigation: (
    tripId: string,
    body: OptimizeNavigationBody,
  ) =>
    request<OptimizeNavigationResponse>(
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
