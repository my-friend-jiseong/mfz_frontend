import { create } from 'zustand';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useVisitStore } from './visitStore';
import { useDestinationStore } from './destinationStore';
import { confirm, notice } from '@/components/ui/ConfirmDialog';
import type { FieldStatus } from '@/types/entities';
import { findCommittedCheckIn, saveVisitRecord, skipAlreadySaved, type CheckinPhoto } from '@/utils/visitRecord';
import { dropQueuedPhotos, queuedPhotoExists } from '@/utils/queuePhotos';

// 체크인 저장 대기열(7-2 오프라인 저장 · 7-3 저장 실패).
// 서버에 닿지 못한 체크인을 기기에 남겨 두고, 연결이 돌아오거나 앱이 앞으로 오면 다시 보낸다.
// 서버가 거부하면(4xx·5xx) '실패'로 두고 사용자가 [다시 시도]·칩을 눌러야 다시 보낸다.
//
// 지금 서버 계약(check-in body 에 tripId 없음)에서는 서버가 '지금 진행 중인 외근'에 방문을 붙인다. 그래서
// 대기열 항목은 그 외근이 아직 진행 중일 때만 보낸다. 외근이 끝났거나 다른 외근이 진행 중이면 엉뚱한 외근에
// 붙으므로 보내지 않고 '갈 곳 없음(orphaned)'으로 남긴 뒤, 사용자에게 묻고 [버리기]를 고를 때만 지운다.
// 진행 중 외근을 서버에서 확인하지 못했으면(getActiveTripId → undefined) 보내지도 옮기지도 않는다.
// 끝난 외근에 붙여 저장하는 것은 backlog '2차 H'(visitedAt·tripId).
// 체크인 화면에서 함께 고른 조치 상태·사진·메모도 항목에 싣고, 체크인이 저장되면 이어서 보낸다(record).
// 사진은 넣을 때 앱 문서 폴더로 복사해 둔 경로를 남기고(utils/queuePhotos), 올렸거나 버리면 지운다. 웹은 blob: 주소라
// 페이지를 새로 고치면 사라진다 — 그때는 사진만 빼고 알린다.
// 체크인 → 조치 상태 → 사진 → 메모를 단계마다 기록해(visitId·statusSaved·memoSaved·남은 photos) 다시 보낼 때 남은 단계만 보낸다.
// 서버 체크인은 멱등이 아니다(2026-10-17 실측: 같은 외근·현장에 두 번 → 방문 2건). 체크인을 처음 보낸 시각(checkinAttemptedAt)을
// 남기고, 결과를 모른 채 다시 보낼 때는 먼저 외근 상세 timeline 에서 그 뒤 생긴 방문을 찾아 쓴다(findCommittedCheckIn).

const STORAGE_KEY = 'mfz.checkinQueue.v1';
// 대기 중인 것이 있으면 이 간격으로도 다시 보낸다(NetInfo 이벤트를 못 받는 환경 대비).
const RETRY_MS = 30_000;

export interface QueuedCheckIn {
  id: string;
  /** 대기열에 넣은 사용자 — 다른 계정으로 로그인하면 보내지 않고 지운다. */
  userId: string;
  tripId: string;
  fieldId: string;
  /** 경고 줄에 보일 현장 이름(7-3 '낙동대로 351 기록을 저장하지 못했어요.'). */
  label: string;
  /** 체크인한 시각 — 7-8 거리 기준(마지막 체크인 현장) 정렬에 쓰고, 서버가 받게 되면 함께 보낸다(backlog 2차 H). */
  visitedAt: string;
  /** orphaned: 그 외근이 끝나(또는 다른 외근이 진행 중이라) 지금 서버로는 보낼 수 없다 — 사용자가 버릴 때까지 남긴다. */
  state: 'pending' | 'failed' | 'orphaned';
  error?: string;
  /** 체크인과 함께 저장할 방문 기록. 체크인이 저장된 뒤 보낸다. */
  record?: QueuedRecord;
  /** 체크인(방문 생성)이 이미 저장됐으면 그 방문 — 다시 보낼 때 체크인을 건너뛰고 남은 기록만 보낸다. */
  visitId?: string;
  /** 체크인을 처음 보낸 시각(ms) — 있으면 결과를 모르는 것이라, 다시 보내기 전에 서버에 그 뒤 방문이 생겼는지 본다. */
  checkinAttemptedAt?: number;
}

export interface QueuedRecord {
  status: FieldStatus | null;
  /** 체크인 화면을 열 때의 조치 상태 — 같으면 보내지 않는다. */
  initialStatus: FieldStatus | null;
  memo: string;
  /** 아직 못 올린 사진(올린 것은 빠진다). */
  photos: CheckinPhoto[];
  statusSaved?: boolean;
  memoSaved?: boolean;
  /** 한 번이라도 보내 봤다 — 결과를 모르는 재전송이면 보내기 전에 서버에 이미 있는지 본다(skipAlreadySaved). */
  attempted?: boolean;
}

const recordDone = (r: QueuedRecord | undefined) => !r || (!!r.statusSaved && !!r.memoSaved && r.photos.every((p) => !p.file));

/**
 * 같은 (외근, 현장)을 다시 넣으면 앞의 기록에 합친다 — 사진은 더하고, 메모는 줄을 바꿔 잇고, 조치 상태는 나중 것.
 * 새로 넣는 쪽이 이미 저장한 부분(statusSaved·memoSaved — 체크인 화면이 일부 저장한 뒤 끊긴 경우)은 합치지 않는다.
 */
function mergeRecord(prev: QueuedRecord | undefined, next: QueuedRecord | undefined): QueuedRecord | undefined {
  if (!prev) return next;
  if (!next) return prev;
  const statusPart = next.statusSaved
    ? { status: prev.status, initialStatus: prev.initialStatus, statusSaved: prev.statusSaved }
    : (() => {
        const status = next.status ?? prev.status;
        return {
          status,
          // 앞 조치 상태를 이미 보냈으면 그것이 새 기준선이다.
          initialStatus: prev.statusSaved ? (prev.status ?? prev.initialStatus) : prev.initialStatus,
          statusSaved: !!prev.statusSaved && status === prev.status,
        };
      })();
  const memoPart = next.memoSaved
    ? { memo: prev.memo, memoSaved: prev.memoSaved }
    : (() => {
        // 앞 메모를 이미 저장했으면 새 메모만 따로 쓴다(같은 메모를 두 번 쓰지 않게).
        const memo = prev.memoSaved ? next.memo.trim() : [prev.memo.trim(), next.memo.trim()].filter(Boolean).join('\n');
        return { memo, memoSaved: memo === '' };
      })();
  return { ...statusPart, ...memoPart, photos: [...prev.photos, ...next.photos], attempted: prev.attempted };
}

interface CheckinQueueState {
  items: QueuedCheckIn[];
  hydrated: boolean;
  /** 지금 보내는 중 */
  flushing: boolean;
  hydrate: () => Promise<void>;
  enqueue: (input: Pick<QueuedCheckIn, 'tripId' | 'fieldId' | 'label' | 'record' | 'visitId' | 'checkinAttemptedAt'>) => QueuedCheckIn | null;
  /** 대기 중인 것을 보낸다. retryFailed 면 실패한 것도 다시. */
  flush: (opts?: { retryFailed?: boolean }) => Promise<void>;
  /** 그 외근의 체크인 대기 항목을 지운다(외근 종료 확인에서 [종료]를 고른 뒤 — 저장되지 않음을 이미 알렸다).
   *  체크인이 이미 저장된 항목(visitId — 남은 사진·메모)은 방문 id 로 계속 보낼 수 있어 남긴다. */
  discardTrip: (tripId: string) => void;
  /** 체크인은 저장됐고 사진·메모만 실패로 남은 항목을 다시 보낸다(앱이 앞으로 올 때 — 외근이 끝나 7-3 [다시 시도]가 없어도). */
  retryDetached: () => void;
  /** 로그인한 사용자가 바뀌면 — 다른 사용자의 항목은 지운다. */
  onUserChange: (userId: string | null) => void;
  clearAll: () => Promise<void>;
}

// 대기열이 알아야 하는 앱 상태 — 스토어끼리 순환 import 를 피하려고 앱 루트가 넣어 준다(startCheckinQueue).
let getUserId: () => string | null = () => null;
// undefined = 아직 모름(부팅 직후 /trips/active 응답 전) — 그동안은 보내지도 버리지도 않는다.
let getActiveTripId: () => string | null | undefined = () => undefined;

let seq = 0;
let inflight: Promise<void> | null = null;
// 이번 실행에서 이미 물어본 갈 곳 없는 항목 — [나중에]를 고르면 앱을 다시 켤 때 다시 묻는다.
const askedOrphans = new Set<string>();
// 대기열 안내는 화면 이동(외근 종료 → 3 등)과 같은 틱에 띄우지 않는다.
const NOTICE_DELAY_MS = 600;
const later = (fn: () => void) => setTimeout(fn, NOTICE_DELAY_MS);

function persist(items: QueuedCheckIn[]) {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch(() => {});
}

export const useCheckinQueueStore = create<CheckinQueueState>((set, get) => {
  const replace = (next: QueuedCheckIn[]) => {
    set({ items: next });
    persist(next);
  };
  const update = (id: string, patch: Partial<QueuedCheckIn>) =>
    replace(get().items.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  // 항목을 지울 때는 대기열이 들고 있던 사진 파일도 지운다.
  const removeItems = (ids: string[]) => {
    const gone = new Set(ids);
    for (const x of get().items) if (gone.has(x.id)) dropQueuedPhotos(x.record?.photos);
    replace(get().items.filter((x) => !gone.has(x.id)));
  };

  const runOnce = async () => {
    const userId = getUserId();
    const active = getActiveTripId();
    if (!userId || active === undefined) return;
    // 끝난 외근의 대기·실패 항목은 갈 곳 없음으로(지우지 않는다).
    // 체크인을 보냈다가 결과를 모르는 항목은 먼저 서버를 본다 — 저장돼 있었으면 방문 id 로 남은 기록을 보낼 수 있다.
    // 서버를 읽지 못한 항목은 이번에는 옮기지 않는다(다음 기회에 다시 본다).
    const unknown = new Set<string>();
    for (const x of get().items) {
      if (x.userId !== userId || x.state === 'orphaned' || x.tripId === active || x.visitId || !x.checkinAttemptedAt) continue;
      const found = await findCommittedCheckIn({ tripId: x.tripId, fieldId: x.fieldId, attemptedAt: x.checkinAttemptedAt });
      if (!found.ok) unknown.add(x.id);
      else if (found.visit) update(x.id, { visitId: found.visit.visitId });
    }
    const stale = get().items.filter(
      (x) => x.userId === userId && x.state !== 'orphaned' && x.tripId !== active && !x.visitId && !unknown.has(x.id),
    );
    if (stale.length > 0) {
      const ids = new Set(stale.map((x) => x.id));
      replace(get().items.map((x) => (ids.has(x.id) ? { ...x, state: 'orphaned' as const, error: undefined } : x)));
    }
    const todo = get().items.filter((x) => x.state === 'pending' && x.userId === userId);
    if (todo.length === 0) {
      askOrphans(userId);
      return;
    }
    set({ flushing: true });
    // 서버가 다른 외근에 붙여 저장한 체크인(보내는 사이 외근이 바뀜).
    const elsewhere: QueuedCheckIn[] = [];
    // 체크인은 저장했지만 함께 실은 사진·메모·조치 상태 일부를 서버가 받지 않은 현장 — [다시 시도]로 남은 것만.
    const partial: string[] = [];
    // 사진 파일이 기기에서 사라져 올릴 수 없는 현장 — 기록 수정에서 다시 넣어야 한다.
    const lostFiles: string[] = [];
    // 보내는 사이 합쳐진 기록이 남았다 — 한 번 더 돈다.
    let again = false;
    try {
      for (const item of todo) {
        // 이 외근이 지금 진행 중이 아니면 서버가 다른 외근(또는 409)에 처리한다 — 보내지 않고 갈 곳 없음으로.
        const nowActive = getActiveTripId();
        if (nowActive === undefined) break;
        // 체크인을 이미 저장한 항목은 방문 id 로 남은 기록만 보내므로 외근이 끝나도 보낼 수 있다.
        if (nowActive !== item.tripId && !item.visitId) {
          if (unknown.has(item.id)) continue;
          replace(get().items.map((x) => (x.id === item.id ? { ...x, state: 'orphaned' as const } : x)));
          continue;
        }
        let visitId = get().items.find((x) => x.id === item.id)?.visitId ?? item.visitId;
        // 앞서 보낸 체크인의 결과를 모른다 — 서버에 이미 생겼으면 그 방문을 쓰고 다시 보내지 않는다.
        const attemptedAt = get().items.find((x) => x.id === item.id)?.checkinAttemptedAt ?? item.checkinAttemptedAt;
        if (!visitId && attemptedAt) {
          const found = await findCommittedCheckIn({ tripId: item.tripId, fieldId: item.fieldId, attemptedAt });
          if (!found.ok && (found.network || found.status === 401)) break;
          if (!found.ok) {
            update(item.id, { state: 'failed', error: found.error });
            continue;
          }
          if (found.visit) {
            visitId = found.visit.visitId;
            update(item.id, { visitId });
          }
        }
        if (!visitId) {
          if (!attemptedAt) update(item.id, { checkinAttemptedAt: Date.now() });
          const r = await useVisitStore.getState().checkIn(item.tripId, item.fieldId);
          // 아직 끊김, 또는 세션 만료 — 나머지도 그대로 두고 다음 기회에.
          if (!r.ok && (r.network || r.status === 401)) break;
          if (!r.ok) {
            update(item.id, { state: 'failed', error: r.error });
            continue;
          }
          // 보내는 사이 외근이 바뀌었으면 서버가 다른 외근에 붙였다 — 기록은 붙이지 않고 알린다.
          if (r.visit.tripId && r.visit.tripId !== item.tripId) {
            elsewhere.push(item);
            removeItems([item.id]);
            continue;
          }
          visitId = r.visit.id;
          // 체크인이 저장됐음을 먼저 남긴다 — 아래 기록 저장 중에 앱이 꺼져도 다시 체크인하지 않는다.
          update(item.id, { visitId });
        }
        const sent = get().items.find((x) => x.id === item.id)?.record;
        if (!sent || recordDone(sent)) {
          removeItems([item.id]);
          continue;
        }
        // 지워진 사진 파일(OS 정리·웹 새로고침)은 빼고 알린다 — 계속 실패로 남지 않게.
        let alive: CheckinPhoto[] = [];
        const lostKeys = new Set<string>();
        for (const p of sent.photos) {
          if (await queuedPhotoExists(p)) alive.push(p);
          else lostKeys.add(p.key);
        }
        if (lostKeys.size > 0) lostFiles.push(item.label);
        let memoAlready = false;
        // 앞서 보내다 결과를 모르고 끊겼으면 서버에 이미 있는 사진·메모는 다시 보내지 않는다.
        if (sent.attempted) {
          const seen = await skipAlreadySaved({
            tripId: item.tripId,
            visitId,
            fieldId: item.fieldId,
            visitedAt: item.visitedAt,
            photos: alive,
            memo: sent.memoSaved ? null : sent.memo,
          });
          alive = seen.photos;
          memoAlready = seen.memoSaved;
        } else update(item.id, { record: { ...sent, attempted: true } });
        const sentMemo = sent.memoSaved || memoAlready ? null : sent.memo;
        const res = await saveVisitRecord({
          visitId,
          fieldId: item.fieldId,
          status: sent.statusSaved ? null : sent.status,
          initialStatus: sent.initialStatus,
          photos: alive,
          memo: sentMemo,
          initialMemo: null,
        });
        // 올린 사진 = 보낼 때 file 이 있었는데 결과에서 file 이 빠진 것(이미 서버에 있던 것 포함).
        const leftKeys = new Set(res.photos.filter((p) => p.file).map((p) => p.key));
        const uploadedKeys = new Set(sent.photos.filter((p) => p.file && !leftKeys.has(p.key) && !lostKeys.has(p.key)).map((p) => p.key));
        dropQueuedPhotos(sent.photos.filter((p) => uploadedKeys.has(p.key)));
        // 보내는 동안 같은 현장 체크인이 더 들어와 합쳐졌을 수 있다 — 지금 항목을 다시 읽어 보낸 것만 뺀다.
        const cur = get().items.find((x) => x.id === item.id);
        if (!cur) continue;
        const curRec = cur.record ?? sent;
        let memo = curRec.memo;
        let memoSaved = !!curRec.memoSaved;
        // 이번에 메모가 저장됐다(보냈거나 서버에 이미 있었다).
        const memoDone = !sent.memoSaved && (memoAlready || (sentMemo !== null && res.memoSaved));
        if (!memoSaved && memoDone) {
          // 보낸 글 그대로면 끝, 뒤에 합쳐진 글이 있으면 그것만 남긴다.
          if (curRec.memo === sent.memo) memoSaved = true;
          else if (curRec.memo.startsWith(sent.memo)) {
            memo = curRec.memo.slice(sent.memo.length).trim();
            memoSaved = memo === '';
          }
        }
        const statusSaved =
          !!curRec.statusSaved ||
          (res.statusSaved && curRec.status === sent.status && curRec.initialStatus === sent.initialStatus);
        const nextRec: QueuedRecord = {
          ...curRec,
          memo,
          memoSaved,
          statusSaved,
          photos: curRec.photos.filter((p) => !uploadedKeys.has(p.key) && !lostKeys.has(p.key)),
        };
        if (recordDone(nextRec)) {
          removeItems([item.id]);
          continue;
        }
        if (res.errors.length === 0) {
          // 보낸 것은 다 저장됐고 그사이 합쳐진 것만 남았다 — 다음 차례에 보낸다.
          update(item.id, { record: nextRec, state: 'pending', error: undefined });
          again = true;
          continue;
        }
        // 남은 단계가 있다 — 끊겨서면 다음 기회에, 서버가 거부했으면 실패로 두고 [다시 시도]에서 남은 것만 보낸다.
        if (await isKnownOffline()) {
          update(item.id, { record: nextRec });
          break;
        }
        update(item.id, { record: nextRec, state: 'failed', error: res.errors.join('\n') });
        if (!partial.includes(item.label)) partial.push(item.label);
      }
    } finally {
      set({ flushing: false });
    }
    if (elsewhere.length > 0) {
      const names = elsewhere.map((d) => d.label).join(', ');
      later(() => void notice('다른 외근에 기록됐어요', `${names} 체크인은 저장했지만 지금 진행 중인 외근에 붙었어요. 그 외근 상세에서 확인해 주세요.`));
    }
    if (partial.length > 0) {
      later(() => void notice('일부 기록을 저장하지 못했어요', `${partial.join(', ')} 체크인은 저장했지만 사진·메모 일부를 올리지 못했어요. [다시 시도]를 눌러 주세요.`));
    }
    if (lostFiles.length > 0) {
      later(() => void notice('사진 일부를 올리지 못했어요', `${lostFiles.join(', ')} 사진 파일이 기기에서 지워졌어요. 외근 상세의 기록 수정에서 다시 넣어 주세요.`));
    }
    askOrphans(userId);
    if (again) setTimeout(() => void get().flush(), 0);
  };

  // 갈 곳 없는 항목을 한 번 묻는다 — [버리기]면 지우고, [나중에]면 남긴다(다음 실행에서 다시 묻는다).
  const askOrphans = (userId: string) => {
    const fresh = get().items.filter((x) => x.userId === userId && x.state === 'orphaned' && !askedOrphans.has(x.id));
    if (fresh.length === 0) return;
    fresh.forEach((x) => askedOrphans.add(x.id));
    const names = fresh.map((x) => x.label).join(', ');
    later(() => {
      void confirm({
        title: '저장하지 못한 체크인이 있어요',
        message: `${names} 기록은 그 외근이 끝나 지금은 저장할 수 없어요. 버리면 되돌릴 수 없어요.`,
        cancelLabel: '나중에',
        confirmLabel: '버리기',
        destructive: true,
      }).then((ok) => {
        if (!ok) return;
        removeItems(fresh.map((x) => x.id));
      });
    });
  };

  return {
    items: [],
    hydrated: false,
    flushing: false,

    hydrate: async () => {
      if (get().hydrated) return;
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const parsed = raw ? (JSON.parse(raw) as unknown) : null;
        if (Array.isArray(parsed)) {
          const saved = parsed.filter(
            (x): x is QueuedCheckIn =>
              !!x && typeof x === 'object' && typeof (x as QueuedCheckIn).fieldId === 'string' && typeof (x as QueuedCheckIn).userId === 'string',
          );
          // 웹: 지난 페이지의 blob: 사진은 새로 고치면 사라진다 — 빼고 알린다.
          const lost: string[] = [];
          const restored =
            Platform.OS === 'web'
              ? saved.map((x) => {
                  const photos = x.record?.photos ?? [];
                  const keep = photos.filter((p) => !p.file || !p.file.uri.startsWith('blob:'));
                  if (!x.record || keep.length === photos.length) return x;
                  lost.push(x.label);
                  return { ...x, record: { ...x.record, photos: keep } };
                })
              : saved;
          const ids = new Set(restored.map((x) => x.id));
          set({ items: [...restored, ...get().items.filter((x) => !ids.has(x.id))] });
          if (lost.length > 0) {
            persist(get().items);
            later(() => void notice('사진 일부를 저장하지 못했어요', `${lost.join(', ')} 사진은 페이지를 새로 고쳐 사라졌어요. 외근 상세의 기록 수정에서 다시 넣어 주세요.`));
          }
        }
      } catch {
        /* ignore */
      } finally {
        set({ hydrated: true });
      }
    },

    enqueue: ({ tripId, fieldId, label, record, visitId, checkinAttemptedAt }) => {
      const userId = getUserId();
      if (!userId) return null;
      // 같은 외근·현장은 대기열에 하나만 — 앞 항목이 있으면 기록을 합쳐 방문 하나로 보낸다.
      // (서버는 체크인마다 방문을 새로 만든다. 끊긴 동안 같은 현장을 두 번 체크인해도 방문은 하나로 남긴다.)
      const prev = get().items.find((x) => x.userId === userId && x.tripId === tripId && x.fieldId === fieldId);
      const merged = mergeRecord(prev?.record, record);
      const item: QueuedCheckIn = {
        id: prev?.id ?? `q-${Date.now().toString(36)}-${++seq}`,
        userId,
        tripId,
        fieldId,
        label,
        visitedAt: prev?.visitedAt ?? new Date().toISOString(),
        state: 'pending',
        // 체크인은 이미 저장되고 남은 기록만 넣는 경우(체크인 화면이 저장 중 끊김) — 다시 체크인하지 않는다.
        ...((visitId ?? prev?.visitId) ? { visitId: visitId ?? prev?.visitId } : {}),
        // 앞서 보낸 체크인(결과 모름)의 처음 시각 — 다시 보내기 전에 서버를 본다.
        ...((prev?.checkinAttemptedAt ?? checkinAttemptedAt) ? { checkinAttemptedAt: prev?.checkinAttemptedAt ?? checkinAttemptedAt } : {}),
        ...(merged ? { record: merged } : {}),
      };
      replace([...get().items.filter((x) => x !== prev), item]);
      // 목적지는 바로 '방문함'으로 보인다(7-2 진행 1/2) — 서버가 받으면 체크인이 도착 처리를 한다.
      const ds = useDestinationStore.getState();
      const dest = ds.findByTripField(tripId, fieldId);
      if (dest && dest.status === 'pending') ds.markArrived(dest.id);
      return item;
    },

    flush: (opts) => {
      // 실패 → 대기는 먼저(동기로) 바꾼다 — 보내는 중이면 그 회차가 끝난 뒤 한 번 더 돈다.
      if (opts?.retryFailed && get().items.some((x) => x.state === 'failed')) {
        replace(get().items.map((x) => (x.state === 'failed' ? { ...x, state: 'pending' as const, error: undefined } : x)));
        if (inflight) return inflight.then(() => get().flush());
      }
      if (inflight) return inflight;
      inflight = runOnce().finally(() => {
        inflight = null;
      });
      return inflight;
    },

    discardTrip: (tripId) => {
      const ids = get().items.filter((x) => x.tripId === tripId && !x.visitId).map((x) => x.id);
      if (ids.length > 0) removeItems(ids);
    },

    retryDetached: () => {
      const active = getActiveTripId();
      if (active === undefined) return;
      const ids = get().items.filter((x) => x.state === 'failed' && x.visitId && x.tripId !== active).map((x) => x.id);
      if (ids.length === 0) return;
      replace(get().items.map((x) => (ids.includes(x.id) ? { ...x, state: 'pending' as const, error: undefined } : x)));
      void get().flush();
    },

    onUserChange: (userId) => {
      if (!userId) return;
      const others = get().items.filter((x) => x.userId !== userId).map((x) => x.id);
      if (others.length > 0) removeItems(others);
      void get().flush();
    },

    clearAll: async () => {
      for (const x of get().items) dropQueuedPhotos(x.record?.photos);
      set({ items: [] });
      try {
        await AsyncStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    },
  };
});

/** 지금 인터넷에 닿을 수 없다고 확실한가. 모르면 false(일단 보내 본다). */
export async function isKnownOffline(): Promise<boolean> {
  try {
    const s = await NetInfo.fetch();
    return s.isConnected === false || s.isInternetReachable === false;
  } catch {
    return false;
  }
}

/**
 * 앱 루트에서 한 번. 연결이 돌아오거나 앱이 앞으로 오면, 그리고 대기 중이면 주기적으로 다시 보낸다.
 * 로그인 사용자·진행 중 외근은 루트가 넘긴다(스토어 순환 import 방지).
 */
export function startCheckinQueue(deps: {
  getUserId: () => string | null;
  getActiveTripId: () => string | null | undefined;
}): () => void {
  getUserId = deps.getUserId;
  getActiveTripId = deps.getActiveTripId;
  void useCheckinQueueStore
    .getState()
    .hydrate()
    .then(() => useCheckinQueueStore.getState().onUserChange(getUserId()));
  const flush = () => {
    if (getUserId()) void useCheckinQueueStore.getState().flush();
  };
  const unsubNet = NetInfo.addEventListener((s) => {
    if (s.isConnected !== false && s.isInternetReachable !== false) flush();
  });
  const appSub = AppState.addEventListener('change', (st) => {
    if (st !== 'active') return;
    // 끝난 외근의 남은 사진·메모는 7-3 [다시 시도]가 없으니 앞으로 올 때마다 다시 보내 본다.
    if (getUserId()) useCheckinQueueStore.getState().retryDetached();
    flush();
  });
  // 웹: NetInfo 는 navigator.connection 이 있으면 그 change 만 듣는데, 브라우저가 오프라인→온라인을 그쪽으로
  // 알리지 않는 경우가 있다(크롬 실측) — window 'online' 도 듣는다.
  const win = typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : null;
  win?.addEventListener('online', flush);
  // 로그아웃 상태에서는 돌지 않는다.
  const timer = setInterval(() => {
    const uid = getUserId();
    if (uid && useCheckinQueueStore.getState().items.some((x) => x.state === 'pending' && x.userId === uid)) flush();
  }, RETRY_MS);
  return () => {
    unsubNet();
    appSub.remove();
    win?.removeEventListener('online', flush);
    clearInterval(timer);
  };
}
