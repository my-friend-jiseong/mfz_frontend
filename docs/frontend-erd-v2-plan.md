# 프론트엔드 ERD v2 마이그레이션 계획서

> 작성 2026-05-27 · 대상 브랜치 `main`
> 진실의 원천: [docs/diagram/ERD.drawio](diagram/ERD.drawio) (현 DB 상태) · [docs/ERD_REVOLUTION.md](ERD_REVOLUTION.md) (백엔드 변경 요약)
> 본 문서는 **무엇을 어떤 순서로 고칠지**를 정하는 계획서이며, 코드 변경은 포함하지 않는다.

---

## 0. 배경

백엔드가 2026-05-20 자 **파괴적 마이그레이션** (`20260520000000_erd_v2_simplified`) 으로 스키마를 대폭 단순화했다. 현 프론트는 ERD v1(Phase 3/6/7) 계약을 가정해 작성돼 있어, 사라진 테이블·컬럼·API 를 여전히 호출한다. 이 계획서는 프론트를 ERD v2 에 맞추는 **catch-up 마이그레이션** 이다.

> ⚠️ 백엔드 changelog §주의: Swagger(`trips.js`, `reports.js`) 와 `db-schema.md` 는 아직 구버전일 수 있다. 본 계획의 "확인 필요" 항목은 실제 호출 또는 백엔드 소스로 계약을 확정한 뒤 구현한다.

---

## 1. DB ↔ 프론트 갭 요약

현 DB 테이블(=진실) 기준으로 프론트의 대응 상태를 정리한다.

| DB 테이블 (ERD v2) | 핵심 컬럼 | 프론트 현황 | 조치 |
|---|---|---|---|
| `users` | id, email, name, role | [User](../src/types/entities.ts#L22) 존재 | 유지 |
| `locations` **(신규 분리)** | latitude, longitude, sido, sigungu, road_address, detail_address | 없음 (좌표·주소가 Field 에 평탄화돼 있음) | **신규 타입 + Field 와의 관계 반영** |
| `projects` **(신규)** | user_id, name, status | 없음 | **신규: 타입·스토어·화면·Field 연동** |
| `trips` | user_id, title, **status(active\|ended)**, started_at, ended_at | [Trip](../src/types/entities.ts#L32) 존재 (workerId, 카운트) | status 추가, 군더더기 제거 |
| `fields` | user_id, project_id, location_id, name, status | [Field](../src/types/entities.ts#L48) (title·주소·좌표 평탄화) | **title 제거, 주소→location, project_id 추가** |
| `field_categories` (PK field_id+category) | category | `tags: string[]` 으로 존재 | tags → categories 정렬 (호환: tags 별칭) |
| `field_photos` | field_id, file_name, mime_type, file_url, file_size | [Photo](../src/types/entities.ts#L103) (visitId, lat/lng, caption 가정) | visit 연결·좌표·caption 제거 |
| `memos` | field_id, content, created_by | [TextMemo](../src/types/entities.ts#L83) (visitId, lat/lng 가정) | visit 연결·좌표 제거 |
| `visits` | trip_id, field_id, visited_at, **status** | [Visit](../src/types/entities.ts#L64) + resultStatus/메모/첨부 | **첨부·메모·result_status·status_reason 제거** |
| `reports` | trip_id, title, output_file_url, created_by | [Report](../src/types/entities.ts#L113) (content/summary/share/soft-delete) | **content·share·soft-delete 제거** |
| `field_reports` **(신규)** | report_id, field_id, title, before/pending/after_photo_url·caption | 없음 | **신규: 보고서 본문이 현장별 전·중·후 사진으로 대체** |
| ~~`visit_attachments`~~ | — | visitStore 첨부/메모 | **삭제** |
| ~~`field_tags`~~ | — | tags | → `field_categories` |
| ~~`geofence_*`~~ | — | geofence.ts + trips API | **삭제** |
| ~~`offline_queue_items`~~ | — | offlineQueueStore | **삭제** |
| ~~`trip_planned_stops`~~ | — | destinationStore(로컬) | 로컬 유지(§7-D), 백엔드 연동 계획 폐기 |
| ~~`trip_status_transitions`~~ | — | trips state-history | **삭제** |
| ~~보고서 공유~~ | — | reports share + shared 화면 | **삭제** |

---

## 2. 제거 대상 — DB 에서 사라진 기능 (전면 삭제)

이 기능들은 백엔드 테이블·API 가 DROP 되었으므로 프론트에서도 호출·UI·상태를 **완전 제거**한다. 남겨두면 404/계약 깨짐.

### 2-A. Geofence (위치 기반 자동 도착)
- 삭제: [src/utils/geofence.ts](../src/utils/geofence.ts) 전체
- 삭제: [src/api/endpoints/trips.ts](../src/api/endpoints/trips.ts) 의 `GeofenceRegisterBody`/`GeofenceArrivalBody`, `registerGeofence`/`notifyGeofenceArrival`
- 수정: [app/(tabs)/trips/active.tsx](<../app/(tabs)/trips/active.tsx>) 의 도착 감지 watcher 제거 → 수동 "도착" 버튼으로 대체

### 2-B. 오프라인 큐
- 삭제: [src/stores/offlineQueueStore.ts](../src/stores/offlineQueueStore.ts) 전체
- 삭제: `trips.ts` 의 `offline/queue`·`offline/flush` 엔드포인트
- 수정: [src/stores/fieldStore.ts](../src/stores/fieldStore.ts) `patchStatus`, [src/stores/visitStore.ts](../src/stores/visitStore.ts) `setResult`/`addTextMemo` 의 큐 폴백 분기 제거 → 실패 시 단순 에러 반환
- 검토: [src/components/OfflineBadge.tsx](../src/components/OfflineBadge.tsx) — 네트워크 표시는 유지 가능하나 큐 카운트 연동 제거

### 2-C. 외근 상태 이력 (state-history)
- 삭제: `trips.ts` 의 `TripStateTransition`/`TripStateHistoryListItem`/`StateHistoryResponse` 타입, `stateHistory` 엔드포인트

### 2-D. 공식 보고 고지 (official-notice)
- 삭제: `trips.ts` `OfficialNoticeBody`·`officialNotice` 엔드포인트
- 삭제: [src/stores/tripStore.ts](../src/stores/tripStore.ts) `officialNotice` state, `ackOfficialNotice()`
- 수정: `active.tsx` 의 고지 UI 제거. `GET /api/trips/active` 응답에서 `reportNoticeRequired`/`reportNoticeMessage` 더 이상 안 옴

### 2-E. 보고서 공유
- 삭제: [app/shared/[token].tsx](../app/shared/[token].tsx) 라우트 전체
- 삭제: [src/api/endpoints/reports.ts](../src/api/endpoints/reports.ts) `share`/`disableShare`/`getShared`, `ShareReportData`/`DisableShareData`
- 삭제: [src/stores/reportStore.ts](../src/stores/reportStore.ts) `share()`/`disableShare()`
- 수정: [app/(tabs)/reports/[id]/index.tsx](<../app/(tabs)/reports/[id]/index.tsx>) 공유 링크 생성 UI 제거

### 2-F. 방문 첨부·메모 (visit attachments)
DB 의 `memos`/`field_photos` 는 이제 **현장(field) 전용** 이다 (visit 연결 컬럼 없음, `visit_attachments` DROP). 방문은 체크인 기록(trip·field·시각·status)일 뿐 첨부를 갖지 않는다.
- 삭제: [src/api/endpoints/visits.ts](../src/api/endpoints/visits.ts) `addTextMemo`/`addPhoto`/`addVoiceMemo`, `VisitAttachment`, `VisitDetailResponse` 의 첨부·메모 필드
- 삭제: visitStore 의 `textMemos`/`voiceMemos`/`photos` state 및 관련 메서드
- 수정: [app/(tabs)/trips/visit.tsx](<../app/(tabs)/trips/visit.tsx>) 의 방문 중 메모/사진/녹음 입력 UI 제거 → 첨부는 **현장 상세** 에서만

### 2-G. 음성 메모 (voice memo) — 전면 폐기
DB 에 음성 테이블이 없고 (`field_photos` 만 존재), voice-memos API 전부 제거됨.
- 삭제: [src/types/entities.ts](../src/types/entities.ts) `VoiceMemo` 타입
- 삭제: `fields.ts` `addVoiceMemo`, visitStore/fieldStore 의 voice 관련 전부
- 수정: 녹음 UI 가 있는 화면([app/(tabs)/fields/[id]/edit.tsx](<../app/(tabs)/fields/[id]/edit.tsx>) 등) 에서 녹음 제거
- 검토: [src/utils/media.ts](../src/utils/media.ts) 의 오디오 캡처 경로, `expo-av` 의존성 사용처

---

## 3. 신규 추가 — DB 에 생긴 것

### 3-A. Projects (프로젝트)
신규 도메인. 현장이 프로젝트에 선택적으로 속한다.
- 타입: `Project { id, userId, name, status, createdAt, updatedAt }` — status enum 값 **확인 필요**
- API: 신규 `src/api/endpoints/projects.ts`
  - `GET /api/projects` (페이지네이션), `POST /api/projects`, `GET /api/projects/:projectId`
- 스토어: 신규 `src/stores/projectStore.ts` (목록·생성·상세)
- 화면: 최소 프로젝트 선택 UI. 신규 탭까지는 범위 밖 — 우선 **현장 생성/수정 폼의 프로젝트 선택** 만 도입
- 에러코드: `project_name_required`, `project_status_invalid`, `project_not_found`

### 3-B. Field Reports (현장별 전·중·후 사진) — 보고서 본문 대체
보고서 `content` 컬럼이 사라지고, 본문이 **현장별 전/중/후 사진 + 캡션** 으로 구조화됐다.
- 타입: `FieldReport { id, reportId, fieldId, title, beforePhotoUrl, beforePhotoCaption, pendingPhotoUrl, pendingPhotoCaption, afterPhotoUrl, afterPhotoCaption, createdAt, updatedAt }`
  - `pending` = 작업 "중" 사진
- API: `reports.ts` 에 추가
  - `GET /api/reports/:reportId/field-reports`
  - `POST /api/reports/:reportId/field-reports`
  - `PATCH /api/reports/:reportId/field-reports/:fieldReportId`
  - `DELETE /api/reports/:reportId/field-reports/:fieldReportId`
- 화면: 보고서 상세를 "현장별 전·중·후 사진 카드 목록" 으로 재구성. 텍스트 본문 입력 → 현장 사진/캡션 입력으로 전환
- 요청/응답 정확한 필드명(특히 `pending_*` 카멜케이스, 사진 업로드 방식 multipart 여부) **확인 필요**

### 3-C. Locations (위치) — 주소·좌표 정규화
현장의 주소·좌표가 `fields` 에서 `locations` 1:1 로 분리됐다 (`fields.location_id` UNIQUE).
- 타입: `Location { id, latitude, longitude, sido, sigungu, roadAddress, detailAddress }`
- 영향: 현장 생성/응답에서 좌표·주소를 location 구조로 다룬다. 단, 생성 요청은 평탄(roadAddress/detailAddress/lat/lng)으로 보내고 백엔드가 location 을 만든다 (§4)
- 현장 상세 응답이 location 을 **중첩 객체로 주는지 평탄 필드로 주는지 확인 필요**

---

## 4. 동작 변경 — API 계약 변경

DB 는 남아있으나 요청/응답 형태가 달라진 부분. 각 항목은 엔드포인트 정의 + 호출부 + 폼을 함께 손본다.

### 4-A. 현장 (fields)
- **생성** `POST /api/fields`:
  - 제거: `jibunAddress`, `title`
  - 필수: `roadAddress`, `detailAddress`, `lat`, `lng`, `name`, `status`
  - 선택: `projectId`, `categories` (또는 호환 `tags`)
  - 수정 파일: [src/api/endpoints/fields.ts](../src/api/endpoints/fields.ts) `CreateFieldBody`, [app/(tabs)/fields/new.tsx](<../app/(tabs)/fields/new.tsx>)
- **수정** `PATCH /api/fields/:id`: `title` 제거, `tags`→`categories`
- **응답**: 담당자 `userId` (호환 `assigneeUserId` 병행), 분류 `categories`
- **목록**: `GET /api/fields/mine` 만 사용 — 이미 그렇게 사용 중. 관리자 전체목록·`PATCH /:id/assignee` 호출 없는지 확인
- 호환: 현 `FieldListItem` 의 `jibunAddress`/`title`/`assigneeUserId` 필드는 응답에서 사라질 수 있음 → optional 로 유지하되 신규 코드가 의존하지 않게

### 4-B. 방문 (visits)
- **체크인** `POST /api/visits/check-in`: `fieldId` **만**. `siteName`·`location` 제거
  - 수정: [src/api/endpoints/visits.ts](../src/api/endpoints/visits.ts) `CheckInBody` → `{ fieldId }`, [src/stores/visitStore.ts](../src/stores/visitStore.ts) `checkIn`
- **방문 상태**: `result_status`·`status_reason` 컬럼 제거 → 단일 `status` 만 남음
  - [src/types/entities.ts](../src/types/entities.ts) 의 `resultStatus`(normal/abnormal) 개념 및 `VISIT_STATUS` 의 "other → statusReason 10자 필수" 규칙 재검토
  - `PATCH /api/visits/:id/status` 의 **현존 여부와 body 형태(statusReason 수용 여부) 확인 필요** — changelog API 제거 목록에 명시 안 됨
- 방문 상세에서 첨부/메모/siteName 필드 제거 (§2-F)

### 4-C. 외근 (trips)
- **시작** `POST /api/trips/start`: `title` **만**. `plannedFields`·`startLocation` 제거
  - 수정: `trips.ts` `StartTripBody`, [src/stores/tripStore.ts](../src/stores/tripStore.ts) `start`, [app/(tabs)/trips/new/order.tsx](<../app/(tabs)/trips/new/order.tsx>)
- **활성 배너** `GET /api/trips/active`: `userId` 쿼리·관리자 대리조회 제거, `reportNotice*` 제거
- **status 추가**: `active`|`ended` — Trip 타입에 반영
- 에러코드: `trip_already_active` → **`already_active_trip`** (start 충돌 처리부 [src/api/errors.ts](../src/api/errors.ts) 및 호출부 확인)
- 검토: 응답의 `lifecycleStatus`/`abnormalTag` 가 v2 에서 유지되는지 — 단순화로 사라졌을 가능성, **확인 필요**

### 4-D. 보고서 (reports)
- **생성** `POST /api/reports`: **`title` 필수**, `content`/`summary` 제거, `outputFileUrl` 선택
  - 수정: [src/api/endpoints/reports.ts](../src/api/endpoints/reports.ts) `CreateReportBody` → `{ title, tripId?, outputFileUrl? }`
- **상세**: `fieldReports[]` 포함 (현장별 전·중·후) — `content` 없음
  - `ReportDetailResponse`/`ReportListItem` 에서 `content`/`contentPreview` 제거, `fieldReports` 추가
- **삭제**: soft-delete → **hard delete** (deletedAt 개념 제거)
- **AI 생성** `POST /api/reports/generate`: 보고서 + `fieldId` 제공 시 `field_report` 에 before/after 저장 (본문 content 없음)
  - [app/(tabs)/reports/generate.tsx](<../app/(tabs)/reports/generate.tsx>), [app/(tabs)/reports/new.tsx](<../app/(tabs)/reports/new.tsx>) 의 content 기반 결과 표시 → field_report 기반으로 재구성
  - 신규 generate 요청 폼(필수 필드, reportId/fieldId 동반 여부) **확인 필요**
- 에러코드: `report_title_required`

---

## 5. 타입 변경 요약 — [src/types/entities.ts](../src/types/entities.ts)

| 타입 | 변경 |
|---|---|
| `Field` | `title` 제거 · `tags` → `categories` · 주소/좌표는 location 출처(필드는 평탄 유지 가능) · `projectId?` 추가 · `userId` 유지 |
| `Visit` | `status` 만 · resultStatus 개념 제거 검토 · 첨부 없음 |
| `Trip` | `status: 'active'\|'ended'` 추가 · `workerId`(=user_id) 유지 · 공식고지 제거 |
| `Report` | `content`/`deletedAt` 제거 · `outputFileUrl?` · `fieldReports: FieldReport[]` 추가 |
| `TextMemo` | `visitId`·`latitude`·`longitude` 제거, `fieldId`+`content`+`createdBy`+`createdAt` 만 |
| `Photo` | `visitId`·`lat/lng`·`caption` 제거, `fieldId`+`fileName`+`mimeType`+`fileUrl`+`fileSize` |
| `VoiceMemo` | **삭제** |
| `Destination` | 유지(로컬 전용, §7-D) |
| **신규** | `Project`, `Location`, `FieldCategory`, `FieldReport`, `FieldPhoto` |

`VISIT_STATUS_*`, `normalizeVisitStatus` 의 alias 폴백은 v2 실제 enum 확정 후 정리.

---

## 6. 화면별 변경 — [app/](../app/)

| 화면 | 변경 |
|---|---|
| [fields/new.tsx](<../app/(tabs)/fields/new.tsx>) | jibun/title 입력 제거 · roadAddress+detailAddress+lat+lng 필수화 · 프로젝트 선택 · 분류(categories) 입력 |
| [fields/[id]/index.tsx](<../app/(tabs)/fields/[id]/index.tsx>) | directAttachments 단순화(현장 메모/사진만) · recentVisits 는 첨부카운트 없는 방문기록 · title fallback 제거 |
| [fields/[id]/edit.tsx](<../app/(tabs)/fields/[id]/edit.tsx>) | title·녹음 제거 · categories 편집 |
| [fields/[id]/checkin.tsx](<../app/(tabs)/fields/[id]/checkin.tsx>) | siteName/location 제거, fieldId 만 |
| [trips/active.tsx](<../app/(tabs)/trips/active.tsx>) | geofence watcher·공식고지 제거 · 도착은 수동 버튼 |
| [trips/new/select.tsx](<../app/(tabs)/trips/new/select.tsx>), [order.tsx](<../app/(tabs)/trips/new/order.tsx>) | plannedFields·startLocation 미전송 · 목적지는 로컬 전용 명시 |
| [trips/visit.tsx](<../app/(tabs)/trips/visit.tsx>) | 방문 중 메모/사진/녹음 제거 · 상태선택만 |
| [reports/new.tsx](<../app/(tabs)/reports/new.tsx>) | content 입력 제거 · title 필수 · 현장별 사진(field_reports) |
| [reports/[id]/index.tsx](<../app/(tabs)/reports/[id]/index.tsx>) | content 표시·공유 제거 · 현장별 전·중·후 카드 |
| [reports/[id]/edit.tsx](<../app/(tabs)/reports/[id]/edit.tsx>) | title 편집 + field_report 편집 |
| [reports/generate.tsx](<../app/(tabs)/reports/generate.tsx>) | content 결과 → field_report 결과 |
| [shared/[token].tsx](../app/shared/[token].tsx) | **라우트 삭제** |

---

## 7. 실행 순서 (단계별)

깨짐을 최소화하려 **안→밖** 순으로 진행한다.

- **Phase 1 — 타입·엔드포인트 (계약 정의)**: §5 타입 정리 + §2 제거 엔드포인트 삭제 + §3 신규(projects/field-reports) 엔드포인트 추가 + §4 시그니처 변경. `npm run typecheck` 로 깨진 호출부 전수 노출.
- **Phase 2 — 스토어**: fieldStore/visitStore/tripStore/reportStore 를 신 계약에 맞춤. offlineQueueStore 삭제, projectStore 신설.
- **Phase 3 — 화면**: §6 화면 수정. 삭제 라우트(shared) 제거.
- **Phase 4 — 정리**: geofence.ts·voice/media 잔재·미사용 import·`expo-av`/위치 권한 사용처 점검. typecheck + 수동 스모크.
- **각 Phase 종료 시**: staged-only commit + push (메모리 규칙). 커밋 메시지에 Co-Authored-By 금지.

> 프론트 우선 원칙(메모리)과 달리 이번은 백엔드 선행 변경의 catch-up 이다. 계약이 불확실한 신규 항목(§9)은 optional 로 먼저 도입하고, 확정 후 필수화한다.

---

## 8. 확인 필요 → **검증 완료 (2026-05-28, 운영 `https://ilgayo.co.kr` 실호출)**

운영 백엔드가 ERD v2 로 배포돼 있어 전 플로우(signup→현장→외근→체크인→보고서→field-reports)를 실호출로 검증함.

1. `PATCH /api/visits/:id/status` — **존속**. body `{status}` 수용, 응답 `{visitId, status, resultStatus}`(status='completed' 면 resultStatus 자동 'normal'). statusReason 불필요. → 프론트 `setResult(visitId, status)` 정합. ✅
2. `categories` — **자유 텍스트 배열**. 전송값 그대로 저장·반환, 응답에 `categories` + `tags` 둘 다 포함. ✅
3. `projects.status` — 생성 시 미지정 → 기본 `active`. ✅
4. `field_reports` — **JSON body**. 키 `before/pending/afterPhotoUrl`·`*Caption` 정합, 응답에 `field:{fieldId,name}` 포함. 사진은 URL 참조(업로드 후 연결). ✅
5. `POST /api/reports/generate` — **미검증**(multipart·AI 라 probe 제외). 실 사용 시 응답 형태 재확인 필요. ⚠️
6. 현장 상세 location — **평탄 필드**(`roadAddress`/`detailAddress`/`sido`/`sigungu`/`lat`/`lng`), 중첩 객체 아님, 키는 `lat`/`lng`. ✅
7. `trips/active` — `{isActive, tripId, elapsedMinutes}`. `lifecycleStatus`/`abnormalTag`/`elapsedHHMM`/`message` 없음(배너는 `startedAt` 로 자체 계산). ✅
8. `field_photos` caption 컬럼 없음 확정 — 프론트 사진 업로드 caption 미전송, 정합. ✅

### 검증으로 발견해 수정한 응답 불일치 (커밋 반영)

| 항목 | 백엔드 실제 | 프론트 수정 |
|---|---|---|
| `GET /api/fields/mine` | `visitDateScope` 없으면 **빈 목록** | `fieldStore.refresh` 가 항상 `visitDateScope:'all'` 보장 |
| `projects` 키 | `projectId` (+목록 `fieldCount`) | `ProjectItem.projectId`, store 매핑 `projectId→id` |
| 현장 상세 첨부 | `memos[]` + `photos[]` (directAttachments 아님) | `FieldDetailResponse.memos/photos`, store 가 캐시로 정규화 |
| 메모/사진 추가 응답 | `{fieldId, memo}` / `{fieldId, photo}` | `FieldMemoResponse`/`FieldPhotoResponse` + 매핑 |
| 보고서 생성 응답 | `authorUserId` (createdBy 아님) | `ReportCreateData.authorUserId`, store 매핑 |
| trip start/end | `banner`/`toast` 없음 | optional 로 완화 |

---

## 9. 리스크

- **데이터 유실**: visit 첨부·field 태그·geofence·오프라인 큐·보고서 공유 데이터는 마이그레이션 DROP 으로 복구 불가. 관련 UI 제거 시 사용자 안내 불필요(이미 없음).
- **목적지(Destination) 로컬 전용**: `trip_planned_stops` 가 사라져 백엔드 영속화 계획은 폐기. destinationStore 는 로컬(AsyncStorage) 전용으로 유지하되, 멀티 디바이스 동기화 안 됨을 코드 주석·UI 에 명시. (§4-C 의 trip start 가 plannedFields 를 안 받으므로 목적지는 순수 클라이언트 보조 도구)
- **관리자 UX**: 관리자 전용 field/trip API 다수 제거 — 동일 UX 필요 시 별도 설계(현 단일 워커 모델에선 영향 적음).
- **계약 불확실성**: Swagger 구버전 가능 → Phase 1 에서 실제 호출로 검증하며 진행.
