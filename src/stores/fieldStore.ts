import { create } from 'zustand';
import type { Field, FieldStatus } from '@/types/entities';
import { fields as fieldsApi, ApiError, localizeError } from '@/api';
import { useVisitStore } from './visitStore';
import { useAuthStore } from './authStore';
import type {
  CreateFieldBody,
  UpdateFieldBody,
  ListMineParams,
  FieldDirectAttachment,
  FieldListItem,
} from '@/api';
import type { AttachmentPhase } from '@/api/endpoints/fields';
import type { DuplicateAddressDetails, HasRelatedVisitsDetails } from '@/api/errors';

type CreateResult =
  | { ok: true; field: Field }
  | { ok: false; needsConfirm: true; message: string; duplicateCount: number }
  | { ok: false; error: string };

type GenericResult =
  | { ok: true }
  | { ok: false; error: string };

type DeleteResult =
  | { ok: true }
  | { ok: false; needsConfirm: true; message: string }
  | { ok: false; error: string };

interface FieldState {
  fields: Field[];
  // 목록 조회 상태 — empty 와 error 를 화면에서 갈라내기 위한 것 (강령 3).
  listStatus: 'idle' | 'loading' | 'ready' | 'error';
  listError: string | null;
  // 현장별 직접 첨부 캐시 (메모/사진 — ERD v2: field 전용)
  directAttachments: Record<string, FieldDirectAttachment[]>;
  busy: boolean;

  hydrate: () => Promise<void>;
  refresh: (params?: ListMineParams) => Promise<void>;
  loadDetail: (id: string) => Promise<void>;
  create: (body: CreateFieldBody) => Promise<CreateResult>;
  update: (id: string, body: UpdateFieldBody) => Promise<GenericResult>;
  patchStatus: (id: string, status: FieldStatus) => Promise<GenericResult>;
  remove: (id: string) => Promise<DeleteResult>;
  addTextMemo: (id: string, text: string) => Promise<GenericResult>;
  addPhoto: (
    id: string,
    file: { uri: string; name: string; type: string },
    opts?: { phase?: AttachmentPhase },
  ) => Promise<
    { ok: true; photoId: string } | { ok: false; error: string }
  >;
  removeTextMemo: (fieldId: string, memoId: string) => Promise<GenericResult>;
  removePhoto: (fieldId: string, photoId: string) => Promise<GenericResult>;
  clearAll: () => void;

  getById: (id: string) => Field | undefined;
  byUser: (userId: string) => Field[];
}

const describeError = localizeError;

// listMine 응답 항목 → Field 정규화.
// refresh 와 Quick Photo 의 일회성 전체 조회(useQuickPhoto)가 공유.
export function listItemToField(it: FieldListItem): Field {
  return {
    id: it.fieldId,
    userId: it.userId ?? it.assigneeUserId ?? '',
    projectId: it.projectId ?? null,
    projectName: it.projectName ?? null,
    status: it.status,
    name: it.name,
    address: it.address,
    addressDetail: it.detailAddress ?? '',
    latitude: it.lat,
    longitude: it.lng,
    categories: it.categories ?? it.tags,
    recentVisitedAt: it.recentVisitedAt,
    updatedAt: it.updatedAt,
  };
}

// v2: 현장 상세의 memos[]/photos[] 를 화면 캐시용 FieldDirectAttachment 로 정규화.
function memoToAttachment(m: {
  id: string; fieldId: string; content: string; createdAt: string;
}): FieldDirectAttachment {
  return { id: m.id, fieldId: m.fieldId, type: 'text', text: m.content, createdAt: m.createdAt };
}
function photoToAttachment(p: {
  id: string; fieldId: string;
  // backend-backlog §9 — phase 가 들어오면 normalizer 가 그대로 보존해야
  // 보고서 편집기의 prefill 이 동작 (F2 회로 차단, 기존엔 phase 가 잘려 dead code 였음).
  phase?: 'before' | 'during' | 'after';
  fileName?: string; mimeType?: string; fileUrl: string; fileSize?: number; createdAt: string;
}): FieldDirectAttachment {
  return {
    id: p.id, fieldId: p.fieldId, type: 'photo', phase: p.phase,
    fileName: p.fileName, mimeType: p.mimeType, fileUrl: p.fileUrl,
    fileSize: p.fileSize, byteSize: p.fileSize, createdAt: p.createdAt,
  };
}

export const useFieldStore = create<FieldState>((set, get) => ({
  fields: [],
  listStatus: 'idle',
  listError: null,
  directAttachments: {},
  busy: false,

  hydrate: async () => {
    await get().refresh({ visitDateScope: 'all' });
  },

  refresh: async (params) => {
    set({ listStatus: 'loading', listError: null });
    try {
      // v2 검증: visitDateScope 미지정 시 목록이 빈다 — 항상 기본 'all' 보장.
      // listMineAll: 페이지 순회 — 기본 limit(1페이지)만 받으면 21번째+ 현장이
      // 목록·지도·현장 선택에서 통째로 사라진다 (2026-06-05 기기 검증 버그).
      const items = await fieldsApi.listMineAll({ visitDateScope: 'all', ...params });
      set({ fields: items.map(listItemToField), listStatus: 'ready', listError: null });
    } catch (e) {
      // 삼키지 않는다 — __DEV__ 로그만 두면 릴리스에서 실패가 완전히 무음이 되고,
      // fields 가 [] 로 남아 화면은 EmptyState('담당 현장이 없습니다')를 띄운다.
      // 사용자는 서버 오류를 '배정 없음' 으로 오독한다 (강령 3: loading/empty/error 강제).
      set({ listStatus: 'error', listError: localizeError(e) });
    }
  },

  create: async (body) => {
    set({ busy: true });
    try {
      const res = await fieldsApi.create(body);
      const f: Field = {
        id: res.field.fieldId,
        userId: res.field.userId ?? res.field.assigneeUserId ?? '',
        projectId: res.field.projectId ?? body.projectId ?? null,
        projectName: res.field.projectName ?? null,
        status: res.field.status,
        name: res.field.name,
        address: res.field.address,
        addressDetail: res.field.detailAddress ?? '',
        latitude: res.field.lat,
        longitude: res.field.lng,
        categories: res.field.categories ?? res.field.tags ?? body.categories,
      };
      set((s) => ({
        fields: [f, ...s.fields.filter((x) => x.id !== f.id)],
        busy: false,
      }));
      return { ok: true, field: f };
    } catch (e) {
      set({ busy: false });
      // 중복 주소 confirm 패턴: details.duplicateCount 안내 후 forceCreateWithDuplicate 재호출.
      if (e instanceof ApiError && e.code === 'duplicate_address_warning_required') {
        const d = (e.details ?? {}) as Partial<DuplicateAddressDetails>;
        return {
          ok: false,
          needsConfirm: true,
          message: e.message,
          duplicateCount: typeof d.duplicateCount === 'number' ? d.duplicateCount : 0,
        };
      }
      return { ok: false, error: describeError(e) };
    }
  },

  update: async (id, body) => {
    set({ busy: true });
    try {
      const res = await fieldsApi.update(id, body);
      set((s) => ({
        fields: s.fields.map((f) =>
          f.id === id
            ? {
                ...f,
                id: res.fieldId,
                userId: res.userId ?? res.assigneeUserId ?? f.userId,
                projectId: res.projectId ?? f.projectId,
                projectName: res.projectName ?? f.projectName ?? null,
                status: res.status,
                name: res.name ?? f.name,
                address: res.address,
                addressDetail: res.detailAddress ?? '',
                latitude: res.lat,
                longitude: res.lng,
                categories: res.categories ?? res.tags ?? f.categories,
              }
            : f,
        ),
        busy: false,
      }));
      return { ok: true };
    } catch (e) {
      set({ busy: false });
      return { ok: false, error: describeError(e) };
    }
  },

  patchStatus: async (id, status) => {
    try {
      const res = await fieldsApi.patchStatus(id, status);
      set((s) => ({
        fields: s.fields.map((f) =>
          f.id === id ? { ...f, status: res.status } : f,
        ),
      }));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: describeError(e) };
    }
  },

  remove: async (id) => {
    set({ busy: true });
    try {
      await fieldsApi.remove(id);
      set((s) => ({
        fields: s.fields.filter((f) => f.id !== id),
        busy: false,
      }));
      return { ok: true };
    } catch (e) {
      set({ busy: false });
      // has_related_visits: 단일 Actor 라 force 미사용, details.visitCount 안내만.
      if (e instanceof ApiError && e.code === 'has_related_visits') {
        const d = (e.details ?? {}) as Partial<HasRelatedVisitsDetails>;
        const count = typeof d.visitCount === 'number' ? d.visitCount : 0;
        const message = count > 0
          ? `방문 기록이 ${count}건 있어 삭제할 수 없습니다`
          : e.message;
        return { ok: false, needsConfirm: true, message };
      }
      return { ok: false, error: describeError(e) };
    }
  },

  loadDetail: async (id) => {
    // 시작 시 userId 캡처 — 응답이 늦게 도착하는 동안 로그아웃/계정 전환이 일어나면
    // 이전 사용자의 데이터가 새 사용자 store 에 적재되는 회로 차단.
    const startUserId = useAuthStore.getState().user?.id ?? null;
    try {
      const res = await fieldsApi.detail(id);
      const currentUserId = useAuthStore.getState().user?.id ?? null;
      const stillAuthed = useAuthStore.getState().isAuthenticated;
      if (!stillAuthed || currentUserId !== startUserId) return;
      // 응답·기존 모두 userId 누락 시 currentUserId 로 fallback —
      // loadDetail 은 외근 destination/현장 상세 진입에서만 호출 = 본인 동선 가정.
      // userId='' 으로 적재되면 `myFields = filter(f => f.userId === currentUserId)` 모든 곳에서
      // 빠져 사용자가 자기 현장에 접근 불가하게 되는 회로 차단.
      const fallbackUserId = useAuthStore.getState().user?.id ?? '';
      set((s) => {
        const existing = s.fields.find((f) => f.id === id);
        const next = {
          id: res.fieldId,
          userId: res.userId ?? res.assigneeUserId ?? existing?.userId ?? fallbackUserId,
          projectId: res.projectId ?? existing?.projectId ?? null,
          projectName: res.projectName ?? existing?.projectName ?? null,
          status: res.status,
          name: res.name ?? existing?.name,
          address: res.address,
          addressDetail: res.detailAddress ?? '',
          latitude: res.lat,
          longitude: res.lng,
          categories: res.categories ?? res.tags ?? existing?.categories,
        };
        // upsert — 외근 상세 진입 시 다른 사용자의 현장이거나 list 응답에 없던 현장도
        // 지도/카드에서 graceful 하게 노출되도록 store 에 추가.
        return {
          fields: existing
            ? s.fields.map((f) => (f.id === id ? { ...f, ...next } : f))
            : [...s.fields, next as typeof s.fields[number]],
          directAttachments: {
            ...s.directAttachments,
            [id]: [
              ...(res.memos ?? []).map(memoToAttachment),
              ...(res.photos ?? []).map(photoToAttachment),
            ],
          },
        };
      });
      // visit hydrate — recentVisits 를 visitStore 로 sync.
      // 이 store 의 set 안에서 다른 store 를 변경하면 zustand subscriber 순서 문제 가능성 있어
      // set 바깥에서 별도 호출.
      if (res.recentVisits && res.recentVisits.length > 0) {
        useVisitStore.getState().syncFromRecentVisits(id, res.recentVisits);
      }
    } catch {
      // ignore
    }
  },

  addTextMemo: async (id, text) => {
    try {
      const res = await fieldsApi.addTextMemo(id, text);
      set((s) => ({
        directAttachments: {
          ...s.directAttachments,
          [id]: [...(s.directAttachments[id] ?? []), memoToAttachment(res.memo)],
        },
      }));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: describeError(e) };
    }
  },

  addPhoto: async (id, file, opts) => {
    try {
      const res = await fieldsApi.addPhoto(id, file, opts);
      const attachment = photoToAttachment(res.photo);
      set((s) => ({
        directAttachments: {
          ...s.directAttachments,
          [id]: [...(s.directAttachments[id] ?? []), attachment],
        },
      }));
      return { ok: true, photoId: attachment.id };
    } catch (e) {
      return { ok: false, error: describeError(e) };
    }
  },

  // 메모 개별 삭제. 백엔드 신설 요청 — backend-backlog §14.
  // 호출 실패 시 로컬 상태는 그대로 두고 에러 반환 — 사용자가 다시 시도 가능.
  removeTextMemo: async (fieldId, memoId) => {
    try {
      await fieldsApi.removeTextMemo(fieldId, memoId);
      set((s) => ({
        directAttachments: {
          ...s.directAttachments,
          [fieldId]: (s.directAttachments[fieldId] ?? []).filter(
            (a) => !(a.type === 'text' && a.id === memoId),
          ),
        },
      }));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: describeError(e) };
    }
  },

  removePhoto: async (fieldId, photoId) => {
    try {
      await fieldsApi.removePhoto(fieldId, photoId);
      set((s) => ({
        directAttachments: {
          ...s.directAttachments,
          [fieldId]: (s.directAttachments[fieldId] ?? []).filter(
            (a) => !(a.type === 'photo' && a.id === photoId),
          ),
        },
      }));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: describeError(e) };
    }
  },

  // 로그아웃 시 호출 — 다음 사용자가 같은 디바이스에서 로그인 시 잔존 차단.
  clearAll: () => set({ fields: [], directAttachments: {}, busy: false }),

  getById: (id) => get().fields.find((f) => f.id === id),

  byUser: (userId) => get().fields.filter((f) => f.userId === userId),
}));
