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
| **밀도** | 터치 타깃 44px 이상 유지. 밀도를 위해 깎지 않는다 — 장갑 낀 손, 흔들리는 버스. |
| **Signature** | 색 + 형상 + 라벨 3중 인코딩 상태 배지(6절). 상태를 표시하는 새 UI는 전부 이 규칙을 따른다. |

### 거부하는 기본값

1. **흰 카드 균일 나열** → 상태가 먼저 읽히는 목록. 카드 크기·간격을 균일하게 두지 않는다.
2. **숫자를 라벨과 같은 크기로** → `metric` / `metricSm` variant (3절). 라벨보다 두 단계 위.
3. **제목 없이 리스트로 시작하는 화면** → 화면마다 focal element 를 지정한다(강령 1).

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

> `fontSize: 18` 처럼 매직넘버를 직접 쓰지 않는다. 토큰에 없는 값이면 토큰을 추가한다.

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

> 폼 **밖**에서 `surfaceMuted` 를 쓰는 건 문제없다 (아이콘 버튼 배경, 진행률 트랙, Skeleton, 지도 chrome 등 — 입력란과 같은 자리에 서지 않는다).

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
| **opacity** | pressed / disabled / hover | 0.85 / 0.4 / 0.92 |

> "200ms 넘으면 사용자가 기다린다." 표준 transition 은 base(180) 이내.

---

## 9. 공용 UI 컴포넌트 (`src/components/ui/`)

| 컴포넌트 | 핵심 prop | 용도 |
|---|---|---|
| `Text` | `variant` / `weight` / `color` / `align` / `numeric` | 모든 텍스트 진입로 |
| `Button` | `variant: primary/secondary/ghost/destructive` · `size: sm/md/lg` · `leftIcon` / `rightIcon` · `loading` · `disabled` · `fullWidth` | 1차 액션 |
| `Badge` | `label` · `tone` · `shape` · `size` | 상태 표시 (3중 인코딩) |
| `Card` | `padding: none/sm/md/lg` · `variant: outline/flat` · `onPress` · `accessibilityRole`/`accessibilityState` | 카드/타일. 누를 수 있는 카드가 항상 button 은 아니다 — 체크리스트 항목은 `role="checkbox"` + `state.checked` |
| `Input` | `label` · `error` · `helperText` · `leftSlot` / `rightSlot` (forwardRef) · 내부 focus 상태 | 폼 입력 (inset) |
| `FilterChip` | `label` · `active` · `activeColor` · `dashed` · `leftIcon` · `disabled` | 선택 가능 chip (`withAlpha(c, 0.13)` 배경) |
| `FilterAccordion` | `groups: {key, base, value, render}[]` · `hasFilter` · `onResetAll` | 목록 필터 껍데기 — 칩 줄 + 한 번에 하나만 열리는 패널. 함께 export: `FilterPanel` · `FilterOptionRow` · `FilterDateRange`(플랫폼 분기 날짜 범위) · `dateRangeSummary` |
| `SectionHeader` | `title` · `description` · `action` | 섹션 구분 |
| `LoadingState` | `label` · `inline` | 로딩 표시 |
| `Skeleton` | `width` · `height` · `rounded` | 로딩 placeholder (reanimated shimmer) |
| `StickyBottomBar` | `children` (+ `useSafeAreaInsets`) | 화면 하단 sticky CTA, home indicator 회피 |
| `EmptyState` | `title` · `description` · `icon` · `action` | 빈 상태 (`src/components/EmptyState.tsx`) |

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
| `src/components/reports/` | `ReportFilterBar` | 보고서 필터 — 작성일 기간 |
| `src/components/` | `FieldCard` | 현장 카드. 위계: 상태(좌측 3dp 레일 + 배지) → 제목 → 주소 → 메타. 레일 색은 `colors.fieldStatus`, 배지는 `FIELD_STATUS_BADGE` |
| | `TripStatusBanner` | root layout 상단 진행 중 외근 배너 |
| | `MapSheetLayout` | 지도 + BottomSheet 공통 (snap `['18%','55%','92%']` + uiStore 인덱스 공유 + mount race fix) |
| | `EmptyState` | icon + title + description + action |

---

## 11. 유틸리티

| 위치 | API |
|---|---|
| `src/utils/datetime.ts` | `fmtDate` · `fmtTime` · `fmtDateTime` · `fmtDuration` (undefined / Invalid Date 안전) |
| `src/utils/addressSearch.ts` | 카카오 Geocoder: `KR_LAT` / `KR_LNG` / `SEARCH_DEBOUNCE_MS` / `MIN_KEYWORD_LEN` / `itemToSelected` / `isInKorea` |
| `src/theme/withAlpha.ts` | `withAlpha(hex, alpha)` → `#RRGGBBAA` |

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
진행: **외근 ✅ · 현장 ✅ · 보고서 ⬜ · 내 정보 ⬜**

- **hand-rolled 표면** — `backgroundColor: colors.surface` 를 직접 조합하는 파일이 `<Card>` callsite 보다 많았다(37 vs 27). 외근(`DestinationRow`)·현장(`FieldCard`) 은 흡수 완료. 남은 탭은 그 탭 작업 때 (강령 7).
- **매직넘버 / `opacity: 0.x` 직접값** — 외근·현장 범위는 정리 완료. 보고서·내 정보 남음 (강령 4).
- **focal element 미지정** — 외근 3화면·현장 목록은 지정 완료. 나머지 탭은 미지정.
- **간격 tier 미적용** — 2.1절 규칙 이전 코드는 callsite 마다 즉흥적. 건드리는 화면부터 정리.

**보류한 것:**

- **토큰 이름 도메인화**(`slate`/`blue` → 도메인 단어) — 하지 않는다. `palette` 는 의도적 raw scale 이고 `colors.*` semantic 층이 이미 역할로 말한다(`fieldStatus`·`tripBanner`). 40+ 화면의 flat alias 제거는 별개 부채.

**기존:**

- 보조 컴포넌트(`MapFilterBar` · `ProjectPicker` · `WebChoiceModal` · `SessionGuardModal` · `KakaoMapWebView` · `AttachmentPreview`) — RN `Text` 직접 사용으로 Pretendard 미적용 잔존. 다음 사이클 후보.
- `SectionLabel` 컴포넌트 추출 — 12+ 화면에서 반복되는 패턴.
- `MenuRow` 의 `ui/` 승격 — 2번째 callsite 등장 시.
- `Text` 의 style array per-render perf — 저성능 Android 대비.
- hover/active 상태 색 변형, 다크 모드, 차트·태그 카테고리 hue.
- `useReportDetail` 패턴을 `fieldStore` / `visitStore` 로 확장.
