// 화면 전환(push)이 끝난 뒤에 할 일 하나를 맡아 둔다. 외근 스택(app/(tabs)/trips/_layout.tsx)이
// 새 화면의 transitionEnd(closing=false)에서 flushAfterPush 를 부른다.
// InteractionManager.runAfterInteractions 는 native-stack 전환을 기다리지 않아 쓰지 않는다.
// 웹은 native-stack 이 transitionEnd 를 보내지 않을 수 있어 시간 제한으로도 실행한다.
const FALLBACK_MS = 1000;

let pending: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export function flushAfterPush(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  const fn = pending;
  pending = null;
  fn?.();
}

/** 다음 push 전환이 끝나면 fn 을 실행한다. 이미 맡겨 둔 일이 있으면 먼저 실행해 비운다. */
export function runAfterNextPush(fn: () => void): void {
  flushAfterPush();
  pending = fn;
  timer = setTimeout(flushAfterPush, FALLBACK_MS);
}
