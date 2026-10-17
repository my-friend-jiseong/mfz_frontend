# 백엔드 변경 요약 — 2026-06-19 (`release`)

> **반영 커밋:** `ae4d2b9` (`23a771c` → `ae4d2b9`)  
> **브랜치:** `release` 직접 푸시 → 자동 배포  
> **작성일:** 2026-06-19  
> **백로그:** 프론트 `backend-backlog.md` **§20**(Word 위치도), **§24**(진행 중 목적지 단건 추가)

이전 배치(2026-06-18 백로그 일괄 반영)는 [release-2026-06-backend-backlog.md](./release-2026-06-backend-backlog.md) 참조.

---

## 1. 한 줄 요약

| § | 항목 | 내용 |
|---|------|------|
| **§24** | 진행 중 목적지 추가 | `POST /api/trips/:tripId/destinations` — active 외근에 현장 1건 append |
| **§20** | Word 위치도 | `POST /api/reports/:reportId/overview-photo` + `export/word` 최상단 임베드 |
| DB | `reports.overview_map_url` | nullable 컬럼 신설 |

---

## 2. DB 마이그레이션

배포 시 컨테이너 기동 후 `prisma migrate deploy` 자동 실행.

| 마이그레이션 | 내용 |
|-------------|------|
| `20260619120000_report_overview_map` | `reports.overview_map_url` VARCHAR(500) nullable |

로컬 수동 적용:

```bash
npx prisma migrate deploy
npx prisma generate
```

---

## 3. §24 — `POST /api/trips/:tripId/destinations`

### 배경

§11에서 외근 **시작 시** `plannedFields` 영속화·`GET`/`PATCH`는 완료됐으나, **진행 중 외근에 목적지를 한 건 더 추가**하는 API가 없었다. 프론트 `AddDestinationModal`은 로컬 temp(`dest-` 접두)로만 처리해 크로스 기기 동기화가 안 됐다.

### 엔드포인트

```
POST /api/trips/:tripId/destinations
Authorization: Bearer <access>
Content-Type: application/json
```

**요청 body**

```json
{
  "fieldId": "field-abc123",
  "order": 3
}
```

| 필드 | 필수 | 설명 |
|------|------|------|
| `fieldId` | ✅ | 본인 담당 현장 ID |
| `order` | — | 정수 ≥ 0. **미지정 시** 기존 목적지 말미 append (`max(order)+1`) |

**성공 응답 `200`** — 기존 destinations와 동일 shape

```json
{
  "destinationId": "dest-1750300000000-a1b2c3d4",
  "fieldId": "field-abc123",
  "order": 3,
  "status": "pending",
  "siteName": "대연 전기실",
  "siteAddress": "부산 남구 대연동 ..."
}
```

**멱등:** 동일 `tripId` + `fieldId`가 이미 있으면 새로 만들지 않고 **기존 destination을 그대로 반환**.

### 제약·에러

| 조건 | code | HTTP |
|------|------|------|
| 외근 없음 | `not_found` | 404 |
| 타인 외근 | `forbidden` | 403 |
| **종료된 외근** | `already_ended_trip` | 409 |
| `fieldId` 누락/빈 값 | `field_id_required` | 400 |
| 현장 없음 | `field_not_found` | 404 |
| 타인 담당 현장 | `planned_field_not_assignee` | 403 |
| `order` 형식 오류 | `planned_fields_invalid` | 400 |

> **active 외근만** 허용 — `trip.status === "active"` 이고 `endedAt` 없을 때.

### 프론트 연동

- `destinationStore.add` → 로컬 temp 대신 위 POST 호출 후 응답의 `destinationId`로 교체
- 관련 UI: `AddDestinationModal.tsx`, `destinationStore.ts`

---

## 4. §20 — 보고서 Word 위치도

### 배경

보고서 상세 화면의 카카오 **위치도**는 WebView/DOM이라 Word에 자동 포함되지 않는다. **2안 확정**: Android 네이티브 `view-shot` 캡처 → 업로드, 백엔드는 **이미지 임베드만** (headless Chromium 불사용).

### 4.1 `POST /api/reports/:reportId/overview-photo`

```
POST /api/reports/:reportId/overview-photo
Authorization: Bearer <access>
Content-Type: multipart/form-data
```

| 필드 | 필수 | 설명 |
|------|------|------|
| `file` 또는 `photo` | ✅ | PNG/JPEG/WebP/HEIC (field-report 사진과 동일) |

- 서버 **JPEG 압축** (`sharp`, long edge 2560px, q82) 후 `storage/reports/` 저장
- `reports.overview_map_url` 갱신
- **재업로드 시** `output_file_url` 을 `null` 로 초기화 → Word 재생성 필요

**성공 응답 `201`**

```json
{
  "reportId": "42",
  "overviewMapUrl": "/storage/reports/42-overview/....jpg"
}
```

### 4.2 `POST /api/reports/:reportId/export/word` (변경)

기존 field_reports 기반 Word 생성에 더해:

- `overviewMapUrl` 이 있으면 문서 **최상단**(제목·메타 다음, 현장 섹션 **앞**)에 **「위치도」** figure 1장 삽입
- 없으면 기존과 동일 (위치도 생략)

### 4.3 응답 필드 추가

보고서 **목록·상세** 응답에 `overviewMapUrl` 포함 (`null` 가능).

```json
{
  "reportId": "42",
  "title": "6월 순회 보고",
  "outputFileUrl": "/output/report-....docx",
  "overviewMapUrl": "/storage/reports/42-overview/....jpg",
  "fieldReports": [ ... ]
}
```

### 프론트 연동 (권장 순서)

1. 보고서 상세 위치도 뷰 — Android `react-native-view-shot`, 타일 `tilesloaded` 후 캡처
2. `POST .../overview-photo` 업로드
3. `POST .../export/word` 호출 → `outputFileUrl` 다운로드
4. **web 빌드**: cross-origin taint로 캡처 불가 → 위치도 skip (실사용 Android만)

---

## 5. 변경 파일

| 파일 | 역할 |
|------|------|
| `prisma/migrations/20260619120000_report_overview_map/` | `overview_map_url` 컬럼 |
| `prisma/schema.prisma` | `Report.overviewMapUrl` |
| `src/fieldwork/tripRepository.js` | `createTripDestination`, `findTripDestinationByTripAndField` |
| `src/fieldwork/tripsService.js` | `addTripDestination` |
| `src/fieldwork/registerTripRoutes.js` | POST 라우트 |
| `src/reports/overviewPhotoService.js` | 위치도 업로드·압축 |
| `src/reports/reportRepository.js` | `overviewMapUrl` normalize/update |
| `src/reports/registerReportRoutes.js` | overview-photo 라우트, 상세 `overviewMapUrl` |
| `src/reports/reportWordService.js` | Word 생성 시 overview 경로 전달 |
| `src/reports/services/report.js` | Word 본문 최상단 위치도 삽입 |
| `src/openapi/paths/trips.js` | POST destinations OpenAPI |
| `src/openapi/paths/reports.js` | overview-photo OpenAPI |
| `src/openapi/components.js` | `TripDestination` schema |

---

## 6. 검증 체크리스트

### §24 destinations POST

- [ ] active 외근에 `POST .../destinations { fieldId }` → 200, `status: "pending"`
- [ ] `GET .../destinations` 에 새 항목 포함
- [ ] 동일 `fieldId` 재POST → 기존 destination 반환 (중복 없음)
- [ ] 종료된 외근 → `409 already_ended_trip`
- [ ] 타인 현장 → `403 planned_field_not_assignee`

### §20 overview + Word

- [ ] `POST .../overview-photo` (multipart) → 201, `overviewMapUrl` 저장
- [ ] 보고서 상세에 `overviewMapUrl` 노출
- [ ] `POST .../export/word` → Word 최상단에 위치도 1장
- [ ] overview 재업로드 후 `outputFileUrl` null → Word 재생성 시 새 위치도 반영

### 배포

- [ ] GitHub Actions `release` 워크플로 green
- [ ] 운영 `/health` 200
- [ ] 마이그레이션 `20260619120000_report_overview_map` 적용 확인

---

## 7. Swagger

배포 후 `GET /api-docs` 에서 Try it out:

- `POST /api/trips/{tripId}/destinations`
- `POST /api/reports/{reportId}/overview-photo`
- `POST /api/reports/{reportId}/export/word`

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-06-19 | §20·§24 구현, `release` 푸시 (`ae4d2b9`) |
