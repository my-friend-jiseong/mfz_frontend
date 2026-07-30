# Design System — 일가요 (mfz_frontend)

## 이 파일의 역할

**토큰·컴포넌트 명세는 여기 없다. `docs/reference/design-system.md` 가 단일 진실 출처다.**
이 파일은 interface-design 스킬이 그 문서를 올바로 적용하기 위한 **어댑터** 3가지만 담는다.

1. RN 번역 — 스킬 본문이 CSS/HTML 전제라 그대로 쓰면 안 되는 부분
2. 우선순위 규칙 — 스킬과 프로젝트가 다를 때 무엇이 이기는가
3. 미결 — 스킬 기준으로 아직 결정되지 않은 것

값이 필요하면 `docs/reference/design-system.md` → `src/theme/*` 순으로 본다.
마지막 동기화: 2026-07-30

---

## 1. 우선순위 규칙 (먼저 읽을 것)

> **문서화된 프로젝트 결정이 스킬을 이긴다. 그 외에는 스킬을 따른다.**

"문서화된 결정"은 다음 둘 중 하나에 **이유와 함께** 적혀 있는 것만 인정한다:
- `docs/reference/design-system.md` 13절 강령
- `src/theme/*` · `src/components/ui/*` 의 코드 주석 (예: `colors.ts` tripBanner, `Button.tsx` dangerGhost)

코드에 그렇게 되어 있다는 사실만으로는 결정이 아니다 — 관성일 수 있다.
현재 상태를 결정으로 굳히지 말 것. 판단이 서지 않으면 스킬 쪽.

### 프로젝트가 이기는 것 (근거 있음)

| 규칙 | 근거 |
|---|---|
| 1 화면 = 1 결정. CTA 둘이면 위계로 답한다 | 강령 1 (= 스킬의 "one focal point", 충돌 아님) |
| 색만으로 정보 전달 금지 — 색+형상+라벨 3중 인코딩 | 강령 2, KWCAG. **이 앱의 signature** |
| 데이터 화면은 loading / empty / error 3종 강제 | 강령 3 |
| 토큰만 쓴다. 없으면 토큰을 추가 | 강령 4 |
| 표준 transition 200ms 이내 | 강령 5. 스킬의 `<300ms` 안에 들어가므로 충돌 아님 |
| 빨강 = 파괴적 액션 전용. 진행 중 외근 배너는 blue | `colors.ts` 주석 (UI/UX P1-2) |
| ghost = 비파괴 / dangerGhost = 파괴 | `Button.tsx` 주석 (UI/UX P1) |
| Pretendard 4 weight 만. Medium 추가 금지 | 문서 1절, 번들 크기 |
| `palette` 직접 import 금지, `colors.*` 로만 | 문서 4절 |
| 알파 합성은 항상 `withAlpha()` | 문서 5.7절 |
| Depth 는 하나 — 문서 흐름 테두리 / 지도 부유물 그림자 | 강령 6, 문서 7절 |
| 표면을 손으로 짜지 않는다 — `<Card>` 로 | 강령 7 |
| focal 숫자는 `metric`, 그 외 변하는 숫자는 `<Text numeric>` | 강령 8, 문서 3.1절 |
| Input 은 inset (`colors.control.*`) | 문서 5.3.1절 |
| 간격은 "무엇 사이인가" 로 tier 결정 | 문서 2.1절 |
| Concentric radius — inset ≤ 8px 일 때만 적용 | 문서 2.2절 |
| 토큰 이름 도메인화 안 함 (`slate`/`blue` 유지) | 문서 14절 "보류한 것" |

> 2026-07-30 재검토에서 위 6줄이 "스킬이 이기는 것" → "프로젝트 결정" 으로 넘어왔다.
> 이유까지 SSOT 에 적혔으므로 이제는 결정이다.

### 스킬이 이기는 것 (프로젝트에 결정 기록 없음)

- **선보다 여백·톤차** — 위계를 border 로 먼저 만들지 않는다. Depth 결정(테두리)과 충돌 아님: 테두리는 *표면 경계*, 위계는 *여백·굵기·크기*로.
- **60/30/10 배분** — 중립 표면이 대부분, accent 는 10% 내외.
- **hover/active 색 변형** — 문서 14절에 차후 과제로 올라와 있음. "RN 이라 불가"가 아니다.
- **press 는 `scale(0.97)`** — 현재 `opacity.pressed` 만. 촉감은 크기 변화가 더 정확하다.

---

## 2. RN 번역 (스킬 본문 → 이 코드베이스)

**React Native (Expo 54 / RN 0.81).** 웹이 아니다.

| 스킬 표현 | 여기서의 실제 |
|---|---|
| CSS 변수 `--foreground` | `src/theme/colors.ts` semantic 토큰 |
| Tailwind className | `StyleSheet.create` + theme import |
| 네이티브 HTML → headless 프리미티브 | `src/components/ui/*` → RN 코어 → 마지막에 직접 구현 |
| `box-shadow` 3중 레이어 | `elevation.ts` (iOS shadow* / Android elevation / web) |
| `cubic-bezier(...)` | `motion.ts` `easing.*` 배열 |
| `font-variant-numeric: tabular-nums` | `fontVariant: ['tabular-nums']` — **지원됨** |
| `transform: scale(0.97)` on `:active` | `Pressable` + `opacity.pressed` 0.85 (현재 scale 아님) |
| `:hover` | 기기엔 없음. web 렌더/태블릿용으로 `opacity.hover` 0.92 존재 |

**진짜로 RN에 없는 것** (이것만 무시):
`text-wrap: balance / pretty` · `-webkit-font-smoothing` · CSS 변수 자체 · `transition: all`

**환경 제약:**
- 웹 렌더 확인은 **포트 8081 고정** (카카오 지도 키가 8081만 등록).
- `Alert.alert` 는 web 에서도 `webAlertPatch` 로 동작 — web 분기 만들지 말 것.
- 지도(`KakaoMapWebView`)는 WebView 내부라 이 시스템 밖.
- 시연·시드 데이터 주소는 부산.

---

## 3. 미결 — 스킬 기준으로 아직 결정 안 됨

아래는 **결정된 규칙이 아니라 열린 항목**이다. 건드리는 화면이 생기면 그때 스킬 쪽으로 정리하되,
시각 변경이므로 8081 웹 렌더 확인 + 사용자 확인 전에는 release 로 넘기지 않는다.

1. **60/30/10 배분을 잰 적이 없다.** accent(blue) 가 화면에서 얼마를 차지하는지 측정 없음.
   탭별 작업에서 스크린샷 기준으로 확인.
2. **press 피드백이 opacity 뿐.** 스킬은 `scale(0.97)` 을 본다. `Pressable` + reanimated 로 가능.
   전역 변경이라 `Button`·`Card`·`FieldCard` 를 한 번에 바꿔야 함.
3. **hover/active 색 변형** — 문서 14절 차후 과제. Play 전용 앱이라 hover 가 필요한 자리가 없어
   `opacity.hover` 토큰은 제거했다(§14 감사). 도입하려면 그때 이유와 함께 되살린다.
   ~~다크 모드~~ → **닫혔다**: SSOT 의 '거부하는 기본값' 4번에 "불가가 아니라 Direction 상 안 함"
   이유까지 들어갔다.

> 2026-07-30 에 닫힌 것: Depth 전략 · Input inset · 토큰 이름 · focal element · 간격 리듬 · Direction
> · 다크 모드(안 함).
> 전부 `docs/reference/design-system.md` 에 이유와 함께 들어갔다.

---

## 4. Direction — 확정됨

**야외 계측기** (2026-07-30, 사용자 확정). 전문은 `docs/reference/design-system.md` 최상단 "Direction" 절.

요약: 이동 중이거나 현장에 서 있는 점검 담당자의 **계측기**. cold neutral + blue 유지(햇빛 대비),
focal element 는 거의 항상 **숫자**, 터치 타깃 44px 사수, signature 는 색+형상+라벨 3중 인코딩 배지.
거부하는 기본값 3개: 흰 카드 균일 나열 · 숫자를 라벨과 같은 크기로 · 제목 없이 리스트로 시작하는 화면.
