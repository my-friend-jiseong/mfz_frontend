// API base URL — .env 의 EXPO_PUBLIC_API_BASE_URL 우선, 없으면 운영 도메인.

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ??
  'https://ilgayo.co.kr';

// 백엔드는 파일 URL(fileUrl·outputFileUrl 등)을 '/storage/...' 상대 경로로 내려준다.
// 네이티브 Image/Linking 은 상대 경로를 로드하지 못해 조용히 빈 칸이 되므로
// (2026-06-05 "안 보이는 사진" 버그 — 현장 상세·외근 리뷰만 절대화가 빠져 있었음)
// 렌더/오픈 직전에 항상 이걸로 절대화한다. 이미 절대 URL 인 과거·외부 데이터는 통과.
export function toAbsoluteFileUrl(url: string): string;
export function toAbsoluteFileUrl(url: string | null | undefined): string | null;
export function toAbsoluteFileUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith('http') ? url : `${API_BASE_URL}${url}`;
}

export const DEFAULT_TIMEOUT_MS = 15000;
