import { useCategoryStore, norm } from '@/stores/categoryStore';
import { useFieldStore } from '@/stores/fieldStore';

// 분류 이름 변경·삭제를 그 분류가 붙은 현장에도 반영한다(5-8 '현장 N곳의 분류 이름도 함께 바뀌어요', 5-9 '현장 N곳에서 이 분류가 빠져요').
// 서버는 현장에 분류 '이름'을 저장하고 이름 변경·삭제를 현장에 이어 주지 않는다(2026-10-17 실측, 백로그 2차 G).
// 그래서 앱이 현장마다 PATCH 한다. 서버가 해 주게 되면 이 파일의 현장 PATCH 만 지우면 된다.

type Result = { ok: true; failed: number } | { ok: false; error: string };

// 한 번에 하나씩 — 이름 변경과 삭제가 겹치면 같은 현장을 서로 다른 값으로 덮어쓴다.
let chain: Promise<unknown> = Promise.resolve();
let inFlight = 0;
function serial<T>(job: () => Promise<T>): Promise<T> {
  inFlight++;
  const run = chain.then(job, job);
  chain = run
    .catch(() => undefined)
    .finally(() => {
      inFlight--;
    });
  return run;
}

/** 진행 중인 반영이 끝날 때까지 기다린다(5-5 저장 전). */
export async function waitForCategoryCascade(): Promise<void> {
  while (inFlight > 0) await chain;
}

// 이 세션에서 바꾼 이름·지운 분류 — 시트를 닫은 뒤에 끝난 반영을 5-5 의 고른 분류에도 맞추는 데 쓴다.
type LogEntry = { at: number; from: string; to: string | null };
const log: LogEntry[] = [];

/** since(ms) 이후의 이름 변경·삭제를 names 에 적용한다. */
export function reconcileCategories(names: string[], since: number): string[] {
  let out = [...names];
  for (const e of log) {
    if (e.at < since) continue;
    const n = norm(e.from);
    out = out.flatMap((c) => (norm(c) === n ? (e.to ? [e.to] : []) : [c]));
  }
  return out.filter((c, i) => out.findIndex((x) => norm(x) === norm(c)) === i);
}

export function fieldsUsingCategory(name: string): number {
  const n = norm(name);
  return useFieldStore.getState().fields.filter((f) => f.categories?.some((c) => norm(c) === n)).length;
}

// 현장 목록을 다 받은 상태여야 한다(웹 새로고침으로 5-5 에 바로 들어오면 그 현장 하나만 있다). 빠진 현장은 옛 이름으로 남는다.
async function ensureFields(): Promise<boolean> {
  const st = useFieldStore.getState();
  if (st.listStatus === 'ready') return true;
  if (st.listStatus === 'loading') {
    // 받는 중이면 그 결과를 기다린다(두 번 받지 않는다).
    await new Promise<void>((resolve) => {
      const off = useFieldStore.subscribe((s) => {
        if (s.listStatus !== 'loading') {
          off();
          resolve();
        }
      });
    });
  } else {
    await st.refresh({ visitDateScope: 'all' });
  }
  return useFieldStore.getState().listStatus === 'ready';
}

const LIST_FAILED = '현장 목록을 받지 못해 분류를 바꾸지 않았어요. 잠시 뒤에 다시 해 주세요.';

async function patchFields(oldName: string, map: (cats: string[]) => string[]): Promise<number> {
  const n = norm(oldName);
  const ids = useFieldStore
    .getState()
    .fields.filter((f) => f.categories?.some((c) => norm(c) === n))
    .map((f) => f.id);
  let failed = 0;
  for (const id of ids) {
    // 보내기 직전에 최신 값을 다시 읽는다 — 앞선 PATCH·다른 화면의 저장이 바꿨을 수 있다.
    const cur = useFieldStore.getState().fields.find((f) => f.id === id);
    if (!cur?.categories?.some((c) => norm(c) === n)) continue;
    const r = await useFieldStore.getState().update(id, { categories: map(cur.categories) });
    if (!r.ok) failed++;
  }
  return failed;
}

export function renameCategoryEverywhere(id: string, oldName: string, newName: string): Promise<Result> {
  return serial(async (): Promise<Result> => {
    if (!(await ensureFields())) return { ok: false, error: LIST_FAILED };
    const r = await useCategoryStore.getState().rename(id, newName);
    if (!r.ok) return r;
    const next = newName.trim();
    log.push({ at: Date.now(), from: oldName, to: next });
    const n = norm(oldName);
    const failed = await patchFields(oldName, (cats) => {
      const out: string[] = [];
      for (const c of cats) {
        const v = norm(c) === n ? next : c;
        if (!out.some((x) => norm(x) === norm(v))) out.push(v);
      }
      return out;
    });
    return { ok: true, failed };
  });
}

export function deleteCategoryEverywhere(id: string, name: string): Promise<Result> {
  return serial(async (): Promise<Result> => {
    if (!(await ensureFields())) return { ok: false, error: LIST_FAILED };
    const r = await useCategoryStore.getState().remove(id);
    if (!r.ok) return r;
    log.push({ at: Date.now(), from: name, to: null });
    const n = norm(name);
    const failed = await patchFields(name, (cats) => cats.filter((c) => norm(c) !== n));
    return { ok: true, failed };
  });
}
