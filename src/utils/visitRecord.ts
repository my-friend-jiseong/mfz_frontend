import type { FieldDirectAttachment, VisitPhoto } from '@/api';
import { trips as tripsApi, ApiError, NetworkError, localizeError } from '@/api';
import type { FieldStatus } from '@/types/entities';
import type { UploadFile } from '@/utils/media';
import { useFieldStore } from '@/stores/fieldStore';
import { useVisitStore } from '@/stores/visitStore';
import { findRecentVisit } from '@/utils/findRecentVisit';

// 방문 기록(조치 상태·사진·메모)은 체크인(8 계열)과 방문 기록 수정(3-7)에서만 쓴다.
// 서버에는 방문 단위 메모가 없어(백로그 §35) 메모는 현장 메모로 저장하고, 방문과의 연결은
// "방문 시각 이후 MEMO_WINDOW 안에 쓴 가장 최근 메모" 로 판정한다. 같은 현장을 하루에 두 번
// 방문하면 구분하지 못한다 — 서버가 visit_id 를 주면 이 함수만 바꾸면 된다.
// 조치 상태도 방문 단위가 서버에 없어(백로그 2차 D) 현장 상태(PATCH /api/fields/{id}/status)로 저장한다.
const MEMO_WINDOW_MS = 24 * 60 * 60 * 1000;
// 체크인 저장은 방문 생성 직후 메모를 쓰지만, 서버·기기 시계 차이를 흡수할 여유.
const CLOCK_SKEW_MS = 60 * 1000;

// === 체크인 사진(Figma 8 '사진 N' — 단계 없이 찍은 순서대로) ===
export interface CheckinPhoto {
  key: string;
  /** 로컬 파일(file://·blob:)이거나 서버 경로('/storage/…'). */
  uri: string;
  /** 새로 고른 파일 — 저장할 때 올린다. 없으면 이미 서버에 있는 사진. */
  file?: UploadFile;
  /** 썸네일 시각 배지. 새로 고른 사진은 고른 때, 서버 사진은 올린 때. */
  takenAt: string;
}

/** 서버 방문 사진 → 체크인 사진 목록(오래된 것부터). */
export function photosToList(photos: readonly VisitPhoto[] | undefined): CheckinPhoto[] {
  return [...(photos ?? [])]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((p) => ({ key: p.attachmentId, uri: p.fileUrl, takenAt: p.capturedAt ?? p.createdAt }));
}

// 현장 첨부 중 type === 'text' 인 것.
type TextMemo = FieldDirectAttachment;

export function memoForVisit(
  attachments: readonly FieldDirectAttachment[] | undefined,
  visitedAt: string,
): TextMemo | null {
  if (!attachments) return null;
  const start = new Date(visitedAt).getTime() - CLOCK_SKEW_MS;
  const end = start + MEMO_WINDOW_MS;
  let best: TextMemo | null = null;
  for (const a of attachments) {
    if (a.type !== 'text') continue;
    const t = new Date(a.createdAt).getTime();
    if (t < start || t > end) continue;
    if (!best || a.createdAt > best.createdAt) best = a;
  }
  return best;
}

/** 현장의 가장 최근 메모(방금 쓴 메모를 찾는 데 쓴다). */
function newestMemo(attachments: readonly FieldDirectAttachment[] | undefined): TextMemo | null {
  let best: TextMemo | null = null;
  for (const a of attachments ?? []) {
    if (a.type !== 'text') continue;
    if (!best || a.createdAt > best.createdAt) best = a;
  }
  return best;
}

export interface VisitRecordResult {
  errors: string[];
  /** 조치 상태가 저장됐거나 보낼 필요가 없었다. */
  statusSaved: boolean;
  /** 올린 사진은 file 을 뗀다 — file 이 남은 것이 아직 못 올린 사진이다(다시 저장하면 그것만 올린다). */
  photos: CheckinPhoto[];
  /** 메모가 저장됐거나 보낼 필요가 없었다. */
  memoSaved: boolean;
  /** 저장 뒤 이 방문의 메모 — 다시 저장할 때 initialMemo 로 넘겨 같은 메모를 또 쓰지 않게. */
  memo: TextMemo | null;
}

/**
 * 방문 기록을 서버에 반영한다. 방문은 이미 있어야 한다(체크인은 먼저 check-in 을 호출).
 * 부분 실패는 모아서 돌려준다 — 사진 하나 실패로 메모·조치 상태까지 버리지 않는다.
 * 단계마다 끝났는지 돌려주므로, 호출부는 다시 저장할 때 남은 단계만 보낸다(status·memo 에 null → 건너뜀).
 */
export async function saveVisitRecord(args: {
  visitId: string;
  fieldId: string;
  /** 고른 조치 상태. null 이거나 처음 값과 같으면 보내지 않는다. */
  status: FieldStatus | null;
  initialStatus: FieldStatus | null;
  photos: CheckinPhoto[];
  /** null 이면 메모 단계를 건너뛴다(이미 저장했거나 고칠 수 없는 방문). */
  memo: string | null;
  /** 이 방문에 연결된 기존 메모 — 바뀌면 지우고 새로 쓴다. 다른 방문의 메모는 넘기지 않는다. */
  initialMemo: TextMemo | null;
}): Promise<VisitRecordResult> {
  const { visitId, fieldId, status, initialStatus, initialMemo } = args;
  const errors: string[] = [];
  const visit = useVisitStore.getState();
  const field = useFieldStore.getState();

  let statusSaved = true;
  if (status && status !== initialStatus) {
    const r = await field.patchStatus(fieldId, status);
    if (!r.ok) {
      statusSaved = false;
      errors.push(`조치 상태: ${r.error}`);
    }
  }

  const photos: CheckinPhoto[] = [];
  let failed = 0;
  let lastError = '';
  for (const p of args.photos) {
    if (!p.file) {
      photos.push(p);
      continue;
    }
    const r = await visit.addPhoto(visitId, p.file, { capturedAt: p.takenAt });
    if (r.ok) photos.push({ key: p.key, uri: p.uri, takenAt: p.takenAt });
    else {
      failed += 1;
      lastError = r.error;
      photos.push(p);
    }
  }
  if (failed > 0) errors.push(`사진 ${failed}장: ${lastError}`);

  // 메모는 수정 API 가 없어 삭제 + 재생성한다(백로그 §35).
  let memoSaved = true;
  let memo = initialMemo;
  if (args.memo !== null) {
    const nextMemo = args.memo.trim();
    const prevMemo = (initialMemo?.text ?? '').trim();
    if (nextMemo !== prevMemo) {
      if (nextMemo) {
        const r = await field.addTextMemo(fieldId, nextMemo);
        if (!r.ok) {
          memoSaved = false;
          errors.push(`메모: ${r.error}`);
        } else {
          if (initialMemo) void field.removeTextMemo(fieldId, initialMemo.id);
          memo = newestMemo(useFieldStore.getState().directAttachments[fieldId]);
        }
      } else if (initialMemo) {
        const r = await field.removeTextMemo(fieldId, initialMemo.id);
        if (!r.ok) {
          memoSaved = false;
          errors.push(`메모: ${r.error}`);
        } else memo = null;
      }
    }
  }

  return { errors, statusSaved, photos, memoSaved, memo };
}

/**
 * 결과를 모르는 재전송(응답 전에 끊김)으로 같은 사진·메모가 두 번 올라가지 않게, 다시 보내기 전에 서버를 본다.
 * - 사진: 서버 방문 사진 중 capturedAt 이 같은 것이 있으면 이미 올라간 것으로 본다
 * - 메모: 방문 시각 뒤에 같은 글의 현장 메모가 있으면 이미 저장된 것으로 본다
 * 서버를 못 읽으면 그대로 보낸다(중복보다 유실이 더 나쁘다).
 */
export async function skipAlreadySaved(args: {
  tripId: string;
  visitId: string;
  fieldId: string;
  visitedAt: string | null;
  photos: CheckinPhoto[];
  memo: string | null;
}): Promise<{ photos: CheckinPhoto[]; memoSaved: boolean }> {
  const { tripId, visitId, fieldId } = args;
  let photos = args.photos;
  if (photos.some((p) => p.file) && (await useVisitStore.getState().loadPhotos(tripId, visitId))) {
    const taken = new Set((useVisitStore.getState().photosByVisit[visitId] ?? []).map((p) => p.capturedAt).filter(Boolean));
    photos = photos.map((p) => (p.file && taken.has(p.takenAt) ? { key: p.key, uri: p.uri, takenAt: p.takenAt } : p));
  }
  let memoSaved = false;
  const text = args.memo?.trim();
  if (text) {
    await useFieldStore.getState().loadDetail(fieldId);
    const since = args.visitedAt ? new Date(args.visitedAt).getTime() - CLOCK_SKEW_MS : 0;
    memoSaved = (useFieldStore.getState().directAttachments[fieldId] ?? []).some(
      (a) => a.type === 'text' && a.text?.trim() === text && new Date(a.createdAt).getTime() >= since,
    );
  }
  return { photos, memoSaved };
}

/** 메모를 이 방문의 것으로 볼 수 있는 기간(방문 시각부터). 지나면 3-7 에서 메모를 고칠 수 없다(서버에 방문 메모가 없음). */
export function visitMemoEditable(visitedAt: string, now = Date.now()): boolean {
  return now - new Date(visitedAt).getTime() < MEMO_WINDOW_MS;
}

/**
 * 결과를 모르는 체크인을 다시 보내기 전에 — 앞서 보낸 체크인이 서버에 남았는지 외근 상세 timeline 에서 찾는다.
 * 서버 체크인은 멱등이 아니라(2026-10-17 실측) 그냥 다시 보내면 방문이 둘 생긴다(backlog 2차 H).
 * visit: 찾은 방문(없으면 null). 서버를 읽지 못하면 ok:false — 이때는 다시 보내지 않는다(중복 방문이 생길 수 있다).
 */
export async function findCommittedCheckIn(args: {
  tripId: string;
  fieldId: string;
  attemptedAt: number;
  skewMs?: number;
}): Promise<
  | { ok: true; visit: { visitId: string; visitedAt: string } | null }
  | { ok: false; error: string; network?: boolean; status?: number }
> {
  try {
    const d = await tripsApi.detail(args.tripId);
    const hit = findRecentVisit(d.timeline, args);
    if (!hit) return { ok: true, visit: null };
    // 찾은 방문을 스토어에도 넣는다(체크인이 성공했을 때와 같게 — 외근 상세·방문 수에 보이게).
    useVisitStore.getState().syncFromTimeline(args.tripId, [hit]);
    return { ok: true, visit: { visitId: hit.visitId, visitedAt: hit.visitedAt } };
  } catch (e) {
    return {
      ok: false,
      error: localizeError(e),
      network: e instanceof NetworkError,
      status: e instanceof ApiError ? e.status : undefined,
    };
  }
}
