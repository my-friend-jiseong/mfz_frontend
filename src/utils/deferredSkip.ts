import { useDestinationStore } from '@/stores/destinationStore';
import { snackbar } from '@/components/ui/Snackbar';
import { notice } from '@/components/ui/ConfirmDialog';

// 이 현장 건너뛰기(7-9) — 화면에는 바로 '건너뜀'으로 보이고, 서버 PATCH 는 되돌리기 스낵바(4초)가 끝난 뒤에 보낸다.
// 서버는 목적지를 pending 으로 되돌리는 PATCH 를 받지 않는다(arrived·skipped 만) — 그래서 되돌리기는
// 서버에 보내기 전에만 가능하다. 화면을 떠나거나 앱이 뒤로 가면 기다리지 않고 바로 보낸다(flushDeferredSkips).

export const UNDO_WINDOW_MS = 4000;

const timers = new Map<string, ReturnType<typeof setTimeout>>();

function commit(destId: string): Promise<boolean> {
  const t = timers.get(destId);
  if (t) clearTimeout(t);
  timers.delete(destId);
  const ds = useDestinationStore.getState();
  // 그사이 되돌렸거나 체크인으로 도착 처리됐으면 보내지 않는다.
  if (ds.destinations.find((d) => d.id === destId)?.status !== 'skipped') return Promise.resolve(true);
  return ds.markSkipped(destId).then((ok) => {
    // 실패하면 markSkipped 가 목적지를 되돌렸다 — 화면이 말없이 바뀌지 않게 알린다.
    if (!ok) void notice('건너뛰지 못했어요', '인터넷 연결을 확인하고 다시 해 주세요.');
    return ok;
  });
}

/** 건너뛴 것으로 표시하고, UNDO_WINDOW_MS 뒤에 서버에 보낸다. */
export function deferSkip(destId: string): void {
  useDestinationStore.getState().setLocalStatus(destId, 'skipped');
  const prev = timers.get(destId);
  if (prev) clearTimeout(prev);
  timers.set(
    destId,
    setTimeout(() => void commit(destId), UNDO_WINDOW_MS),
  );
}

/** 되돌리기 — 아직 보내지 않았으면 다시 목적지로. 이미 보냈으면 false. */
export function undoSkip(destId: string): boolean {
  const t = timers.get(destId);
  if (!t) return false;
  clearTimeout(t);
  timers.delete(destId);
  useDestinationStore.getState().setLocalStatus(destId, 'pending');
  return true;
}

/** 기다리는 건너뛰기를 지금 모두 보낸다(화면을 떠날 때·앱이 뒤로 갈 때). 외근 종료 전엔 끝날 때까지 기다린다. */
export function flushDeferredSkips(): Promise<void> {
  if (timers.size === 0) return Promise.resolve();
  // 보내고 나면 되돌릴 수 없다 — 떠 있는 [되돌리기] 스낵바를 닫는다.
  snackbar.hide();
  return Promise.all([...timers.keys()].map((id) => commit(id))).then(() => undefined);
}

export function hasDeferredSkips(): boolean {
  return timers.size > 0;
}
