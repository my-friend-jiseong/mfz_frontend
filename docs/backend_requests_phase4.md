# 백엔드 추가 보강 요청 — Phase 4

> **수신**: mfz_backend 팀
> **발신**: mfz_frontend 팀 (njs)
> **작성일**: 2026-04-27
> **검증 환경**: `http://59.21.223.137:28080`
> **방법**: Phase 3 회귀 복구 후 풀 시나리오 18단계 curl smoke test 재실행
> **현황**: Phase 3 응답 shape 회귀(`docs/backend_phase3_regressions.md`)는 [`docs/backend_phase3_regressions_fix_report.md`](backend_phase3_regressions_fix_report.md) 의 await/async 마이그레이션으로 복구됐으나, **재검증 중 같은 도메인(Reports)에서 신규 회귀 + 누락 항목 추가 확인**.

---

## 0. 우선순위 한 눈에

| 순위 | 항목 | 차단도 |
|---|---|---|
| **P0** | [§1] `POST /api/reports` 가 `tripId` 동반 시 **500 FK violation** | 🔴 외근→보고서 UX 핵심 흐름 전면 차단 |
| **P1** | [§2] 공유 발급 응답에 `expiresAt` / `shareExpiresAt` 누락 | 🟡 만료시각 화면 표시 불가 |
| **P0** | [§3] **🔥 반복 회귀 패턴** — Reports 도메인 Phase 3 이후 4건 누적 | 🔴 시연 안정성·신뢰도 저하 |

---

## 1. [P0·차단] `POST /api/reports` 가 `tripId` 동반 시 500 FK violation

### 재현
```http
POST /api/reports
Authorization: Bearer {token}
Content-Type: application/json

{
  "title": "외근 보고",
  "content": "본문 충분히 길게",
  "summary": "요약",
  "tripId": "trip-1777253303533"
}
```

### 응답 (HTTP 500)
```json
{
  "success": false,
  "error": "\nInvalid `prisma.report.create()` invocation:\n\n\nForeign key constraint violated: `reports_trip_id_fkey (index)`"
}
```

같은 요청에서 `tripId` 만 빼면 정상 201:
```json
{ "success": true, "data": { "id": "15", "tripId": null, ... } }
```

### 원인 추정
- Phase 3 에서 **Reports 가 Prisma DB 로 마이그레이션**되며 `reports.trip_id → trips.id` FK 제약이 함께 들어옴
- 그러나 **Trips 는 여전히 인메모리 Map** (Phase 2 시점 데이터 모델)
- `trip-{epoch}` 형식 ID 가 DB `trips` 테이블에 존재하지 않아 FK 위반

### 영향
- **외근 상세 → "수동 보고서 작성"** 차단
- **외근 상세 → "✨ AI 보고서 생성"** 도 동일 FK 가능성 (`POST /api/reports/generate` 에 `tripId` 전송) — 별도 검증 필요
- 보고서 작성 화면(`/(tabs)/reports/new?tripId=...`) 에서 사용자가 외근 선택 후 저장 → 500 → 사용자에겐 "보고서 생성 실패"

### 권장 조치 (둘 중 택 1)
1. **Trips 도 DB 마이그레이션** — 정합성 정답. Reports 와 동일 패턴(Prisma + async repository) 으로 전환. jy 의 destinations·navigation 등 의존 도메인도 함께 검토 필요.
2. **`reports.trip_id` FK 제거 + plain string nullable** — 빠른 우회. 인메모리 trip ID 를 그대로 보관. 정합성 약하나 차단 즉시 해소.

---

## 2. [P1·UX] 공유 발급 응답에 `expiresAt` / `shareExpiresAt` 누락

### 재현
```http
POST /api/reports/{id}/share
Authorization: Bearer {token}
{}
```

### 실측 응답
```json
{
  "success": true,
  "data": {
    "reportId": "15",
    "shareEnabled": true,
    "shareToken": "...",
    "shareUrl": "/api/reports/shared/...",
    "sharedAt": "..."
    // expiresAt / shareExpiresAt 부재
  }
}
```

### 기대 (백엔드 [`backend_phase3_complete.md` §5](backend_phase3_complete.md))
```json
{
  ...,
  "expiresAt": "<7일 후 ISO>",
  "shareExpiresAt": "<7일 후 ISO>"
}
```

### 영향
- 보고서 상세 화면의 "발급된 공유 링크 박스" 에 만료시각 표시 안 됨 (코드는 `setShareExpiresAt(r.share.expiresAt ?? r.share.shareExpiresAt)` 로 fallback 했으나 둘 다 undefined)
- 사용자가 공유 링크가 언제 만료될지 모름

### 권장 조치
백엔드 `enableShare` 가 `shareExpiresAt` 을 DB 에 set 하면서 응답 직렬화에도 포함해주세요 (`REPORT_SHARE_EXPIRES_DAYS` 기본 7일 정책 그대로).

---

## 3. 🔥 [P0·체계] **반복 회귀 패턴 — Reports 도메인 신뢰도 위기**

### 발생 사실
Phase 3 시작(2026-04-27) 이후 Reports 도메인에서 **4건의 회귀가 연쇄 발생**:

| # | 발견 | 증상 | 원인 | 상태 |
|---|---|---|---|---|
| 1 | 1차 검증 | `POST /api/reports` → `data: {}` (빈 객체) | Promise 직렬화 (`await` 누락) | ✅ 복구 (`backend_phase3_regressions_fix_report.md`) |
| 2 | 1차 검증 | `GET /api/reports` → 500 `"all.filter is not a function"` | Promise 직렬화 (`await` 누락) | ✅ 복구 |
| 3 | 2차 검증 (이번) | `POST share` 응답에 `expiresAt` 누락 | 응답 직렬화 누락 | ❌ 미복구 ([§2](#2-p1ux-공유-발급-응답에-expiresat--shareexpiresat-누락)) |
| 4 | 2차 검증 (이번) | `POST /api/reports` with `tripId` → 500 FK | Trips 미마이그레이션 + FK 잔존 | ❌ 미복구 ([§1](#1-p0차단-post-apireports-가-tripid-동반-시-500-fk-violation)) |

### 공통 패턴
- **Prisma 마이그레이션 시 호출부·인접 도메인 동기화 누락**
  - 1·2: `await` 누락
  - 4: 인접 도메인(Trips) 미마이그레이션 채로 FK 만 도입
- **응답 shape 검증 누락**
  - 1: `data` 빈 객체
  - 3: `expiresAt` 누락
- **CI/CD 배포가 코드 수정과 분리** — 복구 보고 후 실 서버 재시작이 안 돼서 재현 발생 (1차 재검증 시 동일 회귀 그대로)

### 강조 — 동일 패턴 재발 가능성
> **회귀 1·2 가 같은 사이클에서 동일 원인(Promise/await)으로 발생했고, 회귀 3·4 도 같은 도메인의 별개 직렬화·정합성 누락**. 즉 한 PR 안의 변경이 단위 검증 없이 머지되면서 도메인 전체가 흔들리는 패턴이 **두 사이클 연속** 관찰됨.
>
> 같은 도메인의 다음 회귀 발생을 막으려면 **검증 자동화** 가 필요합니다.

### 권장 조치 (체계)

#### A. Reports 도메인 통합 smoke test 자동화
다음 18단계를 매 PR 머지 직전 + 매 배포 직후 자동 실행:

```bash
# pseudo
1.  POST /auth/signup        → 201, accessToken
2.  POST /auth/signup        → 400 email_already_exists (재가입)
3.  GET  /api/me             → 200, {id, email, name, role}
4.  POST /api/trips/start    → 201, tripId
5.  POST /api/fields         → 201, fieldId, lat/lng/assigneeUserId
6.  GET  /api/fields/mine    → 200, items[0].lat/lng/roadAddress 등
7.  PATCH /api/fields/{id}/status → 200, previousStatus
8.  POST /api/fields/{id}/memos   → 201, attachment
9.  POST /api/visits/check-in     → 201, visitId
10. POST /api/visits/{id}/memos/text → 201
11. PATCH /api/visits/{id}/status → 200, statusLogs[2]
12. GET  /api/trips/{tid}/visits/{vid} → 200, attachments[]
13. POST /api/trips/end           → 200, banner.isActive=false
14. POST /api/reports             → 201, data.id, data.authorUserId
14a. POST /api/reports with tripId → 201 (현재 500, P0)
15. GET  /api/reports             → 200, items[0].reportId
16. GET  /api/reports/{id}        → 200, creator.name=본인이름
17. POST /api/reports/{id}/share  → 200, shareEnabled=true, expiresAt 존재 (현재 누락, P1)
17b. DELETE /api/reports/{id}/share → 200
18. DELETE /api/reports/{id}      → 204
```

위 단계를 한 번에 실행하는 스크립트(`backend/scripts/smoke.sh` 또는 `npm test:smoke`)를 만들고, **CI 파이프라인에 추가**해서 머지 차단 게이트로 사용해주세요.

#### B. 응답 shape 단위 검증 (Pact / OpenAPI 검증)
- 스웨거 `components/schemas` 에 정의된 shape 와 실 응답을 비교하는 contract test 도입.
- `data.id` 가 string 인지, `expiresAt` 가 ISO 인지 등을 자동 확인.
- 작업 부담 큰 경우 **응답 직렬화 함수에 zod / yup 같은 런타임 검증** 추가도 즉효.

#### C. CI/CD 와 동기화된 배포 체크리스트
1차 재검증 시 "복구 완료" 보고 직후에도 동일 회귀 그대로 재현됐던 사례 (회귀 1·2 의 fix 가 실 서버에 즉시 반영 안 됨) 를 막기 위해:
- 배포 후 **자동으로 §A 의 smoke test 실행** + 통과 확인 후 "배포 완료" 알림
- 또는 PR 본문에 "deploy verification: pass/fail" 체크박스

---

## 4. 프런트 임시 대응 현황

이번 회귀에 대한 프런트 임시 폴백:

| 항목 | 폴백 위치 | 백엔드 복구 시 제거 |
|---|---|---|
| `reports.list` 가 `success:false` 응답 시 빈 list | `src/api/endpoints/reports.ts` | ✅ 제거 가능 (현재 무해) |
| `id ?? reportId ?? ''` 흡수 | `ReportCreateData` / `reportStore.create` | ✅ 제거 가능 |
| 생성 후 id 빈 문자열 시 list 화면 fallback | `app/(tabs)/reports/new.tsx` | ✅ 제거 가능 |
| **§1 tripId FK** 차단 우회 | (현재 없음) — 사용자가 외근 선택 시 그대로 500 받음 | 백엔드 §1 복구 후 정상 |
| **§2 expiresAt 누락** | `setShareExpiresAt(... ?? null)` 가 있으나 둘 다 undefined → 표시 안 됨 | 백엔드 §2 복구 후 자동 표시 |

§1 가 **차단 항목** 이므로 우선 처리 부탁드립니다.

---

## 5. 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-04-27 | Phase 4 초안 — §1 tripId FK / §2 expiresAt 누락 / §3 반복 패턴 강조 + smoke test 자동화 권장 |

---

## 6. 참조

- [docs/backend_phase3_regressions.md](backend_phase3_regressions.md) — Phase 3 회귀 보고 (1·2·3 항목 일부 복구)
- [docs/backend_phase3_regressions_fix_report.md](backend_phase3_regressions_fix_report.md) — 백엔드 1차 복구 보고
- [docs/backend_phase3_complete.md](backend_phase3_complete.md) — Phase 3 작업 완료 보고
- [docs/_swagger_responses.md](_swagger_responses.md) — 실응답 캡처
