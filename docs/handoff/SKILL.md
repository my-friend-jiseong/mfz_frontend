---
name: ilgayo-2nd-ui
description: 2차 개선본 화면을 Figma(UI - 2차 개선본 페이지)에서 코드로 옮기거나, 2차 화면의 동작·문구·이동을 판단할 때 사용. 기준 문서 순서, 프레임과 라우트 대응, design-to-code 규칙, 진행 순서를 담는다.
---

# 2차 UI 구현

## 기준 문서 (우선순위 순)
1. `docs/handoff/2차-구현-서버-인수인계.md`: 동작·정책·문구 규칙·서버 요청. Figma와 다르면 이 문서가 이김
2. `docs/handoff/2차-화면-구분표.md`: Figma 프레임마다 무엇을 만들지(화면·상태·시트·메뉴·확인 창·전체 지도)
3. Figma: 화면 모양과 문구. `fileKey` `MlfpDS0wOeN90iNl5JCPWp`, 페이지 `UI - 2차 개선본`(`480:3282`). 프레임 node id는 구분표에 있음
4. `docs/handoff/2차-결정-기록.md`: 왜 그렇게 정했는지. 판단이 필요할 때만 읽기

## 범위
- `.claude/skills/figma-design-system`, `docs/conventions/design-system.md`의 "코드가 원본, Figma가 사본"은 1차 `DesignSystem` 페이지 이야기. 2차 화면은 Figma `UI - 2차 개선본`이 목표 모양
- 2차 토큰: Figma 변수 `2차 · Color`, `2차 · Spacing`, `2차 · Radius`, 텍스트 스타일 `2차/…`. `src/theme`에 없는 값이면 하드코딩하지 말고 theme에 먼저 추가

## Figma 읽는 법
- 프레임 이름 `{번호} {화면}[ · {상태}]`. 프레임 위 `caption · {이름}` 텍스트가 여는 곳·조건
- 프레임 하나 ≠ 라우트 하나. 상태·시트·메뉴·확인 창은 기준 화면 안에서 구현(구분표 참고). 시트·확인 창 프레임의 배경은 기준 화면 복사본이니 다시 만들지 않기
- 프로토타입 연결은 대표 화면 하나로 이어 둔 곳이 있음. 이동은 구분표의 `여는 곳·조건`과 인수인계 문서의 '보조 화면 복귀 규칙'을 따름
- 지명·날짜·사진 같은 예시 데이터는 하드코딩하지 않기
- 7-5 길 안내는 카카오 길찾기 SDK 화면이라 그리지 않음

## design-to-code
- Figma 프레임은 오토 레이아웃이 아니라 절대 위치. `get_design_context` 결과의 좌표·`position: absolute`를 옮기지 말고 flex로 다시 짜기. 간격·크기·색은 토큰으로
- 컴포넌트는 기존 것을 먼저 씀. 아래 대응은 추론이라 코드를 읽고 확인:

| Figma 2차 컴포넌트 | 코드 후보 |
|---|---|
| Button | `src/components/ui/Button` |
| Snackbar | `src/components/ui/Toast` (`toast`) |
| 확인 창 프레임 | `src/components/ui/ConfirmDialog` (`confirm`) |
| 시트 프레임, SheetHandle | `@gorhom/bottom-sheet` |
| 메뉴 프레임(⋯·+) | `src/components/ui/ActionSheet` 또는 팝오버 새로 |
| MemoField | `src/components/ui/Input` |
| FilterChip | `src/components/ui/FilterChip` |
| Tag | `src/components/ui/Badge` |
| TabBar, TabItem | `app/(tabs)/_layout.tsx` 탭 바 |
| SearchBar, MapButton | `src/components/MapSearchBar` 등 지도 컴포넌트 |
| Pin, Pin/Number, Pin/List, StatusMark, StatusOption, AddToggle, DestinationFAB, CheckinPill | 없으면 새로 만듦 |

## 진행 방식
- 첫 작업: 계획 모드로 영역별(외근 전 / 현장 / 외근 중 / 체크인 / 보고서 / 내 정보 / 로그인) 지금 코드와 2차의 차이를 표로. 서버 변경이 필요한 것과 결정이 필요한 것을 따로 표시하고 사람 확인을 받은 뒤 구현
- 구현은 영역 하나씩, PR 하나씩
- 화면 하나를 끝내면 Figma `get_screenshot`과 실제 화면을 나란히 놓고 비교. 문구는 Figma와 글자까지 같게(문구 규칙은 인수인계 문서 '용어·문구 규칙')
