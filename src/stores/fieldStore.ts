import { create } from 'zustand';
import type { Field, FieldStatus } from '@/types/entities';
import { fields as fieldsApi, ApiError, localizeError } from '@/api';
import type {
  CreateFieldBody,
  UpdateFieldBody,
  ListMineParams,
  FieldDirectAttachment,
} from '@/api';
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
  ) => Promise<GenericResult>;
  removeTextMemo: (fieldId: string, memoId: string) => Promise<GenericResult>;
  removePhoto: (fieldId: string, photoId: string) => Promise<GenericResult>;

  getById: (id: string) => Field | undefined;
  byUser: (userId: string) => Field[];
}

const describeError = localizeError;

// v2: 현장 상세의 memos[]/photos[] 를 화면 캐시용 FieldDirectAttachment 로 정규화.
function memoToAttachment(m: {
  id: string; fieldId: string; content: string; createdAt: string;
}): FieldDirectAttachment {
  return { id: m.id, fieldId: m.fieldId, type: 'text', text: m.content, createdAt: m.createdAt };
}
function photoToAttachment(p: {
  id: string; fieldId: string; fileName?: string; mimeType?: string; fileUrl: string; fileSize?: number; createdAt: string;
}): FieldDirectAttachment {
  return {
    id: p.id, fieldId: p.fieldId, type: 'photo',
    fileName: p.fileName, mimeType: p.mimeType, fileUrl: p.fileUrl,
    fileSize: p.fileSize, byteSize: p.fileSize, createdAt: p.createdAt,
  };
}

export const useFieldStore = create<FieldState>((set, get) => ({
  fields: [],
  directAttachments: {},
  busy: false,

  hydrate: async () => {
    await get().refresh({ visitDateScope: 'all' });
  },

  refresh: async (params) => {
    try {
      // v2 검증: visitDateScope 미지정 시 목록이 빈다 — 항상 기본 'all' 보장.
      const res = await fieldsApi.listMine({ visitDateScope: 'all', ...params });
      const items: Field[] = res.items.map((it) => ({
        id: it.fieldId,
        userId: it.userId ?? it.assigneeUserId ?? '',
        projectId: it.projectId ?? null,
        projectName: it.projectName ?? null,
        status: it.status,
        address: it.address,
        addressDetail: it.detailAddress ?? '',
        latitude: it.lat,
        longitude: it.lng,
        categories: it.categories ?? it.tags,
        recentVisitedAt: it.recentVisitedAt,
        updatedAt: it.updatedAt,
      }));
      set({ fields: items });
    } catch (e) {
      if (__DEV__) console.error('[fieldStore.refresh] failed', e);
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
    try {
      const res = await fieldsApi.detail(id);
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
                address: res.address,
                addressDetail: res.detailAddress ?? '',
                latitude: res.lat,
                longitude: res.lng,
                categories: res.categories ?? res.tags ?? f.categories,
              }
            : f,
        ),
        directAttachments: {
          ...s.directAttachments,
          [id]: [
            ...(res.memos ?? []).map(memoToAttachment),
            ...(res.photos ?? []).map(photoToAttachment),
          ],
        },
      }));
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

  addPhoto: async (id, file) => {
    try {
      const res = await fieldsApi.addPhoto(id, file);
      set((s) => ({
        directAttachments: {
          ...s.directAttachments,
          [id]: [...(s.directAttachments[id] ?? []), photoToAttachment(res.photo)],
        },
      }));
      return { ok: true };
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

  getById: (id) => get().fields.find((f) => f.id === id),

  byUser: (userId) => get().fields.filter((f) => f.userId === userId),
}));
