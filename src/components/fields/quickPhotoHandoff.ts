import type { UploadFile } from '@/utils/media';

// Quick Photo → 현장 등록 화면(new.tsx)으로 사진 파일을 넘기는 in-memory 핸드오프.
//
// route params 로 파일을 직접 넘기지 않는 이유: web 의 ImagePicker uri 는
// base64 data URI 라 URL·히스토리에 수 MB 가 실릴 수 있음. 좌표(lat/lng)만
// params 로 넘기고, 파일은 여기 적재 후 토큰으로 매칭한다.
//
// 읽기는 idempotent (clear 하지 않음) — StrictMode dev 더블 마운트/이중 initializer
// 호출에도 안전. stale 누수는 토큰 불일치로 차단: 일반 진입은 토큰이 없고,
// 새 Quick Photo 는 토큰·파일을 함께 교체한다.

let pending: { token: string; file: UploadFile } | null = null;
let seq = 0;

/** 사진을 적재하고 매칭 토큰을 돌려준다 — 토큰은 route param 으로 전달. */
export function stashQuickPhoto(file: UploadFile): string {
  const token = `qp${++seq}`;
  pending = { token, file };
  return token;
}

/** 토큰이 현재 적재분과 일치할 때만 파일 반환 — 불일치·미적재는 null. */
export function getQuickPhoto(token: string | undefined): UploadFile | null {
  if (!token || !pending || pending.token !== token) return null;
  return pending.file;
}
