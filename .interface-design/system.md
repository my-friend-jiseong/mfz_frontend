# Design System — 일가요 (mfz_frontend)

> 이 파일은 **기존 `src/theme/*` 를 서술한 것**이다. 새 토큰을 만드는 자리가 아니다.
> 값이 어긋나면 코드가 진실이고 이 문서가 틀린 것 — `src/theme` 를 고친 뒤 여기를 갱신한다.
> 마지막 동기화: 2026-07-29

---

## Platform — 읽기 전 필수

**React Native (Expo 54 / RN 0.81), 웹 아님.** interface-design 스킬 본문은 CSS/HTML 전제이므로 다음과 같이 번역해서 적용한다.

| 스킬이 말하는 것 | 여기서의 실제 |
|---|---|
| CSS 변수 (`--foreground`) | `src/theme/colors.ts` 의 semantic 객체 |
| Tailwind 유틸리티 / className | `StyleSheet.create` + theme 토큰 import |
| 네이티브 HTML → headless 프리미티브 | `src/components/ui/*` → RN 코어 → 마지막에 직접 구현 |
| `:hover` | 없음. `Pressable` 의 `pressed` + `opacity.pressed` |
| `box-shadow` 3중 레이어 | `elevation.ts` (iOS shadow* / Android elevation, web은 elevation 0) |
| `text-wrap: balance`, `font-smoothing`, `tabular-nums` | 적용 불가 또는 무의미 — 시도하지 말 것 |
| `cubic-bezier(...)` | `motion.ts` 의 `easing.*` 배열 (reanimated/Animated 호환) |
| 다크 모드 | **미지원.** 라이트 단일. 다크 분기 코드 추가 금지 |

추가 제약:
- 웹 렌더 확인은 **포트 8081 고정** (카카오 지도 키가 8081만 등록됨).
- `Alert.alert` 는 web 에서도 `webAlertPatch` 로 동작한다 — web 분기 만들지 말 것.
- 지도는 `KakaoMapWebView` (WebView + `.web.tsx` 분리). 지도 내부 스타일은 이 시스템 밖.

---

## Direction

**Personality:** Utility & Function — 야외 작업용 도구. 밖에서, 한 손으로, 밝은 햇빛 아래 쓰는 화면이다. 예쁨보다 "지금 어디 가야 하는지"가 0.5초에 읽히는 것이 우선.

**Human:** 가로수·현장 점검 담당자. 이동 중이거나 현장에 서 있고, 5분 전에 한 곳을 방문 완료 처리했고, 5분 뒤에 다음 목적지로 걷는다.

**Core verb:** 다음 목적지를 찾아 방문 결과를 남긴다.

**Foundation:** cool (slate 중립 + blue 브랜드).

**Depth:** **borders-first.** 기본 구분은 1px `colors.border`. 그림자는 *실제로 떠 있는 것* 에만 — 바텀시트, 모달, 지도 위 떠 있는 카드. 일반 리스트 카드는 `variant="outline"` 이 기본이고 `elevated` 는 예외다. 두 전략을 한 화면에서 섞지 않는다.

**Density:** 여유 쪽. 터치 타깃 44px 이상(`Button` md = minHeight 44, `Input` = 48). 데이터 밀도를 위해 이 값을 깎지 않는다 — 장갑 낀 손과 흔들리는 버스가 전제다.

**Signature:** **색+형상+라벨 3중 인코딩 상태 배지.** 방문 상태를 색으로만 말하지 않고 ●▲■◆ 형상과 한글 라벨을 항상 함께 붙인다 (KWCAG). 이 앱을 다른 대시보드와 구분하는 요소이고, 상태를 표시하는 모든 새 UI는 이 규칙을 따른다.

---

## Tokens

전부 `src/theme/` 에 있다. **화면 코드에서 raw hex / 매직 넘버 금지.**

### Spacing — `spacing.ts`
base 4px. `xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32`
스케일 밖의 값(10, 14, 18…)을 쓰지 않는다.

### Radius — `spacing.ts`
`sm 6 · md 10 · lg 16 · pill 999`
입력·버튼·카드 = `md`. 배지·칩 = `pill`. 바텀시트 상단 = `lg`.

### Typography — `typography.ts`
Font: **Pretendard** (Regular / SemiBold / Bold / ExtraBold 4종만 로드. Medium 없음 — 추가 금지, 번들 4.7MB).

| variant | size / lineHeight | weight |
|---|---|---|
| h1 | 28 / 36 | heavy(800) |
| h2 | 22 / 30 | bold(700) |
| h3 | 18 / 26 | bold(700) |
| bodyLg | 18 / 26 | regular |
| body | 16 / 24 | regular |
| bodySm | 14 / 20 | regular |
| caption | 12 / 16 | regular |

위계는 **size + weight + color 세 축을 같이** 쓴다. `<Text variant color weight>` 로만 표현하고 인라인 fontSize 를 새로 만들지 않는다.

### Colors — `colors.ts` (semantic) ← `palette.ts` (raw)
화면은 `colors.*` 만 import. `palette` 직접 import 금지.

```
text        slate900   textMuted  slate500   textSubtle slate400
background  slate50    surface    white      surfaceMuted slate100
border      slate200   borderMuted slate100  focus      blue500
primary     blue600    success    green600   danger     red600
warning     amber600   info       sky600
```
- 전경 4단계(text / textMuted / textSubtle / textInverse)를 다 쓴다. 2단계만 쓰면 위계가 납작한 것.
- 강조색은 **blue 하나**. 두 번째 accent 도입 금지.
- **빨강 = 파괴적 액션 전용.** 진행 중 외근 배너가 blue 인 이유(`tripBanner`)가 이것 — 색 의미 1:1 유지.
- `*Muted` 는 tint 배경 전용(배지·칩), 텍스트 색으로 쓰지 않는다.

### Elevation — `elevation.ts`
`none · card(1/0.04/6) · raised(2/0.08/12) · sheet(0/0.12/24) · modal(4/0.18/32)`
한 단계씩만 올린다. 카드 위 카드에 `modal` 을 쓰지 않는다.

### Motion — `motion.ts`
`instant 80 · fast 120 · base 180 · slow 240` — **240ms 상한.** 스킬이 말하는 300~500ms 모달 값은 여기 적용하지 않는다.
easing: `standard [0.2,0,0,1]` 기본, `decel` 진입, `accel` 퇴장.
opacity: `pressed 0.85 · disabled 0.4`.
`transform` / `opacity` 만 애니메이션한다 (RN 에서도 동일 — width/height 는 레이아웃 재계산).

---

## Patterns

새로 만들기 전에 `src/components/ui/index.ts` 를 먼저 본다.

### Button — `ui/Button.tsx`
- variants: `primary`(blue 채움) · `secondary`(흰 배경 + border) · `ghost`(투명, blue 글자) · `destructive`(red 채움) · `dangerGhost`(투명, red 글자)
- sizes: `sm` minHeight 36 / pad 8·12 / 14px · `md` **44** / 12·16 / 16px · `lg` 52 / 16·24 / 16px
- radius `md`(10). 텍스트는 항상 bold(700).
- `loading` 은 `disabled` 와 같이 dim(0.4) 된다 — 탭 안 먹힘 인상 제거.
- ghost = 비파괴, dangerGhost = 파괴. 이 짝을 깨지 않는다.

### Card — `ui/Card.tsx`
- variants: `outline`(기본, 1px border) · `elevated`(elevation.card) · `flat`
- padding: `none · sm 8 · md 12 · lg 16`(기본)
- 배경 `surface`(white), radius `md`. `onPress` 주면 Pressable + pressed 0.85.

### Badge — `ui/Badge.tsx`  ← **signature**
- tone: primary/success/warning/danger/info/neutral (fg = 진한 색, bg = `*Muted`)
- shape: `● ▲ ■ ◆` — 상태 배지에는 **반드시** 함께.
- 매핑 단일 출처: `theme/statusBadge.ts` (`VISIT_STATUS_BADGE`, `DESTINATION_STATUS_BADGE`). 화면에서 tone/shape 를 직접 고르지 않는다.
- pill radius, sm 2·8 pad / 12px, md 4·12 / 14px.

### Input — `ui/Input.tsx`
- minHeight 48, 흰 배경 + 1px border, radius md, 좌우 pad 12.
- label(14 semibold muted) / error(12 danger) / helper(12 muted) 슬롯 내장.
- 에러는 border 를 danger 로. placeholder 는 `textSubtle`.
- 주의: 스킬은 "input 은 주변보다 어둡게" 라고 하지만 여기는 **canvas(slate50) 위 흰 필드** 로 반대다. 이 앱의 규칙을 따른다.

### 그 외 기성품
`Text · SectionHeader · FilterChip · FilterAccordion · Skeleton · LoadingState · EmptyState · StickyBottomBar · useHideOnScroll`
도메인: `FieldCard · TripCard · DestinationRow · CurrentDestCard · TripProgressStrip · MapSheetLayout · MapLegend · TripStatusBanner`

---

## States

- 인터랙티브: default / pressed(0.85) / disabled(0.4) / loading. **hover·focus ring 은 RN 에서 의미 없음** — 웹 렌더 확인용으로만 존재.
- 데이터: loading(`Skeleton`/`LoadingState`) / empty(`EmptyState`) / error. 세 개를 다 붙이지 않은 목록 화면은 미완성으로 본다.
- 터치 타깃 44×44 미만 금지.

---

## Decisions

| 결정 | 이유 | 날짜 |
|---|---|---|
| borders-first, 그림자는 떠 있는 표면만 | 야외 밝은 화면에서 그림자는 거의 안 보인다. 경계선이 정보를 더 준다 | (기존) |
| 모션 상한 240ms | 이동 중 반복 조작. 180ms 넘으면 기다린다는 감각 | (기존) |
| 빨강은 파괴적 액션 전용, 진행 중 외근 배너는 blue | 색 의미를 1:1 로 — 종료 버튼 빨강과 배너 빨강이 겹쳐 의미가 흐려졌었음 | (기존, UI/UX P1-2) |
| 상태는 색+형상+라벨 3중 인코딩 | KWCAG. 색만으로 정보 전달 금지 | (기존) |
| Pretendard 4 weight 만 로드 | Medium callsite 0 + 시각 차 미미. 6.3→4.7MB | (기존) |
| 다크 모드 미지원 | 사용 시간대가 주간 현장. 유지 비용 대비 이득 없음 | (기존) |
| 데모/시드 데이터는 부산 실주소 | 시연 지역 기준 | (기존) |

---

## Open — 아직 결정 안 된 것

1. **토큰 이름이 도메인을 말하지 않는다.** `slate` / `blue` 는 Tailwind 기본값 그대로다. 스킬 기준으로는 "템플릿 신호". 다만 `palette.ts` 는 의도적으로 raw scale 이고 semantic 층(`colors.ts`)이 따로 있으므로 **바꾼다면 semantic 쪽 이름**이지 palette 가 아니다. 지금 건드리지 말 것 — 40+ 화면에 flat alias 가 흩어져 있어 별도 작업으로 다뤄야 한다.
2. **h1(28/heavy) 이 실제로 쓰이는 화면이 적다.** 화면당 focal point 가 뭔지 화면별로 정해진 적이 없음.
3. **spacing 리듬이 균일하다.** 대부분 lg(16) 하나로 붙어 있어 "그룹은 좁게, 그룹 사이는 넓게" 가 안 되어 있다. 새 화면부터 적용.
