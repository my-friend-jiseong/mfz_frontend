# 일가요 디자인 시스템

프론트엔드(React Native + Expo) 디자인 시스템의 단일 진실 출처. 화면 코드는 항상 토큰(`src/theme/`)과 공용 컴포넌트(`src/components/ui/`)를 통해서만 스타일을 표현한다.

---

## Direction — 야외 계측기 (2026-07-30 확정)

사용자는 **이동 중이거나 현장에 서 있는 가로수·현장 점검 담당자**다. 5분 전에 한 곳을 방문 완료 처리했고 5분 뒤 다음 목적지로 걷는다. 핵심 동사는 **"다음 목적지를 찾아 방문 결과를 남긴다"**.

그래서 이 앱은 읽는 문서가 아니라 **들고 다니는 계측기**다.

| 결정 | 내용 |
|---|---|
| **온도** | cold neutral(slate) + blue brand 유지. 햇빛 아래 대비가 우선 — 따뜻한 종이 느낌은 야외에서 읽히지 않는다. |
| **위계** | 화면의 focal element 는 거의 항상 **숫자**(진행률·방문 수·경과·거리). 숫자가 화면을 지배한다. |
| **밀도** | 터치 타깃 44px 이상 유지. 밀도를 위해 깎지 않는다 — 장갑 낀 손, 흔들리는 버스. 값은 `touchTarget`(control 44 / row 48, 2절). 보이는 크기가 그보다 작아야 하는 컨트롤은 `hitSlop` 으로 채운다. |
| **Signature** | 색 + 형상 + 라벨 3중 인코딩 상태 배지(6절). 상태를 표시하는 새 UI는 전부 이 규칙을 따른다. |

### 거부하는 기본값

1. **흰 카드 균일 나열** → 상태가 먼저 읽히는 목록. 카드 크기·간격을 균일하게 두지 않는다.
2. **숫자를 라벨과 같은 크기로** → `metric` / `metricSm` variant (3절). 라벨보다 두 단계 위.
3. **제목 없이 리스트로 시작하는 화면** → 화면마다 focal element 를 지정한다(강령 1).
4. **다크 모드** → **하지 않는다.** "플랫폼상 불가" 가 아니라 **Direction 상 안 한다**: 사용자는
   주광 아래 현장에 서 있고, 그 조건에서는 밝은 배경 + 진한 글자가 읽힌다. 어두운 화면은
   실내 기준의 기본값이다. (2026-07-30 확정 — `.interface-design/system.md` §3 이 "'불가'가
   아니라 '안 함'이라는 이유가 SSOT 에 없다" 고 남겨둔 항목을 여기로 옮겨 닫았다. 코드에도
   다크 모드 분기는 없다 — `useColorScheme` callsite 0.)

---

## 1. 폰트 — Pretendard

- 위치: `assets/fonts/Pretendard-{Regular,SemiBold,Bold,ExtraBold}.otf` (총 ~5.95MB)
- 로드: `app/_layout.tsx` 의 `useFonts(FONTS_TO_LOAD)`. 부팅 시 splash gate.
- 실패 처리: `fontError` 발생 시 console 경고만 남기고 진행(OS fallback). 데드락 차단.
- Medium(500) 폰트는 callsite 0 + 시각 차이 미미로 미로드. weight 토큰만 보존.

```ts
fontFamily = {
  regular:  'Pretendard-Regular',   // 400
  semibold: 'Pretendard-SemiBold',  // 600
  bold:     'Pretendard-Bold',      // 700
  heavy:    'Pretendard-ExtraBold', // 800
}
```

> RN `Text.defaultProps` monkey-patch 는 사용하지 않는다. 공용 `ui/Text` 컴포넌트가 `fontFamily` 를 항상 명시한다.

---

## 2. Atom 토큰 (`src/theme/spacing.ts`)

| 그룹 | 토큰 | 값 |
|---|---|---|
| **spacing** | xs / sm / md / lg / xl / xxl | 4 / 8 / 12 / 16 / 24 / 32 |
| **radius** | sm / md / lg / pill | 6 / 10 / 16 / 999 |
| **fontSize** | xs / sm / base / lg / xl / xxl | 12 / 14 / 16 / 18 / 22 / 28 |
| **fontWeight** | regular / medium / semibold / bold / heavy | 400 / 500 / 600 / 700 / 800 |
| **lineHeight** | xs / sm / base / lg / xl / xxl | 16 / 20 / 24 / 26 / 30 / 36 |
| **touchTarget** | control / row | 44 / 48 — 인라인 컨트롤 / 전폭 행·입력란. 종류로 정해진다(14절 실측) |
| **listBottomInset** | (단일 값) | 120 — 목록 콘텐츠 하단. tier 가 아니라 '무엇을 피하는가'(탭바 + 부유 chrome)로 정해진다 |

> `fontSize: 18` 처럼 매직넘버를 직접 쓰지 않는다. 토큰에 없는 값이면 토큰을 추가한다.
> **같은 값이 여러 화면에 반복되면 그건 매직넘버가 아니라 없는 토큰이다** — `listBottomInset` 이 그렇게 생겼다(5 화면에 `120`).

### 2.1 간격 tier — 어떤 토큰을 쓸지 정하는 규칙

값을 눈대중으로 고르지 않는다. **"무엇과 무엇 사이인가"** 로 토큰이 정해진다.

| 토큰 | 값 | tier | 쓰는 곳 |
|---|---|---|---|
| `xs` | 4 | micro | 아이콘 ↔ 라벨, 배지 내부 |
| `sm` | 8 | inner | 한 덩어리 안의 줄 사이, 목록 항목 사이 |
| `md` | 12 | component | 카드 내부 블록 사이 |
| `lg` | 16 | group | 카드 패딩, 카드 ↔ 카드 |
| `xl` | 24 | section | 그룹 ↔ 그룹 |
| `xxl` | 32 | major | 영역 ↔ 영역, 화면 상하 끝 |

리듬은 **불균등해야** 한다 — 같은 그룹 안은 `sm`, 그룹 사이는 `xl`. 전부 `lg` 로 균일하면 무엇이 한 덩어리인지 눈이 못 읽는다.

### 2.2 Concentric radius

둥근 자식이 둥근 부모 안에 **8px 이하로 inset** 될 때만 `자식 = 부모 − inset`.
(예: `radius.md`(10) 컨테이너 + `spacing.xs`(4) 패딩 → 자식 `radius.sm`(6))
inset 이 그보다 크면 두 모서리가 시각적으로 연결되지 않으므로 규칙이 걸리지 않는다.

---

## 3. Typography Composite (`src/theme/typography.ts`)

| Variant | 매핑 | 의미 |
|---|---|---|
| `h1` | xxl + heavy + ExtraBold | 페이지 제목 |
| `h2` | xl + bold + Bold | 중형 제목 |
| `h3` | lg + bold + Bold | 카드 제목·소형 제목 |
| `bodyLg` | lg + regular + Regular | 큰 본문 |
| `body` | base + regular + Regular | 본문 (default) |
| `bodySm` | sm + regular + Regular | 라벨·작은 본문 |
| `caption` | xs + regular + Regular | 캡션·메타 |
| `metric` | xxl + heavy + ExtraBold + **tabular-nums** | 화면의 focal 숫자 |
| `metricSm` | xl + bold + Bold + **tabular-nums** | 보조 숫자 |

**강조는 `<Text weight="...">` 단일 채널**로 통일. `bodyBold` 류 별도 variant 없음.

### 3.1 숫자 (Direction: 야외 계측기)

이 앱의 focal element 는 거의 항상 숫자다. 라벨과 같은 크기로 두면 위계가 사라진다.

- **focal 숫자**는 `metric` / `metricSm`. 짝이 되는 라벨은 `caption` + `textMuted` + `semibold`.
- **그 외 variant 안에 섞이는 변하는 숫자**(카운트·시각·거리)는 `<Text numeric>` — `fontVariant: ['tabular-nums']` 를 붙여 자릿수가 바뀌어도 폭이 안 흔들리게 한다.
- 크기·굵기·색 **세 축을 함께** 쓴다. 굵기와 색만으로는 야외 조도에서 위계가 안 선다.

---

## 4. Palette (`src/theme/palette.ts`)

Tailwind 호환 raw hue × shade. **화면 코드에서 직접 import 금지** — 항상 `colors.*` semantic 토큰으로 진입.

- Hue: `slate / blue / green / red / amber / sky / violet`
- Shade: `50 / 100 / 200 / 300 / 400 / 500 / 600 / 700 / 800 / 900 / 950`
- 보조: `white / black / transparent`
- 제거됨: `pink / teal` (YAGNI). 차트·태그 카테고리 hue 가 필요해지면 그때 추가.

---

## 5. Colors — Semantic (`src/theme/colors.ts`)

### 5.1 Foreground (text·icon)

| 토큰 | 값 | 용도 |
|---|---|---|
| `text` | slate.900 | primary — 헤딩·강조 본문 |
| `textMuted` | slate.500 | secondary — 메타·보조 |
| `textSubtle` | slate.400 | tertiary — placeholder |
| `textInverse` | slate.50 | 다크 배경 위 (profile avatar 1 곳) |

### 5.2 Background (surface 위계)

| 토큰 | 값 | 용도 |
|---|---|---|
| `background` | slate.50 | canvas — 화면 root |
| `surface` | white | 카드·input 표면 |
| `surfaceMuted` | slate.100 | 약한 분리 영역 (readonly 등) |
| `overlay` | rgba(15,23,42,0.45) | modal dim |
| `shadow` | slate.900 | elevation 의 색 |

### 5.3 Border

| 토큰 | 값 | 용도 |
|---|---|---|
| `border` | slate.200 | default |
| `borderMuted` | slate.100 | 약한 구분선 |
| `focus` | blue.500 | 포커스 ring |

### 5.3.1 Control — 입력 표면 (`colors.control.*`)

**입력은 inset** — 주변 표면보다 어둡다. 이전엔 `Input` 이 `surface`(흰색) + `border` 라 `Card` 와 채움·테두리·radius 가 전부 같아 **테두리 색으로만** 구분됐다. 흰 카드 위에서도 slate50 캔버스 위에서도 채움만으로 "여기에 입력" 이 읽히도록 surface 토큰과 **분리**한다.

| 토큰 | 값 | 용도 |
|---|---|---|
| `control.bg` | slate.100 | 입력 채움 (inset) |
| `control.bgDisabled` | slate.200 | 비활성 채움 |
| `control.border` | slate.200 | 기본 테두리 |
| `control.borderFocus` | blue.500 | 포커스 |
| `control.borderError` | red.600 | 오류 |

> 상태 우선순위: **error > focus > disabled > default**. 테두리 **색만** 바꾼다 — `borderWidth` 를 키우면 폼 전체가 1px 씩 밀린다.

**폼 안에서는 채움이 곧 "편집 가능" 신호다.**

`control.bg` 는 `surfaceMuted` 와 **같은 값(slate.100)** 이다. 그래서 폼 안 읽기 전용 블록에 `surfaceMuted` 를 채우면 입력란과 구별되지 않는다(2026-07-30 `fields/[id]/edit.tsx` 주소 블록에서 실제로 발생).

| 폼 안 요소 | 표현 |
|---|---|
| 편집 가능한 입력 | `control.bg` 채움 + `control.border` |
| 읽기 전용 내용 블록 | `surface`(흰색) + `borderMuted` — **채우지 않는다** |
| 비활성 입력 | `control.bgDisabled` + opacity 0.7 |

> 폼 **밖**에서 `surfaceMuted` 를 쓰는 건 문제없다 (아이콘 버튼 배경, 진행률 트랙, 지도 chrome 등 — 입력란과 같은 자리에 서지 않는다).

### 5.4 Brand / Intent (강 + Muted)

| 의미 | 강 | 약 |
|---|---|---|
| brand | `primary` blue.600 | `primaryMuted` blue.100 |
| success | `success` green.600 | `successMuted` green.100 |
| danger | `danger` red.600 | `dangerMuted` red.100 |
| warning | `warning` amber.600 | `warningMuted` amber.100 |
| info | `info` sky.600 | `infoMuted` sky.100 |
| neutral | — | `neutralMuted` slate.100 |

### 5.5 Inverse (단색 배경 위 전경)

- `onPrimary` — white
- `onDanger` — white

### 5.6 Domain — Status

```ts
fieldStatus = { pending: amber.500, in_progress: blue.600, done: green.600 }

visitStatus = {
  completed:       green.600,
  absent:          slate.500,
  refused:         red.600,
  unknown_address: violet.500,
  revisit_needed:  amber.600,
  other:           slate.600,
}

tripBanner = blue.600   # 활성 외근 배너 = brand. 빨강은 파괴적 액션 전용 (UI/UX P1-2)
```

### 5.7 Alpha 합성

`withAlpha(hex, 0~1)` → `#RRGGBBAA`. status chip active 배경(`withAlpha(c, 0.13)`) 등 18곳. **알파 합성은 항상 이 헬퍼**로.

---

## 6. Status Badge 매핑 (`src/theme/statusBadge.ts`)

색 + 형상 + 라벨 3중 인코딩(WCAG/KWCAG). 단일 진실 출처.

형상은 **도메인 안에서만** 색을 보완한다. 같은 화면에 두 도메인의 배지가 나란히 서지 않으므로 도메인 간 형상이 겹쳐도 된다(▲ 는 visit 에선 '거절', field 에선 '진행 중'). 한 도메인 안에서 겹치면 그건 버그다.

```ts
FIELD_STATUS_BADGE = {
  pending:     { tone: 'warning', shape: 'circle'   }, // ● 조치 전
  in_progress: { tone: 'primary', shape: 'triangle' }, // ▲ 조치 중
  done:        { tone: 'success', shape: 'square'   }, // ■ 조치 완료
}

VISIT_STATUS_BADGE = {
  completed:       { tone: 'success', shape: 'square'   }, // ■
  absent:          { tone: 'neutral', shape: 'circle'   }, // ●
  refused:         { tone: 'danger',  shape: 'triangle' }, // ▲
  unknown_address: { tone: 'info',    shape: 'diamond'  }, // ◆
  revisit_needed:  { tone: 'warning', shape: 'diamond'  },
  other:           { tone: 'neutral', shape: 'diamond'  },
}

DESTINATION_STATUS_BADGE = {
  pending: { tone: 'warning', shape: 'circle',  label: '예정' },
  arrived: { tone: 'success', shape: 'square',  label: '방문 완료' },
  skipped: { tone: 'neutral', shape: 'diamond', label: '건너뜀' },
}
```

**형상 → 글리프 매핑은 `Badge` 가 소유한다** — `BADGE_SHAPE_GLYPH`(`● ▲ ■ ◆`)를 export 하므로,
배지가 아닌 컨트롤도 이 맵을 통해 같은 글리프를 쓴다.

> 이 규칙이 두 번 깨졌다(둘 다 2026-07-30 발견·수정). `FieldCard` 가 `●▲■` 맵과 withAlpha 칩을
> 손으로 갖고 있었고, `fields/[id]/checkin` 도 `VISIT_SHAPE` 라는 자기 맵을 갖고 있었다.
> **두 번 다 값은 정확히 같았다** — 같아서 괜찮은 게 아니라 달라질 수 있어서 합친다.
> 상태 UI 를 새로 만들 때는 `*_STATUS_BADGE` → `BADGE_SHAPE_GLYPH` 두 단계를 거친다.

---

## 7. Elevation (`src/theme/elevation.ts`)

`Platform.select` 로 iOS shadow / Android elevation / web shadow 분기.

**Depth 전략은 하나다 — 섞지 않는다.**

| 대상 | 전략 |
|---|---|
| 문서 흐름 안의 표면 (`Card` · 목록 · 폼) | **테두리**. elevation 을 쓰지 않는다. |
| 지도 위에 떠 있는 chrome | **elevation**. 실제로 떠 있으니 그림자가 의미를 가진다. |

지도 chrome = `MapDashboard` · `MapSearchBar` · `MapFilterBar` · `MapLegend` · `KakaoMapWebView`.

| 레벨 | offsetY | opacity | radius | android |
|---|---|---|---|---|
| `none`   | 0 | 0    | 0  | 0  |
| `card`   | 1 | 0.04 | 6  | 1  |
| `raised` | 2 | 0.08 | 12 | 3  |
| `modal`  | 4 | 0.18 | 32 | 16 |

> 제거됨: `sheet` (callsite 0 — 바텀시트 그림자는 gorhom 자체 처리), `Card variant="elevated"` (callsite 0 + 위 규칙과 상충).

---

## 8. Motion (`src/theme/motion.ts`)

| 그룹 | 토큰 | 값 |
|---|---|---|
| **duration** | instant / fast / base / slow | 80 / 120 / 180 / 240 ms |
| **easing** | standard / emphasized / decel / accel | cubic-bezier 4 종 |
| **opacity** | pressed / disabled / disabledField | 0.85 / 0.4 / 0.7 |

> "200ms 넘으면 사용자가 기다린다." 표준 transition 은 base(180) 이내.
>
> **`opacity.pressed` 는 어두운 표면에서만 쓴다.** 흰 카드(`surface`)를 slate50 캔버스 위에서
> 0.85 로 깔면 합성 결과가 `(254,254,255)` — 채널당 **1/255** 다(2026-07-30 계산). 즉 목록의
> 모든 카드가 press 피드백이 **없었다**. 밝은 표면은 값을 직접 바꾼다 → `colors.surfacePressed`
> (흰색 대비 `(14,10,6)`). `Card` · profile `MenuRow` 적용. filled 버튼(진한 파랑/빨강)은
> opacity 로 충분해 그대로 둔다.
>
> `disabled`(0.4) vs `disabledField`(0.7) — 비활성 표현이 두 값인 건 결정이다. 0.4 는 '못 누른다'를
> 확실히 말하지만 글자를 못 읽게 만들어 **라벨을 다시 읽을 필요 없는 것**(버튼·아이콘)에만 쓴다.
> 입력란·읽기 전용 필드는 비활성이어도 값을 읽어야 하므로 `disabledField`. 저장 중에 방금 쓴
> 내용이 사라지듯 흐려지면 안 된다.

---

## 9. 공용 UI 컴포넌트 (`src/components/ui/`)

| 컴포넌트 | 핵심 prop | 용도 |
|---|---|---|
| `Text` | `variant` / `weight` / `color` / `align` / `numeric` | 모든 텍스트 진입로 |
| `Button` | `variant: primary/secondary/ghost/destructive` · `size: sm/md/lg` · `leftIcon` / `rightIcon` · `loading` · `disabled` · `fullWidth` | 1차 액션 |
| `Badge` | `label` · `tone` · `shape` · `size` | 상태 표시 (3중 인코딩) |
| `Card` | `padding: none/sm/md/lg` · `onPress` · `accessibilityRole`/`accessibilityState` | 카드/타일. 표면은 항상 `surface + border + radius.md` — `variant` prop 은 없앴다(감사에서 callsite 0 확인, 7절). 누를 수 있는 카드가 항상 button 은 아니다 — 체크리스트 항목은 `role="checkbox"` + `state.checked` |
| `Input` | `label` · `error` · `helperText` · `leftSlot` / `rightSlot` (forwardRef) · 내부 focus 상태 | 폼 입력 (inset) |
| `FilterChip` | `label` · `active` · `activeColor` · `dashed` · `leftIcon` · `disabled` | 선택 가능 chip (`withAlpha(c, 0.13)` 배경) |
| `FilterAccordion` | `groups: {key, base, value, render}[]` · `hasFilter` · `onResetAll` | 목록 필터 껍데기 — 칩 줄 + 한 번에 하나만 열리는 패널. 함께 export: `FilterPanel` · `FilterOptionRow` · `FilterDateRange`(플랫폼 분기 날짜 범위) · `dateRangeSummary` |
| `FieldLabel` | `children` · `counter` · `trailing` · `style` | 폼 컨트롤 위 라벨 줄. 오른쪽에 글자수(`counter`)나 임의 요소(`trailing`, 되돌리기 버튼 등). 기본 `marginTop: md`, 굵기 semibold |
| `GroupLabel` | `children` · `style` | 카드 한 덩어리 위의 눈썹 라벨 — caption+bold+muted+uppercase. 기본 `marginTop: xl`(그룹↔그룹), 영역 경계(xxl)·화면 첫 줄(0)은 `style` 로 덮는다. `FieldLabel` 과 다른 층이다 — 아래 9.1 |
| `LoadingState` | `label` · `inline` | 로딩 표시 |
| `StickyBottomBar` | `children` (+ `useSafeAreaInsets`) | 화면 하단 sticky CTA, home indicator 회피 |
| `EmptyState` | `title` · `description` · `icon` · `action` | 빈 상태 (`src/components/EmptyState.tsx`) |
| `ErrorState` | `message` · `onRetry` | 조회 실패 (`src/components/ErrorState.tsx`). `EmptyState` 와 같은 화면으로 처리하지 않는다 — 실패를 empty 로 렌더하면 '데이터 없음' 으로 오독된다 |

> `src/components/ui/` 에는 컴포넌트가 아닌 것도 하나 있다 — `useHideOnScroll` (스크롤 방향에
> 따라 상단 chrome 숨김). 위 표는 컴포넌트만 다루므로 여기 한 줄로 남긴다.

### 9.1 라벨 두 층 — 무엇을 고를지 (2026-07-30 확정)

라벨 컴포넌트가 둘이다. **"무엇 위에 얹는가" 로 정해진다** — 크기나 취향으로 고르지 않는다.

| 무엇 위에 | 컴포넌트 | 모양 |
|---|---|---|
| **카드 한 덩어리·섹션** | `GroupLabel` | caption(12) + bold + muted + **uppercase** + letterSpacing, `marginTop: xl` |
| **컨트롤 하나**(입력·picker·칩 줄) | `FieldLabel` | bodySm(14) + semibold + muted, `marginTop: md`, 오른쪽에 글자수·버튼 슬롯 |

둘을 하나로 합치지 않는 이유: **애초에 다른 문제를 푼다.** 눈썹(`GroupLabel`)은 화면을 구획으로
나누는 표지라 본문보다 작고 대문자로 떠 있어야 덩어리 경계가 읽힌다. 필드 라벨(`FieldLabel`)은
바로 아래 컨트롤이 무엇을 받는지 말하므로 본문 크기여야 하고, 글자수·되돌리기 같은 값이 오른쪽에
붙는다. 크기 차이는 위계가 아니라 **역할 차이**다.

> 이 규칙이 없던 2026-07-30 하루 동안 같은 라벨 줄이 세 화면에서 `marginTop` md/lg/xl 로
> 표류했고(14절), 나중엔 "새 화면에서 둘 중 뭘 쓰지" 가 답이 없는 상태가 됐다. 규칙을 먼저
> 적었으면 둘 다 없었을 일이다.

---

## 10. 도메인 컴포넌트

| 위치 | 컴포넌트 | 역할 |
|---|---|---|
| `src/components/trips/` | `TripProgressStrip` | 외근 진행률 한 줄 (elapsed + 카운트 + ratio + 3dp bar) |
| | `TripFilterBar` | 외근 필터 — 기간(시작일)·보고 여부 |
| | `TripCard` | 외근 목록 카드 (상태칩 + 보고서 배지 + 진행률 바) |
| | `CurrentDestCard` | 현재 목적지 — 길찾기·체크인 동급 2분할 + 캡션 행에 재최적화·건너뛰기 |
| | `AllDoneCard` | 모든 목적지 완료 상태 |
| | `DestinationRow` | 목적지 행, memo + status Badge |
| `src/components/fields/` | `ManualCoordinateForm` | KR 좌표 직접 입력 (new / edit 공유) |
| | `FieldFilterBar` | 현장 필터 4그룹 (조치상태·프로젝트·카테고리·방문일) |
| | `FieldStatusSummary` | 현장 탭 focal — 조치 전 건수(metric) + 3구간 분포 막대. 필터 걸리면 숨김(서버 refresh 로 모집단이 좁혀져 분포가 거짓이 된다) |
| | `ReviewVisitCard` | 외근 종료 리뷰의 방문 카드 — checkin 화면과 같은 chip 패턴(3중 인코딩) |
| | `AddDestinationModal` | 진행 중 외근에 목적지 단건 추가 (RN `Modal` 카드) |
| | `CategoryMultiPicker` | 카테고리 다중 선택 — `ProjectPicker` UX 복제 |
| | `QuickPhotoSheet` | Quick Photo 확인/폴백 시트 — `AddDestinationModal` 의 Modal 카드 패턴 재사용 |
| | `FieldPinMap`(+`.web`) | 현장 폼의 핀 지도 — 명령형 핸들로 핀 이동 + 역지오코딩 |
| `src/components/reports/` | `ReportFilterBar` | 보고서 필터 — 작성일 기간 |
| `src/components/` | `FieldCard` | 현장 카드. 위계: 상태(좌측 3dp 레일 + 배지) → 제목 → 주소 → 메타. 레일 색은 `colors.fieldStatus`, 배지는 `FIELD_STATUS_BADGE` |
| | `TripStatusBanner` | root layout 상단 진행 중 외근 배너 |
| | `MapSheetLayout` | 지도 + BottomSheet 공통 (snap `['18%','55%','92%']` + uiStore 인덱스 공유 + mount race fix) |
| | `EmptyState` | icon + title + description + action |
| | `ErrorState` | 조회 실패 + 재시도. 색은 danger 를 쓰지 않고 형상+라벨+액션으로 구분 |
| | `SafeScreen` | 비-map 화면 safe area wrapper (루트에서 SafeAreaView 제거 후 각 화면이 두름) |
| | `MapDashboard` · `MapSearchBar` · `MapFilterBar` · `MapLegend` | 지도 위 부유 chrome — **elevation 을 쓰는 유일한 자리**(7절) |
| | `KakaoMapWebView`(+`.web`) | 지도 본체. 웹은 SDK 직접 주입, 네이티브는 WebView |
| | `ProjectPicker` | 현장 폼의 프로젝트 선택 + 인라인 생성 |
| | `SessionGuardModal` · `WebChoiceModal` | 세션 만료 안내 / 3+ 선택지 모달(web `Alert` 가 OK·Cancel 로 뭉개는 자리) |
| | `AttachmentPreview` | 사진 그리드 (음성 메모는 ERD v2 에서 폐기) |

> 이 표는 **디자인 결정이 걸린 것**만 담는다. 2026-07-30 감사 전까지 `src/components/` 15 개 중
> 4 개만 적혀 있어, 없는 컴포넌트를 다시 만들 위험이 있었다(강령 7 이 기대는 게 이 표의
> 완전성이다). 새 컴포넌트를 만들면 여기 한 줄을 같이 추가한다. 훅·플랫폼 분기 파일
> (`useQuickPhoto` · `useKakaoPlaceSearch` · `quickPhotoHandoff`)은 로직이라 제외.

---

## 11. 유틸리티

| 위치 | API |
|---|---|
| `src/utils/datetime.ts` | `fmtDate` · `fmtTime` · `fmtDateTime` · `fmtDuration` (undefined / Invalid Date 안전) |
| `src/utils/addressSearch.ts` | 카카오 Geocoder: `KR_LAT` / `KR_LNG` / `SEARCH_DEBOUNCE_MS` / `MIN_KEYWORD_LEN` / `itemToSelected` / `isInKorea` |
| `src/theme/withAlpha.ts` | `withAlpha(hex, alpha)` → `#RRGGBBAA` |
| `src/utils/fieldFacets.ts` | `fieldTitle` / **`fieldSubtitle`** / **`fieldDetailLine`** — 현장 제목·부제 규칙의 단일 출처. 부제는 "제목이 아직 안 보여준 나머지 주소" 다(중복 제거 규칙은 그 파일 주석) · `applyFieldFilters` / `collectFieldFacets` / `mergeCategoryNames` |

> 위 표도 §10 과 같은 기준 — **화면 표시 규칙이 걸린 유틸만** 담는다. `src/utils/` 의 나머지
> 14 개(`geolocation` · `routeOptimize` · `captureView` · `media` · `postTripFlow` ·
> `backNavigation` · `nearestField` · `groupSameLocationMarkers` · `kakaoMap` · `password` ·
> `contact` · `sentry` · `webAlertPatch`)는 동작 로직이라 이 문서의 관심사가 아니다.

> 지오코딩은 **카카오 Geocoder 전용**. Daum 우편번호 사용 금지.

---

## 12. Store 패턴

- `reportStore.detailStatus: Record<id, 'loading'|'success'|'missing'>` — `[id]` 화면의 무한 LoadingState race 표준화.
- 차후: 같은 패턴을 `fieldStore` / `visitStore` 로 확장.

---

## 13. 강령 (작업 원칙)

1. **1 화면 = 1 결정** — CTA 가 둘이면 위계로 답한다.
2. **색만으로 정보 전달 금지** — 색 + 형상 + 라벨 3중 인코딩 (status·intent 모두).
3. **3종 상태 강제** — 데이터 화면은 `loading / empty / error` 반드시 처리.
4. **토큰만 쓴다** — fontSize/spacing/color hardcoding 금지. 없으면 토큰을 추가.
5. **모션은 의미 있을 때만** — 200ms 이내. 그 이상은 기다린다.
6. **Depth 는 하나** — 문서 흐름은 테두리, 지도 부유물은 그림자. 섞지 않는다 (7절).
7. **표면을 손으로 다시 짜지 않는다** — `surface + border + radius` 를 직접 조합하는 대신 `<Card>`. 새 컨트롤은 `src/components/ui/*` 를 먼저 본다.
8. **숫자는 라벨보다 크다** — focal 숫자는 `metric`, 그 외 변하는 숫자는 `<Text numeric>` (3.1절).

---

## 14. 미적용 / 차후 과제

**탭별 디자인 개선에서 흡수할 부채** (2026-07-30 실측).
진행: **외근 ✅ · 현장 ✅ · 보고서 ✅ · 내 정보 ✅** (4 탭 1 회차 완료)
서브 화면 1 회차: `trips/visit` ✅ · `reports/[id]/edit` ✅ · `trips/[id]/edit` ✅ · `fields/categories` ✅ · `fields/[id]/checkin` ✅
(렌더 확인은 `categories`·`reports/[id]/edit`·`fields/[id]/edit`·`trips/[id]/edit` 까지. `checkin` 폼과 `trips/visit` 은
진행 중 외근·방문 데이터가 필요한데 웹 바텀시트가 간헐적으로 안 떠서 못 봤다 — 아래 '기존' 목록 참고)

> **내 정보 탭 — 위험의 무게를 뒤집었다 (2026-07-30).** 이 화면의 focal 은 숫자가 아니라
> **정체성**(이름)이다. 이전엔 아바타 이니셜 36px 이 화면에서 가장 큰 글자였는데 그 글자는
> 바로 아래 이름의 첫 글자라 정보량이 0 이다 — 가장 큰 것이 아무 말도 안 하면 위계가 없다.
> 아바타 80→56, 이니셜은 스케일 안(h2)으로, 이름 h2→h1.
>
> 더 큰 문제는 **빨강을 되돌릴 수 있는 동작이 쓰고 있었다**는 것. 로그아웃(다시 로그인하면
> 끝)이 solid `destructive` 전폭 버튼이고, 되돌릴 수 없는 회원 탈퇴는 '계정' 카드 안 한 줄로
> 색만 빨간 상태였다. `Button.tsx` 의 '빨강 = 파괴' 규칙, `fields`/`trips` edit 의 '위험 구역'
> 패턴(구분선 + `dangerGhost`)이 이미 있는데 이 화면만 빠져 있었다. 로그아웃 → `secondary`,
> 탈퇴 → 하단 위험 구역. 스토어 심사(Play)가 요구하는 삭제 경로라 화면 밖으로 숨기지는 않는다.
> `docs/일가요 서비스 운영 현황 확인 질문지.md` §탈퇴 메뉴 위치의 "계정 섹션 하단" 은 구현
> 이전의 제안이고 이유가 붙어 있지 않아, 이유가 문서화된 위험 구역 패턴을 따랐다.
>
> 이메일이 아바타 아래와 '계정' 카드 첫 행에 **같은 값으로 두 번** 있었다 — 카드 행 제거.

> **보고서 탭에는 숫자 focal 을 두지 않기로 했다 (2026-07-30).** 이 목록의 조직 단위는
> 이미 '외근 그룹' 이라 구조 자체가 focal 이다. 가장 쓸모 있어 보였던 지표는 "보고서
> 미작성 외근 N건" 인데, `tripStore` 는 페이지네이션돼 있어 로컬에 없는 외근을 세지 못한다
> (이 화면의 '외근 정보 미로드' 그룹이 그 증거). 틀릴 수 있는 숫자를 크게 두느니 두지 않는다.
> 화면마다 metric 행을 하나씩 얹는 건 그 자체가 '아무도 결정하지 않았다' 는 신호다.

- **hand-rolled 표면** (강령 7) — 외근(`DestinationRow`)·현장(`FieldCard`)·내 정보(`delete-account` 경고 박스) 흡수 완료. **2026-07-30 재측정: 27 파일이 `backgroundColor: colors.surface` 를 직접 조합, `<Card>` 는 19 파일 30 곳.** 이전 문장의 "37 vs 27" 은 *파일 수* 와 *callsite 수* 를 비교한 잘못된 대조였다 — 같은 단위로 다시 셌다. 남은 곳은 아래가 전부이고, 그중 `ui/Card`·`ui/Button`·`ui/FilterChip`·`KakaoMapWebView`·`MapSheetLayout` 은 **표면을 직접 정의하는 게 맞는 자리**라 대상이 아니다:
  - 화면: `(auth)/signup` · ~~`fields/categories`~~(흡수) · `fields/new` · `fields/[id]/checkin` · `reports/new` · `reports/[id]/field-report` · `trips/navigate` · ~~`trips/new/order`~~(흡수) · `trips/[id]`
  - 컴포넌트: `AttachmentPreview` · `CategoryMultiPicker` · `QuickPhotoSheet` · `ProjectPicker` · `SessionGuardModal` · `AddDestinationModal` · `ReviewVisitCard` · `MapDashboard` · `MapFilterBar` · `MapLegend` · `MapSearchBar` · `FilterAccordion`
  - **분류해보니 대부분 Card 대상이 아니었다** (2026-07-30). 표면을 직접 그리는 게 맞는 것: chip·pill(`checkin` 2 · `navigate` · `categories`), 원형 배지(`trips/[id]` skippedOrderBadge), dashed placeholder(`checkin`), 모달 껍데기(4 곳), 입력란(5 곳 — 위 항목에서 `control` 토큰으로 정리). **실제 `<Card>` 후보는 3 곳**: `fields/new` 의 `addrItem`(검색 결과 행)·`photoBox`, `trips/new/order` 의 `row`(`DestinationRow` 와 같은 목적지 행). 지도 화면이라 렌더 확인이 되는 날 흡수한다.
  - **모달 껍데기 배경이 갈려 있다** (측정: `background` 3 — `AddDestinationModal`·`QuickPhotoSheet`·`WebChoiceModal` / `surface` 2 — `reports/new`·`SessionGuardModal`). 둘 다 내부적으로는 정합하다: 흰 카드 행을 담는 모달은 캔버스(`background`)여야 행이 떠 보이고, 내부가 텍스트·버튼뿐이면 흰 시트(`surface`)가 자연스럽다. `reports/new` 의 `modalItem` 은 배경 없이 테두리만 쓰므로 흰 시트 위에서도 읽힌다. **어느 쪽도 틀리지 않아 통일하지 않는다** — 한쪽만 눈대중으로 맞추면 그게 회귀다.
- **`Card` 의 `variant` prop 이 통째로 dead 였다 → 제거** (2026-07-30 감사). `elevated` 는 앞서 callsite 0 으로 지웠는데, 남은 `outline`/`flat` 도 **어디서도 넘기지 않아** 모든 Card 가 기본값으로만 렌더되고 있었다(`grep` 으로 Card 에 `variant=` 를 넘기는 곳 0 확인). 값이 하나뿐인 prop 은 선택지처럼 보이면서 아무것도 선택하지 않는다. 테두리가 `styles.base` 로 내려갔다.
- **매직넘버 / `opacity: 0.x` 직접값** — 4 탭 + 그 도메인 컴포넌트 정리 완료 (강령 4). 처음엔 "완료" 로만 적었는데 **리뷰에서 거짓임이 드러나** 아래를 추가로 고쳤다(2026-07-30). 완료 표시는 다음 회차가 그 자리를 건너뛰게 만들므로, 남은 것은 남았다고 적는다.
  - `paddingBottom: 120` 이 5 화면(`fields/index`·`reports/index`·`trips/index`·`trips/new/order`·`trips/new/select`)에 흩어져 있었다 → `listBottomInset` 토큰. **반복되는 매직넘버는 없는 토큰이다.**
  - `borderRadius: 14`(`trips/new/order`·`ReviewVisitCard`) · `11`(`TripStatusBanner`) → `radius.pill`. 전부 정원이고, `DestinationRow` 에서 이미 고친 것과 같은 패턴인데 나머지를 빠뜨렸던 것.
  - `opacity: 0.6`(`trips/navigate` 뒤로가기) → `opacity.pressed`. 누름 피드백은 앱 전체가 한 값이어야 한다.
  - `Input` 의 `opacity: 0.7` → `opacity.disabledField` 신설. `opacity.disabled`(0.4)와 **다른 값이 맞다** — 입력란은 비활성이어도 값을 읽어야 한다. 우연이 아니라 결정임을 토큰 이름과 주석으로 남겼다.
  - **남은 것**: `trips/active` 의 `paddingBottom: 240`(시트 래퍼 높이 때문 — 그 파일 ★ 주석에 실측 근거, 계산이 달라 토큰으로 묶지 않는다), 그리고 지도 chrome·보조 컴포넌트의 `borderRadius` 리터럴 8 곳(`MapFilterBar` 3 · `KakaoMapWebView` 2 · `MapDashboard` · `EmptyState` · `AttachmentPreview` · `FilterAccordion`) — 아래 '기존' 목록과 같은 사이클에서.
- **`numeric` prop 중복** — `metric`/`metricSm` variant 는 이미 tabular-nums 를 포함한다(3.1절·`Text.tsx` 주석). 그런데 `trips/index`·`FieldStatusSummary` 가 거기에 `numeric` 을 또 붙여, "여긴 필요하고 저긴 아니다" 로 읽혔다 → 제거. 동작 차이는 없지만 규칙을 흐리는 건 규칙을 어기는 것과 같다.
- **focal element 미지정** — 4 탭 모두 지정 완료. 보고서·내 정보는 **숫자 focal 을 두지 않는다는 결정**이 지정이다(위 인용 2 개).
- **간격 tier 미적용** — 2.1절 규칙 이전 코드는 callsite 마다 즉흥적. 4 탭은 정리 완료, 나머지는 건드리는 화면부터.
- **서브 화면 디자인 패스 (2026-07-30, 2단계).** 탭 루트 4개를 끝낸 뒤, **한 번도 검토하지 않은 서브 화면**을 훑었다(`trips/visit` · `reports/[id]/edit` · `trips/[id]/edit` · `fields/categories` · `fields/[id]/checkin`). `reports/generate` 는 19줄짜리 redirect 라 UI 가 없어 대상에서 뺐다.
  - **폼 라벨 줄이 세 화면에서 표류**하고 있었다 — 같은 5 줄(라벨 + 글자수)인데 `marginTop` 이 `md`(fields/[id]/edit) / `lg`(reports/[id]/edit) / `xl`(trips/[id]/edit) 로 셋 다 달랐고, 굵기도 semibold 7 곳 vs bold 1 곳. `ui/FieldLabel` 로 모아 8 곳 적용. `GroupLabel` 때와 같은 종류의 표류다.
  - 그중 둘은 그 줄이 **화면 첫 요소**인데 `marginTop` 이 붙어 scroll padding 위에 더해지고 있었다 — `profile/edit` 에서 고친 자리와 같은 패턴이 **하루에 세 번** 나왔다.
  - `checkin` 이 `●▲■◆` 글리프 맵을 자체로 갖고 있었다(6절 인용 참고).
  - **터치 타깃**: `categories` 아이콘 버튼 26px(일부는 hitSlop 6 으로 38px, '편집 취소'·'이름 저장' 은 없음), `FilterChip` 24px. 둘 다 `Button size="sm"` 과 같은 방법(보이는 크기 유지 + `hitSlop`)으로 44 를 채웠다. **`checkin` 의 방문 결과 칩은 `FilterChip` 으로 합치지 않는다** — 필터가 아니라 주 컨트롤이라 `paddingVertical` 이 한 단계 크고, 합치면 터치 타깃이 오히려 줄어든다.
  - `categories` 의 '추가' 는 손으로 짠 primary 버튼이었고(→ `Button`), 목록 행은 손으로 짠 표면이었다(→ `Card`). **앞선 21 곳 분류에서 이 행을 'chip' 으로 잘못 넣었던 것을 정정한다.**
  - `trips/visit`: 상태 배지가 자기 줄을 통째로 차지하던 것을 제목 행으로 접고(`FieldCard` 와 같은 이유), 제목·배지·시각·사유가 전부 `sm` 한 값이던 간격을 tier 로 갈랐다.
- ~~**미결 — 폼 라벨이 두 층이다**~~ → **닫혔다 (2026-07-30). 9.1 절에 규칙으로 적었다** — "무엇 위에 얹는가" 로 고른다(카드·섹션 = `GroupLabel` 눈썹 / 컨트롤 하나 = `FieldLabel`). 합치지 않는 이유는 크기가 아니라 **역할이 다르기 때문**이다. 코드 변경 없이 문서만으로 닫히는 종류였는데, 규칙을 먼저 적지 않아 하루 동안 표류를 만들었다.
- **60/30/10 을 실측했다 (2026-07-30).** accent(파랑)가 뷰포트에서 차지하는 면적을 DOM 으로 쟀다(배경색은 clip 된 사각형 면적, 전경 텍스트·아이콘은 박스 면적 × 0.18 로 글자 커버리지 근사):
  - 읽는 화면: `보고서` 목록 **0.17%** · `내 정보` **1.1%**(56px 아바타가 거의 전부) · `현장 등록` 상단 **0.54%**
  - **최대치는 primary CTA 가 화면에 보일 때 7.6%** (`현장 등록` 하단 — 전폭 버튼 하나가 24,828px²)
  - 결론: **10 은 목표가 아니라 상한이고, 이미 그 아래다.** 손댈 것이 없다. 대신 이 수치에서 규칙이 하나 떨어진다 — 7.6% 를 만드는 건 **전폭 filled 버튼 하나**이므로, 한 화면에 filled primary 블록이 둘이면 그때 10% 를 넘고 강령 1("CTA 가 둘이면 위계로 답한다")도 깨진다. 오늘 로그아웃을 `secondary` 로 내린 것이 이 규칙과 같은 방향이다.
- **press 피드백에 `scale(0.97)` 을 쓰지 않는다 (2026-07-30 결정).** 스킬은 scale 을 보지만, 재보니 문제는 "촉감이 약하다" 가 아니라 **밝은 표면에서 피드백이 아예 없다**는 것이었다(8절 계산: 1/255). 값을 바꾸는 것으로 해결되므로 reanimated 를 전 pressable 에 얹는 비용·위험(이 프로젝트는 Fabric+reanimated 4 로 이미 두 번 물렸다)을 지지 않는다. 필요해지면 그때 이유와 함께.
- ~~**터치 타깃 값이 44 와 48 로 섞여 있다**~~ → **눈대중이 아니었다. 규칙이 적혀 있지 않았을 뿐** (2026-07-30 실측). 6 callsite 를 종류별로 갈라보니 정확히 나뉜다:
  - **48 = 전폭 행·입력란** — `Input` · profile 메뉴 행 · delete-account 동의 행. Android 목록 항목 권장치.
  - **44 = 인라인 컨트롤** — `Button` md · `trips/active.headerAction` · `CurrentDestCard.skipBtn`. WCAG 2.5.5.
  - 그래서 하나로 합치지 않고 `touchTarget = { control: 44, row: 48 }` 로 **이름을 붙였다**. 다음 코드가 값을 눈대중으로 고르지 않고 "무엇인가" 로 고른다.
- **`Button size="sm"` 이 36px 로 Direction 을 어기고 있었다** (2026-07-30, callsite **43 곳**). Direction '밀도' 항목은 "터치 타깃 44px 이상 유지, 밀도를 위해 깎지 않는다" 인데 sm 만 36 이었다. 높이를 44 로 올리면 43 곳 레이아웃이 같이 움직이므로 **보이는 크기는 두고 `hitSlop` 으로 터치 영역만 44 까지 넓혔다**(`(44-36)/2 = 4`). 이 코드베이스가 작은 컨트롤에 이미 21 곳에서 쓰는 방법이라 새 패턴도 아니다. 시각 밀도와 접근성 중 하나를 버리지 않는 쪽.

**보류한 것:**

- **토큰 이름 도메인화**(`slate`/`blue` → 도메인 단어) — 하지 않는다. `palette` 는 의도적 raw scale 이고 `colors.*` semantic 층이 이미 역할로 말한다(`fieldStatus`·`tripBanner`). 40+ 화면의 flat alias 제거는 별개 부채.

**기존:**

- ~~보조 컴포넌트(`MapFilterBar` · `ProjectPicker` · `WebChoiceModal` · `SessionGuardModal` · `KakaoMapWebView` · `AttachmentPreview`) — RN `Text` 직접 사용으로 Pretendard 미적용 잔존.~~ → **적힌 위치는 틀렸지만 걱정은 실재했다** (2026-07-30). 위 여섯 파일은 전부 `ui/Text` 를 쓴다 — 그 문장은 유령이었다. 그런데 한 칸 옆에 진짜가 있었다: **RN `TextInput` 은 폰트를 상속하지 않는데** 손으로 짠 입력란 5 곳(`fields/categories` 2 · `CategoryMultiPicker` · `ProjectPicker` · `MapSearchBar`)에 `fontFamily` 가 없어 **시스템 폰트로 렌더되고 있었다.** 같은 5 곳이 `control` 토큰(5.3.1)도 안 써서, 오늘 `Input` 을 inset 으로 바꾼 뒤로는 **입력란인데 카드처럼 흰색**이었다 — 토큰을 도입하고 손으로 짠 쪽을 쓸지 않은 내 누락이다. 둘 다 채웠다. 아래는 원래 문장에 대한 판정. 여섯 개 전부 `ui/Text` 를 쓴다. RN `Text` 를 직접 쓰는 파일은 `ui/Button`·`ui/Input` 둘뿐이고 **둘 다 styles 에 `fontFamily` 를 명시**한다(`Input.input` 의 `fontFamily.regular` 포함). 즉 Pretendard 미적용 자리는 없다. 덤으로 `Text.tsx` 주석의 "기존 RN Text 직접 사용은 그대로 동작 (Pretendard defaultProps 적용)" 도 거짓이었다 — 그 monkey-patch 는 `app/_layout.tsx` 에서 이미 제거됐다. 주석도 함께 고쳤다.
- ~~`SectionLabel` 컴포넌트 추출 — 12+ 화면에서 반복되는 패턴.~~ → 실측하니 `caption+bold+textMuted` 조합 21 곳(12 파일)은 **두 개의 다른 패턴**이었다: ① 카드 위 눈썹 라벨(uppercase + tier margin — 내 정보 3 화면, `field-report` picker 그룹) ② 지도 부유물 안 위젯 제목(margin 없음, uppercase 아님 — `MapLegend`·`MapFilterBar`). ①만 `ui/GroupLabel` 로 뽑았고(내 정보 3 화면 적용, 그중 한 곳은 `marginTop` 이 lg 로 어긋나 있었다) ②는 흡수하지 않는다. `field-report` 는 다음에 그 화면 건드릴 때.
- `MenuRow` 의 `ui/` 승격 — 2번째 callsite 등장 시. (2026-07-30 확인: `chevron-forward` 4 파일은 모두 목록 항목/배너로, 같은 패턴 아님)
- `Text` 의 style array per-render perf — 저성능 Android 대비.
- **`Card` 의 a11y prop 이 non-pressable 분기에서 조용히 버려진다** (2026-07-30 리뷰). `accessibilityLabel`/`Role`/`State` 를 받지만 `onPress` 가 없으면 `<View>` 로 렌더하며 셋 다 무시한다. 지금 callsite 는 전부 `onPress` 가 있어 증상은 없다(`DestinationRow.onPress` 는 required). 안 눌리는 카드에 라벨을 붙이는 순간 함정이 된다.
- **알 수 없는 `field.status` 가 분포에서 조용히 누락** (2026-07-30 리뷰). `fields/index` 의 `out[f.status] += 1` 은 `FIELD_STATUS_VALUES` 밖의 값을 받으면 그 현장을 어느 칸에도 세지 않는다. 크래시는 없다(합산이 알려진 키만 순회) — 대신 막대 합이 목록 개수와 달라진다.
- ~~**웹 바텀시트가 간헐적으로 마운트되지 않는다**~~ → **그런 문제는 없었다 (2026-07-31 종결).** 이틀에 걸쳐 이 항목을 세 번 다르게 적었는데(웹 전용 앱 문제 → 창 잘림 → 자동화 Chrome 인스턴스) 셋 다 부정확했다. 계측하니 `onLayout` 은 정상 발화하고(`h=520`) 게이트도 열린다(`ch=520 render=true`). **내 판정 도구가 틀렸다** — "시트가 떴는가" 를 `innerText` 에 시트 안 문구가 있는지로 봤는데, gorhom 은 시트가 접혀 있으면 내용을 지연 렌더하므로 **정상 상태가 '미마운트' 로 읽혔다.** 별개로 자동화용 Chrome 이 실제로 멈춘 구간은 있었다(`innerHeight` 가 리사이즈에 반응하지 않음 → 브라우저 재시작으로 해소). 남길 교훈: **계측했다는 사실이 계측이 옳다는 뜻은 아니다.** 판정 조건을 먼저 검증한다 — 이 경우 "시트를 펼친 상태에서 그 조건이 참이 되는가" 를 한 번만 확인했으면 이틀을 아꼈다.
- hover/active 상태 색 변형, 다크 모드, 차트·태그 카테고리 hue. (2026-07-30 확인: 다크 모드 코드는 실제로 없다 — `StatusBar style="dark"` 는 내용 색이라 무관. `opacity.hover` 토큰은 callsite 0 이어서 제거했다 — 미결인 결정을 토큰만 먼저 두면 '이미 정해졌다' 로 읽힌다.)

---

**§14 전수 감사 (2026-07-30).** 하루에 이 문서가 세 번 틀렸다 — 완료 주장 과장 1건, 유령 부채
1건, 반쪽 가드 1건. 그래서 모든 항목을 코드로 대조했다. 결과: **완료로 적힌 것 중 1건이 거짓,
부채로 적힌 것 중 1건이 유령, 표 2 개가 불완전, dead 코드 2 건**(`Card.variant` · `opacity.hover`).

문서가 코드보다 앞서거나 뒤처지는 두 방향 모두 같은 값의 손해를 낸다 — 앞서면 다음 회차가
남은 일을 건너뛰고, 뒤처지면 없는 일을 좇거나 이미 있는 컴포넌트를 다시 만든다. 그래서
**이 문서에 수치·목록·"완료" 를 쓸 때는 측정한 명령과 날짜를 함께 남긴다.** "37 vs 27" 처럼
단위가 다른 수를 나란히 적은 게 첫 사고였다.
- `useReportDetail` 패턴을 `fieldStore` / `visitStore` 로 확장.

---

## 15. Figma 라이브러리 (2026-08-28)

파일 `일가요` → `DesignSystem` 페이지(`3:4`). **코드가 원본이고 Figma 가 사본이다.**

| 섹션 | 내용 | 대응 |
|---|---|---|
| 색상표 | Primitives 79 · Semantic 41 | §4 · §5 |
| 간격·반경 | spacing · touch-target · radius | §2 |
| 그림자 | elevation 3 단계 | §7 |
| 타이포그래피 | 텍스트 스타일 24 개 | §3 |
| 모션 | duration 4 · easing 4 · opacity 3 | §8 |
| 상태 배지 | visit · field · destination 3중 인코딩 | §6 |
| 지도 척도 | heatmap gradient · choropleth 5 구간 | `heatScale.ts` · `choroplethScale.ts` |
| 아이콘 | Ionicons 63 개 | — |
| 컴포넌트 | `ui/` 프리미티브 14 개 · 배리언트 69 | §9 |

- **변수 170 개** — Primitives / Color / Spacing / Typography / Motion / Map 6 컬렉션. `ALL_SCOPES` 0 건, code syntax 누락 0 건.
- **컴포넌트 14 개** — 세트 9(Button · Badge · Card · FilterChip · Input · LoadingState · FilterOptionRow · FilterHead · FilterAccordion) + 단일 5(GroupLabel · FieldLabel · StickyBottomBar · EmptyState · ErrorState).
- **텍스트 스타일 24 개** — 9 개는 `typography.ts` 키와 1:1. 코드는 굵기를 `<Text weight>` prop 으로 받지만 Figma 엔 그 축이 없어, 컴포넌트가 실제로 쓰는 조합만 `body-bold` · `bodySm-semibold` · `caption-bold` · `groupLabel` 등으로 추가했다. 문서 가구는 `docs/*` 로 분리.
- **폰트** — 플러그인 런타임에 로컬 폰트가 없어 `fontName` 을 직접 못 쓴다. `font-family/base`(STRING, `FONT_FAMILY` 스코프) 변수를 텍스트 스타일에 바인딩해 Pretendard 를 지정한다. **폰트 교체는 이 변수 값 하나만 바꾼다.**
- **불투명도 단위 주의** — Figma 의 `OPACITY` 스코프 변수는 **% 단위(0–100)** 다. `opacity.disabled` 0.4 는 Figma 변수 `40` 으로 넣어야 한다. 0.4 를 그대로 넣으면 실제 불투명도가 0.004 가 되어 거의 투명해진다. `choropleth/bin-*` 도 같다.
- **바인딩 대상이 없는 값은 scope 를 비운다** — `duration/*` · `heat/max` · `heat/radius`. 픽커에 뜨면 잡음만 된다. easing 은 변수로 만들지 않고 곡선으로만 남겼다.
- **아이콘** — `node_modules` 의 `Ionicons.ttf` 에서 윤곽선을 직접 추출했다(다운로드 아님). 컴포넌트 이름은 `icon/<name>`, 24×24, fill 은 `text/default` 바인딩. Button · FilterChip · Input 의 아이콘 자리는 `INSTANCE_SWAP` 이고, 아이콘 색은 배리언트별 tint 로 덮어 코드의 `VARIANT[].tint` 와 맞췄다.
- **설명은 한 줄만** — 컴포넌트 description·캔버스 주석에 근거를 옮겨 적지 않는다. 근거는 이 문서와 코드 주석에 있다.
