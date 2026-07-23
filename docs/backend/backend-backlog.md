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
- `src/types/entities.ts` 의 프론트 인터페이스와 칼럼 매핑 표 1장 첨부. (2026-07 추가: `categories` 마스터(§25)도 반영 대상.)

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
- 본 백로그 §9 (visit phase), §10 (파일 인프라), §25 (categories 마스터) — 각 항목이 ERD 변경을 동반

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

## 25. 🟠 사용자 커스텀 카테고리(분류) 마스터 리소스 — `categories` CRUD

카테고리를 자유 문자열 → **사용자가 관리하는 커스텀 Enum**으로 승격. 현재 `field_categories`
는 복합 PK `(field_id, category)` 문자열 태그라 마스터 목록/소유자/CRUD 가 없어, "한 번도
안 쓰인 카테고리"가 존재할 수 없고 오타·표기 흔들림이 그대로 쌓인다.

- **요청 계약(projects 패턴 + 관리용 PATCH/DELETE)**:
  - `GET /api/categories` (본인 것, 페이지네이션) → `{ items: [{ categoryId, name, createdAt }], pagination }`
  - `POST /api/categories { name }` → 생성(이름 유니크, 사용자 스코프). 중복이름 `409 category_name_taken`.
  - `PATCH /api/categories/:categoryId { name }` → 이름변경.
  - `DELETE /api/categories/:categoryId` → 삭제.
  - 신규 에러코드 후보: `category_name_required`, `category_name_taken`, `category_not_found`.
- **현장 저장 모델**: 당장은 `Field.categories: string[]`(이름) **계약 무변경** — 마스터는 "허용된
  이름 목록". 후속 옵션(별도 결정 필요): 현장이 name 대신 `category_id` FK 참조 / 이름변경 시
  기존 현장 값 캐스케이드 갱신 / 카테고리 색상·아이콘 속성.
- **프론트 현황(선행)**: contract 를 `src/api/endpoints/categories.ts` 로 정의하고 `categoryStore`
  (AsyncStorage 임시 영속 + 서버 fire-and-forget)로 관리 화면·다중선택 피커를 **지금 동작**시킴.
  백엔드 배포 후 store 소스만 서버 단일로 스왑(코드에 `TODO(backend)` 표식). 현재는 기기 내 로컬
  영속이라 기기 간 동기화 없음.

### 발견 시점
2026-07-24 (카테고리 커스텀 Enum 전환 요구 — 프론트 선행 배선 + 백엔드 마스터 리소스 요청).

### 관련 코드
- 프론트 [`src/api/endpoints/categories.ts`](../../src/api/endpoints/categories.ts) (contract)
- 프론트 [`src/stores/categoryStore.ts`](../../src/stores/categoryStore.ts) (임시 로컬 영속 + 서버 스왑 TODO)
- 프론트 [`src/components/fields/CategoryMultiPicker.tsx`](../../src/components/fields/CategoryMultiPicker.tsx), [`app/(tabs)/fields/categories.tsx`](../../app/(tabs)/fields/categories.tsx)

---

## ✅ 완료 항목 (아카이브)

> 조치 완료된 요청을 한 줄로 압축. 상세(커밋 diff·probe 로그)는 git 이력 + 아래 「변경 이력」 참조.
> §N 은 원 번호 유지 — 변경 이력·상호참조 앵커.

- **§2 ✅ `PATCH`/`DELETE /api/trips/:tripId`** (release 2026-06) — PATCH 제목·시간 보정(응답 비의존, 로컬 패치), DELETE 관련 레코드 시 `409 has_related_trip_records`→`?force=true`. `tripStore.update`/`remove`. 커밋 `18414f6`·`10b4cd0`·`ec6ab90`.
- **§4 ✅ `detailAddress` optional 완화** (release 2026-06) — `detail_address_required` 400 제거, point 성 현장(가로수·광장) 등록 OK. 프론트 무변경.
- **§5 ✅ `POST /trips/navigation/optimize-preview` 404 → 클라이언트 only 확정** (2026-05-31) — `optimizePreview`·관련 타입 삭제, `order.tsx` 는 `nearestNeighborOrder` 만. (외근 시작 후 `/optimize` 는 유지.)
- **§7 ✅ 보고서 본문 검증 완화 + 사진 첨부 → 새 양식으로 해소** (2026-06-04) — content·보고서 레벨 사진 개념 제거(본문=`field_reports`), 사진은 `POST /reports/:id/field-reports`.
- **§8 ✅ 자동 체크인 — 현 반자동 정책 유지(변경 없음)** (2026-05-10) — arrival→Alert→사용자 탭→checkIn confirm 안전망이 의도된 동작. 재개 조건: 현장 작업자 "확인 번거로움" 신호 누적 시.
- **§11 ✅ 외근 destinations 영속화 + GET/PATCH** (release 2026-06 batch3) — `trips/start` plannedFields 수용·`destinations[]`, `GET/PATCH /trips/:id/destinations`, 체크인 자동 arrived. `destinationStore` 서버+캐시 전환. 커밋 `ea9a33f`·`caf2d1f`. (진행 중 단건 add 는 §24.)
- **§13 ✅ `POST /reports/generate` 500 → 프론트 미사용으로 종결** (2026-06-04) — AI 초안 분기 프론트 완전 제거(`/reports/generate`는 redirect만). 백엔드엔 미사용 endpoint 정리(제거/410) 권고만 잔존.
- **§14 ✅ 현장 메모/사진 개별 삭제** (release 2026-06) — `DELETE /fields/:id/memos/:memoId`·`.../photos/:photoId` 204(디스크 객체 정리). 프론트 `removeTextMemo`/`removePhoto` 선반영.
- **§16 ✅ `GET /trips/:tripId` timeline[].fieldId 정식 포함** (2026-06-01, 라이브 검증 닫힘) — 운영이 이미 `fieldId` 실어보냄(전제 오류; QA 당시 mock 배포였던 것으로 추정). `syncFromTimeline` 그대로 동작.
- **§17 ✅ 더미 데이터 보강 → 프론트 자가 시드로 해결(백엔드 불요)** (2026-06-01) — `seed_demo_data.mjs` 로 현장·외근·방문·보고서 전·중·후 사진 생성. `field-reports` 외부 photo URL 저장·회수 확인.
- **§18 ✅ `POST /reports/from-trip/:tripId`** (release 2026-06 batch2) — `{title}`→`{reportId, fieldReports[]}`. `createWithVisitScaffold` from-trip 1콜 우선 + 404/405 폴백. 커밋 `df6fc2d`.
- **§20 ✅ 보고서 Word 위치도 — 네이티브 캡처→백엔드 임베드** (2026-06-19, 백엔드·프론트 완료+실기기 검증) — `POST /reports/:id/overview-photo`(sharp) + export/word 최상단 삽입 + `reports.overview_map_url`. 프론트 `react-native-view-shot` 캡처→업로드. 커밋 `5e5844b`·`2c48874`, `apk-v0.1.0-15`. (web 은 canvas-taint 로 위치도 없이 진행 — 실사용 아님.)
- **§21 ✅ `visits.reason`('기타' 사유) 영속·노출** (release 2026-06 batch1) — `status_reason` 영속 + 응답(`reason`)·timeline·recentVisits 노출. 프론트 4개 타입 `reason?` + 카드 '사유:' 표시. 커밋 `18414f6`·`bacdd47`.
- **§23 ✅ 처리방침·약관 정적 페이지 호스팅** (release 2026-06) — `GET /privacy`·`/terms` 200(Play Console 링크 해소). ⚠️ 잔여(코드 아님): 서빙 본문은 **초안** — 법적 문구 팀 작성·교체 필요.
- **§24 ✅ `POST /trips/:tripId/destinations` 진행 중 단건 추가** (release 2026-06-19) — `{fieldId, order?}`→Destination, 멱등·active-only(`409 already_ended_trip`). `destinationStore.add` 낙관적 temp→fire-and-forget. 커밋 `5e5844b`. probe 6/6 PASS.

---

## 변경 이력

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
