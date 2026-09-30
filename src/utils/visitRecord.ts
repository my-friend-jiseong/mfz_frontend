import type { FieldDirectAttachment, VisitPhoto, VisitPhotoPhase } from '@/api';
import type { VisitStatus } from '@/types/entities';
import type { UploadFile } from '@/utils/media';
import { useFieldStore } from '@/stores/fieldStore';
import { useVisitStore } from '@/stores/visitStore';

// 명세 v2 §1.3 — 방문 데이터(결과 상태·사진·메모)는 체크인과 방문 수정에서만 쓴다.
// 서버에는 방문 단위 메모가 없어(백로그 §35) 메모는 현장 메모로 저장하고, 방문과의 연결은
// "방문 시각 이후 MEMO_WINDOW 안에 쓴 가장 최근 메모" 로 판정한다. 같은 현장을 하루에 두 번
// 방문하면 구분하지 못한다 — 서버가 visit_id 를 주면 이 함수만 바꾸면 된다.
const MEMO_WINDOW_MS = 24 * 60 * 60 * 1000;
// 체크인 저장은 방문 생성 직후 메모를 쓰지만, 서버·기기 시계 차이를 흡수할 여유.
const CLOCK_SKEW_MS = 60 * 1000;

export type Phase = VisitPhotoPhase;
export const PHASES: Phase[] = ['before', 'during', 'after'];
export const PHASE_LABEL: Record<Phase, string> = {
  before: '작업 전',
  during: '작업 중',
  after: '작업 후',
};

export interface PhotoSlot {
  uri: string;
  /** 새로 고른 로컬 파일 — 저장할 때 올린다. 없으면 이미 서버에 있는 사진. */
  file?: UploadFile;
}

export interface VisitRecordValue {
  /** null = 고르지 않음(미정). 체크인은 서버 기본값(완료)을 그대로 둔다. */
  status: VisitStatus | null;
  reason: string;
  photos: Record<Phase, PhotoSlot | null>;
  memo: string;
}

export const EMPTY_RECORD: VisitRecordValue = {
  status: null,
  reason: '',
  photos: { before: null, during: null, after: null },
  memo: '',
};

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

/** 현장의 가장 최근 메모 — 체크인 메모 칸을 채운다 (명세 FE-CHK-04). */
export function latestMemo(attachments: readonly FieldDirectAttachment[] | undefined): TextMemo | null {
  if (!attachments) return null;
  let best: TextMemo | null = null;
  for (const a of attachments) {
    if (a.type !== 'text') continue;
    if (!best || a.createdAt > best.createdAt) best = a;
  }
  return best;
}

/** 단계별로 가장 최근 방문 사진. phase 없는 사진은 슬롯에 넣지 않는다. */
export function photosToSlots(photos: readonly VisitPhoto[] | undefined): VisitRecordValue['photos'] {
  const slots: VisitRecordValue['photos'] = { before: null, during: null, after: null };
  const at: Partial<Record<Phase, string>> = {};
  for (const p of photos ?? []) {
    if (!p.phase) continue;
    if (at[p.phase] && at[p.phase]! > p.createdAt) continue;
    at[p.phase] = p.createdAt;
    slots[p.phase] = { uri: p.fileUrl };
  }
  return slots;
}

/**
 * 폼 값을 서버에 반영한다. 방문은 이미 있어야 한다(체크인은 먼저 check-in 을 호출).
 * 부분 실패는 모아서 돌려준다 — 사진 하나 실패로 결과 상태까지 버리지 않는다.
 */
export async function saveVisitRecord(args: {
  visitId: string;
  fieldId: string;
  initialStatus: VisitStatus | null;
  /** 이 방문에 연결된 기존 메모 — 바뀌면 지우고 새로 쓴다. 다른 방문의 메모는 넘기지 않는다. */
  initialMemo: TextMemo | null;
  /** 비교 기준 텍스트. 체크인은 이전 방문 메모를 미리 채워 보여주므로 initialMemo 와 다를 수 있다. */
  memoBaseline?: string;
  value: VisitRecordValue;
}): Promise<{ errors: string[]; value: VisitRecordValue; memo: TextMemo | null }> {
  const { visitId, fieldId, initialStatus, initialMemo, value } = args;
  const errors: string[] = [];
  const visit = useVisitStore.getState();
  const field = useFieldStore.getState();

  if (value.status && (value.status !== initialStatus || value.status === 'other')) {
    const r = await visit.setResult(
      visitId,
      value.status,
      value.status === 'other' ? value.reason.trim() : undefined,
    );
    if (!r.ok) errors.push(`결과 상태: ${r.error}`);
  }

  // 올린 사진은 file 을 떼어 돌려준다 — 같은 값으로 다시 저장해도 두 번 올라가지 않게.
  const photos = { ...value.photos };
  for (const phase of PHASES) {
    const slot = photos[phase];
    if (!slot?.file) continue;
    const r = await visit.addPhoto(visitId, slot.file, phase);
    if (!r.ok) errors.push(`${PHASE_LABEL[phase]} 사진: ${r.error}`);
    else photos[phase] = { uri: slot.uri };
  }

  // 메모는 수정 API 가 없어 삭제 + 재생성한다(백로그 §35).
  let memo = initialMemo;
  const nextMemo = value.memo.trim();
  const prevMemo = (args.memoBaseline ?? initialMemo?.text ?? '').trim();
  if (nextMemo !== prevMemo) {
    if (nextMemo) {
      const r = await field.addTextMemo(fieldId, nextMemo);
      if (!r.ok) errors.push(`메모: ${r.error}`);
      else {
        if (initialMemo) void field.removeTextMemo(fieldId, initialMemo.id);
        memo = latestMemo(useFieldStore.getState().directAttachments[fieldId]);
      }
    } else if (initialMemo) {
      const r = await field.removeTextMemo(fieldId, initialMemo.id);
      if (!r.ok) errors.push(`메모: ${r.error}`);
      else memo = null;
    }
  }

  return { errors, value: { ...value, photos }, memo };
}

/** `기타` 는 서버가 사유 10자를 강제한다(백로그 §37). 저장 전에 알려 부분 저장을 막는다. */
export const OTHER_REASON_MIN = 10;
export function otherReasonShort(value: VisitRecordValue): boolean {
  return value.status === 'other' && value.reason.trim().length < OTHER_REASON_MIN;
}
