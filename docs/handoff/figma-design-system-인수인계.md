# 인수인계 — 일가요 Figma 디자인 시스템

> **기준일** 2026-08-29 · `main` `9567485` 기준(이 커밋까지 push 완료). Figma 인벤토리는 이 날짜에 플러그인 API 로 **직접 실측**했다.
> **읽는 순서** ①이 문서 §1~§3 → ②`.claude/skills/figma-design-system/SKILL.md` (필수) → ③작업 시작.
> **성격** 다른 세션이 이어받아 작업하기 위한 문서. 값·좌표는 전부 실측치고, 추정은 "추정"이라고 적었다.
>
> ✅ **3차 게시 확증 완료 (2026-08-29).** 게시 다이얼로그 `변경되지 않음 (115)` 확인. §4.3.

---

## 1. 한 줄 요약

RN 앱(`src/theme/`, `src/components/`)을 역설계해 Figma 파일 `일가요` 의 `DesignSystem` 페이지에
토큰·타이포·아이콘·컴포넌트 라이브러리를 만들었고 팀 라이브러리로 게시했다.
지금은 **`UI` 페이지에 화면 프레임을 옮기는 단계**(19/28)다. 남은 것은 §4.4.

**대원칙: 코드가 원본이고 Figma 가 사본이다.** 값이 어긋나면 `src/theme/` 이 이긴다.
근거 문서는 `docs/reference/design-system.md`, 특히 §15.

---

## 2. 반드시 먼저 읽을 것

| 파일 | 왜 |
|---|---|
| `.claude/skills/figma-design-system/SKILL.md` | **필수.** 반복해서 어긴 문서 톤 규칙 + 런타임 함정 6종 + 파일 좌표표. 이걸 안 읽고 손대면 같은 실수를 반복한다 |
| `docs/reference/design-system.md` | 디자인 시스템의 근거 문서. §15 가 Figma 라이브러리 절 |
| `src/theme/` | `palette.ts` → `colors.ts` → `spacing/typography/elevation/motion/statusBadge/heatScale/choroplethScale/withAlpha` |

MCP 도구는 `mcp__claude_ai_Figma__use_figma` 하나면 된다(`ToolSearch` 로 로드).
`fileKey` = `MlfpDS0wOeN90iNl5JCPWp`.

---

## 3. 현재 상태 (2026-08-29 실측)

### 3.1 섹션 — 절대좌표

`page` `DesignSystem` = `3:4`. 페이지 최상위 떠 있는 노드 **0개**.

| 섹션 | id | x | y | w | h |
|---|---|---:|---:|---:|---:|
| 색상표 | `3:16` | -463 | -105 | 2332 | 2156 |
| 간격·반경 | `27:2` | 2069 | -105 | 1048 | 1038 |
| 그림자 | `27:3` | 2069 | 1185 | 1156 | 540 |
| 타이포그래피 | `27:4` | 2069 | 1985 | 883 | 970 |
| 모션 | `90:2` | 2069 | 3100 | 873 | 990 |
| 지도 척도 | `95:2` | 2069 | 4200 | 888 | 773 |
| 컴포넌트 | `3:20` | 3317 | -105 | 1668 | 6512 |
| 아이콘 | `80:2` | 5100 | -105 | 1360 | 1266 |
| 상태 배지 | `94:2` | 5100 | 1300 | 807 | 934 |

섹션 겹침 0 · 자식 이탈 0 (2026-08-29 재검증).

### 3.2 컴포넌트 — 22개 (모두 `컴포넌트` 섹션 `3:20` 안)

COMPONENT_SET 15개:

| 이름 | id | 배리언트 |
|---|---|---:|
| Button | `37:118` | 30 |
| Badge | `40:38` | 12 |
| Card | `41:18` | 8 |
| FilterChip | `42:20` | 6 |
| Input | `43:30` | 4 |
| LoadingState | `45:8` | 2 |
| FilterOptionRow | `102:14` | 2 (selected false/true × Show dot) |
| FilterHead | `102:27` | 3 (default/active/expanded) |
| FilterAccordion | `103:54` | 2 (collapsed/expanded) |
| FilterDateRow | `201:319` | 2 (Filled=false/true) — 필터 날짜 범위 행. B트랙 P3.c, 2026-08-31 |
| MapSheetLayout | `204:323` | 2 (state=peek/open) — 지도 하단 시트 셸. props Title·Show back·Show action. B트랙 P3.d, 2026-08-31 |
| DestinationRow | `207:331` | 2 (isCurrent=false/true) — 외근 목적지 행. props Order·Address·Detail·Show detail + 상태 Badge 인스턴스. B트랙 P3.e, 2026-08-31 |
| MapLegend | `211:395` | 2 (mode=heatmap/choropleth) — 지도 좌하단 범례. B트랙 P3.f, 2026-08-31 |
| **FieldCard** | `172:339` | 3 (status=pending/in_progress/done) — B트랙 P3.a, 2026-08-29 |
| **TripCard** | `198:329` | 2 (ended=false/true) — B트랙 P3.b, 2026-08-31. 불리언 4(보고서·진행률·지도 버튼·지도 포커스) + 텍스트 4 |

단일 COMPONENT 7개: GroupLabel `44:2` · FieldLabel `44:4` · StickyBottomBar `45:9` ·
EmptyState `101:3` · ErrorState `101:11` · MapSearchBar `211:316`(props Placeholder·Show clear) ·
MapFab `211:322`(44px 원형, 아이콘 스왑 + Show badge) — 뒤 둘은 B트랙 P3.f, 2026-08-31.

**B트랙(도메인 컴포넌트) 완료** — §4.4-b, `plans/figma-screens.md` 참조.
FieldCard(P3.a) · TripCard(P3.b) · FieldFilterBar(P3.c, `FilterDateRow` 로 마감) · MapSheetLayout(P3.d) ·
DestinationRow(P3.e) · 지도 chrome(P3.f: MapSearchBar·MapFab·MapLegend) 완료. 다음은 A트랙.

### 3.3 토큰

- **변수 170개 / 6 컬렉션** — Primitives `16:2`(79) · Color `16:3`(41) · Spacing `16:4`(13) ·
  Typography `16:5`(18) · Motion `89:4`(7) · Map `93:2`(12).
  `ALL_SCOPES` 0건, code syntax 누락 0건.
- **텍스트 스타일 25개** — 코드 대응 9(`h1 h2 h3 bodyLg body bodySm caption metric metricSm`)
  \+ 굵기 조합 6(`body-bold body-semibold bodySm-bold bodySm-semibold caption-semibold caption-bold`)
  \+ `groupLabel` + 문서 가구 8(`docs/*`).
  ※ `body-semibold` 는 EmptyState/ErrorState 제목용으로 이번에 추가됐다.
- **아이콘 70개** — `icon/<name>`, 24×24, `node_modules` 의 `Ionicons.ttf` 에서 윤곽선 직접 추출.
  ※ `map` · `map-outline` 는 TripCard 지도 버튼용으로 2026-08-31 추가. `sparkles` 는 진행 중 외근 재최적화 버튼용으로 2026-08-31 추가.
- **폰트** — 전 텍스트 Pretendard. 스타일은 전부 `font-family/base`(`VariableID:58:2`) 바인딩.

### 3.4 `UI` 페이지 (`0:1`) — 화면

**내비게이션 계층을 위치로 나타낸다** (2026-08-29 §9 재구성). 최상위 = 부모 SECTION 5개
(`인증` `186:260` · `외근` `186:261` · `현장` `186:262` · `보고서` `186:263` · `내 정보` `186:264`),
그 안에 화면 섹션을 tier 순으로 중첩. `인증` 은 탭 진입 전이라 맨 위 열, 나머지 4개는 탭바 순서대로
아래 행에 나란히. tier: 1=탭 루트 · 2=탭에서 1 push · 3=2 push. 같은 tier = 같은 Y(rel 72 / 1200 / 2400).

| 부모 | 화면 섹션 | id | 프레임 | tier | 대응 코드 |
|---|---|---|---|---|---|
| 인증 | 로그인 | `124:75` | `124:77` 빈 폼 · `128:91` invalid_credentials | 0 | `app/(auth)/login.tsx` |
| 인증 | 회원가입 | `3:3` | `114:3` 빈 폼 · `116:37` validate() 실패 | 0 | `app/(auth)/signup.tsx` |
| 외근 | 외근 내역 (목록) | `229:498` | `229:499` · MapSheetLayout 셸 + toolbar(Input + TripFilterBar + weekStats 3열) + TripCard 리스트(날짜 그룹) + StickyBottomBar | 1 | `app/(tabs)/trips/index.tsx` |
| 외근 | 진행 중 외근 | `254:803` | `254:804` · MapSheetLayout 셸(수동, headerRight=촬영 btn) + TripProgressStrip + CurrentDestCard(primary-muted, sparkles/건너뛰기/길찾기/체크인) + 목적지 헤더 + DestinationRow×3 + 외근 종료 dangerGhost | 1 | `app/(tabs)/trips/active.tsx` |
| 외근 | 외근 시작 · 현장 선택 | `215:260` | `215:261` · MapSheetLayout 셸 + FieldCard×6(`Show checkbox`) + StickyBottomBar | 2 | `app/(tabs)/trips/new/select.tsx` |
| 외근 | 외근 정리 (상세) | `241:747` | `241:748` · MapSheetLayout 셸 + header(h2-heavy + edit btn + meta + statsCard 방문/건너뜀/계획) + ReviewVisitCard×3(collapsed) + 건너뛴 현장 Card + StickyBottomBar | 2 | `app/(tabs)/trips/[id].tsx` |
| 외근 | 외근 수정 | `161:245` | `161:247` · 390×844 | 3 | `app/(tabs)/trips/[id]/edit.tsx` |
| 외근 | 방문 상세 | `167:281` | `167:283` · MapSheetLayout 스냅 92% | 3 | `app/(tabs)/trips/visit.tsx` |
| 현장 | 현장 (목록) | `232:592` | `232:593` · MapSheetLayout 셸 + toolbar(Input + FieldFilterBar 4-head + FieldStatusSummary) + FieldCard 리스트 + StickyBottomBar(새 현장 + 촬영) | 1 | `app/(tabs)/fields/index.tsx` |
| 현장 | 현장 등록 | `225:461` | `225:462` · 스크롤 폼(검색 Input + 선택주소 Card + 지도 placeholder + 이름/상세 Input + 프로젝트/분류 picker trigger + 상태 FilterChip×3 + Button) | 2 | `app/(tabs)/fields/new.tsx` |
| 현장 | 카테고리 관리 | `150:183` | `150:185` · 목록 + 인라인 편집 1행 | 2 | `app/(tabs)/fields/categories.tsx` |
| 현장 | 현장 상세 | `262:855` | `262:856` · MapSheetLayout 셸(수동, snap 92%) + 상태 pill(▲ 조치 중 + ⇄ 변경) + h3 제목/부제 + folder·pricetags 메타 + 길찾기/수정 + 메모(GroupLabel + Input + 추가 + 카드×2) + 사진 추가 + PhotoGrid×3 + 방문 이력(GroupLabel + visitCard×2 Badge) | 2 | `app/(tabs)/fields/[id]/index.tsx` |
| 현장 | 체크인 | `163:264` | `163:266` · completed 선택 | 3 | `app/(tabs)/fields/[id]/checkin.tsx` |
| 보고서 | 보고서 (목록) | `237:724` | `237:725` · MapSheetLayout 셸 + toolbar(Input + ReportFilterBar 1-head) + 그룹(외근 헤더 + 보고서 Card 리스트) + StickyBottomBar | 1 | `app/(tabs)/reports/index.tsx` |
| 보고서 | 보고서 작성 | `220:442` | `220:443` · Input + tripCard(Card detach) + 위치도 placeholder + Button | 2 | `app/(tabs)/reports/new.tsx` |
| 보고서 | 보고서 상세 | `270:888` | `270:889` · MapSheetLayout 셸(수동, snap 55%) + h2-heavy 제목 + tripLink pill(primary-muted) + meta + 위치도 placeholder + sectionHead(현장별 전·중·후 + 현장 보고 추가) + FieldReportCard×2(전/중/후 슬롯, dashed=없음) + Word 다운로드/다시 생성/PDF + 수정·삭제 divider row | 2 | `app/(tabs)/reports/[id]/index.tsx` |
| 보고서 | 보고서 수정 | `158:230` | `158:232` · dirty=false | 3 | `app/(tabs)/reports/[id]/edit.tsx` |
| 내 정보 | 내 정보 · 홈 | `136:137` | `136:139` · 390×844 | 1 | `app/(tabs)/profile/index.tsx` |
| 내 정보 | 내 정보 수정 | `154:198` | `154:200` · 이름 dirty=false | 2 | `app/(tabs)/profile/edit.tsx` |

빈 tier 자리(외근 T1·T2 등)는 비워 둔다 — 미구현 상위 화면이 채워질 슬롯. `N_` 숫자 접두사 폐기.
새 화면은 라우트 depth 로 tier 를 정해 해당 부모 안에 넣는다. **같은 tier 에 화면이 2개면 부모 SECTION 을 넓히고
오른쪽 형제 부모를 밀어낸다** (2026-08-31: `현장`→1520·`보고서`→1034, `보고서` x2066 · `내 정보` x3166. `외근` 은 1034 유지 — tier1·tier2 각 2열).

오류 프레임은 `validate()` 가 만드는 조합을 그대로 그렸다 — 필드 4개 `state=error` +
약관 오류 caption. **`globalError` 는 넣지 않았다**: 검증 실패면 서버를 호출하기 전에 return 하므로
필드 오류와 동시에 뜰 수 없다.

프레임 폭은 390 고정, 높이는 **스크롤 전체지만 최소 844**(갤럭시 뷰포트 — 하단 디자인 요소가 없어도
빈 여백으로 채운다, 2026-08-29 §8). 섹션 안에는 프레임만 둔다 — 캡션·주석 텍스트는 넣지 않는다
(2026-08-29 사용자 지시로 기존 캡션 11개 제거, §8). 섹션은 프레임을 24px 여백으로 감싼다.

---

## 4. 작업 현황

### 4.1 ~~P0 — 섹션 겹침 해소~~ ✅ 완료 (2026-08-29)

`컴포넌트` 섹션을 4020px 로 키우면서 `상태 배지` 가 자동으로 밀렸고, 밀린 자리가 하필 `아이콘` 위였다.
`상태 배지` 를 `x=5100, y=1300`(아이콘 아래)로 옮겨 해소했다. 재검증 `ov: []`.

```js
const page = figma.root.children.find(p => p.id === '3:4');
await figma.setCurrentPageAsync(page);
const s = page.children.find(n => n.id === '94:2');
s.x = 5100; s.y = 1300;          // 섹션은 페이지 직속이라 이 값이 곧 절대좌표
return JSON.stringify(s.absoluteBoundingBox);
```


### 4.2 ~~P1 — `docs/reference/design-system.md` §15 갱신~~ ✅ 완료 (2026-08-29)

§15 가 담고 있던 틀린 수치를 정정했다:

| 항목 | 문서 현재값 | 실제값 |
|---|---|---|
| 텍스트 스타일 | 23개 | **24개** (`body-semibold` 추가) |
| 컴포넌트 | `ui/` 프리미티브 9개 · 배리언트 65 | **14개** (세트 9 + 단일 5) |
| 섹션 표 | EmptyState/ErrorState/Filter* 미기재 | EmptyState · ErrorState · FilterOptionRow · FilterHead · FilterAccordion 반영 |

배리언트 총합 69(30+12+8+6+4+2+2+3+2). 새 컴포넌트는 한 줄로만 붙였다 — **§15 를 늘리지 말 것**.

### 4.3 ~~P2 — 커밋 + 푸시~~ ✅ 완료

커밋은 따라잡았다. `docs/일가요_앱배너.png` 는 **커밋 대상 아님**(사용자 지시) — 추적 안 된 채로 둔다.

**2차 게시(확인됨)** — 아이콘 4개(63→67) · 그리드 재정렬 · `h2-heavy`(24→25) 반영.
게시 항목 **115개**, 이후 `변경되지 않음 (115)` + `게시` 버튼 비활성까지 확인했다.

**3차 게시(확인됨, 2026-08-29)** — 오류 상태 화면 작업의 폰트 사이클 변경 37건. 다음 세션이 열어
`게시…` → `변경되지 않음 (115)` + `게시` 버튼 비활성 확인. 정상 완료.

**4~11차 게시(2026-08-29)** — `1_로그인`~`8_방문상세` 폰트 사이클 변경(스타일·컴포넌트, **내용 변화 없음**).
`변경되지 않음 (115)` 확인. (`게시 중` 토스트는 수 분 남지만 다이얼로그 상태가 정답.)
5차부터 게시 다이얼로그에서 **`MenuRow` 를 체크 해제**하고 게시한다 — 로컬 유지, `변경 사항 (1/1)` 로 남아 있으면 정상.

**게시 요령**: 에셋 패널 → 라이브러리 아이콘 → `게시…`. `라이브러리 게시 중` 토스트는 수 분 남는다 —
다시 열어 `변경되지 않음 (N)` 이면 끝. 이 변경분은 재게시해도 결과가 같아 위험 없음.
**커밋 메시지에 `Co-Authored-By` 트레일러를 넣지 말 것** — hook 이 impersonation 사유로 차단한다.
메시지는 `-F` 파일로 넘긴다. staged-only 커밋 후 push.

### 4.4 백로그 — 남은 일

#### ⚠️ 먼저 — 이 런타임에서는 컴포넌트를 인스턴스화할 수 없다

`createInstance()` 는 내부 텍스트의 폰트 로드를 요구하는데, **Pretendard 가 이 런타임에 없다**(§5-2).
화면 프레임은 대부분 인스턴스 조립이라 아래 (a)·(b) 는 이 벽을 먼저 넘어야 한다.

**우회 절차** — `FilterAccordion`, `1_로그인` 을 이 방법으로 만들었다:
① 관련 텍스트 스타일을 전부 `42dot Sans` 로 내린다 → ② 인스턴스 생성·배치·오버라이드 →
③ `font-family/base`(`VariableID:58:2`)로 복구하고 `restoreFailed: []` 를 확인한다.
face 이름은 공백 없이 (`SemiBold`). 중간에 실패하면 복구를 반드시 돌릴 것 — 안 돌리면 파일 전체 폰트가 42dot Sans 로 남는다.

⚠️ **`importComponentSetByKeyAsync` 는 게시된 Pretendard 스냅샷을 반환한다** — 인스턴스화 시 폰트 로드로 실패.
로컬 컴포넌트 세트를 id 로 직접 잡아 쓴다: Input `43:30` · Button `37:118` (스킬 §6 표).

⚠️ **아이콘 인스턴스는 `inst.rescale(size / inst.width)` 로 크기 조정** — `resize()` + SCALE constraints 조합은
INSTANCE_SWAP 과 얽히면 벡터가 6×11 로 뭉개진다(실제로 당함). 색은 인스턴스 프레임 `.fills` 가 아니라
내부 VECTOR 의 `.fills` 를 `text/*` 로 바인딩(프레임에 칠하면 회색 박스가 생긴다).

#### (a) 화면 프레임 — 진행 중 (19/28)

**자리는 `UI` 페이지(`0:1`)의 내비게이션 계층 트리다** (§3.4·§9). 새 화면은 라우트 depth 로 tier 를
정해 해당 부모 SECTION(`인증`·`외근`·`현장`·`보고서`·`내 정보`) 안에 넣는다. 아래 ✅ 목록의 `N_` 이름은
작업 당시 이름(현재는 재명명됨 — §3.4 표가 최신).
프레임 폭 390, 높이는 스크롤 전체지만 최소 844. 섹션 안에는 프레임만(캡션·주석 텍스트 금지 — §8).

- ✅ `0_회원가입` — `app/(auth)/signup.tsx`. 프레임 `114:3`, 390×852.
  Input 4 · termsBox · Button(primary lg + ghost sm) 인스턴스 조립, 간격·반경은 전부 변수 바인딩.
- ✅ `1_로그인` — `app/(auth)/login.tsx`. 섹션 `124:75`. 프레임 `124:77`(빈 폼) · `128:91`(invalid_credentials).
  header(h1 brand + tagline) · Input 2(비번은 eye-outline right slot) · Button(primary lg + ghost sm) · forgot 링크.
  content itemSpacing = `spacing/xxl`(회원가입은 xl — signup title marginBottom 와 login header marginBottom 차이).
- ✅ `2_내정보` — `app/(tabs)/profile/index.tsx`. 섹션 `136:137`. 프레임 `136:139` 390×767.
  identity(avatar 56 circle + h1 이름 + email) · GroupLabel + 카드 표면(수동, bg/surface+border/default+radius/md) 2개 ·
  **`MenuRow` 로컬 컴포넌트**(`143:151`, 섹션 안 프레임 아래 배치 — §14 "2번째 callsite 시 승격") · Button(secondary +leftIcon, dangerGhost +leftIcon).
  카드 slot(`Content` SLOT)은 plugin API 로 채우기 어려워 표면을 수동으로 그렸다.
- ✅ `3_카테고리` — `app/(tabs)/fields/categories.tsx`. 섹션 `150:183`. 프레임 `150:185` 390×844(지도 아님, 전체 화면).
  addBox(수동 `control/*` 입력 + `추가` primary +add icon, borderBottom) · 카드 행 4개(pricetag + 이름 + pencil + trash, 1행은 인라인 편집 = `control/border-focus`).
- ✅ `4_내정보수정` — `app/(tabs)/profile/edit.tsx`. 섹션 `154:198`. 프레임 `154:200` 390×715.
  GroupLabel + 카드 표면(padding lg, gap md) 2개: 이름(라벨 없는 Input + `이름 저장` disabled) · 비밀번호(Input 3 + `비밀번호 변경`). 하단 읽기전용 이메일 안내(caption).
  ※ 이메일 안내문이 43자 — **실제 앱 카피**라 40자 규칙(주석/문서용)에서 예외. `over40` 검증은 이 노드 하나 때문에 1이 정상.
- ✅ `5_보고서수정` — `app/(tabs)/reports/[id]/edit.tsx`. 섹션 `158:230`. 프레임 `158:232` 390×307.
  FieldLabel(제목 + counter) + Input(제목 + helper) + `변경 사항 없음` disabled(save icon) + `취소` ghost. `Show label=false`(FieldLabel 이 라벨).
- ✅ `6_외근수정` — `app/(tabs)/trips/[id]/edit.tsx`. 섹션 `161:245`. 프레임 `161:247` 390×433.
  h2-heavy 제목 + 부제 + FieldLabel + Input + `변경 사항 없음`/`취소` + 위험 구역(`외근 삭제` dangerGhost + trash). `2_내정보`·`4_내정보수정` 과 같은 위험 구역 패턴(borderTop + paddingTop md).
- ✅ `7_체크인` — `app/(tabs)/fields/[id]/checkin.tsx`. 섹션 `163:264`. 프레임 `163:266` 390×600.
  헤더 카드(`brand/primary-muted` + `brand/primary` 테두리) + 방문 결과 칩 6개(●▲■◆ 글리프, active = 색 @0.13 + 색 테두리, `visit-status/*` 변수) + 대시 사진 슬롯 3개 + `메모·추가 사진`(secondary +rightIcon) + `결과 저장`(primary lg +save).
  ※ 방문 결과 칩은 FilterChip 아님(§14 — 필터가 아니라 주 컨트롤). 글리프는 `BADGE_SHAPE_GLYPH` 매핑.
- ✅ `8_방문상세` — `app/(tabs)/trips/visit.tsx`. 섹션 `167:281`. 프레임 `167:283` 390×844.
  **첫 MapSheetLayout 프레임.** `initialIndex 2`(스냅 92% 고정)라 단일 프레임으로 충분. 지도 스트립(`bg/surface-muted` 라벨) + 시트(`bg/surface` + `elevation/modal` + top `radius/lg` + 그래버) + 헤더(chevron-back + h3) + titleRow(h2-heavy + Badge success md ■) + 시각 + `메모·사진 추가`(secondary +arrow-forward-circle).
  → 시트 chrome(스트립·그래버·헤더 골격)은 다른 탭 목록 화면(스냅 3프레임)에서도 재사용할 수 있게 이 프레임을 참조.
- ✅ `외근 시작 · 현장 선택` — `app/(tabs)/trips/new/select.tsx`. 섹션 `215:260`. 프레임 `215:261` 390×844, tier 2.
  **B트랙 컴포넌트로 조립한 첫 화면.** `MapSheetLayout`(state=open) 인스턴스 → `detachInstance()` → `content` 프레임을 채운다.
  head(count `bodySm-bold primary` + `모두 선택` FilterChip dashed + Input search + FilterAccordion 조치상태/프로젝트/카테고리 3-head) ·
  `FieldCard`×6(`Show checkbox=true`, 일부 `Checked`) · `StickyBottomBar` 인스턴스 detach 후 Button(`다음 (3)` primary lg +arrow-forward).
  **P3.a FieldCard 검증 완료** — 인스턴스 6개 + 체크박스 레이아웃 정상.
  ⚠️ `FilterAccordion` 인스턴스는 데모 head 2개를 달고 온다 → detach 후 relabel + head clone(폰트 다운 창에서). `StickyBottomBar` `Content` SLOT 도 detach 후 채운다.
- ✅ `보고서 작성` — `app/(tabs)/reports/new.tsx`. 섹션 `220:442`. 프레임 `220:443` 390×844, tier 2. 지도 없는 폼.
  header(chevron-back + h3) + 제목 `Input` + `연결 외근` label + tripCard(`Card` md 인스턴스 detach) + 스캐폴드 안내 + `위치도` label + 지도 placeholder + `보고서 만들기` Button.
- ✅ `현장 등록` — `app/(tabs)/fields/new.tsx`. 섹션 `225:461`. 프레임 `225:462` 390×~1060(스크롤), tier 2. `현장` 부모를 1034 로 넓혀 카테고리 관리 옆에 뒀다(§3.4).
  검색 `Input` + `현 위치로 이동`(secondary sm) + 선택주소 `Card`(primary-muted, detach) + 지도 placeholder + 이름 `Input` + `FieldLabel`×3(`Show counter=false`) + 프로젝트/분류 picker trigger(수동: solid primary 테두리 + primary-muted + 아이콘 + 텍스트 + `해제` pill) + 상태 `FilterChip`×3(하나는 warning tint 로 active) + `현장 등록` Button.
  ⚠️ `FilterChip` `state=active` 인스턴스는 Label 이 렌더 안 될 때가 있다 → `state=default` 인스턴스를 intent 색으로 수동 recolor(코드의 `activeColor` 방식과 동일).
- ✅ `외근 내역` (탭 루트) — `app/(tabs)/trips/index.tsx`. 섹션 `229:498`. 프레임 `229:499` 390×844, tier 1.
  `MapSheetLayout`(state=open, `Show back=false`) detach → toolbar(Input search + TripFilterBar[FilterAccordion detach → 기간/보고 여부] + weekStats 3열: `metricSm` 이번 주 외근 primary · 방문 · 누적 시간 muted) + list(날짜 그룹 header `caption-bold` + `TripCard` 인스턴스, `Map focused` 예시 1개) + `StickyBottomBar` detach → `외근 시작` Button.
- ✅ `현장 (목록)` (탭 루트) — `app/(tabs)/fields/index.tsx`. 섹션 `232:592`. 프레임 `232:593` 390×844, tier 1.
  `외근 내역` 골격 복제. toolbar = Input + FieldFilterBar(FilterAccordion detach → 조치상태/프로젝트/카테고리/방문일 4-head, head clone 2개) + `FieldStatusSummary`(수동: 조치 전 `metric` warning + 조치 중/완료 dot 캡션 + flexGrow 분포 바 `field-status/*`). list = `FieldCard` 인스턴스. StickyBottomBar = `새 현장`(primary) + `촬영`(secondary) 2버튼 row.
- ✅ `보고서 (목록)` (탭 루트) — `app/(tabs)/reports/index.tsx`. 섹션 `237:724`. 프레임 `237:725` 390×844, tier 1.
  toolbar = Input + ReportFilterBar(FilterAccordion detach → `작성일` 1-head). list gap `xl`, 그룹 = tripHeader(`briefcase-outline` primary + `외근 · 날짜` `bodySm-bold` + meta `caption` + `chevron-forward`) + 보고서 Card(md, detach: `body-bold` 2줄 제목 + `수정됨` Badge primary + `calendar-outline` + 날짜). StickyBottomBar → `보고서 작성` Button.
- ✅ `외근 정리` (외근 상세) — `app/(tabs)/trips/[id].tsx`. 섹션 `241:747`. 프레임 `241:748` 390×844, tier 2.
  `MapSheetLayout`(Show back=true) detach → header(h2-heavy 제목 + `create-outline` edit 버튼 36px + `time-outline` 메타 + `statsCard`(Card lg detach: 방문 `metric` primary / 건너뜀·계획 `metricSm`)) +
  "방문한 현장 정리 (N)" + `ReviewVisitCard` collapsed(Card md detach: primary orderBadge + time `bodySm-bold` + Badge(■/●) + 주소 + 상세 + chevron) + "건너뛴 현장 (N)" + skipped Card(surface-muted, border 없음) + StickyBottomBar → `보고서 작성`.
  ⚠️ detach 한 Card 를 `layoutMode='HORIZONTAL'` 로 바꾸면 `primaryAxisSizingMode='FIXED'` 를 명시해야 FILL 폭이 먹는다(안 하면 HUG 로 자식이 뭉침).
- ✅ `진행 중 외근` — `app/(tabs)/trips/active.tsx`. 섹션 `254:803`. 프레임 `254:804` 390×844, tier 1(외근 내역 옆 — 탭 리다이렉트 대상이라 탭 루트 취급, 외근 부모 1034 폭에 2열).
  시트 chrome 은 **수동**(headerRight 가 아이콘이 아니라 `촬영` Button 이고 map/sheet 비율이 initialIndex=1 이라 MapSheetLayout 인스턴스 detach 대신 grabber+header 직접 조립) · map absolute 200 + sheet FILL.
  content = TripProgressStrip(elapsed `caption-semibold` + 방문/건너뜀 카운트 + `40%` `caption-bold` primary + 3dp 트랙) + CurrentDestCard(수동 Card: `brand/primary-muted`+`brand/primary` 테두리, capRow[`caption-bold` primary + `icon/sparkles` 32px btn + `건너뛰기` dangerGhost sm] + titleRow[h3 주소 + info 아이콘] + 상세 + `길찾기`(secondary md)/`체크인`(primary md)) + `목적지 (5)`+`현장 추가` ghost sm + `DestinationRow`×3(방문완료 success / 현재 isCurrent=true / 예정, 중첩 badge 는 인스턴스 후 `setProperties` 로 relabel) + footer `외근 종료 (미완료 2곳)` dangerGhost lg.
- ✅ `현장 상세` — `app/(tabs)/fields/[id]/index.tsx`. 섹션 `262:855`. 프레임 `262:856` 390×918, tier 2(현장 부모 1520 로 넓힘 — 카테고리 관리·현장 등록 옆 3열).
  MapSheetLayout `initialIndex=2`(snap 92%)라 시트 chrome 수동 조립(그래버+헤더) + map absolute 72 + sheet/content HUG.
  content = 상태 pill(수동: `brand/primary`@0.13 배경 + `brand/primary` 테두리, `▲`+`조치 중` `bodySm-bold` + 1×10 hairline + `swap-horizontal` 12 + `변경` `caption-semibold`, 전부 primary 색) + h3 제목 + `body` 부제 + metaRow×2(`folder-outline`/`pricetags-outline` 14 + `bodySm` muted) + actionRow(`길찾기`/`수정` secondary md FILL) + `GroupLabel`(메모) + memoInputRow(`Input` no-label + `추가` primary) + memoCard×2(수동 surface Card: `bodySm` + 22px close 원 + `caption` 메타) + `사진 추가 (3)` secondary FILL + photoGrid(surface-muted 정사각×3 FILL) + `GroupLabel`(방문 이력) + visitCard×2(수동: `bodySm` 날짜 + `Badge` tone/shape, other 는 사유 `caption`).
- ✅ `보고서 상세` — `app/(tabs)/reports/[id]/index.tsx`. 섹션 `270:888`. 프레임 `270:889` 390×1288, tier 2(보고서 부모 1034 로 넓힘 — 보고서 작성 옆 2열, `내 정보`→x3166).
  MapSheetLayout `initialIndex=1`(snap 55%) → 시트 chrome 수동 + map absolute 180 + sheet/content HUG.
  content = h2-heavy 제목 + tripLink pill(수동: `brand/primary-muted`, `briefcase-outline` 14 + `bodySm-semibold` primary + `chevron-forward`) + `caption` meta + `bodySm-bold` 위치도 라벨 + overviewMap(surface-muted 220h radius-lg border) + sectionHead(`bodySm-bold` + `현장 보고 추가` secondary sm) + FieldReportCard×2(수동 surface Card: frHead[`bodySm-bold` 제목 + `수정` ghost sm/`삭제` dangerGhost sm] + frSlots[전·중·후 `caption-bold` 라벨 + 정사각 슬롯, 없는 칸은 `dashPattern` 점선 + `없음`]) + `Word 파일 다운로드` primary FILL + `Word 다시 생성` ghost sm(center) + `PDF 내보내기` secondary FILL + actions divider row(`수정` secondary / `삭제` dangerGhost, `border/muted` top).
  ※ meta 텍스트 "작성: … · 수정: …" 41자 — **실제 앱 카피**라 40자 규칙(주석/문서용) 예외. `over40` 은 이 노드 하나로 1.
- **탭 루트 4/4 + 진행 중 외근 + 외근 상세 + 현장 상세 + 보고서 상세 완료.** `ReviewVisitCard` 는 2 callsite(trips/[id]·active) 라 나중에 `3:20` 승격 대상.
- 다음: 나머지 서브 화면 — `trips/new/order` · `fields/[id]/edit` · `reports/[id]/field-report` · `profile/delete-account` · `+not-found`.

나머지 화면(라우트 34개 / 실제 화면 28개)에서 참고할 것:

- 지도 홈 `(tabs)/index` — `MapSheetLayout` 스냅(`['18%','55%','92%']`)이 얽혀 있어 정지 프레임 3장이 필요하다
- 서브 화면 — `trips/visit` · `reports/[id]/edit` · `trips/[id]/edit` · `fields/categories` · `fields/[id]/checkin`

화면별 디자인 결정은 이미 `docs/reference/design-system.md` **§14(미적용 / 차후 과제)** 의 탭·서브 화면 패스 기록에 적혀 있다. 새로 판단하지 말고 그걸 근거로 옮긴다.
`reports/generate` 는 19줄짜리 redirect 라 UI 가 없다 — 대상에서 뺀다.

**빠진 아이콘은 먼저 채운다.** 회원가입에서 `eye-outline` · `eye-off-outline` · `checkbox` · `square-outline` 4개가 없어
`Ionicons.ttf` 에서 추출해 넣었다(아이콘 63 → 67, 그리드는 알파벳 순으로 재정렬). 스크립트는 §5·스킬 §4 참조.

#### (b) 도메인 컴포넌트

`ui/` 프리미티브 14개는 끝났고, 아래는 손대지 않았다.

| 위치 | 컴포넌트 |
|---|---|
| 지도 chrome | `MapDashboard` · `MapSearchBar` · `MapFilterBar` · `MapLegend` · `MapSheetLayout` · `KakaoMapWebView` |
| 공통 | `FieldCard` · `TripStatusBanner` · `AttachmentPreview` · `ProjectPicker` · `SafeScreen` · `SessionGuardModal` · `WebChoiceModal` |
| `fields/` | `FieldFilterBar` · `FieldStatusSummary` · `FieldPinMap` · `CategoryMultiPicker` · `ManualCoordinateForm` · `QuickPhotoSheet` |
| `trips/` | `TripCard` · `TripFilterBar` · `TripProgressStrip` · `CurrentDestCard` · `DestinationRow` · `ReviewVisitCard` · `AllDoneCard` · `AddDestinationModal` |
| `reports/` | `ReportFilterBar` |

주의:
- **지도 chrome 이 `elevation` 을 쓰는 유일한 자리다**(§7). 다른 데서 그림자를 끌어 쓰지 말 것.
- `.web.tsx` 짝이 있는 것(`KakaoMapWebView` · `FieldPinMap` · `useKakaoPlaceSearch`)은 **Figma 에 한 벌만** 만든다. 플랫폼 분기는 구현 사정이지 디자인 차이가 아니다.
- `quickPhotoHandoff.ts` · `useQuickPhoto.ts` · `useKakaoPlaceSearch` 는 컴포넌트가 아니다.

#### (c) ~~라이브러리 퍼블리시~~ ✅ 완료 (2026-08-29) · Code Connect 남음

**퍼블리시 완료.** 플러그인 API 에는 `figma.publish` 가 없지만, **Claude in Chrome 브라우저 자동화로 하면 된다** —
에셋 패널 → 라이브러리(책) 아이콘 → `게시…` → 항목 확인 → `게시`.
초판 **110개 항목**(컴포넌트 77 = 프리미티브 14 + 아이콘 63, 텍스트 스타일 24, 효과 스타일 3, 변수 컬렉션 6),
2차 **115개**(아이콘 4 + `h2-heavy` 추가분 반영). 게시 후 `변경되지 않음 (115)` · `게시` 버튼 비활성까지 확인했다.
→ 라이브러리를 고쳤으면 **매번 이 경로로 재게시**해야 소비자에게 반영된다.

**남은 것 — Code Connect.** 퍼블리시가 선행 조건이었으므로 이제 막힌 것이 없다.
`mcp__claude_ai_Figma__get_code_connect_suggestions` → `add_code_connect_map` 으로
프리미티브 14개를 `src/components/ui/*.tsx` 에 매핑한다.

> 관찰: 게시 시점에 Figma 가 **누락된 글꼴**을 보고했다. 파일은 `font-family/base` = Pretendard 인데
> 브라우저/데스크톱 Figma 에 Pretendard 가 로컬 설치돼 있지 않으면 대체 글꼴로 렌더된다.
> 라이브러리를 쓰는 사람은 Pretendard 를 로컬에 설치해야 코드와 같은 모양이 나온다.

---

## 5. 작업하며 알아야 할 함정 (요약 — 전문은 스킬 파일)

스킬 파일에 전부 있지만, 여기 있는 것만 모르면 바로 사고가 난다.

1. **SECTION 자식의 `x`/`y` 는 섹션 기준 상대좌표다.** `node.x = section.x + 80` 은 틀렸다(실제로 컴포넌트를 섹션 밖 1770px 지점에 만들었다). 검증은 **`absoluteBoundingBox` 로만**.
2. **Pretendard 는 이 런타임에 없다.** 서버 쪽 구글 폰트 세트만 있다(`Arial` 조차 없다).
   텍스트를 고치려면 ① 관련 스타일을 `42dot Sans` 로 내리고 ② 편집·스타일 적용 ③ `font-family/base`(`VariableID:58:2`)로 되돌린다.
   face 이름은 공백 없이 `SemiBold`(Inter 의 `Semi Bold` 아님).
3. **`OPACITY` 스코프 FLOAT 는 % 단위(0–100)다.** 코드의 `0.4` → Figma `40`. 0.4 를 넣으면 실제 불투명도가 0.004 가 되고 조용히 18개 바인딩이 망가진다(실제로 당했다).
4. **`setBoundVariableForPaint` 는 색을 검정으로 남길 수 있다.** 값을 먼저 해석해 넣고 바인딩한다. `paint.opacity` 는 바인딩을 거치며 사라지므로 `Object.assign({}, p, {opacity})` 로 다시 얹는다.
5. **컴포넌트 안 인스턴스는 `children` 이 빈 배열이다.** 색을 덮으려면 페이지에 두고 덮은 뒤 `insertChild` 로 옮긴다.
6. **캔버스 텍스트 40자 이내, description 은 한 줄.** 마크다운·HTML 엔티티는 Figma 에서 그대로 보인다.
7. 스크립트는 **원자적**이다. 실패하면 아무것도 안 바뀌므로 고쳐서 재시도해도 안전하다.

**폰트 내림/복구 — 실제로 통한 코드** (회원가입 화면을 이걸로 만들었다):

```js
// 내림: 바인딩을 먼저 끊어야 실제 폰트가 바뀐다. face 이름은 그대로 둔다.
s.setBoundVariable('fontFamily', null);
s.fontName = { family: '42dot Sans', style: s.fontName.style };   // Regular/SemiBold/Bold/ExtraBold 전부 있다

// 복구: 변수만 다시 물린다. 남는 게 없을 때까지 3~4회 반복.
s.setBoundVariable('fontFamily', fontVar);   // font-family/base
```

⚠️ **이 사이클을 한 번 돌 때마다 텍스트 스타일 전부가 Figma 에서 `수정됨` 으로 잡힌다.**
내용은 복구 전과 같지만 게시 상태는 어긋나므로, 화면 작업 뒤엔 §4.4-(c) 경로로 재게시해야 한다.

---

## 6. 검증 스크립트 (작업 끝에 그대로 실행)

`use_figma` 에 통째로 넣으면 된다. 스킬 §5 체크리스트를 코드로 옮긴 것.

페이지가 둘이므로 **`3:4`(DesignSystem)과 `0:1`(UI) 양쪽**에 돌린다.

```js
const page = figma.root.children.find(p => p.id === '3:4');   // ← '0:1' 로 바꿔 한 번 더
await figma.setCurrentPageAsync(page);

// 섹션 겹침 · 자식 이탈
const secs = page.children.filter(n => n.type === 'SECTION').map(s => {
  const b = s.absoluteBoundingBox;
  return { n: s.name, id: s.id, x: b.x, y: b.y, w: b.width, h: b.height, node: s };
});
const ov = [];
for (let i = 0; i < secs.length; i++) for (let j = i + 1; j < secs.length; j++) {
  const a = secs[i], b = secs[j];
  if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) ov.push([a.n, b.n]);
}
let outside = 0;
for (const s of secs) for (const c of s.node.children) {
  const b = c.absoluteBoundingBox; if (!b) continue;
  if (b.x < s.x || b.y < s.y || b.x + b.width > s.x + s.w || b.y + b.height > s.y + s.h) outside++;
}

// 텍스트: 폰트 · 길이
const texts = page.findAll(n => n.type === 'TEXT');
const fams = {}; let maxLen = 0, over40 = 0;
for (const t of texts) {
  const f = t.fontName; if (f !== figma.mixed) fams[f.family] = (fams[f.family] || 0) + 1;
  const L = t.characters.length; if (L > maxLen) maxLen = L; if (L > 40) over40++;
}

// 스타일 fontFamily 바인딩
const styles = await figma.getLocalTextStylesAsync();
const stylesNotBound = styles.filter(s => !(s.boundVariables && s.boundVariables.fontFamily)).map(s => s.name);

// 변수 scope · code syntax
const vars = await figma.variables.getLocalVariablesAsync();
const allScopes = vars.filter(v => v.scopes.includes('ALL_SCOPES')).map(v => v.name);
const noCode = vars.filter(v => !v.codeSyntax || Object.keys(v.codeSyntax).length === 0).map(v => v.name);

// % 단위 실수 탐지: 불투명도 바인딩 노드가 0.1 미만
const low = page.findAll(n => n.boundVariables && n.boundVariables.opacity && n.opacity < 0.1).map(n => n.name);

// 설명 장황함
const longDesc = page.findAll(n => (n.type === 'COMPONENT' || n.type === 'COMPONENT_SET') && n.description && n.description.length > 90).map(n => n.name);

return JSON.stringify({
  ov, outside, floating: page.children.filter(n => n.type !== 'SECTION').length,
  fams, maxLen, over40, stylesNotBound,
  totalVars: vars.length, allScopes, noCode,
  lowOpacityNodes: low, longDesc
}, null, 1);
```

**통과 기준**: `ov: []` · `outside: 0` · `floating: 0` · `fams` 는 `{Pretendard: N}` 단일 ·
`over40: 0` · `stylesNotBound: []` · `allScopes: []` · `noCode: []` · `lowOpacityNodes: []` · `longDesc: []`

2026-08-29 기준 **양쪽 페이지 전 항목 통과**한다 — DesignSystem `{Pretendard: 663}` `maxLen 39`, UI `{Pretendard: 20}` `maxLen 33`, `totalVars 170`.

---

## 7. 프로젝트 상시 제약 (Figma 작업에도 걸림)

- **웹 테스트 서버는 항상 포트 8081.** 카카오 지도 키가 `http://localhost:8081` 에만 등록돼 있다.
- **커밋 메시지에 `Co-Authored-By` 금지** (hook 차단). 메시지는 `-F` 파일로.
- **작업 사이클 끝나면 staged-only 커밋 + push.**
- 시각 변경은 로컬 웹 렌더 확인·사용자 OK 전에는 `release` 머지 금지.
- 전수 조사 grep 에 `head` 금지 — 잘린 목록을 전체로 착각해 같은 결함을 세 번 놓쳤다.
- 브라우저 자동화 중 JS `alert`/`confirm`/`prompt` 유발 금지.

---

## 8. 이번 라운드에 실제로 한 일 (이력)

1. `docs/reference/design-system.md` §9·§10 에 `ErrorState` 행 추가 — "실패를 empty 로 렌더하면 '데이터 없음' 으로 오독된다"는 코드 주석의 의도를 문서로 올린 것.
2. 텍스트 스타일 `body-semibold`(16/24 SemiBold) 신설.
3. Figma 컴포넌트 5개 신설 — `EmptyState` `101:3` · `ErrorState` `101:11` ·
   `FilterOptionRow` `102:14` · `FilterHead` `102:27` · `FilterAccordion` `103:54`.
   - EmptyState/ErrorState: 320px 폭, 64×64 아이콘 원(`bg/surface-muted` 바인딩), 아이콘 `text/subtle` tint,
     제목 `body-semibold`, 설명 `bodySm`, `Action` SLOT(paddingTop 16).
     프로퍼티: Title · Description · Show icon · Show description · Icon source(INSTANCE_SWAP).
   - FilterAccordion: FilterHead + FilterOptionRow 인스턴스 조합, 32×32 dashed Reset(`icon/close`).
4. 전 텍스트 스타일 Pretendard 복구 (`restoreFailed: []`).
5. `.claude/skills/figma-design-system/SKILL.md` 신설·커밋(`13865df`).
6. 섹션 겹침 해소 · §15 수치 정정 완료. **남은 것은 §4.4 백로그뿐이다.**
7. (2026-08-29) `UI` 페이지 캡션·주석 텍스트 11개 제거 — 사용자: "불필요한 주석 때문에 프레임이 가려짐".
   `ScrollView·`/`FlatList·`/`MapSheetLayout·` 접두 캡션, 오류 경로명(`invalid_credentials` 등) 전부 삭제.
   각 섹션은 프레임을 24px 여백으로 감싸게 리사이즈. UI 페이지 텍스트 152→141. 이후 규칙은 §3.4·스킬 §6.
8. (2026-08-29) 짧은 화면 프레임 7개를 최소 높이 844 로 — 사용자: "로그인 화면이 너무 작다, 갤럭시 높이엔 맞출 것".
   로그인(567) · 로그인·오류(587) · 내정보(767) · 내정보수정(715) · 보고서수정(307) · 외근수정(433) · 체크인(600) → 844.
   `primaryAxisSizingMode='FIXED'` 후 resize, 콘텐츠는 상단 정렬 유지. `2_내정보` MenuRow 는 커진 프레임 아래로 재배치.
9. (2026-08-29) `UI` 페이지를 내비게이션 계층으로 재구성 — 사용자: "일렬 나열 말고 계층 구조를 위치로 나타내라".
   부모 SECTION 5개(`인증`·`외근`·`현장`·`보고서`·`내 정보`) 신설, 화면 섹션 9개를 라우트 depth 에 맞춰 tier 중첩.
   `인증` 은 맨 위 행, 탭 4개는 아래 행(탭바 순). `N_` 접두사 폐기, 화면 이름으로 재명명. 상세는 §3.4.
   **섹션 reparent(`appendChild`)가 Pretendard 텍스트 때문에 실패 → 폰트 다운/복구 사이클 필요**(§5).
   `restoreFailed: []` 확인. 전 텍스트 스타일이 `수정됨` 으로 잡히므로 §4.3 경로로 재게시 필요.
10. (2026-08-31) B트랙 P3.b — `TripCard` `198:329` 신설(§3.2). 외근 목록 카드, ended 배리언트 2종.
    상태·보고서 배지는 Badge 인스턴스, 지도 버튼은 `map`/`map-outline` 아이콘 2개를 겹쳐 `Map focused` 로 토글.
    아이콘 2개 `80:2` 에 추가(§3.3). 폰트 다운/복구 사이클 후 `restoreFailed: []` 확인, 라이브러리 재게시(`MenuRow` 제외, `변경되지 않음 (119)`).
11. (2026-08-31) B트랙 P3.c — FieldFilterBar/TripFilterBar/ReportFilterBar 는 전부 `FilterAccordion` 껍데기 + 그룹 정의뿐이라
    새 컴포넌트가 필요한 부분은 날짜 범위 행 하나. `FilterDateRow` `201:319` 신설(label + 값 + `calendar-outline`, Filled 2종, props Label·Value).
    폰트 사이클 후 `restoreFailed: []`, `MenuRow` 제외 재게시.
12. (2026-08-31) B트랙 P3.d — `MapSheetLayout` `204:323` 신설. `MapSheetLayout.tsx` 의 시트 셸(rounded-top surface + grabber + header)을
    컴포넌트화. `state=peek`(핸들 띠만) / `state=open`(grabber + back·제목·액션 + content placeholder). 3스냅(peek/55%/max)은 동작이라 화면 문서에만.
    폰트 사이클 후 `restoreFailed: []`, `MenuRow` 제외 재게시. ※ 재게시 직후 브라우저가 스타일 참조 컴포넌트 ~13개를 `수정됨` 으로 다시 표시했으나
    **페이지 새로고침 시 사라짐**(stale diff). 루프 돌지 말 것 — 새로고침 후 `변경되지 않음 (121)` 확증.
13. (2026-08-31) B트랙 P3.e — `DestinationRow` `207:331` 신설. `DestinationRow.tsx` 를 컴포넌트화 — 순번 원 + 주소/상세 + 상태 Badge.
    `isCurrent=true` 는 카드·순번 원을 primary/primary-muted 로 칠하고 순번 텍스트를 `on/primary`. props Order·Address·Detail·Show detail, Badge 는 중첩 인스턴스.
    폰트 사이클 후 `restoreFailed: []`, `MenuRow` 제외 재게시, 새로고침 후 `변경되지 않음 (122)` 확증.
14. (2026-08-31) B트랙 P3.f(마지막) — 지도 chrome 3개. `MapSearchBar` `211:316`(부유 검색 pill, `elevation/raised`) ·
    `MapFab` `211:322`(44px 원형 버튼, `layers-outline` 아이콘 + `Show badge` primary 점) · `MapLegend` `211:395`(heatmap: heat/* 4색 바 / choropleth: `choropleth/base` 5단계 스와치).
    ⚠️ `createComponentFromNode` 가 페인트 opacity 를 1 로 정규화 → 스와치 반투명을 컴포넌트화 후 명시 재적용해야 했다.
    폰트 사이클 후 `restoreFailed: []`, `MenuRow` 제외 재게시, 새로고침 후 `변경되지 않음 (125)` 확증. **B트랙 종료 — 다음은 A트랙.**
15. (2026-08-31) A트랙 재개 — `외근 시작 · 현장 선택` 화면(`215:260`/`215:261`, §3.4·§4.4-a). B트랙 컴포넌트로 조립한 첫 화면.
    **패턴**: `content`/`SLOT` 이 있는 셸 컴포넌트(`MapSheetLayout`·`StickyBottomBar`)는 인스턴스 후 `detachInstance()` 하고 안쪽을 채운다.
    `FilterAccordion` 인스턴스는 데모 head 를 달고 오므로 detach → relabel, head 추가는 clone(폰트 다운 창에서). FieldCard×6 검증 완료.
    폰트 사이클 후 `restoreFailed: []`, `MenuRow` 제외 재게시, 새로고침 후 `변경되지 않음` 확증. 10/28.
16. (2026-08-31) A트랙 — `보고서 작성` 화면(`220:442`/`220:443`, §3.4·§4.4-a). `보고서` 부모 tier2. 지도 없는 폼이라 셸 detach 불필요.
    header(chevron-back + h3) + 제목 `Input` + `연결 외근` label + tripCard(`Card` padding=md 인스턴스 detach → briefcase + 제목 + meta + `외근 변경` ghost) +
    스캐폴드 안내 caption + `위치도 — 현장 4곳` label + 지도 placeholder(`bg/surface-muted` + radius/lg) + `보고서 만들기` Button(primary lg + document-text).
    폰트 사이클 후 `restoreFailed: []`, `MenuRow` 제외 재게시, 새로고침 후 `변경되지 않음 (125)` 확증. 11/28.
17. (2026-08-31) A트랙 — `현장 등록` 화면(`225:461`/`225:462`, §3.4·§4.4-a). `fields/new.tsx` 스크롤 폼.
    **부모 SECTION 확장**: `현장` 을 534→1034 로 넓히고 `보고서`(x1080→1580)·`내 정보`(x1680→2180)를 밀어 tier2 에 카테고리 관리 옆 슬롯을 만들었다(§3.4).
    `ProjectPicker`/`CategoryMultiPicker` 는 DS 컴포넌트가 없어 solid primary trigger 로 근사. `FieldLabel` 은 `Show counter=false`.
    `FilterChip state=active` 인스턴스 Label 렌더 실패 → `state=default` 를 intent 색으로 수동 recolor(코드 `activeColor` 방식). 폰트 사이클 후 `restoreFailed: []`, `MenuRow` 제외 재게시, `변경되지 않음 (125)`. 12/28.
18. (2026-08-31) A트랙 — **첫 탭 루트** `외근 내역`(`229:498`/`229:499`, §3.4·§4.4-a). `trips/index.tsx`, tier 1.
    `MapSheetLayout`(state=open, Show back=false) detach → toolbar(Input + TripFilterBar[FilterAccordion detach·relabel 기간/보고 여부] + weekStats 3열 `metricSm`) + `TripCard` 리스트(날짜 그룹) + `StickyBottomBar` detach → `외근 시작` Button.
    사이징 체인: shell/content/list 전부 `FILL` 로 세팅해야 프레임을 채운다(trips/new/select 와 동일 함정). 폰트 사이클 후 `restoreFailed: []`, `MenuRow` 제외 재게시, `변경되지 않음`. 13/28.
19. (2026-08-31) A트랙 — `현장 (목록)` 탭 루트(`232:592`/`232:593`, §3.4·§4.4-a). `fields/index.tsx`, tier 1. `외근 내역` 골격 복제.
    `FieldFilterBar` = FilterAccordion detach 후 4-head(조치상태/프로젝트/카테고리/방문일, 데모 head 2 + clone 2). `FieldStatusSummary` 는 DS 컴포넌트가 아니라 수동 조립(`metric` + dot 캡션 + flexGrow 분포 바). StickyBottomBar 는 2버튼(새 현장 + 촬영). 폰트 사이클 후 `restoreFailed: []`, `MenuRow` 제외 재게시, `변경되지 않음 (125)`. 14/28.
20. (2026-08-31) A트랙 — `보고서 (목록)` 탭 루트(`237:724`/`237:725`, §3.4·§4.4-a). `reports/index.tsx`, tier 1. **탭 루트 4/4 완료.**
    toolbar = Input + ReportFilterBar(FilterAccordion detach → `작성일` 1-head, 데모 head 2번째 제거). 그룹 = tripHeader(briefcase + `외근 · 날짜` + meta + chevron) + 보고서 Card(md detach: 2줄 제목 + `수정됨` Badge + calendar + 날짜).
    ※ 사이징 체인 FILL 은 같은 스크립트 안에서 세팅(별도 fix 패스 불필요). 폰트 사이클 후 `restoreFailed: []`, `MenuRow` 제외 재게시, `1개의 변경 사항`. 15/28. Figma 탭 열어 둠(사용자 지시).
21. (2026-08-31) A트랙 — `외근 정리`(외근 상세, `241:747`/`241:748`, §3.4·§4.4-a). `trips/[id].tsx`, tier 2(외근 시작 옆, 외근 부모 1034 폭에 2열).
    `MapSheetLayout` detach + header(h2-heavy + edit 버튼 + 메타 + statsCard Card lg detach) + `ReviewVisitCard` collapsed(Card md detach)×3 + skipped Card + StickyBottomBar.
    ⚠️ Card detach 후 `layoutMode` 를 HORIZONTAL 로 바꾸면 `primaryAxisSizingMode='FIXED'` 명시 필요. Badge `Label` 이 안 뜨면 텍스트 노드 직접 set. 폰트 사이클 후 `restoreFailed: []`, `MenuRow` 제외 재게시. 16/28.
22. (2026-08-31) B트랙 아이콘 — `icon/sparkles`(`251:803`) TTF 추출·게시(§3.2). A트랙 — `진행 중 외근`(`254:803`/`254:804`, §3.4·§4.4-a). `trips/active.tsx`, tier 1(외근 내역 옆, 외근 부모 1034 폭에 2열). **탭 루트 4/4 + 진행 중 + 외근 상세.**
    시트 chrome 은 수동 조립(headerRight 가 `촬영` Button, initialIndex=1 비율) + TripProgressStrip + CurrentDestCard(수동) + `DestinationRow`×3.
    ※ 폰트 복구는 **스타일 `fontFamily` 변수 재바인딩만** — `s.fontName` 을 Pretendard 로 직접 세팅하면 "unloaded font" 로 실패(런타임에 Pretendard 없음). 스타일 참조 노드는 재바인딩만으로 Pretendard 를 따라온다. `DestinationRow` 중첩 badge 는 인스턴스 후 `inst.findOne(badge).setProperties()` 로 relabel 됨(중첩 인스턴스 안 인스턴스는 됨 — 중첩 인스턴스 안 컴포넌트만 안 됨). 폰트 사이클 후 `restoreFailed: []`, 재게시 `변경되지 않음 (127)`. 17/28.
23. (2026-08-31) A트랙 — `현장 상세`(`262:855`/`262:856`, §3.4·§4.4-a). `fields/[id]/index.tsx`, tier 2. `현장` 부모 1034→1520 확장, `보고서`→x2066·`내 정보`→x2666 이동.
    MapSheetLayout `initialIndex=2` → 시트 chrome 수동 + map absolute 72 + sheet/content HUG. 상태 pill·메모 카드·visit 카드는 수동 표면(surface+border+radius). `GroupLabel`·`Input`·`Badge` 인스턴스.
    ⚠️ 프레임 `primaryAxisSizingMode` 를 AUTO 로 두고 나중에 `resize(w,h)` 하면 FIXED 로 굳는다 — 다시 AUTO 로 세팅해야 HUG. sheet 는 `layoutSizingVertical='HUG'` + `primaryAxisSizingMode='AUTO'` 둘 다.
    폰트 사이클 후 `restoreFailed: []`, 재게시 `변경되지 않음 (127)`(게시 스피너가 멈춘 채 남지만 서버엔 반영됨 — 새로고침 확인). 18/28.
24. (2026-08-31) A트랙 — `보고서 상세`(`270:888`/`270:889`, §3.4·§4.4-a). `reports/[id]/index.tsx`, tier 2. `보고서` 부모 534→1034 확장, `내 정보`→x3166 이동.
    MapSheetLayout `initialIndex=1` → 시트 chrome 수동 + map absolute 180 + sheet/content HUG. tripLink pill·FieldReportCard 는 수동 표면. 빈 전·중·후 슬롯은 `frame.dashPattern=[4,4]` + `없음`. `Button`(수정/삭제 ghost·dangerGhost) 인스턴스.
    ※ meta "작성: … · 수정: …" 41자 = 실제 카피, 40자 규칙 예외(`over40` 1 정상). 폰트 사이클 후 `restoreFailed: []`, 재게시 `변경 사항 없음`. 19/28.
