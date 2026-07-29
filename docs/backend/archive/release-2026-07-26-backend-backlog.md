# 백엔드 결과보고서 — 2026-07-26 (`release`)

> **반영 범위:** `af5320e` → `2a97fab` (커밋 8개)  
> **브랜치:** `release` 직접 푸시 → 자동 배포  
> **작성일:** 2026-07-26  
> **소스 백로그:** 프론트 전달 `backend-backlog.md` 활성 큐 일괄 처리  
> **원격 tip:** `2a97fab3adc3db55875e01321e807b1ddb6685b4`

이전 배치: [release-2026-06-19-destinations-overview.md](./release-2026-06-19-destinations-overview.md) · [release-2026-06-backend-backlog.md](./release-2026-06-backend-backlog.md)

---

## 1. 한 줄 요약

| § | 우선순위 | 결과 | 내용 |
|---|----------|------|------|
| **§25** | 🟠 | ✅ 배포 | 사용자 커스텀 카테고리 마스터 CRUD `/api/categories` |
| **§12-A** | 🟠 | ✅ 문서 | Prisma 스키마 dump + ERD diff (`docs/db-schema.md`) |
| **§9** | 🟠 | ✅ 배포 | `visit_photos.phase` + `phaseProgress` + from-trip 슬롯 자동매핑 |
| **§3** | 🟡 | ✅ 기구현 | `address.json`+`keyword.json` 병합 — 코드 변경 없음 |
| **§19** | 🟡 | ✅ 배포 | 보고서 PDF export (`pdfkit`) |
| **§15** | 🟢 | ✅ 배포 | `PATCH /api/me`, `PATCH /api/me/password` |
| **§22** | 🟡 | ✅ 배포 | 카카오모빌리티 자동차 경로 프록시 `POST /api/trips/:id/route` |
| **§10** | 🟢 | ✅ 부분 | MinIO/S3 드라이버 + 사진 1920/q72 (음성·zip&lt;20MB는 후속) |

---

## 2. 커밋 목록 (`release`)

| SHA | 메시지 |
|-----|--------|
| `8cc8e12` | Add user-scoped categories master CRUD (backlog §25). |
| `62bc3dd` | Document current Prisma schema dump for ERD sync (backlog §12-A). |
| `5a53b02` | Add visit photo phase and auto-map into field reports (backlog §9). |
| `7b02fb4` | Add report PDF export via pdfkit (backlog §19). |
| `37135e6` | Add PATCH /api/me and password change endpoints (backlog §15). |
| `386a195` | Add Kakao Mobility driving route proxy for trips (backlog §22). |
| `3603a31` | Add MinIO/S3 storage driver and tighten photo compression (backlog §10). |
| `2a97fab` | Document MinIO/S3 env vars in .env.example. |

푸시: `origin/release` `af5320e..2a97fab` (2026-07-26).

---

## 3. DB 마이그레이션

배포 시 컨테이너 기동 후 `prisma migrate deploy` 자동 실행.

| 마이그레이션 | 내용 |
|-------------|------|
| `20260726120000_add_categories` | `categories` 테이블 (user 스코프, `(user_id, name)` UQ) |
| `20260726130000_visit_photo_phase` | `visit_photos.phase` VARCHAR(16) nullable |

로컬 수동:

```bash
npx prisma migrate deploy
npx prisma generate
npm install   # pdfkit, @aws-sdk/client-s3 신규
```

---

## 4. 항목별 상세

### 4.1 §25 — categories CRUD

| Method | Path | 성공 |
|--------|------|------|
| GET | `/api/categories` | `{ items: [{ categoryId, name, createdAt }], pagination }` |
| POST | `/api/categories` `{ name }` | **201** `{ categoryId, name, createdAt }` |
| PATCH | `/api/categories/:categoryId` `{ name }` | 동일 shape |
| DELETE | `/api/categories/:categoryId` | **204** |

- 에러: `category_name_required`(400), `category_name_taken`(409), `category_not_found`(404)
- 현장 `Field.categories: string[]` / `field_categories` **계약 무변경** (FK·rename cascade 없음)

### 4.2 §12-A — ERD / 스키마 dump

- 신규: [`docs/db-schema.md`](./db-schema.md) — 테이블·FK·파생값·ERD.drawio diff·예정 레이어
- **§12-B** (drawio 갱신)는 프론트 합동 — 백엔드 dump만 완료

### 4.3 §9 — visit phase

- `visit_photos.phase`: `before` \| `during` \| `after` \| `null`
- `POST /api/visits/:visitId/photos` multipart에 `phase?`
- 응답: `attachment.phase`, `phaseProgress` (`before`\|`during`\|`after`\|`done`\|null)
- trip timeline / visit 상세에 `phaseProgress` 포함
- `POST /api/reports/from-trip/:tripId`: phase → field_reports 슬롯  
  `before` → `beforePhotoUrl`, `during` → `pendingPhotoUrl`, `after` → `afterPhotoUrl`
- 에러: `visit_phase_invalid`(400)

### 4.4 §3 — 주소 검색 POI

- 이미 `searchFieldAddress`가 `address.json` + `keyword.json` 병렬 호출·병합·중복제거
- **추가 커밋 없음**

### 4.5 §19 — PDF export

| Method | Path |
|--------|------|
| POST | `/api/reports/:reportId/export/pdf` |
| POST | `/api/reports/:reportId/export?format=pdf\|word` |

- 의존성: `pdfkit`
- 응답: `{ url, downloadUrl, format: "pdf", ... }` — Word `outputFileUrl` **덮어쓰지 않음**
- 에러: `export_format_invalid`(400)

### 4.6 §15 — 프로필 수정

| Method | Path | 응답 |
|--------|------|------|
| PATCH | `/api/me` `{ name? }` | `{ user }` |
| PATCH | `/api/me/password` | `{ updated: true }` |

- 에러: `name_required`, `current_password_invalid`, `password_confirm_mismatch`, `password_policy_violation`
- 비밀번호 정책: signup과 동일 (현재 최소 8자)

### 4.7 §22 — 인앱 경로 프록시

- `POST /api/trips/:tripId/route`  
  body: `{ origin: {lat,lng}, destination: {lat,lng}, waypoints?: [{lat,lng}] }`
- 카카오모빌리티 `v1/directions` 또는 `v1/waypoints/directions` (`KAKAO_REST_API_KEY`)
- 응답: `{ distance(m), duration(s), vertexes: [{lat,lng}], ... }`

### 4.8 §10 — 파일 저장 / 압축 (부분)

- `FILE_STORAGE_DRIVER=disk|s3|minio` — MinIO는 S3 호환 (`@aws-sdk/client-s3`)
- 사진 정규화 기본값: long edge **1920**, JPEG **q=72**
- **미구현(후속):** 음성 비트레이트 정규화, 보고서 zip &lt; 20MB 보장

---

## 5. 신규 의존성

| 패키지 | 용도 |
|--------|------|
| `pdfkit` | §19 PDF |
| `@aws-sdk/client-s3` | §10 MinIO/S3 |

배포 이미지 빌드 시 `npm install`로 포함되어야 함.

---

## 6. 운영 검증 (2026-07-26)

### 6.1 배포 직후 (구 이미지)

| 검사 | 결과 |
|------|------|
| `GET /health` | 200 `{"status":"ok"}` |
| `GET /api/categories` | Express HTML **404** `Cannot GET` |
| OpenAPI | `categories` 태그/path **없음** |

→ 푸시 직후 아직 구 컨테이너 서빙.

### 6.2 배포 교체 중

| 검사 | 결과 |
|------|------|
| `https://ilgayo.co.kr/health` | 일시 **연결 실패** (수 분) |

→ 컨테이너 교체 구간으로 추정.

### 6.3 배포 완료 후 (신 이미지)

| 검사 | 결과 |
|------|------|
| `GET /health` | **200** `{"status":"ok"}` |
| `GET /api/categories` (무토큰) | **401** `{ code: "auth_header_missing", ... }` |
| `GET /api-docs.json` | **200**, 아래 path 포함 확인 |

OpenAPI에서 확인된 path:

- `/api/categories`
- `/api/me/password`
- `/api/reports/{reportId}/export/pdf`
- `/api/trips/{tripId}/route`
- `phase` (스키마/문서 문자열)

무토큰 기준 라우트 존재·에러 envelope는 정상. **로그인 후 CRUD 라운드트립은 본 보고서 작성 시점에 미실행** (운영 데이터 변경 최소화).

---

## 7. 프론트 연동 체크리스트

- [ ] `categoryStore` → 서버 `/api/categories` 단일 소스 스왑 (`TODO(backend)` 제거)
- [ ] visit 사진 업로드에 `phase` 전송 + UI chip
- [ ] 보고서 상세에 PDF 다운로드 (`export/pdf`)
- [ ] 프로필 이름/비밀번호 폼 → `PATCH /api/me*`
- [ ] active 외근 지도 폴리라인 → `POST /trips/:id/route` vertexes
- [ ] §12-B: `docs/db-schema.md` 기준으로 `ERD.drawio` 갱신

---

## 8. 잔여 / 주의

| 항목 | 내용 |
|------|------|
| §12-B | drawio 합동 갱신 미완 |
| §10 잔여 | 음성 비트레이트, 보고서 zip &lt;20MB |
| §25 후속 | `field_categories` → `category_id` FK / rename cascade |
| CI 가시성 | GitHub Actions API는 private로 404 — Actions UI에서 수동 확인 권장 |
| SSH | 본 환경에서 `MyServer-mfjs` 호스트명 해석 실패 — 서버 로그는 운영자 확인 |

---

## 9. 관련 문서

- [`docs/db-schema.md`](./db-schema.md) — 스키마 dump (§12-A)
- [`docs/features.md`](./features.md) — 엔드포인트 목록
- [`docs/errors.md`](./errors.md) — 에러 코드
- [`docs/setup.md`](./setup.md) · [`.env.example`](../.env.example) — MinIO/이미지 env
