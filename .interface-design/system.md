# Design System — 일가요 (mfz_frontend)

## 이 파일의 역할

**토큰·컴포넌트 명세는 여기 없다. `docs/reference/design-system.md` 가 단일 진실 출처다.**
이 파일은 interface-design 스킬이 그 문서를 올바로 적용하기 위한 **어댑터** 3가지만 담는다.

1. RN 번역 — 스킬 본문이 CSS/HTML 전제라 그대로 쓰면 안 되는 부분
2. 우선순위 규칙 — 스킬과 프로젝트가 다를 때 무엇이 이기는가
3. 미결 — 스킬 기준으로 아직 결정되지 않은 것

값이 필요하면 `docs/reference/design-system.md` → `src/theme/*` 순으로 본다.
마지막 동기화: 2026-07-29

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

### 스킬이 이기는 것 (프로젝트에 결정 기록 없음)

- **Concentric radius** — `outer = inner + padding`. 현재 어디에도 없음. 중첩 카드/버튼에 적용.
- **숫자 정렬** — 변하는 숫자(카운트·진행률·시각·거리)는 `fontVariant: ['tabular-nums']`. **RN 지원됨**, 현재 사용처 0.
- **Depth 전략 하나로 통일** — 아래 3절 참조. 지금은 outline 기본 + elevation 5단계가 근거 없이 공존.
- **Input 은 inset** — 아래 3절 참조.
- **간격 리듬을 불균등하게** — 그룹 안은 좁게, 그룹 사이는 넓게. 현재 lg(16) 균일.
- **선보다 여백·톤차** — 위계를 border 로 먼저 만들지 않는다.
- **60/30/10 배분** — 중립 표면이 대부분, accent 는 10% 내외.
- **hover/active 색 변형** — 문서 14절에 차후 과제로 올라와 있음. "RN 이라 불가"가 아니다.

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

1. **Depth 전략이 둘로 갈려 있다.** `Card` 기본은 `outline`(1px border)인데 `elevation` 은 5단계가 있다.
   스킬은 하나를 골라 commit 하라고 한다. 어느 쪽을 고를지 기록이 없음.
2. **Input 이 주변보다 밝다.** canvas slate50 위에 흰 필드 + border. 스킬은 입력을 inset(더 어둡게)으로 본다.
   현재는 `Card`(흰 배경 + border)와 `Input` 이 채움·radius 가 같아 **테두리 색으로만 구분**된다.
   `surfaceMuted`(slate100) 채움이 후보. 폼 전 화면에 걸리는 변경.
3. **토큰 이름이 도메인을 말하지 않는다.** `slate`/`blue` 는 Tailwind 기본. 스킬 기준 "템플릿 신호".
   단 `palette.ts` 는 의도적으로 raw scale 이고 semantic 층이 따로 있으므로, 바꾼다면 `colors.ts` 쪽이지
   palette 가 아니다. 40+ 화면에 flat alias 가 흩어져 있어 별도 작업.
4. **h1(28/heavy) 사용 화면이 거의 없다.** 강령 1이 "1 화면 = 1 결정"인데 화면별 focal element 가
   지정된 적이 없음.
5. **간격이 lg(16) 하나로 균일하다.** 그룹 안/그룹 사이 구분이 없어 리듬이 단조로움.
6. **Direction 을 사람이 정한 적이 없다.** 아래 4절은 내가 코드에서 추론한 것이지 승인된 방향이 아니다.

---

## 4. Direction (추론, 미승인)

> 스킬은 작업 전에 domain/color world/signature/rejecting 을 요구한다.
> 아래는 코드에서 읽어낸 잠정치 — 사용자 확인 전까지 **결정으로 인용하지 말 것**.

- **Human:** 가로수·현장 점검 담당자. 이동 중이거나 현장에 서 있음. 5분 전에 한 곳을 방문 완료 처리했고 5분 뒤 다음 목적지로 걷는다.
- **Core verb:** 다음 목적지를 찾아 방문 결과를 남긴다.
- **Signature:** 색+형상+라벨 3중 인코딩 상태 배지 (`theme/statusBadge.ts`). 이건 추론이 아니라 문서화된 것 — 상태를 표시하는 새 UI는 전부 이 규칙을 따른다.
- **Density:** 터치 타깃 44px 이상 (`Button` md=44, `Input`=48). 밀도를 위해 깎지 않는다.
- **미확정:** personality / color world / 거부할 기본값 3개 — 사람이 정해야 함.
