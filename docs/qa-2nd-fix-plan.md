# 2차 QA — 조치 가이드라인 (보고서 제외)

> **출처**: Notion "2차 QA" (2026-05-30 작성)
> **본 가이드라인 작성일**: 2026-05-30
> **대상 브랜치**: `fix/qa-fixes`
> **범위**: Notion 결과표 **1 ~ 12** 항목 + 기타(더미 데이터). 보고서 관련 13 ~ 17 은
> 양식 자체가 곧 크게 바뀌므로 **이번 사이클에선 보류**.

---

## 0. 작업 원칙 (이 사이클 한정)

- **프론트 우선·백엔드 뒤따름**. 새 필드/엔드포인트가 필요한 항목은 프론트에서
  optional 로 먼저 받아두고 [`docs/backend-backlog.md`](backend-backlog.md) 에 추가 요청 문서를 누적.
- **카카오 지도 단일 정책 준수**. 인앱 길찾기·지도·검색은 카카오 Geocoder /
  카카오맵 Web URL 만 사용. Daum 우편번호·구글맵·네이버맵 신규 도입 금지.
- **변경 단위 = 항목 단위 커밋**. Notion 표의 번호(1~12)와 커밋 제목 prefix 를
  1:1 매칭해 추적성 확보. 예: `fix(map): #1 본인 위치 중앙 표시`.
- **회귀 차단 위주의 좁은 수정**. 정리/리팩터 욕심 금지. 이미 동작하던 경로의
  staleness 만 수선.
- **체크박스 진행 추적**. 각 항목 §의 *Done 기준* 을 만족해야 완료.

---

## 1. 항목별 가이드라인

각 항목은 (a) **무엇이 잘못됐는가** (b) **무엇으로 고친다** (c) **건드릴 파일 후보**
(d) **Done 기준** 으로 구성. 코드 deep-dive 는 작업 직전 항목별로.

### #1. 지도 (공통) — 본인 위치가 중앙에 보여야 함

- **현 상태**: `KakaoMapWebView` 의 `DEFAULT_CENTER = { lat: 35.17, lng: 129.07 }`
  (부산 중심 고정). 사용자 현 위치 미반영, 마커 없음.
- **방향**:
  - `expo-location` `getCurrentPositionAsync` 로 1회 fetch → 권한 거부 시는
    기존 부산 중심 fallback 유지.
  - `KakaoMapWebView` 에 "내 위치" 마커(별도 shape — 형상/색/라벨 3중 인코딩 규약 유지)
    추가 + 초기 center 를 내 위치로 세팅.
  - `MapDashboard` 가 한 번 위치 fetch → `KakaoMapWebView` 에 `center` + `myLocation`
    prop 으로 내려보냄.
- **건드릴 파일 후보**:
  `src/components/MapDashboard.tsx`, `src/components/KakaoMapWebView.tsx`,
  `src/assets/kakaoMapHtml.ts`, (필요 시) `src/utils/geolocation.ts` 신규.
- **Done 기준**:
  - 지도 진입 시 본인 위치 마커가 중앙에 보임 (권한 허용 디바이스).
  - 권한 거부/오류 시 부산 중심 기본값으로 정상 fallback, 콘솔 silent 실패 X.
  - 외근 상세/진행 중 등 `scopeFieldIds` 가 좁혀진 화면에서도 "내 위치"는 그대로 노출.

---

### #2. 외근 탭 진입 시 — 시작 버튼이 즉시 보여야 함

- **현 상태**: `MapSheetLayout` 이 `useFocusEffect` 로 `initialIndex=2(92%)` 까지
  올리고 있고, `StickyBottomBar` 의 "외근 시작" 버튼이 시트 위에 떠 있음.
  실제로는 sheet 가 가려서 시작 CTA 가 안 보인다는 QA. 즉, **CTA 자체가 sheet 안에
  들어가 있어 스크롤 하단에 묻혀 있는 상태**.
- **방향**:
  - 외근 탭 루트(`app/(tabs)/trips/index.tsx`)의 sheet 안 EmptyState 의 CTA 는 유지,
    하지만 사이드 케이스 — `trips.length > 0` 인 사용자에서도 진입 시 사이드 효과 없이
    상단 CTA 가 보이도록 `StickyBottomBar` 의 z-stack/위치를 점검.
  - 추가로 sheet `initialIndex` 를 외근 탭 한정 `1(55%)` 로 낮춰서 지도 + CTA 가
    동시에 보이는 형태를 검토. (다른 화면 영향 없도록 prop 으로만 조정)
- **건드릴 파일 후보**:
  `app/(tabs)/trips/index.tsx`, `src/components/MapSheetLayout.tsx`,
  `src/components/ui/StickyBottomBar.tsx`.
- **Done 기준**:
  - 외근 탭 진입 시 "외근 시작" CTA 가 별도 스크롤 없이 즉시 보임.
  - 다른 탭(현장/보고서)의 sheet 정책에는 회귀 없음.

---

### #3. 외근 화면 지도 — 선택된 외근에 속한 현장만 표시

- **현 상태**: `MapSheetLayout` 의 `mapFieldIds` prop 으로 `active.tsx`·`[id].tsx`
  에서는 이미 스코프됨. 하지만 **외근 탭 루트(`trips/index.tsx`)** 는
  `mapFieldIds` 미전달 → `MapDashboard` 가 내 현장 전체를 깔아버림.
- **방향**:
  - 외근 탭 루트에서는 "지금 선택된 외근" 개념이 없으므로 **빈 배열**(`[]`) 또는
    가장 최근 외근의 destination 으로 좁힘.
  - 첫 진입(외근 기록 없음) 시는 `mapFieldIds={[]}` 로 마커 0개 — 의도된 빈 지도.
  - 카드를 탭하면 [id] 상세 진입 → 이미 그쪽은 스코프됨.
- **건드릴 파일 후보**:
  `app/(tabs)/trips/index.tsx`, `src/components/MapSheetLayout.tsx`,
  `src/components/MapDashboard.tsx`.
- **Done 기준**:
  - 외근 탭 루트에서는 외근에 속한 현장 외 마커가 보이지 않음.
  - **현장 탭** 에서는 종전대로 전체 현장 노출(이 변경의 의도된 비대칭).
  - 카드 탭 → 외근 상세 → 그 외근의 현장만 보이는 동선 유지.

---

### #4. 외근 / 외근 상세 — 지도에 방문 현장이 보여야 함

- **현 상태**: `active.tsx`·`[id].tsx` 는 `mapFieldIds={tripFieldIds}` 를 이미
  넘기지만, QA 단계에서 마커가 0개로 보임. 가능성:
  - `destinations.map((d) => d.fieldId)` 결과가 그 외근의 `field` 와 `userId` 가
    안 맞는 경우 `MapDashboard.myFields` 필터(`f.userId === userId`)에서 빠짐.
  - 백엔드 동기화 직후 `fieldStore.fields` 에 해당 현장이 아직 안 들어와 있을 가능성.
- **방향**:
  - `MapDashboard` 가 `scopeFieldIds` 일 때는 `userId` 필터를 우회(또는 `fieldStore`
    에서 직접 lookup) 하도록 조정.
  - 상세 진입 시 destinations 의 `fieldId` 별 `loadFieldDetail` 트리거(이미 일부
    구현). 누락 case 보강.
- **건드릴 파일 후보**:
  `src/components/MapDashboard.tsx`, `app/(tabs)/trips/[id].tsx`,
  `app/(tabs)/trips/active.tsx`.
- **Done 기준**:
  - 외근 상세 진입 시 그 외근의 방문 현장 마커가 지도에 노출.
  - 진행 중 외근(`active.tsx`) 도 동일.
  - `scopeFieldIds=[]` 인 경우는 0개 노출(의도된 빈 지도).

---

### #5. 외근 — 내역 삭제 기능

- **현 상태**: 외근 카드/상세 어디에도 삭제 액션 없음.
  `tripStore` API 명세 확인 필요(`tripsApi.deleteTrip` 유무).
- **방향**:
  - 외근 카드(or 상세) 에 휴지통 액션 + Confirm dialog.
  - 진행 중 외근(`activeTripId === id`) 은 삭제 차단(종료 후만 가능).
  - 백엔드 endpoint 가 없으면 `docs/backend-backlog.md` 에 정식 요청 추가, 프론트는
    UI/Store optimistic delete 로 선행. (단, 백엔드 미지원 시 dialog 에 "동기화 대기" 안내)
- **건드릴 파일 후보**:
  `app/(tabs)/trips/index.tsx`, `app/(tabs)/trips/[id].tsx`,
  `src/stores/tripStore.ts`, `src/api/trips.ts`,
  `docs/backend-backlog.md`.
- **Done 기준**:
  - 종료된 외근 카드(또는 상세)에서 삭제 가능. Confirm dialog 노출 후 실행.
  - 진행 중 외근 삭제 시도 시 명시적 거부(또는 액션 hidden).
  - 백엔드 endpoint 미존재 시 backlog 문서 추가 PR 동반.

---

### #6. 외근 / 외근 정리 — 현장 정보 초기 닫힘

- **현 상태**: `trips/[id].tsx` 에서 `<ReviewVisitCard initiallyExpanded={idx === 0} />` —
  첫 카드는 펼친 상태로 진입. QA 요구는 **전 카드 초기 닫힘**.
- **방향**:
  - `ReviewVisitCard` 의 `initiallyExpanded` 호출부 일괄 `false`.
  - 카드 헤더 탭으로 펼침 (이미 컴포넌트가 지원하면 그대로).
- **건드릴 파일 후보**:
  `app/(tabs)/trips/[id].tsx`, `src/components/trips/ReviewVisitCard.tsx` (확인용).
- **Done 기준**:
  - 외근 정리 진입 직후 모든 카드가 collapsed.
  - 카드 탭하면 펼침/접힘 토글 정상 동작.

---

### #7. 외근 시작 / 방문할 현장 선택 — 상단에 선택 요약

- **현 상태**: `trips/new/select.tsx` 의 head 에 `selectedIds.length/myFields.length`
  수치만 있고, **어떤 현장이 선택됐는지 못 봄**.
- **방향**:
  - head 영역에 선택된 현장의 mini chip 리스트(주소 축약). 좌→우 가로 스크롤.
  - chip 의 X 로 해제 가능.
  - chip row 가 비어있으면 hidden (현 화면 영향 없음).
- **건드릴 파일 후보**:
  `app/(tabs)/trips/new/select.tsx`, `src/components/ui/FilterChip.tsx` (재사용 검토).
- **Done 기준**:
  - 한 개라도 선택되면 상단에 선택 현장 chip 들이 노출.
  - chip 의 X 클릭으로 해제 가능, 카운트도 즉시 갱신.

---

### #8. 체크인 — 작업 전 / 중 / 후 사진 첨부 유도

- **현 상태**: `fields/[id]/checkin.tsx` 의 사진 슬롯 없음. 현재는 "메모·사진 추가"
  버튼 한 개로 현장 상세로 보냄(범용 첨부).
- **방향**:
  - 체크인 화면에 **3개의 명시적 슬롯** ("작업 전" / "작업 중" / "작업 후")
    추가. 슬롯 = 사진 1장 첨부 가능한 Pressable 카드.
  - 첨부된 사진은 기존 `directAttachments` 흐름으로 저장하되, `attachment.role`
    같은 optional 필드를 프론트에서만 부여(서버 미지원 시 클라이언트 메타로 유지)
    → 보고서가 재구성될 때 활용. (백엔드 backlog 에 정식 필드 요청 추가)
  - 사용자가 굳이 안 채워도 결과 저장은 가능 — 유도일 뿐 강제 X.
- **건드릴 파일 후보**:
  `app/(tabs)/fields/[id]/checkin.tsx`,
  (`src/components/checkin/PhotoSlot.tsx` 신규),
  `src/stores/fieldStore.ts` (`directAttachments`),
  `docs/backend-backlog.md`.
- **Done 기준**:
  - 체크인 진입 시 3개 슬롯이 명확히 라벨링되어 노출.
  - 각 슬롯 탭 → ImagePicker → 미리보기 + 삭제 가능.
  - 슬롯 사용 없이도 결과 저장 정상 동작 (회귀 없음).

---

### #9. 길찾기 — 인앱(카카오) 안내

- **현 상태**: `active.tsx` 의 `handleNavigate` 가 백엔드 deep-links 응답에서
  `kakao/naver/google` 중 `http` URL 을 골라 `Linking.openURL` → **외부 앱으로 이탈**.
  카카오맵이 깔려있지 않으면 안내 자체가 안 됨.
- **방향**:
  - 카카오 정책상 `https://map.kakao.com/link/to/...` web URL 은 인앱 WebView 로
    표시 가능. 신규 화면 `app/(tabs)/trips/navigate.tsx` (또는 modal) 도입:
    `<WebView source={{ uri: kakaoWebUrl }} />` 로 인앱 길안내.
  - 백엔드 응답 단순화 요청은 이미 backlog §1 에 등록됨 — 본 작업 도중 응답 shape
    이 바뀌지 않아도 프론트는 `kakaoWeb`/`kakao` http URL 단독 사용으로 동작.
  - `expo-linking` 의 외부 앱 호출은 **fallback** (예: WebView 로딩 실패 시).
- **건드릴 파일 후보**:
  `app/(tabs)/trips/active.tsx`, `app/(tabs)/trips/navigate.tsx` (신규),
  `src/utils/kakaoMap.ts`, `docs/backend-backlog.md` (응답 shape 확정 요청 명시).
- **Done 기준**:
  - "길찾기" 버튼 → 외부 앱 호출 없이 인앱에서 카카오 길안내 노출.
  - 카카오 web URL 직링크 폴백, 실패 시 명시적 에러 토스트.
  - 진행 중 외근 흐름(체크인/건너뛰기) 회귀 없음.

---

### #10. 외근 방문 여부 추적이 저장되지 않음

- **현 상태**: QA 표현 — "외근 방문 여부가 제대로 저장되지 않음". 가능성:
  - `handleSaveResult` 에서 `markDestinationArrived` 만 호출되고 `visitStore`
    동기화 누락 case.
  - 새로고침 / trip detail 재진입 시 `loadTripDetail` 이 `visitStore` 와 sync 못
    하는 경로.
- **방향**:
  - `tripStore.loadDetail` 응답 ↔ `visitStore.visits` mapping 검증. 누락 시
    visitStore 에 push.
  - `findDestination(activeTripId, fieldId)` 가 `arrived` 가 아닐 때 ⇒ visit 만
    찍히고 destination 상태가 남는 회로 차단.
  - 체크인 흐름 e2e 한번 재현 — visit / destination / trip 3축이 모두 동기.
- **건드릴 파일 후보**:
  `src/stores/visitStore.ts`, `src/stores/destinationStore.ts`,
  `src/stores/tripStore.ts`, `app/(tabs)/fields/[id]/checkin.tsx`.
- **Done 기준**:
  - 체크인 → 결과 저장 후 외근 상세에서 그 현장이 "방문" 카드로 노출.
  - 앱 재진입(새로고침) 후에도 동일.
  - destinations 상태(`arrived`) 도 정상 영속.

---

### #11. 현장 — 삭제 UX 개선

- **현 상태**: QA 표현 — "조건부 삭제 가능 및 ui 불편".
  진행 중 외근에 묶이거나 visit 이 있는 현장은 삭제 불가 → 사용자에게 사유가 안 보임.
- **방향**:
  - 현장 상세(`fields/[id]/index.tsx`) 또는 카드의 삭제 버튼 옆에 사유 hint
    ("외근에 포함된 현장은 삭제 불가" 등).
  - Confirm dialog 에 삭제 차단 reason 명시.
  - 조건부 삭제 가능 path 일 땐 1-click → confirm → 실행으로 단순화.
- **건드릴 파일 후보**:
  `app/(tabs)/fields/[id]/index.tsx`, `src/stores/fieldStore.ts`,
  `src/api/fields.ts` (응답 reason 활용).
- **Done 기준**:
  - 삭제 가능/불가 사유가 UI 에서 즉시 인지 가능.
  - 가능한 경우 confirm + 실행, 불가 시 차단 사유 노출.

---

### #12. 새 현장 — 지도 비콘 이동으로 위치 조정

- **현 상태**: `fields/new.tsx` 가 주소 검색만 지원. 좌표 미세 조정 불가.
- **방향**:
  - 주소 검색 결과의 좌표를 초기값으로, 작은 inline 지도(`KakaoMapWebView` 단일
    드래그 가능 핀 모드) 에서 핀을 드래그해 좌표 조정.
  - Kakao map html 에 `draggable: true` marker + `dragend` → React 로 좌표 emit.
  - 카카오 Geocoder 역지오코딩으로 새 좌표의 주소 fallback 노출.
- **건드릴 파일 후보**:
  `app/(tabs)/fields/new.tsx`, `src/components/KakaoMapWebView.tsx`,
  `src/assets/kakaoMapHtml.ts`, `src/utils/kakaoGeocoder.ts`.
- **Done 기준**:
  - 주소 검색 후 지도 핀 드래그로 위치 미세 조정 가능.
  - 조정된 좌표가 저장 시 반영, 역지오코딩 주소(있을 때) 미리보기 노출.
  - 모바일/웹 모두 핀 드래그 동작.

---

## 2. 기타 — 더미 데이터 정리 (백엔드 요청)

직접 코드 변경 없음. `docs/backend-backlog.md` 에 다음을 추가:

- **현장 더미** 50 ~ 100개 (사하구청 제공 엑셀 참고):
  - 같은 위치 그룹: 2 ~ 3개 (마커 그룹화 시연용).
  - 가까운 위치 그룹: 10개 이상 (히트맵 시연용).
- **외근 더미**:
  - 각 외근이 1 ~ 5개 현장 방문.
  - 90% 의 외근은 title 보유 (목록 가독성).

---

## 3. 보고서 — 이번 사이클 보류 (13 ~ 17)

근거: 보고서 양식 자체가 큰 폭으로 바뀔 예정. 양식 확정 전 작업은 매몰 비용.
2차 QA 의 13~17 항목은 양식 확정 이후 별도 사이클에서 일괄 재검토.

---

## 4. 작업 순서 (권고)

1. **#6** (단일 prop 토글) → **#2** (sheet/CTA 가시성) → **#3** (스코프) — 외근 탭 UX 라인 정리.
2. **#1** (지도 본인 위치) — 공통 인프라.
3. **#4** (외근 상세 마커) — #1·#3 위에서 자연스럽게 검증.
4. **#10** (방문 여부 영속) — store 흐름 디버깅, #4 와 종종 같은 코드 경로.
5. **#7** (선택 요약) → **#5** (외근 삭제) — 외근 시작/관리 흐름.
6. **#8** (체크인 사진 슬롯) — 신규 UI.
7. **#9** (인앱 길찾기) — WebView 도입.
8. **#11** (현장 삭제 UX) → **#12** (새 현장 핀 이동) — 현장 라인 마무리.
9. **기타** (백로그 추가) — 마지막에 한꺼번에 PR.

각 단위 끝마다 staged-only commit → push (`feedback_auto_push.md` 정책 준수).
커밋 메시지에 `Co-Authored-By` 트레일러 **금지** (`feedback_no_co_authored_by.md`).
