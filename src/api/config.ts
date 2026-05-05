// API base URL — .env 의 EXPO_PUBLIC_API_BASE_URL 우선, 없으면 운영 도메인.

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ??
  'https://ilgayo.co.kr';

export const DEFAULT_TIMEOUT_MS = 15000;
