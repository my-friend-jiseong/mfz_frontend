# 보고서 양식 변경 — 조치 가이드라인

> **출처**: [`docs/REPORT_CHANGE_PLAN.md`](REPORT_CHANGE_PLAN.md) (양식 안)
> **작성일**: 2026-05-31
> **대상 브랜치**: `fix/qa-fixes` 후속 사이클 (별도 브랜치 권장)
> **연관 백로그**:
> - [`docs/backend-backlog.md`](backend-backlog.md) §9 visit 단계 모델, §13 reports/generate 500, §16 timeline fieldId
> - 2차 QA 13~17 (이전 사이클에서 보류했던 보고서 관련 항목 — 본 사이클에서 해소)

---

## 0. 핵심 변경 요약

| 항목 | 이전 | 이후 |
|---|---|---|
| 보고서 본문 | 자유 양식 textarea + AI 초안 | **없음** — 자동 위치도 + N 개 현장 보고만 |
| AI 초안받기 | `POST /api/reports/generate` (운영 500, backlog §13) | **제거 검토** (질문 1) |
| 외근 없이 작성 | reports 탭 그룹 | **폐지 검토** (질문 2) |
| 현장 보고 추가 | 사용자가 수동으로 1건씩 추가 | **외근 visits 기반 자동 스캐폴드** (질문 3) |
| 사진 슬롯 | 보고서 레벨 before/after 2장 | **현장 보고 레벨 3장 (전·중·후) + 캡션** |
| 다운로드 | Word (`outputFileUrl`) | 질문 6 (Word 유지 / PDF 신규 / 기타) |
| 보고서 개요 위치도 | 없음 | **신규** — 외근 destinations 마커 한 장 (질문 5) |

---

## 1. 새 양식 목표 구조 (`docs/REPORT_CHANGE_PLAN.md` 그대로)

```
보고서 개요
- 제목
- 현장 전반에 대한 위치도 (자동 생성)

현장 보고 1
- 조치 전 사진 + 캡션(선택)
- 조치 중 사진 + 캡션(선택)
- 조치 후 사진 + 캡션(선택)

현장 보고 2 ... N
```

엔티티 매핑(이미 구현 됨, 변경 없음):
- 보고서 개요 = `Report` (`title`, `tripId`, 신규: `overviewMapUrl?`)
- 현장 보고 N = `FieldReport` 행 (`beforePhotoUrl|Caption`, `pendingPhotoUrl|Caption`, `afterPhotoUrl|Caption`, `fieldId`)
- API 는 이미 `reports.listFieldReports / addFieldReport / updateFieldReport / removeFieldReport` 로 구비.

---

## 2. 코드베이스 현 상태 진단

### 이미 새 양식과 정합된 부분 (수정 불필요)
- `src/api/endpoints/reports.ts` — `Report` + `FieldReport` CRUD, content/summary 컬럼 없음. ✅
- `app/(tabs)/reports/[id]/field-report.tsx` — 단일 현장 보고 편집기 (3슬롯 + 캡션 + field picker). ✅
- `app/(tabs)/reports/[id]/index.tsx` — 상세 화면 (현장 보고 카드 N개 노출). ✅
- `app/(tabs)/reports/[id]/edit.tsx` — 제목 수정 페이지. ✅
- `Report` / `FieldReport` 타입 (`src/types/entities.ts`). ✅

### 새 양식과 어긋난 부분 (제거/축소)
- `app/(tabs)/reports/new.tsx` — 842라인. 다음 요소 다수 제거 필요:
  - `notes` (자유 양식 textarea, draft 보존, prefill 로직)
  - `beforePhoto`/`afterPhoto` (보고서 레벨 사진 — 이제 현장 보고 레벨로 위임)
  - `generate(form)` 호출 분기 (AI 초안)
  - `mode: 'ai' | 'manual'` 토글
  - `buildReportNotesFromTrip` 의존
- `app/(tabs)/reports/generate.tsx` — 19라인 wrapper (질문 1 결정 후 제거).
- `app/(tabs)/reports/index.tsx` — '외근 없이 작성' 섹션 (질문 2 결정 후 제거).
- `src/utils/reportPrefill.ts` (notes prefill) — AI 의존 제거 시 함께 정리.

### 새 양식에서 추가 필요
- **보고서 개요 위치도** — `Report` 상세/편집 화면 상단. 형식은 질문 5.
- **현장 보고 자동 스캐폴드** — `reports/new.tsx` 의 보고서 생성 직후 그 외근 `visits` 각각에 대해 빈 `FieldReport` 행을 자동 생성 (질문 3).
- **체크인 phase 사진 ↔ 현장 보고 사진 연결** — 질문 4. 백엔드 §9 phase 모델 의존.

---

## 3. 변경 동선 — 화면별

### A. 보고서 작성 (`reports/new.tsx`) 대대적 축소

신규 시나리오:
1. 사용자가 외근 상세 footer "보고서 작성" 또는 reports 탭 "보고서 작성" 버튼 진입.
2. **제목 입력 1줄 + 외근 선택(이미 tripId 있으면 잠금)** 만 표시.
3. "보고서 만들기" → `reports.create({title, tripId})` → 응답 id 로 `reports.addFieldReport` 를 그 trip 의 visit 개수만큼 반복 호출 (자동 스캐폴드, 질문 3 confirmed 가정).
4. 완료 후 `/(tabs)/reports/[id]` 로 replace.

코드 라인 수: 842 → 약 150 줄 목표.

### B. 보고서 상세 (`reports/[id]/index.tsx`) 위치도 추가

- 상단 헤더 직후 **위치도 카드** 삽입 (질문 5 결정 형식).
- 이후 현장 보고 카드들은 그대로.
- "현장 보고 추가" 버튼 — 자동 스캐폴드 후에도 사용자가 새 visit 없이 임의 현장 추가 가능하게 유지(또는 제거 — 질문 3 의 확장).

### C. 현장 보고 편집기 (`field-report.tsx`)

기능적으론 그대로. 다만 prefill 정책 정리:
- **체크인 phase 사진 자동 채움** (질문 4 confirmed 가정) — 이 visit 의 phase=before/during/after 사진 URL 을 슬롯 url 에 prefill, 사용자가 캡션만 입력하면 충분.
- 사용자가 phase 사진 없이 직접 업로드도 가능 — 현행 흐름 유지.

### D. 보고서 목록 (`reports/index.tsx`)

- 외근 없이 작성 그룹 폐지 시 (질문 2): orphan/byTripId 분기 정리, 코드 단순화.
- 검색·정렬은 현행 유지.

### E. 외근 상세 → 보고서 진입 동선

- 현재 `trips/[id].tsx` footer 의 "보고서 작성" → `/reports/new?tripId=...` 로 이동.
- 그 외근의 보고서가 이미 있으면 새 작성 대신 기존 보고서 상세로 이동. (질문 7)

---

## 4. 백엔드 의존 (backlog 추가/갱신 필요)

### B1. (필수) 보고서 생성 시 자동 스캐폴드 — 단일 호출

현재는 프론트가 visit 수만큼 `addFieldReport` 를 반복 호출해야 함. 백엔드에 `POST /api/reports?autoScaffold=true` 또는
`POST /api/reports/from-trip/:tripId` 같은 단축 endpoint 가 있으면 round-trip 절감.
→ 질문 3 결과에 따라 backlog 새 항목 §18 후보.

### B2. (필수) 보고서 개요 위치도 — 자동 생성

현재 `Report.outputFileUrl` 만 있음. 위치도가 정적 이미지면 `overviewMapUrl?` 또는 생성 endpoint 필요.
→ 질문 5 결과에 따라 backlog §19 후보.

### B3. (조건부) visit phase 모델 (backlog §9 이미 등록)

체크인 phase 슬롯이 백엔드에 phase 메타로 저장되어야 보고서 prefill 가능. §9 미해소 시
프론트는 사용자에게 매번 사진 재선택을 요구.

### B4. (조건부) `outputFileUrl` 포맷 정책 — Word 유지 vs PDF 신규

질문 6 결과에 따라 새 endpoint 추가 또는 기존 generate 호출 폐지.

### B5. (이전 사이클) `timeline[].fieldId` 정식 포함 (backlog §16)

세션 재진입 시 visit fieldId 가 비어 자동 스캐폴드가 깨지지 않도록 §16 우선 머지.

---

## 5. 데이터 마이그레이션

기존 보고서에 자유 양식 본문(content)이 있었더라도 백엔드 응답 contract 에서 이미 제거됐음
(검증 2026-05-28 `src/api/endpoints/reports.ts` 주석). 따라서 마이그레이션 필요 없음 — 새 양식 화면에서
빈 본문으로 보이는 케이스만 자연 발생, FieldReport 가 0 건이면 "등록된 현장 보고가 없습니다" 노출
(현 상세 화면이 이미 처리 중).

다만 **기존 `outputFileUrl` (Word)** 다운로드 버튼은 보존 — 과거 작성분에 대한 접근성. 질문 6 의 새 다운로드는 별도 칸.

---

## 6. 작업 순서 (권고)

1. **질문 1~7 답변 수령 → 본 문서 §4 의 backlog 항목 확정**.
2. **`reports/new.tsx` 축소** — AI/notes/photos 제거, 제목+tripId 만. (가장 큰 변화)
3. **자동 스캐폴드 구현** — frontend round-trip 또는 백엔드 단축 endpoint 호출.
4. **상세 화면 위치도** 카드 추가.
5. **field-report.tsx prefill** — phase 사진 연결.
6. **목록 화면** — 외근 없이 작성 폐지 (질문 2 결정 시).
7. **generate.tsx / reportPrefill.ts** 정리.
8. **테스트** — 보고서 생성 → 현장 보고 자동 채움 → 캡션 입력 → 다운로드 e2e.

각 단계 끝마다 staged-only commit + push, `Co-Authored-By` 트레일러 금지.

---

## 7. 결정 사항 (2026-05-31 확정)

| # | 질문 | 결정 |
|---|---|---|
| 1 | AI 초안받기 | **완전 제거** — generate.tsx, reports/generate API, reportPrefill.ts 정리 |
| 2 | '외근 없이 작성' 그룹 | **폐지** — reports/index.tsx orphan 분기 제거. 모든 보고서는 tripId 필수 |
| 3 | 자동 스캐폴드 기준 | **외근의 visits 별 1행** — skipped destination 은 제외 |
| 4 | 체크인 phase prefill | **백엔드 §9 머지 후 자동 prefill** — §9 미해소 동안은 빈 슬롯 |
| 5 | 위치도 형식 | **인앱 Kakao 지도 embed** — KakaoMapWebView 재사용, scopeFieldIds 로 그 외근 현장만 |
| 6 | 다운로드 포맷 | **Word 유지 + PDF 추가** — outputFileUrl 보존, PDF endpoint 신규 (backlog §19 후보) |
| 7 | 외근당 다중 보고서 | **허용** — '보고서 작성' 버튼 동작 단순. 한 외근에 여러 버전 보고서 가능 |

### 결정 후 영향

- **§4 백엔드 백로그 갱신**:
  - §18 — `POST /api/reports/from-trip/:tripId` 단축 endpoint (스캐폴드 round-trip 절감, **선택**)
  - §19 — 보고서 PDF 생성 endpoint (`POST /api/reports/:id/export?format=pdf`)
  - §9 (기등록) — visit phase 모델, prefill 의 전제 조건
  - §16 (기등록) — timeline fieldId, 자동 스캐폴드의 전제 조건
- **외근 상세 footer "보고서 작성"** — 매번 새 보고서 생성, 기존 보고서는 reports 탭에서 접근.
- **목록 페이지** — '외근 없이 작성' 헤더 제거 → tripId 별 그룹만. 한 외근 하위에 여러 보고서면 createdAt 역순.

### 작업 차단/대기

- **#4 (phase prefill)** 은 §9 백엔드 머지 전까지 빈 슬롯으로 동작 — 차단 아님.
- **#6 (PDF)** 은 §19 endpoint 도착 전까지 Word 만 다운로드 가능. UI 에서 PDF 버튼은 §19 머지 후 노출.
- **#3 (자동 스캐폴드)** 은 §16 의 timeline.fieldId 가 없으면 visit 의 fieldId 가 빈 string 일 수 있어
  스캐폴드 결과가 잘못된 row 를 만듦. §16 머지 직전엔 같은 세션 내(checkin 직후 작성)만 신뢰.
