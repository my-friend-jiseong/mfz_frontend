---
name: figma-design-system
description: |
  일가요 Figma 디자인 시스템 파일(DesignSystem 페이지)을 읽거나 고칠 때 사용한다.
  트리거: "디자인 시스템", "피그마", "토큰 반영", "컴포넌트 추가", "아이콘",
  "색상표/타이포그래피/모션/상태 배지/지도 척도 섹션", figma.com/design/MlfpDS0wOeN90iNl5JCPWp URL.
  Figma 서버 런타임의 폰트·변수·인스턴스 함정과, 반복해서 어겼던 문서 톤 규칙을 담는다.
---

# 일가요 Figma 디자인 시스템

**코드가 원본이고 Figma 가 사본이다.** 값이 어긋나면 `src/theme/` 이 이긴다.
근거 문서는 `docs/reference/design-system.md` §15.

---

## 1. 글쓰기 규칙 — 가장 자주 어긴 것

사용자가 세 번 지적했다: *"뭔 글이 이렇게 많아"*, *"AI 특유의 장황함을 억제해"*, *"또 장황한 설명이 있어"*.

- **캔버스 텍스트는 40자 이내.** 현재 파일 최댓값 39자. 넘기면 그건 문서가 아니라 주석이다.
- **컴포넌트 description 은 한 줄.** "액션 버튼. variant 5종 × size 3종, disabled 포함." 정도.
- **변수 description 도 한 줄.** 같은 문장을 여러 변수에 반복 금지(spacing 6개에 같은 꼬리 문장을 붙였다가 걷어냈다).
- **작업 과정을 캔버스에 쓰지 않는다.** "node_modules 의 ttf 에서 추출했다" 같은 문장은 커밋 메시지나 §15 에 쓴다.
- **이유·근거는 옮겨 적지 않는다.** 코드 주석과 `design-system.md` 에 이미 있다. 두 벌이 되면 갈라진다.
- 마크다운(`**bold**`)·HTML 엔티티(`&#39;`)는 Figma 에서 **그대로 보인다.** 쓰지 말 것.

섹션 구조는 통일한다: `docs/title`(40) 제목 + `docs/caption`(14) 한 줄 → 그룹들.

---

## 2. 구조 규칙

- **사용자가 만들어둔 섹션 안에 넣는다.** 스킬 관례대로 새 페이지를 만들지 않는다.
- **SECTION 자식의 `x`/`y` 는 섹션 기준 상대좌표다.** `node.x = section.x + 80` 은 틀렸다. `node.x = 80` 이 맞다.
- **검증은 `absoluteBoundingBox` 로만.** `node.x` 와 `section.x` 를 직접 비교하면 좌표계가 섞여 이탈을 놓친 채 통과한다(실제로 그렇게 오검증했다).
- 컨테이너를 키운 뒤 형제 섹션과 겹치는지 확인한다.

---

## 3. 런타임 함정 (전부 실제로 당한 것)

### 3.1 폰트 — Pretendard 는 이 런타임에 없다
서버 쪽 구글 폰트 세트만 있다(`Arial` 조차 없다). 로컬 설치는 무관하다.

- **되는 경로:** STRING 변수(`scopes:['FONT_FAMILY']`)에 폰트명 → `textStyle.setBoundVariable('fontFamily', v)`
- **안 되는 경로:** `node.setBoundVariable('fontFamily')`, `node.fontName = …`, Pretendard 상태 스타일을 노드에 `setTextStyleIdAsync`
- **변수 생성과 바인딩은 다른 호출로 나눈다.** 같은 스크립트면 "unloaded font" 로 실패한다. 재시도 루프(3~4회) 권장.
- **텍스트를 고치려면:** ① 관련 스타일을 `42dot Sans` 로 내린다(face 이름 유지) → ② 편집·스타일 적용 → ③ `font-family/base`(`VariableID:58:2`)로 되돌린다.
- face 이름은 공백 없이: `Regular` `SemiBold` `Bold` `ExtraBold`. Inter 의 `Semi Bold`(공백)로 만들면 Pretendard 에 없는 face 가 되어 누락 스타일로 뜬다.
- **노드에 `letterSpacing`·`textCase` 를 덮으면 스타일 링크가 끊긴다.** 그런 처리는 스타일이 갖게 한다(`groupLabel`).

### 3.2 페인트 — 값이 안 풀린다
`setBoundVariableForPaint({color:{r:0,g:0,b:0}}, …)` 는 바인딩만 걸고 `color` 를 검정으로 남기는 경우가 있다.

```js
// 값을 먼저 해석해서 넣고 그 다음 바인딩한다
const rgba = await resolve(varId);            // 별칭이면 재귀
const p = { type: 'SOLID', color: { r: rgba.r, g: rgba.g, b: rgba.b } };
const paint = figma.variables.setBoundVariableForPaint(p, 'color', variable);
```
- `paint.opacity` 는 바인딩을 거치며 **사라진다.** 반투명은 바인딩 후 `Object.assign({}, p, {opacity})` 로 다시 얹는다.
- 세트를 만든 뒤 `fills` 전수 검사로 `color` vs 해석값 불일치를 확인한다.

### 3.3 불투명도 변수는 % 단위
`OPACITY` 스코프 FLOAT 는 **0–100** 이다. 코드의 `0.4` 는 Figma 값 **`40`**. 0.4 를 넣으면 실제 불투명도가 0.004 가 된다.
`opacity/*` 와 `choropleth/bin-*` 이 여기 해당한다.

### 3.4 바인딩 대상이 없는 값은 scope 를 비운다
`duration/*`, `heat/max`, `heat/radius` → `v.scopes = []`. `ALL_SCOPES` 는 픽커를 오염시킨다(현재 위반 0건 유지).
easing(cubic-bezier)은 변수 타입이 없다 — 곡선으로만 그린다.

### 3.5 인스턴스
- **컴포넌트 안에 들어간 인스턴스는 `children` 이 빈 배열이다.** 색을 덮으려면 **페이지에 두고 덮은 뒤 `insertChild` 로 옮긴다.** 오버라이드는 이동 후에도 유지된다.
- `componentPropertyReferences` 를 걸면 가시성이 프로퍼티 기본값을 따른다. **참조를 먼저 걸고 `visible` 을 나중에** 설정한다.
- 인스턴스 생성은 내부 텍스트 폰트 로드를 요구한다 → Pretendard 컴포넌트는 이 런타임에서 인스턴스화 불가. 메인 컴포넌트 직접 조작·스크린샷은 된다.
- SVG 로 만든 아이콘은 자식에 `constraints = {horizontal:'SCALE', vertical:'SCALE'}` 를 줘야 리사이즈된다.

### 3.6 기타
- 기존 COMPONENT_SET 에 `addComponentProperty` 로 INSTANCE_SWAP 추가 가능.
- 스크립트는 원자적이다. 실패하면 아무것도 안 바뀐다 — 고치고 재시도해도 안전하다.

---

## 4. 아이콘

`node_modules/@expo/vector-icons/.../Ionicons.ttf` 에서 윤곽선을 **직접 추출**한다(다운로드 금지 — 앱이 렌더하는 글리프와 같은 소스여야 한다).
`glyphmap` 으로 이름→코드포인트, `cmap`/`loca`/`glyf` 파싱 → SVG path. viewBox `-12 -460 536 536`(정사각, cloud 계열 4개가 em 박스를 넘어 잘림 방지).
컴포넌트 이름 `icon/<name>`, 24×24, fill 은 `text/default` 바인딩. 컴포넌트 안에서는 배리언트 tint 로 덮는다.

---

## 5. 검증 체크리스트

작업 끝에 반드시 돌린다.

- [ ] 섹션 겹침 0 · 자식 이탈 0 (**`absoluteBoundingBox`** 로)
- [ ] 페이지 최상위 떠 있는 노드 0
- [ ] 텍스트 폰트 전부 Pretendard, 스타일 전부 `fontFamily` 바인딩
- [ ] 캔버스 텍스트 40자 초과 0 · description 한 줄
- [ ] 변수 `ALL_SCOPES` 0 · code syntax 누락 0
- [ ] 바인딩된 페인트의 `color` 가 변수 해석값과 일치
- [ ] 불투명도 바인딩 노드가 0.1 미만이 아닌지(% 단위 실수 탐지)

---

## 6. 파일 좌표

`fileKey` `MlfpDS0wOeN90iNl5JCPWp` · 페이지 `DesignSystem` `3:4` · `UI` `0:1`

**화면은 `UI` 페이지에 넣는다.** 사용자가 만든 `N_화면이름` 섹션(`0_회원가입` `3:3`)이 기준이다 — 폭 390, 높이는 스크롤 전체, 뷰포트 844 는 `docs/caption` 한 줄로 적는다. 없는 아이콘은 TTF 에서 추출해 먼저 채운다.

| 섹션 | id | 컴포넌트 세트 | id |
|---|---|---|---|
| 색상표 | `3:16` | Button | `37:118` |
| 간격·반경 | `27:2` | Badge | `40:38` |
| 그림자 | `27:3` | Card | `41:18` |
| 타이포그래피 | `27:4` | FilterChip | `42:20` |
| 모션 | `90:2` | Input | `43:30` |
| 상태 배지 | `94:2` | GroupLabel · FieldLabel | `44:2` · `44:4` |
| 지도 척도 | `95:2` | LoadingState · StickyBottomBar | `45:8` · `45:9` |
| 아이콘 | `80:2` | | |
| 컴포넌트 | `3:20` | | |

변수 컬렉션: Primitives `16:2` · Color `16:3` · Spacing `16:4` · Typography `16:5` · Motion `89:4` · Map `93:2`
폰트 변수: `font-family/base` = `VariableID:58:2`
