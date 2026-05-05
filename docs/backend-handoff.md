# 백엔드 보충 가이드라인 — 일가요(mfz) 프론트엔드 선행 개발 항목

> **갱신일**: 2026-05-06
> **대상**: 백엔드 팀
> **컨텍스트**: 일가요 프로젝트는 "프런트엔드가 contract 를 정해 선행 개발 → 백엔드가 부족한 부분만 보충" 정책으로 진행. 본 문서는 오늘(2026-05-06) 프론트에서 머지·진행한 작업 중 백엔드 활성화·보강이 필요한 항목을 모았음.
> **응답 contract 표준**: 모든 4xx/5xx 는 Phase 7 단일 shape `{ code, message, fields?, details? }` (이미 적용됨).

---

## 0. 한눈에 보기

| # | 항목 | 백엔드 작업 | 우선순위 | PR / 커밋 |
|---|---|---|---|---|
| 1 | `/api/fields/address/search` 활성화 (카카오 Geocoder) | endpoint 활성화 + Kakao REST API key | 🔴 critical | PR #6 (`efbc027`) |
| 2 | `/api/system/session/activity` 동작 확인 | 응답 shape 명세 + 동작 확인 | 🟡 중간 | PR #5 PR-A (`d441852`) |
| 3 | `refresh_token_superseded` / `all_sessions_revoked` 발화 시점 | 정책 문서화 | 🟡 중간 | PR #5 PR-A |
| 4 | `error.fields` 발화 (옵션) | validation 라우트에 `fields` 채우기 | 🟢 낮음 | PR #5 PR-E (`6bbee71`) |
| 5 | 방문 status enum (영문 정합화) | 영문 enum 합의 | 🔴 critical (다음 작업) | 미시작 |
| 6 | Geofence / Navigation deep-link / state-history 응답 shape | shape 명세 | 🟡 중간 (다음 작업) | 미시작 |

---

## 1. 🔴 카카오 Geocoder — `/api/fields/address/search` (즉시 critical)

### 프론트엔드 상태
- `fields/new.tsx` 의 mock 5개 하드코딩이 **제거**되고 실 endpoint 호출로 전환됨 (PR #6 / 커밋 `efbc027`).
- 즉, **이 endpoint 가 작동하지 않으면 사용자가 새 현장을 등록할 수 없습니다**.

### 백엔드가 해야 할 것
1. Kakao Local REST API key 환경변수 설정 (서버사이드 보호).
2. endpoint 활성화 — query param `keyword` 받아 카카오 호출 → 응답 정규화.
3. (선택) rate limit 및 캐시 (반복 키워드 절약).

### 합의된 응답 contract (이미 typed)
[`src/api/endpoints/fields.ts`](../src/api/endpoints/fields.ts) 의 `AddressSearchResponse`:

```ts
GET /api/fields/address/search?keyword=<string>

200 OK:
{
  query: string,
  provider: {
    primary: string,                  // "kakao"
    secondary: string,                // 보조 (있으면)
    retryOnFailure: number,           // 재시도 횟수
    manualCoordinateFallback: boolean // 수동 입력 fallback 허용 여부
  },
  items: Array<{
    roadAddress: string,
    jibunAddress: string,
    buildingName: string | null,
    sido: string,
    sigungu: string,
    zonecode?: string,
    lat: number,
    lng: number
  }>,
  emptyMessage: string | null         // 0건일 때 사용자 표시 메시지 (없으면 클라가 기본 안내)
}

503 Service Unavailable:
{
  code: "kakao_provider_unavailable",
  message: "주소 검색 서비스가 일시적으로 불안정합니다. 잠시 후 다시 시도해주세요"
}
```

### 프론트 동작
- 키워드 ≥ 2자 → 300ms 디바운스 → 호출.
- `items` 리스트 렌더 (도로명 우선, 지번 보조).
- 빈 결과: `emptyMessage` 또는 기본 안내 + "좌표 직접 입력" 링크 노출.
- 503 시: 일시 장애 안내 박스 + 수동 좌표 입력 폼 자동 펼침.

### QA 시나리오
- 정상 키워드 (예: "해운대 우동") → items > 0 응답 확인.
- 의미 없는 키워드 (예: "asdfasdf") → items=[] + emptyMessage 적정.
- 카카오 장애 시뮬레이션 → 503 + 표준 코드 응답.

---

## 2. 🟡 세션 idle activity ping — `/api/system/session/activity`

### 프론트엔드 상태
- AppState foreground 진입 시 + 5분 주기로 호출 ([`src/stores/sessionActivity.ts`](../src/stores/sessionActivity.ts)).
- 인증 상태 아니면 호출 skip.
- 응답 무관 fire-and-forget (errors are silently ignored).

### 백엔드가 해야 할 것
1. endpoint 가 실제로 작동하는지 확인.
2. 응답 shape 명세 (현재 클라는 `request<unknown>` 으로 받음). 보통 `204 No Content` 면 충분, 또는 `{ ok: true, refreshedUntil: ISO8601 }` 같은 정보 응답.
3. 동작 정의:
   - 호출 시 `sessionIdleMinutes` 정책 (`/api/system/session/policy` 참조)의 idle timer 가 reset 되는지?
   - 인증 토큰이 만료된 경우 401 반환 → 클라이언트가 일반 401 흐름 (refresh) 으로 흡수.

### 추후 클라이언트 typed 화
응답 shape 합의되면 [`src/api/endpoints/system.ts:26`](../src/api/endpoints/system.ts#L26) 의 `request<unknown>` 을 typed 로 교체.

---

## 3. 🟡 보안 코드 발화 시점 정책

### 프론트엔드 상태
PR #5 PR-A (`d441852`) — refresh single-flight 와 hydrate 양쪽에서 다음 두 코드 분기 처리 완료:

| code | 클라이언트 동작 |
|---|---|
| `refresh_token_superseded` | 로컬 storage refresh 가 우리가 시도한 것과 다르면 **한 번만** 그것으로 재시도. 그래도 실패 시 보안 안내 모달 + 강제 로그아웃 ("다른 기기에서 로그인되었습니다"). |
| `all_sessions_revoked` | 즉시 강제 로그아웃 + 보안 경고 모달 ("보안 경고 — 모든 세션이 종료되었습니다"). |

### 백엔드가 해야 할 것
이 두 코드를 **언제 어떤 조건에서 emit 하는지** 명시 (이미 명세 있으면 OK):

- `refresh_token_superseded`:
  - rotation policy 상 supersede window (`refreshSupersedeWindowMs`) 내 같은 refresh 가 두 번 사용된 경우?
  - 다른 디바이스에서 같은 user 의 refresh 가 회전된 직후?
- `all_sessions_revoked`:
  - refresh reuse 감지 시 (`refreshReuseRevokesAllSessions: true`)?
  - 관리자 forced logout?
  - 비밀번호 변경?

→ 이 매핑이 명확해야 사용자에게 정확한 안내가 가능.

---

## 4. 🟢 `error.fields` 폼별 inline error (옵션, 미래 대비)

### 프론트엔드 상태
- Phase 7 contract 의 `error.fields: Record<string, string>` 를 흡수할 헬퍼 [`applyFieldErrors`](../src/api/errors.ts) 가 이미 export 되어 있음.
- 현재 어떤 폼도 사용하지 않음 (백엔드가 아직 fields 를 채우지 않으므로).

### 백엔드가 (원할 때) 해야 할 것
사용자에게 **폼 필드별 inline error** 를 자연스럽게 보여주고 싶은 라우트에서 응답 body 에 `fields` 추가:

```jsonc
400 Bad Request:
{
  "code": "validation_failed",
  "message": "입력값을 확인해주세요",
  "fields": {
    "email": "이메일 형식이 올바르지 않습니다",
    "password": "비밀번호는 10자 이상이어야 합니다"
  }
}
```

### 우선순위
당장 critical 아님. 회원가입 / 보고서 작성 / 현장 등록 폼 검증 UX 개선 시점에 백엔드 추가 검토.

---

## 5. 🔴 방문 status / 메모 enum 정합 (다음 작업 — 곧 시작)

### 프론트엔드 현재 상태
- [`src/api/endpoints/visits.ts:3-5`](../src/api/endpoints/visits.ts#L3-L5) 에 한글 enum 으로 시도 중. 백엔드가 거부할 가능성 있는 구조.
- 메모 body 필드명은 smoke 검증된 `text` 로 확정.

### 프론트엔드가 정할 contract (다음 작업에서 도입 예정)
**영문 enum** 으로 표준화 + 클라 측 한국어 라벨 매핑 분리:

```ts
type VisitStatus =
  | 'normal'             // 완료
  | 'absent'             // 부재
  | 'refused'            // 수취거절
  | 'unknown_address'    // 주소불명
  | 'revisit_required'   // 재방문필요
  | 'other';             // 기타 (statusReason 필수, 10자 이상)
```

### 백엔드가 해야 할 것
1. 위 영문 enum 합의 (또는 다른 영문 값을 제안 — 어느 쪽이든 영문 권장).
2. PATCH `/api/visits/:id/status` 가 영문 값을 받도록 정합화.
3. 응답의 `resultStatus` (영문) / `status` (한글 표시값) 분리 유지 (현재 그대로).
4. `code: visit_status_invalid`, `code: visit_status_reason_required` (10자 미만) 는 Phase 7 에 이미 포함됨.

---

## 6. 🟡 외근 자동화 응답 shape (다음 작업 — 곧 시작)

### 프론트엔드 상태
- API 함수 선언은 있음 ([`src/api/endpoints/trips.ts:151-213`](../src/api/endpoints/trips.ts#L151-L213)).
- 응답은 모두 `request<unknown>` — UI 에서 못 씀.

### 프론트엔드가 정할 contract (다음 작업에서 도입 예정)

#### 6a. Geofence 등록 / 도착
```ts
POST /api/trips/:tripId/geofences/register
body: { fieldId, lat, lng, radiusMeters? }       // 기본 150m
→ 200: { geofenceId: string, registeredAt: ISO8601 }

POST /api/trips/:tripId/geofences/arrival
body: { fieldId, arrivedAt?: ISO8601 }
→ 200: { acknowledged: true, suggestCheckIn: boolean }
```

#### 6b. Navigation deep-links
```ts
POST /api/trips/:tripId/navigation/deep-links
body: { fieldId, lat?: number, lng?: number }
→ 200: {
    kakao: string,    // kakaomap://route?...
    naver: string,    // nmap://route/...
    google: string    // https://www.google.com/maps/dir/...
  }
```

#### 6c. State history (이미 일부 통합)
```ts
GET /api/trips/state-history?tripId=...
→ 200: {
    items: Array<{
      tripId: string,
      eventType: 'started' | 'ended' | 'paused' | 'resumed' | 'visit_added' | ...,
      occurredAt: ISO8601,
      reason: string | null,
      changedBy: string  // userId
    }>,
    pagination: { page, limit, total, hasNext }
  }
```

### 백엔드가 해야 할 것
- 위 contract 검토 / 협의 / 구현.
- 응답 shape 확정되면 frontend 에서 `request<unknown>` → typed 로 일괄 교체.

---

## 7. 부수 — 미typed 응답 정리

다음 응답들이 `unknown` / `unknown[]` 으로 받아지고 있음. 백엔드 명세 합의 후 frontend 가 typed 인터페이스 작성:

| 위치 | 현재 | 필요 |
|---|---|---|
| `Report.analysis` ([reports.ts:105](../src/api/endpoints/reports.ts#L105)) | `unknown` | AI 분석 결과 schema (model, tokens, sections 등) |
| `FieldDetail.recentVisits` ([fields.ts:61](../src/api/endpoints/fields.ts#L61)) | `unknown[]` | RecentVisitItem (visit 요약) |
| `FieldList.appliedFilter` ([fields.ts:35](../src/api/endpoints/fields.ts#L35)) | `unknown` | 적용된 필터 echo (필요 시) |
| `Trips.offlineQueue/flush` ([trips.ts:191-199](../src/api/endpoints/trips.ts#L191-L199)) | `unknown` | 큐 적재/flush 응답 (현재 frontend 미사용) |
| `system.sessionActivity` ([system.ts:26](../src/api/endpoints/system.ts#L26)) | `unknown` | 204 또는 `{ refreshedUntil }` 류 |

---

## 8. 환경변수 요약

프론트:
- `EXPO_PUBLIC_API_BASE_URL` — 기본 `https://ilgayo.co.kr`
- `EXPO_PUBLIC_KAKAO_JS_KEY` — 카카오 지도 SDK (지도 렌더용; 검색은 위 §1 백엔드 경유)
- `EXPO_PUBLIC_SENTRY_DSN` — (선택) Sentry 운영 활성

백엔드 측 환경변수 (예상):
- `KAKAO_REST_API_KEY` — §1 카카오 Geocoder 호출용
- 세션 정책 / refresh rotation window 등 — `/api/system/session/policy` 응답으로 노출 중

---

## 9. Phase 7 응답 shape 재확인

이 모든 항목의 에러 응답은 다음 단일 shape 를 따름:

```ts
{
  code: string,                    // snake_case 분기 키
  message: string,                 // 사용자 표시용 한국어
  fields?: Record<string, string>, // 폼별 inline error (선택)
  details?: Record<string, unknown> // confirm 패턴 등 부가 정보 (선택)
}
```

신규 코드 발화 시 위 shape 만 지키면 frontend 의 `ApiError` 자동 흡수됨.
사용자 친화 한국어는 백엔드의 `message` 가 1차 소스 (frontend `ERROR_MESSAGES` 매핑은 안전망).

---

## 변경 이력

- **2026-05-06**: 최초 작성. 오늘 머지된 PR #4·#5·#6 / 진행 중 작업 / 다음 작업 (방문 enum / geofence) 정리.
