# 백엔드 백로그 — 일가요(mfz) 프론트엔드 요청 누적

> 프론트에서 발견·합의한 백엔드 작업 항목을 누적. 사이클 시작 시점에 우선순위
> 정해 작업으로 빼는 방식. 활발히 진행 중인 항목은 backend-handoff.md (있을 때)
> 가 1차 소스, 본 문서는 그 위에 쌓이는 큐.
>
> **응답 contract 표준**: 모든 4xx/5xx 는 Phase 7 단일 shape `{ code, message, fields?, details? }`.
>
> **지도 정책**: 일가요는 카카오 지도/길찾기만 사용. 구글·네이버 옵션은 노출하지 않음.

---

## 1. 🟡 길찾기 deep-links — 카카오 web URL 만 단독 반환

### 배경
`POST /api/trips/:tripId/navigation/deep-links` 응답이 현재 카카오·구글·네이버 3종을 모두 반환:

```js
providers: {
  kakao:  "kakaomap://route?ep=lat,lng&by=CAR",   // 모바일 앱 스킴
  google: "https://www.google.com/maps/dir/...",  // HTTPS web URL
  naver:  "nmap://route/car?...",                 // 모바일 앱 스킴
}
```

웹 브라우저에서 `kakaomap://`·`nmap://` 앱 스킴은 처리 불가. 프론트의 안전 가드(`url.startsWith('http')`) 가 둘을 걸러내면 구글만 남아 **선택 다이얼로그 없이 곧장 구글맵으로 진입** — 카카오 정책에 어긋남.

### 백엔드가 해야 할 것
서비스 정책상 **카카오만 사용**. 응답 단순화:

```js
providers: {
  kakao: "https://map.kakao.com/link/to/이름,lat,lng"   // web/mobile 모두 처리 가능한 단일 URL
}
```

또는 모바일 앱 우선·웹 fallback 둘 다 노출:
```js
providers: {
  kakaoApp: "kakaomap://route?ep=lat,lng&by=CAR",
  kakaoWeb: "https://map.kakao.com/link/to/이름,lat,lng"
}
```

`google`·`naver` 키는 응답에서 제거.

### 프론트엔드 영향
- `active.tsx` 의 `handleNavigate` — provider 선택 다이얼로그 로직 제거, 카카오 한 종만 열도록 단순화
- 응답 typing (`NavigationDeepLinksResponse`) 도 `providers: { kakao: string }` 으로 좁힘

### 우선순위
🟡 중간 — 현 상태에서 web 사용자가 카카오로 보내야 할 자리에 구글로 가고 있음.

### 발견 시점
2026-05-08 (외근 시작 → 길찾기 클릭 → 의도 없이 구글맵 단독 진입 보고)

### 관련 코드
- 프론트 [`app/(tabs)/trips/active.tsx:187-233`](../../app/\(tabs\)/trips/active.tsx) `handleNavigate`
- 백엔드 [`mfz_backend/src/fieldwork/tripsService.js:1274-1312`](../../../mfz_backend/src/fieldwork/tripsService.js) `buildMapDeepLink` / `createNavigationDeepLinks`

---

## 2. 🟡 `PATCH /api/trips/:tripId` / `DELETE /api/trips/:tripId` 신설

### 배경
Trip 자원에 Update·Delete 엔드포인트가 없음. Field 는 `PATCH /api/fields/:fieldId` / `DELETE /api/fields/:fieldId` 가 있어 [`fields/[id]/edit.tsx`](../../app/\(tabs\)/fields/\[id\]/edit.tsx) 에서 사용 중인데 Trip 만 비대칭. 프론트의 외근 상세 화면 ([`trips/[id].tsx`](../../app/\(tabs\)/trips/\[id\].tsx)) 에 수정·삭제 UI 가 들어갈 자리가 없음.

### 백엔드가 해야 할 것

**(A) `PATCH /api/trips/:tripId` — 부분 갱신**
```ts
PATCH /api/trips/:tripId
body: {
  title?: string;        // 사용자 입력 제목 (50자 이하)
  startedAt?: ISO8601;   // 시작 시각 보정 (시작 깜빡한 경우)
  endedAt?: ISO8601;     // 종료 시각 보정 (종료 깜빡한 경우)
}
→ 200: TripDetailResponse
```

검증:
- 본인 trip 만 수정 가능 (`requesterId === trip.userId`)
- `startedAt > endedAt` 케이스는 400
- 활성 외근(`endedAt = null`) 의 `endedAt` 갱신은 종료 처리로 위임 (별도 endpoint 와 충돌 방지) — 또는 허용하면 lifecycle 정합 정책 명시
- title trim, 50자 초과 거부

**(B) `DELETE /api/trips/:tripId` — soft delete 권장**
```ts
DELETE /api/trips/:tripId
→ 204
```

검증·정책:
- visit·report 가 연결된 trip 삭제 시 cascade 정책 정의 — Field 의 `has_related_visits` 코드와 같은 패턴 권장 (관련 데이터 있으면 차단·확인 요청)
- soft delete (deletedAt 컬럼) 권장 — 통계·이력 보존 목적
- 활성 외근 삭제는 차단 (먼저 종료해야 함)

### 프론트엔드가 할 일 (백엔드 준비 후)
- `tripStore.update(tripId, body)` / `tripStore.remove(tripId)` 추가
- `tripsApi.update` / `tripsApi.remove` 추가
- 외근 상세 ([`trips/[id].tsx`](../../app/\(tabs\)/trips/\[id\].tsx)) 에 "수정 / 삭제" CTA 추가, 또는 별도 edit 화면 (`trips/[id]/edit.tsx`) 구성 — Field 패턴 그대로
- 활성 외근일 땐 삭제 버튼 비활성

### 우선순위
🟡 중간 — 종료된 외근의 제목 오기·시간 오기 보정 + 잘못 시작한 외근 삭제 모두 실사용에서 흔한 시나리오.

### 발견 시점
2026-05-08 — 외근 상세 화면 점검 중 CRUD 비대칭 발견.

---

## 3. 🔴 카카오 Local 주소 검색이 모든 키워드에서 결과 0건

### 배경
`POST/GET /api/fields/address/search?keyword=...` 가 **어떤 키워드든** 항상 다음 응답:

```json
{
  "query": "...",
  "provider": { "primary": "kakao_local_rest", "manualCoordinateFallback": true },
  "items": []
}
```

검증된 키워드: `동아대학교 부민캠퍼스`, `부산광역시청`, `해운대해수욕장` — 모두 0건.
HTTP status 는 200 정상이라 클라이언트 catch 분기도 안 탐. `manualCoordinateFallback: true` 라 사용자에게 "좌표 직접 입력으로 진행 →" 우회 경로는 노출되지만, **시나리오의 핵심 진입점 (주소 검색 → 좌표 자동 채움) 이 사실상 차단** 된 상태.

### 백엔드가 해야 할 것
- 카카오 Local REST API 키가 만료/권한 문제인지 확인 (REST API 키 vs JavaScript 키 혼용 가능성, 도메인 화이트리스트 누락 가능성)
- 백엔드 ↔ 카카오 사이 호출 자체가 실패하고 있는지 로그 확인
- 응답 정상화 — 정상 키워드에 대해 items 가 실제로 채워지도록

### 프론트엔드 영향
- `fields/new.tsx` 의 검색 흐름이 항상 0건 분기 → manual 좌표 입력으로만 등록 가능
- 사용자가 "왜 검색이 안 되지?" 하는 혼란 — 본 백엔드 fix 후 자연 해결
- Playwright 통합 자동화에서도 검색 단계를 매번 manual 우회로 처리 중

### 우선순위
🔴 높음 — 핵심 사용자 흐름 차단. 시나리오 S4·S5 가 manual 우회로만 동작.

### 발견 시점
2026-05-09 (Playwright 통합 자동화 재실행 중 캡처)

### 관련 코드
- 프론트 호출 [`src/api/endpoints/fields.ts:192`](../../src/api/endpoints/fields.ts#L192) `addressSearch`
- 프론트 사용 [`app/(tabs)/fields/new.tsx:75-100`](../../app/\(tabs\)/fields/new.tsx#L75) 디바운스 + 카카오 호출

---

## 4. 🟡 `detailAddress` 정책 정합 — 백엔드는 필수, 프론트는 선택

### 배경
`POST /api/fields` 가 `detailAddress` 빠진 요청에 대해 400 응답:

```json
{ "code": "detail_address_required", "message": "상세 주소를 입력해주세요" }
```

그런데 클라이언트 [`fields/new.tsx`](../../app/\(tabs\)/fields/new.tsx) 의 "상세 주소 (동/호수 등)" 입력은 placeholder 만 있고 강제 입력 없음. 사용자가 빈 채로 "현장 등록" 누르면 백엔드가 거부 → 일반 Alert (`등록 실패`) 로 떨어짐. `detail_address_required` 코드는 클라이언트 ERROR_MESSAGES 표에도 누락이라 코드 분기로 인라인 필드 에러도 못 띄움.

### 결정 필요 — 두 방향 중 하나로 정합
- **(A) 백엔드 측에서 optional 로 완화**: detailAddress 가 없는 경우 빈 문자열로 저장. 이유: 모든 현장이 동·호수 단위로 식별 가능한 건 아님 (예: 가로수, 광장).
- **(B) 백엔드 정책 유지 + 프론트 측 강제**: 클라이언트가 사전 차단. 이유: 데이터 품질을 백엔드 단계에서 보장.

### 프론트엔드가 할 일 (둘 다 공통)
- `detail_address_required` 를 `src/api/errors.ts` ERROR_MESSAGES 에 추가
- (B) 채택 시 필드 라벨에 별표(*) + submit 직전 `if (!detail.trim()) errs.detail = '...'` 가드 + `inputError` 스타일 매핑

### 우선순위
🟡 중간 — 사용자가 첫 현장 등록에서 알 수 없는 이유로 차단됨. 새 사용자 첫 인상 관련.

### 발견 시점
2026-05-09 (Playwright 자동화 spec 의 빈 detail 등록 시도에서 캡처)

### 관련 코드
- 프론트 [`app/(tabs)/fields/new.tsx:360-366`](../../app/\(tabs\)/fields/new.tsx#L360) detail 입력
- 프론트 [`src/api/errors.ts`](../../src/api/errors.ts) ERROR_MESSAGES (코드 누락)

---

## 5. ✅ `POST /api/trips/navigation/optimize-preview` 백엔드 404 — 클라이언트 only 로 확정

### 배경
"✨ 최적 순서 추천" 누를 때 호출하던 endpoint 가 백엔드에서 404 누적. 클라이언트 fallback 이 nearest-neighbor 와 결과 동일했고 백엔드 배포 의향도 확인 어려움 → option B 확정: 호출 자체 제거.

### 결과
2026-05-31 — `tripsApi.optimizePreview` 와 관련 타입 (`OptimizePreviewBody`/`OptimizePreviewResponse`) 모두 삭제. `trips/new/order.tsx` 의 `handleOptimize` 는 `nearestNeighborOrder` 만 호출 (동기). 외근 시작 후 단계의 `POST /api/trips/{tripId}/navigation/optimize` 는 그대로 유지 — 그쪽은 백엔드 contract 살아있음.

### 관련 코드
- 프론트 [`app/(tabs)/trips/new/order.tsx`](../../app/\(tabs\)/trips/new/order.tsx) — 호출부 (현재 nearest-neighbor 만)
- 프론트 [`src/utils/routeOptimize.ts`](../../src/utils/routeOptimize.ts) — 알고리즘

---

## 6. 🟠 현장 삭제 — 방문 기록 있어도 cascade 로 삭제 허용

### 배경
현재 `DELETE /api/fields/:fieldId` 가 방문 기록(`visits`) 이 연결돼 있으면 `has_related_visits` 코드로 차단. 프론트의 [`fields/[id]/edit.tsx:281-293`](../../app/\(tabs\)/fields/\[id\]/edit.tsx) 가 그 코드를 받아 "방문 기록이 남아 있는 현장은 삭제할 수 없습니다" 안내만 띄움. 단일 Actor 가 본인 현장을 정리하려 해도 막혀 있어 운용 시 자기 데이터를 못 지움.

### 백엔드가 해야 할 것
**(A) 가드 제거 + cascade 삭제** (정책 권장)
- `DELETE /api/fields/:fieldId` 가 방문 유무와 무관하게 진행.
- 같은 트랜잭션에서 cascade:
  - `visits` (해당 fieldId)
  - `text_memos` / `voice_memos` / `photos` (visitId 또는 fieldId 직접 첨부 양쪽)
  - `destinations` (해당 fieldId — 진행 중 외근의 destination 까지 포함할지 별도 정책 결정. 진행 중 외근은 차단 또는 destination 만 정리)
- 구현 방식 권장: `deletedAt` 컬럼 도입한 soft-delete + 통계·이력 보존. 단, 프론트는 `deletedAt !== null` 인 row 를 hide 처리하도록 응답 필터.

**(B) confirm 우회 코드 추가** (대안)
- `DELETE /api/fields/:fieldId?force=true` 또는 body `{ force: true }` 로 cascade 동의.
- 응답: 삭제된 visit·attachment 카운트 echo (사용자 알림용).

### 프론트엔드 영향
- `fieldStore.remove` 의 결과 분기에서 `needsConfirm` 처리 변경 — confirm 다이얼로그 후 force 옵션으로 재호출.
- [`fields/[id]/edit.tsx:283`](../../app/\(tabs\)/fields/\[id\]/edit.tsx) 의 안내 문구 재작성 — "삭제할 수 없습니다" → "방문 N건과 첨부물도 함께 삭제됩니다. 계속할까요?".
- `src/api/errors.ts` 의 `has_related_visits` 메시지 갱신 또는 코드 자체 deprecate.

### 우선순위
🟠 중상 — 사용자가 본인의 잘못 등록된 현장을 정리할 수 있어야 함. 운용 시 1순위로 마주치는 막힘.

### 발견 시점
2026-05-10 (요구사항 정리 #1)

### 관련 코드
- 프론트 [`fieldStore.remove`](../../src/stores/fieldStore.ts) — `needsConfirm` 분기
- 프론트 [`fields/[id]/edit.tsx:273-306`](../../app/\(tabs\)/fields/\[id\]/edit.tsx) `performDelete`/`handleDelete`
- 프론트 [`src/api/errors.ts:95`](../../src/api/errors.ts#L95) `has_related_visits` 매핑

---

## 7. 🟠 보고서 본문(content) 검증 완화 + 직접 저장 분기에 사진 첨부 허용

### 배경
운용 시나리오: 작업자가 "조치 전/후 사진 + 제목" 만으로 짧게 보고서 남기고 싶음 (예: 길거리 단순 정비, 가로수 한 그루 점검). 현재 막힘 두 군데:

1. `POST /api/reports` (직접 저장) — `content` **10~50,000자** 강제. 본문 없이 진행 불가.
2. `POST /api/reports` (직접 저장) — body 가 JSON only. **사진 첨부 contract 없음**. AI 분기 (`POST /api/reports/generate`, multipart) 만 사진 받음.

→ 결과: 사진만 + 제목만 으로는 직접 저장 불가. 사용자는 의미 없는 더미 본문(예: ".") 로 padding 해야 함.

### 백엔드가 해야 할 것

**(A) `content` min 가드 완화**
- 10 → 0 (또는 옵셔널). max 50,000 유지.
- 정책: **제목 1자 이상 + (본문 1자 이상 OR 사진 1장 이상)** 중 하나는 강제. 진짜 빈 보고서 차단.

**(B) 직접 저장도 multipart 수용**
- `POST /api/reports` 가 `Content-Type: application/json` 외 `multipart/form-data` 도 받도록.
- multipart 필드: `title`, `content`, `summary?`, `tripId?`, `before_photo?`, `after_photo?`.
- 응답 `outputFileUrl` 또는 attachment 배열에 첨부 사진 echo (직접 저장 보고서도 공유 시 사진 노출 가능해야 함).

**(C) 또는 별도 attachment endpoint 분리**
- `POST /api/reports/:reportId/attachments` 신설 — 보고서 생성 후 사진 별도 업로드.
- 이 방식이면 보고서 lifecycle 단순. 다만 클라이언트는 2-step.

### 프론트엔드 영향 (백엔드 결정 후)
- **(B) 채택**: [`reportStore.create`](../../src/stores/reportStore.ts) 에 사진 인자 추가 → multipart 빌더 사용. [`reports/new.tsx`](../../app/\(tabs\)/reports/new.tsx) `handleManualSave` 본문 가드 풀고 "제목 + (본문 OR 사진)" 로 재작성.
- **(C) 채택**: `handleManualSave` 가 create → attach 2-step. 실패 시 보고서 롤백 정책 필요.

### 우선순위
🟠 중상 — 사용자 요구사항 #2. 운용 시 자주 마주칠 시나리오. 현재 더미 텍스트 우회로만 가능.

### 발견 시점
2026-05-10 (요구사항 정리 #2)

### 관련 코드
- 프론트 [`app/(tabs)/reports/new.tsx:274-301`](../../app/\(tabs\)/reports/new.tsx#L274) `handleManualSave`
- 프론트 [`src/api/endpoints/reports.ts:56-61`](../../src/api/endpoints/reports.ts#L56) `CreateReportBody`
- 프론트 [`src/stores/reportStore.ts:125-150`](../../src/stores/reportStore.ts#L125) `create`
- 백엔드 `POST /api/reports` body schema

---

## 8. ✅ 자동 체크인 — 현 반자동 정책 유지 (변경 없음)

### 배경
요구사항 #6 — "자동 체크인 기능 개발 완료 됐는지?" 사용자 검토 결과, **현 반자동(arrival → Alert → 사용자 탭 → checkIn) 흐름이 의도된 동작**. 사용자 confirm 안전망을 유지. 백엔드/프론트 변경 없음.

### 현재 동작
1. 위치 폴링이 destination 좌표 < N m 진입 검출
2. `POST /api/trips/:tripId/geofences/arrival` 로 백엔드 알림
3. 클라이언트가 Alert ("지금 체크인할까요?") 노출 → 사용자가 누르면 checkin 화면으로 이동

### 결정
- 자동 visit 생성 endpoint 확장(과거 안 (A))·클라이언트 자동 호출(과거 안 (B)) 모두 **보류**.
- 추후 사용자 풀(현장 작업자) 피드백에서 "확인 클릭이 번거롭다" 신호가 누적되면 그때 재개.

### 발견 시점
2026-05-10 (요구사항 정리 #6, 같은 날 정책 결정으로 클로즈)

---

## 9. 🟠 visit 단계 모델(phase: 조치 전/중/후) 도입

### 배경
요구사항 #9 — "현장 정보는 [조치 전 / 조치 중 / 조치 후] 세 분류로 나뉘어야 한다." 사용자(현장 청취) 워크플로우:

> 체크인 → **조치 전** 사진/설명 → 조치 및 **조치 중** 사진/설명 → 조치 완료 → **조치 후** 사진/설명

각 phase 별 사진+짧은 설명이 결국 보고서에 그대로 들어감. 현재 데이터 모델은 visit 하위 attachment 가 평면적(`text`/`photo`/`audio`) 이라 phase 구분이 없음. 결과: 사용자가 보고서 작성 시 어떤 사진이 "조치 전" 인지 매번 다시 분류해야 함 (현재 [`reports/new.tsx:156-162`](../../app/\(tabs\)/reports/new.tsx#L156) 의 promptChoice 로 사용자가 직접 슬롯 지정).

### 백엔드가 해야 할 것
**(A) attachment 에 phase 필드 추가**
- 컬럼 또는 JSON meta: `phase: 'before' | 'during' | 'after' | null`
- `POST /api/visits/:visitId/attachments/photo|audio|text` body 에 `phase?` 추가.
- 응답에도 echo. 기존 데이터는 `null` 로 유지(소급 변환 X).

**(B) visit 에 phase progress 필드(파생)**
- 응답 contract: `visit.phaseProgress: 'before' | 'during' | 'after' | 'done'`
- 어떤 phase 의 attachment 가 1건 이상 있는지 기준으로 derive.

**(C) 보고서 generate 시 phase 자동 매핑**
- `POST /api/reports/generate` 가 visit phase 별 사진을 자동으로 `before_photo` / `after_photo` 슬롯에 매핑.
- 사용자가 일일이 다시 선택 안 해도 되도록.

### 프론트엔드가 해야 할 것 (별도 사이클)
- 체크인 화면 (`fields/[id]/checkin.tsx`) 에 phase 선택 chip 도입 (기본 'before').
- visit 상세 (`trips/visit.tsx`) 에 phase 별 섹션 분리.
- 체크인 시 fieldStatus pending → in_progress 자동 전환, after phase 첫 attachment 추가 시 in_progress → done 제안.
- 보고서 작성 (`reports/new.tsx`) — phase 별 importablePhotos 자동 슬롯 매핑.

### 우선순위
🟠 중상 — UX/도메인 핵심. 사용자가 보고서마다 사진을 다시 분류하는 번거로움이 누적. 다만 구조적 변경이 커서 별도 사이클 권장.

### 발견 시점
2026-05-10 (요구사항 정리 #9 — 현장 워크플로우 청취 결과 반영)

### 관련 코드
- 프론트 [`app/(tabs)/fields/[id]/checkin.tsx`](../../app/\(tabs\)/fields/\[id\]/checkin.tsx)
- 프론트 [`app/(tabs)/trips/visit.tsx`](../../app/\(tabs\)/trips/visit.tsx)
- 프론트 [`app/(tabs)/reports/new.tsx:142-162`](../../app/\(tabs\)/reports/new.tsx#L142) `handleImportPhotoTap`
- 프론트 [`src/types/entities.ts`](../../src/types/entities.ts) attachment 타입

---

## 10. 🟢 파일 저장 인프라 — MinIO 도입 + 보고서 < 20MB 압축

### 배경
현재 `photos`/`voiceMemos` 의 `fileUrl` 이 정확히 어디 저장되고 어떻게 호스팅되는지 프론트에서 추적 불가. 운용 단계로 가려면:
- 객체 저장소(MinIO) 표준화 — 파일 lifecycle/권한/감사 로그 일관.
- 보고서 패키지(첨부 포함) 의 송신 크기 < 20MB — 사진 압축·리샘플 + 음성 비트레이트 다운.

### 백엔드가 해야 할 것
- MinIO 도입 — bucket 정책(visit-attachments, report-bundle 분리), presigned upload URL endpoint, lifecycle.
- 사진 업로드 시 서버측 리샘플 (예: long edge 1920px, JPEG q=72).
- 음성 업로드 시 비트레이트 정규화 (예: opus 32kbps mono).
- 보고서 export(공유 URL/다운로드) 시 zip 패키지 < 20MB 보장 (초과 시 추가 압축 라운드 또는 분할).

### 프론트엔드 영향
- 업로드 응답이 presigned URL 흐름으로 바뀌면 [`src/utils/media.ts`](../../src/utils/media.ts) 의 업로드 회로 재작성 필요.
- 클라이언트도 사전 리샘플 1라운드 두면 백엔드 부하 감소 (대개 sharp/canvas — `expo-image-manipulator` 사용 가능).

### 우선순위
🟢 낮음(인프라) — 즉시 막힘은 없으나 사용량 증가 시 빠르게 진입할 워크. 별도 사이클로 분리 권장.

### 발견 시점
2026-05-10 (요구사항 정리 #10)

---

## 11. 🟠 외근 destinations 영속화 + GET endpoint — 다른 디바이스·세션에서 "계획 0곳" 회로 차단

### 배경
프론트의 `destinationStore` ([`src/stores/destinationStore.ts`](../../src/stores/destinationStore.ts)) 는 **로컬 + AsyncStorage 전용**. 사용자가 외근을 시작할 때 `bulkCreate(tripId, fieldIds[])` 로 로컬에만 적재되고, 백엔드엔 destinations 데이터가 보내지지 않음. 그래서 다음 회로가 깨짐:

- 사용자 A 가 디바이스 1 에서 외근 시작 (현장 3곳) → destinations 로컬 적재.
- 같은 사용자 A 가 디바이스 2 (또는 새 브라우저) 에서 같은 외근 조회 → trip 자체는 `GET /api/trips/list` 응답에 들어 있지만 destinations 가 로컬에 없으므로 **"계획 0곳 · 실제 방문 0건"** 으로 표시. 사용자는 "분명 3곳 골랐는데" 로 혼란.
- 같은 디바이스라도 로그아웃 (`useDestinationStore.clearAll()` 호출됨) 후 재로그인 → 로컬 비어 있음 → 같은 증상.
- AsyncStorage 손상·정리 케이스도 동일.

부수적으로:
- 트립 상세 화면의 "계획된 목적지" 섹션 ([`trips/[id].tsx`](../../app/\(tabs\)/trips/\[id\].tsx) `planBox`) 도 로컬 destinations 없으면 비노출.
- 진행 중 외근의 다음 목적지 / 순서 변경 / 건너뛰기 / 도착 마크 같은 lifecycle 도 사용자가 시작한 디바이스에서만 일관성 보장.

### 백엔드가 해야 할 것

**(A) Trip 시작 시 destinations 영속화**
```ts
POST /api/trips/start
body: {
  startLocation?: { lat, lng };
  title?: string;
  destinations: Array<{ fieldId: string; order: number }>;   // ← 신규
}
→ 200: TripStartResponse & { destinations: Destination[] }
```

destinations 미전달 시 호환성 위해 빈 배열로 처리 (legacy 클라이언트 그대로 동작).

**(B) Destinations 조회**
```ts
GET /api/trips/:tripId/destinations
→ 200: {
  items: Array<{
    destinationId: string;
    fieldId: string;
    order: number;
    status: 'pending' | 'arrived' | 'skipped';
    siteName?: string;
    siteAddress?: string;
  }>;
}
```

**(C) Destination 상태 업데이트**
```ts
PATCH /api/trips/:tripId/destinations/:destinationId
body: { status?: 'arrived' | 'skipped'; order?: number; }
→ 200: Destination
```
체크인이 자동으로 destination 상태도 갱신할지(`POST /api/visits/check-in` 의 부수효과) 백엔드에서 정책 결정. 결정에 따라 (C) 가 선택적 호출이 됨.

**(D) Trip 상세에 destinations 포함 (옵션)**
`TripDetailResponse` 에 `destinations: Destination[]` 추가하면 (B) 별도 호출 없이 트립 상세 한 번으로 끝.

### 프론트엔드 영향

- `destinationStore` 를 server-source 로 전환:
  - hydrate 가 AsyncStorage 가 아니라 trip 별 GET 으로 (또는 (D) 적용 시 trip 상세 로드 시점 부수효과).
  - bulkCreate 가 로컬 임시 적재 → API 응답 결과로 교체 (server id 로 키 정렬).
  - markArrived/markSkipped/reorder 는 (C) PATCH 호출 후 응답 반영. 오프라인 큐 지원.
- 트립 상세 [`trips/[id].tsx:215`](../../app/\(tabs\)/trips/\[id\].tsx#L215) 의 "계획 N곳 · 실제 방문 M건" 라인 — 본 사이클에서 `trip.siteCount` (`TripListItem.siteCount`) 우선 사용으로 1차 회피 적용. 백엔드 destinations endpoint 가 들어오면 server-truth 단일화.

### 우선순위
🟠 중상 — 사용자 외근 lifecycle 의 핵심 데이터가 다른 디바이스에서 새는 회로. 단일 사용자/단일 디바이스 시나리오에선 막힘 없으나, 모바일·웹 동시 사용 / 디바이스 교체 / 캐시 정리 후 재진입 시 즉시 노출.

### 발견 시점
2026-05-11 (사용자 보고: "외근 생성할 땐 3곳 골랐는데 트립 상세에 계획 0곳·실제 방문 0건 으로 나옴")

### 관련 코드
- 프론트 [`src/stores/destinationStore.ts`](../../src/stores/destinationStore.ts) — 현 로컬 전용 구현
- 프론트 [`app/(tabs)/trips/new/order.tsx:158`](../../app/\(tabs\)/trips/new/order.tsx#L158) — `bulkCreate` 호출 지점 (server-side 로 옮길 자리)
- 프론트 [`app/(tabs)/trips/[id].tsx:215`](../../app/\(tabs\)/trips/\[id\].tsx#L215) — 카운트 라인 (siteCount fallback 1차 적용 지점)
- 백엔드 trips/destinations 라우트 신설 — 위 (A)~(C) (선택적으로 (D))

---

## 12. 🟠 ERD 파악 및 최신화 — 프론트와 합동 진행

### 배경
[`docs/ERD.drawio`](../diagram/ERD.drawio) 가 현재 백엔드 실제 스키마와 어디까지 맞물리는지 확인된 바 없음. 본 백로그 §6~§11 (현장 cascade, 보고서 본문/multipart, visit phase, MinIO/압축, destinations 영속화) 가 모두 데이터 모델 변경을 동반하는데, 단일한 ERD 진실값이 없어 다음 회로에서 어긋남:

- 프론트 [`src/types/entities.ts`](../../src/types/entities.ts) 의 `Trip`/`Field`/`Visit`/`Destination` 등 인터페이스가 백엔드 실제 컬럼과 1:1 인지 검증 어려움 (현재는 응답 typing 으로만 간접 추적).
- `TripListItem.siteCount`/`visitCount` 같은 derived 값이 어떤 join/count 로 계산되는지 ERD 만 봐선 모름 — §11 destinations 영속화 후 변경 영향 평가도 막힘.
- visit phase (§9) / report 첨부 분기 (§7) / fields cascade (§6) 가 들어가면 어떤 FK/제약/인덱스가 추가/수정되는지 ERD 에 반영 필요.

### 해야 할 것 (백엔드·프론트 합동)

**(A) 현재 스키마 추출 — 백엔드 주도**
- 운영 DB 의 실제 테이블·컬럼·FK·인덱스·제약을 dump (예: `pg_dump --schema-only` 또는 dbml export).
- 컬럼별 의미·nullable·기본값·enum·CASCADE 정책을 한국어 주석으로 정리.

**(B) ERD.drawio 비교·갱신 — 프론트 합류**
- 추출한 스키마를 `docs/ERD.drawio` 와 diff. 누락 테이블/컬럼·잘못 그려진 관계·실제와 다른 cardinality 를 좌우 비교 노트로.
- 본 백로그 §6~§11 에서 합의된 변경 (예: §11 destinations 테이블 신설, §9 visit_phase 컬럼) 을 ERD 의 "예정" 레이어로 별도 표기 — 현재 vs 미래 동시 가시화.
- `src/types/entities.ts` 의 프론트 인터페이스와 칼럼 매핑 표 1장 첨부.

**(C) 갱신 ERD 합의 후 PR 분리**
- 백엔드 schema migration 은 §6~§11 각 항목의 별도 PR 로.
- ERD.drawio 갱신은 본 항목(§12) PR 단독으로 — 데이터 모델 진실값을 먼저 합의한 뒤 코드 진입.

### 프론트엔드 영향
- `src/types/entities.ts` 와 `src/api/endpoints/*` 의 타입을 ERD 와 줄 맞춤. 차이가 있으면 프론트가 먼저 옮겨가고 백엔드 응답 정합성은 §6~§11 진행 시점에 맞춤.
- 합동 작업 — 백엔드가 (A) dump 를 내면 프론트가 (B) 비교·drawio 갱신을 같이 함. 회의 또는 GitHub PR 코멘트로 양쪽이 한 번에 합의.

### 우선순위
🟠 중상 — §11 destinations 영속화 등 본 백로그의 다른 데이터 모델 변경이 시작되기 전에 끝나야 충돌·재작업 없음. §6~§11 을 한 사이클로 묶을 거라면 그 사이클의 첫 워크.

### 발견 시점
2026-05-11 (사용자 — "ERD 파악 및 최신화도 백로그에 추가, 프론트랑 합동")

### 관련 자료
- [`docs/ERD.drawio`](../diagram/ERD.drawio) — 현재 ERD (검증 미수행)
- 프론트 [`src/types/entities.ts`](../../src/types/entities.ts) — 프론트 데이터 모델
- 본 백로그 §6 (cascade), §7 (보고서), §9 (visit phase), §10 (파일 인프라), §11 (destinations) — 각 항목이 ERD 변경을 동반

---

## 13. 🔴 `POST /api/reports/generate` — 운영에서 500 (AI 보고서 생성 전면 실패)

### 배경
ERD v2 통합 검증(2026-05-28) 중 운영 호출 시, multipart 요청(`notes`·`title`·`tripId`·`fieldId`·`before_photo`·`after_photo`) 에 대해 **일관되게 500 `internal_server_error`** 반환. 사진 동봉·미동봉 모두 동일. 같은 토큰으로 호출한 다른 v2 엔드포인트(현장·외근·체크인·보고서 CRUD·field-reports)는 전부 정상이었음.

```
POST /api/reports/generate (multipart)  → 500 { code: "internal_server_error", message: "일시적인 오류가 발생했습니다" }
```

400/422(검증 실패) 가 아니라 **500** 이므로 요청 형태는 수용되고 내부 처리(AI 호출 또는 field_report 저장) 단계에서 크래시하는 것으로 추정.

### 백엔드 확인 필요
- 운영의 AI 제공자(Gemini) 키·쿼터·네트워크 설정.
- ERD v2 재작성 시 generate 가 `field_report` 에 before/after 저장하도록 바뀐 경로의 버그 여부.
- **성공 응답 contract 확정** — `reportId`/`id`, `fieldReport`, `outputFileUrl` 등. 프론트 `ReportGenerateData` 는 가정값이며 미검증.

### 프론트엔드 영향 / 현황
- 프론트는 500 을 정상 흡수: 에러 메시지 노출 + 버튼 "↻ AI 다시 시도", **직접 저장은 계속 가능** → 기능 전면 차단은 아님.
- 성공 응답 형태가 확정되면 `ReportGenerateData` · `reportStore.generate` 매핑 재확인.

### 우선순위
🔴 높음 — AI 초안 기능이 운영에서 동작 불가.

### 발견 시점
2026-05-28 (ERD v2 통합 검증, 실호출).

### 관련 코드
- 프론트 [`src/api/endpoints/reports.ts`](../../src/api/endpoints/reports.ts) `generate`, [`src/stores/reportStore.ts`](../../src/stores/reportStore.ts) `generate`, [`app/(tabs)/reports/new.tsx`](../../app/\(tabs\)/reports/new.tsx) `handleAiGenerate`

---

## 14. 🟠 현장 메모/사진 개별 삭제 — `DELETE /api/fields/:id/memos/:memoId`, `DELETE /api/fields/:id/photos/:photoId`

### 배경
현장 상세(`fields/[id]/index.tsx`) 의 직접 메모·사진은 **추가만 가능, 삭제 불가**. 사용자가 잘못 올린 메모/사진을 정정할 방법이 없어 누적된 노이즈가 그대로 남는다. ERD v2 검증 시 백엔드 endpoint 가 존재하지 않음을 확인.

### 백엔드가 해야 할 것

```
DELETE /api/fields/:fieldId/memos/:memoId
DELETE /api/fields/:fieldId/photos/:photoId
```

- 본인 소유 현장의 본인 작성 메모/사진만 삭제 허용 (단일 actor 정책).
- 성공 응답: 본문 없음(204) 또는 `{ fieldId, memoId|photoId }` 단순 echo.
- 에러: Phase 7 단일 shape `{ code, message }`. `not_found` / `forbidden` 분기.
- 사진 삭제 시 파일 저장소(현재 임시 또는 §10 MinIO) 의 실제 객체도 같이 정리.

### 프론트엔드 영향 / 현황 (2026-05-30 기준)
- 프론트는 호출 path/응답 contract 를 위 가정으로 **선반영** 했음:
  - `src/api/endpoints/fields.ts` 의 `removeTextMemo` / `removePhoto`
  - `src/stores/fieldStore.ts` 의 동명 메서드 — 성공 시 `directAttachments` 에서 해당 id 제거
  - `app/(tabs)/fields/[id]/index.tsx` 메모 카드 우상단 ×, PhotoGrid 셀 우상단 × — 둘 다 confirm 후 호출
- 백엔드 부재 상태에서 사용자가 시도하면 **404/405 → 사용자 친화적 에러 alert** 로 폴백. 데이터 손상 없음.

### 우선순위
🟠 중상 — 일상 운영 노이즈 정리에 필요. 외근 종료 후 review 화면에서 추가된 콘텐츠도 동일 자산.

### 발견 시점
2026-05-30 (현장 라이프사이클 UX 검토 — C9-C).

### 관련 코드
- 프론트 API: [`src/api/endpoints/fields.ts`](../../src/api/endpoints/fields.ts) `removeTextMemo`, `removePhoto`
- 프론트 스토어: [`src/stores/fieldStore.ts`](../../src/stores/fieldStore.ts)
- UI: [`app/(tabs)/fields/[id]/index.tsx`](../../app/\(tabs\)/fields/\[id\]/index.tsx), [`src/components/AttachmentPreview.tsx`](../../src/components/AttachmentPreview.tsx) `PhotoGrid` `onDelete`

---

## 15. 🟢 프로필 수정 endpoint — `PATCH /api/me`

### 배경
프로필 화면(`profile.tsx`)에 이름·비밀번호 변경 진입로가 없다. `src/api/endpoints/auth.ts` 에 `me()` GET 만 있고 수정 endpoint 부재. 사용자가 이름을 잘못 등록하거나 비밀번호 정기 변경을 원할 때 자체 처리 못 함.

### 백엔드가 해야 할 것

```
PATCH /api/me
  body: { name?: string }                           // 이름 변경
PATCH /api/me/password
  body: { currentPassword: string, newPassword: string, newPasswordConfirm: string }
```

- 이메일은 PK 정합 + 인증 식별자라 변경 불가가 합리적 (선택).
- 비밀번호 변경 시 `currentPassword` 검증 + 정책 (signup 과 동일: 10자 + 4종 중 3종).
- 응답: `{ user: ApiUser }` (이름 변경) 또는 `{ updated: true }` (비밀번호).
- 에러: Phase 7 shape. `current_password_invalid` / `password_policy_violation` 등.

### 프론트엔드 영향 / 현황 (2026-05-30 기준)
- 프론트는 현재 fallback 으로 "관리자에게 문의" 안내만 노출.
- endpoint 가 들어오면 `profile.tsx` 에 "내 정보 수정" 진입로 + 폼.

### 우선순위
🟢 낮음 — 일가요는 운영 초기, 단일 actor 정책상 관리자 경로로 충분. 사용자 자체 처리 의지가 누적되면 격상.

### 발견 시점
2026-05-30 (인증/프로필 UX 검토 — B-5).

### 관련 코드
- 프론트 [`src/api/endpoints/auth.ts`](../../src/api/endpoints/auth.ts), [`app/(tabs)/profile.tsx`](../../app/\(tabs\)/profile.tsx)

---

## 16. 🟠 `GET /api/trips/:tripId` — `timeline[].fieldId` 정식 포함

### 배경
2차 QA(2026-05-30) #10 — "외근 방문 여부가 제대로 저장되지 않음". 디버깅 결과 backend
는 visit 자체를 정상 저장하지만, `TripDetailResponse.timeline` 응답에 `fieldId` 가
누락되어 세션 재진입 시 visitStore 에 `fieldId: ''` 로 흡수됨.

```ts
// 현재
export interface TripTimelineEntry {
  visitId: string;
  siteName?: string;   // 현장명 — 표시는 가능하지만 lookup key 가 되긴 부족
  visitedAt: string;
  status?: string;
  memoPreview?: string;
}
```

같은 세션에서는 `checkIn()` 호출 응답의 `fieldId` 가 visitStore 에 들어가 카드/마커가
정상이지만, 앱 재기동 후엔 timeline 만 남고 fieldId 가 비어 외근 정리 화면 / 외근
상세 지도에서 visit 이 "알 수 없는 현장" 으로 빠짐.

### 백엔드가 해야 할 것
timeline 응답에 `fieldId` 를 정식 포함:

```ts
export interface TripTimelineEntry {
  visitId: string;
  fieldId: string;   // ← 추가
  siteName?: string;
  visitedAt: string;
  status?: string;
  memoPreview?: string;
}
```

### 프론트엔드 영향
- `TripTimelineEntry` 에 `fieldId?: string` optional 로 미리 추가 (2026-05-31 반영).
- `useVisitStore.syncFromTimeline` 가 `t.fieldId ?? ''` 로 그대로 흡수.
- 백엔드가 정식 포함 시작하면 추가 프론트 변경 없이 동작.

### 발견 시점
2026-05-30 (2차 QA — #10).

### 관련 코드
- 프론트 [`src/api/endpoints/trips.ts`](../../src/api/endpoints/trips.ts),
  [`src/stores/visitStore.ts`](../../src/stores/visitStore.ts)

---

## 17. 🟢 더미 데이터 보강 — 시연 시각화 가능치 확보

### 배경
2차 QA(2026-05-30) — 기타 항목. 현재 더미 데이터는 시각화 검증/시연에 부족.
히트맵·마커 그룹·외근 카드 가독성 시연 시 의미 있는 그림이 안 나옴.

### 백엔드(또는 운영) 가 해야 할 것
**현장(fields) 더미** — 총 50 ~ 100개. 사하구청 제공 엑셀 참고.
- 같은 위치 그룹: 2 ~ 3개 (동일 좌표 마커 그룹화 시연용).
- 가까운 위치 그룹: 10개 이상 (히트맵 농도 시연용).
- 전체 분포는 부산 사하구 일대 (또는 시연 대상 지역).

**외근(trips) 더미** —
- 각 외근이 방문한 현장 수: 1 ~ 5 (현재는 전부 0건 → "방문 0건" 카드만 나옴).
- 외근 중 90% 는 `title` 보유 (외근 목록 가독성 검증).

### 프론트엔드 영향
- 본 더미 데이터가 들어와야 #1 본인 위치, #3 외근 지도, 히트맵, 그룹 마커, 외근 카드
  포맷이 시연에서 의미 있는 그림으로 보임.
- 프론트 변경 없음 — 데이터 적재만 필요.

### 발견 시점
2026-05-30 (2차 QA — 기타).

### 관련 코드
- 프론트 영향 화면: 외근/현장 탭 지도(`src/components/MapDashboard.tsx`,
  `src/components/KakaoMapWebView.tsx`), 외근 목록(`app/(tabs)/trips/index.tsx`).

---

## 18. 🟢 `POST /api/reports/from-trip/:tripId` — 보고서+현장보고 단축 생성

### 배경
새 보고서 양식(2026-05-31)에서
보고서 생성 = 그 외근의 visits 별 FieldReport 자동 스캐폴드. 프론트는 현재 `POST /api/reports`
1회 + `POST /api/reports/:id/field-reports` N회 (순차) 로 처리. N 회 round-trip 비용 절감용 단축 endpoint.

### 백엔드가 해야 할 것
```
POST /api/reports/from-trip/:tripId
body: { title }
response: { reportId, fieldReports: [...] }
```
서버가 그 trip 의 visits 를 조회해 fieldId 별 FieldReport 1개씩 일괄 생성.
skipped destination 은 제외.

### 프론트엔드 영향
- `reportStore.createWithVisitScaffold` 가 1회 호출로 단순화.
- 본 endpoint 도착 전에는 N회 호출 폴백 (이미 구현).

### 발견 시점
2026-05-31 (보고서 양식 변경 — RP2).

### 관련 코드
- 프론트 [`src/stores/reportStore.ts`](../../src/stores/reportStore.ts) `createWithVisitScaffold`

---

## 19. 🟠 `POST /api/reports/:id/export?format=pdf` — PDF 출력

### 배경
새 양식의 다운로드 결정 §6 (2026-05-31): Word 유지 + PDF 추가. 현재 `outputFileUrl` 은 Word 만.
사용자 요구가 인쇄/공유에 PDF 가 더 적합한 케이스가 많음 (현장 보고에 사진 다수 포함되는 새 양식 특히).

### 백엔드가 해야 할 것
```
POST /api/reports/:id/export?format=pdf
response: { url, expiresAt? }
```
또는 다중 포맷 지원:
```
POST /api/reports/:id/export
body: { format: 'word' | 'pdf' }
```
보고서 개요 위치도(자동 생성) + 현장 보고 N개를 단일 문서로 렌더.

### 프론트엔드 영향
- 보고서 상세 화면에 "PDF 다운로드" 버튼 추가 (현재 'Word 파일 다운로드' 옆).
- endpoint 도착 전 UI 는 hidden.

### 발견 시점
2026-05-31 (보고서 양식 변경 — 결정 §6).

### 관련 코드
- 프론트 [`app/(tabs)/reports/[id]/index.tsx`](../../app/\(tabs\)/reports/\[id\]/index.tsx)

---

## 변경 이력

- **2026-05-08**: 백로그 신설. §1 길찾기 카카오-only 정책 반영. (이전 §1 title 은 백엔드 처리 완료로 제거)
- **2026-05-08**: §2 추가 — Trip PATCH/DELETE 신설 요청 (Field 와 비대칭 해소).
- **2026-05-09**: §3·§4·§5 추가 — 통합 자동화 재실행 중 발견. §3 카카오 Local 검색 0건 (high), §4 detailAddress 정책 정합 (medium), §5 optimize-preview 404 (low).
- **2026-05-10**: §6·§7·§8·§9·§10 추가 — 사용자 요구사항 정리 라운드. §6 현장 삭제 cascade(중상), §7 보고서 본문 검증 완화 + multipart(중상), §8 자동 체크인 정합(닫힘), §9 visit phase 모델(중상·별도 사이클), §10 MinIO/압축 인프라(낮·별도 사이클).
- **2026-05-10**: §8 클로즈 — 사용자 검토 결과 현 반자동(Alert confirm) 흐름이 의도. 백엔드/프론트 변경 보류.
- **2026-05-11**: §11 추가 — destinations 영속화 + GET endpoint (중상). 다른 디바이스·세션에서 "계획 0곳" 회로 발견. 프론트는 1차 회피로 `TripListItem.siteCount` 사용.
- **2026-05-11**: §12 추가 — ERD 파악 및 최신화 (중상·프론트 합동). §6~§11 데이터 모델 변경의 선행 워크.
- **2026-05-28**: §13 추가 — ERD v2 프론트 정합 작업 중 운영 실호출에서 `POST /api/reports/generate` 500 발견(높음). 그 외 v2 엔드포인트는 정상 검증됨.
- **2026-05-30**: §14 추가 — 현장 라이프사이클 UX 검토(C9-C) 중 발견. 현장 메모/사진 개별 삭제 endpoint 부재(중상). 프론트는 호출 path/응답 contract 가정으로 선반영.
- **2026-05-30**: §15 추가 — 인증/프로필 UX 검토(B-5) 중 발견. 프로필 수정 endpoint 부재(낮). 단일 actor 정책상 우선순위 낮음, 자체 처리 의지 누적 시 격상.
- **2026-05-31**: §16 추가 — 2차 QA(#10) 디버깅 중 발견. `timeline[].fieldId` 누락(중상). 세션 재진입 후 visit 이 카드/지도에서 빠지는 회로. 프론트는 optional 선반영.
- **2026-05-31**: §17 추가 — 2차 QA 기타. 더미 데이터 보강 요청(낮). 시연 시각화(히트맵/마커 그룹/외근 카드) 가능치 확보.
- **2026-05-31**: §18·§19 추가 — 보고서 양식 변경 사이클. §18 보고서+현장보고 단축 생성(낮·round-trip 절감), §19 PDF export(중상·새 양식 인쇄/공유). 결정 §1~§7 은 보고서 양식 변경 사이클에서 확정(계획서는 반영 후 정리, git 이력 참조).
