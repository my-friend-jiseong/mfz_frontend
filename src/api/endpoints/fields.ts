import { request } from '../client';
import { appendUploadFile } from '@/utils/media';
import type { FieldStatus } from '@/types/entities';

// ERD v2 정렬 — fields 슬림화: 주소·좌표는 locations(1:1), 분류는 field_categories.
//   - 생성: jibunAddress·title 불필요. roadAddress·detailAddress·lat·lng·name·status 필수.
//   - 담당자: userId (호환 assigneeUserId 병행). 분류: categories (요청 tags 동의어).
//   - 목록: /api/fields/mine 만 (관리자 전체목록·assignee PATCH 제거).
//   - 음성 메모(voice-memos) 제거.

// list/detail 공통
interface FieldCore {
  fieldId: string;
  name: string;
  address: string;          // 합쳐진 표시용 string
  roadAddress?: string;
  detailAddress?: string;
  sido?: string;
  sigungu?: string;
  status: FieldStatus;
  lat: number;
  lng: number;
  // ERD v2: field_categories. 호환을 위해 tags 도 optional 로 흡수.
  categories?: string[];
  tags?: string[];
  projectId?: string | null;
  projectName?: string | null;
  updatedAt: string;
}

export interface FieldListItem extends FieldCore {
  // ERD v2: 담당자는 userId. 구버전 호환 위해 assigneeUserId 도 optional.
  userId?: string;
  assigneeUserId?: string;
  recentVisitedAt: string | null;
}

export interface FieldListResponse {
  items: FieldListItem[];
  pagination: { page: number; limit: number; total: number; hasNext: boolean };
  emptyMessage: string | null;
  appliedFilter: unknown;
}

// ERD v2: memos(텍스트) + field_photos(사진) 만. 음성 제거, caption·좌표·visit 연결 없음.
// 응답 형태가 v2 에서 단순화될 수 있어 미디어 필드는 방어적 optional (§8).
//
// phase: backend-backlog §9 visit 단계 모델 — 응답에 phase 가 포함되면
// 보고서 편집기가 자동으로 슬롯 prefill (decision §4 / 2026-05-31).
// §9 머지 전엔 undefined 만 옴 → 모든 슬롯이 빈 상태로 시작 (회로 정상).
export type AttachmentPhase = 'before' | 'during' | 'after';
export interface FieldDirectAttachment {
  id: string;
  fieldId: string;
  type: 'text' | 'photo';
  phase?: AttachmentPhase;
  text?: string;
  fileName?: string;
  mimeType?: string;
  fileUrl?: string;
  thumbnailUrl?: string;
  fileSize?: number;
  byteSize?: number;
  createdAt: string;
}

// 현장 상세 응답의 recentVisits 항목 — ERD v2: visit 첨부·result_status 제거.
export interface RecentVisitItem {
  visitId: string;
  tripId: string;
  visitedAt: string;
  status?: string;          // visits.status
  // backend-backlog §21 — release 2026-06: status='other' 사유 영속·노출.
  reason?: string;
  memoPreview?: string;
}

// v2 검증(2026-05-28): 현장 상세는 memos[] + photos[] 분리 배열 (directAttachments 아님).
export interface FieldMemoItem {
  id: string;
  fieldId: string;
  content: string;
  createdBy?: string;
  createdAt: string;
}
export interface FieldPhotoItem {
  id: string;
  fieldId: string;
  // backend-backlog §9 — visit 단계 모델. 응답에 phase 가 포함되면 보고서 슬롯 prefill.
  // §9 머지 전엔 undefined 만 옴.
  phase?: AttachmentPhase;
  fileName?: string;
  mimeType?: string;
  fileUrl: string;
  fileSize?: number;
  createdAt: string;
}

export interface FieldDetailResponse extends FieldCore {
  userId?: string;
  assigneeUserId?: string;
  recentVisits: RecentVisitItem[];
  memos: FieldMemoItem[];
  photos: FieldPhotoItem[];
  checkInCta?: { label: string; enabled: boolean; reason?: string | null; action?: string | null };
}

export interface CreateFieldBody {
  name: string;
  status: FieldStatus;
  // ERD v2 필수: 도로명·상세주소·좌표.
  roadAddress: string;
  detailAddress: string;
  lat: number;
  lng: number;
  sido?: string;
  sigungu?: string;
  // 선택: 프로젝트 소속·분류.
  projectId?: string;
  categories?: string[];
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
  detailAddress?: string;
  sido?: string;
  sigungu?: string;
  lat?: number;
  lng?: number;
  projectId?: string | null;
  categories?: string[];
}

export interface PatchStatusResponse {
  fieldId: string;
  status: FieldStatus;
  updatedAt: string;
  previousStatus: FieldStatus;
}

// v2 검증: 메모 추가 → { fieldId, memo }, 사진 추가 → { fieldId, photo }.
export interface FieldMemoResponse {
  fieldId: string;
  memo: FieldMemoItem;
}
export interface FieldPhotoResponse {
  fieldId: string;
  photo: FieldPhotoItem;
}

// 주소 검색 — Kakao 응답. jibunAddress 는 외부 검색 결과 표시용(현장 저장과 무관).
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
  provider: {
    primary: string;
    manualCoordinateFallback?: boolean;
    secondary?: string;
    retryOnFailure?: number;
  };
  items: AddressSearchItem[];
  emptyMessage?: string | null;
}

export interface ListMineParams {
  status?: string; // CSV: pending,in_progress,done
  category?: string;
  fromDate?: string;
  toDate?: string;
  visitDateScope?: 'all' | 'none';
  page?: number;
  limit?: number;
}

export const fields = {
  listMine: (params?: ListMineParams) =>
    request<FieldListResponse>('/api/fields/mine', { query: params }),

  // listMine 의 기본 limit 은 1페이지 분량만 반환한다 — 초과분 현장이 목록·지도·현장
  // 선택에서 통째로 사라지는 실데이터 절단 버그 (2026-06-05. capture_screens.mjs 가
  // limit=200 을 명시하는 이유). 주의: "목록 끝까지 스크롤 안 됨" 기기 버그의 원인으로
  // 지목했었으나 그건 오진 — 그 버그의 실제 원인은 MapSheetLayout 의 시트 콘텐츠 높이
  // 미적용(Fabric+reanimated 4) 쪽 주석 참고. 절단 자체는 별개의 실문제라 수정 유지.
  // hasNext 기반 페이지 순회로 전체 수집. 상한 10페이지(=1000현장)는 무한 루프 방어.
  listMineAll: async (params?: Omit<ListMineParams, 'page' | 'limit'>) => {
    const items: FieldListItem[] = [];
    for (let page = 1; page <= 10; page++) {
      const res = await request<FieldListResponse>('/api/fields/mine', {
        query: { ...params, limit: 100, page },
      });
      items.push(...res.items);
      if (!res.pagination?.hasNext) break;
    }
    return items;
  },

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

  remove: (fieldId: string) =>
    request<null>(`/api/fields/${fieldId}`, { method: 'DELETE' }),

  addressSearch: (keyword: string) =>
    request<AddressSearchResponse>('/api/fields/address/search', {
      query: { keyword },
    }),

  addTextMemo: (fieldId: string, text: string) =>
    request<FieldMemoResponse>(`/api/fields/${fieldId}/memos`, {
      method: 'POST',
      body: { text },
    }),

  // opts.phase: backend-backlog §9 visit 단계. 백엔드 미지원 동안엔 silently 무시되지만
  // 프론트 source 가 phase 를 보내야 머지 직후 보고서 prefill 이 살아남.
  // 파일 파트 직렬화 플랫폼 분기는 appendUploadFile(media) 단일 출처.
  addPhoto: async (
    fieldId: string,
    file: { uri: string; name: string; type: string },
    opts?: { phase?: AttachmentPhase },
  ) => {
    const fd = new FormData();
    await appendUploadFile(fd, 'file', file);
    if (opts?.phase) fd.append('phase', opts.phase);
    return request<FieldPhotoResponse>(`/api/fields/${fieldId}/photos`, {
      method: 'POST',
      body: fd,
      multipart: true,
    });
  },

  // 백엔드 신설 요청 — backend-backlog §14. 응답 contract 가 확정되기 전까지는
  // unknown 으로 받고 store 가 로컬 상태 정리만 한다.
  removeTextMemo: (fieldId: string, memoId: string) =>
    request<unknown>(`/api/fields/${fieldId}/memos/${memoId}`, {
      method: 'DELETE',
    }),

  removePhoto: (fieldId: string, photoId: string) =>
    request<unknown>(`/api/fields/${fieldId}/photos/${photoId}`, {
      method: 'DELETE',
    }),
};
