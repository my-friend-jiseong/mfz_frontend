import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { request } from '@/api/client';

// 외근 진행 중 자주 발생하는 mutation (체크인 / 텍스트 메모 / 상태 변경) 가
// NetworkError 로 실패할 때 큐잉 → 네트워크 복구 시 best-effort 자동 flush.
//
// 정책 (PR-D 가이드 §위험·주의):
// - idempotent 추정 가능한 mutation 만 큐잉 (응답값을 client 가 즉시 사용하지 않는 것)
// - 응답 무관 fire-and-forget
// - operation id 부여로 중복 호출 방지
// - 부팅 시 AsyncStorage 에서 복원
// - logout 시 큐 비움

const STORAGE_KEY = 'mfz.offlineQueue.v1';

export type QueuedOp =
  | {
      id: string;
      kind: 'visitCheckIn';
      path: string;
      body: { fieldId: string; siteName?: string; location?: { lat: number; lng: number } };
      enqueuedAt: string;
    }
  | {
      id: string;
      kind: 'visitTextMemo';
      path: string;
      body: { text: string };
      enqueuedAt: string;
    }
  | {
      id: string;
      kind: 'visitStatus';
      path: string;
      body: { status: string; statusReason?: string };
      enqueuedAt: string;
    }
  | {
      id: string;
      kind: 'fieldStatus';
      path: string;
      method: 'PATCH';
      body: { status: string };
      enqueuedAt: string;
    };

// Discriminated union 의 Omit 은 멤버별 분배가 필요 (단순 Omit<U, K> 은 멤버 고유 필드 손실).
type DistributiveOmit<T, K extends keyof T> = T extends T ? Omit<T, K> : never;
type EnqueueArg = DistributiveOmit<QueuedOp, 'id' | 'enqueuedAt'>;

interface OfflineQueueState {
  queue: QueuedOp[];
  flushing: boolean;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  enqueue: (op: EnqueueArg) => Promise<string>;
  flushAll: () => Promise<{ ok: number; fail: number }>;
  clear: () => Promise<void>;
}

let nextId = 1;
function newId() {
  return `q-${Date.now()}-${nextId++}`;
}

async function persist(queue: QueuedOp[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // ignore — 저장 실패해도 메모리 상태로 동작
  }
}

export const useOfflineQueueStore = create<OfflineQueueState>((set, get) => ({
  queue: [],
  flushing: false,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as QueuedOp[];
        if (Array.isArray(parsed)) {
          set({ queue: parsed });
        }
      }
    } catch {
      /* ignore */
    } finally {
      set({ hydrated: true });
    }
  },

  enqueue: async (op) => {
    const full: QueuedOp = { ...op, id: newId(), enqueuedAt: new Date().toISOString() } as QueuedOp;
    const next = [...get().queue, full];
    set({ queue: next });
    await persist(next);
    return full.id;
  },

  flushAll: async () => {
    const { queue, flushing } = get();
    if (flushing || queue.length === 0) return { ok: 0, fail: 0 };
    set({ flushing: true });

    let ok = 0;
    let fail = 0;
    const remaining: QueuedOp[] = [];

    for (const op of queue) {
      try {
        const method = 'method' in op ? op.method : 'POST';
        await request<unknown>(op.path, { method, body: op.body });
        ok++;
      } catch (e) {
        // 네트워크 오류 → 다시 큐에 남김. 그 외 에러(인증/검증)는 폐기.
        const isNetwork = e instanceof Error && e.name === 'NetworkError';
        if (isNetwork) {
          remaining.push(op);
        }
        fail++;
      }
    }

    set({ queue: remaining, flushing: false });
    await persist(remaining);
    return { ok, fail };
  },

  clear: async () => {
    set({ queue: [] });
    await persist([]);
  },
}));
