# 통합 테스트 시나리오 — ERD v2 (스키마 단순화 이후)

> 작성: 2026-05-28 · 대상 빌드: `feat/erd-v2-frontend` (HEAD `9b0a67c` 기준)
> 갱신: 2026-06-04 — S7 을 새 양식(2026-05-31 결정: 본문/AI 제거)+마법사 플로우로 교체, S6·§0 동기화
> 진행 환경: web (`npm run web` 또는 `npm run build:web` 정적 서브) — 모바일 전용(카메라/마이크 네이티브, expo-secure-store) 은 web fallback 평가
> 백엔드: `EXPO_PUBLIC_API_BASE_URL` 미설정 시 운영 도메인 `https://ilgayo.co.kr` ([config.ts](../../src/api/config.ts))
>
> 이 문서는 "무엇을 어떻게 시도하는가" 만 정의. 발견 사항은 별도 QA 로그로 누적.

> ⚠️ **선행 조건 — 백엔드 ERD v2 여부**: 본 시나리오는 백엔드가 ERD v2([ERD_REVOLUTION.md](../reference/ERD_REVOLUTION.md)) 로 배포된 상태를 가정한다. 운영 도메인이 아직 v1 이면 mutation 단계에서 계약 불일치(404·400) 가 나는 것이 정상이며, 그 경우 v2 백엔드(스테이징/로컬) 의 URL 을 `.env.local` `EXPO_PUBLIC_API_BASE_URL` 로 지정한 뒤 재실행한다.
> ⚠️ **운영 데이터 보호**: 운영 도메인을 그대로 쓰는 동안에는 mutation(회원가입·현장·외근·보고서 생성) 을 자동 실행하지 않는다. 자동 검증은 read-only(부팅·렌더·콘솔 에러) 만, mutation 은 v2 백엔드 확보 후 수동/별도 spec.

---

## 0. ERD v2 변경에 따른 시나리오 차이 (구 시나리오 대비 폐기·신규)

| 구분 | 내용 |
|---|---|
| **폐기** | 오프라인 큐(S15), 토큰 외 무관, **공유 토큰 페이지(`/shared/{token}`)**, **방문 첨부(메모/사진/음성)**, **음성 메모 전반**, **보고서 본문(content)**, **외근 상태전환 이력**, **공식보고 고지**, geofence 자동 도착 |
| **신규** | **현장 분류(categories)** 입력, **보고서 현장별 전·중·후 사진(field_reports)** 표시, 현장 메모/사진은 **현장 전용** |
| **계약 변경** | 현장 생성(roadAddress·detailAddress·lat·lng / title·jibun 제거), 체크인(fieldId 만), 외근 시작(title 만), 보고서 생성(title 필수·content 제거), 보고서 삭제(hard delete), 에러키 `already_active_trip` |
| **미surface** | `projects` 는 스토어·엔드포인트만 존재(전용 화면 없음). ~~`field_reports` 수동 편집 UI 없음~~ → 전용 편집 화면(`field-report`)·생성 마법사로 해소(2026-06-04). AI 생성(`generate`)은 프론트에서 완전 제거(2026-05-31 결정 §1) |

---

## 1. 자동 검증 가능 (read-only · 백엔드 mutation 불필요)

> Playwright 헤드리스([qa-runner.mjs](../../qa-runner.mjs)) 또는 수동 web 으로 확인. 핵심 목적: **대규모 리팩터 후 번들/부팅/렌더가 깨지지 않는지** + 삭제된 모듈(`geofence`·`offlineQueueStore`·`OfflineBadge`·`api/network`·`app/shared`) 잔존 import 로 인한 런타임 크래시 부재.

### A1. 번들 성공
- `npm run build:web` 이 에러 없이 export 완료. (삭제 모듈을 import 하는 코드가 남아 있으면 여기서 실패 → 강한 신호)

### A2. 부팅 → 비로그인 → 로그인 화면
- localStorage 비운 상태로 `/` 접속 → `/(auth)/login` 렌더. 콘솔/page 에러 0.

### A3. 회원가입 화면 렌더 + 인라인 검증
- `/(auth)/signup` 진입 → 이메일/비밀번호/약관 인라인 검증 동작(제출 없이 클라이언트 검증만). 콘솔 에러 0.

### A4. +not-found
- 존재하지 않는 경로(`/foo/bar`) → not-found 화면 렌더, "뒤로" `safeBack` 폴백.

### A5. 삭제 잔재 부재 (정적)
- `OfflineBadge`·`network watcher` 가 `app/_layout.tsx` 에서 제거됐는지 (부팅 시 관련 콘솔 경고 없음).
- 루트 Stack 에 `shared/[token]` 스크린이 없는지.

---

## 2. 백엔드 mutation 필요 (v2 백엔드 확보 후)

> v2 백엔드 URL 을 `.env.local` 에 지정하고 신규 QA 계정으로 진행. 운영 도메인에서는 실행 금지.

### S1. 인증
1. 비로그인 부팅 → 로그인 화면.
2. 회원가입(이메일·비밀번호 10자+3종·약관) → 자동 로그인 → 외근 탭.
3. 로그아웃 → 재로그인 / 오답 시 `invalid_credentials`.

### S2. 현장 추가 (ERD v2 계약)
1. 현장 탭 → "현장 추가" → [fields/new](<../app/(tabs)/fields/new.tsx>).
2. 주소 검색(카카오) → 항목 선택 → 좌표 자동 채움(한국 영역 가드).
3. 입력: **프로젝트(picker: 목록·인라인 생성·해제)**, **분류(categories, 쉼표 구분)**, 상세주소, 상태. (구 "제목" 입력 제거 확인)
4. 제출 → `POST /api/fields` (body: name·status·roadAddress·detailAddress·lat·lng·`projectId?`·categories?). **jibunAddress/title 미전송** 확인. 응답에 `projectName` 동반.
5. 중복 주소 → `duplicate_address_warning_required` → confirm → `forceCreateWithDuplicate=true` 재호출 → 성공.
6. 최소 2개 현장 확보(외근 다중 선택용).

### S3. 현장 상세 / 수정
1. 현장 카드 → [fields/[id]](<../app/(tabs)/fields/[id]/index.tsx>).
2. 헤더: **주소**가 제목 자리(구 title 폴백 제거), **📁 projectName**(설정 시), **분류 칩**, 좌표, 길찾기.
3. 상태 chip 탭 → 상태 선택 → `PATCH /api/fields/{id}/status` → 즉시 갱신 / 빠른연속탭 가드.
4. **현장 직접 메모**: 텍스트 추가 → `POST /api/fields/{id}/memos`. **사진** 추가 → `POST /api/fields/{id}/photos`. (음성 녹음 버튼 부재 확인)
5. 수정 화면 [edit](<../app/(tabs)/fields/[id]/edit.tsx>) → 프로젝트·분류·상세주소·상태·주소 변경 → 저장. (제목 입력 부재 확인) `PATCH projectId:null` 로 해제, `projectId` 지정으로 재설정 가능 — 검증 완료(2026-05-28).
6. 방문 이력 행: 날짜·상태만(첨부 카운트 부재 확인).

### S4. 외근 시작 → 진행
1. 외근 탭 → "외근 시작" → [select](<../app/(tabs)/trips/new/select.tsx>) → 현장 2곳 체크 → [order](<../app/(tabs)/trips/new/order.tsx>).
2. 순서 최적화(`optimize-preview` 시도 → 실패 시 nearest-neighbor fallback) / 수동 재정렬.
3. 제목(선택) → "외근 시작" → `POST /api/trips/start` (**title 만** 전송, startLocation·plannedFields 미전송) → [active](<../app/(tabs)/trips/active.tsx>).
4. **active 화면**: 지도 scope(이 외근 현장만), 길찾기(`navigation/deep-links`), 수동 "체크인"·"건너뛰기". **공식보고 고지 카드 부재**·**도착 자동감지 부재** 확인.

### S5. 체크인 (ERD v2 — 단순화)
1. 현장 "체크인" → [checkin](<../app/(tabs)/fields/[id]/checkin.tsx>) → 진입 시 `POST /api/visits/check-in` (**fieldId 만**) 자동 호출.
2. **방문 결과 상태** 선택(6종). `completed`→`resultStatus:normal`, 그 외→`abnormal` (백엔드 auto). **'기타' 선택 시 reason 입력(10자 이상 필수)** — 미달 시 저장 버튼 비활성·`visit_status_reason_required` 차단(검증 2026-05-28).
3. "메모·사진은 현장 상세에서" 링크 → 현장 상세 이동. (체크인 화면 내 메모/사진/음성/파일 입력 부재 확인)
4. "결과 저장하고 완료" → `PATCH /api/visits/{id}/status` (body `{status}`) → destination arrived → active 복귀.
   - ⚠️ §8: 이 엔드포인트 존속·body 는 백엔드 확인 대상. 404/400 시 로그 기록.

### S6. 외근 종료 / 상세
1. active 하단 "외근 종료" → `POST /api/trips/end` → **외근 상세(detail) 로 단일 진입** — 보고서 작성은 detail footer CTA 가 담당 (종료 직후 prompt 없음).
2. 방문 0건 종료 → `confirm_required_zero_visits` → 확인 → `forceEndWithoutVisit=true` 재호출.
3. 외근 상세 [trips/[id]](<../app/(tabs)/trips/[id].tsx>): 시작/종료 시각, 계획 N곳·실제 방문 M건, 계획 목적지 status, 보고서 CTA. **상태전환 이력 박스 부재** 확인. 방문 행에 첨부 카운트 부재 확인.

### S7. 보고서 — 작성 (새 양식 + 마법사, 2026-06-04)
1. 외근 상세/보고서 탭 → "보고서 작성" → [reports/new](<../app/(tabs)/reports/new.tsx>).
2. 외근 picker(모달) → 선택 시 카드 + **위치도 미리보기**(방문 현장 fitToMarkers) + 스캐폴드 안내("현장 N곳 … 차례로 채우는 단계로 넘어갑니다"). 라벨에 raw `#tripId` 미노출.
3. 입력: **제목(필수)** + 연결 외근뿐. (본문·AI 초안·보고서 레벨 사진 입력 **부재 확인** — 2026-05-31 결정 §1)
4. "보고서 만들기" → `POST /api/reports` `{title, tripId}` → 방문 현장별 `POST /api/reports/{id}/field-reports` (빈 스캐폴드, 병렬·부분 실패 시 누락 안내 alert) → **마법사 진입** (`field-report?frId=<첫 스캐폴드>&wizard=1`).
5. **마법사**: 헤더·본문 "현장 보고 작성 (n/N)" / 현장 readonly / 전·중·후 사진+캡션 / [저장 후 다음 현장]·[이 현장 건너뛰기]·[나중에 작성하기], 마지막 단계는 [저장 후 완료]·[건너뛰고 완료] → 상세 복귀. 마지막 저장 시 "보고서 작성 완료" 통지(webAlertPatch 경유).
6. 가드: **사진 없는 캡션만 입력 시 저장 차단**(인라인 에러) / **방문 0건 외근** → 마법사 없이 상세 직행 / 상세→"수정" 진입은 마법사 아님(단계 버튼 부재 확인).

### S8. 보고서 — 상세 / 수정 / 삭제
1. [reports/[id]](<../app/(tabs)/reports/[id]/index.tsx>): 제목·연결 외근·작성 시각·**현장별 전·중·후 사진 카드(field_reports)**·output 파일 다운로드. (본문 content 영역·**공유 버튼 부재** 확인)
   - owner: "**+ 현장 보고 추가**" 및 카드별 **수정/삭제** → [field-report](<../app/(tabs)/reports/[id]/field-report.tsx>) 편집 화면(현장 선택 + 전·중·후 사진 업로드·캡션). `POST/PATCH/DELETE /api/reports/{id}/field-reports` — 검증 완료(2026-05-28).
2. "수정" → [edit](<../app/(tabs)/reports/[id]/edit.tsx>) → **제목만** 수정 → `PATCH /api/reports/{id}`.
3. "삭제" → confirm → `DELETE /api/reports/{id}` (**hard delete**) → 목록 복귀.
4. 보고서 탭 목록: 외근별 그룹, 카드에 본문 미리보기 부재(제목·날짜만) 확인.

### S9. 흰화면 fallback (safeBack)
- 시크릿 창에서 deep-link 직진 후 "뒤로" → `/(tabs)/trips` 폴백:
  - `fields/{id}` `/edit` `/checkin`, `reports/{id}` `/edit` `/new`, `trips/{id}` `/active` `/visit`, `trips/new/select` `/order`, `(auth)/signup`.

### S10. 토큰 만료/회전
1. localStorage refresh token 손상 → 새로고침 → `/auth/refresh` 401 → 토큰 폐기 + 로그인 이동.

---

## 3. 검증 체크리스트

**실기기(APK) 전용**
- [ ] 외근·현장 탭 목록을 **마지막 카드까지** 스크롤 가능 + 바닥에서 하단 CTA 노출
      (enableDynamicSizing=false 수정 검증 — 2026-06-04 "마지막 1~2개 스크롤 불가" 버그.
      웹에선 재현 안 되므로 반드시 실기기로)

**자동(read-only)**
- [ ] A1 `build:web` 번들 성공
- [ ] A2 부팅 → 로그인 렌더 / 콘솔 에러 0
- [ ] A3 회원가입 인라인 검증
- [ ] A4 +not-found + safeBack
- [ ] A5 OfflineBadge·network watcher·shared 라우트 잔재 부재

**mutation(v2 백엔드 후)**
- [ ] S2 현장 생성 — categories 전송 / title·jibun 미전송 / 중복 confirm
- [ ] S3 현장 상세 — 주소 헤더·분류칩·현장 메모/사진(음성 부재)
- [ ] S4 외근 시작 — title 만 / 공식고지·도착감지 부재
- [ ] S5 체크인 — fieldId 만 / 단일 status / 첨부 입력 부재  *(§8 status 엔드포인트)*
- [ ] S6 외근 종료·상세 — zero_visits force / 상태이력 부재
- [ ] S7 보고서 작성 — title 필수 / 스캐폴드 자동 생성 / 마법사 (n/N)·건너뛰기·캡션 가드·0방문 폴백
- [ ] S8 보고서 상세 — field_reports 카드 / 공유 부재 / hard delete
- [ ] S9 safeBack 폴백
- [ ] S10 토큰 회전

> §8 = ERD v2 프론트 마이그레이션 계획의 백엔드 확인 항목. 해당 호출에서 계약 불일치가 나면 로그에 raw 응답 첨부.
