import type { FieldReport } from '@/types/entities';

/**
 * 미작성 현장 보고 — 사진도 설명도 하나 없는 것 (명세 v2 FE-RPT-13).
 * 서버에 '미작성' 상태가 따로 없어 내용으로 판정한다. `이 현장은 나중에 채우기` 로 넘긴 현장,
 * 스캐폴드만 되고 아직 손대지 않은 현장이 여기에 해당한다.
 */
export function isFieldReportEmpty(fr: FieldReport): boolean {
  return (
    !fr.beforePhotoUrl &&
    !fr.pendingPhotoUrl &&
    !fr.afterPhotoUrl &&
    !fr.beforePhotoCaption?.trim() &&
    !fr.pendingPhotoCaption?.trim() &&
    !fr.afterPhotoCaption?.trim()
  );
}
