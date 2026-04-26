import { create } from 'zustand';
import type { Field } from '@/types/entities';
import { fields as fieldsApi, ApiError } from '@/api';
import type { CreateFieldBody, ListMineParams } from '@/api';

// 백엔드 미구현 — 기존 화면은 메서드를 그대로 호출하므로 store 가 흡수.
// (4.6 PATCH /fields/{id}, 4.7 DELETE /fields/{id}, 4.8 PATCH /fields/{id}/status)
// 백엔드 추가 후 throw 제거하고 실 API 호출로 교체.
const NOT_IMPLEMENTED = '아직 백엔드에 구현되지 않은 기능입니다';

type CreateResult =
  | { ok: true; field: Field }
  | { ok: false; error: string };

interface FieldState {
  fields: Field[];
  busy: boolean;

  hydrate: () => Promise<void>;
  refresh: (params?: ListMineParams) => Promise<void>;
  create: (body: CreateFieldBody) => Promise<CreateResult>;

  // 백엔드 미구현 — Phase 2 합류 전까지 no-op + 경고
  update: (id: string, patch: Partial<Omit<Field, 'id'>>) => void;
  remove: (id: string) => void;

  getById: (id: string) => Field | undefined;
  byUser: (userId: string) => Field[];
}

function describeError(e: unknown): string {
  if (e instanceof ApiError) return e.message || `오류 (HTTP ${e.status})`;
  if (e instanceof Error) return e.message;
  return '알 수 없는 오류';
}

export const useFieldStore = create<FieldState>((set, get) => ({
  // 시드 제거 — mine 응답에서 채움
  fields: [],
  busy: false,

  hydrate: async () => {
    // 등록 직후 방문 이력 없는 신규 현장도 보이도록 visitDateScope=all
    await get().refresh({ visitDateScope: 'all' });
  },

  refresh: async (params) => {
    try {
      const res = await fieldsApi.listMine(params ?? { visitDateScope: 'all' });
      const items: Field[] = res.items.map((it) => ({
        id: it.fieldId,
        userId: it.userId,
        status: it.status,
        address: it.address, // 백엔드는 합쳐진 단일 string 반환
        addressDetail: '', // 응답에 분리 컬럼 없음 — 백엔드 보강 시 채움
        latitude: 0, // 응답에 lat/lng 미포함 — 백엔드 보강 필요 (지도 표시용)
        longitude: 0,
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
        userId: res.field.userId,
        status: res.field.status,
        address: res.field.address,
        addressDetail: '',
        // create 요청에 보낸 lat/lng 를 그대로 반영 (응답에 미포함이라 호출자 입력값 보존)
        latitude: body.lat,
        longitude: body.lng,
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

  update: (_id, _patch) => {
    console.warn(`[fieldStore.update] ${NOT_IMPLEMENTED}`);
  },

  remove: (_id) => {
    console.warn(`[fieldStore.remove] ${NOT_IMPLEMENTED}`);
  },

  getById: (id) => get().fields.find((f) => f.id === id),

  byUser: (userId) => get().fields.filter((f) => f.userId === userId),
}));
