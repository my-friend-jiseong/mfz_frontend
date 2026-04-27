# Phase 4 §1·§2 처리 완료 보고

> **수신**: mfz_frontend 팀
> **발신**: mfz_backend 팀
> **작성일**: 2026-04-27
> **운영 환경**: `http://59.21.223.137:28080` (컨테이너 `mfz-backend-api`)
> **요청 문서**: [docs/backend_requests_phase4.md](backend_requests_phase4.md)
> **상태**: ✅ §1·§2 복구 완료. **§3는 백엔드 측에서 후속 작업 예정.**

---

## 0. 요약

| 항목 | 우선순위 | 상태 |
|---|---|---|
| §1 — `POST /api/reports` `tripId` 동반 시 500 FK violation | P0 차단 | ✅ 복구 |
| §2 — 공유 발급 응답에 `expiresAt` / `shareExpiresAt` 누락 | P1 UX | ✅ 복구 |
| §3 — 반복 회귀 패턴 / 검증 자동화 | P0 체계 | 🔧 백엔드 진행 (별도 PR) |

§1·§2 모두 **운영 DB 마이그레이션 적용까지 완료**했습니다. 프런트는 이번 사이클부터 폴백 제거 가능하며, **§3 백엔드 작업이 진행되는 동안 프런트는 다른 작업을 우선 진행해도 됩니다.**

---

## 1. §1 — `tripId` FK violation 복구

### 원인
Phase 3 에서 Reports 만 Prisma DB 로 옮겼으나 Trips 는 인메모리 Map 그대로 유지된 상태에서 `reports.trip_id → trips.id` FK 제약이 schema 에 살아 있었음. `trip-{epoch}` 형식 인메모리 ID 가 DB `trips` 테이블에 존재하지 않아 INSERT 시 FK 위반.

### 처리
- **`prisma/schema.prisma`** — `Report.trip` relation 및 `Trip.reports` 역방향 제거. `tripId` 컬럼은 plain nullable string 으로 유지.
- **`prisma/migrations/20260427120000_drop_reports_trip_fk_add_share_expires/migration.sql`**
  ```sql
  ALTER TABLE "reports" DROP CONSTRAINT IF EXISTS "reports_trip_id_fkey";
  ```

### 향후
Trips DB 마이그레이션이 완료되면 별도 PR 에서 FK 를 다시 도입할 예정. 그때는 인메모리 ID 가 모두 DB row 로 존재하므로 안전.

---

## 2. §2 — 공유 만료시각 (`expiresAt` / `shareExpiresAt`) 복구

### 원인
`Report` 모델에 `share_expires_at` 컬럼 자체가 없었고 `enableShare` 도 set 하지 않음. 라우트는 `report.shareExpiresAt` 을 응답에 포함하도록 되어 있었으나 값이 항상 `undefined`.

### 처리
- **`prisma/schema.prisma`** — `shareExpiresAt DateTime? @map("share_expires_at") @db.Timestamptz` 컬럼 추가.
- **`prisma/migrations/20260427120000_drop_reports_trip_fk_add_share_expires/migration.sql`**
  ```sql
  ALTER TABLE "reports" ADD COLUMN "share_expires_at" TIMESTAMPTZ;
  ```
- **`src/reports/reportRepository.js`**
  - `computeShareExpiresAt()` 헬퍼 도입 (env `REPORT_SHARE_EXPIRES_DAYS`, 기본 7일).
  - `enableShare` 가 `sharedAt` 과 함께 `shareExpiresAt` set.
  - `disableShare` 가 `shareExpiresAt` 도 null 로 리셋.
  - `normalize()` 에 `shareExpiresAt` 포함 → 응답 자동 노출.
- 라우트 응답 직렬화 (`registerReportRoutes.js` 의 share 발급 응답) 에는 이미 `expiresAt` / `shareExpiresAt` 두 키가 모두 들어가 있어 별도 수정 불필요.

---

## 3. 운영 적용 결과 (배포 후 검증)

### 3.1 코드 배포
- 커밋 `c5f1ee0` (njs) → 머지 커밋 `e74f3b2` (release) 로 GitHub Actions 자동 배포.
- 컨테이너 `mfz-backend-api` 새 이미지로 재기동 완료.

### 3.2 DB 마이그레이션 적용 (수동)
운영 DB 의 `_prisma_migrations` 메타테이블에 init·add_user_and_report_fields 두 마이그레이션이 미기록 상태였음 (실제 테이블은 존재 — Phase 3 이전 어느 시점에 수동 생성된 것으로 추정). 다음 절차로 정상화:

```bash
# 메타테이블 베이스라인
docker exec mfz-backend-api npx prisma migrate resolve --applied 20260426143744_init
docker exec mfz-backend-api npx prisma migrate resolve --applied 20260426211752_add_user_and_report_fields

# 신규 마이그레이션 적용
docker exec mfz-backend-api npx prisma migrate deploy
```

검증:
```
$ docker exec mfz-backend-api npx prisma migrate status
3 migrations found in prisma/migrations
Database schema is up to date!

$ curl http://localhost:8080/health
{"status":"ok"}
```

### 3.3 컨테이너 로그
```
API listening on 0.0.0.0:8080 (Try it out base: http://59.21.223.137:8080)
```
에러 없음.

---

## 4. 응답 shape (프런트 검증 가이드)

### 4.1 `POST /api/reports` (with `tripId`)
```json
POST /api/reports
{ "title": "외근 보고", "content": "본문 충분히 길게", "summary": "요약", "tripId": "trip-1777253303533" }

→ 201 Created
{
  "success": true,
  "data": {
    "id": "16",
    "tripId": "trip-1777253303533",
    "title": "외근 보고",
    "content": "...",
    "summary": "...",
    "authorUserId": "<requester>",
    "status": "draft",
    "shareEnabled": false,
    "shareToken": null,
    "sharedAt": null,
    "shareExpiresAt": null,
    "createdAt": "...",
    "updatedAt": "...",
    "deletedAt": null
  }
}
```

### 4.2 `POST /api/reports/{id}/share`
```json
→ 200 OK
{
  "success": true,
  "data": {
    "reportId": "16",
    "shareEnabled": true,
    "shareToken": "<64자 hex>",
    "shareUrl": "/api/reports/shared/<token>",
    "sharedAt": "2026-04-27T12:00:00.000Z",
    "expiresAt": "2026-05-04T12:00:00.000Z",
    "shareExpiresAt": "2026-05-04T12:00:00.000Z"
  }
}
```
- `expiresAt` / `shareExpiresAt` 모두 7일 후 ISO (env `REPORT_SHARE_EXPIRES_DAYS` 기본).
- `DELETE /api/reports/{id}/share` 호출 시 `shareExpiresAt` 도 null 로 리셋.

---

## 5. 프런트 후속 액션

### 5.1 즉시 가능 — 폴백 제거
Phase 3 보고서 §4 / Phase 4 §4 에 정리된 임시 폴백을 다음 사이클부터 제거 가능:

| 항목 | 위치 | 비고 |
|---|---|---|
| `reports.list` `success:false` 시 빈 list | `src/api/endpoints/reports.ts` | 정상 200 + items 응답이 보장됨 |
| `id ?? reportId ?? ''` 흡수 | `ReportCreateData` / `reportStore.create` | `data.id` 항상 채워짐 |
| 생성 후 id 빈 문자열 시 list fallback | `app/(tabs)/reports/new.tsx` | 상세 진입 복원 가능 |
| `setShareExpiresAt(... ?? null)` | 보고서 상세 화면 공유 박스 | `expiresAt` / `shareExpiresAt` 둘 다 채워짐 → 만료시각 자동 표시 |

> 단계적 제거를 원하면 한 사이클 더 유지해도 무해 (정상 응답이면 폴백 분기로 안 빠짐).

### 5.2 §3 백엔드 작업 동안 — 다른 작업 진행 권장
§3 (smoke test 자동화 / contract test / 배포 검증) 은 백엔드 측에서 별도 PR 로 처리 예정. 프런트는 그동안 다음 작업을 진행하시면 됩니다:
- §5.1 폴백 제거 정리
- 외근 → 보고서 → 공유 흐름 통합 시연 시나리오 재검증
- 다른 도메인 (외근·현장·방문 등) 의 새 기능

§3 완료 후 별도 보고서로 smoke test 호출 방법·CI 게이트 정책을 전달드리겠습니다.

---

## 6. §3 백엔드 처리 계획 (참고)

요청서 §3 의 권장 조치 셋 다 채택:

| 단계 | 내용 | 산출물 |
|---|---|---|
| A | Reports 도메인 18 단계 smoke test 스크립트화 | `scripts/smoke.sh` 또는 `npm run test:smoke` |
| B | 응답 shape contract test (zod 우선) | repository 응답 직렬화 함수에 런타임 검증 |
| C | CI/CD 동기화 — release push 직후 smoke test 자동 실행 | `.github/workflows/deploy.yml` 후속 step 추가 |

진행 순서: A → C → B (즉효성 우선).

---

## 7. 변경 파일 요약

| 파일 | 변경 |
|---|---|
| `prisma/schema.prisma` | `Report.trip` relation 제거, `Trip.reports` 역방향 제거, `Report.shareExpiresAt` 컬럼 추가 |
| `prisma/migrations/20260427120000_drop_reports_trip_fk_add_share_expires/migration.sql` | 신규 — FK DROP + share_expires_at 컬럼 추가 |
| `src/reports/reportRepository.js` | `computeShareExpiresAt` 헬퍼, `enableShare` / `disableShare` / `normalize` 에 만료시각 처리 추가 |

---

## 8. 참조

- [docs/backend_requests_phase4.md](backend_requests_phase4.md) — 프런트 Phase 4 요구사항 원본
- [docs/archive/backend_phase3_regressions.md](archive/backend_phase3_regressions.md) — Phase 3 회귀 보고
- [docs/archive/backend_phase3_regressions_fix_report.md](archive/backend_phase3_regressions_fix_report.md) — Phase 3 백엔드 1차 복구 보고
- 커밋 `c5f1ee0` — 코드 변경
- 커밋 `e74f3b2` — release 머지 (배포 트리거)
