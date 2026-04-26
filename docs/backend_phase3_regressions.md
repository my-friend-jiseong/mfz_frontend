# 백엔드 Phase 3 회귀 — 시연 검증으로 발견

> **작성일**: 2026-04-27
> **검증 환경**: `http://59.21.223.137:28080`, 신규 가입 계정
> **방법**: 풀 시나리오 18단계 curl smoke test 중 보고서 도메인에서 발견.

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
(HTTP 200 status — error wrapper 형태로 옴)

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
