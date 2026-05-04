# 웹 배포 가이드 (Vercel)

이 문서는 `mfz-frontend` Expo Router 앱을 정적 웹 번들로 빌드해 Vercel 에 배포하기 위한
설정과 활성화 절차를 정리한다.

## 1. 현재 코드에 들어간 것

- `package.json` → `build:web` 스크립트 (`expo export -p web` → `dist/`).
- [vercel.json](../vercel.json) → 빌드 명령, 출력 폴더, SPA fallback rewrite, 정적 캐시 헤더.
- [.github/workflows/ci.yml](../.github/workflows/ci.yml) → push / PR 마다 타입체크 + 웹 빌드 검증, 산출물 아티팩트 업로드.

CI 는 지금 바로 동작한다. **배포(Vercel)** 는 아래 활성화 절차를 거쳐야 켜진다.

## 2. 백엔드 HTTPS 종단점 — 준비 완료

- 운영 도메인: `https://ilgayo.co.kr` (Swagger: `https://ilgayo.co.kr/api-docs/`).
- 프런트 코드 반영 완료:
  - [src/api/config.ts](../src/api/config.ts) fallback `https://ilgayo.co.kr`
  - [app.json](../app.json) iOS `NSExceptionDomains` / Android `usesCleartextTraffic` 제거 (ATS 기본 정책 그대로 — cleartext 호출 전부 차단)

## 3. Vercel 활성화 절차

### 3‑1. 프로젝트 연결

1. <https://vercel.com> 가입 (GitHub 로그인). Hobby 플랜 = 무료.
2. **Add New → Project** → 이 저장소 import.
3. Framework Preset: **Other** (자동으로 `vercel.json` 인식).
4. Build / Output 설정은 비워둔다 — `vercel.json` 이 우선한다.

### 3‑2. 환경변수 등록 (Vercel 대시보드)

Project Settings → Environment Variables 에 아래를 등록.
세 환경(Production / Preview / Development) 모두 체크.

| Key | 값 | 비고 |
|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | `https://ilgayo.co.kr` | 백엔드 HTTPS URL |
| `EXPO_PUBLIC_KAKAO_JS_KEY` | (Kakao Developers 의 JS 키) | Kakao 콘솔 Web 플랫폼에 Vercel 도메인 등록 필수 |

> Kakao 지도가 새 도메인에서 로드되려면 카카오 개발자 콘솔 → 내 애플리케이션 → 플랫폼 → Web 에
> Vercel 이 발급한 production 도메인과 `*.vercel.app` preview 도메인을 등록해야 한다.

### 3‑3. 자동 배포 동작

- `main` 브랜치 push → **production** 자동 배포 (`<project>.vercel.app` 또는 커스텀 도메인).
- 그 외 브랜치 / PR → **preview** 배포, PR 코멘트에 고유 URL 이 자동으로 달림.

### 3‑4. (선택) 커스텀 도메인 연결

Project Settings → Domains 에서 구입한 도메인 추가 → DNS A/CNAME 안내대로 설정.
Vercel 이 Let's Encrypt 인증서를 자동 발급한다.

## 4. CI 에 GitHub Secrets / Variables 등록 (선택)

`.github/workflows/ci.yml` 의 빌드 스텝이 다음 키를 참조한다.
값이 없어도 빌드는 통과하지만 (Kakao 지도 등 일부 기능이 빈 키로 빌드됨),
PR 미리보기에서 동작을 보려면 등록한다.

- Repository **Variables**: `EXPO_PUBLIC_API_BASE_URL`
- Repository **Secrets**: `EXPO_PUBLIC_KAKAO_JS_KEY`

GitHub → Settings → Secrets and variables → Actions 에서 등록.

## 5. 로컬에서 동일한 빌드 재현

```bash
npm run build:web
npx serve dist          # 정적 서버로 확인
```

CI 에서 실패하는 빌드는 위 두 명령으로 동일 재현이 가능하다.
