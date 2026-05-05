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
  // 현장별 직접 첨부 캐시 (visitId=null 인 메모/사진/음성)
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
    caption?: string,
  ) => Promise<GenericResult>;
  addVoiceMemo: (
    id: string,
    file: { uri: string; name: string; type: string },
    durationSeconds?: number,
  ) => Promise<GenericResult>;

  getById: (id: string) => Field | undefined;
  byUser: (userId: string) => Field[];
}

const describeError = localizeError;

export const useFieldStore = create<FieldState>((set, get) => ({
  fields: [],
  directAttachments: {},
  busy: false,

  hydrate: async () => {
    await get().refresh({ visitDateScope: 'all' });
  },

  refresh: async (params) => {
    try {
      const res = await fieldsApi.listMine(params ?? { visitDateScope: 'all' });
      const items: Field[] = res.items.map((it) => ({
        id: it.fieldId,
        userId: it.assigneeUserId,
        status: it.status,
        address: it.address,
        addressDetail: it.detailAddress ?? '',
        latitude: it.lat,
        longitude: it.lng,
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
        userId: res.field.assigneeUserId,
        status: res.field.status,
        address: res.field.address,
        addressDetail: res.field.detailAddress ?? '',
        latitude: res.field.lat,
        longitude: res.field.lng,
      };
      set((s) => ({
        fields: [f, ...s.fields.filter((x) => x.id !== f.id)],
        busy: false,
      }));
      return { ok: true, field: f };
    } catch (e) {
      set({ busy: false });
      // Phase 7 — 중복 주소 confirm 패턴: details.duplicateCount 로 사용자에게 안내 후
      // 호출처가 forceCreateWithDuplicate=true 로 재호출하도록 needsConfirm 노출.
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
                id: res.fieldId,
                userId: res.assigneeUserId,
                status: res.status,
                address: res.address,
                addressDetail: res.detailAddress ?? '',
                latitude: res.lat,
                longitude: res.lng,
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
      // Phase 7 — has_related_visits (snake_case). 본 서비스는 단일 Actor 라 force 미사용,
      // details.visitCount 를 메시지에 끼워 안내만 노출.
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
                id: res.fieldId,
                userId: res.assigneeUserId,
                status: res.status,
                address: res.address,
                addressDetail: res.detailAddress ?? '',
                latitude: res.lat,
                longitude: res.lng,
              }
            : f,
        ),
        directAttachments: { ...s.directAttachments, [id]: res.directAttachments ?? [] },
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
          [id]: [...(s.directAttachments[id] ?? []), res.attachment],
        },
      }));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: describeError(e) };
    }
  },

  addPhoto: async (id, file, caption) => {
    try {
      const res = await fieldsApi.addPhoto(id, file, caption);
      set((s) => ({
        directAttachments: {
          ...s.directAttachments,
          [id]: [...(s.directAttachments[id] ?? []), res.attachment],
        },
      }));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: describeError(e) };
    }
  },

  addVoiceMemo: async (id, file, durationSeconds) => {
    try {
      const res = await fieldsApi.addVoiceMemo(id, file, durationSeconds);
      set((s) => ({
        directAttachments: {
          ...s.directAttachments,
          [id]: [...(s.directAttachments[id] ?? []), res.attachment],
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
