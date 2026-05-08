# 백엔드 보충 가이드라인 — 일가요(mfz) 프론트엔드 선행 개발 항목

> **갱신일**: 2026-05-08
> **대상**: 백엔드 팀
> **컨텍스트**: 일가요 프로젝트는 "프런트엔드가 contract 를 정해 선행 개발 → 백엔드가 부족한 부분만 보충" 정책으로 진행. 본 문서는 **현재 백엔드 작업이 필요한 신규 요청만** 담는다.
> **이전 항목**: 2026-05-06 작성 13개 항목은 [`backend-handoff-response.md`](../../mfz_backend/docs/backend-handoff-response.md) 로 처리 완료 (§1·§2·§3·§5·§6·§9b·§13) 또는 합의 보류 (§4·§8·§9a·§12). 보류 항목은 다음 사이클 작업 시점에 별도 트래킹.
> **응답 contract 표준**: 모든 4xx/5xx 는 Phase 7 단일 shape `{ code, message, fields?, details? }`.

---

## 1. 🟡 `Trip.title` / `Field.title` 컬럼 추가 (프론트 선행)

### 배경
외근·현장 카드의 제목이 "시작 날짜" / "주소" 로 자동 결정돼 사람이 의미 단위로 식별하기 어려웠음 — 같은 주소에 가로수가 여러 그루 있거나, 같은 날 외근 종류가 달라도 카드만 보고 구분 불가. 사용자 입력 제목(예: "1번 가로수", "가로수 보수 공사") 을 받아 카드 헤더에 노출.

### 프론트엔드 상태 (2026-05-07 머지)
- [`src/types/entities.ts`](../src/types/entities.ts): `Trip.title?: string`, `Field.title?: string` 추가.
- [`src/api/endpoints/trips.ts`](../src/api/endpoints/trips.ts): `TripStartBody.title?`, `TripStartResponse.title?`, `TripListItem.title?`, `TripDetailResponse.title?`.
- [`src/api/endpoints/fields.ts`](../src/api/endpoints/fields.ts): `FieldCore.title?`, `CreateFieldBody.title?`, `UpdateFieldBody.title?`.
- 외근 시작 폼 ([`app/(tabs)/trips/new/order.tsx`](../app/\(tabs\)/trips/new/order.tsx)) — 제목 입력 추가 (선택, 50자).
- 현장 등록 폼 ([`app/(tabs)/fields/new.tsx`](../app/\(tabs\)/fields/new.tsx)) — 제목 입력 추가 (선택, 50자).
- 현장 수정 폼 ([`app/(tabs)/fields/[id]/edit.tsx`](../app/\(tabs\)/fields/\[id\]/edit.tsx)) — 제목 수정 가능.
- 카드·상세 화면 — `title` 있으면 큰 글자, 없으면 기존 fallback (Trip=날짜, Field=주소).
- 스토어 매핑 — 응답에 title 없으면 사용자가 보낸 값을 로컬에 보존 (백엔드 미구현 단계에서도 UX 동작).

### 백엔드가 해야 할 것
1. **스키마**: `trips.title VARCHAR(50) NULL` / `fields.title VARCHAR(50) NULL` 추가 (마이그레이션).
2. **`POST /api/trips/start`** body 에 `title?: string` 받아 저장. 응답에 echo.
3. **`POST /api/fields`** body 에 `title?: string` 받아 저장. 응답의 `field` 객체에 echo.
4. **`PATCH /api/fields/:id`** body 에 `title?: string` 받아 갱신.
5. **`GET /api/trips`** / **`GET /api/trips/:id`** 응답에 `title` 포함.
6. **`GET /api/fields/mine`** / **`GET /api/fields/:id`** 응답의 각 field 에 `title` 포함.

### 검증 케이스
- title 미입력 (빈 문자열 또는 누락) → null 저장, 응답에 omit 또는 null.
- title trimming — 양쪽 공백 제거.
- 50자 초과는 백엔드에서 400 으로 거부 (프론트도 maxLength 50 가드).
- 기존 데이터(title 없는 외근/현장) 는 영향 없음 — null 그대로.

### 우선순위
🟡 중간 — 프론트가 사용자 입력을 받고 있고 로컬 보존도 하므로 UX 는 이미 동작. 백엔드 영속화는 다중 디바이스 동기화·새로고침 후 유지에 필요.

### 참고
`Field.name` 은 기존대로 자동 표시 라벨(`roadAddress (buildingName)`) 로 유지 — `title` 과 별도. `name` 은 geofence 알림 등 시스템 라벨용, `title` 은 사용자 식별용.

---

## 부록. Phase 7 응답 shape

모든 4xx/5xx 는 다음 단일 shape:

```ts
{
  code: string,                    // snake_case 분기 키
  message: string,                 // 사용자 표시용 한국어
  fields?: Record<string, string>, // 폼별 inline error (선택)
  details?: Record<string, unknown> // confirm 패턴 등 부가 정보 (선택)
}
```

신규 코드 발화 시 위 shape 만 지키면 frontend 의 `ApiError` 자동 흡수.
사용자 친화 한국어는 백엔드의 `message` 가 1차 소스 (frontend `ERROR_MESSAGES` 매핑은 안전망).

---

## 변경 이력

- **2026-05-06**: 최초 작성. 13개 항목 (§1~§13).
- **2026-05-06**: 백엔드 handoff-response 머지 — §1·§2·§3·§5·§6·§9b·§13 처리 완료, §4·§8·§9a·§12 합의 보류.
- **2026-05-07**: §14 추가 — `Trip.title` / `Field.title` 사용자 입력 제목 (프론트 선행 머지).
- **2026-05-08**: 완료 항목·보류 항목 모두 제거. 신규 요청 1건(`title`)만 잔존. 보류 항목은 다음 사이클 작업 시점에 다시 정식 요청 형태로 추가.
