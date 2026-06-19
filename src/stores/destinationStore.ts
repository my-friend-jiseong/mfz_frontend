import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Destination } from '@/types/entities';
import { trips as tripsApi } from '@/api';
import type { DestinationResponse } from '@/api';

// backend-backlog §11 (release 2026-06): destinations 는 백엔드에 영속화된다.
// 본 스토어는 서버 소스 + AsyncStorage 오프라인 캐시로 동작:
//   - 외근 시작/상세 로드/active 진입 시 서버 데이터로 setFromServer 하이드레이트.
//   - skip/reorder 는 낙관적 로컬 갱신 + fire-and-forget PATCH (드리프트는 다음 fetch 가 정정).
//   - 도착(arrived)은 체크인 시 백엔드 자동 → markArrived 는 로컬 낙관 표시만(서버콜 불요).
//   - add(진행 중 단건 추가)는 낙관적 로컬 temp 를 즉시 만든 뒤 POST /destinations 를
//     fire-and-forget → 성공 시 temp 행을 서버 destinationId 로 교체·local 해제(영속화).
//     미배포(404)·실패 시 로컬 temp 유지(local: true → PATCH 가드·setFromServer 보존)로
//     graceful degrade. local 플래그는 id 접두사 sniffing 대신 명시 표식 — 서버 id 스킴
//     변화에 견고. (backend-backlog §24, release 2026-06-19)
//
// zustand persist 미들웨어는 일부 환경에서 모듈 초기화 단계 충돌이 보고된 적 있어
// 단순 manual persist 패턴으로 통일.

const STORAGE_KEY = 'mfz.destinations.v1';

function serverToDestination(tripId: string, d: DestinationResponse): Destination {
  return {
    id: d.destinationId,
    tripId,
    fieldId: d.fieldId,
    order: d.order,
    status: d.status,
    // 서버 행은 local 플래그 없음(undefined) → PATCH 대상.
  };
}

interface DestinationState {
  destinations: Destination[];
  hydrated: boolean;

  hydrate: () => Promise<void>;
  // 서버 destinations 로 그 trip 의 목적지를 교체 (로컬 temp 행은 보존). start/loadDetail/fetch 공용.
  setFromServer: (tripId: string, items: DestinationResponse[]) => void;
  // GET /destinations 로 그 trip 목적지를 서버에서 가져와 하이드레이트 (active 진입·콜드스타트).
  fetchForTrip: (tripId: string) => Promise<void>;
  bulkCreate: (tripId: string, fieldIds: string[]) => Destination[];
  // 진행 중 외근에 destination 단건 추가. 이미 같은 field 가 있거나 (어떤 status 든)
  // pending 이 아닌 destination 으로 들어가야 할 case 는 없으므로 중복은 거부 (null 반환).
  add: (tripId: string, fieldId: string) => Destination | null;
  byTrip: (tripId: string) => Destination[];
  current: (tripId: string) => Destination | undefined;
  findByTripField: (
    tripId: string,
    fieldId: string,
  ) => Destination | undefined;
  markArrived: (id: string) => void;
  markSkipped: (id: string) => void;
  reorder: (tripId: string, orderedIds: string[]) => void;
  removeByTrip: (tripId: string) => void;
  isAllResolved: (tripId: string) => boolean;
  // 로그아웃 시 호출 — 다른 사용자가 같은 디바이스에서 로그인했을 때 잔존하지 않도록.
  clearAll: () => Promise<void>;
}

let nextSeq = 1;
function nextDestId(): string {
  return `dest-${Date.now().toString(36)}-${nextSeq++}`;
}

async function persist(destinations: Destination[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(destinations));
  } catch {
    // 저장 실패해도 앱 동작은 계속 — 다음 부팅 시 메모리 상태로만 유지됨.
  }
}

export const useDestinationStore = create<DestinationState>((set, get) => ({
  destinations: [],
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Destination[];
        if (Array.isArray(parsed)) {
          set({ destinations: parsed });
        }
      }
    } catch {
      /* ignore */
    } finally {
      set({ hydrated: true });
    }
  },

  setFromServer: (tripId, items) => {
    const incoming = items.map((d) => serverToDestination(tripId, d));
    // 다른 trip 의 행 + 이 trip 의 로컬(미영속 add) 행은 보존, 서버 행만 교체.
    const preserved = get().destinations.filter(
      (d) => d.tripId !== tripId || d.local,
    );
    const next = [...preserved, ...incoming];
    set({ destinations: next });
    void persist(next);
  },

  fetchForTrip: async (tripId) => {
    try {
      const res = await tripsApi.listDestinations(tripId);
      get().setFromServer(tripId, res.items);
    } catch {
      // 네트워크·미배포(404) 등 — 캐시 유지. 다음 진입 때 재시도.
    }
  },

  // 레거시 폴백 전용 — start 응답에 서버 destinations 가 없을 때만 tripStore.start 가 호출.
  // 정상 경로에선 setFromServer 가 서버 id 로 하이드레이트.
  bulkCreate: (tripId, fieldIds) => {
    const created: Destination[] = fieldIds.map((fieldId, idx) => ({
      id: nextDestId(),
      tripId,
      fieldId,
      order: idx,
      status: 'pending',
      local: true,
    }));
    const next = [...get().destinations, ...created];
    set({ destinations: next });
    void persist(next);
    return created;
  },

  // 진행 중 외근 단건 추가 — 낙관적 로컬 temp 즉시 생성(모달 UX 유지) 후 서버 POST.
  // 성공 시 temp 행을 서버 destinationId 로 교체·local 해제로 영속화. (backend-backlog §24)
  add: (tripId, fieldId) => {
    const existing = get().destinations.filter((d) => d.tripId === tripId);
    if (existing.some((d) => d.fieldId === fieldId)) return null;
    const maxOrder = existing.reduce((m, d) => Math.max(m, d.order), 0);
    const tempId = nextDestId();
    const created: Destination = {
      id: tempId,
      tripId,
      fieldId,
      order: maxOrder + 1,
      status: 'pending',
      local: true,
    };
    const next = [...get().destinations, created];
    set({ destinations: next });
    void persist(next);

    // 서버 영속 (fire-and-forget). 성공 → temp 를 서버 행으로 확정.
    // 멱등 응답(기존 destination)으로 같은 id 가 이미 있으면 temp 폐기(중복 방지).
    // 404(미배포)·네트워크 실패 → temp 유지, 다음 setFromServer 가 정정.
    void tripsApi
      .addDestination(tripId, { fieldId })
      .then((res) => {
        const cur = get().destinations;
        const dupExists = cur.some(
          (d) => d.id === res.destinationId && d.id !== tempId,
        );
        const after = dupExists
          ? cur.filter((d) => d.id !== tempId)
          : cur.map((d) =>
              d.id === tempId
                ? {
                    ...d,
                    id: res.destinationId,
                    order: res.order,
                    status: res.status,
                    local: undefined,
                  }
                : d,
            );
        set({ destinations: after });
        void persist(after);
      })
      .catch(() => {});
    return created;
  },

  byTrip: (tripId) =>
    get()
      .destinations.filter((d) => d.tripId === tripId)
      .sort((a, b) => a.order - b.order),

  current: (tripId) =>
    get()
      .destinations.filter((d) => d.tripId === tripId && d.status === 'pending')
      .sort((a, b) => a.order - b.order)[0],

  findByTripField: (tripId, fieldId) =>
    get().destinations.find(
      (d) => d.tripId === tripId && d.fieldId === fieldId,
    ),

  // 도착은 체크인 시 백엔드가 자동 처리 → 여기선 즉시 UI 반영용 로컬 낙관 표시만(서버콜 불요).
  // 다음 setFromServer(상세/active fetch)가 서버 상태로 정정·확정한다(서버가 진실).
  markArrived: (id) => {
    const next = get().destinations.map((d) =>
      d.id === id ? { ...d, status: 'arrived' as const } : d,
    );
    set({ destinations: next });
    void persist(next);
  },

  markSkipped: (id) => {
    const target = get().destinations.find((d) => d.id === id);
    const next = get().destinations.map((d) =>
      d.id === id ? { ...d, status: 'skipped' as const } : d,
    );
    set({ destinations: next });
    void persist(next);
    // 서버 영속 (fire-and-forget) — 로컬(미영속) 행은 제외. 실패는 무시(다음 fetch 정정).
    if (target && !target.local) {
      void tripsApi
        .updateDestination(target.tripId, target.id, { status: 'skipped' })
        .catch(() => {});
    }
  },

  reorder: (tripId, orderedIds) => {
    // 이전 order 스냅샷 — 실제로 바뀐 행만 PATCH 하기 위함.
    const prevOrder = new Map(get().destinations.map((d) => [d.id, d.order]));
    const next = get().destinations.map((d) => {
      if (d.tripId !== tripId) return d;
      const idx = orderedIds.indexOf(d.id);
      return idx >= 0 ? { ...d, order: idx } : d; // 0-based (start 전송과 동일 base)
    });
    set({ destinations: next });
    void persist(next);
    // 서버 영속 (fire-and-forget) — order 가 실제로 바뀐 서버 행만 PATCH. 로컬 행은 제외.
    const byId = new Map(next.map((d) => [d.id, d]));
    orderedIds.forEach((destId, idx) => {
      const d = byId.get(destId);
      if (!d || d.local) return;
      if (prevOrder.get(destId) === idx) return; // 순서 변동 없음 → skip
      void tripsApi
        .updateDestination(tripId, destId, { order: idx })
        .catch(() => {});
    });
  },

  removeByTrip: (tripId) => {
    const next = get().destinations.filter((d) => d.tripId !== tripId);
    set({ destinations: next });
    void persist(next);
  },

  isAllResolved: (tripId) => {
    const list = get().destinations.filter((d) => d.tripId === tripId);
    if (list.length === 0) return false;
    return list.every((d) => d.status !== 'pending');
  },

  clearAll: async () => {
    set({ destinations: [] });
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  },
}));
