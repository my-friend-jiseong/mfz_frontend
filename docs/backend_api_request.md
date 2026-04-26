# 내친지(mfz) 백엔드 API 요청서 — v0.2

> **작성일**: 2026-04-24
> **출처**: 프런트엔드 프로토타입(Expo + RN) 시연에서 실제로 호출해야 하는 엔드포인트를 역산해 정리.
> **기준**: Notion 아이디어 보드 Feature 번호 매핑 포함. ER은 `docs/mfjs.drawio.xml` 참조.
> **스코프**: 오늘 시연된 핵심 플로우(인증 → 외근 → 현장 CRUD → 방문 기록 → 보고서)까지. 지도 시각화(Feature 1·2·3), 보조 자동화(Feature 8·12·14), 약관·프로필(Feature 17·18)은 이 문서 범위 밖.

## 0. 공통 규약

### 인증
- 모든 엔드포인트는 `Authorization: Bearer {accessToken}` 필수 (명시된 `/auth/*` 공개 엔드포인트 제외).
- Access token: JWT, TTL 15~60분.
- Refresh token: TTL 7~30일, **로테이션**(사용된 refresh는 즉시 무효화 + 새 refresh 발급).
- 토큰 저장은 클라이언트 측 iOS Keychain(`AfterFirstUnlockThisDeviceOnly`) / Android Keystore + EncryptedSharedPreferences.

### 응답 포맷
```json
// 성공
{ "data": { ... } }
// 또는 목록
{ "data": [ ... ], "page": 1, "pageSize": 50, "totalPages": 12 }

// 오류
{ "error": { "code": "VALIDATION_FAILED", "message": "...", "fields": { "title": "too long" } } }
```

### HTTP 상태
| 상태 | 의미 |
|---|---|
| 200 | 정상 |
| 201 | 생성 성공 |
| 204 | 삭제/로그아웃 등 본문 없는 성공 |
| 400 | 요청 형식/유효성 실패 |
| 401 | 미인증 |
| 403 | 권한 부족 |
| 404 | 리소스 없음 |
| 409 | 비즈니스 규칙 충돌(활성 외근 중복 등) |
| 429 | 레이트 리밋(로그인 5회/15분 잠금 등) |
| 500 | 서버 오류 |

### 페이지네이션
- 쿼리: `?page={n}&pageSize={50}`
- 응답: `data[]`, `page`, `pageSize`, `totalPages`, `total`

### ID·시간
- ID는 `number`(auto-increment, 1 이상) — ER 정의 기준.
- 시간은 전부 ISO-8601 UTC 문자열(`2026-04-24T10:15:30.000Z`).
- 좌표는 WGS84 `latitude: number`, `longitude: number`.

### 접속기록 보존
- 로그인·로그아웃·민감정보 조회·권한 변경 이벤트는 접속기록에 남겨 **최소 1년, 민감정보 포함 시 2년 보관** (KISA 안전성 확보조치 고시).

---

## 1. 시스템 관리

### 1.1 `POST /auth/signup` (Feature 15)
회원가입.

**요청 body**
```json
{
  "email": "user@example.com",
  "password": "P@ssw0rd!234",
  "name": "홍길동",
  "termsVersion": "2026-04-01",
  "privacyVersion": "2026-04-01",
  "locationConsent": true,
  "notificationConsent": false
}
```

**검증**
- `email`: RFC 5322 형식, 중복 불가 → 409 `EMAIL_TAKEN`
- `password`: **KISA 정책** — 10자 이상 + 영대/소·숫자·특수문자 3종 이상 조합, 연속 3자리·반복 문자·ID 포함 금지
- `termsVersion`/`privacyVersion` 현재 서비스 버전과 일치 필수
- `locationConsent == true` 필수(앱 핵심이 위치 기반) · `notificationConsent`는 선택

**처리**
- 비밀번호 일방향 해시(bcrypt cost ≥ 10 또는 Argon2id)
- 약관·개인정보 동의 이력을 별도 테이블에 `user_id, version, consented_at` 기록

**응답 201**
```json
{
  "data": {
    "user": { "id": 1, "email": "...", "name": "...", "role": "worker", "createdAt": "..." },
    "accessToken": "...",
    "refreshToken": "...",
    "refreshJti": "..."
  }
}
```

### 1.2 `POST /auth/login` (Feature 15)
로그인.

**요청 body** `{ "email", "password" }`

**검증·레이트 리밋**
- 이메일·비밀번호 불일치 → 401 `INVALID_CREDENTIALS`
- **5회 연속 실패 → 15분 잠금** + CAPTCHA (429 `LOGIN_LOCKED`, `retryAfter` 헤더)
- 성공 시 실패 카운터 리셋, IP·User-Agent 접속기록 기록

**응답 200**: signup과 동일 포맷.

### 1.3 `POST /auth/logout` (Feature 15)
로그아웃.

**요청**: `Authorization` 헤더 + body `{ "refreshToken": "..." }`
**처리**: refresh token 블랙리스트 등재 + access 세션 종료 이벤트 기록.
**응답 204**.

### 1.4 `POST /auth/refresh` (Feature 16)
토큰 재발급(로테이션).

**요청 body** `{ "refreshToken": "..." }`
**처리**
- refresh가 유효하고 블랙리스트에 없으면 새 access + 새 refresh 발급, 이전 refresh 즉시 무효화.
- **재사용 감지**(이미 로테이션된 refresh 재사용) → 전체 세션 강제 로그아웃 + 사용자 알림
- 루팅/탈옥 기기(클라이언트 선언) · 비정상 위치 · User-Agent 변경 감지 시 재로그인 강제(401 `REAUTH_REQUIRED`)

**응답 200**: 새 `accessToken`, `refreshToken`, `refreshJti`.

### 1.5 `GET /auth/me` (Feature 16)
현재 로그인 사용자 요약.
**응답 200**: `{ "data": { "user": { "id", "email", "name", "role", "createdAt" } } }`

> **제외**: `PATCH /auth/password`(비밀번호 변경)은 Feature 18(프로필·환경 설정) 범위로 이 문서 v0.1에선 제외. 변경 시 기존 refresh 전부 무효화하는 정책만 메모.

---

## 2. 외근(Trip)

### 2.1 `POST /trips` (Feature 5)
외근 시작.

**요청 body** (전부 선택)
```json
{ "startLocation": { "lat": 35.1577, "lng": 129.0593 } }
```
`startLocation`을 보내면 시작 위치를 감사 로그에 함께 기록(복무 규정상 출장 시작점 근거 자료). 보내지 않아도 생성 가능.

**검증**
- 해당 worker의 미종료 trip(`endedAt = null`) 존재 시 → **409 `ACTIVE_TRIP_EXISTS`** (동시 1건 제한, 공무원 복무 관행)

**처리**: `startedAt = now`, `workerId = 토큰 유저`

**응답 201** `{ "data": { "trip": { "id", "workerId", "startedAt", "endedAt": null } } }`

### 2.2 `PATCH /trips/{id}/end` (Feature 5)
외근 종료.

**검증**
- 존재 여부(404), 소유자 본인 또는 관리자(403), 이미 `endedAt` 존재 시 409 `TRIP_ALREADY_ENDED`

**처리**: `endedAt = now`. 상태 전환 감사 로그(`trip_id, action, actor, timestamp, ip`) 기록.

**응답 200**: 업데이트된 trip.

### 2.3 `GET /trips/active` (Feature 5)
현재 사용자의 진행 중 외근.
**응답**: 존재 시 200 + trip, 없으면 204.

### 2.4 `GET /trips` (Feature 6)
본인 외근 목록.

**쿼리**: `page`, `pageSize`(기본 50), `startDate`, `endDate`, `workerId`(관리자만)
**정렬**: `startedAt desc`
**권한**: 기본 본인, `workerId` 지정은 role=admin만(403)

**응답 200**
```json
{
  "data": [
    { "id": 42, "startedAt": "...", "endedAt": "...", "visitCount": 5, "fieldCount": 3 }
  ],
  "page": 1, "pageSize": 50, "totalPages": 2, "total": 87
}
```

### 2.5 `GET /trips/{id}` (Feature 6)
외근 상세 + 방문 타임라인.

**권한**: 소유자 본인 또는 관리자(403)
**응답 200**
```json
{
  "data": {
    "trip": { "id", "workerId", "startedAt", "endedAt" },
    "visits": [
      { "id", "fieldId", "field": { "address", "status" },
        "visitedAt", "status", "memoCount", "photoCount", "voiceMemoCount" }
    ]
  }
}
```
visits는 `visitedAt asc`.

### 2.6 `GET /trips/{id}/audit-log` (Feature 5, 관리자 전용)
외근 상태 전환·기간 변경 이력 조회.
**응답 200**: `{ "data": { "events": [ { "action", "actor", "timestamp", "ip" } ] } }`

---

## 3. 방문 기록(Visit)

### 3.1 `POST /visits` (Feature 7)
현장 체크인.

**요청 body**
```json
{ "fieldId": 12, "tripId": 42, "visitedAt": "...", "lat": 35.1577, "lng": 129.0593 }
```

**검증**
- `tripId`의 소유자가 본인 + `endedAt = null`(진행 중) — 아니면 409 `NO_ACTIVE_TRIP`
- `fieldId`의 좌표와 제공된 `lat/lng` 간 거리 **geofence 반경 150~200m 이내** — 벗어나면 409 `OUT_OF_GEOFENCE` (관리자는 `?force=true`로 우회 가능)
- 위치정보 동의(`user.locationConsent == true`) 확인, 없으면 403 `LOCATION_CONSENT_REQUIRED` (위치정보법 별도 동의)

**처리**: visit 생성, **초기 `status = "재방문필요"`** — "아직 결과 미지정" 의미의 placeholder. 작업자는 메모·사진 기록 후 `PATCH /visits/{id}/status`로 확정값 설정. (프런트 `visitStore.checkIn` 구현과 일치)

**응답 201**: `{ "data": { "visit": { "id", "tripId", "fieldId", "visitedAt", "status": "재방문필요" } } }`

### 3.2 `PATCH /visits/{id}/status` (Feature 7)
방문 결과 상태 지정.

**요청 body** `{ "status": "완료"|"부재"|"수취거절"|"주소불명"|"재방문필요"|"기타", "reason": "..." }`
- `status === "기타"`일 때 `reason`은 10자 이상 필수
- 6종 enum 이외 값 → 400

**처리**: visit.status 업데이트, 상태 변경 감사 로그 기록(1년 이상 보관).

**응답 200**: 업데이트된 visit.

### 3.3 `POST /visits/{id}/memos` (Feature 7)
텍스트 메모 추가 (방문 단위).

**요청 body** `{ "content": "..." }` (1~2000자)
**처리**: textMemo 생성(`visitId`, `fieldId` 자동 세팅), 현재 위치(`latitude/longitude`) 자동 기록.
**응답 201**: `{ "data": { "textMemo": { "id", "visitId", "fieldId", "content", "latitude", "longitude", "createdAt" } } }`

### 3.4 `POST /visits/{id}/photos` (Feature 7)
사진 첨부.

**요청**: `multipart/form-data` — `file`, (선택) `caption`
**파일 제약**: 최대 10MB, `image/jpeg|png|webp|heic`

**서버 처리 (중요)**
1. 업로드된 파일의 **EXIF GPS·촬영시각을 별도 컬럼(`latitude`, `longitude`, `captured_at`)으로 추출·정규화**
2. **원본 파일에서는 EXIF 메타데이터 제거(strip)** — 제3자 공유·대외 공개 시 개인정보 최소화 (개인정보보호법 제3조)
3. 원본(strip 후)은 **접근통제 스토리지**에 보관, 썸네일은 공개 CDN 가능
4. 카메라 기기 식별자(MakerNote 등)는 저장하지 않음

**응답 201**
```json
{ "data": { "photo": {
  "id", "visitId", "fieldId",
  "fileUrl", "thumbnailUrl",
  "latitude", "longitude",
  "capturedAt", "createdAt",
  "caption"
}}}
```
- `fileUrl`: 원본(EXIF strip 후) 접근통제 URL
- `thumbnailUrl`: 공개 CDN 썸네일 (선택, 프런트 현재 타입엔 없음 — 통합 시 확장)
- `capturedAt`: EXIF `DateTimeOriginal`에서 추출한 촬영 시각
- `createdAt`: DB 레코드 생성 시각

### 3.5 `POST /visits/{id}/voice-memos` (Feature 7)
음성 메모 업로드.

**요청**: `multipart/form-data` — `file`
**파일 제약**: 최대 녹음 5분, `audio/m4a|mp3|aac`
**처리**: 사용자 명시적 녹음 행위 후에만 업로드(클라이언트 책임, 무단 상시 녹음 금지 — 정보통신망법)
**응답 201**: `{ "data": { "voiceMemo": { "id", "visitId", "fieldId", "fileUrl", "durationSec", "latitude", "longitude", "createdAt" } } }`

### 3.6 `GET /visits/{id}` (Feature 7)
방문 상세 + 모든 첨부.

**권한**: 작성자(= trip owner) 또는 관리자
**응답 200**
```json
{ "data": { "visit": { ... },
  "field": { "id", "address", "status" },
  "memos": [...], "photos": [...], "voiceMemos": [...]
}}
```

### 3.7 `POST /fields/{fieldId}/memos` (Feature 7, 9)
**현장에 직접** 텍스트 메모 추가 (방문 세션 밖).

> 프런트 `TextMemo.visitId`가 `number | null`이므로 **visit 없이도 현장에 즉시 메모**를 붙일 수 있어야 한다. ER `text_memo.visit_id`도 nullable.

**요청 body** `{ "content": "..." }` (1~2000자)
**검증**: 해당 field가 본인 담당 또는 관리자(아니면 403)
**처리**: `visitId = null`, `fieldId` 경로에서 세팅, 현재 위치 자동 기록
**응답 201**: `{ "data": { "textMemo": { "id", "visitId": null, "fieldId", "content", "latitude", "longitude", "createdAt" } } }`

### 3.8 `POST /fields/{fieldId}/photos` (Feature 7, 9)
**현장에 직접** 사진 첨부. 파일 처리 규칙은 3.4와 동일(EXIF strip 등).

**요청**: `multipart/form-data` — `file`, (선택) `caption`
**응답 201**: 3.4와 동일 포맷이지만 `visitId: null`.

### 3.9 (선택) `POST /fields/{fieldId}/voice-memos` (Feature 7, 9)
현장 직접 음성 메모. 필요 시 3.5와 같은 정책으로 처리.

---

## 4. 현장(Field)

### 4.1 `GET /fields` (Feature 9, 지도 Feature 1·2도 이 엔드포인트 사용)
현장 목록.

**쿼리**
- `page`, `pageSize`
- `assignee=me|all` (기본 `me`, `all`은 관리자만 — 일반 사용자는 403)
- `status=pending|in_progress|done` (복수 가능, CSV)
- `search` (주소·이름 LIKE)
- `tags` (CSV, 현장 탭 필터용)
- `bbox=minLng,minLat,maxLng,maxLat` (**지도 뷰포트 내 현장만** 반환 — Feature 1·2 지도 최적화)

**정렬**: `status asc` → `updatedAt desc` (상태 우선 정렬)
**응답**
```json
{ "data": [ {
  "id", "address", "addressDetail", "latitude", "longitude",
  "status", "userId", "lastVisitedAt", "visitCount"
} ], "page", "pageSize", "totalPages", "total" }
```

### 4.2 `GET /fields/{id}` (Feature 9)
현장 상세.

**권한**: 담당자 본인 또는 관리자
**응답 200**
```json
{ "data": {
  "field": { ... },
  "recentVisits": [ ... 상위 10건, visitedAt desc ... ],
  "attachmentSummary": { "totalMemos", "totalPhotos", "totalVoiceMemos" }
}}
```

### 4.3 `POST /fields` (Feature 10)
현장 생성.

**요청 body**
```json
{ "address": "...", "addressDetail": "...",
  "latitude": 35.1577, "longitude": 129.0593,
  "assignedUserId": 1 }
```
> `name`·`tags`는 ER(`docs/mfjs.drawio.xml`)에 현재 없는 필드. Feature 12(현장 탐색·운영)에서 태그 도입 시 재논의. v0.1에선 제외.

**검증**
- `latitude` 33~43, `longitude` 124~132 (한반도 범위) — 벗어나면 400 `COORDS_OUT_OF_RANGE`
- `address` 필수
- **중복 주소 허용**: 도로명주소법상 상세주소(동·호)로 구분 정상. 동일 `address` 기존 존재 시 에러 없이 진행, UX상 프론트가 확인 모달 표시
- 일반 사용자 `assignedUserId`는 본인만 허용, 관리자는 임의 배정

**초기값**: `status = "pending"`, `createdAt = now`

**응답 201**: 생성된 field.

### 4.4 (선택) `GET /geocode?query={keyword}` (Feature 10)
Kakao Local API 프록시.
**용도**: 서버에서 Kakao REST 키 관리 — 클라이언트 직접 호출에서 이전할 경우.
**응답**: `{ "data": { "matches": [ { "addr", "roadAddr", "lat", "lng" } ] } }`

### 4.5 (선택) `POST /geocode/reverse` (Feature 10)
좌표 → 주소 역변환. 체크인 시 위치 검증 부가 정보로 사용.

### 4.6 `PATCH /fields/{id}` (Feature 11)
현장 수정.

**요청 body** (부분 업데이트, 전부 선택)
```json
{ "address?", "addressDetail?", "latitude?", "longitude?", "assignedUserId?", "status?" }
```
**권한**: 담당자 본인 또는 관리자
**처리**: `updatedAt = now`, 변경 이력 로그 저장.
**응답 200**: 업데이트된 field.

### 4.7 `DELETE /fields/{id}` (Feature 11)
현장 삭제 — **soft delete**.

**쿼리**: `?force=true` (연관 visit 있어도 강제 삭제, 관리자만)
**기본 동작**: 연관 visit 존재 시 → 409 `HAS_RELATED_VISITS` 반환 (프런트에서 confirm 모달 유도)
**처리**: `deletedAt = now`. 연관 visit/memo/photo는 유지(감사 이력).
**응답 204**.

### 4.8 `PATCH /fields/{id}/status` (Feature 11)
상태 전환.
**요청 body** `{ "status": "pending"|"in_progress"|"done" }`
**검증**: `done → pending` 되돌림은 관리자 전용(403 for worker)
**응답 200**: 업데이트된 field.

---

## 5. 보고서(Report)

### 5.1 `POST /reports` (Feature 13)
보고서 생성.

**요청 body**
```json
{ "tripId": 42, "title": "...", "content": "..." }
```
**검증**
- `tripId` NOT NULL, trip 존재 + 소유자 본인 또는 관리자(403)
- `title` 1~100자, `content` 10~50000자
- 한 trip에 복수 보고서 허용(N:1). 같은 trip에 동일 `title` 존재 시에도 **경고 없이 저장** (중복 경고 UX는 프런트 역할)

**처리**: `creatorId = current user`, `createdAt = now`.
**응답 201**: 생성된 report.

### 5.2 `GET /reports` (Feature 13)
본인 보고서 목록.

**쿼리**: `page`, `pageSize`, `search` (title+content LIKE), `tripId`, `startDate`, `endDate`
**기본**: 본인 작성 + `deletedAt = null`, 최신순
**응답**
```json
{ "data": [ {
  "id", "title", "tripId",
  "trip": { "startedAt", "endedAt" },
  "contentPreview", "createdAt", "updatedAt"
} ], ... }
```

### 5.3 `GET /reports/{id}` (Feature 13)
보고서 상세.
**권한**: 작성자 또는 관리자, `deletedAt = null` (soft-deleted는 404)
**응답 200**: 전체 report record + 연결 trip 요약.

### 5.4 `PATCH /reports/{id}` (Feature 13)
수정.
**요청 body**: `{ "title?", "content?" }` — **`tripId` 변경 금지**(400 `TRIP_ID_IMMUTABLE`)
**권한**: 작성자 본인 (관리자도 원칙상 수정 불가, 감사 영역)
**처리**: `updatedAt = now`, 수정 이력 보존(감사).
**응답 200**: 업데이트된 report.

### 5.5 `DELETE /reports/{id}` (Feature 13)
soft delete.
**권한**: 작성자 본인 또는 관리자
**처리**: `deletedAt = now`. trip·visit은 유지.
**응답 204**.

---

## 6. 정리 — 엔드포인트 요약

| # | Method | Path | Feature | 비고 |
|---|---|---|---|---|
| 1 | POST | /auth/signup | 15 | locationConsent 필수 |
| 2 | POST | /auth/login | 15 | 5회/15분 잠금 |
| 3 | POST | /auth/logout | 15 | |
| 4 | POST | /auth/refresh | 16 | 로테이션 |
| 5 | GET | /auth/me | 16 | |
| 6 | POST | /trips | 5 | 409 `ACTIVE_TRIP_EXISTS` |
| 7 | PATCH | /trips/{id}/end | 5 | |
| 8 | GET | /trips/active | 5 | |
| 9 | GET | /trips | 6 | 페이지네이션 |
| 10 | GET | /trips/{id} | 6 | 방문 타임라인 포함 |
| 11 | GET | /trips/{id}/audit-log | 5 | 관리자 |
| 12 | POST | /visits | 7 | geofence 150~200m, 초기 status `"재방문필요"` |
| 13 | PATCH | /visits/{id}/status | 7 | 6종 enum |
| 14 | POST | /visits/{id}/memos | 7 | body `{ content }` |
| 15 | POST | /visits/{id}/photos | 7 | EXIF strip, 응답 `fileUrl` |
| 16 | POST | /visits/{id}/voice-memos | 7 | |
| 17 | GET | /visits/{id} | 7 | |
| 18 | POST | /fields/{id}/memos | 7, 9 | **visit 없이 현장 직접** |
| 19 | POST | /fields/{id}/photos | 7, 9 | **visit 없이 현장 직접** |
| 20 | POST | /fields/{id}/voice-memos (opt) | 7, 9 | 선택 |
| 21 | GET | /fields | 9, 1, 2 | bbox·필터(지도 공용) |
| 22 | GET | /fields/{id} | 9 | |
| 23 | POST | /fields | 10 | 중복 주소 허용 |
| 24 | GET | /geocode (opt) | 10 | Kakao 프록시 |
| 25 | POST | /geocode/reverse (opt) | 10 | |
| 26 | PATCH | /fields/{id} | 11 | |
| 27 | DELETE | /fields/{id} | 11 | soft, 연관 409 |
| 28 | PATCH | /fields/{id}/status | 11 | done→pending 관리자만 |
| 29 | POST | /reports | 13 | N:1 |
| 30 | GET | /reports | 13 | |
| 31 | GET | /reports/{id} | 13 | |
| 32 | PATCH | /reports/{id} | 13 | tripId 불변 |
| 33 | DELETE | /reports/{id} | 13 | soft |

**합계**: 필수 30개 + 선택 3개(geocode 프록시 2 + 현장-직접 voice memo 1).

---

## 7. 이 문서 범위 밖 (후속 이터레이션)

| Domain | Feature | 보류 사유 |
|---|---|---|
| 지도 대시보드 | 3 — 지도 시각화 모드 | 행정구역 GeoJSON은 정적 자산, 히트맵·단계구분도는 클라이언트 집계 |
| 지도 대시보드 | 4 — 대시보드 보조 요소 | 클러스터링·KPI·저장 프리셋은 1차 이후 |
| 외근 | 5 — 상태 관리 (일부) | **외근 기간·예정지 변경 API**(PATCH /trips/{id}) — 공무원 복무규정 "지체없이 보고" 반영 UX는 Feature 8 자동화와 함께 정의 |
| 외근 | 8 — 자동화·보조 | 딥링크·도착 감지·최적 네비·오프라인 동작 |
| 현장 | 12 — 탐색·운영 | 검색·태그·일괄 import CSV |
| 보고서 | 14 — 자동화·공유 | 초안 자동 채움·AI 생성(Vertex AI Gemini)·PDF 내보내기 |
| 시스템 | 17 — 약관·권한 | 약관 버전 API, 동의 이력 조회 (signup에서 최소만 커버) |
| 시스템 | 18 — 프로필·환경 | 프로필 상세 수정, **비밀번호 변경(PATCH /auth/password)**, 알림 설정, 다크모드 서버 저장 |

## 8. 통합 시 프런트가 해야 할 일

현재 프런트 프로토타입(`src/types/entities.ts`, `src/stores/*.ts`)은 in-memory 목업 기준이다. 실제 백엔드 연동 시점에 아래 항목을 처리해야 한다 — 이 MD의 응답 포맷을 그대로 받으려면 필수:

### 8.1 타입 확장
- **`User`** (현 `{ id, createdAt }`) → `{ id, email, name, role, createdAt }` 로 필드 추가
- **`Photo`** (현 `{ ..., fileUrl, createdAt }`) → `capturedAt`(EXIF), `thumbnailUrl?`(선택), `caption?` 추가
- **`VoiceMemo`** → `durationSec` 추가 (타입에 없음)
- **집계가 덧붙은 목록 응답**은 확장 타입으로 분리 예정:
  - `TripSummary = Trip & { visitCount, fieldCount }` (for `GET /trips`)
  - `FieldSummary = Field & { lastVisitedAt, visitCount }` (for `GET /fields`)
  - `VisitTimelineItem = Visit & { memoCount, photoCount, voiceMemoCount, field: { id, address, status } }` (for `GET /trips/{id}`)
- 일반 `User`/`Photo`/… 타입과는 별개로, list/summary 응답용 타입을 분리해 프런트 컴포넌트가 집계 필드에 의존하지 않는 경우와 분리

### 8.2 API client 레이어
- `{ "data": ... }` wrapper를 자동 unwrap하는 fetch/axios interceptor 추가
- Bearer token을 요청에 자동 첨부 + 401 수신 시 `/auth/refresh` 자동 재시도 + 실패 시 로그인 이동
- **페이지네이션 응답** 처리 — 현재 프런트는 전체를 in-memory 보관. 목록 화면에 infinite scroll 또는 page-by-page 로딩 구조 도입 필요

### 8.3 상태 관리 전환
- Zustand 스토어에 박혀있는 seed 데이터(`src/data/mockSeed.ts`) 제거
- 각 store의 CRUD 액션을 **API 호출 + 낙관적 업데이트 or 재패치**로 전환 (React Query/TanStack Query 도입 검토)
- `activeTripId`는 `GET /trips/active`로 앱 부팅 시 초기화

### 8.4 비밀번호·프로필은 Feature 18에서
`PATCH /auth/password`, 프로필 수정, 알림 설정 등은 Feature 18 범위. 이 MD 다음 버전에서 합류.

---

## 9. 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-04-24 | 초안 작성(v0.1) — 프로토타입 시연 기반 28 + 2 엔드포인트. Feature 7 geofence·위치동의, Feature 9 bbox 필터, Feature 15 locationConsent·약관 버전을 Notion 4컬럼 표와 상호 정합성 맞춤. `PATCH /auth/password`는 Feature 18 범위로 이동 |
| 2026-04-24 | v0.2 — 프런트 타입과의 키·구조 불일치 7건 정렬: (1) `memos.body.text` → `content`, (2) `photos.url` → `fileUrl` + `takenAt` 제거 + `capturedAt`/`createdAt` 분리, (3) `voice-memos.url` → `fileUrl`, (4) Visit 체크인 초기 status `"재방문필요"` 확정, (5) 현장-직접 첨부 엔드포인트 `POST /fields/{id}/memos`·`/photos`·`/voice-memos` 3개 신설(visitId null 지원), (6) 응답 전반에 명시적 객체 스펙, (7) §8 "통합 시 프런트가 해야 할 일" 신설 — User/Photo 타입 확장, API client 레이어, pagination, 집계 필드 확장 타입 분리 |
