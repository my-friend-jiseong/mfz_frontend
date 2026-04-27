# 백엔드 실응답 캡처 — Phase 0 + Phase 2 smoke test

> **수집일**: 2026-04-26 (Phase 0) / 2026-04-27 (Phase 2 — 백엔드 §0.2 보강 검증)
> **방법**: 테스트 계정으로 풀 시나리오 curl 호출, 응답 본문 그대로 기록.
> **목적**: 스웨거 스펙에 누락된 응답 shape·필드명·enum 값을 코드로 옮기기 전 확정.
>
> **Phase 2 검증 결과 요약**:
> - ✅ `lat/lng` 응답 포함 (mine/detail/POST 모두)
> - ✅ `roadAddress/jibunAddress/detailAddress + sido/sigungu` 분리 응답
> - ✅ Fields 라이팅 5종 + 직접 첨부 3종 모두 동작
> - ✅ Reports CRUD 5종 + 공유 링크 2종 모두 동작
> - ⚠️ 4xx 에러 일관성은 **부분 반영** (자세한 내용 §7 참조)
> - ⚠️ Reports 응답 shape 가 endpoint 별 비일관 (자세한 내용 §8 참조)
>
> **Phase 3 검증 결과 (2026-04-27, [docs/archive/backend_phase3_complete.md](archive/backend_phase3_complete.md) 반영)**:
> - ✅ 비밀번호 정책 8자 (회원가입 잠금 제거)
> - ✅ `creator.name` 사용자 이름으로 정상 반환 (UUID 그대로 노출 버그 해소)
> - ✅ `GET /api/fields/mine` items 에서 `userId` 제거 → **`assigneeUserId` 단일** (POST 응답으로 확인)
> - ✅ `GET /api/fields/address/search` 실제 결과 — `buildingName` 포함
> - ✅ Reports `share` 응답에 `expiresAt`/`shareExpiresAt` 추가 (기본 7일)
> - ✅ **`DELETE /api/reports/{id}/share`** 신규 — 공유 해제
> - ✅ 첨부 응답에 schema 명시 (`VisitPhotoAttachment`/`VisitAudioAttachment`/`FieldPhotoAttachment`/`FieldAudioAttachment`/`VisitTextMemoAttachment` + `OfficialNoticeResponse`/`ReportGenerateSuccessData`)
> - ✅ `POST /api/reports/generate` Bearer 필수 + multipart body (`notes` 필수, `before_photo`/`after_photo` 등) + 응답 `{ success, message, data: ReportGenerateSuccessData }`

---

## 0. 환경 — 실측 정정

| 항목 | 스웨거 | **실제** |
|---|---|---|
| API base URL | `http://59.21.223.137:8080` | **`http://59.21.223.137:28080`** (스웨거 server URL은 잘못됨, 28080이 모든 것의 정답) |
| 응답 wrapper | (스펙 없음) | **`{ data: ... }` 없음** — flat JSON. 페이지네이션은 `{ items, pagination, emptyMessage, ... }` 커스텀 wrapper |
| Bearer | `Authorization: Bearer ...` | 동일 ✅ |

---

## 1. 인증

### 1.1 `POST /auth/signup` — 201
요청 body 키: `email`, `password`, `passwordConfirm`, `name`, `termsAgreed: true`
```json
{
  "user": {
    "id": "6c478386-f20d-4d8e-bc68-cf8f6394f377",
    "email": "...",
    "name": "njs smoke",
    "role": "user",
    "createdAt": "2026-04-26T11:47:53.915Z"
  },
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "tokenType": "Bearer",
  "sessionId": "f1546f27-..."
}
```
- **`user.id`는 UUID string** (number 아님)
- `role`: 백엔드 스펙상 존재하지만 본 서비스는 단일 Actor (필드 워커) 라 분기에 사용하지 않음

### 1.2 `POST /auth/login` — 200
signup과 동일 + `expiresIn: "1h"` 추가.

### 1.3 `POST /auth/logout` — 200
요청 body: `{ refreshToken }`
응답: `{ revoked: true, sessionId, message }`

### 1.4 `GET /api/me` — 200
**스웨거 스펙은 `{ username }` 만 명시 — 실제로는 풀 user 반환** (백엔드 보강 불필요!)
```json
{
  "id": "uuid",
  "email": "...",
  "name": "...",
  "role": "user",
  "createdAt": "..."
}
```

### 1.5 `GET /api/system/session/policy` — 200 (인증 불필요)
```json
{
  "client": { "idleLockMinutes": 15, "backgroundReauthAfterMinutes": 15, "secureStorage": {...}, "rootDetectionRecommended": true, ... },
  "server": { "accessTokenExpiresIn": "1h", "refreshTokenExpiresIn": "14d", "sessionIdleMinutes": 15, "refreshRotation": true, "refreshReuseRevokesAllSessions": true, "refreshSupersedeWindowMs": 10000 }
}
```

---

## 2. 외근

### 2.1 `POST /api/trips/start` — 201
body: `{ startLocation?: { lat, lng } }`
```json
{
  "tripId": "trip-1777204122593",
  "startedAt": "2026-04-26T11:48:42.593Z",
  "banner": { "isActive": true, "tripId": "...", "elapsedHHMM": "00:00", "message": "외근 중 · 00:00 · 탭하여 상세보기" },
  "toast": "외근이 시작되었습니다"
}
```
- **`tripId`는 `"trip-{epoch}"` 커스텀 string** (number 아님, UUID 아님)
- 백엔드가 **UI용 banner/toast 텍스트를 미리 만들어 줌** — 클라이언트는 그대로 표시 가능

### 2.2 `POST /api/trips/end` — 200 / 409
body: `{ forceEndWithoutVisit?: true }` (방문 0건일 때만 필요)
- 방문 0건 + 플래그 없음 → **409 `{ error, code: "confirm_required_zero_visits" }`** — 클라이언트가 confirm 모달 표시 후 재호출
- 성공 200: `{ tripId, endedAt, banner, toast }` (banner는 비활성 상태)

### 2.3 `GET /api/trips/active` — **항상 200**
**없을 때 204가 아니라 200 + `isActive: false`** — 프런트 명세와 다름.
```json
// 진행중 없음
{ "isActive": false, "tripId": null, "elapsedHHMM": null, "message": null }
// 진행중
{ "isActive": true, "tripId": "...", "elapsedHHMM": "00:30", "startedAt": "...", "message": "외근 중 · 00:30 · ...", "lifecycleStatus": "active", "reportNoticeRequired": false, "reportNoticeMessage": null }
```

### 2.4 `GET /api/trips` — 200
```json
{
  "items": [
    { "tripId", "tripDate": "YYYY-MM-DD", "startedAt", "endedAt": null,
      "durationHHMM": "00:00", "visitCount": 0, "siteCount": 0,
      "status": "normal", "lifecycleStatus": "active", "abnormalTag": null }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 1, "hasNext": false },
  "emptyMessage": null
}
```

### 2.5 `GET /api/trips/{tripId}` — 200
```json
{
  "tripId": "...", "userId": "...", "startedAt", "endedAt": null,
  "durationHHMM": "00:00", "visitCount": 1, "approximateDistanceKm": 0,
  "status": "normal", "lifecycleStatus": "active",
  "timeline": [
    { "visitId", "siteName": "현장-field-...", "visitedAt",
      "resultStatus": "normal",
      "attachmentCounts": { "text": 0, "photo": 0, "audio": 0 },
      "memoPreview": "" }
  ],
  "reportEntryPoint": { "label": "이 외근으로 보고서 작성", "createUrl": "/api/reports/generate?trip_id=..." }
}
```

---

## 3. 방문

### 3.1 `POST /api/visits/check-in` — 201
body: `{ fieldId: string, siteName?: string, location?: { lat, lng } }`
```json
{
  "tripId": "trip-...",
  "visitId": "visit-1777204206059",
  "fieldId": "field-...",
  "visitedAt": "2026-04-26T11:50:06.059Z",
  "message": "방문 기록 화면으로 진입했습니다"
}
```
- **`visitId`도 `"visit-{epoch}"` 커스텀 string**
- 진행중 외근 없으면 409

### 3.2 `GET /api/trips/{tripId}/visits/{visitId}` — 200
```json
{
  "tripId", "visitId",
  "siteName": "현장-field-...",
  "visitedAt", "resultStatus": "normal",
  "status": "완료",
  "statusReason": null,
  "memo": "",
  "attachmentCounts": { "text": 0, "photo": 0, "audio": 0 },
  "attachments": []
}
```
- **두 개의 status 필드**: `resultStatus` (영문 enum: `normal` 등) + `status` (한글 enum: `완료` 등)
- **체크인 직후 기본값은 `완료` / `normal`** — 프런트 명세는 `재방문필요` 였음. **불일치, 백엔드 정책 따라가야**
- `memo` 가 단일 string (배열 아님) — 메모 여러 개 추가 시 어떻게 누적되는지 추가 검증 필요

### 3.3 `POST /api/visits/{visitId}/memos/text` — 200 (확정)
body 필드명: **`text`** (확정. 후속 smoke test 에서 `body`/`memo`/`note` 모두 거부됨)
```json
{
  "visitId": "visit-...",
  "attachment": {
    "id": "att-1777206562569",
    "type": "text",
    "text": "smoke memo",
    "createdAt": "2026-04-26T12:29:22.569Z",
    "latitude": null,
    "longitude": null,
    "locationConsent": false
  }
}
```

### 3.4 `PATCH /api/visits/{visitId}/status` — 200 (확정)
**body 필드명: `status` + 한글 enum** (영문 enum 모두 거부됨. 이전 시도가 실패한 건 curl Windows 콘솔의
한글 인코딩 문제 — JSON 파일에 UTF-8 로 저장 후 보내면 정상 통과. RN/Expo `fetch` 는 자동 UTF-8 이라
실 클라이언트에선 영향 없음.)
```json
{ "status": "부재", "reason": "..."?  }
```
응답:
```json
{
  "visitId": "...", "status": "부재", "reason": null,
  "statusLogs": [
    { "id": "visit-log-...", "changedAt": "...", "fromStatus": null, "toStatus": "완료", "reason": "초기 체크인" },
    { "id": "...", "changedAt": "...", "fromStatus": "완료", "toStatus": "부재", "reason": null }
  ]
}
```
- 백엔드가 status 변경 이력을 자동 보존 (감사 로그 요건 충족)

---

## 4. 현장

### 4.1 `POST /api/fields` — 201
body 필수: `name, status (pending|in_progress|done), roadAddress, jibunAddress, detailAddress, lat (33~43), lng (124~132)`
선택: `sido, sigungu, forceCreateWithDuplicate` (`userId` 는 백엔드 스펙상 존재하나 본 서비스 미사용)
```json
{
  "fieldId": "field-1777204180506",
  "message": "현장이 등록되었습니다",
  "field": { "fieldId", "name", "address", "status", "tags": [], "userId", "updatedAt", "recentVisitedAt": null },
  "duplicateWarning": null,
  "next": { "detailUrl": "/api/fields/{fieldId}" }
}
```
- **`fieldId`도 `"field-{epoch}"` 커스텀 string**
- list/summary 응답에서는 `address` 가 **단일 합쳐진 string** 으로 옴 (roadAddress + detailAddress 결합한 표시용)

### 4.2 `GET /api/fields/mine` — 200 (Phase 2 보강)
**기본 필터**: `visitWindow.mode = "default_30d"` — **방문 이력이 없는 현장은 기본 결과에 안 보임!** 등록 직후 새 현장 보려면 `?visitDateScope=all` 필요.
```json
{
  "items": [{
    "fieldId", "name", "address",
    "roadAddress", "jibunAddress", "detailAddress", "sido", "sigungu",
    "status", "lat", "lng",
    "tags", "userId", "assigneeUserId",
    "updatedAt", "recentVisitedAt"
  }],
  "pagination": { "page": 1, "limit": 50, "total": 1, "hasNext": false },
  "emptyMessage": "담당 현장이 없습니다. 관리자에게 문의하세요" | null,
  "appliedFilter": {
    "statuses": { "mode": "all" },
    "visitWindow": { "mode": "default_30d", "from": "...", "to": "..." },
    "longPeriodWarning": false,
    "filterComposition": { "axes": "and", "sameAxis": "or" }
  }
}
```
- ✅ `lat/lng + roadAddress/jibunAddress/detailAddress + sido/sigungu` 모두 응답에 포함 (Phase 2 반영)
- ⚠️ `userId` 와 `assigneeUserId` 둘 다 들어옴 — 백엔드가 정렬 진행 중인 듯. 우선 `assigneeUserId` 사용 권장.

### 4.3 `GET /api/fields/{fieldId}` — 200 (Phase 2 보강)
```json
{
  "fieldId", "name", "address",
  "roadAddress", "jibunAddress", "detailAddress", "sido", "sigungu",
  "status", "lat", "lng", "tags",
  "assigneeUserId": "uuid",
  "updatedAt": "...",
  "recentVisits": [],
  "directAttachments": [],
  "attachmentSummary": { "text": 0, "photo": 0, "audio": 0, "total": 0 },
  "checkInCta": {
    "label": "체크인 시작",
    "enabled": false,
    "reason": "외근 진행 중일 때만 체크인 가능합니다",
    "action": null
  }
}
```
- ✅ Phase 2: `lat/lng + 분리주소` 응답 보강
- ✅ Phase 2: **`directAttachments[]`** 신규 — 방문 없이 현장에 직접 첨부된 메모/사진/음성
- 목록과 다르게 **`assigneeUserId`만** (목록은 `userId` + `assigneeUserId` 둘 다)
- 백엔드가 **체크인 가능 여부 + 비활성 사유를 미리 계산** (`checkInCta`) — UI 그대로 사용 가능

### 4.6 `PATCH /api/fields/{fieldId}` — 200 (Phase 2 신규)
body: `{ name?, roadAddress?, jibunAddress?, detailAddress?, sido?, sigungu?, lat?, lng?, tags?, assignedUserId? }` (전부 선택, 부분 업데이트)
응답: `GET /api/fields/{id}` 의 detail shape 그대로 (수정 반영된 값).

### 4.7 `DELETE /api/fields/{fieldId}` — 204 (Phase 2 신규)
응답 본문 없음. 연관 visit 있을 때 `?force=true` 동작 미검증 (smoke 시점에 visit 0건이라).

### 4.8 `PATCH /api/fields/{fieldId}/status` — 200 (Phase 2 신규)
body: `{ "status": "pending" | "in_progress" | "done" }`
응답:
```json
{
  "fieldId": "...",
  "status": "in_progress",
  "updatedAt": "...",
  "previousStatus": "pending"
}
```
백엔드 요청서 §2.1 명세 그대로 반영됨.

### 4.9 `POST /api/fields/{fieldId}/memos` — 201 (Phase 2 신규)
body: `{ "text": "..." }` (≤2000자)
응답:
```json
{
  "fieldId": "...",
  "attachment": {
    "id": "att-{epoch}",
    "fieldId": "...",
    "type": "text",
    "text": "direct field memo",
    "createdAt": "...",
    "latitude": null,
    "longitude": null,
    "visitId": null
  }
}
```
- ✅ visit 없이 현장 직접 메모 — `visitId: null` 그대로
- visits 의 `/memos/text` 응답과 동일한 `attachment` shape (백엔드 통일됨)

### 4.10 `POST /api/fields/{fieldId}/photos` — 201 (Phase 2 신규)
multipart: `file` (필수, image), `caption` (선택)
응답: §4.9 와 동일 패턴, `type: "photo"` + `fileUrl/thumbnailUrl/captureAt` 등 (smoke 미검증, 카메라 통합 시 검증 예정).

### 4.11 `POST /api/fields/{fieldId}/voice-memos` — 201 (Phase 2 신규)
multipart: `file` (필수, audio), `durationSeconds` (≤300, 선택)
응답: §4.9 와 동일 패턴, `type: "audio"` (smoke 미검증).

### 4.4 `GET /api/fields/address/search?keyword=...` — 200
```json
{
  "query": "서울역",
  "provider": { "primary": "daum_postcode", "secondary": "kakao_local_rest", "retryOnFailure": 1, "manualCoordinateFallback": true },
  "items": [],
  "emptyMessage": "주소 검색 결과가 없습니다"
}
```
- 테스트 시점 `items: []` — Daum/Kakao API 키 미설정일 가능성. 실 사용 시 재검증 필요.

### 4.5 `GET /api/map/fields` — 본 서비스 미사용
백엔드 스펙상 다른 권한이 가정된 endpoint. 본 서비스는 단일 Actor(필드 워커) 라 호출하지 않음. 지도 마커는 `/api/fields/mine` 응답의 `lat`·`lng` 사용 (Phase 2 보강 후 가능).

---

## 5. ID 타입 전부 string — 프런트 타입 마이그레이션 필요

| 엔티티 | 프런트 현재 | 실제 |
|---|---|---|
| `User.id` | `number` | `string (UUID)` |
| `Trip.id` | `number` | `string ("trip-{epoch}")` (필드명도 `tripId`) |
| `Visit.id` | `number` | `string ("visit-{epoch}")` (필드명도 `visitId`) |
| `Field.id` | `number` | `string ("field-{epoch}")` (필드명도 `fieldId`) |
| 외래키 (workerId, fieldId, ...) | `number` | `string` |

`src/types/entities.ts` 와 `src/stores/*.ts`, `src/data/mockSeed.ts` 전반 영향. 단일 PR로 **id 타입 number → string + 필드명 정렬** 일괄 작업 필요.

---

## 6. 미확정 항목

### 확정 완료 (2026-04-26)
1. ✅ **메모 텍스트 필드명** = `text`
2. ✅ **방문 status PATCH 필드** = `status` (한글 enum) — `resultStatus` 별도 필드는 PATCH 입력에 미사용
3. ✅ **한글 인코딩** — curl Windows 콘솔의 인코딩 문제. RN/Expo fetch 는 자동 UTF-8 이라 영향 없음.

### Phase 2 (2026-04-27) 해소
4. ✅ **`/api/fields/mine` 좌표 보강** — `lat/lng` 응답에 포함됨
5. ✅ **`addressDetail` 분리 응답** — `roadAddress/jibunAddress/detailAddress + sido/sigungu` 모두 반환

### 여전히 후속 검증 필요
6. **메모 누적 방식** — `GET visit` 응답의 단일 `memo` 필드 의미. 시연 중 두 번 추가하면서 확인 예정.
7. **multipart 필드명** — 클라이언트가 `file` 로 보내는 중. 사진/음성 업로드 첫 시도에서 검증.
8. **`assignedUserId` vs `assigneeUserId`** — POST body 는 `assignedUserId` (PATCH 도 동일), GET 응답은 `assigneeUserId`. 백엔드 정렬 진행 중인지 확인 필요.

---

## 7. 4xx 에러 응답 일관성 — **부분 반영** (Phase 2 검증)

### 7.1 실측 결과 (2026-04-27)

| 시나리오 | 요청서 기대 | **실제** |
|---|---|---|
| 중복 이메일 | 409 + `code: "EMAIL_TAKEN"` | **400** + `{ "error": "email_already_exists" }` |
| 약한 비밀번호 | 400 + `code: "PASSWORD_POLICY_VIOLATION"` + `fields.password` | 400 + `{ "error": "password_too_short" }` |
| termsAgreed=false | 400 + `code: "TERMS_NOT_AGREED"` | 400 + `{ "error": "terms_required" }` |
| password ≠ confirm | 400 + `code: "PASSWORD_MISMATCH"` | 400 + `{ "error": "password_confirm_mismatch" }` |

### 7.2 정리

**개선된 점** (Phase 1 대비):
- ✅ 검증 실패가 4xx + JSON body 로 옴 (이전: 201 + null body, connection reset)
- ✅ `error` 필드는 항상 존재 (영문 snake_case 식별자)

**요청서와 다른 점**:
- HTTP status code 분기 없음 — 모든 검증 실패가 400 (요청서: 409 EMAIL_TAKEN, 401 INVALID_CREDENTIALS 등 분기)
- 별도 `code` 필드 없음 — `error` 필드가 영문 식별자 역할 겸함
- 한국어 메시지 미포함 — 클라이언트가 영문 코드 → 한국어 매핑 테이블 보유 필요
- `fields` 객체 없음
- `retryable` 없음

### 7.3 클라이언트 매핑 테이블 (Phase 2 작업에 사용)

```ts
// src/api/errors.ts 또는 상수 모듈에 추가 예정
export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  email_already_exists: '이미 가입된 이메일입니다',
  password_too_short: '비밀번호는 10자 이상 + 영대/영소/숫자/특수문자 중 3종 조합이어야 합니다',
  password_confirm_mismatch: '비밀번호 확인이 일치하지 않습니다',
  terms_required: '필수 약관 동의가 필요합니다',
  // ... 추가 발견 시 보완
};
```

`ApiError.message` 에 들어 있는 백엔드 raw message (영문 코드) 를 위 테이블로 한국어로 매핑해 사용자에게 표시.

---

## 8. Reports 응답 shape — endpoint 별 비일관 (Phase 2 신규)

### 8.1 endpoint 별 wrapper 차이

| Endpoint | wrapper | id 필드명 |
|---|---|---|
| `POST /api/reports` | **`{ success, data: {...} }`** | `data.id` (= `report-{uuid}`) |
| `GET /api/reports` (list) | flat `{ items, pagination, emptyMessage }` | `items[].reportId` |
| `GET /api/reports/{id}` | flat | `reportId` |
| `PATCH /api/reports/{id}` | flat | `reportId` |
| `DELETE /api/reports/{id}` | 204 | — |
| `POST /api/reports/{id}/share` | **`{ success, data: {...} }`** | `data.reportId` |
| `GET /api/reports/shared/{token}` | **`{ success, data: {...} }`** | `data.id` |

→ 클라이언트가 endpoint 별로 `data` unwrap + id 정규화 (`id || reportId`) 처리 필요. 자동 unwrap 위험 (다른 도메인은 flat).

### 8.2 응답 본문 캡처

#### POST /api/reports — 201
body: `{ "title", "content", "summary"?, "tripId"? }` (tripId 선택)
응답:
```json
{
  "success": true,
  "data": {
    "id": "report-4bb3ba7f-...",
    "tripId": null,
    "title": "...",
    "content": "...",
    "summary": "...",
    "authorUserId": "uuid",
    "status": "draft",
    "generatedByAi": false,
    "outputFileUrl": null,
    "shareEnabled": false,
    "shareToken": null,
    "sharedAt": null,
    "createdAt": "...",
    "updatedAt": "...",
    "deletedAt": null
  }
}
```
- `id` 가 `report-{uuid}` 형식 (다른 entity 의 epoch 패턴과 다름)
- `authorUserId` (`creator`/`creatorId` 가 아님)
- `status: "draft" | ...` — Report 자체에 status 가 있음 (publish 흐름?)
- `generatedByAi`, `outputFileUrl`, `shareEnabled/shareToken/sharedAt` — 풍부한 메타

#### GET /api/reports (list) — 200
```json
{
  "items": [{
    "reportId": "report-...",
    "tripId": null | string,
    "trip": { "tripDate": null|string, "startedAt": null|string, "endedAt": null|string },
    "title": "...",
    "contentPreview": "본문 앞 ~120자",
    "createdAt": "...",
    "updatedAt": null|string,
    "fileUrl": null|string
  }],
  "pagination": { "page": 1, "limit": 50, "total": 1, "hasNext": false },
  "emptyMessage": null|string
}
```

#### GET /api/reports/{id} — 200
```json
{
  "reportId": "report-...",
  "tripId": null|string,
  "trip": { "startedAt": null|string, "endedAt": null|string, "visitCount": null|number },
  "title": "...", "content": "...",
  "createdAt": "...", "updatedAt": null|string,
  "fileUrl": null|string,
  "creator": { "id": "uuid", "name": "..." }
}
```
- ⚠️ `creator.name` 이 `creator.id` 와 동일 값으로 들어옴 (백엔드 버그 추정 — author 이름 채워지지 않음)

#### PATCH /api/reports/{id} — 200
detail 과 동일 shape.

#### DELETE /api/reports/{id} — 204 (본문 없음)

#### POST /api/reports/{id}/share — 200
body: `{}` (아무것도 안 보내도 동작)
응답:
```json
{
  "success": true,
  "data": {
    "reportId": "...",
    "shareEnabled": true,
    "shareToken": "eb16460aaf8c79b3...",
    "shareUrl": "/api/reports/shared/eb16...",
    "sharedAt": "..."
  }
}
```

#### GET /api/reports/shared/{token} — 200 (인증 불필요)
```json
{
  "success": true,
  "data": {
    "id": "report-...", "tripId": null|string,
    "title": "...", "content": "...", "summary": "...",
    "authorUserId": "...", "status": "draft|...",
    "generatedByAi": false, "outputFileUrl": null,
    "shareEnabled": true, "shareToken": "...", "sharedAt": "...",
    "createdAt": "...", "updatedAt": "...", "deletedAt": null
  }
}
```
비로그인 사용자도 토큰만 알면 조회 가능.
