# 백엔드 API 연동 계획 — v0.2 (Phase 2)

> **갱신일**: 2026-04-27
> **출처**: `http://59.21.223.137:28080/api-docs/` (54 endpoints, 이전 41 → +13)
> **이전 버전**: v0.1 (Phase 1, 12개 endpoint 연동) — Auth/Trips/Visits/Fields read+create + visits 첨부
> **백엔드 변경**: `docs/backend_requests_phase2.md` 의 모든 요청 사항 반영 완료(라고 백엔드 팀 통보)
> **핵심 한 줄**: Fields PATCH/DELETE/status + Fields-direct memo/photo/voice + Reports CRUD + 공유 링크 7종 신규. 응답 shape 검증 + UI 활성화.

---

## 0. 변경 요약 표

### 0.1 신규 endpoint (13개)

| 도메인 | Method | Path | 우선순위 | 영향 |
|---|---|---|---|---|
| Fields | PATCH | `/api/fields/{id}` | P1 | 수정 화면 활성화 |
| Fields | DELETE | `/api/fields/{id}` | P1 | 삭제 버튼 활성화 |
| Fields | PATCH | `/api/fields/{id}/status` | P1 | 상태 전환 활성화 |
| Fields | POST | `/api/fields/{id}/memos` | P2 | 외근 밖 메모 |
| Fields | POST | `/api/fields/{id}/photos` | P2 | 외근 밖 사진 |
| Fields | POST | `/api/fields/{id}/voice-memos` | P2 | 외근 밖 음성 |
| Reports | GET | `/api/reports` | **P0** | 목록 화면 정상화 |
| Reports | POST | `/api/reports` | **P0** | 수동 작성 (in-memory → 실 저장) |
| Reports | GET | `/api/reports/{id}` | **P0** | 상세 |
| Reports | PATCH | `/api/reports/{id}` | **P0** | 수정 |
| Reports | DELETE | `/api/reports/{id}` | **P0** | 삭제 |
| Reports | POST | `/api/reports/{id}/share` | P2 | 공유 링크 발급 (신규 기능) |
| Reports | GET | `/api/reports/shared/{token}` | P2 | 공유 링크 미리보기 |

### 0.2 응답 shape 보강 (백엔드 팀이 반영했다고 한 항목 — 실 호출 검증 필요)

| 엔드포인트 | 보강 내용 | 검증 |
|---|---|---|
| `GET /api/fields/mine` | items[] 에 `lat`·`lng` 포함 | smoke test |
| `GET /api/fields/{id}` | `lat`·`lng` + `roadAddress/jibunAddress/detailAddress` 분리 | smoke test |
| `POST /api/fields` | `field` 객체에 `lat`·`lng`·분리주소 | smoke test |
| 4xx/5xx 전체 | `{ error, code, fields?, retryable? }` 일관 포맷 | 회원가입 실패 케이스로 검증 |

### 0.3 기능 변경

- `POST /api/reports` body 에 **`summary`** 필드 추가 (선택). `tripId` 는 **선택**으로 변경 (이전 v0.2 명세는 필수)
- `POST /api/reports` 가 multipart 가 아니라 **JSON body** 로 동작 (수동 작성). 자동 생성은 별도로 `POST /api/reports/generate` 유지
- `POST /api/fields/{id}/voice-memos` body 에 `durationSeconds` (≤300) 필드

### 0.4 변동 없는 영역 (이미 Phase 1 에서 연동 완료)

- 인증 5종 (signup/login/logout/refresh/me)
- 외근 5종 (start/end/active/list/detail)
- 방문 5종 (check-in/status/memo/photo/voice + drill-down)
- 현장 4종 (mine/detail/create + address-search)

→ 이미 동작하는 코드는 건드리지 않고, 응답 shape 변화(0.2)만 수용.

---

## 1. 작업 순서 (PR 단위)

각 PR 은 tsc 0 에러 + 가능한 경우 smoke test 통과 후 commit.

### PR-A. Phase 2 smoke test + 응답 shape 검증
**목표**: 백엔드가 실제로 §0.2 의 응답 보강을 반영했는지 curl 로 확인하고 `_swagger_responses.md` 갱신.

**검증 시나리오**
1. 회원가입 → 로그인 → `GET /api/me`
2. `GET /api/fields/mine?visitDateScope=all` — items[] 에 `lat/lng` 있는지
3. `POST /api/fields` 후 `GET /api/fields/{id}` — `lat/lng + roadAddress/jibunAddress/detailAddress` 있는지
4. 회원가입 시 (a) 중복 이메일 → 409 + code=EMAIL_TAKEN (b) 약한 비밀번호 → 400 + code=PASSWORD_POLICY_VIOLATION (c) 약관 미동의 → 400 + code=TERMS_NOT_AGREED 등
5. `PATCH /api/fields/{id}/status` body shape, 응답 shape
6. `POST /api/reports` body 에 `summary`, tripId 선택 동작 + 응답 shape
7. `POST /api/reports/{id}/share` 응답 shape (token, expiresAt 등)

**산출물**: `docs/_swagger_responses.md` v2 — 새 응답 shape 모두 캡처. 기존 §6 미해결 항목 해소 표시.

### PR-B. fieldStore 라이팅 활성화
**대상 endpoint**: `PATCH /api/fields/{id}`, `PATCH /api/fields/{id}/status`, `DELETE /api/fields/{id}`

**변경**
- `src/api/endpoints/fields.ts`: update / patchStatus / remove 함수 추가
- `src/stores/fieldStore.ts`: 기존 no-op `update`/`remove` 를 async + 결과 객체로 교체. 새 `patchStatus(id, status)` 액션 추가
- 화면 활성화:
  - `app/(tabs)/fields/[id]/edit.tsx`: 백엔드에 PATCH 호출, 에러 시 Alert
  - `app/(tabs)/fields/[id]/index.tsx`: 상태 전환 버튼 (있다면) 활성화 + 삭제 버튼 → `?force=true` 처리 흐름 (HAS_RELATED_VISITS 받으면 confirm 모달)
- 타입 정정: `Field.address` 가 합본 + `Field.addressDetail` 등 분리 필드를 매핑하는 케이스. mine list vs detail 응답이 모두 분리 필드를 주면 store 의 `addressDetail` 정상 채움

**`Field.latitude/longitude=0` 임시값 제거**: §0.2 가 검증되면 list 응답에서 lat/lng 채울 수 있음

### PR-C. fieldStore 첨부 활성화 (visit 없이)
**대상 endpoint**: `POST /api/fields/{id}/memos`, `/photos`, `/voice-memos`

**변경**
- `src/api/endpoints/fields.ts`: addTextMemo / addPhoto / addVoiceMemo 함수 추가 (visits.ts 의 multipart 패턴 재사용)
- `src/stores/fieldStore.ts`: `addTextMemo(fieldId, text)` 등 액션. 응답 attachment 를 visitStore 의 `textMemos/photos/voiceMemos` 배열에 push (visitId=null)
  - 또는 fieldStore 가 자체 attachments 캐시를 갖도록 설계
- 화면: 현장 상세 (`fields/[id]/index.tsx`) 에 "이 현장에 메모 남기기" 버튼 (외근 진행 중 아닐 때만 노출). 사진/음성도 동일

**보류**: 사진·음성은 RN 카메라/picker 통합이 없어 텍스트 메모만 활성화. 사진·음성은 endpoint 만 준비하고 화면은 "카메라 연동 예정" 안내. 별도 PR (expo-image-picker + expo-av).

### PR-D. reportStore 실 API 연동 (in-memory → 실 저장)
**대상 endpoint**: `GET /api/reports`, `POST /api/reports`, `GET /api/reports/{id}`, `PATCH /api/reports/{id}`, `DELETE /api/reports/{id}`

**변경**
- `src/api/endpoints/reports.ts`: list / detail / create / update / remove 함수 추가
- `src/stores/reportStore.ts`: 시드 제거 + Phase 1 의 in-memory 패턴 → tripStore 와 동일한 hydrate/refresh/create/update/remove async 패턴
- 화면:
  - `app/(tabs)/reports/index.tsx`: 안내 배너 제거, list 페치
  - `app/(tabs)/reports/new.tsx`: create 호출 (tripId 선택, summary 추가)
  - `app/(tabs)/reports/[id]/index.tsx`: detail 페치 + 삭제 버튼 → API
  - `app/(tabs)/reports/[id]/edit.tsx`: PATCH 호출

### PR-E. 공유 링크 (신규 기능)
**대상 endpoint**: `POST /api/reports/{id}/share`, `GET /api/reports/shared/{token}`

**변경**
- 보고서 상세 화면에 "공유 링크 만들기" 버튼 → 토큰 발급 → URL 복사 (Clipboard) + 만료시각 표시
- 신규 화면 `app/shared/[token].tsx` (인증 불필요) — 비로그인 사용자도 미리보기 가능
- expo-router 의 `(public)` 그룹 또는 `app/shared/` 분기 설계

**보류**: PR-D 안정화 후 진행

### PR-F. 에러 응답 일관성 활용
**전제**: PR-A 에서 백엔드가 §7.4 포맷대로 응답함을 확인.

**변경**
- `src/api/errors.ts`: `ApiError.code` 가 정상 채워지므로 화면이 분기 가능
- 회원가입/로그인 화면에서 `code` 별 메시지·다음 액션 분기:
  - `EMAIL_TAKEN` → "이미 가입된 이메일입니다. 로그인하시겠어요?" + 로그인 화면 이동 버튼
  - `PASSWORD_POLICY_VIOLATION` → 비밀번호 정책 안내 + `fields.password` 필드 메시지를 input 하단에 표시
  - `LOGIN_LOCKED` → retryAfter 카운트다운
  - `TERMS_NOT_AGREED` / `INVALID_EMAIL` / 기타 → 그대로 메시지 표시
- authStore 의 `isValidSession` 가드는 유지 (방어적). dev 로깅도 유지하되 향후 정리 검토

### PR-G. 데모용 카메라/음성 통합 (선택)
**대상**: visits + fields 의 사진·음성 첨부

**변경**
- `expo-image-picker`, `expo-av`, `expo-file-system` 추가
- 권한 요청 흐름 (카메라/마이크/사진앨범)
- check-in 화면 + 현장 상세 화면의 "사진 첨부", "음성 메모" 버튼 활성화

**우선순위 낮음** — Phase 2 핵심은 Reports CRUD + Fields 라이팅. 카메라 통합은 Phase 3 후보.

### PR-H. 정리 (선택)
- `client.ts` 의 `__DEV__` 응답 dump 가 너무 verbose 하면 일부 endpoint 로 제한
- `_swagger_responses.md` v2 의 §6 미해결 항목들 (visit detail `memo` 단일 필드 의미, multipart 필드명, address-search 빈 결과 등) 해소 표시
- `backend_requests_phase2.md` 에 "✅ 반영 완료" 표시 또는 archive 폴더로 이동

---

## 2. 의존성·리스크

### 2.1 의존성 그래프

```
PR-A (smoke test)  ───┬──> PR-B (fields write)
                      ├──> PR-D (reports CRUD)  ──> PR-E (share)
                      ├──> PR-C (fields direct attach)
                      └──> PR-F (error code branching)
                           └──> PR-G (camera, optional)
                                └──> PR-H (cleanup)
```

PR-A 의 검증 결과에 따라 PR-B/C/D 의 매핑 코드가 결정됨. PR-A 에서 응답 shape 가 예상과 다르면 백엔드에 재요청 필요.

### 2.2 리스크

| 리스크 | 완화 |
|---|---|
| 백엔드가 일부만 반영했는데 "모두 반영" 통보 | PR-A 의 smoke test 가 첫 게이트. 미반영 항목은 별도 issue 작성 |
| 응답 shape 가 요청서와 다르게 옴 (예: `lat` 대신 `latitude`) | smoke test 결과로 어댑터에 흡수 또는 재요청 |
| 4xx 일관 포맷이 일부 엔드포인트만 적용 | code 가 없으면 message 만 표시하는 fallback 이 이미 있음 (Phase 1) |
| jy 가 추가한 destination wizard / active trip / route navigation 코드와 우리 store 변경 충돌 | jy 의 코드는 destinationStore 별도 슬라이스 + tripStore 일부 사용. PR-B 시작 전 5분 dry-read 로 호환 확인 |
| 공유 링크 (PR-E) 가 비로그인 화면이라 토큰 보관·만료·재발급 UX 가 새 설계 영역 | PR-D 안정화 후 별도 디자인 시간 확보 |

### 2.3 검증 게이트

- 매 PR: `npx tsc --noEmit` 0 에러
- PR-A 직후: `_swagger_responses.md` v2 commit
- PR-B/D 직후: 실 디바이스/Expo Go 에서 회원가입 → 외근 → 현장 등록·수정·삭제·상태전환 → 보고서 작성·수정·삭제 풀 시나리오 통과
- PR-F 직후: 회원가입 7개 실패 케이스 (중복 이메일/약한 비번/약관 미동의/이메일 형식/비번 불일치/이름 누락/빈 body) 모두 친절한 메시지 도달

---

## 3. 코드 변경 영향 범위 (사전 매핑)

| 파일 | 변경 내용 | PR |
|---|---|---|
| `src/api/endpoints/fields.ts` | update, patchStatus, remove, addTextMemo, addPhoto, addVoiceMemo 추가 | B, C |
| `src/api/endpoints/reports.ts` | list, detail, create, update, remove, share, getShared 추가 | D, E |
| `src/api/index.ts` | 새 함수·타입 export | B, C, D, E |
| `src/stores/fieldStore.ts` | update/remove no-op 제거 + patchStatus + 첨부 액션 | B, C |
| `src/stores/reportStore.ts` | in-memory → 실 API (tripStore 패턴) | D |
| `src/types/entities.ts` | Field 에 분리 주소 필드 추가 검토, Report 에 summary 추가 | B, D |
| `app/(tabs)/fields/[id]/edit.tsx` | async + Alert + 백엔드 PATCH | B |
| `app/(tabs)/fields/[id]/index.tsx` | 상태 전환 버튼 + 삭제 버튼 활성화 + 첨부 버튼 추가 | B, C |
| `app/(tabs)/reports/index.tsx` | 안내 배너 제거, list 페치 | D |
| `app/(tabs)/reports/new.tsx` | create 호출 + summary 입력 | D |
| `app/(tabs)/reports/[id]/index.tsx` | detail 페치 + 삭제 + 공유 버튼 | D, E |
| `app/(tabs)/reports/[id]/edit.tsx` | PATCH 호출 | D |
| `app/shared/[token].tsx` (신규) | 비로그인 공유 보고서 미리보기 | E |
| `app/(auth)/login.tsx`, `signup.tsx` | code 별 분기 | F |
| `docs/_swagger.json` | 신규 스펙 (이미 갱신됨) | A 직전에 처리 |
| `docs/_swagger_responses.md` | v2 — 신규/보강 응답 shape 캡처 | A |
| `docs/api_integration_plan.md` | 본 문서 (방금 작성) | A 와 함께 |
| `docs/backend_requests_phase2.md` | "✅ 반영 완료" 표시 또는 archive 이동 | H |

---

## 4. 알려진 한계 (Phase 2 후에도 남음)

- 카메라/음성 통합 미구현 → 사진/음성 endpoint 는 형식만 준비 (PR-G 가 처리하면 해소)
- 관리자 시나리오 (현장 담당자 변경, /api/map/fields admin, /api/fields all) 는 admin 토큰 발급 절차가 §7.5 로 별도 협의 필요 → Phase 3
- 외근 자동화 (Feature 8: geofence 도착, navigation 딥링크, 오프라인 큐, 동선 최적화, official-notice) — jy 가 일부 구현했을 가능성. 우리 작업과 별개 PR
- 보고서 자동 생성 (`/api/reports/generate` Gemini AI) — multipart 입력 + 화면 흐름 재설계는 별도 PR

---

## 5. 다음 액션

1. **승인 대기**: 사용자가 본 계획서 검토 후 진행 의사 확인
2. **PR-A 시작**: smoke test 7개 시나리오 curl 실행 → `_swagger_responses.md` v2 작성 → commit
3. PR-B → PR-D 순으로 진행 (Reports 가 P0 라 우선이지만 fields write 가 의존 적고 단순해서 워밍업으로 먼저 권장)
4. 매 PR commit 후 `git push origin njs` (현재 njs 위 origin/main 과 동일)

---

## 6. 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-04-26 | v0.1 — 스웨거 41개 vs 프런트 명세 33개 매핑. Phase 1 12개 즉시 연동 |
| 2026-04-27 | v0.2 — 백엔드 Phase 2 요청 반영 (54개, +13개 신규). 응답 shape 보강 검증 필요. PR-A~H 작업 분할 |
