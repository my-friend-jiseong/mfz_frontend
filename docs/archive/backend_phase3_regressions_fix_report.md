# 백엔드 Phase 3 회귀 — 복구 완료 보고

> **작성일**: 2026-04-27
> **대상 문서**: `docs/backend_phase3_regressions.md` (프런트 보고)
> **상태**: ✅ 복구 완료. 재배포 후 폴백 제거 가능.

## 1. 근본 원인

Phase 3에서 `src/reports/reportRepository.js` 를 인메모리 Map → **Prisma 기반 async 함수**로 마이그레이션했으나, 호출부인 `src/reports/registerReportRoutes.js` 의 라우트 핸들러들은 여전히 동기 호출 (`await` 없음) 그대로였습니다.

| 보고된 증상 | 직접 원인 |
|---|---|
| `POST /api/reports` 응답이 `data: {}` | `createReport(...)` 가 Promise 반환 → `JSON.stringify(promise) === "{}"` (Promise 는 own enumerable property 없음) |
| `GET /api/reports` 가 `all.filter is not a function` (HTTP 500) | `listReports(...)` 가 Promise 반환 → Promise 에는 `.filter` 없음 |

문서엔 미언급이었으나 **상세/수정/삭제/공유 라우트도 동일 패턴으로 깨져 있던 상태**였습니다 (await 누락 → Promise 객체로 분기 판정 → 거의 항상 404 또는 잘못된 응답). 함께 복구했습니다.

추가로 `createReport` 가 `createdBy: null` 하드코딩되어 있어 `authorUserId` 인자가 무시됐습니다. 이 채로 await 만 붙였다면 본인 list 가 비어 보였을 것 (모든 row 의 `created_by` 가 NULL).

## 2. 적용된 수정

### `src/reports/registerReportRoutes.js`
모든 라우트 핸들러를 `async` 로 전환하고 repository 호출에 `await` 추가.

| 라우트 | 변경 내용 |
|---|---|
| `POST /api/reports` | `async` + `await createReport`, `await updateReport` |
| `GET /api/reports` | `async` + `await listReports` |
| `GET /api/reports/shared/:token` | `async` + `await getReportByShareToken` |
| `GET /api/reports/:reportId` | `async` + `await getReportById` |
| `PATCH /api/reports/:reportId` | `async` + `await getReportById`, `await updateReport` |
| `DELETE /api/reports/:reportId` | `async` + `await getReportById`, `await softDeleteReport` |
| `POST /api/reports/:reportId/share` | `async` + `await getReportById`, `await enableShare` |
| `DELETE /api/reports/:reportId/share` | `async` + `await getReportById`, `await disableShare` |
| `POST /api/reports/generate` | (이미 `async`) `await createReport` 추가 |

### `src/reports/reportRepository.js`
- `createReport` 의 `createdBy: null` → `createdBy: authorUserId || null` 로 수정. 이제 list 가 본인 작성건을 정확히 필터.

## 3. 응답 shape (프런트 확인용)

`POST /api/reports` 의 `data` 는 Phase 2 와 동일 shape 으로 복구되었습니다:

```json
{
  "success": true,
  "data": {
    "id": "1",
    "tripId": null,
    "title": "...",
    "content": "...",
    "summary": "...",
    "location": null,
    "notes": null,
    "authorUserId": "<requester-id>",
    "status": "draft",
    "generatedByAi": false,
    "outputFileUrl": null,
    "shareEnabled": false,
    "shareToken": null,
    "sharedAt": null,
    "createdAt": "<ISO>",
    "updatedAt": "<ISO>",
    "deletedAt": null
  }
}
```

> ℹ️ `id` 는 string 입니다 (DB 타입은 BigInt 이지만 repository 의 `normalize` 가 `String(report.id)` 로 직렬화). 프런트의 `ReportCreateData.id` 옵셔널 처리는 그대로 두어도 무해.

`GET /api/reports` 는 기존 shape 동일 (`items` / `pagination` / `emptyMessage`). 본인 작성건만 반환됩니다 (admin role 제외).

## 4. 검증 (백엔드 측)

- Node 신택스 체크: `node --check` 통과 (양 파일).
- 잔여 동기 호출 grep: 0건.
- DB FK 안전성 확인: `getRequester(req)` 는 JWT `sub` (= `User.id`) 를 반환. 신규 가입은 `prisma.user.create` 로 User row 가 만들어지므로 `reports.created_by → users.id` FK 제약 충족.

## 5. 프런트 권장 후속 조치

복구된 응답이 정상 동작함을 확인한 뒤, 프런트 문서 §4 의 **임시 폴백 제거 가능**:

1. `src/api/endpoints/reports.ts`
   - `reports.list` 의 `success:false` / 비정상 본문 폴백 — 더 이상 필요 없음 (정상 200 + items 응답).
   - `ReportCreateData.id` / `reportId` 듀얼 옵셔널 — `id` 단일로 정리 가능.
   - `reportDataId(d)` 헬퍼 — 제거 가능.
2. `src/stores/reportStore.ts` — create 결과 id 빈 문자열 흡수 로직 제거 가능.
3. `app/(tabs)/reports/new.tsx` — id-empty 시 list 폴백 제거하고 상세 화면 직접 진입 복원.

> 단계적 제거를 원하면 폴백 코드를 한 단계 더 유지해도 무해합니다 (정상 응답이면 폴백 분기로 안 빠짐). 다음 시연 사이클 끝나고 정리해도 OK.

## 6. 재현 시나리오 (smoke test)

```http
# 1. 신규 가입 + 로그인 (토큰 획득)

# 2. 보고서 생성
POST /api/reports
Authorization: Bearer {token}
Content-Type: application/json
{ "title": "t", "content": "본문 충분 길게", "summary": "s" }
→ 201, data.id 채워짐, data.authorUserId = 본인

# 3. 본인 list
GET /api/reports
Authorization: Bearer {token}
→ 200, items[0].reportId === 위에서 받은 id

# 4. 상세
GET /api/reports/{id}
→ 200, toReportDetail shape

# 5. 공유 토글 / 수정 / 삭제도 모두 정상 동작
```

## 7. 변경된 파일

- `src/reports/registerReportRoutes.js`
- `src/reports/reportRepository.js`
