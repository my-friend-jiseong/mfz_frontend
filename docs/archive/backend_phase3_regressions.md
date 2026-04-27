# 백엔드 Phase 3 회귀 — 시연 검증으로 발견

> **작성일**: 2026-04-27
> **검증 환경**: `http://59.21.223.137:28080`, 신규 가입 계정
> **방법**: 풀 시나리오 18단계 curl smoke test 중 보고서 도메인에서 발견.
>
> **🟢 복구 확인 (2026-04-27 후속)**: 백엔드 [docs/backend_phase3_regressions_fix_report.md](backend_phase3_regressions_fix_report.md) 적용 + CI/CD 배포 완료 후 재검증 결과 §1·§2 모두 정상 동작.
> - POST /api/reports → `data.id="11"` (BigInt → string), authorUserId·status·generatedByAi 정상
> - GET /api/reports → `items[].reportId`, pagination 정상
> - GET detail → `creator.name` 본인 이름 (UUID 노출 버그도 해소)
> - PATCH / share / DELETE share / DELETE report 모두 정상
>
> ⚠️ **작은 잔여 항목**: `POST /api/reports/{id}/share` 응답에 `expiresAt` / `shareExpiresAt` 가 들어오지 않음 (백엔드 보고서 §5 명세상으론 포함되어야 함). 화면에 만료시각 표시가 누락되는 UX 격차 — 백엔드 보강 권장.
>
> 프런트 폴백(`reports.list` 빈 결과 / `id ?? reportId` 흡수) 은 정상 응답 시 분기로 빠지지 않으므로 그대로 유지해도 무해. 다음 정리 사이클에서 제거 가능.

---

## 🔴 §3 신규 회귀 — `POST /api/reports` 가 `tripId` 동반 시 500 FK violation

### 재현
```http
POST /api/reports
Authorization: Bearer {token}
Content-Type: application/json

{
  "title": "...",
  "content": "...",
  "summary": "...",
  "tripId": "trip-1777253303533"
}
```

### 응답
```json
{
  "success": false,
  "error": "\nInvalid `prisma.report.create()` invocation:\n\n\nForeign key constraint violated: `reports_trip_id_fkey (index)`"
}
```
HTTP **500**.

### 원인 추정
- Reports 테이블이 Phase 3 에서 Prisma DB 로 마이그레이션됨 (`reports.trip_id → trips.id` FK 제약 포함)
- 그러나 **Trips 는 여전히 인메모리 Map 에 저장** (Phase 2 시점의 데이터 모델)
- Trip ID `"trip-{epoch}"` 가 DB 의 `trips` 테이블에는 존재하지 않음 → FK 제약 위반

### 영향
- **외근에 연결된 보고서 작성 불가** — UX 핵심 흐름 (외근 → AI 보고서 생성, 외근 → 수동 보고서) 차단
- `POST /api/reports/generate` 도 같은 FK 가질 가능성 → AI 생성 시 외근 연결도 깨질 수 있음 (별도 검증 필요)
- 외근 상세 화면의 "이 외근으로 보고서 작성" / "✨ AI 보고서 생성" 버튼이 모두 영향

### 권장 조치 (백엔드)
둘 중 하나:
1. **trips 도 DB 마이그레이션** (정합성 정답) — Phase 3 의 보고서 마이그레이션과 같은 패턴. 단 jy 의 destination·navigation 등도 영향 검토 필요
2. 또는 `reports.trip_id` 를 FK 가 아닌 **plain string nullable 컬럼**으로 변경 (인메모리 trip ID 를 그대로 보관) — 빠른 우회

### 프런트 임시 우회 (필요 시)
- 사용자가 trip 선택 후 보고서 작성 → 백엔드가 500 → 프런트가 자동으로 tripId 없이 재시도? 너무 마법적. 차라리 명확한 안내가 나음.
- 또는 보고서 작성 화면에서 외근 선택 옵션을 일시 비활성 + 안내 메시지

→ 우선 백엔드 복구를 기다립니다. 차단 항목.

## 1. `POST /api/reports` 응답 `data` 가 비어있음

### 재현
```http
POST /api/reports
Authorization: Bearer {token}
Content-Type: application/json

{ "title": "t", "content": "본문 충분 길게", "summary": "s" }
```

### 응답
```json
{ "success": true, "data": {} }
```

### 기대
이전(Phase 2) 의 정상 동작:
```json
{
  "success": true,
  "data": {
    "id": "report-...",
    "tripId": null,
    "title": "...",
    "content": "...",
    "summary": "...",
    "authorUserId": "...",
    "status": "draft",
    "generatedByAi": false,
    ...
  }
}
```

### 영향
프런트가 생성된 보고서의 ID 를 모름 → 상세 화면 이동 불가. 현재는 **list 화면 폴백** 으로 우회 (사용자가 list 에서 다시 찾아야 함).

---

## 2. `GET /api/reports` 가 500급 에러 응답

### 재현
```http
GET /api/reports
Authorization: Bearer {token}
```

### 응답
```json
{ "success": false, "error": "all.filter is not a function" }
```
HTTP **500** Internal Server Error (재확인 결과 — 첫 캡처 시 status 미기록).

### 추정 원인
`registerReportRoutes.js` 에서 reports collection 을 `.filter()` 호출하는데 `all` 변수가 array 가 아닌 다른 자료형인 경우. `createReport` 가 인메모리 Map 에 저장 후 list 호출 시 collection 형식 불일치 가능성.

### 영향
**보고서 탭 자체가 깨짐**. 사용자가 작성한 보고서를 다시 못 봄. list 페치 응답을 클라이언트가 안전 폴백 (빈 list) 으로 처리하지만 데이터는 사실상 손실.

---

## 3. 권장 조치 (백엔드)

1. `POST /api/reports` 가 작성한 보고서 객체 (id 포함) 를 `data` 에 정확히 채워주세요. Phase 2 시점의 동일 shape 으로 회귀 복구.
2. `GET /api/reports` 의 `all.filter is not a function` 원인 파악 + 정상화.
3. 테스트: 신규 계정 → POST /api/reports → 응답에 id 확인 → GET /api/reports → 작성한 보고서가 items[0] 에 있는지.

## 4. 프런트 임시 우회 (이미 적용)

- `src/api/endpoints/reports.ts`:
  - `reports.list` 가 `success:false` 또는 비정상 본문 시 빈 리스트로 폴백 (화면 깨짐 방지)
  - `ReportCreateData.id` / `reportId` 둘 다 옵셔널, `reportDataId(d)` 헬퍼 추가
- `src/stores/reportStore.ts`: create 결과의 id 가 빈 문자열일 가능성 흡수
- `app/(tabs)/reports/new.tsx`: id 가 비면 list 화면으로 폴백

백엔드 회귀 복구되면 위 폴백 코드는 제거 가능 (정상 응답이면 자동으로 정상 흐름 진입).
