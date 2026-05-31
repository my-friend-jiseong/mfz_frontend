# 일가요 디자인 시스템

프론트엔드(React Native + Expo) 디자인 시스템의 단일 진실 출처. 화면 코드는 항상 토큰(`src/theme/`)과 공용 컴포넌트(`src/components/ui/`)를 통해서만 스타일을 표현한다.

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

**강조는 `<Text weight="...">` 단일 채널**로 통일. `bodyBold` 류 별도 variant 없음.

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

tripBanner = red.600
```

### 5.7 Alpha 합성

`withAlpha(hex, 0~1)` → `#RRGGBBAA`. status chip active 배경(`withAlpha(c, 0.13)`) 등 18곳. **알파 합성은 항상 이 헬퍼**로.

---

## 6. Status Badge 매핑 (`src/theme/statusBadge.ts`)

색 + 형상 + 라벨 3중 인코딩(WCAG/KWCAG). 단일 진실 출처.

```ts
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

| 레벨 | offsetY | opacity | radius | android |
|---|---|---|---|---|
| `none`   | 0 | 0    | 0  | 0  |
| `card`   | 1 | 0.04 | 6  | 1  |
| `raised` | 2 | 0.08 | 12 | 3  |
| `sheet`  | 0 | 0.12 | 24 | 8  |
| `modal`  | 4 | 0.18 | 32 | 16 |

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
| `Text` | `variant` / `weight` / `color` / `align` | 모든 텍스트 진입로 |
| `Button` | `variant: primary/secondary/ghost/destructive` · `size: sm/md/lg` · `leftIcon` / `rightIcon` · `loading` · `disabled` · `fullWidth` | 1차 액션 |
| `Badge` | `label` · `tone` · `shape` · `size` | 상태 표시 (3중 인코딩) |
| `Card` | `padding: none/sm/md/lg` · `variant: outline/elevated/flat` · `onPress` | 카드/타일 |
| `Input` | `label` · `error` · `helperText` · `leftSlot` / `rightSlot` (forwardRef) | 폼 입력 |
| `FilterChip` | `label` · `active` · `activeColor` · `dashed` · `leftIcon` · `disabled` | 선택 가능 chip (`withAlpha(c, 0.13)` 배경) |
| `SectionHeader` | `title` · `description` · `action` | 섹션 구분 |
| `LoadingState` | `label` · `inline` | 로딩 표시 |
| `Skeleton` | `width` · `height` · `rounded` | 로딩 placeholder (reanimated shimmer) |
| `StickyBottomBar` | `children` (+ `useSafeAreaInsets`) | 화면 하단 sticky CTA, home indicator 회피 |
| `EmptyState` | `title` · `description` · `icon` · `action` | 빈 상태 (`src/components/EmptyState.tsx`) |

---

## 10. 도메인 컴포넌트

| 위치 | 컴포넌트 | 역할 |
|---|---|---|
| `src/components/trips/` | `TripSummaryCard` | 외근 진행률 (elapsed + bar + ratio) |
| | `CurrentDestCard` | 체크인 풀폭 + 길찾기/재최적화/건너뛰기 utility row |
| | `AllDoneCard` | 모든 목적지 완료 상태 |
| | `DestinationRow` | 목적지 행, memo + status Badge |
| `src/components/fields/` | `ManualCoordinateForm` | KR 좌표 직접 입력 (new / edit 공유) |
| `src/components/` | `FieldCard` | 현장 카드 (status chip + 주소) |
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

---

## 14. 미적용 / 차후 과제

- 보조 컴포넌트(`MapFilterBar` · `ProjectPicker` · `WebChoiceModal` · `SessionGuardModal` · `KakaoMapWebView` · `AttachmentPreview`) — RN `Text` 직접 사용으로 Pretendard 미적용 잔존. 다음 사이클 후보.
- `SectionLabel` 컴포넌트 추출 — 12+ 화면에서 반복되는 패턴.
- `MenuRow` 의 `ui/` 승격 — 2번째 callsite 등장 시.
- `Text` 의 style array per-render perf — 저성능 Android 대비.
- hover/active 상태 색 변형, 다크 모드, 차트·태그 카테고리 hue.
- `useReportDetail` 패턴을 `fieldStore` / `visitStore` 로 확장.
