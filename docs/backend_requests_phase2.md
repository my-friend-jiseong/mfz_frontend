# 백엔드 추가 구현 요청서 — Phase 2

> **수신**: mfz_backend 팀
> **발신**: mfz_frontend 팀 (njs)
> **작성일**: 2026-04-26
> **기준**: 스웨거 `http://59.21.223.137:28080/api-docs/` v1.0.0 + 프런트 v0.2 명세 (`docs/backend_api_request.md`)
> **현황**: Phase 1 (인증·외근·방문·현장 조회·현장 등록) 12개 엔드포인트 연동 완료. 본 문서는 그 외의 화면이 동작하기 위해 필요한 추가 구현 요청.

---

## 0. 요청 우선순위 요약

| 순위 | 항목 | 영향 화면 | 차단도 |
|---|---|---|---|
| **P0** | [§7.4] **에러 응답 일관성 (4xx 메시지·code)** | 회원가입·로그인·전체 | 🔴 검증 실패가 사용자에게 도달 안 함 |
| **P0** | [§1.1] `mine`/`detail` 응답에 `lat`·`lng` 추가 | 지도 화면 전체 (Feature 1·2) | 🔴 지도 마커 자체가 안 뜸 |
| **P0** | [§4] Reports CRUD 4종 | 보고서 탭 전체 (Feature 13) | 🔴 작성 후 다시 못 봄 |
| **P1** | [§2.1] `PATCH /api/fields/{id}/status` | 현장 상세 상태 전환 버튼 | 🟡 작업자가 done 처리 불가 |
| **P1** | [§2.2] `PATCH /api/fields/{id}` | 현장 상세 정보 수정 화면 | 🟡 오타·오등록 정정 불가 |
| **P1** | [§2.3] `DELETE /api/fields/{id}` (soft) | 현장 삭제 버튼 | 🟡 잘못 등록한 현장 정리 불가 |
| **P2** | [§3] 방문 없이 현장 직접 첨부 (memo/photo/voice) 3종 | 현장 상세 — 외근 밖에서도 메모 | 🟢 외근 안에선 우회 가능 |
| **P2** | [§1.2] `mine`/`{id}` 응답에 `addressDetail` 분리 | 현장 수정 화면 (PATCH 와 함께) | 🟢 list 표시는 합본 string 으로 OK |
| **P3** | [§5] 일반 사용자에게 `GET /api/map/fields` 권한 | 지도 마커 (admin 전용 우회) | 🟢 §1.1 가 처리되면 불필요 |

---

## 1. 현장(Field) — 응답 보강

### 1.1 `lat`·`lng` 응답 포함 — **최우선 (P0)**

**현재**
```http
GET /api/fields/mine
```
응답 `items[]` 에 좌표가 없음:
```json
{
  "fieldId": "field-1777204180506",
  "name": "...", "address": "...", "status": "pending",
  "tags": [], "userId": "...", "updatedAt": "...", "recentVisitedAt": null
}
```

`GET /api/fields/{id}` 응답에도 좌표 없음 (현재 `assigneeUserId`, `recentVisits`, `attachmentSummary`, `checkInCta` 만 있음).

**문제**
- 프런트 지도 화면(Feature 1·2: Kakao Maps WebView)이 **마커 표시 불가** — 좌표가 0/0 으로 채워져 한반도 밖에 찍힘
- 작업자가 "내 담당 현장 위치 확인" 화면을 사용할 수 없어 핵심 가치(현장 위치 파악)가 차단됨

**요청**
두 응답 모두에 `lat: number`, `lng: number` 추가. DB 에 이미 `field.latitude`/`longitude` 컬럼이 있을 것 (POST `/api/fields` 가 이를 받음).

```json
// GET /api/fields/mine items[]
{
  "fieldId": "...", "name": "...", "address": "...", "status": "pending",
  "lat": 35.1577, "lng": 129.0593,
  "tags": [], "userId": "...", "updatedAt": "...", "recentVisitedAt": null
}

// GET /api/fields/{id}
{
  "fieldId": "...", "name": "...", "address": "...", "status": "pending",
  "lat": 35.1577, "lng": 129.0593,
  "tags": [], "assigneeUserId": "...",
  "recentVisits": [], "attachmentSummary": {...}, "checkInCta": {...}
}
```

`POST /api/fields` 응답의 `field` 객체에도 동일하게 포함 부탁드립니다.

### 1.2 `addressDetail` 분리 응답

**현재**
- `POST /api/fields` 요청은 `roadAddress`, `jibunAddress`, `detailAddress` 를 분리해 받지만,
- 모든 GET 응답은 합쳐진 단일 `address` string 만 반환.

**문제**
- 현장 수정 화면에서 "도로명 주소는 두고 상세주소(동/호)만 변경" 같은 부분 수정이 불가능 — 합본만 보이므로 사용자가 어디까지가 도로명이고 어디부터 상세인지 알 수 없음.

**요청**
GET 응답에 분리된 컬럼도 함께 노출:
```json
{
  "address": "부산광역시 사상구 가야대로 100 3층 301호",  // 표시용 합본 (그대로 유지)
  "roadAddress": "부산광역시 사상구 가야대로 100",
  "jibunAddress": "부산광역시 사상구 학장동 100-1",
  "detailAddress": "3층 301호",
  "sido": "부산광역시",
  "sigungu": "사상구"
}
```

---

## 2. 현장(Field) — 미구현 엔드포인트

### 2.1 `PATCH /api/fields/{fieldId}/status`

**용도**: 현장 상태 전환 (`pending → in_progress → done`).

**요청 body**
```json
{ "status": "pending" | "in_progress" | "done" }
```

**검증**
- 담당자 본인 또는 관리자 (그 외 403 `FORBIDDEN`)
- `done → pending` 되돌림은 **관리자 전용** (일반 사용자가 시도 시 403)
- 미정의 status 값 → 400

**응답 200**
```json
{
  "fieldId": "...",
  "status": "done",
  "updatedAt": "2026-04-26T12:00:00.000Z",
  "previousStatus": "in_progress"
}
```

**감사 로그**
상태 전환 이력 보존 (`field_id, from, to, actor, ts, ip`). 1년 이상 보관 권장.

---

### 2.2 `PATCH /api/fields/{fieldId}`

**용도**: 현장 정보 수정 (주소·좌표·상세주소·담당자 등).

**요청 body** (모든 필드 선택)
```json
{
  "name": "...",
  "roadAddress": "...",
  "jibunAddress": "...",
  "detailAddress": "...",
  "sido": "...",
  "sigungu": "...",
  "lat": 35.1577,
  "lng": 129.0593,
  "tags": ["..."],
  "assignedUserId": "uuid"
}
```

**검증**
- 담당자 본인 또는 관리자 (403)
- `lat` 33~43, `lng` 124~132 (한반도 범위) — 벗어나면 400 `COORDS_OUT_OF_RANGE`
- `assignedUserId` 변경은 **관리자 전용** (일반 사용자가 시도 시 403)
- 변경된 필드만 부분 갱신, 나머지는 유지

**응답 200**: 업데이트된 field 전체 (§1.1 의 detail 응답 shape 와 동일)

**감사 로그**
변경 전/후 값 보존.

---

### 2.3 `DELETE /api/fields/{fieldId}` (soft delete)

**용도**: 현장 삭제. 연관 visit/memo/photo 는 감사 이력으로 보존 (hard delete 금지).

**쿼리**
- `?force=true` — 연관 visit 있어도 강제 삭제 (관리자만)

**기본 동작**
- 연관 visit 1건 이상 + `force` 미지정 → **409 `HAS_RELATED_VISITS`**
  ```json
  {
    "error": "방문 기록이 있는 현장은 삭제할 수 없습니다",
    "code": "HAS_RELATED_VISITS",
    "visitCount": 5
  }
  ```
- 클라이언트가 위 응답을 받으면 confirm 모달 표시 → 관리자만 `?force=true` 로 재호출

**처리**
- `field.deletedAt = now`, 목록·상세 조회에서 제외 (mine/{id} 가 404)
- 연관 visit/memo/photo 는 그대로 유지

**응답 204** (본문 없음).

**검증**
- 담당자 본인 (soft delete) 또는 관리자 (`force=true` 포함). 그 외 403.

---

## 3. 방문(Visit) 없이 현장에 직접 첨부 — Phase 1.5

### 배경
프런트 ER 다이어그램(`docs/mfjs.drawio.xml`) 의 `text_memo.visit_id`, `photo.visit_id`, `voice_memo.visit_id` 가 모두 **NULLable** 로 정의됨. 이는 "외근 세션 밖에서도 작업자가 현장 자체에 메모/사진을 남길 수 있다"는 도메인 요구사항을 반영한 것.

현재 백엔드는 `POST /api/visits/{visitId}/memos/text` 등 visit 기반 첨부만 제공 → 외근 시작 전 또는 외근 종료 후 현장 자체에 메모 남기는 UX 불가.

### 3.1 `POST /api/fields/{fieldId}/memos`

**요청 body**
```json
{ "text": "..." }   // 1~2000자
```
(memo 필드명은 visit 쪽 엔드포인트와 동일하게 `text` 로 통일 부탁드립니다 — Phase 1 smoke test 결과 visit 메모도 `text` 키 사용)

**처리**
- 자동: `visitId = null`, `fieldId = path 의 값`
- 클라이언트가 헤더로 위치를 보내거나, 서버가 무시하고 `latitude`/`longitude` 는 null 처리

**응답 201**
```json
{
  "fieldId": "...",
  "attachment": {
    "id": "att-...",
    "type": "text",
    "text": "...",
    "createdAt": "...",
    "latitude": null,
    "longitude": null,
    "visitId": null
  }
}
```

**검증**: 담당자 본인 또는 관리자 (403).

### 3.2 `POST /api/fields/{fieldId}/photos`

**요청**: `multipart/form-data` — `file` (필수, 최대 10MB, image/{jpeg,png,webp,heic}), `caption` (선택)

**서버 처리**: visit 사진 처리(`POST /api/visits/{vid}/photos`)와 동일한 EXIF strip + 별도 컬럼 추출 + 접근통제 스토리지.

**응답 201**: `attachment` 객체 (§3.1 와 동일 패턴, type=`photo`, fileUrl 등 포함, `visitId: null`)

### 3.3 (선택) `POST /api/fields/{fieldId}/voice-memos`

**요청**: `multipart/form-data` — `file` (audio/{m4a,mp3,aac}, 최대 5분)

**응답 201**: `attachment` 객체 (type=`audio`, fileUrl, durationSec, `visitId: null`)

---

## 4. 보고서(Report) — CRUD 4종

### 배경
현재 백엔드는 `POST /api/reports/generate` (Gemini AI 자동 생성·Word 출력) 만 제공. 작성 후 **다시 조회·수정·삭제할 수 없음** → 작업자가 "지난 보고서 다시 보기" 같은 기본 동작 불가.

### 4.1 `GET /api/reports`

**용도**: 본인 보고서 목록.

**쿼리**
- `page` (기본 1), `limit` (기본 50)
- `tripId` — 특정 외근의 보고서만
- `search` — 제목+본문 LIKE
- `fromDate`, `toDate` — `createdAt` 범위
- 정렬: `createdAt desc`

**응답 200**
```json
{
  "items": [
    {
      "reportId": "...",
      "tripId": "...",
      "trip": { "tripDate": "2026-04-20", "startedAt": "...", "endedAt": "..." },
      "title": "...",
      "contentPreview": "본문 앞 120자...",
      "createdAt": "...",
      "updatedAt": null,
      "fileUrl": "/files/reports/...docx"  // generate 산출물 (있는 경우)
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 0, "hasNext": false },
  "emptyMessage": "작성된 보고서가 없습니다" | null
}
```

**기본 필터**: 작성자 본인 + `deletedAt = null` (soft-deleted 제외).

### 4.2 `GET /api/reports/{reportId}`

**응답 200**
```json
{
  "reportId": "...",
  "tripId": "...",
  "trip": { "startedAt": "...", "endedAt": "...", "visitCount": 5 },
  "title": "...",
  "content": "본문 전체",
  "createdAt": "...",
  "updatedAt": null,
  "fileUrl": "...",
  "creator": { "id": "uuid", "name": "..." }
}
```

**검증**: 작성자 본인 또는 관리자 (그 외 404 — 존재 미공개). soft-deleted 면 404.

### 4.3 `PATCH /api/reports/{reportId}`

**요청 body** (둘 중 하나 또는 둘 다)
```json
{ "title": "...", "content": "..." }
```

**검증**
- 작성자 본인만 (관리자도 수정 불가 — 감사 영역)
- `tripId` 변경 금지 → 400 `TRIP_ID_IMMUTABLE`
- `title` 1~100자, `content` 10~50000자

**처리**: `updatedAt = now`. 수정 이력 보존(감사).

**응답 200**: 업데이트된 report 전체 (§4.2 shape).

### 4.4 `DELETE /api/reports/{reportId}` (soft delete)

**검증**: 작성자 본인 또는 관리자.

**처리**: `deletedAt = now`. trip/visit 은 유지.

**응답 204**.

---

## 5. (선택) `GET /api/map/fields` 일반 사용자 권한

**현재**: admin role 토큰만 허용 (smoke test 시 일반 계정 → 403).

**가능하다면**: 일반 사용자도 **본인 담당 현장만** 반환하도록 권한 확장. `?bbox=minLng,minLat,maxLng,maxLat` 뷰포트 필터도 함께.

**다만** §1.1 (`mine` 응답에 lat/lng 추가) 만 처리되면 프런트는 `mine` 으로 충분히 마커를 그릴 수 있어 본 항목은 우선순위 낮음.

---

## 6. 응답 일관성 — 필드명 정렬 요청 (선택)

### 6.1 `userId` vs `assigneeUserId`
- `GET /api/fields/mine` → 응답 `userId`
- `GET /api/fields/{id}` → 응답 `assigneeUserId`

**둘 중 하나로 통일** 부탁드립니다 (가급적 `assigneeUserId` 가 의미상 명확).

### 6.2 visit 의 두 status 필드
현재 `GET /api/trips/{tid}/visits/{vid}` 응답에 `resultStatus` (영문) + `status` (한글) 두 개가 같이 있음. PATCH 입력은 `status` 한글만 받음. 의도가 불분명.

**제안**: 하나로 통일하거나, 둘이 의미가 다르면 (`resultStatus` 가 정규화된 enum, `status` 가 표시용 한글) 그 의도를 스웨거 description 에 명시.

### 6.3 페이지네이션 키
- 일부 엔드포인트: `pagination.limit`
- 프런트 명세 v0.2: `pageSize`

큰 차이는 아니지만 **`limit` 으로 통일됨** (백엔드 현재 형태) 을 명시 부탁드립니다 — 프런트가 그대로 따라가겠습니다.

---

## 7. 기타 확인 요청 (Phase 1 smoke test 미해결)

### 7.1 `GET /api/fields/address/search` 가 항상 빈 결과
```http
GET /api/fields/address/search?keyword=서울역
```
응답:
```json
{
  "query": "서울역",
  "provider": { "primary": "daum_postcode", "secondary": "kakao_local_rest", ... },
  "items": [],
  "emptyMessage": "주소 검색 결과가 없습니다"
}
```
**확인 사항**: Daum/Kakao API 키가 미설정인지? 서비스 환경에서 정상 동작하면 키 설정만 누락된 것으로 이해. items[] 의 shape (필드명) 도 함께 명세 부탁드립니다.

### 7.2 visit detail 의 `memo` 단일 필드
```http
GET /api/trips/{tid}/visits/{vid}
```
응답에 `memo: ""` (단일 string). 메모를 여러 번 추가하면 어떻게 누적되는지? 가장 최근 1건? 마지막 작성? `attachments[]` 와 별개로 무엇을 의미하는지 description 부탁드립니다.

### 7.3 `POST /api/visits/{vid}/photos` 와 `voice-memos` multipart 필드명
스웨거에 명시 안 됨. 프런트는 `file` 키로 보내는 중. 정확한 필드명(`file`/`photo`/`upload`) 명세 또는 description 추가 부탁드립니다.

### 7.4 [긴급] 4xx/5xx 에러 응답 일관성 — **친절한 메시지 보내주세요**

**현재 관찰된 비정상 응답들 (Phase 1 smoke test + 사용자 시연 중 확인)**:

#### 사례 A. 회원가입 실패가 201 + 빈 body 로 옴
```http
POST /auth/signup
{ "email": "이미 가입된 이메일", ... }
```
응답: **`HTTP 201` + body 없음**

→ 클라이언트는 success 로 처리하고 `response.refreshToken` 접근하다 `Cannot read properties of null` throw. **사용자에게 "이미 가입된 이메일입니다" 같은 메시지가 절대 도달할 수 없는 구조**.

#### 사례 B. 약한 비밀번호 등 검증 실패 시 connection reset
```http
POST /auth/signup
{ "password": "abcd", ... }   # KISA 정책 위반
```
응답: **TCP `Connection was reset`** (HTTP status 자체 없음)

→ 백엔드 프로세스가 검증 단계에서 throw 후 죽거나 socket close. 클라이언트는 NetworkError 만 받고 원인 모름.

#### 사례 C. 검증 실패 후 응답 shape 가 매번 다를 수 있음
일관된 에러 포맷 명세가 없어 프런트가 매 케이스마다 추측해야 함.

---

### 요청 — 모든 4xx/5xx 응답을 다음 포맷으로 통일

```json
{
  "error": "사용자에게 보여줄 한국어 메시지",
  "code": "EMAIL_TAKEN" | "PASSWORD_POLICY_VIOLATION" | "VALIDATION_FAILED" | ...,
  "fields": { "password": "10자 이상 + 영대/영소/숫자/특수문자 중 3종 이상 조합" },
  "retryable": false
}
```

#### 회원가입 (`POST /auth/signup`) 의 구체적 케이스

| 시나리오 | 현재 | **요청** |
|---|---|---|
| 이미 가입된 이메일 | 201 + null | **409** `{ error: "이미 가입된 이메일입니다", code: "EMAIL_TAKEN" }` |
| 비밀번호 정책 위반 | connection reset | **400** `{ error: "비밀번호는 10자 이상 + 영대/영소/숫자/특수문자 중 3종 조합이어야 합니다", code: "PASSWORD_POLICY_VIOLATION", fields: { password: "..." } }` |
| password ≠ passwordConfirm | 미확인 | **400** `{ error: "비밀번호 확인이 일치하지 않습니다", code: "PASSWORD_MISMATCH" }` |
| termsAgreed=false | 미확인 | **400** `{ error: "필수 약관 동의가 필요합니다", code: "TERMS_NOT_AGREED" }` |
| email 형식 위반 | 미확인 | **400** `{ error: "이메일 형식이 올바르지 않습니다", code: "INVALID_EMAIL" }` |
| 이름 누락 | 미확인 | **400** `{ error: "이름을 입력해주세요", code: "NAME_REQUIRED" }` |

#### 로그인 (`POST /auth/login`)
| 시나리오 | **요청** |
|---|---|
| 이메일/비밀번호 불일치 | **401** `{ error: "이메일 또는 비밀번호가 올바르지 않습니다", code: "INVALID_CREDENTIALS" }` |
| 5회 연속 실패 | **429** `{ error: "잠시 후 다시 시도해주세요", code: "LOGIN_LOCKED", retryAfter: 900 }` + `Retry-After` 헤더 |

#### 모든 엔드포인트 공통 원칙
1. **2xx 응답은 무조건 정상** — 검증 실패를 2xx + null body 로 보내면 안 됨
2. **검증 실패는 4xx + 위 포맷의 JSON body** — connection close/reset 금지
3. **서버 내부 오류는 5xx + 에러 ID** — 사용자에겐 일반 메시지, 로그에 reqId 매핑
4. `error` 메시지는 **한국어**, 사용자에게 그대로 표시 가능한 수준
5. `code` 는 **불변 enum 식별자** (UI 분기·다국어 키로 사용)
6. 검증이 여러 필드에서 실패하면 `fields` 에 모두 포함

이 정렬이 들어와야 프런트가 ApiError.code 로 분기해서 "이미 가입된 이메일입니다 → 로그인 화면으로 이동" 같은 UX 를 만들 수 있습니다. 현재는 모든 실패가 "서버 응답이 올바르지 않습니다" 한 줄로 뭉뚱그려져 사용자가 다음 액션을 알 수 없습니다.

---

### 7.5 권한 — 관리자 토큰 발급 절차
스웨거 description: "데모 로그인은 `sub` 만 넣으므로, `signAccessToken` 으로 `{ sub: 'demo', role: 'admin' }` 토큰을 별도 발급해 테스트할 수 있다"

→ **관리자 계정 생성 흐름** 또는 **role 승급 엔드포인트** 가 추가될 예정인지? 현재 테스트는 직접 토큰 서명이 가능한 백엔드 개발자만 admin 시나리오를 검증할 수 있는 상태입니다.

---

## 8. 일정·우선순위 협의

P0 항목(§1.1 좌표 + §4 Reports CRUD)이 들어와야 다음 시연이 가능합니다. 시연 일정 알려주시면 거꾸로 우선순위 다시 조율하겠습니다.

P1·P2 항목은 들어오는 대로 프런트에서 store/화면 활성화 PR 을 분리해 머지하겠습니다.

응답 shape 변경(§1.1, §1.2)은 마이그레이션 비용이 커지기 전에 가능한 한 빨리 확정 부탁드립니다.
