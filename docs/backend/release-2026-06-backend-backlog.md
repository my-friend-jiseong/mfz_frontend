# 백엔드 변경 요약 — 2026-06 백로그 (`release`)

> **반영 커밋:** `6b1d6ea` · `23a771c` (`d5e18c8` → `23a771c` fast-forward)  
> **브랜치:** `feat/backend-backlog` → `release` 머지·배포  
> **작성일:** 2026-06-18

프론트 `backend-backlog.md` 요청과 보고서(사진+캡션→Word) 흐름 정합을 위한 변경입니다.

---

## 1. 한 줄 요약

| 영역 | 내용 |
|------|------|
| 외근 | destinations 영속화, trip PATCH/DELETE, 상세에 `destinations`·`timeline.reason` |
| 현장 | `detailAddress` optional, 메모/사진 DELETE |
| 보고서 | **field_reports** 기준 Word 생성, 슬롯별 multipart 사진 업로드(서버 압축), from-trip 스캐폴드 |
| 기타 | `/privacy`·`/terms` 정적 HTML, 주소검색 `keyword.json` 병합 |
| DB | `trip_destinations`, `trips.deleted_at`, `visits.status_reason`, `visit_photos` |

---

## 2. DB 마이그레이션

배포 시 컨테이너 기동 후 `prisma migrate deploy` 자동 실행. 로컬은 수동:

```bash
npx prisma migrate deploy
npx prisma generate
```

| 마이그레이션 | 내용 |
|-------------|------|
| `20260618120000_visit_photos` | `visit_photos` 테이블 (visit 첨부 사진) |
| `20260618140000_backlog_trip_destinations` | `trip_destinations`, `trips.deleted_at`, `visits.status_reason` |

### 스키마 하이라이트

- **`trip_destinations`** — `trip_id`, `field_id`, `sort_order`, `status` (`pending` \| `arrived` \| `skipped`)
- **`trips.deleted_at`** — 외근 soft delete
- **`visits.status_reason`** — 방문 상태 `other` 시 사유 영속·조회 노출
- **`visit_photos`** — visit 단위 사진 (보고서 Word와는 별도 경로)

---

## 3. API 변경 — 외근·destinations (§11, §2)

### `POST /api/trips/start`

```json
{
  "title": "오전 순회",
  "plannedFields": [
    { "fieldId": "field-...", "order": 0 }
  ]
}
```

- `plannedFields` 또는 `destinations` 동일 의미 (최대 200건)
- 응답에 `destinations[]` 포함 (`destinationId`, `fieldId`, `order`, `status`)

### `GET /api/trips/:tripId`

- `destinations[]` — 계획 목적지 (다른 기기·세션에서도 조회)
- `timeline[]` — `fieldId`, `status`, **`reason`** (기타 사유)

### `GET /api/trips/:tripId/destinations`

목적지 목록만 조회.

### `PATCH /api/trips/:tripId/destinations/:destinationId`

```json
{ "status": "arrived" | "skipped", "order": 0 }
```

체크인(`POST /api/visits/check-in`) 시 해당 `fieldId`의 pending destination이 자동 `arrived`로 갱신.

### `PATCH /api/trips/:tripId`

```json
{ "title": "...", "startedAt": "ISO8601", "endedAt": "ISO8601" }
```

- 제목 50자 이하, `startedAt > endedAt` 거부
- 활성 외근에 `endedAt` 설정 시 종료 처리

### `DELETE /api/trips/:tripId`

- soft delete (`deletedAt`)
- **진행 중 외근** 삭제 차단 → `trip_still_active`
- 방문·보고서 연결 시 `?force=true` 필요 → `has_related_trip_records`

---

## 4. API 변경 — 현장 (§4, §14)

### `POST /api/fields`

- **`detailAddress` optional** — 미입력·빈 값 허용 (`detail_address_required` 400 제거)

### `DELETE /api/fields/:fieldId/memos/:memoId`

### `DELETE /api/fields/:fieldId/photos/:photoId`

- DB 행 삭제 + 디스크(`/storage/fields/...`) 파일 정리

---

## 5. API 변경 — 방문 (§21)

### `PATCH /api/visits/:visitId/status`

```json
{ "status": "other", "reason": "10자 이상 사유" }
```

- `status_reason` DB 영속
- 응답·`timeline`·현장 `recentVisits`에 **`reason`** 포함

---

## 6. API 변경 — 보고서·Word (핵심)

프론트 표준 흐름: **외근 선택 → field_reports에 사진(캡션) → Word**.

```
POST /api/reports/from-trip/:tripId     → 보고서 + 현장보고 스캐폴드
POST .../field-reports/:id/photos       → 사진 업로드 (서버 압축)  ← 권장
PATCH .../field-reports/:id             → 캡션만 수정 또는 URL+캡션 (레거시·외부 URL)
POST /api/reports/:reportId/export/word → Word 생성
```

### `POST /api/reports/from-trip/:tripId`

```json
{ "title": "3월 5일 순회 보고" }
```

→ `{ reportId, fieldReports: [...] }` (visit별 fieldReport 1개, skipped destination 제외)

### `POST /api/reports/:reportId/field-reports/:fieldReportId/photos`

`multipart/form-data`:

| 필드 | 필수 | 설명 |
|------|------|------|
| `file` 또는 `photo` | O | 이미지 (최대 20MB) |
| `slot` | O | `before` \| `pending` \| `after` |
| `caption` | - | 캡션 (255자) |

- **서버 압축:** JPEG, 긴 변 최대 2560px, quality 82 (`sharp`)
- 저장: `/storage/reports/{fieldReportId}/...`
- `field_reports`의 해당 슬롯 URL·캡션 자동 갱신

### `PATCH /api/reports/:reportId/field-reports/:fieldReportId`

기존과 동일 — JSON으로 `beforePhotoUrl`, `beforePhotoCaption`, `pendingPhotoUrl`, … 수정 가능.  
Word 생성 시 `/storage`, `/uploads`, `https://` URL 모두 해석.

### `POST /api/reports/:reportId/export/word`

- **field_reports**의 전·중·후 사진+캡션을 현장별 섹션으로 Word 통합
- `regenerate=true` 시 기존 `outputFileUrl` 있어도 재생성
- 응답: `outputFileUrl`, `downloadUrl`, `photoCount` 등

### `POST /api/trips/:tripId/report/generate`

위와 동일 엔진. `body.reportId` 미지정 시 해당 trip의 본인 최신 보고서 사용.

### Word 문서 구조 (현장별)

1. 현장명·주소  
2. **조치 전** — 사진 + 캡션  
3. **조치 중** — 사진 + 캡션  
4. **조치 후** — 사진 + 캡션  

---

## 7. API 변경 — 기타

### `GET /privacy` · `GET /terms`

인증 없음. 스토어·앱 내 링크용 정적 HTML (초안 — 법무 검토 후 본문 교체 권장).

### `GET /api/fields/address/search`

카카오 `address.json` + **`keyword.json`** 결과 병합·중복 제거 (장소명 POI 검색 보강).

---

## 8. 신규·변경 에러 code

| code | HTTP | 설명 |
|------|------|------|
| `has_related_trip_records` | 409 | 외근에 방문·보고서 있음 (`force=true`) |
| `trip_still_active` | 409 | 진행 중 외근 삭제 불가 |
| `destination_status_invalid` | 400 | destination status 오류 |
| `report_not_found_for_trip` | 404 | trip에 연결 보고서 없음 |
| `report_no_field_reports` | 400 | 현장 보고 없음 |
| `report_no_photos` | 400 | 업로드된 사진 없음 |
| `field_report_slot_invalid` | 400 | slot은 before/pending/after |
| `photo_process_failed` | 400 | 이미지 압축 실패 |

기존 백로그 code (`planned_fields_*`, `trip_title_too_long` 등)도 `errorResponse.js`에 반영됨.  
전체 목록은 [`errors.md`](./errors.md) 참고 (수동 동기화 필요 시 grep `ERROR_CATALOG`).

---

## 9. 환경 변수 (선택)

| 변수 | 기본 | 용도 |
|------|------|------|
| `IMAGE_MAX_WIDTH` | 2560 | 사진 리사이즈 긴 변 |
| `IMAGE_JPEG_QUALITY` | 82 | JPEG 품질 |
| `FILE_STORAGE_ROOT` | `./storage` | 첨부 루트 |
| `FILE_STORAGE_PUBLIC_BASE_URL` | `/storage` | 공개 URL prefix |
| `REPORT_STORAGE_ROOT` | `./storage/reports` | Word·레거시 uploads |

---

## 10. 프론트 연동 체크리스트

- [ ] 외근 시작 시 `plannedFields`를 API로 전송 (`destinationStore` 서버 동기화)
- [ ] 보고서: `from-trip` → 슬롯별 `POST .../photos` 또는 PATCH
- [ ] Word: `POST .../export/word` 또는 `POST /api/trips/:tripId/report/generate`
- [ ] 약관 링크: `https://ilgayo.co.kr/terms`, `/privacy`
- [ ] trip 상세: `destinations`, `timeline[].reason` 표시

---

## 11. 미포함 (별도 사이클)

백로그에 있으나 이번 릴리스 범위 밖:

- visit phase (조치 전/중/후 visit 모델) §9  
- MinIO §10  
- ERD 합동 §12  
- `PATCH /api/me` §15  
- PDF export §19  
- Word 위치도 이미지 §20  
- 인앱 경로 프록시 §22  

---

## 12. 주요 파일

| 경로 | 역할 |
|------|------|
| `src/fieldwork/tripsService.js` | destinations, trip CRUD, 주소검색 병합 |
| `src/reports/reportWordService.js` | field_reports → Word |
| `src/reports/fieldReportPhotoService.js` | 슬롯 multipart 업로드 |
| `src/reports/photoResolver.js` | URL → 로컬 경로 (Word 삽입) |
| `src/storage/imageProcessor.js` | sharp 압축 |
| `src/legal/registerLegalRoutes.js` | 약관·개인정보 |
| `src/openapi/paths/trips.js`, `reports.js` | Swagger |

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-06-18 | 최초 작성 (`release` 반영 기준) |
