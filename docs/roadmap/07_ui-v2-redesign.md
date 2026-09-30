# UI v2 개편 — 디자이너 개선안 반영

> **상태**: 검토 (2026-09-30 계획 수립) — §7 결정 4건 대기
> **입력**: Figma `UI - 개선본` [`336:1078`](https://www.figma.com/design/MlfpDS0wOeN90iNl5JCPWp/%EC%9D%BC%EA%B0%80%EC%9A%94?node-id=336-1078) · [요구사항 명세 v2](../일가요-프론트엔드-요구사항-명세-v2.md)(디자이너 작성, 2026-09-25)
> **백로그**: §35~§40 (등재 예정, §4)
> **구현 스킬**: `.claude/skills/ui-v2/SKILL.md`

---

## 1. 이번 개편의 성격

**시각 개편이 아니라 흐름·기능 개편이다.** 개선본은 우리가 코드에서 조립한 `UI - 원본`(A트랙 24/24)을 디자이너가 고친 것이라 토큰·컴포넌트가 같다(`get_variable_defs` 결과가 `src/theme` 값과 일치). 바뀐 것은 다음 네 가지다.

| 축 | 내용 |
|---|---|
| 삭제 | 주간 통계, 외근 수정 화면, 현장 상세 메모·사진 편집, 방문 상세 추가 버튼, 보고서 목록 `보고서 작성`, 보고서 상세 하단 `수정`, 회원가입 `이미 계정이 있어요` |
| 신규 화면 | 방문 수정, 보고서 수정(전체 편집), 현장 보고 추가 |
| 신규 패턴 | 토스트, 액션 시트(`···`), 확인 대화상자, 인라인 제목 편집, 펼침 카드, 스와이프 삭제, 좌보조·우주행동 하단 바 |
| 규칙 | 방문 결과 `미정` 기본값, 체크인 입력 비강제, 방문 데이터 쓰기는 체크인·방문 수정만, 방문 삭제와 현장 삭제 분리 |

규모는 **57 프레임 / 라우트 약 25개 수정 / 신규 라우트 1~2개 / 공용 컴포넌트 7개 신설**이다.

---

## 2. 진실 출처 우선순위

1. **동작**: 명세 v2 > Figma 개선본 > 현재 코드. 단, 명세 §2.5(프로토타입과 실제 동작의 차이)는 "실제 앱" 열이 이긴다.
2. **값(색·간격·타이포)**: `src/theme` 이 원본이다. Figma 값이 토큰에 없으면 가장 가까운 토큰으로 스냅하고 hex 는 쓰지 않는다. 새 토큰이 정말 필요하면 `design-system.md` 에 먼저 추가한다.
3. **API 계약**: 운영 OpenAPI + 실측. 명세가 요구해도 서버가 없으면 §4 의 프론트 선조치로 간다(프론트 우선, 백엔드는 백로그).

---

## 3. 화면 대응표

프레임 id 는 모두 `470:` 접두어. 섹션: 인증 `4176` · 외근 `4277` · 현장 `4794` · 보고서 `5050` · 내 정보 `5516` · 상태 화면 `5618`.

| 프레임 | 라우트 | 변경 | 명세 ID |
|---|---|---|---|
| 로그인 `4177` · 오류 `4191` | `(auth)/login` | 경미 | FE-AUTH-01 |
| 회원가입 `4205` · 오류 `4240` | `(auth)/signup` | 헤더 `←`, 하단 링크 삭제 | FE-AUTH-02·03 |
| 외근 내역 `4339` (+빈·로딩·오프라인·토스트 `5619` `5642` `5667` `5697`) | `trips/index` | 주간 통계 삭제 | FE-OUT-01 |
| 현장 선택 `4305` | `trips/new/select` | 경미 | FE-OUT-02 |
| 방문 순서 확인 `4476` | `trips/new/order` | ▲▼ 에 거리·ETA 재계산, 삭제(×) 버튼 제거 | FE-OUT-03·03a |
| 진행 중 외근 `4439` (+더보기 `5727` · 전체 완료 `5773` · 저장 안내 `6501`) | `trips/active` | CTA 를 길찾기·체크인으로 축소, `···` 시트, % 와 경과시간 제거, `미정` 표기 | FE-OUT-04~07·09 |
| 인앱 길안내 `4728` | `trips/navigate` | 없음 | FE-OUT-08 |
| 방문 상세 `4278` | `trips/visit` | 읽기 전용, 시트 높이를 내용에 맞춤 | FE-VIS-01~03 |
| 외근 정리 `4368` (+펼침 `6106` · 스와이프 `6189` · 제목 수정 `6263`) | `trips/[id]` | 펼침, 스와이프, 인라인 제목, 편집 아이콘 제거 | FE-WRAP-01~05 |
| 방문 수정 `4738` | **신규** `trips/[id]/visits/[visitId]` | 체크인과 같은 폼 + 방문 삭제 | FE-VED-01~05 |
| — | `trips/[id]/edit` (외근 수정) | **삭제** | 명세 §0 |
| 체크인 `4828` | `fields/[id]/checkin` | 메모, 비강제, `보고서 작성` 분기, 하단 바 | FE-CHK-01~07 |
| 현장 목록 `4921` (+등록 안내 `6539`) | `fields/index` | 하단 바 `새 현장`·`촬영`, 등록 토스트 | FE-SITE-01·01a |
| 현장 등록 `4884` | `fields/new` | 저장 후 목록 + 토스트 | FE-SITE-01a·07 |
| 현장 상세 `4968` (+더보기 `5801`) | `fields/[id]` | 메모·사진 읽기 전용, `···` 시트, 상태 칩 | FE-SITE-02~06·09 |
| 현장 수정 `5021` | `fields/[id]/edit` | 삭제 버튼 이동(→ 상세 `···`) | FE-SITE-06·07 |
| 카테고리 관리 `4795` | `fields/categories` | 경미 | FE-SITE-08 |
| 보고서 목록 `5213` | `reports/index` | `보고서 작성` 버튼 삭제 | FE-RPT-01 |
| 보고서 작성 `5051` | `reports/new` | 모달 → 푸시, 체크인 방문만, ▲▼ | FE-RPT-02·02a·10 |
| 현장 보고 작성 `5334` · 2/3 `5442` · 마지막 `5371` (+더보기 `6020` · 사진 `6062`) | `reports/[id]/field-report` | `나중에 다시 작성`, `나중에 채우기`, 사진 시트 | FE-RPT-03~05·11·12 |
| 현장 보고 추가 `5479` (+현장 선택 `6736`) | `reports/[id]/field-report?mode=add` | 빈 양식 + 현장 선택 시트 | FE-RPT-06 |
| 보고서 상세 `5259` (+더보기 `5858` · 내보내기 `5938` · 미작성 경고 `6410` · 제목 수정 `6779`) | `reports/[id]` | 인라인 제목, `···`, 미작성 배지, 내보내기 시트·경고 | FE-RPT-06·07·08a·09·13·14 |
| 보고서 수정 `5408` (+사진 `6587` · 현장 선택 `6628` · 예시 `6668` `6702`) | `reports/[id]/edit` | **제목만 → 현장별 사진·설명 전체 편집** | FE-RPT-07·08 |
| 내 정보 홈 `5517` · 수정 `5554` · 계정 삭제 `5577` | `profile/*` | 경미 | FE-ME-01~03 |

---

## 4. 백엔드 계약 대조 — 막히는 곳

운영 OpenAPI(2026-09-30)와 `src/api` 를 대조했다. **명세 v2 는 방문 단위 첨부를 전제하는데 ERD v2 는 메모·사진이 현장 전용이다**(`src/types/entities.ts:104,115`). 이것이 가장 큰 차단점이다.

| # | 명세 요구 | 현재 서버 | 프론트 선조치 | 백로그 |
|---|---|---|---|---|
| A | 방문별 메모·사진(체크인 쓰기, 방문 수정 편집, 방문 삭제 시 함께 사라짐) | `memos`·`field_photos` 에 visit FK 없음 | 체크인 메모·사진은 현장 첨부로 저장(명세 수락 기준 6 충족). 방문 수정의 첨부 편집과 "방문 삭제 시 첨부 삭제"는 **대기** | §35 `visit_id` FK + `GET /visits/:id` 첨부 포함 |
| B | 방문 삭제 | `DELETE /api/visits/:id` 없음 | 스와이프·`방문 삭제` UI 는 만들고 호출부는 비활성 + 안내 | §36 |
| C | 결과 `미정` 기본값 | status enum 6종, 체크인 즉시 visit 생성 | 체크인에서 상태를 고르지 않으면 `setStatus` 를 부르지 않는다. 방문 없는 목적지(건너뜀·미방문)는 프론트에서 `미정`으로 파생 | §37 status nullable(`undecided`) |
| D | `기타` 사유 비강제 | `other` 는 사유 10자 필수 | `기타`에서 사유 칸을 선택 입력으로 바꾸되, 10자 미만이면 서버 거절 → 안내. 서버 완화 요청 | §37 에 포함 |
| E | 보고서 현장 순서 ▲▼, 체크인 방문만 | `from-trip` body 가 `title` 만 받음, `FieldReport` 에 순서 필드 없음 | `POST /reports` + `addFieldReport` 를 원하는 순서로 반복 호출해 스캐폴드(생성 순서 = 표시 순서인지 실측 필요) | §38 `from-trip` 에 `fieldIds[]`, `FieldReport.order` |
| F | 보고서에 반영된 방문은 삭제 차단 | `FieldReport` 에 `visitId` 없음 | 같은 외근의 보고서에 같은 `fieldId` 현장 보고가 있으면 차단(근사치) | §39 409 가드를 서버에서 |
| G | 진행 중 외근에 포함된 현장은 삭제 차단 | 미확인 | 활성 외근 목적지와 대조해 프론트에서 차단 | §40 서버 409(방어) |

체크인 동작도 바꿔야 한다. 지금은 **화면 진입 시 visit 을 자동 생성**한다(`fields/[id]/checkin.tsx:111`). 명세 FE-CHK-01 은 "뒤로가기 = 저장 안 함"이므로 visit 생성을 `체크인 완료` 시점으로 옮긴다.

---

## 5. 기술 결정 (웹 조사 반영)

| 패턴 | 결정 | 근거 |
|---|---|---|
| 토스트 | **직접 구현** (`ui/Toast` + `toast()` 전역 함수, reanimated, 2초) | `react-native-toast-message` 는 Expo 54 에서 미표시(#583). `sonner-native` 는 `react-native-svg` 가 새로 필요하고 웹은 별도 라이브러리로 분기해야 한다. 쓰는 곳은 3곳이다 |
| 액션 시트·확인 대화상자 | **직접 구현** (RN `Modal` transparent + 스크림 `Pressable` + reanimated 슬라이드) | gorhom `BottomSheetModal` + dynamic sizing 회귀(#2710, 5.2.10 = 현재 버전). 웹·Fabric 에서 가장 예측 가능. 기존 `promptChoice`·`WebChoiceModalHost`(미마운트) 를 흡수한다 |
| 스와이프 삭제 | **스파이크 후 결정** (§6 S1) | RNGH `ReanimatedSwipeable` 이 Expo 54 / RN 0.81 / RNGH 2.28 / Reanimated 4.1 / Fabric / iOS 에서 즉시 크래시하는 이슈가 열려 있다(#3720). 외근 정리는 gorhom 시트 안 `BottomSheetScrollView` 라 가로 제스처 충돌(#1300)도 있다. 스와이프는 `방문 수정 → 방문 삭제` 의 단축 동작이라 대체 경로가 이미 있다 |
| 펼침 카드 | reanimated 측정 + `withTiming(height)`, 셰브론은 회전 트랜지션. 형제 이동은 `LinearTransition`(spring 금지 — 웹 미지원) | Reanimated 공식 accordion 예제 |
| ▲▼ 재정렬 | 기존 `order.tsx` 패턴을 `ReorderButtons` 로 추출 + `LinearTransition` + a11y **custom action**(`moveUp`/`moveDown`) | `increment`/`decrement` 는 adjustable 전용 의미라 부적합 |
| 인라인 제목 | `EditableTitle` — `TextInput` + 직접 만든 지우기 버튼(`clearButtonMode` 는 iOS 전용) + `완료`. blur·submit 시 저장, 빈 값이면 복원 | 키보드 컨트롤러 도입은 하지 않는다(웹 미지원 + 네이티브 의존성 추가). 필요해지면 그때 |
| 하단 바 | `StickyBottomBar` 확장: `secondary`(좌, 내용 폭) + `primary`(우, 나머지) 슬롯 | 명세 §1.2. 시트 **밖** 마운트 규칙 유지(gorhom 이 터치를 가로챈다) |
| 기능 플래그 | **쓰지 않는다** | `main`=스테이징, `release`=운영 분리가 이미 있다. 구·신 병행 유지비가 이득보다 크다 |
| 시각 회귀 | 화면마다 로컬 웹(8081) 렌더 ↔ Figma 스크린샷 수동 대조. 자동 VRT(Playwright `toHaveScreenshot`)는 Phase 5 에서 선택 | 지도·시트 화면이라 스냅샷이 불안정하다. 비용 대비 효과는 수락 기준 E2E 가 크다 |

조사 출처는 이 문서 끝 §9.

---

## 6. 단계

각 단계는 독립 커밋·푸시 단위다. **release 머지는 단계마다 사용자 웹 확인 후**에 한다.

### Phase 0 — 준비 (코드 변경 없음)
- [ ] §7 결정 4건 확정
- [ ] 백로그 §35~§40 등재
- [ ] **S1 스와이프 스파이크** — 실기기(Expo Go) 에서 `ReanimatedSwipeable` 을 `BottomSheetScrollView` 안에 두고 크래시·제스처 충돌을 확인한다. 실패하면 `Gesture.Pan` 직접 구현을 한 번 더 시도하고, 그것도 안 되면 §7-D2 대안으로 간다
- [ ] **S2 보고서 스캐폴드 실측** — `addFieldReport` 호출 순서가 조회 순서로 유지되는지 확인(§4-E)

### Phase 1 — 공용 컴포넌트
`Toast` · `ActionSheet` · `ConfirmDialog` · `EditableTitle` · `ReorderButtons` · `ExpandableCard` · `StickyBottomBar`(좌우 슬롯) · `VisitResultChips`(체크인·방문 수정 공용) · 방문 상태 `미정` 배지(`statusBadge.ts`).
`SwipeRow` 는 S1 결과에 따라 만든다. `ReviewVisitCard` 의 중복 `VISIT_SHAPE` 는 이 단계에서 걷어낸다.

### Phase 2 — 외근
외근 내역 → 진행 중 외근 → 체크인 → 방문 상세 → 외근 정리 → 방문 수정(신규) → 방문 순서 확인. 외근 수정 화면 삭제.
**가장 크고 백엔드 의존이 몰려 있다**(§4 A·B·C·D). 서버가 준비되지 않은 부분은 UI 만 만들고 비활성 처리한다.

### Phase 3 — 현장
현장 상세(읽기 전용 + `···`) → 현장 등록(토스트) → 현장 수정 → 현장 목록(하단 바). 삭제 가드(§4-G).

### Phase 4 — 보고서
보고서 작성(푸시, ▲▼) → 현장 보고 마법사(`나중에 다시 작성`, `나중에 채우기`) → 보고서 상세(인라인 제목, 미작성, 내보내기 시트·경고) → 보고서 수정(전체 편집) → 현장 보고 추가.

### Phase 5 — 인증·내 정보·검증
회원가입 헤더, 내 정보 경미 변경. 명세 §10 **수락 기준 19개**를 `qa-runner.mjs` 시나리오로 옮겨 웹에서 돌린다. 네이티브는 Expo Go 수동 확인.

---

## 7. 결정 필요

| # | 질문 | 권고 |
|---|---|---|
| D1 | 방문 단위 첨부(§4-A)는 ERD 변경이다. 백엔드를 기다릴지, 현장 첨부로 먼저 갈지 | **현장 첨부로 먼저 간다.** 체크인 메모·사진 → 현장 상세 반영은 지금 API 로 된다. 방문 수정의 첨부 편집만 서버 대기 |
| D2 | 스와이프가 스파이크에서 실패하면 | 펼친 영역에 `방문 수정`과 함께 **`삭제` 텍스트 버튼**을 둔다(디자이너 확인 필요) |
| D3 | 방문 수정 라우트를 신규로 만들지, 체크인 화면을 `mode=edit` 로 재사용할지 | **체크인 화면 재사용**(명세 FE-VED-01 "체크인과 같은 구성"). 라우트는 분리하되 폼 컴포넌트를 공유 |
| D4 | Phase 2~4 를 병렬 워크트리로 나눌지 | 공용 컴포넌트(Phase 1) 이후에는 탭별로 파일이 거의 안 겹친다. **Phase 1 을 main 에서 끝낸 뒤 2·3·4 를 병렬**로 |

---

## 8. 위험

- **gorhom 시트 높이·스크롤 함정**(메모리: Fabric + reanimated 4 에서 height 미적용). 펼침 카드가 시트 안에서 높이를 바꾸므로 `MapSheetLayout` 의 명시 height 우회가 깨지지 않는지 실기기로 확인한다.
- **명세와 기존 결정의 충돌**: 체크인 `기타` 사유 10자 규칙, 체크인 자동 visit 생성은 과거 결정이다. 문서화된 이유가 없으면 명세를 따른다(메모리: 외부 규칙 도입 시 현재 코드를 결정으로 굳히지 말 것).
- **삭제되는 화면의 딥링크**: `trips/[id]/edit` 로 가는 경로가 남지 않았는지 전수 grep(`head` 금지).

---

## 9. 조사 출처

- 점진 전환: [Shopify RN 마이그레이션](https://shopify.engineering/migrating-our-largest-mobile-app-to-react-native) · [Toss 컬러 시스템 교체](https://toss.tech/article/tds-color-system-update) · [Toss 디자인 시스템 재고](https://toss.tech/article/rethinking-design-system)
- Figma MCP: [도구·프롬프트](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/) · [mcp-server-guide](https://github.com/figma/mcp-server-guide) · [Variables REST 는 Enterprise 전용](https://developers.figma.com/docs/rest-api/variables-endpoints)
- 스와이프: [ReanimatedSwipeable](https://docs.swmansion.com/react-native-gesture-handler/docs/components/reanimated_swipeable/) · [RNGH #3720](https://github.com/software-mansion/react-native-gesture-handler/issues/3720) · [#3481](https://github.com/software-mansion/react-native-gesture-handler/issues/3481) · [gorhom #1300](https://github.com/gorhom/react-native-bottom-sheet/issues/1300)
- 펼침·재정렬: [Reanimated accordion](https://docs.swmansion.com/react-native-reanimated/examples/accordion/) · [layout transitions](https://docs.swmansion.com/react-native-reanimated/docs/layout-animations/layout-transitions/) · [RN accessibility actions](https://reactnative.dev/docs/accessibility)
- 토스트: [toast-message #583](https://github.com/calintamas/react-native-toast-message/issues/583) · [sonner-native](https://github.com/gunnartorfis/sonner-native-toasts)
- 시트: [gorhom releases](https://github.com/gorhom/react-native-bottom-sheet/releases) · [gorhom #2710](https://github.com/gorhom/react-native-bottom-sheet/issues/2710) · [expo-router modals](https://docs.expo.dev/router/advanced/modals/)
- 하단 바·대화상자: [TDS BottomCTA](https://tossmini-docs.toss.im/tds-mobile/components/BottomCTA/fixed-bottom-cta/) · [TDS ConfirmDialog](https://tossmini-docs.toss.im/tds-mobile/components/Dialog/confirm-dialog/) · [Expo 키보드 가이드](https://docs.expo.dev/guides/keyboard-handling/)
