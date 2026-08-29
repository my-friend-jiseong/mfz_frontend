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
지금은 **`UI` 페이지에 화면 프레임을 옮기는 단계**(4/28)다. 남은 것은 §4.4.

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
| 컴포넌트 | `3:20` | 3317 | -105 | 1668 | 4020 |
| 아이콘 | `80:2` | 5100 | -105 | 1360 | 1266 |
| 상태 배지 | `94:2` | 5100 | 1300 | 807 | 934 |

섹션 겹침 0 · 자식 이탈 0 (2026-08-29 재검증).

### 3.2 컴포넌트 — 14개 (모두 `컴포넌트` 섹션 `3:20` 안)

COMPONENT_SET 9개:

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

단일 COMPONENT 5개: GroupLabel `44:2` · FieldLabel `44:4` · StickyBottomBar `45:9` ·
EmptyState `101:3` · ErrorState `101:11`

### 3.3 토큰

- **변수 170개 / 6 컬렉션** — Primitives `16:2`(79) · Color `16:3`(41) · Spacing `16:4`(13) ·
  Typography `16:5`(18) · Motion `89:4`(7) · Map `93:2`(12).
  `ALL_SCOPES` 0건, code syntax 누락 0건.
- **텍스트 스타일 25개** — 코드 대응 9(`h1 h2 h3 bodyLg body bodySm caption metric metricSm`)
  \+ 굵기 조합 6(`body-bold body-semibold bodySm-bold bodySm-semibold caption-semibold caption-bold`)
  \+ `groupLabel` + 문서 가구 8(`docs/*`).
  ※ `body-semibold` 는 EmptyState/ErrorState 제목용으로 이번에 추가됐다.
- **아이콘 67개** — `icon/<name>`, 24×24, `node_modules` 의 `Ionicons.ttf` 에서 윤곽선 직접 추출.
- **폰트** — 전 텍스트 Pretendard. 스타일은 전부 `font-family/base`(`VariableID:58:2`) 바인딩.

### 3.4 `UI` 페이지 (`0:1`) — 화면

사용자가 만든 자리다. 섹션 이름은 `N_화면이름`, 그 순서가 작업 순서다.

| 섹션 | id | 프레임 | 상태 | 대응 코드 |
|---|---|---|---|---|
| `0_회원가입` | `3:3` | `114:3` · 390×852 | 빈 폼(첫 진입) | `app/(auth)/signup.tsx` |
| | | `116:37` · 390×956 | 유효성 검사 실패 | 같은 파일 `validate()` |
| `1_로그인` | `124:75` | `124:77` · 390×567 | 빈 폼(첫 진입) | `app/(auth)/login.tsx` |
| | | `128:91` · 390×587 | invalid_credentials | 같은 파일 `handleLogin()` |
| `2_내정보` | `136:137` | `136:139` · 390×767 | 기본 | `app/(tabs)/profile/index.tsx` |
| `3_카테고리` | `150:183` | `150:185` · 390×844 | 목록 + 인라인 편집 1행 | `app/(tabs)/fields/categories.tsx` |

오류 프레임은 `validate()` 가 만드는 조합을 그대로 그렸다 — 필드 4개 `state=error` +
약관 오류 caption. **`globalError` 는 넣지 않았다**: 검증 실패면 서버를 호출하기 전에 return 하므로
필드 오류와 동시에 뜰 수 없다.

프레임 폭은 390 고정, 높이는 **스크롤 전체**(뷰포트 844 는 `docs/caption` 한 줄로 적는다).

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

**4~6차 게시(2026-08-29)** — `1_로그인`·`2_내정보`·`3_카테고리` 폰트 사이클 변경(스타일·컴포넌트, **내용 변화 없음**).
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

#### (a) 화면 프레임 — 진행 중 (4/28)

**자리는 `UI` 페이지(`0:1`)다.** 사용자가 `0_회원가입`(`3:3`) 섹션을 만들어뒀다 —
탭 루트부터가 아니라 **`N_화면이름` 번호 순서**가 사용자의 규칙이므로 그걸 따른다.
프레임 폭 390, 높이는 스크롤 전체(뷰포트 844 는 `docs/caption` 한 줄로 표기).

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
- **탭 루트 4개는 전부 `MapSheetLayout`**(trips·fields·reports 목록 + reports 도) — 스냅 3프레임 필요, 별도 세션. profile·categories 처럼 지도 없는 화면부터 훑는 게 빠르다.
- 다음: `4_` — `profile/edit` · `fields/new` · `reports/new` · `reports/[id]/edit` · `trips/[id]/edit` · `fields/[id]/checkin` 등 폼·서브 화면.

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
