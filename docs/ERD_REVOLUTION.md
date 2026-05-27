# Changelog

## 2026-05-20 — ERD v2: 스키마 단순화 및 API 정리

> **주의**: `prisma/migrations/20260520000000_erd_v2_simplified` 는 **파괴적** 마이그레이션입니다.  
> 레거시 테이블·컬럼 데이터가 삭제됩니다. 운영 적용 전 **DB 백업** 및 `prisma migrate deploy` 후 필요 시 `prisma db seed` 를 실행하세요.

### 데이터 모델 (Prisma)

**추가**

| 테이블 | 설명 |
|--------|------|
| `projects` | 사용자별 프로젝트 (`user_id`, `name`, `status`) |
| `locations` | 현장 주소·좌표 1:1 (`fields.location_id` UNIQUE) |
| `field_categories` | 현장 분류 (구 `field_tags` 대체, 복합 PK `field_id` + `category`) |
| `memos` | 현장 텍스트 메모 |
| `field_photos` | 현장 사진 메타 (`file_url` 등) |
| `field_reports` | trip 보고서별 현장 전·중·후 사진 (`report_id` + `field_id`, 자체 BigInt PK) |

**슬림화**

- `fields`: 주소·좌표 컬럼 제거 → `location_id`, `user_id`, `project_id` 로 이전
- `visits`: `site_name`, `memo`, `result_status`, `location_lat/lng`, `status_reason` 제거
- `trips`: `start_lat/lng`, `needs_official_report_notice`, 상태 전이·예정 정류장 제거; `status` (`active` \| `ended`) 추가
- `reports`: `content`, `summary`, `status`, share·AI·soft-delete·현장 단일 사진 컬럼 제거 → `title`, `trip_id`, `output_file_url`, `created_by` 중심

**제거 (DROP)**

`visit_attachments`, `visit_status_logs`, `field_attachments`, `field_tags`, `field_status_audits`, `field_update_audits`, `geofence_*`, `offline_queue_items`, `trip_planned_stops`, `trip_status_transitions`

### API — 추가

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/api/projects` | 내 프로젝트 목록 (페이지네이션) |
| `POST` | `/api/projects` | 프로젝트 생성 |
| `GET` | `/api/projects/:projectId` | 프로젝트 상세 |
| `GET` | `/api/reports/:reportId/field-reports` | 현장별 보고 사진 목록 |
| `POST` | `/api/reports/:reportId/field-reports` | 현장별 보고 사진 추가 |
| `PATCH` | `/api/reports/:reportId/field-reports/:fieldReportId` | 현장별 보고 사진 수정 |
| `DELETE` | `/api/reports/:reportId/field-reports/:fieldReportId` | 현장별 보고 사진 삭제 |

### API — 제거

- **현장**: `GET /api/fields` (전체·관리자 목록), `PATCH /api/fields/:id/assignee`, `POST .../voice-memos`
- **방문**: `POST /api/visits/:id/memos/text`, `.../photos`, `.../voice-memos`
- **외근**: geofence 등록·도착, offline queue/flush, `GET /api/trips/state-history`, `POST .../official-notice`
- **보고서**: `POST/DELETE /api/reports/:id/share`, `GET /api/reports/shared/:token`

### API — 동작 변경 (프론트 마이그레이션)

**현장**

- 생성 `POST /api/fields`: `jibunAddress`/`title` 불필요. `roadAddress`, `detailAddress`, `lat`, `lng`, `name`, `status` 필수. `projectId`, `categories`(또는 `tags`) 선택.
- 응답: 담당자는 `userId` (호환용 `assigneeUserId` 병행). 분류는 `categories` (요청 `tags` 와 동일 의미).
- 목록: `GET /api/fields/mine` 만 사용 (관리자 전체 목록 API 제거).

**방문·외근**

- 체크인 `POST /api/visits/check-in`: `fieldId` 만 ( `siteName`, `location` 제거).
- 외근 시작 `POST /api/trips/start`: `title` 만 ( `plannedFields`, `startLocation` 제거).
- 활성 배너 `GET /api/trips/active`: `userId` 쿼리·관리자 대리 조회 제거.

**보고서**

- 생성 `POST /api/reports`: **`title` 필수**, `content`/`summary` 제거. `outputFileUrl` 선택.
- 상세: `fieldReports[]` 포함 (현장별 전·중·후 URL·캡션).
- 삭제: soft-delete 제거 → hard delete.
- AI `POST /api/reports/generate`: 보고서 + `fieldId` 제공 시 `field_report` 에 before/after URL 저장 (본문 `content` 컬럼 없음).

### 에러 코드

- 추가: `project_name_required`, `project_status_invalid`, `project_not_found`, `report_title_required`
- `startTrip` 충돌: `trip_already_active` → `already_active_trip` (catalog 키 정렬)

### 코드·시드·배포

- 재작성: `fieldRepository.js`, `tripRepository.js`, `tripsService.js`, `registerTripRoutes.js`, `reportRepository.js`, `registerReportRoutes.js`
- 신규: `projectRepository.js`
- `prisma/seed.js`: `projects` + `locations` + `field_categories` + `memos` 기반 시드
- `scripts/smoke.sh`: 보고서·공유 시나리오를 ERD v2 에 맞게 수정

### Breaking changes 요약

1. DB에 있던 visit 첨부·field 태그·geofence·오프라인 큐·보고서 공유 데이터는 **복구 불가** (마이그레이션 DROP).
2. 보고서 `content` 기반 목록/수정 API 계약 종료 → `title` + `field_reports` 로 분리.
3. 관리자 전용 field/trip API 다수 제거 — 동일 UX는 별도 구현 필요.
4. Swagger (`src/openapi/paths/trips.js`, `reports.js`) 및 `docs/db-schema.md` 는 **아직 구버전** 일 수 있음. Try it out 전 문서 동기화 권장.