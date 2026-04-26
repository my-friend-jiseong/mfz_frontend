# 백엔드 API 연동 계획 — v0.1

> **작성일**: 2026-04-26
> **출처**: `http://59.21.223.137:28080/api-docs/` Swagger 스펙 → `docs/_swagger.json`
> **비교 대상**: `docs/backend_api_request.md` (프런트가 기대한 v0.2 명세)
> **결론 한 줄**: 인증·외근·방문·현장조회·보고서 generate 5개 도메인은 **곧바로 연동 가능**. fields PATCH/DELETE/status, reports CRUD, fields-direct memo/photo는 **백엔드 미구현(보류)**.

---

## 0. 환경 정보

| 항목 | 값 |
|---|---|
| **API base URL** | `http://59.21.223.137:8080` (스웨거 UI는 28080, API 본체는 **8080**) |
| **Swagger UI** | `http://59.21.223.137:28080/api-docs/` |
| **OpenAPI JSON** | `http://59.21.223.137:28080/api-docs.json` (저장본: `docs/_swagger.json`) |
| **인증** | `Authorization: Bearer {accessToken}` (JWT) |
| **HTTPS** | 미지원(HTTP only). RN/Expo는 iOS ATS · Android cleartext 예외 설정 필요 |
| **관리자 클레임** | JWT payload 에 `role: "admin"` 필요 (`/api/fields` 등) |
| **응답 wrapper** | 스펙상 `{ data: ... }` 명시 안 됨 — **실 호출로 확인 필요** (Phase 0에서 검증) |

---

## 1. 엔드포인트 매핑 표

기호: ✅ 바로 적용 / ⚠️ 경로·필드명 다름 (어댑터 필요) / ❌ 백엔드 미구현 / ➕ 스웨거에만 있음

### 1.1 인증·세션
| 프런트 명세 | 스웨거 실제 | 상태 | 비고 |
|---|---|---|---|
| `POST /auth/signup` | `POST /auth/signup` *또는* `POST /api/system/auth/signup` | ✅ | body 키: `passwordConfirm`, `termsAgreed` (프런트 명세의 `termsVersion/privacyVersion/locationConsent`와 다름) |
| `POST /auth/login` | `POST /auth/login` (또는 `/api/system/auth/login`) | ✅ | |
| `POST /auth/logout` | `POST /auth/logout` (또는 `/api/system/auth/logout`) | ✅ | |
| `POST /auth/refresh` | `POST /auth/refresh` (또는 `/api/system/auth/refresh`) | ✅ | |
| `GET /auth/me` | `GET /api/me` | ⚠️ | 경로 다름. 응답 `{ username }` 만 — 프런트 `User` 타입(id/email/name/role) 부족, 백엔드 확장 필요 |
| — | `POST /api/system/session/activity` | ➕ | 하트비트 (선택 적용) |
| — | `GET /api/system/session/policy` | ➕ | 토큰 TTL·정책 클라이언트 가이드 |
| — | `POST /api/system/session/refresh` | ➕ | `/auth/refresh` 와 동일 기능 추정 |

### 1.2 외근(Trip)
| 프런트 명세 | 스웨거 실제 | 상태 |
|---|---|---|
| `POST /trips` | `POST /api/trips/start` | ⚠️ 경로 다름 |
| `PATCH /trips/{id}/end` | `POST /api/trips/end` | ⚠️ method=POST, **path id 없음** (서버가 active trip 자동 식별 추정) |
| `GET /trips/active` | `GET /api/trips/active` | ✅ |
| `GET /trips` | `GET /api/trips` | ✅ |
| `GET /trips/{id}` | `GET /api/trips/{tripId}` | ✅ |
| `GET /trips/{id}/audit-log` | `GET /api/trips/state-history` | ⚠️ 별도 path, query로 trip 지정 추정 |
| — | `POST /api/trips/offline/queue`, `/flush` | ➕ Feature 8 (오프라인 큐) |
| — | `POST /api/trips/{tripId}/geofences/{arrival,register}` | ➕ Feature 8 |
| — | `POST /api/trips/{tripId}/navigation/{deep-links,optimize}` | ➕ Feature 8 |
| — | `POST /api/trips/{tripId}/official-notice` | ➕ 복무규정 보고 표시 |

### 1.3 방문(Visit)
| 프런트 명세 | 스웨거 실제 | 상태 |
|---|---|---|
| `POST /visits` | `POST /api/visits/check-in` | ⚠️ body: `fieldId`(string!), `siteName`, `location.{lat,lng}` — 프런트 명세는 `lat/lng` flat |
| `PATCH /visits/{id}/status` | `PATCH /api/visits/{visitId}/status` | ✅ |
| `POST /visits/{id}/memos` | `POST /api/visits/{visitId}/memos/text` | ⚠️ path 끝 `/text` |
| `POST /visits/{id}/photos` | `POST /api/visits/{visitId}/photos` | ✅ multipart |
| `POST /visits/{id}/voice-memos` | `POST /api/visits/{visitId}/voice-memos` | ✅ |
| `GET /visits/{id}` | `GET /api/trips/{tripId}/visits/{visitId}` | ⚠️ trip 컨텍스트 필수 (drill-down) |

### 1.4 현장(Field)
| 프런트 명세 | 스웨거 실제 | 상태 |
|---|---|---|
| `GET /fields` (본인 기본) | `GET /api/fields/mine` (본인) + `GET /api/fields` (관리자만) | ⚠️ 분리됨 |
| `GET /fields/{id}` | `GET /api/fields/{fieldId}` | ✅ |
| `POST /fields` | `POST /api/fields` | ✅ |
| `GET /geocode` | `GET /api/fields/address/search` | ⚠️ 통합됨 |
| `GET /geocode/reverse` | — | ❌ 미구현 |
| `PATCH /fields/{id}` | — | ❌ **미구현** |
| `DELETE /fields/{id}` | — | ❌ **미구현** |
| `PATCH /fields/{id}/status` | — | ❌ **미구현** |
| — | `PATCH /api/fields/{fieldId}/assignee` | ➕ 관리자 전용 |
| — | `GET /api/map/fields` | ➕ 지도 마커 (Feature 1·2 = bbox 대체) |
| — | `GET /api/map/current-location-config` | ➕ |

### 1.5 방문 외 직접 첨부 (visit-less)
| 프런트 명세 | 스웨거 실제 | 상태 |
|---|---|---|
| `POST /fields/{id}/memos` | — | ❌ **미구현** |
| `POST /fields/{id}/photos` | — | ❌ **미구현** |
| `POST /fields/{id}/voice-memos` | — | ❌ 미구현 |

### 1.6 보고서(Report)
| 프런트 명세 | 스웨거 실제 | 상태 |
|---|---|---|
| `POST /reports` (사용자 본문 입력) | `POST /api/reports/generate` (multipart, **Gemini AI 자동 생성** + Word 출력) | ⚠️ 성격이 다름 — 백엔드는 자동 생성, 프런트 명세는 수기 입력 |
| `GET /reports` | — | ❌ **미구현** |
| `GET /reports/{id}` | — | ❌ **미구현** |
| `PATCH /reports/{id}` | — | ❌ **미구현** |
| `DELETE /reports/{id}` | — | ❌ **미구현** |

### 1.7 시스템
| 항목 | 스웨거 |
|---|---|
| 헬스체크 | `GET /health` |

---

## 2. Phase 1 — 곧바로 적용 가능 (이번 작업 범위)

다음 14개 엔드포인트는 **현재 코드의 in-memory 목업을 실 API 호출로 전환 가능**. 차이가 있는 항목은 어댑터 함수로 흡수.

### 도메인별
- **인증** (4): `signup`, `login`, `logout`, `refresh` + `GET /api/me`
- **외근** (5): `start`, `end`, `active`, list, detail
- **방문** (5): `check-in`, status, memos/text, photos, voice-memos, drill-down detail
- **현장** (3): `mine`, detail, create + `address/search`
- **보고서** (1): `generate` (UI를 "AI 생성" 흐름으로 전환)
- **지도** (1): `/api/map/fields` (Feature 1·2 마커용)

### 작업 순서 (각 단계는 PR 단위로 분리)
1. **API client 레이어 신설** (`src/api/`)
   - `client.ts`: `fetch` 래퍼 — base URL, JSON 직렬화, Bearer 자동 첨부, 401 → refresh 재시도, 에러 정규화
   - `endpoints/auth.ts`, `trips.ts`, `visits.ts`, `fields.ts`, `reports.ts`, `map.ts`
   - `.env`: `EXPO_PUBLIC_API_BASE_URL=http://59.21.223.137:8080`
   - Android `cleartextTrafficPermitted=true`, iOS `NSAppTransportSecurity` 예외 (HTTP)
2. **토큰 저장**
   - access: 메모리(zustand) / refresh: `expo-secure-store` (iOS Keychain · Android EncryptedSharedPreferences)
   - 앱 부팅 시 refresh → access 재발급 → `/api/me` 로 user 복원 → `/api/trips/active` 로 진행 외근 복원
3. **`authStore` 실 연동**
   - mockSeed 의존 제거. `signup/login/logout/refresh` 호출
   - `User` 타입 확장: `email`, `name`, `role` 추가 (백엔드 `/api/me` 응답 확장 협의 — 현재 `username` 만 옴 → **백엔드 보강 요청 항목**)
4. **`tripStore` 실 연동**
   - `start/end/active/list/detail` 호출. `activeTripId` 부팅 동기화
5. **`fieldStore` 실 연동**
   - `mine` 으로 본인 현장 목록, `create` 로 등록, `address/search` 로 주소 자동완성
   - **읽기 전용으로 시작** — PATCH/DELETE/status 백엔드 추가 전까지 UI에서 수정 버튼 비활성/숨김
6. **`visitStore` 실 연동**
   - `check-in`, `status`, `memos/text`, `photos`(multipart), `voice-memos`(multipart)
7. **`reportStore` 재설계**
   - 자유 작성 → **"방문 선택 → AI 생성 → 미리보기 → 다운로드"** 흐름으로 전환 (multipart 입력으로 visit/photo 첨부)
   - 목록·상세·수정·삭제 화면은 백엔드 보강 전까지 보류 메시지

### 어댑터로 흡수할 차이점 (코드에서 변환)
- `/visits/check-in` body: `{ fieldId: String(field.id), location: { lat, lng } }` 로 직렬화
- `fieldId`가 string인 점 — 응답을 number로 캐스팅
- `/api/me` 빈약한 응답 — 부족한 필드는 `null` 처리, 백엔드 보강 후 제거할 임시 코드임을 주석으로 표시 (이건 통합 끝까지 필요한 정상 어댑터가 아니라 **임시 보강 대기**)
- `PATCH /trips/{id}/end` 와 달리 `POST /api/trips/end` — store API는 그대로 유지하고 클라이언트 함수가 active trip 식별

---

## 3. Phase 2 — 백엔드 협의·보강 필요 (보류)

### 3.1 백엔드에 추가 요청해야 할 엔드포인트
1. `PATCH /api/fields/{fieldId}` — 현장 수정 (주소·좌표·상세주소)
2. `PATCH /api/fields/{fieldId}/status` — 현장 상태 전환 (`pending→in_progress→done`)
3. `DELETE /api/fields/{fieldId}` — soft delete + `?force=true` 옵션
4. `POST /api/fields/{fieldId}/memos`, `/photos`, `/voice-memos` — **방문 없이 현장 직접 첨부** (프런트 `TextMemo.visitId: null` 케이스, 시연 시 핵심 UX)
5. **Reports CRUD**: `GET /api/reports`, `GET /api/reports/{id}`, `PATCH /api/reports/{id}`, `DELETE /api/reports/{id}` — `generate` 만 있으면 작성 후 다시 못 봄
6. `GET /api/me` 응답 확장: `email`, `name`, `role`, `createdAt` 포함
7. `GET /api/fields` 의 bbox 쿼리 (지도 뷰포트) — `/api/map/fields` 가 이를 대체할 수도 있음, 응답 스펙 확인 필요

### 3.2 Phase 1 도중 검증해야 할 가정
- 응답 wrapper `{ data: ... }` 실제 형태 (스펙엔 없음 → curl 한 번 호출로 확인)
- `/auth/login` 응답 shape (accessToken/refreshToken 필드명)
- `/api/visits/check-in` 응답에 visit.id 가 어떤 형식(number/string)
- multipart 필드명 (`file`? `photo`? `image`?)
- 401 응답 시 access 만료와 refresh 만료 구분 가능 여부

→ Phase 1 작업 시작 직전에 **5분짜리 curl smoke test** 로 한 번에 확인.

### 3.3 Feature 8 (외근 자동화) — 추후
오프라인 큐, geofence 자동 도착, 길안내 딥링크, 동선 최적화는 Phase 1 완료 후 Feature 8 작업 시 합류.

---

## 4. 다음 단계 (즉시 실행)

1. ✅ 이 계획서 사용자 검토 → 합의
2. ⬜ **Phase 0 — smoke test**: `/auth/signup` → `/auth/login` → `/api/me` → `/api/trips/start` → `/api/trips/active` → `/api/trips/end` 순서로 curl 호출, 실 응답 본문 캡처해 `docs/_swagger_responses.md` 에 기록
3. ⬜ **API client 레이어** PR — 빈 endpoints 모듈 + 토큰 저장 + interceptor (도메인 store 변경 없음)
4. ⬜ **authStore 연동** PR — 첫 번째 실 동작 (login/logout)
5. ⬜ tripStore → fieldStore → visitStore → reportStore 순으로 PR 분리

---

## 5. 변경 이력
| 날짜 | 내용 |
|---|---|
| 2026-04-26 | 초안 — 스웨거 41개 vs 프런트 명세 33개 매핑. Phase 1(14개 즉시) / Phase 2(7개 백엔드 보강 후) 분리 |
