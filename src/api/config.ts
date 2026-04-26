// API base URL — .env 의 EXPO_PUBLIC_API_BASE_URL 우선, 없으면 데모 서버.
//
// 백엔드는 HTTP 만 지원 (HTTPS 미지원). 운영 배포 전 HTTPS 전환 필요.
//   - Android: app.json `expo.android.usesCleartextTraffic = true` 설정 필요
//   - iOS: 기본 ATS 가 HTTP 차단, app.json `expo.ios.infoPlist.NSAppTransportSecurity` 예외 필요

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ??
  'http://59.21.223.137:28080';

export const DEFAULT_TIMEOUT_MS = 15000;
