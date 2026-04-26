import { request } from '../client';
import type { FieldStatus } from '@/types/entities';

// docs/_swagger_responses.md §4

export interface FieldListItem {
  fieldId: string;
  name: string;
  address: string;       // 합쳐진 표시용 string (도로명+상세)
  status: FieldStatus;
  tags: string[];
  userId: string;
  updatedAt: string;
  recentVisitedAt: string | null;
}

export interface FieldListResponse {
  items: FieldListItem[];
  pagination: { page: number; limit: number; total: number; hasNext: boolean };
  emptyMessage: string | null;
  appliedFilter: unknown;
}

export interface FieldDetailResponse {
  fieldId: string;
  name: string;
  address: string;
  status: FieldStatus;
  tags: string[];
  assigneeUserId: string;
  recentVisits: unknown[];
  attachmentSummary: { text: number; photo: number; audio: number; total: number };
  checkInCta: { label: string; enabled: boolean; reason: string | null; action: string | null };
}

export interface CreateFieldBody {
  name: string;
  status: FieldStatus;
  roadAddress: string;
  jibunAddress: string;
  detailAddress: string;
  lat: number;
  lng: number;
  sido?: string;
  sigungu?: string;
  userId?: string; // 관리자만
  forceCreateWithDuplicate?: boolean;
}

export interface CreateFieldResponse {
  fieldId: string;
  message: string;
  field: FieldListItem;
  duplicateWarning: unknown | null;
  next: { detailUrl: string };
}

export interface AddressSearchItem {
  // 백엔드 items 가 비어있어 shape 미확인 — 실 응답 들어오면 정정
  [key: string]: unknown;
}

export interface AddressSearchResponse {
  query: string;
  provider: { primary: string; secondary: string; retryOnFailure: number; manualCoordinateFallback: boolean };
  items: AddressSearchItem[];
  emptyMessage: string | null;
}

export interface ListMineParams {
  status?: string; // CSV: pending,in_progress,done
  tag?: string;
  fromDate?: string;
  toDate?: string;
  // visitDateScope=all → 방문 이력 없는 신규 현장도 포함 (기본 default_30d 는 방문 30일 이내만)
  visitDateScope?: 'all' | 'none';
  page?: number;
  limit?: number;
}

export const fields = {
  listMine: (params?: ListMineParams) =>
    request<FieldListResponse>('/api/fields/mine', { query: params }),

  detail: (fieldId: string) => request<FieldDetailResponse>(`/api/fields/${fieldId}`),

  create: (body: CreateFieldBody) =>
    request<CreateFieldResponse>('/api/fields', { method: 'POST', body }),

  addressSearch: (keyword: string) =>
    request<AddressSearchResponse>('/api/fields/address/search', {
      query: { keyword },
    }),
};
