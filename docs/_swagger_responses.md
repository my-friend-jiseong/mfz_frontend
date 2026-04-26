# 백엔드 실응답 캡처 — Phase 0 smoke test

> **수집일**: 2026-04-26
> **방법**: 테스트 계정 (`njs.smoke.{ts}@example.com`) 으로 회원가입→로그인→외근→체크인→메모→종료→로그아웃 풀 시나리오 실행, curl 응답 본문 그대로 기록.
> **목적**: 스웨거 스펙에 누락된 응답 shape·필드명·enum 값을 코드로 옮기기 전 확정.

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
- `role`: `"user"` 기본 / `"admin"` 별도

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
선택: `sido, sigungu, userId(관리자만), forceCreateWithDuplicate`
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

### 4.2 `GET /api/fields/mine` — 200
**기본 필터**: `visitWindow.mode = "default_30d"` — **방문 이력이 없는 현장은 기본 결과에 안 보임!** 등록 직후 새 현장 보려면 `?visitDateScope=all` 필요.
```json
{
  "items": [{ "fieldId", "name", "address", "status", "tags", "userId", "updatedAt", "recentVisitedAt" }],
  "pagination": {...},
  "emptyMessage": "담당 현장이 없습니다. 관리자에게 문의하세요" | null,
  "appliedFilter": {
    "statuses": { "mode": "all" },
    "visitWindow": { "mode": "default_30d", "from": "...", "to": "..." },
    "longPeriodWarning": false,
    "filterComposition": { "axes": "and", "sameAxis": "or" }
  }
}
```

### 4.3 `GET /api/fields/{fieldId}` — 200
```json
{
  "fieldId", "name", "address", "status", "tags",
  "assigneeUserId": "uuid",
  "recentVisits": [],
  "attachmentSummary": { "text": 0, "photo": 0, "audio": 0, "total": 0 },
  "checkInCta": {
    "label": "체크인 시작",
    "enabled": false,
    "reason": "외근 진행 중일 때만 체크인 가능합니다",
    "action": null
  }
}
```
- 목록과 다르게 **`assigneeUserId`** (목록은 `userId`)
- 백엔드가 **체크인 가능 여부 + 비활성 사유를 미리 계산** (`checkInCta`) — UI 그대로 사용 가능

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

### 4.5 `GET /api/map/fields` — 403 (일반 사용자)
**관리자 전용**. 데모 일반 계정으로는 접근 불가 → 일반 사용자용 지도 마커는 `/api/fields/mine` 의 좌표 데이터 활용해야 함 (단, mine 응답에 `lat/lng` 없음 → 상세 호출하거나 백엔드 보강 필요).

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
3. ✅ **한글 인코딩** — curl Windows 콘솔의 인코딩 문제. RN/Expo fetch 는 자동 UTF-8 이라 영향 없음. 백엔드 저장도 정상 (smoke test 시 필드명에 깨진 한글이 저장된 건 curl 입력 단계의 문제)

### 후속 검증 필요
4. **메모 누적 방식** — `GET visit` 응답의 단일 `memo` 필드가 어떻게 채워지는지: 가장 최근 메모만? 마지막 메모? `attachments[]` 와 별도? 시연 시 두 번 추가하면서 확인.
5. **multipart 필드명** (사진·음성) — 클라이언트에서 `file` 로 보내는 중. 첫 업로드 시도에서 ApiError 받으면 `photo`/`upload` 폴백 검토.
6. **`/api/fields/mine` 좌표 부재** — 응답에 lat/lng 미포함 → 지도 마커 표시 불가. 백엔드 보강 요청 항목 (3.1 추가 요청 #7 와 동일).
7. **`/api/fields` 응답에 `addressDetail` 분리 미포함** — create 요청에는 분리해서 보내지만 응답은 합쳐서 옴. 수정 화면(미구현)에서 분리 편집하려면 백엔드 분리 응답 필요.
