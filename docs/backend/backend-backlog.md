# 백엔드 백로그 — 일가요(mfz) 프론트엔드 요청 누적

> 프론트에서 발견·합의한 백엔드 작업 항목을 누적. 사이클 시작 시점에 우선순위
> 정해 작업으로 빼는 방식. 본 문서가 **활성 큐의 1차 소스**이고, 백엔드에 실제로
> 넘길 때는 `handoff-*.md` 전달본을 따로 뽑는다 (현행:
> [`handoff-2026-07-29-store-release.md`](./handoff-2026-07-29-store-release.md)).
> 종결된 전달본·백엔드 결과보고서는 [`archive/`](./archive/) 로 옮긴다.
>
> **응답 contract 표준**: 모든 4xx/5xx 는 Phase 7 단일 shape `{ code, message, fields?, details? }`.
>
> **지도 정책**: 일가요는 카카오 지도/길찾기만 사용. 구글·네이버 옵션은 노출하지 않음.
>
> **항목 번호**: §N 은 고정 식별자(변경 이력·상호참조에서 사용) — 완료 시 재번호 없이
> 하단 「완료 항목(아카이브)」로 한 줄 압축. 그래서 활성 큐 번호에 공백이 있는 게 정상.

---

## 26. 🟡 `GET /api/trips/list` — 목록에 **계획 목적지 수**가 없다 (`siteCount` 는 방문 현장 수)

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

방문 수와 상관관계가 있어 보이나(방문 1 → 1, 방문 0 → 0) 규칙을 단정할 수는 없었다.

### ✅ 의미 확정 (2026-07-28, 백엔드 `docs/db-schema.md`)

§12-A dump 의 「API에서만 존재하는 파생 값」이 답을 담고 있었다:

> `TripListItem.siteCount` = **해당 trip visits 의 `DISTINCT field_id` 개수**

즉 **실제로 들른 현장 수**이고, 계획 목적지 수가 아니다. 관측치(방문 1 → 1, 방문 0 → 0)와 정확히 맞는다.
프론트가 "계획 수"로 해석한 것이 오해였다. **버그가 아니라 미문서화 문제였다.**

정의상 `siteCount ≤ visitCount` 이므로, 프론트의 기존 가드(`분모 < 방문 수면 신뢰 불가`)는
사실상 항상 발동한다 → 목록 카드는 계속 "방문 N건" 폴백으로 남는다.

### 남은 요청 (범위 축소)

1. **OpenAPI 에 description 추가** — 지금 `{"siteCount": {"type": "integer"}}` 로 설명이 없다.
   이 항목이 생긴 근본 원인이 그것이고, dump 를 안 봤으면 또 오해했을 것이다. (필수)
2. 목록 items 에 **계획 목적지 수**(`plannedSiteCount` 또는 `destinationCount`) 추가. (선호)
   목록에서 "계획 대비 얼마나 돌았는지"를 읽으려면 계획 수가 필요한데, 목록 API 에는
   `destinations[]` 가 없어 상세를 열지 않으면 알 수 없다.

### 프론트 현황 (선조치 완료 — 차단 아님)

분모가 방문 수보다 작으면 신뢰할 수 없다고 보고 **계획 표기를 버리고 "방문 N건"으로 폴백**한다
(커밋 `b9daf9f`). 그전엔 `방문 3 / 계획 1곳` 같은 말이 안 되는 문구가 카드에 노출됐다.
의미가 확정된 지금 보면 **이 가드는 우연히 옳게 동작하고 있었다** — `siteCount` 는 계획 수가
아니므로 분모로 쓰면 안 되는 값이었다. 위 2번(계획 수 필드)이 오면 그때 진행률 바가 살아난다.

### 우선순위

🟡 낮음~중간 — 폴백이 있어 차단은 아니지만, 목록에서 **진행률 바가 사라진 카드**가 생겨
"이 외근이 계획 대비 얼마나 돌았는지"를 목록에서 못 읽는다. 상세에는 `destinations[]` 진실값이
있으므로 목록에도 그 길이를 실어주기만 하면 된다.

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

## 27. 🟠 §9 visit phase — 붙인 리소스가 프론트 경로와 다름 (배포됐지만 동작 불가)

§9(visit 단계 모델)는 백엔드가 2026-07-26 에 배포했지만, **프론트에서는 절대 발화하지 않는다.**
붙인 자리가 프론트가 쓰는 자리와 다르다.

### 실측 (운영 OpenAPI, 2026-07-28)

| 엔드포인트 | `phase` | 프론트가 호출하나 |
|---|---|---|
| `POST /api/fields/{fieldId}/photos` | **없음** (`file`+`caption` 뿐) | **예** — 체크인 화면의 단계 슬롯이 여기로 올린다 |
| `POST /api/visits/{visitId}/photos` | 있음 (`before\|during\|after`) | **아니오** — 프론트에 호출 0건 |

- 프론트는 체크인(`app/(tabs)/fields/[id]/checkin.tsx`)에서 작업 전/중/후 3슬롯을 이미 제공하고
  `fieldStore.addPhoto(fieldId, file, { phase })` 로 **phase 를 실어 보내고 있다.** 그런데 그 엔드포인트가
  phase 를 받지 않으므로 서버에서 조용히 버려진다.
- 그래서 `POST /reports/from-trip/:tripId` 의 phase→슬롯 자동 매핑도 매칭할 데이터가 없어 발화하지 않는다.
  §9 의 실제 목적(보고서마다 사진을 다시 분류하는 번거로움 제거)이 달성되지 않은 상태.
- 결과보고서가 "trip timeline / visit 상세에 `phaseProgress` 포함" 이라 했으나 **OpenAPI 전체에서 0건**.
  `GET /api/trips/{tripId}` 의 timeline 항목 스키마에도 없다.

### 왜 프론트가 visit 쪽으로 옮기면 안 되나

**visit 첨부를 돌려주는 GET 이 스펙에 하나도 없다.** `GET /api/trips/{tripId}/visits/{visitId}` 는
응답 스키마 자체가 비어 있고, trip 상세 timeline 에도 첨부가 없다. 지금 프론트가 사진을 visit 으로
옮기면 **찍은 사진을 앱에서 다시 볼 수 없게 된다** — 현장 상세 갤러리에서 사라지고 대체 조회 경로도 없다.
자동 매핑을 얻는 대가로 가시성을 잃는 거래라 채택하지 않았다.

또한 ERD v2 이후 이 앱의 사진은 **현장(field) 자산**이다(체크인 화면 주석: "체크인은 방문 기록만 생성,
첨부는 현장에서 관리"). visit 첨부로 옮기는 건 데이터 모델 결정을 되돌리는 일이라 §12(ERD) 선행이 필요하다.

### 요청 — 셋 중 하나

1. **`POST /api/fields/{fieldId}/photos` 에 `phase` 추가** (**선호**).
   프론트가 이미 보내고 있어 **백엔드 배포 즉시 동작**한다. 프론트 변경 0.
   응답 `FieldPhotoAttachment` 에도 echo 하면 보고서 편집기 prefill 까지 살아난다
   (`FieldPhotoItem.phase?` 는 이미 optional 로 선반영돼 있음).
2. visit 첨부 조회 GET 신설 — `GET /api/visits/{visitId}/photos` 또는 trip 상세 timeline 에 첨부 포함.
   그래야 프론트가 visit 쪽으로 옮겨도 사진이 사라지지 않는다. (1번보다 프론트 작업이 큼)
3. `phaseProgress` 를 실제로 응답에 싣고 OpenAPI 에 반영. 현재 스펙 0건이라 프론트가 신뢰할 근거가 없다.

### 우선순위

🟠 중상 — 배포는 됐는데 **사용자에게 도달하는 효과가 0** 이다. 1번이면 백엔드 한 줄 수준이고
프론트는 손댈 게 없다.

### 발견 시점

2026-07-28, 2026-07-26 배치 프론트 연동 사이클 착수 시 운영 OpenAPI 대조 중.

### 관련 코드

- 프론트 업로드 [`src/api/endpoints/fields.ts:254`](../../src/api/endpoints/fields.ts#L254) `addPhoto(..., opts.phase)`
- 프론트 UI [`app/(tabs)/fields/[id]/checkin.tsx`](../../app/\(tabs\)/fields/\[id\]/checkin.tsx) 단계 슬롯 3개
- 프론트 타입 [`src/api/endpoints/fields.ts:51`](../../src/api/endpoints/fields.ts#L51) `AttachmentPhase`
- 임시 대안 [`app/(tabs)/reports/[id]/field-report.tsx`](../../app/\(tabs\)/reports/\[id\]/field-report.tsx) `pickFromField` (현장 갤러리에서 수동 선택)
- 관련 항목: §9(✅ 배포, 그러나 미도달) · §12(ERD — 사진 소유 리소스 결정)

---

## 28. 🟠 주소검색 응답에 **장소명(`buildingName`)** 이 없다 — 클라이언트 SDK 를 못 걷어냄

§3 으로 백엔드가 `address.json` + `keyword.json` 병합을 배포해 **장소명으로 검색은 된다**.
그런데 **응답이 장소명을 담아 오지 않아**, 프론트는 여전히 클라이언트 카카오 JS SDK 키워드검색
(헤드리스 WebView 브리지)을 떼지 못한다. §3 아카이브에 "잔여는 프론트 선택 정리뿐" 이라 적었던 것은
오판이었다.

### 실측 (2026-07-28, 로그인 세션에서 앱이 실제로 보낸 호출)

`GET /api/fields/address/search?keyword=동아대학교` → 200, **10건**. 매칭은 정상(승학·부민캠퍼스 등).

```json
{ "roadAddress": "부산 사하구 낙동대로550번길 37",
  "jibunAddress": "부산 사하구 하단동 840",
  "sido": null, "sigungu": null,
  "lat": 35.115446, "lng": 128.967669 }
```

| 항목 | 결과 |
|---|---|
| `buildingName` 키 존재 | **10건 중 0건** (키 자체가 없음) |
| `sido` / `sigungu` | 전부 `null` (POI 출처라 주소 depth 없음 — 예상된 동작) |

프론트 타입 [`AddressSearchItem`](../../src/api/endpoints/fields.ts#L162) 은 `buildingName: string | null` 로
선언돼 있으나 실제 응답엔 그 키가 오지 않는다.

### 왜 막히나

- 클라이언트 SDK 는 `place_name` → `buildingName` 으로 매핑한다
  ([`useKakaoPlaceSearch.web.tsx:71`](../../src/components/fields/useKakaoPlaceSearch.web.tsx#L71)).
- [`MapSearchBar`](../../src/components/MapSearchBar.tsx) 의 「새 위치 등록」 목록은
  `p.buildingName || p.roadAddress || p.jibunAddress` 를 1차 라벨로 쓴다. 서버 결과만 쓰면
  **"동아대학교" 가 "부산 사하구 낙동대로550번길 37" 로 표시**된다 — 이름으로 장소를 찾는 목록의
  존재 이유가 사라진다.
- `fields/new`·`fields/[id]/edit` 도 서버·클라이언트 결과를 `mergeSearchItems` 로 합쳐 쓰는데,
  이름이 없으면 병합의 의미가 없다.

### 요청

`keyword.json` 출처 item 에 **장소명을 실어 달라.** 필드명은 기존 프론트 타입에 맞춰
`buildingName` 이면 프론트 변경 0 이다(다른 이름이면 프론트가 매핑 추가).
주소(`address.json`) 출처 item 은 지금처럼 비워 두면 된다.

### 그러면 프론트가 할 일 (이 요청이 충족된 뒤)

1. `useKakaoPlaceSearch.tsx` / `.web.tsx` 삭제 — 헤드리스 WebView 브리지 제거(약 236줄).
2. `MapSearchBar` 의 장소 검색을 `fieldsApi.addressSearch` 로 교체.
3. `fields/new`·`fields/[id]/edit` 에서 클라이언트 검색·`mergeSearchItems` 제거.
4. 부수 효과: 카카오 **JS 키 도메인 화이트리스트 의존이 검색 경로에서 사라진다**
   (지도 렌더는 여전히 필요). 개발 포트를 8081 이외로 띄울 때의 제약도 그만큼 줄어든다.

### 우선순위

🟠 중상 — 기능은 지금도 동작하므로 차단은 아니다. 다만 **한 줄 추가로 프론트 코드 236줄과
런타임 의존(헤드리스 WebView·SDK 준비 경합)이 사라지는** 비용 대비가 크다.

### 발견 시점

2026-07-28, §3 잔여 정리를 착수하려고 범위를 분석하다 발견. 착수 전에 서버 응답을 실측해
드러났다 — 문서(§3 아카이브)만 믿었으면 회귀를 배포할 뻔했다.

### 관련 코드

- 프론트 타입 [`src/api/endpoints/fields.ts:162`](../../src/api/endpoints/fields.ts#L162) `AddressSearchItem.buildingName`
- 클라이언트 SDK 훅 [`src/components/fields/useKakaoPlaceSearch.tsx`](../../src/components/fields/useKakaoPlaceSearch.tsx) · [`.web.tsx`](../../src/components/fields/useKakaoPlaceSearch.web.tsx)
- 병합 [`src/utils/addressSearch.ts`](../../src/utils/addressSearch.ts) `mergeSearchItems`
- 소비 화면 [`MapSearchBar`](../../src/components/MapSearchBar.tsx)(지도 공용) · `fields/new` · `fields/[id]/edit`
- 관련 항목: §3(병합 배포, ✅)

---

## 29. 🟡 `GET /api/reports` 목록 item 에 **외근 요약**이 없다 — 그룹 헤더가 로컬 store 에 의존

보고서 목록은 외근별로 묶어 보여준다. 그런데 목록 응답에 외근 정보가 없어, 프론트가
로컬 `tripStore` 에서 trip 을 찾아 헤더(날짜·시간)를 만든다. 외근 목록은 페이지네이션돼
있어 **오래된 외근을 가리키는 보고서는 매칭에 실패**한다.

### 실측 (2026-07-29, 로그인 세션의 실제 응답)

`GET /api/reports` → 19건. item 키:

```
reportId · tripId · title · outputFileUrl · overviewMapUrl · fieldReportCount · createdAt · updatedAt
```

| 항목 | 결과 |
|---|---|
| `tripId` 채워짐 | **19/19 (100%)** |
| `trip` 요약 객체 | **0/19 — 키 자체가 없음** |
| 그 결과 화면에서 외근 매칭 실패 | **15/19** (로컬 tripStore 에 18건만 로드됨) |

프론트 타입 `ReportListItem` 에는 `trip: { tripDate, startedAt, endedAt }` 이 **선언돼 있었다.**
읽는 코드가 없어 런타임 오류는 없었지만, 계약이 사실과 달라 그룹 헤더가 로컬 store 에
의존하는 구조가 굳어졌다. 2026-07-29 프론트에서 그 선언을 제거하고 `fieldReportCount` 를
추가해 실제 응답에 맞췄다.

### 요청

목록 item 에 **외근 요약을 실어 달라.** 프론트 타입이 원래 기대하던 모양 그대로면 된다:

```json
"trip": { "tripDate": "2026-07-27", "startedAt": "...", "endedAt": "..." }
```

`tripId` 만으로는 헤더에 날짜·시간을 못 쓴다. 보고서 상세(`GET /api/reports/:id`)는 이미
`trip { startedAt, endedAt, visitCount }` 를 주고 있으므로, 목록에도 같은 요약을 얹는 것이다.

### 프론트 현황 (선조치 완료 — 차단 아님)

폴백 그룹을 **'외근 정보 미로드'** 와 **'외근 없이 작성된 보고서'** 로 분리했다. 이전엔 둘을
한 덩어리로 묶어 `외근 정보 없음` 이라 적었는데, 실제로는 외근이 멀쩡히 있고 로컬에 안
불러왔을 뿐이라 **사용자에게 데이터가 유실된 것처럼 보이는 거짓 표기**였다.
서버가 요약을 실어 주면 이 폴백 자체가 사라진다.

### 우선순위

🟡 낮음~중간 — 폴백 표기를 고쳐 오해는 없앴으므로 차단은 아니다. 다만 보고서가 쌓일수록
'미로드' 그룹이 커진다(현재 19건 중 15건). 외근 목록을 더 불러오는 방식은 요청 수만 늘 뿐
근본 해법이 아니다.

### 발견 시점

2026-07-29, 외근·보고서 목록 필터 작업 후 "필터를 더 넣을 게 있나" 를 판단하려고 실제 응답의
필드 분포를 재다가 발견. 필터 후보를 재는 과정에서 **계약 불일치 두 건**(없는 `trip`, 선언
안 된 `fieldReportCount`)이 같이 드러났다.

### 관련 코드

- 프론트 타입 [`src/api/endpoints/reports.ts`](../../src/api/endpoints/reports.ts) `ReportListItem`
- 그룹 구성 [`app/(tabs)/reports/index.tsx`](../../app/\(tabs\)/reports/index.tsx) `groups` useMemo
- 상세는 이미 요약을 준다 — `ReportDetailResponse.trip`

---

## 30. 🔴 앱 내 회원 탈퇴 — `DELETE /api/me` 가 없다 (스토어 심사 차단)

**출시 대상은 Google Play 뿐이다** (App Store 는 계획에 없음 — 2026-07-29 확인).
Play 는 계정 생성을 허용하는 앱에 **계정·데이터 삭제 경로를 요구**하며, 데이터 안전 양식
기재 대상이다. 현재는 운영팀 이메일로 요청받아 수동 처리하는 구조라 심사에서 반려 사유가
되고, 개인정보처리방침이 말하는 삭제 절차와 실제 서비스가 어긋난다.

⚠️ **Play 는 앱 밖에서 접근 가능한 삭제 요청 URL 도 요구하는 것으로 알려져 있다.** 앱 내
경로만으로 충분한지, 별도 웹 페이지(`/account-deletion` 등)가 필요한지는 **Play Console 데이터
안전 양식에서 확인**해야 한다. 필요하다면 (B) 의 정책 페이지 서빙에 한 건 더 붙는다.

### 실측 (2026-07-29, 운영 OpenAPI `https://ilgayo.co.kr/api-docs.json`)

| 경로 | 존재하는 메서드 |
|---|---|
| `/api/me` | `get`, `patch` — **`delete` 없음** |
| `/api/me/password` | `patch` |

사용자 리소스를 지우는 엔드포인트가 전체 스펙에 하나도 없다.

### 요청 (A) — `DELETE /api/me`

```
DELETE /api/me
Authorization: Bearer <accessToken>
Body: { "password": "..." }     ← 재인증을 요구한다면
```

계약에서 못박아 주면 좋은 것:

1. **재인증 수단** — 비밀번호를 받을지, refresh 토큰을 받을지, 아니면 access 토큰만으로 충분한지.
   프론트는 일단 `{ password }` 를 싣고 있다(서버가 무시해도 무해).
2. **삭제 범위** — 회원 기본정보·외근기록·방문기록·업무보고·사진(스토리지 객체 포함)·메모·
   세션/토큰. 사진은 DB row 만 지우고 MinIO 객체가 남으면 개인정보가 남는 것이다.
3. **성공 응답 형태** — 204 인지 `{ deleted: true }` 인지. 프론트는 둘 다 받도록 열어 뒀다.
4. **동일 이메일 재가입 허용 여부** — soft delete 라면 재가입이 `email_already_exists` 로
   막히는지 확인 필요.
5. **법령 보관 대상** — 별도 보관한다면 무엇을 얼마나 보관하는지. 화면에 고지 문구를
   띄워 뒀으므로 실제 정책과 맞춰야 한다.

### 요청 (B) — 위치정보 이용약관 페이지

`§23` 으로 `/terms`·`/privacy` 는 살아났다(2026-07-29 실측 200). 그런데 **위치정보 이용약관은
페이지 자체가 없다** — `/location-terms`·`/location`·`/terms/location` 모두 404 이고,
`/terms`·`/privacy` 본문에도 '위치정보' 문구가 없다.

지금은 **가입 화면의 필수 동의 3종 중 '위치정보 이용약관' 링크가 일반 `/terms` 를 가리킨다**
(`app/(auth)/signup.tsx:40`). 커밋 `f079108` 에서 죽은 도메인을 고칠 때 살아 있는 페이지가
`/terms` 뿐이라 그리로 붙인 것인데, 동의받는 문서와 보여주는 문서가 다른 상태다.

이 앱은 현재 위치를 상시 사용하므로 위치정보 이용약관은 별도로 있어야 한다.
`GET /location-terms` 로 서빙해 주면 프론트는 상수 한 줄(`LOCATION_TERMS_AVAILABLE`)만
바꿔 메뉴를 켠다. **없는 동안은 메뉴를 노출하지 않는다** — 커밋 `f079108` 에서 죽은 약관
링크로 이미 한 번 데였고, 심사 대상 앱에서 404 로 가는 정책 링크는 없느니만 못하다.

### 요청 (C) — 비밀번호 재설정 SMTP (낮음)

`POST /auth/password/reset-request` 는 존재하지만 스펙 설명이 **"(스텁) SMTP·토큰 저장은
미구현. 항상 `{ ok: true }` 만 반환"** 이다. 그래서 프론트는 배선하지 않고 수동 안내를
유지한다. 실제로 메일이 나가게 되면 알려 달라 — 그때 로그인 화면 안내를 자동 플로우로 바꾼다.

### 요청 (D) — 약관 **동의 버전** 기록

지금 가입 요청은 약관 동의를 **`termsAgreed: true` 불리언 하나**로 보낸다
(`src/api/endpoints/auth.ts` `SignupBody`). 화면에서는 이용약관·개인정보 처리방침·위치정보
이용약관을 **각각 체크**받는데(`app/(auth)/signup.tsx` `REQUIRED_TERMS`), 서버에 남는 건
"동의했다" 뿐이다. **어느 문서의 어느 버전에 동의했는지 알 방법이 없다.**

약관은 반드시 개정된다. 그때 "기존 사용자에게 재동의를 받아야 하는가" 를 판단하려면
누가 어느 버전에 동의했는지가 있어야 하는데, 이건 **소급 생성이 불가능한 데이터**다.
지금 넣는 게 가장 싸다.

계약 제안 — 기존 필드는 유지하고 optional 로 얹는다(구버전 앱 호환):

```jsonc
// POST /auth/signup
{
  "termsAgreed": true,              // 유지
  "agreedTerms": {                  // 신규 (optional)
    "service":  "2026-08-01",
    "privacy":  "2026-08-01",
    "location": "2026-08-01"
  }
}
```

- 버전 식별자는 **시행일(`YYYY-MM-DD`)** 을 제안한다. 문서 최상단에 명시할 값과 같은 것이라
  사람이 읽고 대조하기 쉽다. `v1.0` 류를 쓰면 "그게 언제 시행된 거냐" 를 또 찾아야 한다.
- 저장은 사용자당 1행이 아니라 **(사용자 × 문서 × 버전) 이력**으로 쌓이는 게 맞다.
  재동의를 받으면 행이 추가돼야지 덮어써지면 안 된다.
- 조회 수단이 하나 필요하다 — `GET /api/me` 에 현재 동의 버전을 실어 주면 앱이
  "개정됐으니 재동의" 배너를 띄울 수 있다.

**문서 본문 보관은 별도 인프라가 필요 없다.** 원문을 repo 에 두면 git 이 모든 과거 버전을
들고 있다(→ (B) 참조). 버전별 URL 서빙(`/{doc}/{version}`)은 나중에 라우팅만 붙이면 되므로
**(D) 를 (B) 보다 먼저 해도 된다** — 동의 기록만 소급이 안 되기 때문이다.

### 요청 (E) — 약관이 선언한 **보관기간 30일**이 실제로 지켜지는가

2026-07-29 확정된 약관 본문(Notion v1.0, 시행일 **2026-08-03**)이 보관기간을 명시한다.

| 문서 | 조항 | 선언 |
|---|---|---|
| 개인정보처리방침 | §4 | 외근기록·위치기록 **외근 종료 후 30일**, 접속·오류 로그 최대 6개월 |
| 위치정보 이용약관 | §7 | 현재 위치·이동 경로·위치 기록 **외근 종료 후 30일** |

**실측 (2026-07-29, `mfz_backend` 소스 직접 확인 — `fa708c0`)**: 파기 배치가 **존재하지 않는다.**
cron·스케줄러·`setInterval`·retention/cleanup/purge 코드 0건. 코드의 "30일" 은 전부 조회 기본
필터(`GET /api/trips` 의 `visited_at`)이지 파기가 아니다.

### ✅ 결정 (2026-07-29) — 배치를 만들지 않고 **문서를 고친다**

배치를 도는 쪽은 부작용이 크다. 보고서·외근 이력이 앱에서 기한 없이 조회되므로 30일 파기가
실제로 돌면 **사용자의 오래된 보고서가 사라지는 UX 변화**가 된다. **백엔드 구현 작업 없음.**

### 다만 대상이 30일 두 줄보다 넓다

처리방침 §4 보관기간 표 5행 중 **4행이 미관리**다. 회원정보(탈퇴 시까지)만 맞고 —
그것도 탈퇴 구현이 (A) 대기다 — 외근기록·위치기록 30일은 파기가 없고, 접속·오류 로그
"최대 6개월" 은 **로거·nginx 로그 설정이 repo 에 없어** 컨테이너 기본 정책에 맡겨져 있다.
위치정보약관 §7 도 같다. 문서를 고칠 때 30일만 손대면 나머지가 남는다.

### 백엔드에 남는 일 — 답변 하나

구현 대신 팀이 문서를 정확히 쓰도록 **①접속·오류 로그의 실제 보존(로그 드라이버·logrotate·
보존 일수), ②백업 보관 정책 유무, ③(A) 구현 후 탈퇴 시 즉시 지워지는 범위**를 알려주면 된다.

### 프론트 현황 (선반영 완료 — 서버만 붙으면 동작)

- `auth.deleteMe()` · `authStore.deleteAccount()` · `app/(tabs)/profile/delete-account.tsx` 구현.
- **미구현 상태를 성공으로 위장하지 않는다**: 404/405/501 이면 로컬 세션을 **지우지 않고**
  "아직 앱에서 처리할 수 없습니다 → 메일로 요청" 으로 안내한다. 로컬만 비우고 성공처럼
  보이면 사용자는 탈퇴됐다고 믿고 떠나는데 계정은 서버에 남는다 — 가장 나쁜 실패 모드다.
- `user_not_found` 만 예외로 '이미 삭제됨' 으로 보고 로컬을 정리한다.
- **(D) ✅ 배선 완료 (2026-07-29)** — `SignupBody.agreedTerms?` 로 전송한다.
  값은 **그 시점에 실제로 서빙되던 본문의 시행일**이라 지금은 `2026-06-18`(구 초안)이고,
  `location` 은 페이지가 없어 아예 싣지 않는다. 아직 배포 안 된 `2026-08-03` 을 미리 적으면
  사실이 아닌 동의 이력이 되기 때문이다. (B) 배포 시 `utils/contact.ts` 의 `LEGAL_DOCS`
  한 곳을 올리면 메뉴 노출·동의 버전이 함께 갱신된다. 단위 테스트 5건으로 "미배포 문서는
  실리지 않는다" 를 고정했다.

### 우선순위

🔴 **높음 — (A) 는 스토어 출시 차단.** [`docs/roadmap/00_store-release-readiness.md`](../roadmap/00_store-release-readiness.md)
가 "코드 쪽 차단은 없다" 로 닫혀 있었는데, 그 판단은 계정 삭제 요건을 보지 않은 상태였다.
(B) 는 심사 리스크, (C) 는 편의.
(D) 는 **차단은 아니지만 지연 비용이 계속 쌓인다** — 지금 가입하는 사용자마다 버전 없는
동의 기록이 늘고, 그건 나중에 채워 넣을 수 없다. (B) 의 문서 작성과 같이 처리하는 게 자연스럽다.
(E) 는 **확인부터** 하면 된다. 배치가 이미 있으면 종결이고, 없으면 8/3 전에 구현/문서수정 중
하나를 골라야 한다.

### 발견 시점

2026-07-29, `docs/REQUIREMENTS_BEFORE_LAUNCHING.md` 검토 중 OpenAPI 대조로 확인.

---

## 31. 🔴 업로드된 파일이 전부 404 — 사진·Word 를 다시 받을 수 없다

DB 메타데이터(`fileUrl`·`fileSize`·`mimeType`)는 온전한데 **실제 파일이 하나도 응답되지 않는다.**
현장 사진·보고서 전·중·후 사진·생성된 Word 가 앱 전 화면에서 깨진다. 업로드는 성공하고
기록도 남는데 다시 볼 수 없는 상태다.

### 실측 (2026-07-30, 운영 `https://ilgayo.co.kr`, 더미계정)

**응답 본문이 두 갈래로 갈리는 게 핵심이다** — 같은 404 라도 원인이 다르다.

| 경로 | status | Content-Type | 본문 | 해석 |
|---|---|---|---|---|
| `/storage/fields/…jpg` | 404 | `application/json` | `{"code":"not_found","message":"리소스를 찾을 수 없습니다"}` | **라우트는 살아 있다** — `mountFileStorageRoute` 의 `existsSync(target)` 실패 분기 |
| `/storage/reports/…jpg` | 404 | `application/json` | 동일 | 동일 |
| `/output/report-….docx` | 404 | `text/html` (171B) | Express 기본 `Cannot GET` | **라우트 자체가 없다** |
| `/zzz-nonexistent` (대조군) | 404 | `text/html` | 동일 | — |
| `/api/me` (대조군) | 401 | `application/json` | `auth_header_missing` | 서버 정상 |

경로 변형(`/api/storage/…`·`/files/…`·`/uploads/…`)도 전부 404. 브라우저 `<img>` 로드·페이지 내
`fetch`·`curl` 세 경로 모두 동일하다.

### (A) `/storage/*` — 라우트는 정상, 파일이 디스크에 없다

- **대상**: 더미계정에서 확인 가능한 **23개 전부** (현장 직접 첨부 10 + 보고서 슬롯 13),
  업로드 시점 **2026-06-21 ~ 07-27**. 오래된 것도 3일 전 것도 똑같이 없다.
- **DB 메타는 온전**: 예) `fileSize: 12439`, `mimeType: "image/jpeg"`, `fileUrl` 정상 형식.
- **파생 사실 — 운영은 지금 `disk` 드라이버로 돌고 있다**: JSON `not_found` 가 온다는 건
  `mountFileStorageRoute` 가 실제로 마운트됐다는 뜻인데, 그 함수는 `driver !== "disk"` 면
  **no-op** 이다. 즉 **§10 에서 도입한 s3/minio 는 운영에 적용돼 있지 않다** (아카이브 §10 의
  "MinIO/S3 ✅" 기술과 운영 실태가 어긋난다).
- **유력 원인**: storage 루트가 **컨테이너 재생성 때 사라지는 경로**에 있다. 배포마다
  디스크가 초기화되면 DB 행만 남고 파일은 전부 증발하는데, 관측이 정확히 그 모양이다.

**요청**

1. **확인** — 운영 `FILE_STORAGE_ROOT` 의 실제 경로와, 그 경로가 `docker-compose` 의
   named volume / bind mount 로 **컨테이너 수명과 분리돼 있는지**.
2. **조치 (택1)**
   - ① `disk` 유지 + **영속 볼륨 마운트**
   - ② §10 의 **s3/minio 로 실제 전환**. 이때 `S3_PUBLIC_BASE_URL`(또는 `MINIO_PUBLIC_BASE_URL`)을
     **반드시 절대 URL 로** 설정할 것 — 상대 기본값(`/storage`)으로 두면 `mountFileStorageRoute`
     가 no-op 이 되어 **지금과 똑같이 전부 404** 가 된다. 이 함수는 `base` 가 `http(s)://` 로
     시작하면 라우트를 아예 안 건다.
3. **유실 레코드 처리 회신** — 파일 없는 `field_photos`·`field_reports.*PhotoUrl` 행을
   정리할지 남길지. 남긴다면 프론트가 404 를 빈 칸이 아니라 "이미지 없음"으로 그린다.

**미확인 1건 (백엔드에서 30초면 갈린다)**: 지금 **새로 업로드한 사진이 즉시 읽히는가.**
200 이면 볼륨·보존 문제(과거 파일만 유실), 404 면 쓰기 경로와 읽기 경로의 불일치다.
프론트에서 돌리려다 세션 만료로 못 돌렸다.

### (B) `/output/*.docx` — 서빙 라우트가 없다

- `GET /api/reports` 가 `outputFileUrl: "/output/report-1783495887837.docx"` 를 내려주는데
  이 경로는 **Express 기본 404(HTML)** 다 — 어떤 라우트도 잡지 않는다.
- 더미계정 보고서 19건 중 **4건이 `outputFileUrl` 을 갖고 있고 전부 받을 수 없다.**
- `mountFileStorageRoute` 는 scope 를 `visits|fields|reports` 로 제한하므로 `/output` 은
  애초에 이 라우트의 대상이 아니다.

**요청**: `/output` 정적 서빙을 추가하거나, **Word 결과물을 파일 스토리지(`scope=reports`)로
옮기고 `outputFileUrl` 을 `/storage/reports/…` 로 통일**. 후자면 (A) 조치와 한 번에 끝나고
경로가 두 갈래로 갈리지 않는다. PDF export(`§19`)의 `url`·`downloadUrl` 도 같은 기준인지 확인 요망.

### 우선순위

🔴 **높음.** 제품 핵심(현장 전·중·후 사진)이 **재조회 불가**다. 기록은 남는데 증빙이 사라지는
형태라, 실사용 관점에서는 기능이 없는 것과 같다. 기말 발표 시연에서 사진 표시·Word 다운로드를
라이브로 보여줄 계획이면 그대로 실패한다(녹화 영상 시연이면 발표 자체는 무사).

### 프론트 현황

- **프론트 버그가 아니다** — URL 절대화(`src/api/config.ts:toAbsoluteFileUrl`)는 정상 동작하고,
  절대화된 URL 을 서버가 404 로 돌려준다.
- **선조치 후보 (미착수)**: 이미지 404 시 플레이스홀더·안내 문구. 지금은 빈 칸으로 보인다.
  (A)-3 회신에 따라 문구가 갈려서 대기 중.

### 발견 시점

2026-07-30, 발표자료용 실증 규모 집계 중 사진 URL 을 훑다가 확인.

---

## 🔗 2026-07-26 배치 프론트 연동 — ✅ 종결 (이력)

> 2026-07-26 백엔드 배치([release-2026-07-26-backend-backlog.md](./archive/release-2026-07-26-backend-backlog.md))로
> 활성 큐 6건이 운영에 나갔고, **2026-07-28 사이클에서 §19·§15·§25·§22 를 연동했다.**
> **2026-07-28 기준 프론트 작업은 전부 끝났다.** §9 는 연동 대상이 아니라 백엔드 재요청(**§27**)으로
> 전환됐다 — 백엔드가 phase 를 붙인 리소스가 프론트가 쓰는 리소스와 달라 프론트가 할 수 있는 일이 없다.

| § | 백엔드 | 프론트 현황 (실측) | 해야 할 것 |
|---|---|---|---|
| ~~§25 categories~~ | ✅ | **연동 완료** (2026-07-28, `c0bcbae`) — 서버 단일 소스 + 최초 1회 로컬 flush | — |
| ~~§9 visit phase~~ | ✅ | **프론트는 이미 phase 를 보내고 있다** — 다만 백엔드가 받는 엔드포인트가 다름 | **프론트 작업 없음. → §27 로 백엔드 재요청** |
| ~~§19 PDF export~~ | ✅ | **연동 완료** (2026-07-28, `bea5141`) — 생성 후 즉시 열기 단발(URL 미영속) | — |
| ~~§15 프로필 수정~~ | ✅ | **연동 완료** (2026-07-28, `4d8d79c`) — profile/edit 화면 신설 | — |
| ~~§22 경로 프록시~~ | ✅ | **연동 완료** (2026-07-28, `49bd539`) — 실도로 폴리라인 + 재최적화 ETA 대체 | — |
| ~~§12-B ERD~~ | (A) ✅ | **갱신 완료** (2026-07-28) — 3개 테이블 신설 + 컬럼 3개 반영 | — |

§10(파일 인프라)은 서버측 드라이버 교체라 프론트 contract 무변경 — 배선 불요.

---

## ✅ 완료 항목 (아카이브)

> 조치 완료된 요청을 한 줄로 압축. 상세(커밋 diff·probe 로그)는 git 이력 + 아래 「변경 이력」 참조.
> §N 은 원 번호 유지 — 변경 이력·상호참조 앵커.

- **§2 ✅ `PATCH`/`DELETE /api/trips/:tripId`** (release 2026-06) — PATCH 제목·시간 보정(응답 비의존, 로컬 패치), DELETE 관련 레코드 시 `409 has_related_trip_records`→`?force=true`. `tripStore.update`/`remove`. 커밋 `18414f6`·`10b4cd0`·`ec6ab90`.
- **§3 ✅ 주소검색 `address.json`+`keyword.json` 병합 — 기구현 확인** (2026-07-26) — 백엔드 `searchFieldAddress` 가 이미 두 API 를 병렬 호출·병합·중복제거하고 있음(추가 커밋 없음). 백엔드 측 요청 충족(매칭 기준). ⚠️ **2026-07-28 정정**: "잔여는 프론트 선택 정리뿐" 은 틀렸다 — 응답에 **장소명이 없어** 프론트가 클라이언트 SDK 를 걷어낼 수 없다. → **§28**.
- **§4 ✅ `detailAddress` optional 완화** (release 2026-06) — `detail_address_required` 400 제거, point 성 현장(가로수·광장) 등록 OK. 프론트 무변경.
- **§5 ✅ `POST /trips/navigation/optimize-preview` 404 → 클라이언트 only 확정** (2026-05-31) — `optimizePreview`·관련 타입 삭제, `order.tsx` 는 `nearestNeighborOrder` 만. (외근 시작 후 `/optimize` 는 유지.)
- **§7 ✅ 보고서 본문 검증 완화 + 사진 첨부 → 새 양식으로 해소** (2026-06-04) — content·보고서 레벨 사진 개념 제거(본문=`field_reports`), 사진은 `POST /reports/:id/field-reports`.
- **§8 ✅ 자동 체크인 — 현 반자동 정책 유지(변경 없음)** (2026-05-10) — arrival→Alert→사용자 탭→checkIn confirm 안전망이 의도된 동작. 재개 조건: 현장 작업자 "확인 번거로움" 신호 누적 시.
- **§9 ✅ visit 단계 모델(phase: 조치 전/중/후)** (release 2026-07-26) — `visit_photos.phase`(`before|during|after|null`), `POST /visits/:visitId/photos` multipart `phase?`, 응답 `attachment.phase` + 파생 `phaseProgress`(trip timeline·visit 상세 포함), `POST /reports/from-trip/:tripId` 이 phase→`beforePhotoUrl`/`pendingPhotoUrl`/`afterPhotoUrl` 자동 매핑. `visit_phase_invalid`(400). 커밋 `5a53b02`. ⚠️ **배포됐으나 프론트에 도달하지 않음** — phase 가 붙은 곳은 visit 사진인데 프론트는 현장 사진 엔드포인트를 쓴다(2026-07-28 OpenAPI 실측). → **§27 로 재요청.**
- **§10 ✅ 파일 저장 인프라 — MinIO/S3 + 사진 정규화** (release 2026-07-26) — `FILE_STORAGE_DRIVER=disk|s3|minio`(`@aws-sdk/client-s3`), 업로드 사진 long edge **1920**·JPEG **q=72**. 커밋 `3603a31`·`2a97fab`. 서버측 드라이버 교체라 **프론트 contract 무변경**. ⚠️ 잔여 2건은 2026-07-28 전제 정정으로 **둘 다 소멸** — ①음성 비트레이트: 음성 메모가 ERD v2 폐기라 녹음·업로드 경로 자체가 없다(요청 철회), ②"보고서 zip < 20MB": **zip 패키지가 존재하지 않는다**(내보내기는 Word·PDF 단일 파일뿐). 전송 크기 억제 의도만 살려 **프론트 관찰 항목**으로 강등 — 현장보고 10건+ 슬롯 3장 보고서로 export 크기를 재고, 임계 초과가 실제 관측되면 그때 압축을 요청한다(현재 실측 PDF 263KB). bucket 정책 분리·presigned upload·lifecycle 은 결과보고서에 언급 없어 필요 시 별도 확인.
- **§11 ✅ 외근 destinations 영속화 + GET/PATCH** (release 2026-06 batch3) — `trips/start` plannedFields 수용·`destinations[]`, `GET/PATCH /trips/:id/destinations`, 체크인 자동 arrived. `destinationStore` 서버+캐시 전환. 커밋 `ea9a33f`·`caf2d1f`. (진행 중 단건 add 는 §24.)
- **§12 ✅ ERD 최신화 — (A) 백엔드 스키마 dump + (B) `ERD.drawio` 갱신** (2026-07-28) — (A) 백엔드 `docs/db-schema.md`(커밋 `62bc3dd`). (B) 프론트가 백엔드 `scripts/gen-erd.mjs` 를 `docs/diagram/gen-erd.mjs` 로 들여와 스키마 기준 재생성: **`categories`·`trip_destinations`·`visit_photos` 3개 테이블 신설**, `trips.deleted_at`·`reports.overview_map_url`·`visits.status_reason` 컬럼 추가, 관계 4개(users→categories, trips/fields→trip_destinations, visits→visit_photos) 연결, 복합제약·파생값 노트 추가. 생성기 자가검증(겹침·앵커중복·엣지관통·포개짐) 통과. ⚠️ 기존 ERD 의 `destinations` 는 실제 테이블명이 `trip_destinations` 이고 `order`→`sort_order` 였다 — 이름·컬럼 모두 틀려 있었다.
- **§13 ✅ `POST /reports/generate` 500 → 프론트 미사용으로 종결** (2026-06-04) — AI 초안 분기 프론트 완전 제거(`/reports/generate`는 redirect만). 백엔드엔 미사용 endpoint 정리(제거/410) 권고만 잔존.
- **§14 ✅ 현장 메모/사진 개별 삭제** (release 2026-06) — `DELETE /fields/:id/memos/:memoId`·`.../photos/:photoId` 204(디스크 객체 정리). 프론트 `removeTextMemo`/`removePhoto` 선반영.
- **§15 ✅ 프로필 수정 `PATCH /api/me` · `PATCH /api/me/password`** (release 2026-07-26) — `{name?}`→`{user}`, 비밀번호는 `{updated:true}`. 에러 `name_required`·`current_password_invalid`·`password_confirm_mismatch`·`password_policy_violation`(정책은 signup 과 동일, 현재 최소 8자). 커밋 `37135e6`. **프론트 미배선** — `src/api/endpoints/` 에 me 파일 없음.
- **§16 ✅ `GET /trips/:tripId` timeline[].fieldId 정식 포함** (2026-06-01, 라이브 검증 닫힘) — 운영이 이미 `fieldId` 실어보냄(전제 오류; QA 당시 mock 배포였던 것으로 추정). `syncFromTimeline` 그대로 동작.
- **§17 ✅ 더미 데이터 보강 → 프론트 자가 시드로 해결(백엔드 불요)** (2026-06-01) — `seed_demo_data.mjs` 로 현장·외근·방문·보고서 전·중·후 사진 생성. `field-reports` 외부 photo URL 저장·회수 확인. (스크립트는 2026-07-29 `docs/presentation/` 정리로 제거 — git 이력에 있다.)
- **§18 ✅ `POST /reports/from-trip/:tripId`** (release 2026-06 batch2) — `{title}`→`{reportId, fieldReports[]}`. `createWithVisitScaffold` from-trip 1콜 우선 + 404/405 폴백. 커밋 `df6fc2d`.
- **§19 ✅ 보고서 PDF export** (release 2026-07-26) — `POST /reports/:reportId/export/pdf` + `POST /reports/:reportId/export?format=pdf|word`(`pdfkit`). 응답 `{url, downloadUrl, format}`, Word `outputFileUrl` 은 덮어쓰지 않음. `export_format_invalid`(400). 커밋 `7b02fb4`. 프론트 연동 완료(2026-07-28 `bea5141`, 실측: 263KB `%PDF-1.3` 생성 확인). ⚠️ 사소: 사진 0건일 때 PDF 요청인데도 400 메시지가 "…**Word**를 생성할 수 없습니다" 로 온다 — 포맷명 정정 요망.
- **§20 ✅ 보고서 Word 위치도 — 네이티브 캡처→백엔드 임베드** (2026-06-19, 백엔드·프론트 완료+실기기 검증) — `POST /reports/:id/overview-photo`(sharp) + export/word 최상단 삽입 + `reports.overview_map_url`. 프론트 `react-native-view-shot` 캡처→업로드. 커밋 `5e5844b`·`2c48874`, `apk-v0.1.0-15`. (web 은 canvas-taint 로 위치도 없이 진행 — 실사용 아님.)
- **§21 ✅ `visits.reason`('기타' 사유) 영속·노출** (release 2026-06 batch1) — `status_reason` 영속 + 응답(`reason`)·timeline·recentVisits 노출. 프론트 4개 타입 `reason?` + 카드 '사유:' 표시. 커밋 `18414f6`·`bacdd47`.
- **§22 ✅ 인앱 경로 — 카카오모빌리티 자동차 경로 프록시(2단계)** (release 2026-07-26) — `POST /api/trips/:tripId/route` `{origin, destination, waypoints?}` → `{distance(m), duration(s), vertexes[{lat,lng}]}`. 카카오모빌리티 `v1/directions`·`v1/waypoints/directions`. 커밋 `386a195`. 1단계(직선 폴리라인·순번 마커)는 프론트 완료(외근 탭 사이클). **잔여: 실도로 vertexes 렌더 + `nearestNeighborOrder` 직선 ETA 대체 — 프론트.**
- **§23 ✅ 처리방침·약관 정적 페이지 호스팅** (release 2026-06) — `GET /privacy`·`/terms` 200(Play Console 링크 해소). ⚠️ 잔여(코드 아님): 서빙 본문은 **초안** — 법적 문구 팀 작성·교체 필요.
- **§24 ✅ `POST /trips/:tripId/destinations` 진행 중 단건 추가** (release 2026-06-19) — `{fieldId, order?}`→Destination, 멱등·active-only(`409 already_ended_trip`). `destinationStore.add` 낙관적 temp→fire-and-forget. 커밋 `5e5844b`. probe 6/6 PASS.
- **§25 ✅ 사용자 커스텀 카테고리 마스터 `categories` CRUD** (release 2026-07-26) — `GET/POST /api/categories`, `PATCH/DELETE /api/categories/:categoryId`, user 스코프 `(user_id, name)` UQ. 에러 `category_name_required`(400)·`category_name_taken`(409)·`category_not_found`(404). `Field.categories: string[]`/`field_categories` **계약 무변경**. 커밋 `8cc8e12`. **프론트 잔여**: `categoryStore` 가 아직 AsyncStorage 진실원(`TODO(backend)`). 후속(별도 결정): `field_categories`→`category_id` FK / rename cascade.

---

## 변경 이력

- **2026-07-30**: **§31 추가 — 업로드 파일 전량 404.** 발표자료용 집계 중 사진 URL 을 훑다가
  확인했다. 처음엔 "파일 서빙 라우트가 죽었다" 로 봤는데, **404 본문 형태가 두 갈래로 갈리는
  것**을 보고 원인이 하나가 아님을 알았다 — `/storage` 는 JSON `not_found`(라우트 살아있음 =
  파일이 없음), `/output` 은 Express 기본 HTML(라우트 없음). 이 구분이 조치를 가른다.
  같은 관측에서 **운영이 아직 `disk` 드라이버로 돈다**는 사실도 파생됐다(`mountFileStorageRoute`
  는 disk 가 아니면 no-op 이므로 JSON 응답 자체가 증거) — 아카이브 §10 의 "MinIO/S3 ✅" 는
  코드 병합 기준이지 운영 반영 기준이 아니었다.

- **2026-07-29**: **문서 정리** — 종결된 전달본·백엔드 결과보고서 4건을 [`archive/`](./archive/) 로
  이동(`backend-handoff.md`, `release-2026-06-*`, `release-2026-06-19-*`, `release-2026-07-26-*`).
  **§10 을 활성 큐에서 아카이브로 내렸다** — 2026-07-28 정정으로 잔여 2건이 모두 소멸해
  백엔드 요청으로서는 이미 종결돼 있었는데 활성 항목 자리를 차지하고 있었다. 남은 건
  프론트 관찰 항목이라 아카이브 한 줄에 함께 적었다.

- **2026-07-29**: **§30 에 (D) 추가** — 약관 동의를 `termsAgreed: true` 불리언 하나로만 받고
  있어 **어느 문서의 어느 버전에 동의했는지 기록이 없다.** 화면은 3종을 각각 체크받는데
  서버에는 그 구분조차 남지 않는다. 재동의 판단에 필요한 데이터인데 소급 생성이 불가능해,
  개정이 일어나기 전에 넣는 게 가장 싸다. 버전 식별자는 시행일(`YYYY-MM-DD`) 을 제안했다.
  프론트는 **일부러 선반영하지 않았다** — 문서에 시행일이 없는 상태에서 버전 문자열을
  지어내면 사실이 아닌 동의 이력이 쌓이고, 그건 없는 것보다 나쁘다.

- **2026-07-29**: **§30 추가(🔴)** — 앱 내 회원 탈퇴에 필요한 `DELETE /api/me` 가 **존재하지
  않는다**(OpenAPI 실측: `/api/me` 는 `get`·`patch` 뿐, 사용자 삭제 엔드포인트가 스펙 전체에
  0건). Play 심사 요건이라 **출시 차단**이다. 같이 확인된 두 건도 묶었다 — ②위치정보 이용약관
  페이지 부재(`/location-terms` 등 404, `/terms`·`/privacy` 본문에도 '위치정보' 없음),
  ③`/auth/password/reset-request` 는 스텁(SMTP 미구현, 항상 `{ok:true}`)이라 프론트가
  배선하지 않고 수동 안내 유지. 프론트는 탈퇴 UI 를 선반영했고, 서버 미구현(404/405/501)일 때
  **로컬 세션을 지우지 않고 명시적으로 실패**시킨다.

- **2026-07-29**: **§29 추가(🟡)** — `GET /api/reports` 목록 item 에 외근 요약이 없어 그룹 헤더가
  로컬 tripStore 에 의존한다. 실측: `tripId` 는 19/19 채워 오는데 `trip` 객체는 0/19 이고,
  그 결과 15/19 가 외근 매칭에 실패해 **'외근 정보 없음'** 으로 표시되고 있었다 — 외근은
  멀쩡히 있고 로컬에 안 불러왔을 뿐인데 유실된 것처럼 보이는 거짓 표기. 프론트는 폴백을
  '외근 정보 미로드' / '외근 없이 작성된 보고서' 로 분리해 선조치. 같이 드러난 계약 불일치
  둘도 정정 — `ReportListItem.trip`(응답에 없는데 선언됨) 제거, `fieldReportCount`(응답에
  있는데 미선언) 추가.

- **2026-07-28**: **§10 잔여 전제 정정** — 잔여로 남아 있던 두 항목이 모두 실재하지 않는 대상을
  가리키고 있었다. ①음성 비트레이트 정규화: 음성 메모는 ERD v2 폐기로 프론트에 녹음·업로드
  경로가 없다(`expo-av` 미설치·관련 코드 0건) → **요청 철회**. ②보고서 zip < 20MB: **zip 패키지가
  존재하지 않는다** — 내보내기는 Word·PDF 단일 파일 두 가지뿐 → 대상을 그 두 파일로 옮기고,
  임계 사례가 관측된 적 없으므로(현장보고 1건 PDF 263KB) 요청이 아니라 관찰 항목으로 강등.
  백엔드 요청으로서 §10 은 사실상 종결.

- **2026-07-28**: **§28 추가(🟠)** — 주소검색 응답에 장소명이 없어 클라이언트 카카오 SDK 키워드검색을
  걷어낼 수 없다. §3 잔여 정리를 착수하려 범위를 분석하다, 서버 응답을 실측해 발견
  (`keyword=동아대학교` → 200·10건이지만 `buildingName` 키가 **0건**). §3 아카이브의
  "잔여는 프론트 선택 정리뿐" 을 정정. 문서만 믿고 진행했으면 `MapSearchBar` 의 「새 위치 등록」
  라벨이 장소명에서 도로명으로 바뀌는 회귀를 배포할 뻔했다.

- **2026-07-28**: **§12 ✅ 종결** — (B) `ERD.drawio` 갱신 완료. 백엔드 저장소를 pull 해
  `docs/db-schema.md` 를 확보하고, 백엔드 `scripts/gen-erd.mjs` 를 `docs/diagram/gen-erd.mjs` 로
  들여와 스키마 기준 재생성(자가검증 통과). 누락 테이블 3개(`categories`·`trip_destinations`·
  `visit_photos`) 신설, 컬럼 3개(`trips.deleted_at`·`reports.overview_map_url`·`visits.status_reason`)
  반영. 기존 ERD 의 `destinations` 는 테이블명·컬럼명이 모두 실제와 달랐다(`trip_destinations`,
  `order`→`sort_order`). **§26 재기술**: dump 의 파생값 표에서 `siteCount` = 「해당 trip visits 의
  DISTINCT field_id」로 **의미가 확정**됨 — 계획 수가 아니라 방문 현장 수이고, 프론트 해석이
  오해였다. 버그가 아니라 미문서화 문제로 판명돼 요청을 (1) OpenAPI description 추가,
  (2) 계획 수 필드 신설로 축소. §27 도 독립 확인됨 — dump 의 `field_photos` 에 `phase` 컬럼이 없다.

- **2026-07-28**: 2026-07-26 배치 프론트 연동 사이클. **§19·§15·§25·§22 연동 완료**
  (`bea5141`·`4d8d79c`·`c0bcbae`·`49bd539`). **§27 추가(🟠)** — §9 visit phase 가 배포됐는데
  프론트에 도달하지 않는다: 운영 OpenAPI 실측 결과 `phase` 는 `POST /api/visits/{visitId}/photos`
  에만 있고, 프론트가 실제로 쓰는 `POST /api/fields/{fieldId}/photos` 는 `file`+`caption` 뿐이라
  체크인 화면이 보내는 phase 가 서버에서 버려진다. visit 첨부를 돌려주는 GET 이 스펙에 하나도
  없어 프론트가 visit 쪽으로 옮기면 사진이 앱에서 사라지므로, 코드 대신 백엔드 재요청으로 전환.
  결과보고서가 주장한 `phaseProgress` 도 스펙 전체 0건. §12-B(ERD)는 백엔드 저장소 체크아웃이
  `af5320e`(배치 직전)에 멈춰 `db-schema.md` 부재 — 별도 사이클로 이월.
- **2026-07-28**: 백로그 정리 — 2026-07-26 백엔드 배치 반영(결과보고서 `archive/release-2026-07-26-backend-backlog.md`
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
