import { request } from '../client';
import type { FieldStatus } from '@/types/entities';

// docs/_swagger_responses.md §4 (Phase 2 보강 반영)

// list/detail 공통 (Phase 2 부터 lat/lng + 분리주소 포함)
interface FieldCore {
  fieldId: string;
  name: string;
  address: string;          // 합쳐진 표시용 string
  roadAddress?: string;
  jibunAddress?: string;
  detailAddress?: string;
  sido?: string;
  sigungu?: string;
  status: FieldStatus;
  lat: number;
  lng: number;
  tags: string[];
  updatedAt: string;
}

export interface FieldListItem extends FieldCore {
  userId?: string;          // 백엔드 정렬 진행 중 — userId/assigneeUserId 둘 다 옴
  assigneeUserId?: string;
  recentVisitedAt: string | null;
}

export interface FieldListResponse {
  items: FieldListItem[];
  pagination: { page: number; limit: number; total: number; hasNext: boolean };
  emptyMessage: string | null;
  appliedFilter: unknown;
}

export interface FieldDirectAttachment {
  id: string;
  fieldId: string;
  type: 'text' | 'photo' | 'audio';
  text?: string;
  fileUrl?: string;
  thumbnailUrl?: string;
  durationSec?: number;
  caption?: string;
  createdAt: string;
  latitude: number | null;
  longitude: number | null;
  visitId: null;
}

export interface FieldDetailResponse extends FieldCore {
  assigneeUserId: string;
  recentVisits: unknown[];
  directAttachments: FieldDirectAttachment[];
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

export interface UpdateFieldBody {
  name?: string;
  roadAddress?: string;
  jibunAddress?: string;
  detailAddress?: string;
  sido?: string;
  sigungu?: string;
  lat?: number;
  lng?: number;
  tags?: string[];
  assignedUserId?: string; // 관리자만
}

export interface PatchStatusResponse {
  fieldId: string;
  status: FieldStatus;
  updatedAt: string;
  previousStatus: FieldStatus;
}

export interface FieldTextMemoResponse {
  fieldId: string;
  attachment: FieldDirectAttachment;
}

export interface AddressSearchItem {
  // 백엔드 items 가 비어있어 shape 미확인
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

  update: (fieldId: string, body: UpdateFieldBody) =>
    request<FieldDetailResponse>(`/api/fields/${fieldId}`, {
      method: 'PATCH',
      body,
    }),

  patchStatus: (fieldId: string, status: FieldStatus) =>
    request<PatchStatusResponse>(`/api/fields/${fieldId}/status`, {
      method: 'PATCH',
      body: { status },
    }),

  remove: (fieldId: string, force = false) =>
    request<null>(`/api/fields/${fieldId}`, {
      method: 'DELETE',
      query: force ? { force: true } : undefined,
    }),

  addressSearch: (keyword: string) =>
    request<AddressSearchResponse>('/api/fields/address/search', {
      query: { keyword },
    }),

  addTextMemo: (fieldId: string, text: string) =>
    request<FieldTextMemoResponse>(`/api/fields/${fieldId}/memos`, {
      method: 'POST',
      body: { text },
    }),

  addPhoto: (fieldId: string, file: { uri: string; name: string; type: string }, caption?: string) => {
    const fd = new FormData();
    fd.append('file', file as unknown as Blob);
    if (caption) fd.append('caption', caption);
    return request<FieldTextMemoResponse>(`/api/fields/${fieldId}/photos`, {
      method: 'POST',
      body: fd,
      multipart: true,
    });
  },

  addVoiceMemo: (fieldId: string, file: { uri: string; name: string; type: string }, durationSeconds?: number) => {
    const fd = new FormData();
    fd.append('file', file as unknown as Blob);
    if (durationSeconds !== undefined) fd.append('durationSeconds', String(durationSeconds));
    return request<FieldTextMemoResponse>(`/api/fields/${fieldId}/voice-memos`, {
      method: 'POST',
      body: fd,
      multipart: true,
    });
  },
};
