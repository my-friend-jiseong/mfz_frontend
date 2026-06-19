# 백엔드 백로그 — 일가요(mfz) 프론트엔드 요청 누적

> 프론트에서 발견·합의한 백엔드 작업 항목을 누적. 사이클 시작 시점에 우선순위
> 정해 작업으로 빼는 방식. 활발히 진행 중인 항목은 backend-handoff.md (있을 때)
> 가 1차 소스, 본 문서는 그 위에 쌓이는 큐.
>
> **응답 contract 표준**: 모든 4xx/5xx 는 Phase 7 단일 shape `{ code, message, fields?, details? }`.
>
> **지도 정책**: 일가요는 카카오 지도/길찾기만 사용. 구글·네이버 옵션은 노출하지 않음.

---

## 2. ✅ `PATCH /api/trips/:tripId` / `DELETE /api/trips/:tripId` — 완료 (2026-06)

백엔드 배포 + 프론트 연동·검증 완료.
- **PATCH(제목·시간 보정)**: 운영은 본문 없이 200(상세응답 status 가 `normal|abnormal` 라 응답 비의존 — 보낸 body 로 로컬 패치). `tripStore.update` + 외근 상세 '수정' CTA + `trips/[id]/edit.tsx`. (현재 UI 는 제목만; 시간 보정은 피커 도입 후)
- **DELETE**: 방문·보고서 연결 시 `409 has_related_trip_records` → `?force=true` 강제 삭제. `tripStore.remove(force)` + 수정 화면 하단 '위험 구역'.
- 검증: 운영 probe(409→force→204) + web UI. 커밋 `18414f6`·`10b4cd0`·`ec6ab90`.

---

## 3. 🟡 주소검색 — 백엔드 keyword.json 병합(POI) 선택적 보강 (운영 키 정상 확인)

> **갱신 (release 2026-06)**: 백엔드가 `address.json + keyword.json` 병합·중복제거를 배포(release §7) →
> **백엔드 측 요청은 충족.** 잔여는 프론트 선택 정리뿐 — 클라이언트 카카오 JS SDK 키워드검색(헤드리스
> WebView) 의존을 걷어낼 수 있음(차단 아님, 미적용). 그래서 🟡 유지.

### 현황 (2026-06-01 read-only probe 로 정정)
**과거 전제("어떤 키워드든 0건 = `KAKAO_REST_API_KEY` 만료/권한")는 무효.** 운영
`GET /api/fields/address/search` 가 실주소에 정상 응답:
`부산 연제구 중앙대로 1001`→1 · `낙동대로 550`→1(부산 사하구 낙동대로 550) · `해운대구 우동`→4 ·
`부산 중구 중앙대로`→10 · `서면`→10 · `동래구`→1.
0건인 것은 전부 **장소명(POI)** (`부산광역시청`·`해운대해수욕장`·`센텀`) — 카카오 Local **주소**
API(`address.json`)가 상호·기관명을 구조적으로 못 잡는 정상 동작. **운영 키 이슈는 종결.**
남은 건 POI 검색 한 가지인데 이미 프론트 클라이언트 키워드검색으로 해소(아래).

### 정정 경위
2026-06-01 오전 probe 는 우연히 POI/부정확 키워드(`부산광역시청`·`해운대해수욕장`·`부산 사하구 낙동대로 100`)만
넣어 4/4 0건 → "키 만료"로 오판. 같은 날 정상 도로명/지역 키워드로 재확인하니 정상 응답 → 키는 살아 있음.
데모 시드 지오코딩도 정상 좌표를 받는다.

### 추가 (2026-06-01): 장소명(POI) 검색 — 주소 API 구조적 한계 + 프론트 선보완
운영 키가 정상화돼도 `/address/search` 는 카카오 Local **주소** API(`address.json`) 만 호출하므로
`동아대학교` 같은 **장소명(POI)** 은 구조적으로 0건이다. 도로명/지번만 매칭되고 상호·기관명은 못 잡음.
- **프론트 선보완(완료)**: 클라이언트 카카오 JS SDK `services.Places.keywordSearch` 로 장소명 검색을
  병행해 주소 결과와 병합. 네이티브는 헤드리스 WebView 브릿지([`useKakaoPlaceSearch.tsx`](../../src/components/fields/useKakaoPlaceSearch.tsx)),
  웹은 직접 SDK([`.web.tsx`](../../src/components/fields/useKakaoPlaceSearch.web.tsx)). 병합·중복제거는
  [`mergeSearchItems`](../../src/utils/addressSearch.ts). JS 키만으로 동작(REST 키 불요).
- **백엔드 요청(이상적)**: `/address/search` 가 서버측에서 `keyword.json` 도 호출해 주소+장소를 합쳐 반환하면
  클라이언트 SDK 의존(JS 키 도메인 화이트리스트, 헤드리스 WebView)을 걷어낼 수 있음. 응답 shape 동일 유지,
  장소 출처 item 은 `sido/sigungu` 가 빌 수 있음(주소 depth 미제공).

### 우선순위
🟡 낮음~중간 — **차단 아님**(주소검색 정상 + POI 는 프론트 키워드검색으로 해소). 백엔드 `keyword.json`
병합은 클라이언트 SDK 의존(JS 키 도메인 화이트리스트·헤드리스 WebView) 제거용 선택 보강.

### 발견 시점
2026-05-09 최초(당시 0건 관측) → 2026-06-01 운영 probe 로 키 정상 확인, 🔴→🟡 강등·재기술.

### 관련 코드
- 프론트 호출 [`src/api/endpoints/fields.ts:192`](../../src/api/endpoints/fields.ts#L192) `addressSearch`
- 프론트 사용 [`app/(tabs)/fields/new.tsx:75-100`](../../app/\(tabs\)/fields/new.tsx#L75) 디바운스 + 카카오 호출

---

## 4. ✅ `detailAddress` optional 완화 — 완료 (release 2026-06)

방향 (A) 확정대로 백엔드가 `POST /api/fields`·`PATCH /api/fields/:id` 의 `detailAddress` 를 optional 로
완화(빈 값 허용, `detail_address_required` 400 제거 — release §4). 프론트는 원래 detail 을 강제하지
않으므로 추가 UI 변경 없음(에러 안전망 메시지만 선반영해 둔 상태). point 성 현장(가로수·광장 등) 등록 OK.

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

## 7. ✅ 보고서 본문(content) 검증 완화 + 사진 첨부 — 새 양식으로 해소 (2026-06-04)

### 종결 사유
새 보고서 양식(2026-05-31 결정)이 본 항목의 전제를 제거했다:
- 보고서에 **본문(content)·보고서 레벨 사진 개념 자체가 없음** — 본문 = `field_reports`
  컬렉션 (ERD v2).
- 원 요구사항 #2("사진+제목만으로 짧게 보고")는 **생성 마법사**가 해소: 제목+외근 →
  현장별 전·중·후 사진+캡션. (A) content 완화는 이미 불요 확인(2026-06-01), (B)/(C)
  사진 첨부 contract 는 `POST /api/reports/{id}/field-reports` 가 그 역할.
백엔드 추가 작업 없음.

### 배경 (원 기록)
운용 시나리오: 작업자가 "조치 전/후 사진 + 제목" 만으로 짧게 보고서 남기고 싶음 (예: 길거리 단순 정비, 가로수 한 그루 점검). 현재 막힘 두 군데:

1. `POST /api/reports` (직접 저장) — `content` **10~50,000자** 강제. 본문 없이 진행 불가.
2. `POST /api/reports` (직접 저장) — body 가 JSON only. **사진 첨부 contract 없음**. AI 분기 (`POST /api/reports/generate`, multipart) 만 사진 받음.

→ 결과: 사진만 + 제목만 으로는 직접 저장 불가. 사용자는 의미 없는 더미 본문(예: ".") 로 padding 해야 함.

### 백엔드가 해야 할 것

**(A) `content` min 가드 완화 — ✅ 불요 (2026-06-01 release 대조 확인)**
- 운영에 `content` 10자 강제가 이미 없음. 추가 완화 불필요. → **본 항목의 잔여는 (B) 사진 첨부뿐.**

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
~~🟠 중상~~ → ✅ 종결 — 새 양식(field_reports 경로)으로 요구사항 해소.

### 발견 시점
2026-05-10 (요구사항 정리 #2). 종결 2026-06-04.

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

## 11. ✅ 외근 destinations 영속화 + GET/PATCH — 완료 (release 2026-06, batch3)

"계획 0곳" 크로스 기기 회로 해소. 백엔드 배포 + 프론트 서버 전환·검증 완료.
- 백엔드: `POST /trips/start` 가 `plannedFields` 수용·응답에 `destinations[]`, `GET /trips/:id/destinations`,
  `PATCH /trips/:id/destinations/:id`(status/order), `GET /trips/:id` 에 `destinations[]`, 체크인 시 pending→arrived 자동.
- 프론트: `destinationStore` 를 **서버 소스 + AsyncStorage 캐시**로 전환 — 시작 시 plannedFields 전송·`setFromServer` 하이드레이트, trip 상세/active 진입 시 서버 조회(빈 캐시일 때만 — race/중복 GET 차단), skip/reorder 낙관적+fire-and-forget PATCH. 표시 번호는 정렬 인덱스(서버 order base 비의존).
- 검증: 운영 probe(start→destinations 영속·shape·자동 arrived·skip) + web UI(active 번호·skip·현장추가). 커밋 `ea9a33f`·`caf2d1f`.
- 잔여: 진행 중 단건 add 는 백엔드 엔드포인트 부재로 로컬 temp → [§24](#24) 로 분리.

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

## 13. ✅ `POST /api/reports/generate` — 운영 500 → 프론트 미사용으로 종결 (2026-06-04)

### 종결 사유
새 보고서 양식(2026-05-31 결정 §1)에서 AI 초안 분기가 **프론트에서 완전 제거**됐다
(`reports.generate` 엔드포인트 바인딩·`handleAiGenerate` 모두 삭제, `/reports/generate`
라우트는 `/reports/new` redirect 만 잔존). 보고서 작성은 "제목+외근 → 현장 보고
스캐폴드 → 마법사" 플로우로 대체되어 이 500 이 사용자에게 도달할 경로가 없다.

**백엔드 권고**: 미사용 endpoint 정리(제거 또는 410). AI 초안을 재도입하게 되면
그때 신규 항목으로 다시 연다 (아래 원 기록 참조).

### 배경 (원 기록)
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
~~🔴 높음~~ → ✅ 종결 — 프론트가 더 이상 호출하지 않음.

### 발견 시점
2026-05-28 (ERD v2 통합 검증, 실호출). 종결 2026-06-04.

### 관련 코드
- ~~프론트 `generate`·`handleAiGenerate`~~ — 2026-05-31 결정 §1 로 삭제됨. 잔존: [`app/(tabs)/reports/generate.tsx`](../../app/\(tabs\)/reports/generate.tsx) (redirect 전용)

---

## 14. ✅ 현장 메모/사진 개별 삭제 — 완료 (release 2026-06)

백엔드가 `DELETE /api/fields/:id/memos/:memoId`·`.../photos/:photoId` 배포(204, 디스크 객체도 정리 — release §4).
프론트는 `removeTextMemo`/`removePhoto`(fields.ts·fieldStore) + 메모카드 ×·PhotoGrid × 로 이미 선반영돼 있어
추가 작업 없이 동작. 운영 probe(추가→204 삭제→사라짐) + web UI(추가→×→삭제 반영) 검증 완료.

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

## 16. ✅ `GET /api/trips/:tripId` — `timeline[].fieldId` 정식 포함 (라이브 검증 완료, 닫힘)

### 결과 (2026-06-01) — 이미 해결, 라이브 probe 로 확정
운영(`ilgayo.co.kr`) read-only probe 결과 `GET /api/trips/:tripId` 의 `timeline[]` entry 가
`fieldId` 를 **실제로 실어 보냄**: keys=`[visitId, fieldId, siteName, visitedAt, status, resultStatus]`,
예) `fieldId="field-...c78aaeb8"`, `siteName="대연 전기실"`. 백엔드 `toTimelineCard()` 가 최초 커밋부터
포함해 온 것과 일치. 본 항목 전제("timeline 에 fieldId 누락")는 현재 운영과 맞지 않음 — QA 당시(05-30)
배포본이 mock 단계(dcecdb0)였던 것으로 추정. **방문 카드는 정상 동작해야 함.** "외근 선택 시 관련 현장
안 보임" 의 잔여 원인은 카드(본 항목)가 아니라 인라인 지도 마커 → §11(destinations) 쪽이며, §11 은
라이브에서 미구현 확인(detail 에 destinations 없음 + `/destinations` 404).

### 배경 (당시)
2차 QA(2026-05-30) #10 — "외근 방문 여부가 제대로 저장되지 않음". 디버깅 결과 backend
는 visit 자체를 정상 저장하지만, `TripDetailResponse.timeline` 응답에 `fieldId` 가
누락된 것으로 관찰돼 세션 재진입 시 visitStore 에 `fieldId: ''` 로 흡수된다고 판단함.

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

## 17. ✅ 더미 데이터 보강 — 프론트 자가 시드로 해결 (백엔드 불요)

### 결과
2026-06-01 발표 준비 중 클로즈. 데모 데이터는 프론트 자가 시드 스크립트
(`docs/presentation/seed_demo_data.mjs`)로 전부 생성 — 현장·외근·방문·보고서 전·중·후
사진까지. probe 로 `POST /api/reports/:id/field-reports` 가 외부 photo URL 을 그대로
저장·회수함을 확인(`docs/backend/demo-seed-request.md`)해 백엔드 적재·변경 요청이 소멸.
실제 점검 사진 교체는 프론트/사용자 몫.

### 배경 (당시)
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

## 18. ✅ `POST /api/reports/from-trip/:tripId` — 완료 (release 2026-06, batch2)

백엔드 `POST /reports/from-trip/:tripId {title}`→`{reportId, fieldReports[]}` 배포. 프론트
`reportStore.createWithVisitScaffold` 가 from-trip 1콜 우선 + 404/405(미배포) 시 레거시 create+N콜 폴백.
운영 probe(from-trip→reportId+fieldReports) + web UI(마법사 진입) 검증. 커밋 `df6fc2d`.

---

## 19. 🟡 `POST /api/reports/:id/export?format=pdf` — PDF 출력

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

## 20. 🟡 보고서 Word(추후 PDF)에 "위치도" 이미지 삽입 — 네이티브 캡처 → 백엔드 임베드 (2안 확정)

### 배경
프론트는 보고서 상세 화면에 그 외근의 **현장 전체를 한 화면에 담는 위치도**를 이미 렌더한다
(`KakaoMapWebView` + `fitToMarkers`). 그러나 이건 **카카오 JS SDK 로 그리는 라이브 지도
(DOM/WebView)** 이지 래스터 이미지가 아니라, 다운로드되는 Word 문서엔 안 들어간다.
현재 Word 구조(release §6)는 현장별 전·중·후 사진뿐 — **위치도 없음.**

### 결정 (2026-06-19) — 2안(프론트 네이티브 캡처) 확정
**실사용 플랫폼이 Android 네이티브뿐**(web 은 테스트 전용)이라, 가장 단순·정합적인 경로로 확정:
**프론트가 네이티브에서 위치도를 PNG 로 캡처 → 업로드 → 백엔드는 그 이미지를 Word 에 임베드만.**

- **1안(백엔드 headless 렌더) 기각**: 소형 서버에 Chromium(+~300MB)·렌더당 ~150–400MB RAM
  (OOM 위험)·한글(CJK)폰트·카카오 키 referer 처리 등 **비용 대비 과함.**
- **3안(카카오 정적지도 REST) 불가**: 카카오는 `markers=...`→PNG 서버 API 가 없음(구글/네이버와 달리).
- **2안이 되는 이유**: 네이티브 `react-native-view-shot` 은 화면을 **OS 레벨 래스터화**라
  cross-origin 타일도 그대로 찍힘 → **앱에서 보던 카카오 위치도 그대로** 들어감. 백엔드는 렌더 불요.
- **web 한계(무방)**: web 은 `html2canvas` 가 cross-origin 카카오 타일을 **canvas-taint** 로
  못 담아 캡처 불가 → web 빌드는 위치도 없이 진행. 실사용 아님이라 수용.

### 백엔드 — ✅ 배포 완료 (release 2026-06-19, `ae4d2b9`)
아래 3건 모두 배포. 추가 보강: 위치도 **재업로드 시 `outputFileUrl` null 초기화**(Word 재생성 강제) + 보고서 **목록·상세 응답에 `overviewMapUrl` 포함**.
1. **`POST /api/reports/:reportId/overview-photo`** (multipart `file`/`photo`, `sharp` JPEG q82 압축) →
   `reports.overview_map_url` 저장. 201 `{ reportId, overviewMapUrl }`. **field-report 슬롯 사진 업로드(release §6)와 동일 패턴.**
2. **`POST /api/reports/:reportId/export/word`** 가 `overviewMapUrl` 있으면 **문서 최상단**(제목·메타 다음, 현장 섹션 **앞**)에 「위치도」 figure 1장 삽입. 없으면 기존대로(생략).
3. DB: `reports.overview_map_url` VARCHAR(500) nullable (`20260619120000_report_overview_map`).
※ 백엔드는 **지도를 그리지 않는다** — 받은 이미지를 넣기만. (headless/chromium 불필요)

### 프론트엔드 — ✅ 코드 배선 완료 (2026-06-19), 잔여는 EAS 리빌드 + 실기기 스파이크

**API/타입 선반영 (커밋 `5e5844b`)**: `reports.uploadOverviewPhoto`(multipart) + `ReportListItem`·`ReportDetailResponse.overviewMapUrl`.

**캡처→업로드→export 배선 (커밋 `2c48874`)**:
- `react-native-view-shot@4.0.3` 도입(네이티브 dep → **EAS 리빌드 필요**).
- `kakaoMapHtml` 에 `tilesloaded` 신호 + `KakaoMapWebView.onTilesLoaded` prop → 타일 로드 후 캡처.
- `captureView` 유틸 — native(`captureRef`→PNG, 실패 시 null) / `captureView.web.ts`(taint → 항상 skip, web 번들에서 네이티브 모듈 격리).
- 보고서 상세: 위치도 View `ref`+`collapsable={false}`, **Word 생성/재생성 직전** 캡처→`uploadOverviewPhoto`→`exportWord`. 캡처/업로드 실패는 best-effort(위치도 없이 진행).

**잔여 (코드 아님, 본인 몫)**:
1. `release` 푸시 → **EAS 빌드 트리거**(네이티브 모듈 추가라 JS 번들론 안 나감).
2. ⚠️ **실기기 캡처 스파이크 1회**: 안드로이드에서 WebView 를 view-shot 으로 찍을 때 하드웨어
   레이어 때문에 **빈칸으로 나오는 알려진 케이스** → 실기기 선검증. 빈칸이면 대안:
   캡처 전용 풀스크린 위치도를 잠깐 띄워 캡처(이때 `captureView.ts` 만 수정), 또는 1안(백엔드 렌더) 폴백 재검토.

### 발견 시점 / 갱신
2026-06-01 최초. 2026-06-19 — web=테스트전용·실사용 Android 확정에 따라 **2안(네이티브 캡처)로
구체화**(1안 기각). [[feedback_frontend_first]] 패턴: 프론트가 캡처+업로드를 optional 로 선반영하되
백엔드 `overview-photo`/Word 임베드 도착 후 완결.

### 관련 코드
- 프론트 [`src/components/KakaoMapWebView.tsx`](../../src/components/KakaoMapWebView.tsx) · [`src/assets/kakaoMapHtml.ts`](../../src/assets/kakaoMapHtml.ts) (`fitToMarkers`)
- 프론트 [`app/(tabs)/reports/[id]/index.tsx`](../../app/\(tabs\)/reports/\[id\]/index.tsx) (인라인 위치도 — 캡처 대상)
- 프론트 [`src/api/endpoints/reports.ts`](../../src/api/endpoints/reports.ts) (`uploadFieldReportPhoto` — overview-photo 가 따를 multipart 패턴)

---

## 21. ✅ `visits.reason`('기타' 사유) 영속·노출 — 완료 (release 2026-06, batch1)

모순(컬럼 없는데 입력 필수) 해소: 백엔드가 `status_reason` 영속 + 조회 응답에 `reason` 노출(release §5 —
방문상태 응답·trip `timeline[]`·현장 `recentVisits[]`). 프론트는 4개 타입에 `reason?` + visitStore 보존
(`mergeVisits` 가 누락 sync 에 덮어쓰지 않게 보존) + 방문상세·외근정리 카드·현장 방문이력에 '사유:' 표시.
검증: 운영 probe(other+reason 저장→timeline.reason 회수) + web UI(카드에 사유 노출). 커밋 `18414f6`·`bacdd47`.

---

## 22. 🟡 인앱 경로 표시 — 카카오모빌리티 길찾기 프록시 (2학기 후보)

> **결정 (2026-06-06)**: **차량 경로만 추진** — 도보(Tmap)·대중교통(ODsay) 대안은 보류. 상세 명세: [docs/roadmap/01_in-app-route.md](../roadmap/01_in-app-route.md)

### 배경
- 현재 "길찾기"는 카카오 외부 앱 deep-link 뿐 (§1) — 앱 안에서는 목적지 간 **경로가 전혀 표시되지 않아** 진행 중 외근에서 동선을 가늠하기 어렵다는 사용자 불편이 있었음. 항목화되지 않고 있다가 2026-06-06 MVP 동결 회고에서 재발견·등재.
- 지도에 그려지는 선은 시군구 경계 폴리곤뿐, 경로선 렌더는 미구현.

### 단계 제안
1. **(프론트 단독, 백엔드 무관)** active 외근 지도에 방문 순서 직선 폴리라인 + 순서 번호 — `kakaoMapHtml` 마커 파이프라인 확장. 2학기 초 후보.
2. **(백엔드 필요)** 카카오모빌리티 길찾기 REST 프록시 — REST 키가 서버 전용이라 백엔드 엔드포인트 필수. 예: `POST /api/trips/:id/route` → origin/waypoints/destination 좌표로 `apis-navi.kakaomobility.com/v1/directions`(자동차) 호출, `vertexes`(경로 좌표열)·`distance`·`duration` 반환. 프론트는 Polyline 렌더 + nearest-neighbor 의 직선거리 ETA 를 실도로 값으로 대체.

### 제약 (2026-06-06 웹 확인)
- 카카오모빌리티 **셀프서브 공개 API 는 자동차 길찾기 계열뿐** (directions·다중 경유지·미래 운행). 경유지 개수 제한·무료 쿼터 확인 필요.
- **도보·자전거**: 카카오모빌리티에 존재하나 **제휴(Partnership) API** — 일반 키 신청 불가, 제휴 계약 필요. 학생 프로젝트 현실성 낮음.
- **대중교통**: 카카오 공개·제휴 어디에도 미확인 — 사실상 미제공.
- **타사 대안** (카카오 지도 위에 데이터만 얹는 방안): 도보 = **Tmap 보행자 경로 API**(SK open API, 셀프서브·무료 쿼터). 대중교통 = **ODsay**(대중교통 전문, "원하는 지도와 매칭 가능" 명시) 또는 TMAP 대중교통 API. 단 타사 경로를 카카오 지도에 표시하는 약관 검토 선행 (ODsay 는 지도 무관 명시라 가장 안전해 보임).

### 프론트엔드 영향
- 1단계는 프론트 자체 처리. 2단계 머지 시 active/상세 지도에 경로선·실도로 ETA 표시.

### 발견 시점
2026-06-06 (MVP 동결 회고 — "인앱 경로 미제공 불편" 재확인, 미등재 상태였음).

### 관련 코드
- 프론트 [`src/assets/kakaoMapHtml.ts`](../../src/assets/kakaoMapHtml.ts) (마커·경계 렌더 — 폴리라인 추가 지점)
- 프론트 [`src/utils/routeOptimize.ts`](../../src/utils/routeOptimize.ts) (`nearestNeighborOrder` — 직선거리 ETA, 2단계에서 실도로 값으로 대체)

---

## 23. ✅ 처리방침·약관 정적 페이지 호스팅 — 완료 (release 2026-06)

백엔드가 `GET /privacy`·`GET /terms` 정적 HTML 서빙(release §7). 운영 probe 로 **둘 다 200 확인** →
Play Console 등록용 라이브 HTTPS URL 차단 해소. 프론트는 `profile.tsx` 가 이미 `ilgayo.co.kr/terms`·`/privacy`
로 가리켜 추가 작업 없음.
> ⚠️ 잔여(코드 아님): 서빙 본문은 **초안** — 법적 문구는 팀이 작성·교체 필요(수집항목·목적·보유기간·제3자제공·이용자권리·연락처).

---

## 24. ✅ `POST /api/trips/:tripId/destinations` — 진행 중 외근 목적지 단건 추가 (백엔드 배포 + 프론트 연동, release 2026-06-19)

§11 로 계획 목적지 cross-device 정합은 닫혔고, **진행 중 단건 추가**만 로컬 temp(미영속)로 남아 있던 보조 경로. 백엔드·프론트 양쪽 완료.

- **백엔드(release `ae4d2b9`)**: `POST /api/trips/:tripId/destinations { fieldId, order? }` → 200 Destination(§11 동일 shape). order 미지정 시 말미 append(`max(order)+1`), 동일 `tripId`+`fieldId` 는 **멱등(기존 destination 반환)**, **active 외근만**(종료 외근 `409 already_ended_trip`, 타인 현장 `403 planned_field_not_assignee`).
- **프론트(커밋 `5e5844b`, typecheck green)**: `tripsApi.addDestination` 추가 + `destinationStore.add` 를 낙관적 로컬 temp → **fire-and-forget POST** 로 전환 — 성공 시 temp 를 서버 `destinationId` 로 교체·`local` 해제(영속화), 멱등 응답으로 같은 id 가 이미 있으면 temp 폐기(중복 방지), `404`(미배포)·실패는 temp 유지로 graceful degrade. `AddDestinationModal` 은 `add` 동기 반환 유지라 무수정.
- 잔여(코드 아님): 운영 probe 검증(active 추가→200 · 재POST 멱등 · 크로스기기 반영)은 다음 기회.

### 발견 시점
2026-06-19 (§11 destinations 서버 전환 구현 중 add 엔드포인트 부재 확인). 같은 날 백엔드 배포·프론트 연동.

### 관련 코드
- 프론트 [`src/api/endpoints/trips.ts`](../../src/api/endpoints/trips.ts) (`addDestination`)
- 프론트 [`src/stores/destinationStore.ts`](../../src/stores/destinationStore.ts) (`add` — 서버 연동)
- 프론트 [`src/components/trips/AddDestinationModal.tsx`](../../src/components/trips/AddDestinationModal.tsx)

---

## 변경 이력

- **2026-06-19**: §24 ✅ 종결(🟡→✅) — 백엔드 `POST /trips/:id/destinations` 배포(`ae4d2b9`, 멱등·active-only) + 프론트 연동(커밋 `5e5844b`): `tripsApi.addDestination` + `destinationStore.add` 낙관적 temp→fire-and-forget POST→서버 id 교체. 잔여는 운영 probe 검증뿐.
- **2026-06-19**: §20 백엔드 배포(`ae4d2b9`: overview-photo·export/word 임베드·`overview_map_url` 컬럼 + 재업로드 시 outputFileUrl null·응답 overviewMapUrl 보강) + 프론트 API/타입 선반영(커밋 `5e5844b`: `uploadOverviewPhoto`·`overviewMapUrl`). 🟡 유지 — 네이티브 캡처(view-shot, EAS 리빌드·실기기 스파이크)는 별도 사이클.
- **2026-06-19**: §20 구체화 — Word 위치도를 **2안(프론트 네이티브 캡처→업로드, 백엔드는 임베드만)**으로 확정. web=테스트전용·실사용 Android 라 1안(백엔드 headless 렌더)은 비용 과다로 기각. 백엔드 요청: `POST /reports/:id/overview-photo` + export/word 최상단 위치도 삽입 + `reports.overview_map_url`.
- **2026-06-19**: §24 추가 — 진행 중 외근 목적지 단건 추가 `POST /trips/:id/destinations`(🟡). §11 destinations 서버 전환 구현 중 add 엔드포인트 부재 확인, 프론트는 로컬 temp 로 우회 중.
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
- **2026-06-01**: §20 추가 — 보고서 위치도 인라인화 사이클. 화면엔 fitToMarkers 위치도 반영, Word/PDF 문서 삽입은 카카오 정적지도 REST 부재로 백엔드 렌더(권장) 또는 네이티브 캡처 필요(중상).
- **2026-05-31**: §18·§19 추가 — 보고서 양식 변경 사이클. §18 보고서+현장보고 단축 생성(낮·round-trip 절감), §19 PDF export(중상·새 양식 인쇄/공유). 결정 §1~§7 은 보고서 양식 변경 사이클에서 확정(계획서는 반영 후 정리, git 이력 참조).
- **2026-06-01**: 전체 우선순위 재검토. §17 클로즈(🟢→✅, 프론트 자가 시드로 백엔드 불요). §11 격상(🟠→🔴, 외근-현장 미표시의 실제 원인=지도 마커). §19·§20 강등(🟠→🟡, hidden 폴백 있어 차단 아님).
- **2026-06-01**: §4 방향 (A) 확정 — `detailAddress` optional/nullable 완화를 백엔드에 요청(point 성 현장은 동·호수 없음). 프론트는 `detail_address_required` ERROR_MESSAGES 안전망 추가로 선반영.
- **2026-06-01**: 백엔드 release 브랜치 대조 — 이미 조치된 항목 삭제·재기술. **§1 삭제**(deep-links 가 google 제거하고 kakao+naver 만 반환, 커밋 8aafcec — naver 는 프론트 http 가드로 걸러져 카카오만 남음, 핵심 버그 해소). **§6 삭제**(`?force=true` cascade 구현됨, option B — 백엔드 완료, 프론트가 confirm 후 force 재호출만 붙이면 되는 follow-up). **§16 격상 되돌림 🔴→🟡**: release `toTimelineCard` 가 fieldId 를 이미 포함(git -S 기준 최초 커밋부터) → 전제 오류, 라이브 검증 후 닫기 예정. §7(A) content min 10자 강제 없음 확인(완화 불요)·(B) multipart 만 잔존. §3 핸들러 코드 정상 → '0건' 은 KAKAO_REST_API_KEY 환경 사안(코드 아님).
- **2026-06-01**: 운영(`ilgayo.co.kr`) read-only probe 로 전제 실측 검증. **§16 닫힘(🟡→✅)**: 라이브 `GET /api/trips/:tripId` timeline entry 가 fieldId 를 실제로 실어옴(`field-…c78aaeb8`/"대연 전기실"). **§3 실측 확인**: 4/4 키워드 여전히 0건 → KAKAO_REST_API_KEY 운영 키 사안 확정(데모 지오코딩도 폴백 중). **§11 실측 확인**: detail 에 destinations 없음 + `/destinations` 404 → 미구현 확정. 단 timeline 의 visit fieldId 로 완료 외근의 현장은 프론트만으로 도출 가능 → 보고된 버그는 프론트 우선 수정 가능, §11 백엔드는 계획 목적지 영속화 범위로 잔존. §18·§19 404(미구현) 확인.
- **2026-06-01**: 백로그 점검 — 정상 도로명/지역 키워드로 §3 재측정. **§3 🔴→🟡 강등·재기술**: `중앙대로 1001`→1·`낙동대로 550`→1·`해운대구 우동`→4·`중구 중앙대로`→10·`서면`→10·`동래구`→1 정상 응답 → 운영 키는 살아 있음. 앞선 "4/4 0건" 은 우연히 POI/부정확 키워드만 넣은 표본 편향이었고, 실제 0건은 장소명(POI: `부산광역시청`·`해운대해수욕장`·`센텀`)뿐(address.json 구조적 한계, 프론트 키워드검색으로 해소 완료). **§7(A) ✅ 표기**: content 10자 강제 부재 재확인 → 잔여는 (B) 사진 첨부뿐.
- **2026-06-07**: §23 추가 — 처리방침·약관 정적 페이지 호스팅(🟠, 출시 확정 시 🔴). 스토어 출시 준비도 감사에서 앱 내 링크 사망 실측. 프론트는 운영 도메인 URL 로 선반영 완료.
- **2026-06-06**: §22 추가 — 인앱 경로 표시(🟡, 2학기 후보). 사용자 불편이 항목화되지 않은 채 증발했던 건 재등재. 1단계 직선 폴리라인(프론트 단독) → 2단계 카카오모빌리티 길찾기 프록시(백엔드 필수, 자동차 한정).
- **2026-06-06**: §21 추가 — MVP 동결 ERD 검토 중 발견. `visits.reason`('기타' 사유)이 "컬럼 제거(ERD v2) vs 입력 필수 검증(`visit_status_reason_required`)" 모순 상태(🟡). 영속/폐기 여부 회신 요청.
- **2026-06-04**: 보고서 생성 마법사 도입에 따른 정리. **§13 클로즈(🔴→✅)**: AI 초안 분기가 프론트에서 완전 제거(2026-05-31 결정 §1)되어 generate 500 이 사용자에게 도달할 경로 없음 — 백엔드엔 미사용 endpoint 정리 권고만 잔존. **§7 클로즈(🟠→✅)**: 새 양식에서 보고서 본문·보고서 레벨 사진 개념이 제거되어 전제 소멸 — 요구사항 #2 는 마법사(현장별 전·중·후)가 해소, (B)/(C) 사진 contract 는 field-reports 가 그 역할.
