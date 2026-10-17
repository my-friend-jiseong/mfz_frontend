# UI v2 개편 — 디자이너 개선안 반영

> **상태**: 구현 완료·검증 대기 (2026-09-30) — Phase 0~5 main 반영. **release 머지 전 사용자 확인 필요**(§10 ⏳)
> **입력**: Figma `UI - 개선본` [`336:1078`](https://www.figma.com/design/MlfpDS0wOeN90iNl5JCPWp/%EC%9D%BC%EA%B0%80%EC%9A%94?node-id=336-1078) · [요구사항 명세 v2](../일가요-프론트엔드-요구사항-명세-v2.md)(디자이너 작성, 2026-09-25)
> **백로그**: §35~§40 (§4)
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

| # | 명세 요구 | 현재 서버 (2026-09-30 실측) | 프론트 선조치 | 백로그 |
|---|---|---|---|---|
| A | 방문별 메모·사진 | **사진은 있다**(`POST /visits/:id/photos`, 방문 상세 `photos[]`). 메모·첨부 삭제·메모 수정은 없다. 현장 상세에 방문 사진이 안 들어온다 | 사진은 방문 사진 API. 메모는 현장 메모 API(최신 메모 불러와 삭제+재생성). 현장 상세 사진은 `recentVisits` 방문 사진을 합친다. 방문 수정에서 사진 제거는 숨긴다 | §35 |
| B | 방문 삭제 | `DELETE /visits/:id` 404 | UI 는 만들고 404 면 "아직 지원되지 않습니다" 안내 | §36 |
| C | 결과 `미정` | 체크인이 방문을 `completed` 로 생성 | `미정` = **방문이 없는 목적지**(미방문·건너뜀)로 프론트 파생. 체크인에서 상태를 안 고르면 서버 기본값(완료) | §37 참고 |
| D | `기타` 사유 비강제 | 사유 10자 미만이면 400 | 사유 칸 선택 입력 + 서버 거절 문구 안내 | §37 |
| E | 보고서 현장 순서 | `from-trip` 이 `fieldIds` 무시. 단 현장 보고는 **생성 순으로 조회**된다 | 빈 보고서 + 현장 보고 순차 생성. 서버 변경 불필요 | §38 🟢 |
| F | 보고서에 반영된 방문 삭제 차단 | `FieldReport` 에 `visitId` 없음 | 같은 외근 보고서에 같은 `fieldId` 현장 보고가 있으면 차단(근사) | §39 |
| G | 현장 삭제 | 방문 이력 있으면 **무조건 409 `has_related_visits`** | 진행 중 외근 목적지면 프론트 선차단. 409 는 안내 | §40 |

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
- [x] §7 결정 4건 확정 — 권고안대로 (2026-09-30)
- [x] 백로그 §35~§40 등재 (실측 기반, 2026-09-30)
- [ ] **S1 스와이프 스파이크** — ⏳ 실기기 확인은 사용자 몫. 그 전까지 `ReanimatedSwipeable`(#3720) 대신 `Gesture.Pan` 직접 구현으로 웹 검증까지 하고, 스와이프는 `방문 수정 → 방문 삭제` 의 단축 동작으로만 둔다.
- [x] **S2 보고서 스캐폴드 실측** — 생성 순 = 조회 순 확인 (§4-E)

### Phase 1 — 공용 컴포넌트 ✅ `8c9cabb`
`Toast` · `ActionSheet` · `ConfirmDialog` · `EditableTitle` · `ReorderButtons` · `ExpandableCard` · `StickyBottomBar`(좌우 슬롯) · `VisitResultChips`(체크인·방문 수정 공용) · 방문 상태 `미정` 배지(`statusBadge.ts`).
`SwipeRow` 는 S1 결과에 따라 만든다. `ReviewVisitCard` 의 중복 `VISIT_SHAPE` 는 이 단계에서 걷어낸다.

### Phase 2 — 외근 ✅ `3080348`
외근 내역 → 진행 중 외근 → 체크인 → 방문 상세 → 외근 정리 → 방문 수정(신규) → 방문 순서 확인. 외근 수정 화면 삭제.
**가장 크고 백엔드 의존이 몰려 있다**(§4 A·B·C·D). 서버가 준비되지 않은 부분은 UI 만 만들고 비활성 처리한다.

### Phase 3 — 현장 ✅ `68bcedc`
현장 상세(읽기 전용 + `···`) → 현장 등록(토스트) → 현장 수정 → 현장 목록(하단 바). 삭제 가드(§4-G).

### Phase 4 — 보고서 ✅ `a0f0e36`
보고서 작성(푸시, ▲▼) → 현장 보고 마법사(`나중에 다시 작성`, `나중에 채우기`) → 보고서 상세(인라인 제목, 미작성, 내보내기 시트·경고) → 보고서 수정(전체 편집) → 현장 보고 추가.

### Phase 5 — 인증·내 정보·검증 ✅ (§10)
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

## 10. 수락 기준 검증 (명세 §10, 2026-09-30)

웹(8081, iframe 390×844) + 더미계정 `demo3` 로 확인. ⏳ 는 사람이 확인해야 하거나 서버가 필요한 것.

| # | 기준 | 결과 |
|---|---|---|
| 1 | 진행 중 외근 첫 화면엔 길찾기·체크인만 | ✅ 예외 동작은 `···` 시트 |
| 2 | 보고서 상세 카드에 수정·삭제 버튼 없음, 하단 `수정` 없음 | ✅ 카드 `›` → 보고서 수정 |
| 3 | 체크인·카테고리·현장 등록·내 정보 수정·회원가입에서 뒤로가기 | ✅ 체크인·회원가입(NavHeader) / 나머지는 기존 헤더 유지 |
| 4 | 탭 루트에 뒤로가기 없음 | ✅ 탭바도 루트에서만(§2.1) |
| 5 | 현장·방문 상세에 메모·사진 편집 없음 | ✅ |
| 6 | 체크인 메모가 현장 상세에 보임 | ✅ 현장 메모로 저장(§4-A) |
| 7 | 체크인 없이 건너뛴 방문 = 미정 | ✅ `건너뜀 · 미정` 배지 |
| 8 | 아무것도 입력 안 해도 체크인 완료 | ✅ 단 `기타` 를 고르면 사유 10자(서버 규칙, §37) |
| 9 | 방문 삭제 후 현장은 남고 첨부만 사라짐 | ⏳ 서버에 방문 삭제 API 없음(§36) — UI 는 "아직 지원되지 않습니다" |
| 10 | 보고서 수정에서 사진·설명 변경 | ✅ 사진 제거·설명 비우기도 null 로 반영 |
| 11 | 외근 내역에 주간 통계 없음 | ✅ |
| 12 | 외근 정리 제목 인라인 수정 · 방문 수정은 펼친 카드에서 | ✅ |
| 13 | 보고서 반영 방문·진행 중 외근 현장 삭제 차단 | ✅ 방문(근사, §39) · 현장(목적지 대조) + 방문 이력 현장도 서버가 차단(§40) |
| 14 | 보고서에 건너뛴 방문 없음 | ✅ 체크인한 방문만 |
| 15 | 나중에 채우기 한 현장은 상세에 `미작성` | ✅ |
| 16 | 미작성 있으면 내보내기 확인, 동의 시 빈칸 | ✅ 대화상자 / ⏳ 빈칸 출력은 서버 문서 생성 결과 확인 필요 |
| 17 | 순서 확인·보고서 작성의 ▲▼ 가 순서에 반영 | ✅ 보고서는 순차 생성으로(§38) |
| 18 | 체크인 `보고서 작성` 분기 | ✅ 보고서 없음 → 작성 확인 / 있음 → 현장 보고(코드 경로, 웹 미확인) |
| 19 | 보고서 목록에 `보고서 작성` 없음 | ✅ |

### 남은 확인 (사용자)

- ⏳ **실기기(Expo Go)**: 스와이프 삭제(웹만 확인 — Pan 직접 구현이라 #3720 경로는 피했다), 액션 시트→이미지 피커 연쇄(iOS 350ms 지연), 55% 시트 하단 여백(`useSheetBottomInset`).
- ⏳ 명세 밖 판단 3건 — 디자이너 확인 권장: ① 진행 중 외근 `···` 에 '남은 순서 다시 추천' 추가(기존 기능 보존), ② 건너뛰기에 확인 대화상자 추가, ③ 외근 삭제 기능이 외근 수정 화면과 함께 사라졌다(명세에 대체 경로 없음).

## 11. 실기기 테스트 (release 머지 전)

**목적**: 웹에서 확인할 수 없는 네이티브 경로 — Fabric·제스처·모달 연쇄·키보드·safe area — 만 본다.
웹에서 이미 통과한 흐름(§10)은 다시 하지 않고 "죽지 않는가·가려지지 않는가" 만 짧게 훑는다.

**방법**: Android 폰 USB 연결 → `adb reverse tcp:8081 tcp:8081` → Expo Go 로 `exp://127.0.0.1:8081`.
에이전트가 `adb exec-out screencap` 으로 보고 `adb shell input tap/swipe/text` 로 조작한다.
크래시는 `adb logcat` 의 `AndroidRuntime`·`ReactNativeJS` 로 잡는다(무음 Fabric 크래시 전례).
데이터는 더미 계정 `demo3` — 필요한 상태(진행 중 외근·미작성 보고서)는 API 로 먼저 만든다.
사진 선택(카메라·앨범)처럼 OS UI 를 거치는 단계는 사용자가 폰에서 누른다.

| # | 위험 | 화면 · 조작 | 통과 기준 |
|---|---|---|---|
| D1 | RNGH·Reanimated 스와이프(Fabric) | 외근 정리 → 방문 카드 왼쪽 스와이프 → `삭제` | 크래시 없음, 스와이프 후 카드가 펼쳐지지 않음, 차단/미지원 안내 |
| D2 | 시트 안 세로 스크롤 vs 가로 스와이프 | 같은 목록을 위아래로 스크롤 | 스크롤이 스와이프로 오인되지 않음 |
| D3 | 펼침으로 시트 콘텐츠 높이 변화 | 카드 여러 개 펼친 뒤 끝까지 스크롤 | 마지막 카드·하단 바 가림 없음 |
| D4 | 55% 시트 하단 여백 | 진행 중 외근 끝(외근 종료), 방문 순서 확인 끝, 보고서 상세 마지막 카드 | 끝까지 스크롤되고 가려지지 않음 |
| D5 | 액션 시트 → 모달 연쇄 | 진행 중 외근 `···` → 건너뛰기(확인 대화상자), 보고서 상세 `···` → 삭제 확인 | 두 번째 모달이 뜬다 |
| D6 | 액션 시트 → 이미지 피커 | 현장 보고 `사진 추가` → 앨범에서 선택 | 피커가 열리고 업로드 반영 |
| D7 | 체크인 사진·메모 저장 | 체크인 사진 1장 + 메모 → 체크인 완료 → 외근 정리 펼침 | 방문 사진·메모 표시, 토스트 |
| D8 | 키보드 + 하단 바 | 체크인·방문 수정 메모 입력 | 입력칸·버튼이 키보드에 가리지 않음 |
| D9 | 인라인 제목 | 외근 정리 제목 탭 → 수정 → 키보드 완료 | 저장·복원 동작 |
| D10 | Android 뒤로가기 | 액션 시트·확인 대화상자 열린 상태에서 하드웨어 back | 창만 닫힘(화면 이탈 없음) |
| D11 | 탭바 표시 전환 | 탭 루트 ↔ 푸시 화면 왕복 | 루트에서만 탭바, 전환 시 깜빡임·레이아웃 튐 없음 |
| D12 | safe area·토스트 위치 | 체크인 완료 토스트, 현장 등록 토스트 | 제스처 바·하단 바와 겹치지 않음 |
| D13 | 로그인 직후 크래시 회귀 | 로그아웃 → 로그인 | 앱 유지(Fabric 전례) |
| D14 | PDF 내보내기 | 보고서 상세 → 내보내기 → PDF | 외부 앱/브라우저로 열림 |

iOS 전용 경로(액션 시트 뒤 350ms 지연, `clearButtonMode`)는 Android 로 확인할 수 없다 — iPhone 이 있으면 D5·D6·D10 만 다시 본다.

### 11.1 결과 — Android 에뮬레이터 (2026-09-30)

환경: AVD `ilgayo_test` (Pixel 7, Android 15 / API 35, google_apis x86_64, WHPX) + Expo Go(SDK 54) · `adb` 로 조작, `logcat` 로 크래시 감시. 전 과정 크래시 0.

| # | 결과 | 비고 |
|---|---|---|
| D1 | ✅ | 스와이프 → 삭제 노출, 카드 안 펼쳐짐, 보고서 반영 방문 차단 안내 |
| D2 | ✅ | 카드 위 세로 밀기 = 스크롤 |
| D3 | ✅ | 펼친 뒤에도 끝까지 스크롤, 하단 바 가림 없음 |
| D4 | ✅ | Android 는 목록을 밀면 시트가 먼저 최대로 올라간 뒤 스크롤 — 외근 종료까지 닿음. 최대 높이에서 목록 아래가 빈다(알려진 타협) |
| D5 | ✅ | 시트 → 확인 대화상자, 대화상자 → 형식 시트 양방향 연쇄 |
| D6 | ✅ | 사진 시트 → 앨범(Photo Picker) → 슬롯 업로드 201 → 서버 URL 미리보기 |
| D7 | ✅ | 체크인 완료 = check-in → status → 방문 사진 → 메모 순서로 성공, 토스트 |
| D8 | ❌→✅ | **키보드가 메모 칸·하단 바를 가림** → `KeyboardAvoid` 로 수정 후 통과 |
| D9 | ✅ | 제목 인라인 수정 → 키보드 완료 키로 저장 |
| D10 | ✅ | 하드웨어 back 이 시트·대화상자만 닫음 |
| D11 | ✅ | 탭 루트에서만 탭바 |
| D12 | ✅ | 토스트가 제스처 바와 겹치지 않음 |
| D13 | ✅ | 로그인 직후 크래시 없음 |
| D14 | ✅ | PDF 생성 → Chrome 으로 열림 |

**실기기에서만 드러나 고친 것 (5건)**

1. **Android 키보드가 폼을 가림** — SDK 54 Android 는 edge-to-edge 라 창이 줄지 않는데 `KeyboardAvoidingView` 를 Android 에서 `behavior=undefined` 로 두고 있었다. 10개 폼 화면 전부(로그인·회원가입·현장 등록/수정·내 정보 수정·계정 삭제 포함, **v2 이전부터의 결함**). `ui/KeyboardAvoid` 로 교체 — Android 는 Reanimated `useAnimatedKeyboard`(translucent 옵션)로 키보드 높이를 매 프레임 따라간다. Keyboard 이벤트 방식은 리뷰에서 내비게이션 바 높이 누락·높이 변화 미반영으로 걸려 바꿨다.
2. **상단 이중 여백 두 종류(기존 결함)** — ① 외근 배너 아래: 네이티브 `SafeAreaView` 가 배너 규칙(provider top=0)을 무시하고 inset 을 또 더했다 → provider top 이 0 이면 top edge 를 뺀다. ② 네이티브 스택 헤더 아래(현장 수정·내 정보 수정·회원 탈퇴): 헤더가 이미 status bar 를 덮는데 `SafeScreen` 이 또 둘렀다(배너 없을 때 ~110px) → 그 화면들은 `edges={[]}`.
3. **체크인에서 뒤로 나갔다 오면 저장 안 한 입력이 남음** — 현장 탭 스택에 머물러 언마운트되지 않았다. 방문을 만들기 전이면 blur 시 비우고 기존 메모만 다시 채운다(FE-CHK-01·04). 리뷰 후속: 완료했거나 다른 외근에서 만든 방문이면 다음 포커스에서 새 세션으로(이전 외근 방문에 덮어쓰던 여지), 저장 중엔 비우지 않음.
4. **스와이프 삭제 영역이 카드 둥근 모서리로 비침** — 닫혀 있을 땐 투명.
5. **시트·대화상자 딤이 상태바를 덮지 않음** — `Modal statusBarTranslucent`.

남은 것: iOS 실기기(D5·D6·D10), 카메라 촬영 경로(에뮬레이터에선 앨범으로 대체).

## 9. 조사 출처

- 점진 전환: [Shopify RN 마이그레이션](https://shopify.engineering/migrating-our-largest-mobile-app-to-react-native) · [Toss 컬러 시스템 교체](https://toss.tech/article/tds-color-system-update) · [Toss 디자인 시스템 재고](https://toss.tech/article/rethinking-design-system)
- Figma MCP: [도구·프롬프트](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/) · [mcp-server-guide](https://github.com/figma/mcp-server-guide) · [Variables REST 는 Enterprise 전용](https://developers.figma.com/docs/rest-api/variables-endpoints)
- 스와이프: [ReanimatedSwipeable](https://docs.swmansion.com/react-native-gesture-handler/docs/components/reanimated_swipeable/) · [RNGH #3720](https://github.com/software-mansion/react-native-gesture-handler/issues/3720) · [#3481](https://github.com/software-mansion/react-native-gesture-handler/issues/3481) · [gorhom #1300](https://github.com/gorhom/react-native-bottom-sheet/issues/1300)
- 펼침·재정렬: [Reanimated accordion](https://docs.swmansion.com/react-native-reanimated/examples/accordion/) · [layout transitions](https://docs.swmansion.com/react-native-reanimated/docs/layout-animations/layout-transitions/) · [RN accessibility actions](https://reactnative.dev/docs/accessibility)
- 토스트: [toast-message #583](https://github.com/calintamas/react-native-toast-message/issues/583) · [sonner-native](https://github.com/gunnartorfis/sonner-native-toasts)
- 시트: [gorhom releases](https://github.com/gorhom/react-native-bottom-sheet/releases) · [gorhom #2710](https://github.com/gorhom/react-native-bottom-sheet/issues/2710) · [expo-router modals](https://docs.expo.dev/router/advanced/modals/)
- 하단 바·대화상자: [TDS BottomCTA](https://tossmini-docs.toss.im/tds-mobile/components/BottomCTA/fixed-bottom-cta/) · [TDS ConfirmDialog](https://tossmini-docs.toss.im/tds-mobile/components/Dialog/confirm-dialog/) · [Expo 키보드 가이드](https://docs.expo.dev/guides/keyboard-handling/)
