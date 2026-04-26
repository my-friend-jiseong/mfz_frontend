import { create } from 'zustand';
import type { Field, FieldStatus } from '@/types/entities';
import { fields as fieldsApi, ApiError, localizeError } from '@/api';
import type { CreateFieldBody, UpdateFieldBody, ListMineParams } from '@/api';

type CreateResult =
  | { ok: true; field: Field }
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
  busy: boolean;

  hydrate: () => Promise<void>;
  refresh: (params?: ListMineParams) => Promise<void>;
  create: (body: CreateFieldBody) => Promise<CreateResult>;
  update: (id: string, body: UpdateFieldBody) => Promise<GenericResult>;
  patchStatus: (id: string, status: FieldStatus) => Promise<GenericResult>;
  remove: (id: string, force?: boolean) => Promise<DeleteResult>;

  getById: (id: string) => Field | undefined;
  byUser: (userId: string) => Field[];
}

const describeError = localizeError;

export const useFieldStore = create<FieldState>((set, get) => ({
  fields: [],
  busy: false,

  hydrate: async () => {
    await get().refresh({ visitDateScope: 'all' });
  },

  refresh: async (params) => {
    try {
      const res = await fieldsApi.listMine(params ?? { visitDateScope: 'all' });
      const items: Field[] = res.items.map((it) => ({
        id: it.fieldId,
        userId: it.assigneeUserId ?? it.userId ?? '',
        status: it.status,
        address: it.address,
        addressDetail: it.detailAddress ?? '',
        latitude: it.lat,
        longitude: it.lng,
      }));
      set({ fields: items });
    } catch {
      // ignore
    }
  },

  create: async (body) => {
    set({ busy: true });
    try {
      const res = await fieldsApi.create(body);
      const f: Field = {
        id: res.field.fieldId,
        userId: res.field.assigneeUserId ?? res.field.userId ?? '',
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

  remove: async (id, force = false) => {
    set({ busy: true });
    try {
      await fieldsApi.remove(id, force);
      set((s) => ({
        fields: s.fields.filter((f) => f.id !== id),
        busy: false,
      }));
      return { ok: true };
    } catch (e) {
      set({ busy: false });
      if (e instanceof ApiError && e.status === 409) {
        // HAS_RELATED_VISITS — 클라이언트가 confirm 후 force=true 로 재호출
        return { ok: false, needsConfirm: true, message: e.message };
      }
      return { ok: false, error: describeError(e) };
    }
  },

  getById: (id) => get().fields.find((f) => f.id === id),

  byUser: (userId) => get().fields.filter((f) => f.userId === userId),
}));
