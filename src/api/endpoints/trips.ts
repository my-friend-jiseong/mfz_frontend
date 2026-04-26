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
};
