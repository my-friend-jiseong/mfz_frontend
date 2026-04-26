# Phase 3 — 백엔드 보강 요청 + 프런트 후속 작업

> **작성일**: 2026-04-27
> **현황**: Phase 1·2 합쳐 25개 endpoint 연동 완료(`main` 머지·푸시 완료, commit `685e118`).
> **목적**: (a) Phase 2 요청 중 백엔드가 일부만 반영해 남은 이슈, (b) 운영을 위한 신규 보강 요청, (c) 프런트가 이어가야 할 PR-G~K 작업을 한 문서에 통합.
> **수신**: 백엔드 팀(§1, §2) + 프런트 팀 본인(§3 이후)

---

## 0. 우선순위 한 눈에

| 순위 | 항목 | 카테고리 | 차단도 | 처리 주체 |
|---|---|---|---|---|
| **P0** | [§1.1] 4xx 에러 응답 status code 분기 + `code` 필드 분리 | 백엔드 회귀 | 🔴 분기 UX 정확도 저하 | 백엔드 |
| **P0** | [§1.2] `creator.name` 이 user.id 와 동일 (이름 미매핑) | 백엔드 버그 | 🔴 작성자 이름이 안 보임 | 백엔드 |
| **P0** | [§3.1] PR-G 사진·음성 multipart 화면 통합 | 프런트 | 🔴 시연 핵심 — 메모만으론 한계 | 프런트 |
| **P1** | [§1.3] `userId` vs `assigneeUserId` 정렬 (둘 다 옴) | 백엔드 회귀 | 🟡 어느 쪽 신뢰? | 백엔드 |
| **P1** | [§2.1] `/api/reports/generate` 응답 shape 명세 | 백엔드 신규 | 🟡 AI 흐름 시작 전 차단 | 백엔드 |
| **P1** | [§2.2] 비밀번호 변경 `PATCH /auth/password` | 백엔드 신규 | 🟡 Feature 18 기본 기능 | 백엔드 |
| **P1** | [§3.2] PR-H Reports `generate` AI 흐름 + UI 재설계 | 프런트 | 🟡 시연 차별화 포인트 | 프런트 |
| **P2** | [§1.4] `/api/fields/address/search` 빈 결과 (Daum/Kakao 키 미설정 추정) | 백엔드 회귀 | 🟢 mock 주소 우회 중 | 백엔드 |
| **P2** | [§1.5] 4xx body 에 `fields` 객체 (검증 필드별 메시지) | 백엔드 회귀 | 🟢 단일 메시지로도 동작 | 백엔드 |
| **P2** | [§2.3] `Retry-After` 헤더 + `LOGIN_LOCKED retryAfter` | 백엔드 신규 | 🟢 잠금 카운트다운 | 백엔드 |
| **P2** | [§2.4] 관리자 토큰 발급 흐름 (admin role 시나리오) | 백엔드 신규 | 🟢 Phase 3 후반 | 백엔드 |
| **P2** | [§3.3] PR-I 외근 자동화 (geofence/navigation/오프라인 큐) | 프런트 | 🟢 jy 진행분과 정합 | 프런트 |
| **P3** | [§3.4] PR-J 관리자 전용 화면 | 프런트 | 🟢 admin 토큰 흐름 후 | 프런트 |
| **P3** | [§3.5] PR-K 정리·튜닝 | 프런트 | 🟢 인지 부담 정리 | 프런트 |

---

## 1. 백엔드 — Phase 2 미반영·회귀 이슈

> 모두 [docs/backend_requests_phase2.md](backend_requests_phase2.md) 에서 이미 요청한 항목 중 **부분 반영** 또는 **회귀**된 사항. 우선 처리 부탁드립니다.

### 1.1 [P0] 4xx 에러 응답 — status 분기 + `code` 필드 분리

**문제 (실측, [_swagger_responses.md §7](_swagger_responses.md))**

| 시나리오 | 요청서 | 실측 |
|---|---|---|
| 중복 이메일 | **409** + `code: "EMAIL_TAKEN"` | **400** + `{"error":"email_already_exists"}` |
| 약한 비밀번호 | 400 + `code: "PASSWORD_POLICY_VIOLATION"` + `fields` | 400 + `{"error":"password_too_short"}` |
| termsAgreed=false | 400 + `code: "TERMS_NOT_AGREED"` | 400 + `{"error":"terms_required"}` |
| password ≠ confirm | 400 + `code: "PASSWORD_MISMATCH"` | 400 + `{"error":"password_confirm_mismatch"}` |
| 로그인 실패 | 401 + `code: "INVALID_CREDENTIALS"` | (미검증, 동일 패턴 추정) |

**현재 영향**
- 모든 검증 실패가 HTTP 400 — 클라이언트가 status 만으론 분기 불가능
- `error` 필드가 영문 식별자 + 한국어 메시지 역할 겸함 → 프런트가 별도 매핑 테이블 보유 (`src/api/errors.ts`)
- 신규 코드 추가 시 클라이언트가 메시지 못 보여줌

**요청 (재확인)**
```http
HTTP/1.1 409 Conflict
Content-Type: application/json
{
  "error": "이미 가입된 이메일입니다",   // ← 한국어, 사용자에게 그대로 표시 가능
  "code": "EMAIL_TAKEN",                 // ← 영문 enum, UI 분기 키
  "retryable": false
}
```

**status 분기 가이드**
| code | status |
|---|---|
| `EMAIL_TAKEN` | 409 |
| `INVALID_CREDENTIALS` | 401 |
| `LOGIN_LOCKED` | 429 (+ `Retry-After` 헤더) |
| `FORBIDDEN` (권한 부족) | 403 |
| `NOT_FOUND` | 404 |
| `HAS_RELATED_VISITS` (현장 삭제) | 409 |
| `ACTIVE_TRIP_EXISTS` | 409 |
| `OUT_OF_GEOFENCE` | 409 |
| 그 외 입력값 검증 | 400 |

### 1.2 [P0] `creator.name` 이 `user.id` 와 동일 — 이름 미매핑 버그

**현상**
```http
GET /api/reports/{reportId}
{
  ...,
  "creator": {
    "id": "eedeb9ae-9187-4efb-9d1a-73a4615da62e",
    "name": "eedeb9ae-9187-4efb-9d1a-73a4615da62e"   // ← user.id 가 그대로 들어옴
  }
}
```

**기대**: `name` 에 가입 시 입력한 사용자 이름 (`User.name`).

DB join 누락 또는 select 매핑 오류로 추정. 보고서 상세 화면 + 공유 화면에서 작성자 이름이 UUID 로 보여 사용자 혼란.

### 1.3 [P1] `userId` vs `assigneeUserId` 정렬

**현상**
- `GET /api/fields/mine` items[]: **`userId`, `assigneeUserId` 둘 다 응답** (값 동일)
- `GET /api/fields/{id}` detail: **`assigneeUserId` 만**
- `POST /api/fields/{id}/assignee` 입력 (스웨거): `assignedUserId` (request body)
- `PATCH /api/fields/{id}` 입력: `assignedUserId` (request body)

**요청**: 응답은 일관되게 **`assigneeUserId`** 로 통일 (의미상 명확). `userId` 는 응답에서 제거. 입력 body 의 `assignedUserId` 와는 동사/명사 차이라 다른 키여도 무방.

### 1.4 [P2] `/api/fields/address/search` 항상 빈 결과

**현상**: Daum/Kakao API 키 미설정 추정. 응답 `provider` 메타는 정상.

**요청**: 운영 환경에 키 설정 + `items[]` shape 명세 (필드명: `roadAddress`, `jibunAddress`, `lat`, `lng`, `buildingName` 등).

### 1.5 [P2] 4xx body 에 `fields` 객체 (필드별 메시지)

**현재**: 단일 `error` 만.

**요청**: 다중 필드 검증 실패 시
```json
{
  "error": "입력값이 올바르지 않습니다",
  "code": "VALIDATION_FAILED",
  "fields": {
    "password": "10자 이상이어야 합니다",
    "name": "이름을 입력해주세요"
  }
}
```
프런트가 input 하단에 필드별 메시지 표시 가능.

---

## 2. 백엔드 — 운영을 위한 신규 보강 요청

### 2.1 [P1] `POST /api/reports/generate` — 응답 shape 명세

**현재**: 스웨거에 description 만 있고 응답 schema 부재.

**요청**: 입력(multipart) + 응답 shape 명시.

추정 입력:
```http
POST /api/reports/generate
Content-Type: multipart/form-data

tripId: "trip-..."             # 또는 visitIds[]
visitIds: "visit-..., visit-..."  # 다중
extraNotes: "추가 메모"          # 선택
```

추정 응답:
```json
{
  "success": true,
  "data": {
    "id": "report-...",
    "tripId": "...",
    "title": "AI 자동 생성 — ...",
    "content": "Gemini 가 작성한 본문",
    "summary": "요약",
    "generatedByAi": true,
    "outputFileUrl": "/files/reports/abc.docx",
    "generationMetadata": { "model": "gemini-...", "tokens": 1234, "elapsedMs": 5000 },
    ...
  }
}
```

**확인 사항**
- visit·photo 첨부 다중 시 multipart 필드명 (`visit_ids`, `photo_files[]`?)
- 처리 시간 (동기 응답인지, 작업 큐 + polling 인지)
- 실패 시 응답 (모델 호출 실패, 토큰 한도, 부적절 컨텐츠 검출 등)

### 2.2 [P1] `PATCH /auth/password` — 비밀번호 변경

**용도**: 로그인된 사용자가 비밀번호 변경 (Feature 18).

**요청 body**
```json
{
  "currentPassword": "...",
  "newPassword": "...",
  "newPasswordConfirm": "..."
}
```

**검증**
- `currentPassword` 일치 확인 → 불일치 401 `INVALID_CREDENTIALS`
- `newPassword` KISA 정책 (10자 이상 + 영대/영소/숫자/특수문자 3종) → 400 `PASSWORD_POLICY_VIOLATION`
- `newPassword === currentPassword` → 400 `PASSWORD_REUSE`
- `newPassword !== newPasswordConfirm` → 400 `PASSWORD_MISMATCH`

**처리**
- 새 해시 저장 + **모든 기존 refresh token 무효화** (재로그인 강제)
- 변경 이력 감사 로그 (1년 보관)

**응답 200**
```json
{
  "message": "비밀번호가 변경되었습니다. 다시 로그인해주세요.",
  "revokedSessionCount": 3
}
```

### 2.3 [P2] 로그인 잠금 — `Retry-After` 헤더 + `retryAfter` 필드

**용도**: 5회 연속 실패 → 15분 잠금 UX. 클라이언트가 카운트다운 표시.

**응답 (잠금 시)**
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 900
Content-Type: application/json
{
  "error": "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요",
  "code": "LOGIN_LOCKED",
  "retryAfter": 900           // 초 단위
}
```

### 2.4 [P2] 관리자 토큰 발급 절차

**현재**: 스웨거 description — `signAccessToken` 으로 직접 서명 (백엔드 개발자만)

**요청**: 둘 중 하나
1. **`PATCH /api/users/{userId}/role`** (super-admin 전용) — 일반 사용자를 admin 으로 승급
2. **백엔드 서버 측 환경변수** 로 admin 이메일 화이트리스트 → 해당 계정 가입/로그인 시 자동 admin role 부여

이게 들어와야 프런트가 admin 시나리오(현장 담당자 변경, /api/fields 전체 조회, /api/map/fields) 화면을 만들 수 있음.

### 2.5 [P2] 보고서 공유 링크 — 만료·재발급·해제

**현재**: `POST /api/reports/{id}/share` — 토큰 발급. 만료시간·재발급·취소 미명세.

**요청**
- 발급 시 응답에 `expiresAt` (예: 7일 후) 포함
- `POST /api/reports/{id}/share` 재호출 시: 이전 토큰 무효 + 새 토큰? 아니면 동일 토큰 유지?
- `DELETE /api/reports/{id}/share` — 공유 해제 (토큰 무효화)

### 2.6 [P3] 사진·음성 multipart 응답 shape 명세

**현재**: 스웨거에 입력 multipart 명시, 응답 description 만.

**요청**: 응답에 `attachment` 객체 shape 명시 — `id`, `fieldId`, `visitId`, `type`, `fileUrl`, `thumbnailUrl?`, `capturedAt?`, `durationSec?`, `mimeType`, `byteSize` 등. PR-G 시작 전에 확정 필요.

### 2.7 [P3] 외근 변경 시 보고 — `POST /api/trips/{tripId}/official-notice` 응답 shape

스웨거에 endpoint 만 있고 입력·응답 미명세. PR-I 작업 시 필요.

---

## 3. 프런트 — Phase 3 PR 계획

### 3.1 [P0] PR-G — 사진·음성 multipart 화면 통합

**목표**: visits 체크인 + fields 직접 첨부 화면에서 카메라/사진 라이브러리/녹음 활성화.

**의존성 추가**
```bash
npx expo install expo-image-picker expo-av expo-file-system
```

**권한 처리**
- iOS `Info.plist`: `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSMicrophoneUsageDescription`
- Android: `CAMERA`, `READ_EXTERNAL_STORAGE`, `RECORD_AUDIO` (Android 13+ 분기)
- `app.json` 의 plugins 항목으로 자동 처리

**화면 변경**
1. `app/(tabs)/fields/[id]/checkin.tsx` — `handleAddPhoto` 의 Alert placeholder 제거
   - `ImagePicker.launchCameraAsync` + `launchImageLibraryAsync` 선택 모달
   - 결과 `{ uri, fileName?, mimeType? }` → `visitsApi.addPhoto({ uri, name, type })`
2. 음성: `Audio.Recording` 으로 5분 제한 녹음 → `Audio.recording.stopAndUnloadAsync` → uri 전달
3. `app/(tabs)/fields/[id]/index.tsx` — 직접 첨부 섹션에도 사진/음성 버튼 추가

**store 변경**
- `visitStore` 의 `addPhoto/addVoiceMemo` 시그니처 재검토 (이미 `{ uri, name, type }` 받음 — OK)
- `fieldStore` 에 `addPhoto`, `addVoiceMemo` 액션 추가 (api 함수는 이미 준비)

**검증**
- iOS/Android 권한 거부 → 안내 (`Linking.openSettings()`)
- 큰 파일 업로드 시 진행률 (RN fetch 는 progress 미지원 → axios + onUploadProgress 또는 XMLHttpRequest 우회 — 또는 단순 spinner 로 대체)
- 응답 attachment shape 검증 (§2.6 필요)

### 3.2 [P1] PR-H — Reports `generate` AI 흐름

**목표**: "외근 → AI 자동 보고서 생성" UX. 수동 작성과 별개 진입점.

**의존성**: §2.1 응답 shape 확정 후

**UI 흐름**
1. 외근 상세 (`/(tabs)/trips/[id]`) 의 `reportEntryPoint.createUrl` 활용 — "AI 보고서 생성" 버튼
2. 신규 화면 `app/(tabs)/reports/generate.tsx`:
   - 외근의 visit 목록 표시 → 체크박스로 포함할 visit 선택
   - 각 visit 의 attachments 미리보기
   - "추가 메모" textarea (선택)
   - "생성" 버튼 → loading (예상 시간 5~30초)
   - 응답 받으면 `outputFileUrl` 다운로드 + 본문 미리보기 + "수정해서 저장" / "이대로 저장"
3. 기존 `reports/new.tsx` 는 수동 작성 유지

**store 변경**
- `reportStore.generate(formData)` 추가
- 응답이 wrapper 면 unwrap

### 3.3 [P2] PR-I — 외근 자동화 (jy 코드와 정합성 정리)

**선행**: jy 가 추가한 코드 dry-read
- `src/stores/destinationStore.ts` (89줄)
- `src/utils/kakaoMap.ts` (28줄)
- `app/(tabs)/trips/active.tsx`
- `app/(tabs)/trips/new/{order,select}.tsx`

**연동 대상 endpoint**
- `POST /api/trips/{tripId}/geofences/register` — 도착 감지용 geofence 등록
- `POST /api/trips/{tripId}/geofences/arrival` — 도착 이벤트 보고
- `POST /api/trips/{tripId}/navigation/deep-links` — 외부 지도 앱 길안내
- `POST /api/trips/{tripId}/navigation/optimize` — 다중 현장 동선 최적화
- `POST /api/trips/offline/queue` / `flush` — 오프라인 큐
- `POST /api/trips/{tripId}/official-notice` — 보고 필요 표시 (§2.7)
- `GET /api/trips/state-history` — 상태 전환 이력 (감사용)
- `GET /api/map/current-location-config` — 현재 위치 UX 설정

**RN 의존성** (필요 시)
- `expo-location` (이미 jy 가 추가했을 가능성, 확인)
- `react-native-background-geolocation` 또는 expo-task-manager 의 백그라운드 위치 (geofence)
- AsyncStorage 또는 expo-sqlite (오프라인 큐)

### 3.4 [P3] PR-J — 관리자 전용 화면

**선행**: §2.4 admin 토큰 발급 절차 확정

**대상**
- `GET /api/fields` — 전체 현장 목록
- `PATCH /api/fields/{id}/assignee` — 담당자 변경 (드롭다운으로 사용자 선택)
- `GET /api/map/fields` — 모든 마커 (admin 전용 지도)
- `GET /api/trips/{id}/audit-log` (검토) — 외근 상태 전환 이력

**UI 흐름**
- 사용자 role 이 `admin` 일 때만 노출되는 별도 탭 또는 설정 메뉴 진입점
- 일반 사용자가 admin endpoint 시도 시 받는 403 — 친절한 안내

### 3.5 [P3] PR-K — 정리·튜닝

- `client.ts` 의 `__DEV__` 응답 dump 를 endpoint별 화이트리스트 또는 4xx/5xx 만 dump 로 축소 (현재 모든 응답 verbose)
- `mockSeed.ts` 검토 — 실 API 연동 후 사용 안 되는 시드는 제거 (이미 일부 비어있음)
- `backend_requests_phase2.md` 를 `docs/archive/` 폴더로 이동 (반영 끝난 부분 명시)
- 의존성 정리 — `npm audit fix` 시도, dependabot 알림 (2 moderate) 해소
- HTTPS 전환 시 `app.json` 의 `usesCleartextTraffic`/`NSAppTransportSecurity` 예외 제거 + `.env` URL 업데이트
- `creator.name` 백엔드 버그 수정 후, 프런트의 임시 fallback 코드(`creator.name === creator.id` 체크) 제거

---

## 4. 검증 protocol

### 4.1 Phase 2 시연 풀 시나리오 (PR-G 시작 전 회귀 검증)

| 단계 | 행동 | 기대 |
|---|---|---|
| 1 | 회원가입 (새 이메일, `Seoul!2026ab`) | 자동 로그인 → 외근 탭 진입 |
| 2 | 동일 이메일 재가입 시도 | "이미 가입된 이메일" Alert + 로그인 화면 이동 옵션 |
| 3 | 약한 비번 (`abcd`) 가입 시도 | 친절한 메시지 |
| 4 | 외근 시작 → 현장 등록 (Mock 주소) | 지도 마커 위치 정확 (lat/lng 응답 보강 확인) |
| 5 | 현장 상세 → 직접 메모 추가 | 백엔드 저장 + 즉시 표시 |
| 6 | 현장 상태 변경 (pending → in_progress) | UI 즉시 반영 |
| 7 | 체크인 → 메모 추가 → 결과 "부재" | 한글 enum 통과 |
| 8 | 외근 종료 (방문 0건이면 confirm) | banner 사라짐 |
| 9 | 보고서 작성 (tripId 없이도 가능) | 목록·상세 표시 |
| 10 | 보고서 수정 → 공유 링크 발급 | URL 클립보드 복사 |
| 11 | 비로그인 브라우저로 공유 URL 열기 | `app/shared/{token}` 미리보기 |
| 12 | 보고서 삭제 | 목록에서 사라짐 |
| 13 | 앱 완전 종료 후 재실행 | 자동 세션 복원 (외근·보고서 그대로) |
| 14 | 현장 삭제 (방문 1건 있는 현장) | 409 confirm → 강제 삭제 (관리자만) |

각 단계에서 **콘솔의 `[api]` dev 로그** 캡처 — 비정상 응답 발견 시 백엔드 측 회귀 가능성.

### 4.2 PR 단위 게이트
- 매 PR: `npx tsc --noEmit` 0 에러
- 화면 변경 PR: 실 디바이스에서 해당 시나리오 1회 통과
- 의존성 추가 PR: `npx expo install` 사용 (Expo SDK 호환 버전 자동 매칭)

---

## 5. 일정·진행 순서 제안

### 5.1 백엔드 차단 항목
- §1.1 (status 분기 + code) — P0, **PR-G 까지는 우회 가능** 하지만 PR-J (관리자) 시작 전 필요
- §1.2 (creator.name) — P0, 보고서 화면 사용자 신뢰도 직접 영향
- §2.1 (generate 응답 shape) — PR-H **시작 자체를 차단**

### 5.2 프런트 진행 권장 순서

1. **PR-G** (사진·음성 통합) — 백엔드 §2.6 응답 shape 명세 받으면 바로
2. (백엔드 §1.1·§1.2·§2.1 처리 대기)
3. **PR-H** (AI 보고서 생성) — §2.1 받은 후
4. **PR-I** (외근 자동화) — jy 코드 정합 + §2.7 받은 후
5. **PR-J** (관리자) — §2.4 admin 토큰 흐름 확정 후
6. **PR-K** (정리) — 위 모두 끝난 후

### 5.3 분기점

- 백엔드 응답이 늦으면 **PR-G + 시연 풀 검증** 만 1차 마일스톤으로 끊고, 사용자 시연 데이터 수집·피드백 받는 사이클 진행
- jy 의 외근 자동화 코드가 이미 충분히 진행돼 있으면 PR-I 의 통합·정합 작업 비중이 커짐 → 사전에 jy 와 합의 후 진행

---

## 6. 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-04-27 | Phase 3 초안 — 백엔드 미반영 5건 + 신규 보강 7건 + 프런트 PR-G~K 5건 + 검증 protocol |

---

## 7. 참조 문서

- [docs/backend_api_request.md](backend_api_request.md) — 프런트 명세 v0.2 (Phase 1 시점)
- [docs/backend_requests_phase2.md](backend_requests_phase2.md) — Phase 2 백엔드 요청 (대부분 반영됨)
- [docs/_swagger.json](_swagger.json) — 현재 백엔드 OpenAPI 스펙 (54 endpoints)
- [docs/_swagger_responses.md](_swagger_responses.md) — 실 응답 캡처 (Phase 0 + Phase 2 검증 결과)
- [docs/api_integration_plan.md](api_integration_plan.md) — 프런트 연동 계획 v0.2 (Phase 2 PR 분할)
