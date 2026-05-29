import type { Field, Visit } from '@/types/entities';
import { VISIT_STATUS_LABEL } from '@/types/entities';
import type { FieldDirectAttachment } from '@/api';
import { fmtTime } from './datetime';

// AI 초안용 notes 의 초기값을 구성. tripId 의 visit 결과 + 각 field 의 직접 메모 + 시각.
// 사용자가 이 위에서 수정/증감 — 빈 textarea 에서 시작하던 회로 차단.
//
// 출력 예:
//
//   [09:12] OOO로 264 — 완료
//   - 가로수 정비 완료, 보도블록 일부 손상
//
//   [09:55] △△로 18 — 부재
//
// 매우 길어질 수 있어 호출처에서 maxLength(50000) 로 잘림 — 한도 우려 X.

interface PrefillInput {
  visits: ReadonlyArray<Visit>;
  getField: (fieldId: string) => Field | undefined;
  // fieldId → directAttachments. text 메모만 사용.
  attachmentsByField: Record<string, FieldDirectAttachment[] | undefined>;
}

export function buildReportNotesFromTrip({
  visits,
  getField,
  attachmentsByField,
}: PrefillInput): string {
  if (visits.length === 0) return '';
  // visit 시각 순.
  const sorted = [...visits].sort((a, b) => a.visitedAt.localeCompare(b.visitedAt));
  const sections: string[] = [];
  for (const v of sorted) {
    const field = getField(v.fieldId);
    const addr = field?.address ?? '알 수 없는 현장';
    const time = fmtTime(v.visitedAt);
    const statusLabel = VISIT_STATUS_LABEL[v.status];
    const head = `[${time}] ${addr} — ${statusLabel}`;
    const memos = (attachmentsByField[v.fieldId] ?? [])
      .filter((a) => a.type === 'text' && a.text)
      .map((a) => `- ${a.text}`);
    sections.push(memos.length > 0 ? `${head}\n${memos.join('\n')}` : head);
  }
  return sections.join('\n\n');
}
