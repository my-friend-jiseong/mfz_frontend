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
  // Phase 3 §1.3 반영: 백엔드가 userId 제거 → assigneeUserId 단일.
  // 과거 응답과 호환 위해 옵셔널 유지 (구버전 백엔드와 충돌 방지).
  userId?: string;
  assigneeUserId: string;
  recentVisitedAt: string | null;
}

export interface FieldListResponse {
  items: FieldListItem[];
  pagination: { page: number; limit: number; total: number; hasNext: boolean };
  emptyMessage: string | null;
  appliedFilter: unknown;
}

// Phase 3 §2.3 schemas — VisitPhotoAttachment/VisitAudioAttachment/VisitTextMemoAttachment +
// FieldPhotoAttachment/FieldAudioAttachment 통합. 모두 옵셔널 처리해서 endpoint 별 차이 흡수.
export interface FieldDirectAttachment {
  id: string;
  fieldId: string;
  type: 'text' | 'photo' | 'audio';
  text?: string;
  fileName?: string;
  mimeType?: string;
  fileUrl?: string;
  thumbnailUrl?: string;
  byteSize?: number;
  durationSec?: number;
  durationSeconds?: number;
  caption?: string;
  createdAt: string;
  latitude?: number | null;
  longitude?: number | null;
  visitId: string | null;
}

// 현장 상세 응답의 recentVisits 항목 — 최근 방문 요약.
export interface RecentVisitItem {
  visitId: string;
  tripId: string;
  visitedAt: string;
  resultStatus: string;     // 영문 enum (VisitStatus)
  status: string;           // 한국어 표시값 (백엔드)
  statusReason: string | null;
  memoPreview?: string;
  attachmentCounts?: { text: number; photo: number; audio: number };
}

export interface FieldDetailResponse extends FieldCore {
  assigneeUserId: string;
  recentVisits: RecentVisitItem[];
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
  // userId/forceCreateWithDuplicate 는 백엔드 스펙상 존재하나 본 서비스에서 사용 안 함
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
  // assignedUserId 는 백엔드 스펙상 존재하나 본 서비스(단일 Actor)에서는 사용 안 함
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

// Phase 3 §1.4 — 백엔드 목업 응답에서 확정된 shape
export interface AddressSearchItem {
  roadAddress: string;
  jibunAddress: string;
  buildingName: string | null;
  sido: string;
  sigungu: string;
  zonecode?: string;
  lat: number;
  lng: number;
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

  // force=true 옵션은 백엔드 스펙에만 존재하며 본 서비스(단일 Actor)에서는 사용하지 않음.
  remove: (fieldId: string) =>
    request<null>(`/api/fields/${fieldId}`, { method: 'DELETE' }),

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
