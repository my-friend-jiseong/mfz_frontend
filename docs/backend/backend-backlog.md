# 백엔드 백로그 — 일가요(mfz) 프론트엔드 요청 누적

> 프론트에서 발견·합의한 백엔드 작업 항목을 누적. 사이클 시작 시점에 우선순위
> 정해 작업으로 빼는 방식. 활발히 진행 중인 항목은 backend-handoff.md (있을 때)
> 가 1차 소스, 본 문서는 그 위에 쌓이는 큐.
>
> **응답 contract 표준**: 모든 4xx/5xx 는 Phase 7 단일 shape `{ code, message, fields?, details? }`.
>
> **지도 정책**: 일가요는 카카오 지도/길찾기만 사용. 구글·네이버 옵션은 노출하지 않음.
>
> **항목 번호**: §N 은 고정 식별자(변경 이력·상호참조에서 사용) — 완료 시 재번호 없이
> 하단 「완료 항목(아카이브)」로 한 줄 압축. 그래서 활성 큐 번호에 공백이 있는 게 정상.

---

## 🔗 프론트 연동 대기 — 백엔드 배포 완료, 프론트 미배선

> 2026-07-26 백엔드 배치([release-2026-07-26-backend-backlog.md](./release-2026-07-26-backend-backlog.md))로
> 활성 큐 6건이 운영에 나갔다. **백엔드 요청으로서는 종결(아카이브)이지만 프론트가 아직 안 붙었다.**
> 여기가 다음 프론트 사이클의 작업 목록이다. 프론트 현황은 2026-07-28 코드 실측.

| § | 백엔드 | 프론트 현황 (실측) | 해야 할 것 |
|---|---|---|---|
| §25 categories | ✅ | `src/api/endpoints/categories.ts` 는 있음 / `categoryStore` 가 AsyncStorage 진실원 | store 를 서버 단일 소스로 스왑, `TODO(backend)` 제거 |
| §9 visit phase | ✅ | `endpoints/visits.ts`·타입에 `phase` **0건** | 사진 업로드 `phase` 전송 + 체크인 chip + visit 상세 phase 섹션 + `phaseProgress` 표시 |
| §19 PDF export | ✅ | `endpoints/reports.ts` 에 pdf **0건** | `exportPdf` 배선 + 보고서 상세에 PDF 다운로드 버튼 |
| §15 프로필 수정 | ✅ | `endpoints/` 에 me 파일 **없음** | `PATCH /api/me`·`/me/password` + `profile.tsx` 폼 |
| §22 경로 프록시 | ✅ | `endpoints/trips.ts` 에 route **0건** | `POST /trips/:id/route` → 진행 중 지도 실도로 폴리라인 + ETA 대체 |
| §12-B ERD | (A) ✅ | `ERD.drawio` 미갱신 | 백엔드 `db-schema.md` 기준 drawio 갱신 (§12 활성 유지) |

§10(파일 인프라)은 서버측 드라이버 교체라 프론트 contract 무변경 — 배선 불요.

---

## 10. 🟢 파일 저장 인프라 — MinIO 도입 + 보고서 < 20MB 압축 (부분 완료)

> **갱신 (release 2026-07-26)**: 백엔드가 **S3/MinIO 드라이버 + 사진 정규화**를 배포(커밋 `3603a31`·`2a97fab`).
> `FILE_STORAGE_DRIVER=disk|s3|minio` (S3 호환, `@aws-sdk/client-s3`), 사진 정규화 long edge **1920** /
> JPEG **q=72**. 잔여는 음성·zip 두 가지뿐 → 🟢 유지.

### 배경
현재 `photos`/`voiceMemos` 의 `fileUrl` 이 정확히 어디 저장되고 어떻게 호스팅되는지 프론트에서 추적 불가. 운용 단계로 가려면:
- 객체 저장소(MinIO) 표준화 — 파일 lifecycle/권한/감사 로그 일관.
- 보고서 패키지(첨부 포함) 의 송신 크기 < 20MB — 사진 압축·리샘플 + 음성 비트레이트 다운.

### 백엔드가 해야 할 것
- ✅ **MinIO/S3 드라이버 도입** (2026-07-26). 단 bucket 정책 분리(visit-attachments / report-bundle)·
  presigned upload URL·lifecycle 은 결과보고서에 언급 없음 — 필요 시 별도 확인.
- ✅ **사진 업로드 서버측 리샘플** — long edge 1920px, JPEG q=72 (2026-07-26).
- ⬜ 음성 업로드 시 비트레이트 정규화 (예: opus 32kbps mono).
- ⬜ 보고서 export(공유 URL/다운로드) 시 zip 패키지 < 20MB 보장 (초과 시 추가 압축 라운드 또는 분할).

### 프론트엔드 영향
- **2026-07-26 배포는 서버측 드라이버 교체라 프론트 contract 무변경** — 배선 불요.
- 업로드 응답이 presigned URL 흐름으로 바뀌면 [`src/utils/media.ts`](../../src/utils/media.ts) 의 업로드 회로 재작성 필요.
- 클라이언트도 사전 리샘플 1라운드 두면 백엔드 부하 감소 (대개 sharp/canvas — `expo-image-manipulator` 사용 가능).

### 우선순위
🟢 낮음(인프라) — 잔여 2건 모두 즉시 막힘 없음.

### 발견 시점
2026-05-10 (요구사항 정리 #10). 2026-07-26 드라이버·사진 압축 배포로 부분 완료.

## 12. 🟠 ERD 최신화 — (A) 백엔드 스키마 dump ✅ / (B) `ERD.drawio` 갱신 잔여 (프론트 합동)

> **갱신 (release 2026-07-26)**: 백엔드가 **(A) 현재 스키마 dump 를 완료**(커밋 `62bc3dd`, 백엔드 저장소
> `docs/db-schema.md` — 테이블·FK·파생값·`ERD.drawio` diff·예정 레이어 포함). **잔여는 (B) drawio 갱신뿐이고,
> 이건 프론트 합동 작업이라 이제 프론트가 착수 가능하다.**

### 배경
[`docs/ERD.drawio`](../diagram/ERD.drawio) 가 백엔드 실제 스키마와 어디까지 맞물리는지 확인된 바 없음.
데이터 모델을 건드리는 항목(§9 visit phase, §25 categories 등)이 계속 들어오는데 단일한 ERD 진실값이
없어 다음 회로에서 어긋난다:

- 프론트 [`src/types/entities.ts`](../../src/types/entities.ts) 의 `Trip`/`Field`/`Visit`/`Destination` 인터페이스가
  백엔드 실제 컬럼과 1:1 인지 검증 어려움 (현재는 응답 typing 으로만 간접 추적).
- `TripListItem.siteCount`/`visitCount` 같은 derived 값이 어떤 join/count 로 계산되는지 ERD 만 봐선 모름
  — **§26 이 정확히 이 지점에서 터진 사례다.**
- §9(visit phase)·§25(categories)가 들어가면서 실제로 추가된 FK/제약/인덱스가 ERD 에 미반영.

### 해야 할 것

**(A) 현재 스키마 추출 — 백엔드 주도 ✅ 완료 (2026-07-26)**
- 백엔드 저장소 `docs/db-schema.md` 에 테이블·컬럼·FK·파생값·`ERD.drawio` diff·"예정" 레이어까지 정리됨.

**(B) `ERD.drawio` 비교·갱신 — 프론트 합류 ⬜ 잔여**
- 백엔드 dump 를 `docs/diagram/ERD.drawio` 와 diff. 누락 테이블/컬럼·잘못된 관계·실제와 다른 cardinality 를
  좌우 비교 노트로.
- 2026-07-26 신설분 반영: `categories`(user 스코프, `(user_id, name)` UQ), `visit_photos.phase`.
- `src/types/entities.ts` 의 프론트 인터페이스와 컬럼 매핑 표 1장 첨부.
- 마이그레이션 참조: `20260726120000_add_categories`, `20260726130000_visit_photo_phase`.

**(C) ERD 갱신은 단독 PR 로** — 데이터 모델 진실값을 먼저 합의한 뒤 코드 진입.

### 우선순위
🟠 중상 — (A) 가 끝나 **차단 해소**. 다만 §26 처럼 "파생값 의미 미정의"가 반복되고 있어,
프론트가 (B) 를 처리하는 것이 다음 데이터 모델 변경의 선행 워크.

### 발견 시점
2026-05-11 (사용자 — "ERD 파악 및 최신화도 백로그에 추가, 프론트랑 합동"). 2026-07-26 (A) 완료.

### 관련 자료
- 백엔드 `docs/db-schema.md` — 스키마 dump (§12-A 산출물)
- [`docs/ERD.drawio`](../diagram/ERD.drawio) — 현재 ERD (검증 미수행)
- 프론트 [`src/types/entities.ts`](../../src/types/entities.ts) — 프론트 데이터 모델
- 관련 항목: §26(파생값 `siteCount` 의미 미정의)

## 26. 🟡 `GET /api/trips/list` — `siteCount` 가 계획 목적지 수와 불일치 (의미 미정의)

외근 목록 카드가 "방문 N / 계획 M곳"을 보여줘야 하는데, 목록 API 에는 목적지 배열이 없어
`siteCount` 를 계획 수(M)로 쓴다. 그런데 이 값이 상세의 `destinations[]` 길이와 어긋난다.

### 현황

**운영 OpenAPI(2026-07-28 조회)**: `siteCount` 는 스펙 전체에서 **단 1회**, 설명 없이
`{"siteCount": {"type": "integer"}}` 로만 등장한다(`/api/trips/list` items). 무엇을 세는지
정의가 없어 프론트가 "계획 현장 수"로 해석한 것이 맞는지 확인 불가.

**관측(웹, 더미계정)** — 같은 외근을 목록 카드와 상세(`GET /trips/:id` → `destinations[]`)로 대조:

| 외근 | 계획 목적지(상세) | `siteCount`(목록) |
|---|---|---|
| 결과저장후 재진입 | 2 | **1** |
| 진행중 화면 검증 | 3 | **0 또는 null** |

방문 수와 상관관계가 있어 보이나(방문 1 → 1, 방문 0 → 0) 규칙을 단정할 수는 없다.
어느 쪽이든 **계획 수가 아니다.**

### 요청

셋 중 하나면 된다 — 프론트는 어느 쪽이든 대응 가능하다.

1. `siteCount` 를 **계획 목적지 수**(= `destinations[]` 길이)로 정정하고 스펙에 description 추가. (선호)
2. 의미가 원래 다른 것이라면(예: 실제 들른 현장 수) **스펙에 명시**하고, 목록 items 에
   `plannedSiteCount` 같은 계획 수 필드를 별도 추가.
3. 목록 items 에 `destinationCount` 를 추가하고 `siteCount` 는 그대로 둔다.

### 프론트 현황 (선조치 완료 — 차단 아님)

분모가 방문 수보다 작으면 신뢰할 수 없다고 보고 **계획 표기를 버리고 "방문 N건"으로 폴백**한다
(커밋 `b9daf9f`). 그전엔 `방문 3 / 계획 1곳` 같은 말이 안 되는 문구가 카드에 노출됐다.
백엔드 정정 후 이 가드를 걷어내면 된다.

### 우선순위

🟡 낮음~중간 — 폴백이 있어 차단은 아니지만, 목록에서 **진행률 바가 사라진 카드**가 생겨
"이 외근이 계획 대비 얼마나 돌았는지"를 목록에서 못 읽는다. §11(destinations 영속화)이
끝난 지금은 상세에 진실값이 있으므로 목록에도 같은 수를 실어주기만 하면 된다.

### 발견 시점

2026-07-27 외근 탭 UI/UX 사이클 E2E 중. 상세는 `계획 3`, 목록 카드는 `계획 1` 로 표시되는
모순을 발견 → 프론트 가드 선반영. 2026-07-28 운영 OpenAPI 대조로 "스펙에 정의 없음" 확인.

### 관련 코드

- 프론트 타입 [`src/types/entities.ts`](../../src/types/entities.ts) `Trip.siteCount?`
  (§11 당시 destinations 부재의 1차 회피로 도입된 필드)
- 프론트 표시·가드 [`src/components/trips/TripCard.tsx`](../../src/components/trips/TripCard.tsx) `planned`
- 상세 쪽 진실값 [`app/(tabs)/trips/[id].tsx`](../../app/(tabs)/trips/[id].tsx) `totalDest` (= `destinations.length`)
- 관련 항목: §11(destinations 영속화, ✅)

---

## ✅ 완료 항목 (아카이브)

> 조치 완료된 요청을 한 줄로 압축. 상세(커밋 diff·probe 로그)는 git 이력 + 아래 「변경 이력」 참조.
> §N 은 원 번호 유지 — 변경 이력·상호참조 앵커.

- **§2 ✅ `PATCH`/`DELETE /api/trips/:tripId`** (release 2026-06) — PATCH 제목·시간 보정(응답 비의존, 로컬 패치), DELETE 관련 레코드 시 `409 has_related_trip_records`→`?force=true`. `tripStore.update`/`remove`. 커밋 `18414f6`·`10b4cd0`·`ec6ab90`.
- **§3 ✅ 주소검색 `address.json`+`keyword.json` 병합 — 기구현 확인** (2026-07-26) — 백엔드 `searchFieldAddress` 가 이미 두 API 를 병렬 호출·병합·중복제거하고 있음(추가 커밋 없음). 백엔드 측 요청 충족. 잔여는 프론트 **선택** 정리뿐 — 클라이언트 카카오 JS SDK 키워드검색(`useKakaoPlaceSearch`, 헤드리스 WebView) 의존을 걷어낼 수 있음(차단 아님, 미적용).
- **§4 ✅ `detailAddress` optional 완화** (release 2026-06) — `detail_address_required` 400 제거, point 성 현장(가로수·광장) 등록 OK. 프론트 무변경.
- **§5 ✅ `POST /trips/navigation/optimize-preview` 404 → 클라이언트 only 확정** (2026-05-31) — `optimizePreview`·관련 타입 삭제, `order.tsx` 는 `nearestNeighborOrder` 만. (외근 시작 후 `/optimize` 는 유지.)
- **§7 ✅ 보고서 본문 검증 완화 + 사진 첨부 → 새 양식으로 해소** (2026-06-04) — content·보고서 레벨 사진 개념 제거(본문=`field_reports`), 사진은 `POST /reports/:id/field-reports`.
- **§8 ✅ 자동 체크인 — 현 반자동 정책 유지(변경 없음)** (2026-05-10) — arrival→Alert→사용자 탭→checkIn confirm 안전망이 의도된 동작. 재개 조건: 현장 작업자 "확인 번거로움" 신호 누적 시.
- **§9 ✅ visit 단계 모델(phase: 조치 전/중/후)** (release 2026-07-26) — `visit_photos.phase`(`before|during|after|null`), `POST /visits/:visitId/photos` multipart `phase?`, 응답 `attachment.phase` + 파생 `phaseProgress`(trip timeline·visit 상세 포함), `POST /reports/from-trip/:tripId` 이 phase→`beforePhotoUrl`/`pendingPhotoUrl`/`afterPhotoUrl` 자동 매핑. `visit_phase_invalid`(400). 커밋 `5a53b02`. **프론트 미배선** — 상단 「프론트 연동 대기」.
- **§11 ✅ 외근 destinations 영속화 + GET/PATCH** (release 2026-06 batch3) — `trips/start` plannedFields 수용·`destinations[]`, `GET/PATCH /trips/:id/destinations`, 체크인 자동 arrived. `destinationStore` 서버+캐시 전환. 커밋 `ea9a33f`·`caf2d1f`. (진행 중 단건 add 는 §24.)
- **§13 ✅ `POST /reports/generate` 500 → 프론트 미사용으로 종결** (2026-06-04) — AI 초안 분기 프론트 완전 제거(`/reports/generate`는 redirect만). 백엔드엔 미사용 endpoint 정리(제거/410) 권고만 잔존.
- **§14 ✅ 현장 메모/사진 개별 삭제** (release 2026-06) — `DELETE /fields/:id/memos/:memoId`·`.../photos/:photoId` 204(디스크 객체 정리). 프론트 `removeTextMemo`/`removePhoto` 선반영.
- **§15 ✅ 프로필 수정 `PATCH /api/me` · `PATCH /api/me/password`** (release 2026-07-26) — `{name?}`→`{user}`, 비밀번호는 `{updated:true}`. 에러 `name_required`·`current_password_invalid`·`password_confirm_mismatch`·`password_policy_violation`(정책은 signup 과 동일, 현재 최소 8자). 커밋 `37135e6`. **프론트 미배선** — `src/api/endpoints/` 에 me 파일 없음.
- **§16 ✅ `GET /trips/:tripId` timeline[].fieldId 정식 포함** (2026-06-01, 라이브 검증 닫힘) — 운영이 이미 `fieldId` 실어보냄(전제 오류; QA 당시 mock 배포였던 것으로 추정). `syncFromTimeline` 그대로 동작.
- **§17 ✅ 더미 데이터 보강 → 프론트 자가 시드로 해결(백엔드 불요)** (2026-06-01) — `seed_demo_data.mjs` 로 현장·외근·방문·보고서 전·중·후 사진 생성. `field-reports` 외부 photo URL 저장·회수 확인.
- **§18 ✅ `POST /reports/from-trip/:tripId`** (release 2026-06 batch2) — `{title}`→`{reportId, fieldReports[]}`. `createWithVisitScaffold` from-trip 1콜 우선 + 404/405 폴백. 커밋 `df6fc2d`.
- **§19 ✅ 보고서 PDF export** (release 2026-07-26) — `POST /reports/:reportId/export/pdf` + `POST /reports/:reportId/export?format=pdf|word`(`pdfkit`). 응답 `{url, downloadUrl, format}`, Word `outputFileUrl` 은 덮어쓰지 않음. `export_format_invalid`(400). 커밋 `7b02fb4`. **프론트 미배선**.
- **§20 ✅ 보고서 Word 위치도 — 네이티브 캡처→백엔드 임베드** (2026-06-19, 백엔드·프론트 완료+실기기 검증) — `POST /reports/:id/overview-photo`(sharp) + export/word 최상단 삽입 + `reports.overview_map_url`. 프론트 `react-native-view-shot` 캡처→업로드. 커밋 `5e5844b`·`2c48874`, `apk-v0.1.0-15`. (web 은 canvas-taint 로 위치도 없이 진행 — 실사용 아님.)
- **§21 ✅ `visits.reason`('기타' 사유) 영속·노출** (release 2026-06 batch1) — `status_reason` 영속 + 응답(`reason`)·timeline·recentVisits 노출. 프론트 4개 타입 `reason?` + 카드 '사유:' 표시. 커밋 `18414f6`·`bacdd47`.
- **§22 ✅ 인앱 경로 — 카카오모빌리티 자동차 경로 프록시(2단계)** (release 2026-07-26) — `POST /api/trips/:tripId/route` `{origin, destination, waypoints?}` → `{distance(m), duration(s), vertexes[{lat,lng}]}`. 카카오모빌리티 `v1/directions`·`v1/waypoints/directions`. 커밋 `386a195`. 1단계(직선 폴리라인·순번 마커)는 프론트 완료(외근 탭 사이클). **잔여: 실도로 vertexes 렌더 + `nearestNeighborOrder` 직선 ETA 대체 — 프론트.**
- **§23 ✅ 처리방침·약관 정적 페이지 호스팅** (release 2026-06) — `GET /privacy`·`/terms` 200(Play Console 링크 해소). ⚠️ 잔여(코드 아님): 서빙 본문은 **초안** — 법적 문구 팀 작성·교체 필요.
- **§24 ✅ `POST /trips/:tripId/destinations` 진행 중 단건 추가** (release 2026-06-19) — `{fieldId, order?}`→Destination, 멱등·active-only(`409 already_ended_trip`). `destinationStore.add` 낙관적 temp→fire-and-forget. 커밋 `5e5844b`. probe 6/6 PASS.
- **§25 ✅ 사용자 커스텀 카테고리 마스터 `categories` CRUD** (release 2026-07-26) — `GET/POST /api/categories`, `PATCH/DELETE /api/categories/:categoryId`, user 스코프 `(user_id, name)` UQ. 에러 `category_name_required`(400)·`category_name_taken`(409)·`category_not_found`(404). `Field.categories: string[]`/`field_categories` **계약 무변경**. 커밋 `8cc8e12`. **프론트 잔여**: `categoryStore` 가 아직 AsyncStorage 진실원(`TODO(backend)`). 후속(별도 결정): `field_categories`→`category_id` FK / rename cascade.

---

## 변경 이력

- **2026-07-28**: 백로그 정리 — 2026-07-26 백엔드 배치 반영(결과보고서 `release-2026-07-26-backend-backlog.md`
  저장소 반영). **§3·§9·§15·§19·§22·§25 → ✅ 아카이브 이관**(백엔드 배포 완료). **§10 부분 완료**로 재기술
  (S3/MinIO 드라이버·사진 1920/q72 ✅ / 음성 비트레이트·보고서 zip<20MB 잔여). **§12 (A) 스키마 dump ✅,
  (B) `ERD.drawio` 갱신만 잔여**로 재기술. 활성 큐 **8건 → 3건**(§10·§12·§26). 백엔드는 냈는데 프론트가
  아직 안 붙은 5건(+§12-B)은 상단 「프론트 연동 대기」로 분리 — 2026-07-28 코드 실측 기준.
- **2026-07-28**: §26 추가 — `GET /trips/list` 의 `siteCount` 가 계획 목적지 수와 불일치(🟡).
  외근 탭 UI/UX 사이클 E2E 중 상세 `계획 3` vs 목록 카드 `계획 1` 모순 발견. 운영 OpenAPI 대조 결과
  `siteCount` 는 스펙에 description 없이 `integer` 로만 1회 등장 — 의미 미정의. 프론트는 분모가
  방문 수보다 작으면 계획 표기를 버리는 가드로 선조치(`b9daf9f`), 차단은 아님.
- **2026-07-24**: 백로그 정리 — 완료(✅) 15개(§2·4·5·7·8·11·13·14·16·17·18·20·21·23·24)를 하단 「완료 항목(아카이브)」 한 줄 요약으로 압축, 활성 큐엔 미해결 8개(§3·9·10·12·15·19·22·25)만 유지. §12 관련항목에 §25 반영.
- **2026-07-24**: §25 추가 — 카테고리 커스텀 Enum 전환(🟠). 프론트가 `/api/categories` contract 선행 정의 + `categoryStore`(임시 로컬 영속)로 관리 화면·다중선택 피커 구현. 백엔드 마스터 리소스(CRUD) 요청, 배포 후 서버 단일 소스로 스왑.
- **2026-06-19**: §24 운영 probe 검증 ✅ — 테스트계정으로 ilgayo.co.kr 라이브 6/6 PASS(200·pending / GET 포함 / 재POST 멱등 / 400·404·409 에러코드 일치). 403(타인 현장)만 2계정 필요로 미커버.
- **2026-06-19**: §20 ✅ 종결(🟡→✅) — 캡처→업로드→export 배선(`2c48874`) + release EAS 빌드 성공(`apk-v0.1.0-15`) + **실기기 검증 통과**(안드 WebView view-shot 빈칸 케이스 미발생, 카카오 위치도 정상 캡처·Word 임베드). fallback 불요.
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
