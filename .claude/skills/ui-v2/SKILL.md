---
name: ui-v2
description: |
  일가요 UI v2 개편(디자이너 개선안)을 코드로 구현할 때 사용한다. Figma `UI - 개선본`(336:1078) → RN 화면.
  트리거: "UI 개편", "개선본", "v2 화면", "명세 v2", "FE-OUT/FE-CHK/FE-WRAP/FE-VED/FE-SITE/FE-RPT",
  "방문 수정", "외근 정리 펼침", "스와이프 삭제", "토스트", "액션 시트", "인라인 제목",
  figma.com/design/MlfpDS0wOeN90iNl5JCPWp URL 중 node-id 가 470- 또는 336- 로 시작하는 것.
  Figma 에 쓰는 작업은 figma-design-system 스킬이 맡는다.
---

# UI v2 구현

계획·화면 대응표·백엔드 차단점은 **`docs/roadmap/07_ui-v2-redesign.md`** 에 있다. 먼저 읽는다.
명세는 `docs/일가요-프론트엔드-요구사항-명세-v2.md`. 이 스킬은 **어떻게** 옮기는지만 다룬다.

---

## 1. 진실 출처

- **동작**은 명세 v2 가 이긴다. Figma 는 프로토타입이라 명세 §2.5 의 "실제 앱" 열과 다르면 명세를 따른다.
- **값**은 `src/theme` 가 이긴다. `get_design_context` 가 준 hex·px 를 그대로 쓰지 않는다. 토큰으로 스냅하고, 맞는 토큰이 없으면 멈추고 사용자에게 묻는다.
- **개선본 페이지는 디자이너 소유다. 읽기만 한다.** 수정·주석·노드 추가 금지.

## 2. 화면 하나를 옮기는 순서

1. 대응표(로드맵 §3)에서 프레임 id·라우트·명세 ID 를 찾는다. 상태 변형(`· 펼침`, `· 더보기` 등)도 함께 본다.
2. `get_screenshot`(프레임, `maxDimension` 1200) 으로 전체를 본다.
3. `get_design_context` 는 **프레임 전체가 아니라 바뀐 영역 노드**로 좁혀 호출한다. 호출 시 `clientFrameworks: "react-native"`, `clientLanguages: "typescript"`. 출력은 React+Tailwind 라 **번역 대상일 뿐 복사 대상이 아니다**.
4. 현재 코드와 차이만 고친다. 화면을 새로 쓰지 않는다 — 원본 페이지는 이 코드에서 조립됐으니 대부분 이미 맞다.
5. 명세 ID 체크리스트를 커밋 메시지에 적는다(`FE-WRAP-02,05`).

**Figma 레이어명 → 코드 대응**

| Figma | 코드 |
|---|---|
| `Button` `Badge` `Card` `Input` `FilterChip` `FieldLabel` `GroupLabel` `StickyBottomBar` `LoadingState` | `src/components/ui/*` |
| `FilterHead` `FilterOptionRow` | `ui/FilterAccordion` |
| `FieldCard` `TripCard` `DestinationRow` `EmptyState` | `src/components/` 도메인 |
| `map (KakaoMapWebView)` + `sheet` | `MapSheetLayout` |
| `actionSheet` · `dialog` · `Toast` | Phase 1 신설 `ActionSheet` · `ConfirmDialog` · `Toast` |
| `bottomBar` · `stickyBottomBar` | `StickyBottomBar` (좌 보조 + 우 주행동) |
| `behind` · `keyboard` · `safe area (top)` | 시연용 배경. 구현하지 않는다 |
| `icon/<name>` | Ionicons `<name>` |

## 3. 이 코드베이스의 함정

전부 과거에 실제로 당한 것이다.

- **gorhom 시트 안 높이가 바뀌는 UI**(펼침 카드)는 `MapSheetLayout` 의 명시 height 우회와 부딪힐 수 있다. 웹에서 되더라도 Expo Go 에서 스크롤 끝까지 가는지 확인한다.
- **하단 바는 시트 밖에 마운트한다.** 시트 안에 두면 pan 이 터치를 가로챈다.
- **시트 안에서 `SectionList` 금지** — 웹에서 크래시. FlatList 에 헤더 행을 섞는다.
- **같은 틱에 setState + navigate 금지** — 무음 Fabric 크래시. 떠나는 화면의 폼 상태를 바꾸지 않는다.
- `Alert.alert` 는 웹에서도 동작한다(`webAlertPatch`). 다만 v2 의 확인 창은 `ConfirmDialog` 로 옮긴다.
- 스와이프는 RNGH #3720(우리 스택 iOS 크래시) 때문에 **스파이크 결과가 나오기 전엔 쓰지 않는다**. 로드맵 §6 S1.
- 서버에 없는 API 는 프론트에서 optional 로 먼저 만들고 `docs/backend/backend-backlog.md` 에 적는다. 없는 엔드포인트를 추측해 호출하지 않는다.
- **이 저장소 파일은 CRLF 다.** node/sed 로 `
` 이 들어간 문자열을 치환하면 매치 실패가 **조용히** 지나간다(Phase 1 에서 호스트 마운트가 이렇게 빠졌다). 여러 줄 치환은 Edit 도구로 하거나, 치환 후 grep 으로 반영을 확인한다.
- 삭제되는 라우트(`trips/[id]/edit`)의 참조는 `grep` 전수로 찾는다. `head` 로 자르지 않는다.

## 4. 검증

- [ ] `npm run typecheck`
- [ ] 웹 **8081** 에서 더미 계정으로 해당 화면을 띄우고 Figma 스크린샷과 나란히 비교. 필요한 상태(진행 중 외근, 미작성 보고서 등)는 직접 만든다
- [ ] 지도 화면이 멈추면 코드보다 위치 권한 팝업부터 의심
- [ ] 명세 §10 수락 기준 중 해당 항목 통과
- [ ] 사용자 웹 확인 전 `release` 머지 금지
