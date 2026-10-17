# 카카오맵 히트맵 구현 가이드 (일가요 / mfz_frontend)

> **목적**: Claude Code 작업 지시서. "현장 밀집도" 히트맵을 고정 px 블롭 누적 방식에서
> **KDE(커널 밀도) 방식**으로 교체한다.
>
> **출처 주의**: 이 문서는 클로드 데스크톱이 준 일반 RN+카카오 가이드를, **우리 실제 코드베이스에
> 맞게 재작성**한 것이다. 원본은 "히트맵 전용 WebView 컴포넌트를 새로 만든다"는 전제였는데,
> 우리는 그러면 안 된다(§3 참고). 원본에서 **그대로 가져온 것 / 우리 환경 때문에 바꾼 것**을
> §3에 표로 정리했다. 작업 전 §3을 반드시 읽는다.

---

## 1. 목표

- 현장(점) 데이터를 **연속적인 밀도장(field)** 으로 표시한다 — 개별 원 경계가 보이면 안 된다.
- 군집(핫스팟)이 색으로 또렷이 구분되고, 화면 전체가 빨갛게 포화되지 않는다.
- pan/zoom 시 히트맵이 어긋나지 않고 따라붙는다.
- **웹과 네이티브 양쪽** 에서 동일하게 동작한다 (우리는 두 플랫폼을 모두 지원).

## 2. 현재 구현의 실제 문제 (재현 금지)

현 코드는 **점마다 화면 고정 64px radial-gradient 블롭을 깔고 겹치면 알파가 누적**되는 방식이다.
(`src/assets/kakaoMapHtml.ts`의 `renderHeatmap`, `KakaoMapWebView.web.tsx`의 `displayMode==='heatmap'` 분기)

- **고정 px라 밀도가 아니다.** 줌아웃하면 한 점이 수 km를 덮고, 줌인하면 점으로 쪼그라든다.
  "밀집도"가 아니라 화면 겹침을 보여준다.
- **알파 누적 상한이 없다.** 밀집 구역은 새빨갛게 클리핑되어 진짜 핫스팟과 구분이 안 된다.
- **단색 빨강.** 밀도 차이가 색으로 안 읽힌다.
- **count 가중치 무시.** 동일 좌표 10건이 1건과 같은 세기로 나온다(`groupSameLocationMarkers`로 묶이지만 히트맵은 head 1개만 블롭).
- **범례가 근사 사기.** `MapLegend.tsx`의 `HEATMAP_STEPS=[0.14,0.28,0.42,0.56]` 는 실제 렌더 알파와 수학적으로 무관한 "근사"다.

→ 아래 **KDE → 컬러맵** 파이프라인으로 교체하고, 위 블롭 코드(`renderHeatmap` / 웹 heatmap 분기)는 **제거**한다.

## 3. ⚠️ 우리 환경에 맞춘 핵심 차이 (원본 가이드 대비)

| 항목 | 원본 데스크톱 가이드 | **우리 환경에서는** |
|---|---|---|
| **컴포넌트 구조** | `FieldHeatmap` 라는 **새 WebView 컴포넌트**를 만들고 자체 `new kakao.maps.Map` 생성 | ❌ 절대 새 지도/WebView 만들지 마라. 우리는 **단일 통합 지도**(`KakaoMapWebView` 네이티브 + `.web` 웹)가 markers/heatmap/choropleth 3모드를 한 지도에서 처리한다. 히트맵은 **기존 지도에 레이어로 통합**한다. |
| **플랫폼** | RN WebView 단일 | **둘 다.** 네이티브 = WebView + `buildKakaoMapHtml`(HTML 문자열) + `injectJavaScript`. 웹 = `KakaoMapWebView.web.tsx`에서 **카카오 SDK 직접 사용**(WebView 없음). 두 파일을 모두 고친다. |
| **카카오 키** | `const KAKAO_JS_KEY = 'YOUR_...'` 하드코딩 | ❌ 하드코딩 금지(보안 회귀). `process.env.EXPO_PUBLIC_KAKAO_JS_KEY` 사용 — 이미 양쪽에 배선됨. |
| **baseUrl / 도메인 등록** | "도메인 등록 안 하면 지도 안 뜸 — 1순위 블로커" | ✅ **이미 해결됨.** 네이티브는 `KAKAO_WEBVIEW_BASE_URL`(`@/utils/kakaoMap`), 웹은 등록된 도메인 사용. 지도는 이미 정상 렌더된다. §8은 **참고용**일 뿐, 새 baseUrl 만들지 마라. |
| **heatmap.js 로드** | cdnjs CDN `<script src>` | ⚠️ 우리는 **번들/오프라인 우선**(경계 지오메트리도 CDN 없이 번들. `kakaoMapHtml.ts` 주석 참고). 웹 = `npm i heatmap.js` 후 import. 네이티브 = 미니파이된 h337 소스를 HTML 템플릿에 **인라인(vendored)**. CDN은 최후 폴백. |
| **데이터 주입** | `setHeatPoints(json)` + 수동 quote 이스케이프 | 우리 컨벤션을 따른다: 세터 이름 `window.__mfzSetHeatPoints`, 주입은 `__mfzSetHeatPoints(${JSON.stringify(points)})` (기존 `__mfzSetMarkers`와 동일, 수동 이스케이프 불필요). |
| **weight** | `weight` 옵션만 언급 | 우리는 이미 `groupedMarkers`에 `count`가 있다. **`value: count`로 넘겨** 동일좌표 군집을 더 뜨겁게 → §2 weight 문제 해결. |
| **mode 전환/정리** | 단일 모드 가정 | heatmap 인스턴스는 **1회 생성 후 유지**. `__mfzSetMode`가 heatmap이면 캔버스 표시+redraw, 아니면 캔버스 숨김+데이터 클리어. 토글마다 재생성 금지. |

> 만약 작업 중 **네이티브 카카오 SDK 래퍼(WebView 미사용)** 로 바뀐 흔적을 발견하면 멈추고 사람에게 확인.
> (현재 구조는 네이티브=WebView, 웹=JS SDK 직접 — 캔버스 오버레이 방식이 양쪽 모두 적용 가능하다.)

## 4. 원본에서 그대로 가져가는 것 (KDE 핵심 — 옳다)

이 부분은 데스크톱 가이드가 맞다. 유지한다.

- **heatmap.js (h337)** 로 밀도장 렌더 — 카카오 SDK엔 히트맵 레이어가 없으니 투명 캔버스 오버레이로 직접 그린다.
- **`map.getProjection().containerPointFromCoords(latlng)`** 로 위경도→화면 px 변환. (역변환 `coordsFromContainerPoint`)
- 점은 **위경도로 보관**하고, pan/zoom마다 px로 다시 변환해 `heat.setData`. → 어긋남 없음.
- **`max`** 파라미터로 포화 제어(§6). **다색 gradient** 로 밀도 차이 가독성 확보.
- pan/zoom redraw는 **`requestAnimationFrame`으로 프레임당 1회 합침**(드래그 중 폭주 방지).

## 5. 통합 위치 (어느 파일을 어떻게)

### 5.1 네이티브 — `src/assets/kakaoMapHtml.ts` (`buildKakaoMapHtml`)

기존 HTML 템플릿 **안에** 통합한다. 새 HTML 만들지 않는다.

1. `#map` 위에 투명 캔버스 오버레이 추가: `<div id="heat" style="position:absolute;inset:0;pointer-events:none;z-index:5;"></div>`
   (`#map`을 `position:relative` 래퍼로 감싸거나, 기존 `#map`에 형제로 절대배치)
2. h337 라이브러리 소스를 템플릿에 **인라인**(vendored, 오프라인). 헤드에서 1회 평가.
3. `kakao.maps.load` 콜백 안, `window.__mfzMap = map` 직후 heat 인스턴스 생성(§6 옵션).
4. 상태에 `HEAT_POINTS = []` 추가. redraw 함수 = 각 점을 `containerPointFromCoords`로 변환 → `heat.setData({max, data})`.
5. 리스너: `kakao.maps.event.addListener(map, 'bounds_changed', schedule)` + `'zoom_changed'`. `schedule`은 rAF 디바운스.
   `MODE!=='heatmap'`이면 redraw는 즉시 return(캔버스 비표시).
6. 세터 추가:
   - `window.__mfzSetHeatPoints = function(pts){ HEAT_POINTS = pts||[]; if(MODE==='heatmap') schedule(); }`
   - 기존 `__mfzSetMode`를 확장: heatmap이면 `#heat` 표시 + `schedule()`, 아니면 `#heat` 숨기고 `heat.setData({max,data:[]})`.
7. 기존 `renderHeatmap` / `heatOverlays` 블롭 코드 **삭제**.
8. **rotation/resize**: HTML 안에 `window.addEventListener('resize', schedule)` 추가(웹뷰 relayout 대응). 캔버스 크기가 안 맞으면 heat 재생성.

`KakaoMapWebView.tsx`(네이티브 컴포넌트) 쪽: 기존 `__mfzSetMarkers` 주입 effect 옆에
`__mfzSetHeatPoints` 주입 effect 추가. 페이로드는 `groupedMarkers`에서 `{lat,lng,value:count}`로 매핑.

```js
// KakaoMapWebView.tsx — 기존 inject 패턴 그대로
useEffect(() => {
  if (!ready) return;
  const pts = groupedMarkers.map((m) => ({ lat: m.lat, lng: m.lng, value: m.count ?? 1 }));
  inject(`window.__mfzSetHeatPoints&&window.__mfzSetHeatPoints(${JSON.stringify(pts)})`);
}, [ready, groupedMarkers, inject]);
```

### 5.2 웹 — `src/components/KakaoMapWebView.web.tsx`

WebView가 아니라 SDK 직접. `npm i heatmap.js`(+ `@types`는 없으니 모듈 선언 또는 `as any`).

1. 상단에서 `import h337 from 'heatmap.js'`.
2. 지도 컨테이너를 `position:relative`로 두고, 그 안에 `#heat` 캔버스 div를 ref로 생성.
3. 지도 생성(ready) 후 `heatRef.current = h337.create({ container: heatDiv, ...옵션 })` 1회.
4. `kakao.maps.event.addListener(map, 'bounds_changed'|'zoom_changed', schedule)` + rAF redraw.
5. `displayMode==='heatmap'` effect: heatDiv 표시 + setData / 아니면 숨김 + 빈 데이터. 기존 64px 블롭 분기 **삭제**.
6. redraw는 `markers`(또는 group count)에서 `{lat,lng,value}` 만들고 `map.getProjection().containerPointFromCoords`로 px 변환.
7. **resize**: 컨테이너에 `ResizeObserver` → 캔버스 크기 갱신 또는 heat 재생성.

### 5.3 범례 — `src/components/MapLegend.tsx` (§2의 "범례 사기" 해결)

- 가짜 `HEATMAP_STEPS` 단색 알파 대신, **h337과 동일한 gradient 스톱**(§6의 4색)으로 바를 그린다.
- 스케일 라벨을 `max`와 연동: "낮음 … 높음" 옆에 "약 `max`건 누적 시 최고온" 같은 정량 힌트.
- gradient 색은 매직 헥스 중복 대신 `@/theme/colors` 또는 공용 상수(`HEAT_GRADIENT`)에서 끌어와 HTML/웹/범례 3곳이 한 소스를 본다.

## 6. 파라미터 (포화 = §2 핵심을 푸는 값)

> ⚠️ **단일 소스는 `src/theme/heatScale.ts`** — 아래는 구현 후 확정값 기록. 값 변경은 heatScale 만.

```js
// heatScale.ts 확정값 (초안 28/0.6/10 → 실데이터 검증 후 조정)
HEAT_CONFIG = { radius: 36, maxOpacity: 0.72, minOpacity: 0, blur: 0.85 }
HEAT_MAX = 5          // 부산 전역 분산 50건 기준 — 10이면 전부 옅은 파랑(안 보임), 5로 군집이 주황·빨강
HEAT_GRADIENT         // 팔레트 기반 파랑→초록→주황→빨강 (palette.blue500/green500/amber500/red600)
heatRadiusForLevel(L) // 레벨 10 초과부터 반경 ÷1.5/레벨, 하한 10px — §6.1
```

- **`max`** = "몇 건이 겹쳐야 최고온(빨강)인가". 화면이 다 빨개지면 올리고, 안 보이면 내린다.
- **`value`**: 동일좌표 군집은 `count`를 넣어 가중(§3).

### 6.1 구현에서 확인된 h337 함정 (이 방식 재사용 시 필독)

- **`h337.create` 는 container 의 `position` 을 `relative` 로 강제 덮어쓴다** → 오버레이 div 에
  absolute 를 직접 주면 무효화돼 캔버스가 지도 밖으로 흘러내림. **절대배치 wrapper 안에
  100%×100% 내부 div** 를 h337 에 넘길 것 (네이티브 `#heat>#heatInner`, 웹 wrapper+heatRef).
- **`configure({radius})` 는 store 의 `_cfgRadius` 에 반영되지 않는다**(생성 시 고정) →
  동적 반경은 `setData` 의 **점별 `radius` 필드**로 전달 (원안의 configure 제안은 동작 안 함).
- **container 가 `display:none` 인 상태로 create 하면** getComputedStyle 폭이 auto→NaN 으로
  캔버스가 깨짐 → display 토글 대신 항상 표시 + 빈 데이터로 투명 처리.
- **극단 줌아웃**: 커널이 화면 px 고정이라 도시보다 커지면 '경계 밖 빨간 원'으로 수렴 →
  레벨 연동 반경 축소(`heatRadiusForLevel`)로 완화.
- **성능**: 줌 애니메이션 중엔 redraw 스킵(`zoom_start`~`zoom_changed`, idle 에서 해제),
  뷰포트 밖 점은 제외(커널 반경 밖이라 화면 기여 없음 — colorize 영역 비대 차단).

## 7. 성능 / 엣지

- pan 중 `bounds_changed` 폭주 → rAF 디바운스(필수, 코드에 포함).
- **우리 데이터 규모(부산, 현장 수십~수백)에선 bounds 필터 불필요.** 점이 수천+로 커지면
  `map.getBounds()`로 화면 안 점만 `setData`(원본 §7) — 지금은 **선택**, 적용 시 `log` 없이 조용히 자르지 말 것.
- heatmap.js는 미유지보수(pa7/heatmap.js)지만 작고 검증됨 — 데모엔 충분. vendored라 버전 고정.
- 캔버스 redraw는 우리 지도의 "오버레이는 자동 추적" 원칙의 **유일한 예외**(캔버스는 화면 px이라 직접 재계산 필요). 의도된 것.

## 8. 사람이 해야 하는 것 (이미 됨 — 신규 작업 아님)

> 원본 §8/§9의 "키 발급·도메인 등록"은 우리 프로젝트에선 **이미 완료**다. 새로 만들지 마라.
- 카카오 JS 키: `EXPO_PUBLIC_KAKAO_JS_KEY` 에 배선됨(`.env.local`).
- 도메인: 네이티브 `KAKAO_WEBVIEW_BASE_URL`, 웹 등록 도메인 — 지도 이미 렌더됨.
- 신규로 필요한 사람 작업: **`npm i heatmap.js`** (웹 import용) 정도.

## 9. 완료 기준 (DoD)

- [ ] 히트맵이 개별 원 경계 없이 **부드러운 밀도장**으로 보인다.
- [ ] 군집/희소 밀도 차이가 **다색**으로 구분된다(화면이 다 빨갛지 않다 — `max`로 제어).
- [ ] pan/zoom 시 히트맵이 **어긋나지 않는다**(`containerPointFromCoords` redraw).
- [ ] 동일좌표 군집이 `count` 가중으로 **더 뜨겁게** 나온다.
- [ ] **웹과 네이티브 양쪽** 에서 동일하게 동작한다.
- [ ] 범례 gradient/스케일이 실제 렌더(`max`·gradient)와 **일치**한다(근사 `HEATMAP_STEPS` 제거).
- [ ] 기존 64px 블롭 히트맵 코드(`renderHeatmap` / 웹 heatmap 분기)가 **제거**되었다.
- [ ] **새 WebView/지도 컴포넌트를 만들지 않았다**(기존 통합 지도에 레이어로 추가).

## 10. 검토한 대안

- **네이티브 카카오 SDK 내장 히트맵**: 없음. WebView 캔버스 방식 유지가 정답.
- **MapLibre/Mapbox 전환**: GPU 히트맵을 바로 쓰지만 한국 타일은 카카오가 우수 + 우리 지도 코드 전부 재작성이라 비용 과다. 기각.
- **직접 KDE 캔버스 구현**(heatmap.js 미사용): 가능하나 데모 일정엔 과함. heatmap.js vendored로 충분.
