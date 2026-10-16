import type { FieldDirectAttachment, VisitPhoto, VisitPhotoPhase } from '@/api';
import type { FieldStatus } from '@/types/entities';
import type { UploadFile } from '@/utils/media';
import { useFieldStore } from '@/stores/fieldStore';
import { useVisitStore } from '@/stores/visitStore';

// 방문 기록(조치 상태·사진·메모)은 체크인(8 계열)과 방문 기록 수정(3-7)에서만 쓴다.
// 서버에는 방문 단위 메모가 없어(백로그 §35) 메모는 현장 메모로 저장하고, 방문과의 연결은
// "방문 시각 이후 MEMO_WINDOW 안에 쓴 가장 최근 메모" 로 판정한다. 같은 현장을 하루에 두 번
// 방문하면 구분하지 못한다 — 서버가 visit_id 를 주면 이 함수만 바꾸면 된다.
// 조치 상태도 방문 단위가 서버에 없어(백로그 2차 D) 현장 상태(PATCH /api/fields/{id}/status)로 저장한다.
const MEMO_WINDOW_MS = 24 * 60 * 60 * 1000;
// 체크인 저장은 방문 생성 직후 메모를 쓰지만, 서버·기기 시계 차이를 흡수할 여유.
const CLOCK_SKEW_MS = 60 * 1000;

// === 보고서 현장 칸(전·중·후) — 예전 방문 사진의 단계를 보고서가 그대로 쓴다(reportStore). ===
export type Phase = VisitPhotoPhase;

export interface PhotoSlot {
  uri: string;
}
export type PhaseSlots = Record<Phase, PhotoSlot | null>;

/** 단계별로 가장 최근 방문 사진. phase 없는 사진(2차 체크인 사진)은 슬롯에 넣지 않는다. */
export function photosToSlots(photos: readonly VisitPhoto[] | undefined): PhaseSlots {
  const slots: PhaseSlots = { before: null, during: null, after: null };
  const at: Partial<Record<Phase, string>> = {};
  for (const p of photos ?? []) {
    if (!p.phase) continue;
    if (at[p.phase] && at[p.phase]! > p.createdAt) continue;
    at[p.phase] = p.createdAt;
    slots[p.phase] = { uri: p.fileUrl };
  }
  return slots;
}

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
    .map((p) => ({ key: p.attachmentId, uri: p.fileUrl, takenAt: p.createdAt }));
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

/**
 * 방문 기록을 서버에 반영한다. 방문은 이미 있어야 한다(체크인은 먼저 check-in 을 호출).
 * 부분 실패는 모아서 돌려준다 — 사진 하나 실패로 메모·조치 상태까지 버리지 않는다.
 * 올린 사진은 file 을 뗀 목록으로 돌려준다(다시 저장해도 두 번 올라가지 않게).
 */
export async function saveVisitRecord(args: {
  visitId: string;
  fieldId: string;
  /** 고른 조치 상태. 처음 값과 같으면 보내지 않는다. */
  status: FieldStatus | null;
  initialStatus: FieldStatus | null;
  photos: CheckinPhoto[];
  memo: string;
  /** 이 방문에 연결된 기존 메모 — 바뀌면 지우고 새로 쓴다. 다른 방문의 메모는 넘기지 않는다. */
  initialMemo: TextMemo | null;
}): Promise<{ errors: string[]; photos: CheckinPhoto[] }> {
  const { visitId, fieldId, status, initialStatus, initialMemo } = args;
  const errors: string[] = [];
  const visit = useVisitStore.getState();
  const field = useFieldStore.getState();

  if (status && status !== initialStatus) {
    const r = await field.patchStatus(fieldId, status);
    if (!r.ok) errors.push(`조치 상태: ${r.error}`);
  }

  const photos: CheckinPhoto[] = [];
  let failed = 0;
  let lastError = '';
  for (const p of args.photos) {
    if (!p.file) {
      photos.push(p);
      continue;
    }
    const r = await visit.addPhoto(visitId, p.file);
    if (r.ok) photos.push({ key: p.key, uri: p.uri, takenAt: p.takenAt });
    else {
      failed += 1;
      lastError = r.error;
      photos.push(p);
    }
  }
  if (failed > 0) errors.push(`사진 ${failed}장: ${lastError}`);

  // 메모는 수정 API 가 없어 삭제 + 재생성한다(백로그 §35).
  const nextMemo = args.memo.trim();
  const prevMemo = (initialMemo?.text ?? '').trim();
  if (nextMemo !== prevMemo) {
    if (nextMemo) {
      const r = await field.addTextMemo(fieldId, nextMemo);
      if (!r.ok) errors.push(`메모: ${r.error}`);
      else if (initialMemo) void field.removeTextMemo(fieldId, initialMemo.id);
    } else if (initialMemo) {
      const r = await field.removeTextMemo(fieldId, initialMemo.id);
      if (!r.ok) errors.push(`메모: ${r.error}`);
    }
  }

  return { errors, photos };
}
