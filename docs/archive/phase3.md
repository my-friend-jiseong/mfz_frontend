# Phase 3 — 백엔드 보강 요청 + 프런트 후속 작업

> **작성일**: 2026-04-27
> **현황**: Phase 1·2 합쳐 25개 endpoint 연동 완료(`main` 머지·푸시 완료, commit `685e118`).
>
> **🟢 백엔드 Phase 3 완료 통보 (2026-04-27)** — [docs/backend_phase3_complete.md](backend_phase3_complete.md). 본 문서의 대부분 항목 반영됨:
> - §1.1 4xx 일관성: 인증 정교화 보류 정책에 따라 미진행 (의도)
> - §1.2 creator.name: ✅ 반영 (`USERS_AUTH` 매핑)
> - §1.3 userId 정렬: ✅ 반영 (mine items 의 `userId` 제거)
> - §1.4 address/search: ✅ 반영 (목업 결과 + `buildingName` shape)
> - §1.5 fields 객체: 인증 정교화 보류 (의도)
> - §2.1 generate 응답 shape: ✅ 반영 (`ReportGenerateSuccessData`, Bearer 필수, multipart body)
> - §2.2 공유 만료/재발급/해제: ✅ 반영 (`expiresAt`/`shareExpiresAt`, `DELETE .../share`)
> - §2.3 사진/음성 응답 shape: ✅ 반영 (5개 Attachment schema)
> - §2.4 official-notice 응답 shape: ✅ 반영 (`OfficialNoticeResponse`)
>
> 보너스: 비밀번호 정책 8자만, 회원가입 잠금 제거 (회원가입/로그인 간소화 정책에 부합).
> **목적**: (a) Phase 2 요청 중 백엔드가 일부만 반영해 남은 이슈, (b) 운영을 위한 신규 보강 요청, (c) 프런트가 이어가야 할 PR-G~K 작업을 한 문서에 통합.
> **수신**: 백엔드 팀(§1, §2) + 프런트 팀 본인(§3 이후)

---

## 0. 작업 원칙

> **두 가지 보류 영역 (이번 사이클에서 진행 안 함)**
>
> 1. **관리자(admin) Actor 부재** — 본 서비스는 단일 Actor (필드 워커) 만 존재. 백엔드 스웨거에 admin 전용으로 표시된 endpoint (`GET /api/fields`, `PATCH /api/fields/{id}/assignee`, `GET /api/map/fields`) 와 admin role·권한 분기·관리자 화면(舊 PR-J) 은 **모두 사용하지 않음**.
> 2. **회원가입/로그인 정교화 보류** — 인증 화면은 의도적으로 간소화된 상태 유지. 따라서 **§1.1 (4xx status·code 분리), §1.5 (`fields` 객체), §2.2 (PATCH /auth/password)** 등 인증 메시지·세션 정교화 요구는 본 사이클에서 다루지 않음. 회원가입/로그인 자체는 동작하므로 시연·검증에 영향 없음.

## 0.1 노션 우선 — Feature 매핑 표

[노션 아이디어 보드 DB](https://www.notion.so/01bbd7a8eb4882e38efc017749e9ef7f) 에 등록된 21개 Feature 중 프런트 미구현/부분 구현 항목 위주로 우선순위 재정렬.

| 순위 | 노션 Feature (Domain) | 프런트 상태 | 작업 | 차단·의존 |
|---|---|---|---|---|
| **P0** | 방문 기록 (외근) — 사진·음성 첨부 | 🟡 텍스트 메모만, 사진/음성 placeholder | **PR-G** 카메라/마이크 통합 | §2.4 응답 shape 받으면 즉시 |
| **P0** | `creator.name` 이름 미매핑 | (구현됐으나 표시 깨짐) | 백엔드 §1.2 | 백엔드 단독 |
| **P1** | 외근 자동화·보조 (외근) | 🔴 미구현 (jy 가 일부 진행 중) | **PR-I** geofence/navigation/오프라인/official-notice | jy 코드 dry-read + §2.5 |
| **P1** | 보고서 자동화·공유 (보고서) — AI 자동 생성 | 🟡 공유 링크만, generate 미통합 | **PR-H** AI 흐름 + UI 재설계 | §2.1 응답 shape 받은 후 |
| **P1** | `/api/reports/generate` 응답 shape | (백엔드 미명세) | 백엔드 §2.1 | 백엔드 단독 |
| **P1** | `userId` vs `assigneeUserId` 정렬 | (둘 다 받아 fallback 중) | 백엔드 §1.3 | 백엔드 단독 |
| **P1** | 사진·음성 multipart 응답 shape | (백엔드 미명세) | 백엔드 §2.4 | PR-G 시작 차단 |
| **P2** | 현장 탐색·운영 (현장 관리) | 🟡 mine 필터 일부 (status/visitDateScope), search·tag UI 없음 | **신규 PR** 검색·태그·일괄 import | 노션 본문 검토 후 |
| **P2** | 보고서 공유 링크 만료·재발급·해제 | 🟡 발급만 | 백엔드 §2.3 + 프런트 보강 | 노션 §"PDF 내보내기/공유" 에 명시 필요 |
| **P2** | `/api/fields/address/search` 빈 결과 | (mock 주소 우회) | 백엔드 §1.4 | mock 우회 중이라 비차단 |
| **P3** | 지도 기본 조작·시각화 모드·데이터 필터·대시보드 보조 요소 | 🟡 일부 구현 (Kakao WebView, MapFilterBar) | 노션 본문 검증 후 결정 | 본문 미확인 |
| **P3** | 외근 변경 보고 응답 shape (official-notice) | (백엔드 미명세) | 백엔드 §2.5 | PR-I 합류 |
| **P3** | 정리·튜닝 (코드 — 노션 무관) | (필요 시) | **PR-K** | 의존 없음 |

---

## 1. 백엔드 — Phase 2 미반영·회귀 이슈

> 모두 [docs/backend_requests_phase2.md](backend_requests_phase2.md) 에서 이미 요청한 항목 중 **부분 반영** 또는 **회귀**된 사항. 우선 처리 부탁드립니다.

### 1.1 [보류] 4xx 에러 응답 — status 분기 + `code` 필드 분리

> **보류 사유**: 회원가입/로그인은 의도적 간소화 영역. 현재 클라이언트 매핑 (`src/api/errors.ts`) 으로 동작하므로 백엔드 일관성 정렬은 인증 정교화 사이클에서 다룸.

**문제 (실측, [_swagger_responses.md §7](../_swagger_responses.md))**

| 시나리오 | 요청서 | 실측 |
|---|---|---|
| 중복 이메일 | **409** + `code: "EMAIL_TAKEN"` | **400** + `{"error":"email_already_exists"}` |
| 약한 비밀번호 | 400 + `code: "PASSWORD_POLICY_VIOLATION"` + `fields` | 400 + `{"error":"password_too_short"}` |
| termsAgreed=false | 400 + `code: "TERMS_NOT_AGREED"` | 400 + `{"error":"terms_required"}` |
| password ≠ confirm | 400 + `code: "PASSWORD_MISMATCH"` | 400 + `{"error":"password_confirm_mismatch"}` |
| 로그인 실패 | 401 + `code: "INVALID_CREDENTIALS"` | (미검증, 동일 패턴 추정) |

> 로그인 잠금(LOGIN_LOCKED / 5회 실패 후 잠금) 정책은 백엔드에서 제거됨. 매핑·UX 모두 불필요.

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
| `FORBIDDEN` (본인 소유가 아닌 자원 접근 등) | 403 |
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

### 1.5 [보류] 4xx body 에 `fields` 객체 (필드별 메시지)

> **보류 사유**: §1.1 과 동일. 회원가입/로그인 정교화 사이클에서 다룸.

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

### 2.2 [P2] 보고서 공유 링크 — 만료·재발급·해제

**현재**: `POST /api/reports/{id}/share` — 토큰 발급. 만료시간·재발급·취소 미명세.

**요청**
- 발급 시 응답에 `expiresAt` (예: 7일 후) 포함
- `POST /api/reports/{id}/share` 재호출 시: 이전 토큰 무효 + 새 토큰? 아니면 동일 토큰 유지?
- `DELETE /api/reports/{id}/share` — 공유 해제 (토큰 무효화)

### 2.3 [P1] 사진·음성 multipart 응답 shape 명세

**현재**: 스웨거에 입력 multipart 명시, 응답 description 만.

**요청**: 응답에 `attachment` 객체 shape 명시 — `id`, `fieldId`, `visitId`, `type`, `fileUrl`, `thumbnailUrl?`, `capturedAt?`, `durationSec?`, `mimeType`, `byteSize` 등. PR-G 시작 전에 확정 필요.

### 2.4 [P3] 외근 변경 시 보고 — `POST /api/trips/{tripId}/official-notice` 응답 shape

공무원 복무규정상 외근 중 일정·예정지·종료시각이 사전 계획과 달라지면 *"지체없이 소속기관장에게 보고"* 의무가 있어, 변경이 발생했음을 시스템이 표시·체크하는 기능. (`/api/trips/active` 응답의 `reportNoticeRequired`/`reportNoticeMessage` 와 짝.) 작업자 본인의 책무를 보조 — admin 기능 아님.

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
- 응답 attachment shape 검증 (§2.3 필요)

### 3.2 [P1] PR-H — Reports `generate` AI 흐름

**목표**: "외근 → AI 자동 보고서 생성" UX. 수동 작성과 별개 진입점.

**의존성**: §2.1 응답 shape 확정 후·§2.3 사진 응답 shape 확정 후

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
- `POST /api/trips/{tripId}/official-notice` — 외근 변경 시 소속기관장 보고 필요 표시 (§2.4)
- `GET /api/trips/state-history` — 상태 전환 이력 (감사용)
- `GET /api/map/current-location-config` — 현재 위치 UX 설정

**RN 의존성** (필요 시)
- `expo-location` (이미 jy 가 추가했을 가능성, 확인)
- `react-native-background-geolocation` 또는 expo-task-manager 의 백그라운드 위치 (geofence)
- AsyncStorage 또는 expo-sqlite (오프라인 큐)

### 3.4 [P3] PR-K — 정리·튜닝

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
| 14 | 현장 삭제 (방문 1건 있는 현장) | 409 — "방문 기록이 있어 삭제할 수 없습니다" 안내 |

각 단계에서 **콘솔의 `[api]` dev 로그** 캡처 — 비정상 응답 발견 시 백엔드 측 회귀 가능성.

### 4.2 PR 단위 게이트
- 매 PR: `npx tsc --noEmit` 0 에러
- 화면 변경 PR: 실 디바이스에서 해당 시나리오 1회 통과
- 의존성 추가 PR: `npx expo install` 사용 (Expo SDK 호환 버전 자동 매칭)

---

## 5. 일정·진행 순서 제안

### 5.1 백엔드 차단 항목 (이번 사이클 적용 대상)
- §1.2 (creator.name) — P0, 보고서 화면 사용자 신뢰도 직접 영향
- §1.3 (userId/assigneeUserId 정렬) — P1, 응답 매핑 단순화
- §2.1 (generate 응답 shape) — PR-H **시작 자체를 차단**
- §2.3 (사진/음성 응답 shape) — PR-G **응답 매핑 차단**

§1.1·§1.5·(舊)§2.2 (인증 정교화) 는 회원가입/로그인 간소화 정책에 따라 보류.

### 5.2 프런트 진행 권장 순서

1. **PR-G** (사진·음성 통합) — 노션 "방문 기록" 의 Input/Output 표 그대로. 백엔드 §2.3 받으면 즉시 시작
2. **PR-I** (외근 자동화) — 노션 "외근 자동화·보조" + jy 코드 dry-read + §2.4 official-notice
3. **PR-H** (AI 보고서 생성) — 노션 "보고서 자동화·공유" + §2.1 응답 shape
4. **신규 PR** 현장 탐색·운영 — 노션 본문 검토 후 검색·태그·일괄 import
5. **신규 PR** 지도 5개 페이지 (기본 조작·시각화 모드·데이터 필터·대시보드 보조 요소) — 노션 본문 검토 후
6. **PR-K** (정리) — 마지막

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
- [docs/_swagger.json](../_swagger.json) — 현재 백엔드 OpenAPI 스펙 (54 endpoints)
- [docs/_swagger_responses.md](../_swagger_responses.md) — 실 응답 캡처 (Phase 0 + Phase 2 검증 결과)
- [docs/api_integration_plan.md](../api_integration_plan.md) — 프런트 연동 계획 v0.2 (Phase 2 PR 분할)
