# 백엔드 — 프론트엔드 handoff 응답 (2026-05-06)

> 대상 PR/브랜치: `njs` (다음 release 머지 대기)
> 입력 문서: [`docs/backend-handoff.md`](./backend-handoff.md)
> 응답 contract: 모든 4xx/5xx 는 Phase 7 단일 shape `{ code, message, fields?, details? }`

## 항목별 처리 결과

| # | 항목 | 처리 | 결과 |
|---|---|---|---|
| 1 | Kakao address search | ✅ 코드 OK, env 확인 필요 | §1 |
| 2 | session activity ping | ✅ 동작·shape 명세 | §2 |
| 3 | 보안 코드 발화 시점 | ✅ 정책 문서화 | §3 |
| 4 | error.fields 발화 | ⏭ 보류 (작업 트리거 시점에) | §4 |
| 5 | visit status enum | ⚠ **프론트 enum 정정 필요** + 백엔드 에러 메시지 개선 | §5 |
| 6 | geofence/nav/state-history shape | ⚠ **프론트 가정 ≠ 백엔드 실제** — 실 contract 표기 | §6 |
| 8 | 공유 보고서 첨부 | ⏭ 보류 | §8 |
| 9 | trips/start plannedFields + pre-trip optimize | 9b ✅ 신규 endpoint, 9a ⏭ schema 변경 큼 | §9 |
| 12 | 비밀번호 재설정 | ⏭ 이메일 인프라 도입 후 | §12 |
| 13 | PATCH/DELETE /api/fields/:id 500 | 🔴 **prod 로그 확보 후 hotfix 필요** | §13 |

---

## §1. Kakao address search — 코드 OK

[GET /api/fields/address/search](../src/openapi/paths/trips.js) 는 [Phase 5 §1 (커밋 c88dadb)](../src/fieldwork/tripsService.js#L1176) 에서 이미 구현됨. 응답 shape 도 프론트 contract 와 일치 (`query`, `provider`, `items`).

**확인 포인트**:
- 운영 컨테이너에 `KAKAO_REST_API_KEY` 환경변수 설정됐는지. [.env.example:46](../.env.example#L46) 에 명시됨.
- 미설정이면 503 + `code: "kakao_provider_unavailable"` 응답 (frontend contract 와 일치).
- ssh ilgayo "docker exec mfz-backend env | grep -i kakao" 로 확인 가능.

> ⚠ 프론트 contract 의 `provider.secondary` / `retryOnFailure` / `emptyMessage` 필드는 **현 백엔드 응답에 없음**. 프론트가 사용 안 하면 무시, 사용한다면 별도 합의.

---

## §2. session activity ping

엔드포인트 [POST /api/system/session/activity](../src/server.js#L201) 동작:

```jsonc
// 200
{ "ok": true, "lastActivityAt": "2026-05-06T12:34:56.789Z" }

// 400 — 토큰에 sid 클레임 없음
{ "code": "session_id_missing", "message": "토큰에 session id가 없습니다" }

// 401 — Bearer 미들웨어 / 세션 비활성
{ "code": "session_inactive", "message": "세션이 만료되었습니다" }
```

동작:
- 호출 시 메모리 SESSIONS 맵의 `lastActivityAt` 업데이트. **idle timer 가 사실상 reset 됨** ([sessionService.js:104](../src/auth/sessionService.js#L104)).
- 인증 만료 시 표준 401 — 프론트 refresh 흐름이 자연스럽게 흡수.

→ 프론트 `request<unknown>` 을 `SessionActivityResponse = { ok: boolean; lastActivityAt: string }` 로 typed 하시면 됩니다.

---

## §3. 보안 코드 발화 시점

[refreshSessionLocked](../src/auth/sessionService.js#L245) 의 분기:

| code | 발화 조건 |
|---|---|
| `refresh_token_superseded` (401) | 제출된 refresh 토큰이 현재 저장된 hash 와 다름 + 마지막 rotation 으로부터 `refreshSupersedeWindowMs` (env: `REFRESH_SUPERSEDE_WINDOW_MS`, 기본값 sessionPolicy 응답 참조) 이내. 동시성 race 또는 retry 로 직전 토큰이 막 회전된 경우 — **재시도 안전** (직전 응답 토큰 사용) |
| `all_sessions_revoked` (401) | 위 window 를 초과한 시점에 stale refresh 가 제출됨 → reuse 공격으로 간주 → 해당 user 의 모든 세션 강제 revoke (`revokedReason: "refresh_token_reuse_detected"`). 다른 디바이스 세션 모두 끊김 |

**현재 미구현** (필요 시 발화 가능):
- 관리자 forced logout — 별도 admin endpoint 없음
- 비밀번호 변경 시 자동 revoke — §12 와 함께 도입 예정

`/api/system/session/policy` 응답의 `refreshSupersedeWindowMs` / `refreshReuseRevokesAllSessions: true` 가 정책 노출. 프론트 [PR #5 PR-A 의 single-flight 흐름](.) 그대로 유효.

---

## §4. error.fields 발화 — 보류

Phase 7 contract 상 가능 (`{ code, message, fields, details }`). 현재 **어떤 라우트도 fields 채우지 않음**. 폼 검증 UX 개선 트리거 시점 (회원가입 / 보고서 / 현장 등록 검증 강화 시) 에 백엔드에 추가. 프론트 [`applyFieldErrors`](.) 헬퍼는 이미 준비됨 — 백엔드만 채우면 자동 반영.

신규 `validation_failed` code 추가 가능성 — 도입 시점에 ERROR_CATALOG 갱신 + 본 가이드 update.

---

## §5. visit status enum — 프론트 enum 정정 필요

프론트가 작성한 contract:
```ts
type VisitStatus = 'normal' | 'absent' | 'refused' | 'unknown_address' | 'revisit_required' | 'other';
```

**문제 2건**:
1. `'normal'` — 백엔드 `resultStatus` 의 값과 충돌. `visit.status` 자리에 `'normal'` 보내면 백엔드가 거부.
2. `'revisit_required'` — 백엔드는 `'revisit_needed'`.

**백엔드 canonical** ([Phase 6 contract](./api_response_shape_v2.md), [tripRepository.js:4](../src/fieldwork/tripRepository.js#L4)):

```ts
type VisitStatus =
  | 'completed'         // 완료 (resultStatus = normal 자동)
  | 'absent'            // 부재
  | 'refused'           // 수취 거절
  | 'unknown_address'   // 주소 불명
  | 'revisit_needed'    // 재방문 필요
  | 'other';            // 기타 (statusReason 필수, 10자 이상)

type VisitResultStatus = 'normal' | 'abnormal';   // status='completed' 면 자동 'normal'
```

**액션**: 프론트의 [`src/types/entities.ts`](.) 에서:
- `'normal'` → `'completed'`
- `'revisit_required'` → `'revisit_needed'`
- `VISIT_STATUS_LABEL` 매핑 키도 동시 갱신 (한국어 노출은 그대로)

운영 DB 에 이미 `'completed'` / `'revisit_needed'` 데이터 100건+ 있어서 백엔드 schema 변경은 마이그레이션 부담 큼. 프론트 enum 만 갱신하는 게 압도적으로 단순.

**백엔드 개선**: [src/http/errorResponse.js](../src/http/errorResponse.js) 의 `visit_status_invalid` 메시지에 valid 목록 명시했음 (이번 commit) — 프론트 디버깅이 쉬워짐:
```jsonc
{
  "code": "visit_status_invalid",
  "message": "방문 상태는 completed/absent/refused/unknown_address/revisit_needed/other 중 하나여야 합니다"
}
```

---

## §6. geofence / nav / state-history — 프론트 가정 ≠ 백엔드 실제

프론트가 typed 한 contract 가 백엔드 현재 구현과 여러 곳에서 다릅니다. 백엔드를 frontend 쪽으로 맞추는 건 큰 작업이라, 우선 **현재 백엔드의 실제 contract** 를 그대로 명세합니다. 프론트 typed 정렬 권장.

### 6a. Geofence 등록

```ts
POST /api/trips/:tripId/geofences/register
body: {
  platform: "android" | "ios",       // 필수
  fields: Array<{                    // 배열! 한 번에 여러 현장 등록
    fieldId: string,
    name?: string,
    lat: number,
    lng: number,
  }>,
  radiusMeters?: number              // 150~200, 기본 180
}

→ 201:
{
  subscriptionId: string,
  tripId: string,
  platform: "android" | "ios",
  geofenceCount: number,
  radiusMeters: number,
  policy: { recommendedRange: [150, 200], enterOnlyHighAccuracyBoost: true }
}
```

### 6b. Geofence 도착 알림

```ts
POST /api/trips/:tripId/geofences/arrival
body: { fieldId: string, detectedAt?: ISO8601 }   // 프론트 'arrivedAt' → 백엔드 'detectedAt'

→ 200:
{
  tripId: string,
  fieldId: string,
  detectedAt: ISO8601,
  notification: { title: "현장 도착 감지", message: "도착이 감지되었습니다." },
  action: { type: "open_checkin", url: "/visits/check-in?tripId=...&fieldId=..." }
}
```

프론트의 `acknowledged: true, suggestCheckIn: boolean` 형태 아님. 위 shape 으로 typed.

### 6c. Navigation deep links

```ts
POST /api/trips/:tripId/navigation/deep-links
body: {
  fieldId?: string,
  destinationName?: string,
  destinationLat: number,         // 필수
  destinationLng: number          // 필수
}

→ 200:
{
  tripId: string,
  fieldId: string | null,
  destinationName: string,
  providers: {                    // 평탄 X, providers 객체로 wrap
    kakao: string,
    google: string,
    naver: string
  }
}
```

프론트가 평탄 `{ kakao, naver, google }` 으로 typed 한 부분은 `result.providers` 로 한 단계 내려서 사용해야 합니다.

### 6d. State history

```ts
GET /api/trips/state-history?fromDate=&toDate=&userId=

→ 200:
{
  data: {
    items: Array<{
      // toListItem 결과 + timeline + adminExtra
      tripId: string,
      tripDate: "YYYY-MM-DD",
      startedAt: ISO8601,
      endedAt: ISO8601 | null,
      durationMinutes: number,
      visitCount: number,
      siteCount: number,
      status: "normal" | "abnormal",
      lifecycleStatus: "active" | "abnormal_open" | "ended",
      abnormalTag: string | null,
      needsOfficialReportNotice: boolean,
      timeline: Array<{                       // status transitions
        id: string,
        tripId: string,
        userId: string,
        fromStatus: string | null,
        toStatus: string,
        changedAt: ISO8601,
        reason: string | null
      }>,
      adminExtra: { totalDistanceKm: number, visitCount: number } | null
    }>,
    retentionPolicy: {
      minimumYears: 1,
      sensitiveInfoYears: 2,
      note: "KISA 안전성 확보조치 기준"
    }
  }
}
```

프론트가 가정한 `{ items, pagination }` 형태 아님. **pagination 미구현** (state-history 는 lookback 30일 default), **eventType 평탄 shape 아님** — items[i].timeline[j] 가 transition 단위. 프론트 typed 갱신 필요.

---

## §8. 공유 보고서 첨부 노출 — 보류

API 추가 자체는 단순 (Report ↔ Trip ↔ Visit ↔ VisitAttachment / FieldAttachment 조인). 우선순위 낮아 다음 사이클에 처리. 별도 endpoint `GET /api/reports/shared/:token/attachments` 로 가는 안이 보안상 깔끔 (응답 본문에 첨부 metadata 추가하면 share token 만으로 모든 첨부 노출).

---

## §9. trips/start plannedFields + pre-trip optimize

### 9a. plannedFields — 보류 (schema 변경 필요)

destinations 정식 모델로 들어가려면 신규 `TripDestination` 테이블 + 마이그레이션 + repository + service 라인업. 운영 데이터 보존이라 신중. 다음 사이클에 처리하거나, 우선 클라이언트 store + `Visit` 으로 우회 (현재 흐름 유지) 가능.

타협안: `Trip` 모델에 `plannedFieldIds: String[]` 같은 Array 컬럼 추가. 하지만 이건 visit 와 분리된 의미라 결국 `TripDestination` 이 정합. 다음 사이클에 정식 도입 권장.

**현재 [POST /api/trips/start](../src/fieldwork/tripsService.js#L417)** 는 `startLocation` 만 받고 destinations 응답에 미포함 — 프론트 contract 와 정렬 안 됨.

### 9b. pre-trip optimize — ✅ 신규 endpoint 추가

이번 commit 에서 [POST /api/trips/optimize-preview](../src/fieldwork/registerTripRoutes.js) 추가.

```ts
POST /api/trips/optimize-preview
body: {
  startLat: number,
  startLng: number,
  fields: Array<{ fieldId: string, name?: string, lat: number, lng: number }>
}

→ 200:
{
  optimizedOrder: Array<{
    fieldId: string,
    name: string,
    lat: number,
    lng: number,
    distanceFromPrevKm: number,
    etaMinutes: number
  }>,
  summary: {
    algorithm: "nearest_neighbor",
    totalDistanceKm: number,
    totalEtaMinutes: number
  }
}

→ 400 code: route_fields_required | origin_invalid | destination_invalid
→ 401 인증 실패
```

프론트의 `src/utils/routeOptimize.ts` 폴백 자리에 이 endpoint 호출로 교체 가능. tripId 불필요, 인증만 있으면 호출.

기존 `/api/trips/:tripId/navigation/optimize` (활성 외근 재최적화용) 와 알고리즘 동일.

---

## §12. 비밀번호 재설정 — 보류

이메일 발송 인프라 (SES / SendGrid 등) 도입 + 토큰 모델 + 만료 정책. 프로젝트 scope 외. 도입 시 `/auth/password/reset-request` + `/auth/password/reset-confirm` Phase 7 contract 로 추가.

---

## §13. PATCH/DELETE /api/fields/:id 500 — 🔴 진행 중

코드 review 만으론 root cause 식별 불가. 프로덕션 로그 확보 후 hotfix 예정.

서버에서 직접:
```bash
ssh ilgayo "docker logs mfz-backend --tail 200 2>&1 | grep -A 20 'PATCH\|api/fields\|trip-routes.*unhandled'"
```

가설 (코드 분석 기반, 우선순위 순):
1. **`prisma.fieldUpdateAudit.create` 의 actorId FK 위반** — JWT sub 가 가리키는 user 가 deleted 상태인데 [findFieldById](../src/fieldwork/fieldRepository.js#L135) 의 deletedAt 필터 차이로 통과. 그러나 audit insert 시점에 FK 검증 실패. 운영 DB 의 deleted user 분포 확인 필요
2. **JSON 직렬화 에러** — [snapshotFieldForAudit](../src/fieldwork/fieldRepository.js#L213) 가 `Date` (`updatedAt`/`deletedAt`) 를 JSON 컬럼에 그대로 넘김. Prisma 가 자동 직렬화하지만 일부 케이스에서 문제 가능
3. **`getFieldDetail` 후속 호출** — [updateField:914](../src/fieldwork/tripsService.js#L914) 가 마지막에 `getFieldDetail` 호출. 그 내부의 [findActiveTripOfUser](../src/fieldwork/tripRepository.js#L60) 또는 [recentVisits](../src/fieldwork/tripsService.js#L749) 조회에서 예외 가능

DELETE 의 has_related_visits 분기 회귀 가능성도 동일 추적 — `visitCountForField` 가 deleted visit 까지 셀 수 있음.

→ **로그 확보 후 별도 commit 으로 hotfix** 예정.

---

## 이번 commit 에 포함된 백엔드 변경

1. `src/http/errorResponse.js` — `visit_status_invalid` 메시지에 valid 목록 명시 (§5)
2. `src/fieldwork/tripsService.js` — `computeNearestNeighborRoute` 분리 + `suggestOptimizedRoutePreview` 신규 export (§9b)
3. `src/fieldwork/registerTripRoutes.js` — `POST /api/trips/optimize-preview` 라우트 등록 (§9b)
4. `src/openapi/paths/trips.js` — optimize-preview OpenAPI path 추가
5. `docs/backend-handoff-response.md` — 본 문서 (응답 가이드)

---

## 변경 이력

- **2026-05-06**: 최초 응답. handoff 13개 항목 처리 / 보류 / 추적 분류.
