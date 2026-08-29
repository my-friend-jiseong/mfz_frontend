---
name: parallel-worktree
description: |
  Use when running multiple mfz(일가요) frontend tasks in parallel across git worktrees.
  Triggers on phrases like "병렬 작업 시작", "워크트리로 작업해줘", "새 작업 추가",
  "이 작업 워크트리로 분리", "작업 충돌 확인", "진행중 작업 현황", "작업 정리(머지 후)".
  Enforces cross-session scope-overlap detection via a shared REGISTRY, main-based
  branching, per-worktree boot (node_modules · .env.local · Metro port), plan-file
  lifecycle, backend-backlog/entities cross-cutting declaration, self-review +
  typecheck + web render + /code-review gate, ff-only main merge (no PR), and
  raw-git cleanup after merge.
---

# 병렬 워크트리 작업 관리 가이드라인 (일가요 프론트엔드)

여러 git 워크트리를 동시에 상주시키며 작업을 병렬로 진행하기 위한 절차다.
한 세션은 한 번에 한 작업만 다루되, 작업마다 격리된 워크트리를 두어 컨텍스트 충돌을 막는다.
사용자는 보통 **여러 세션을 동시에 켜놓고** 병렬 작업하므로, 충돌 감지는 모든 세션이 공유하는 레지스트리를 기준으로 한다.

---

## 0. 이 스킬을 쓰는 시점 — 기본 흐름을 덮어쓰지 않는다, 그러나 사용자 신호가 최우선

이 저장소의 **평소 흐름은 `main` 직접 작업 + 즉시 push** 다. 하지만 이 흐름은 **에이전트가 사용자 언급 없이 스스로 판단해 단독 작업을 시작할 때**에만 쓴다.

### 판단 순서 — 위에서부터 확인, 처음 해당하는 조건에서 멈춘다

각 행을 독립적인 선택지로 훑어 "가장 편한 행"을 고르지 않는다. **1번이 참이면 2·3번은 보지도 않는다.**

| # | 조건 | 방식 |
|---|------|------|
| 1 | **사용자가 "병렬", "워크트리로", "따로 빼서" 등을 말했거나, 이 스킬을 이름으로 지목·참고하라고 지시했다** | **무조건 이 스킬 전체 적용 (워크트리 포함).** 예상 작업 시간·파일 개수와 무관 |
| 2 | 다른 세션이 이미 워크트리로 작업 중(레지스트리에 활성 행 존재) | 무조건 이 스킬 전체 적용 — 새 작업도 워크트리로 격리 |
| 3 | 1·2 둘 다 아니고, 에이전트가 스스로 시작하는 단독 작업 + 예상 시간 **30분 미만** | 워크트리 없이 진행 가능 (아래 고정비·§5-0 참고) |

> ⚠️ **1번을 "참고"로 축소 해석하지 않는다.** 사용자가 "이 스킬 참고해서 진행해"라고 말한 것은 "적용은 선택"이 아니라 "이 절차대로 하라"는 지시다. **사용자가 병렬 작업을 지시했다는 사실 자체가 "격리해서 다뤄야 할 규모"라는 판단을 사용자가 이미 내렸다는 뜻**이다 — 에이전트가 그 위에 "이 정도면 30분 안에 끝나겠다"는 자체 크기 추정을 얹어 워크트리를 생략하면, 사용자의 판단을 에이전트의 판단으로 덮어쓰는 것과 같다. 30분 기준(3번 행)은 **에이전트가 자기 발의로 단독 작업을 시작할 때만** 쓰는 지름길이지, 사용자가 이미 병렬을 지시한 작업에 소급 적용하는 기준이 아니다.
>
> (2026-08-29 실제 사례: 사용자가 "병렬 작업 스킬 참고해서 진행해"라고 명시했는데, 에이전트가 3번 행의 크기 추정으로 1번을 덮어써 워크트리 없이 main 에서 바로 작업했다. 우연히 다른 세션과 파일이 안 겹쳐 사고는 없었지만, 겹쳤다면 레지스트리가 그 충돌을 잡아낼 방법이 없었다.)

### 3번 행에서만 쓰는 워크트리 1개의 고정비 (2026-07-28 드라이런 실측)

| 항목 | 시간 |
|---|---|
| `npm install` (782 패키지) | 1분 22초 |
| Metro 부팅 | 약 15초 |
| `git worktree remove` (node_modules 삭제 포함) | 1분 19초 |
| **합계** | **3~4분** |

30분 미만이면 격리 이득보다 고정비가 크므로 그냥 main 에서 한다. 반대로 **반나절짜리 독립 슬라이스 작업 둘을 실제로 동시에 굴릴 때** 이 절차가 값을 한다.

- 시간 추정이 애매하면 워크트리를 만들지 말고 시작한다. 하다 보니 길어지면 그때 `git stash` → 워크트리로 옮기면 되고, 반대(만들어놓고 5분 만에 끝남)는 되돌릴 수 없다.
- **"워크트리 없이"도 §4(충돌 감지)·§5-3(레지스트리 등록)까지 생략한다는 뜻은 아니다.** 생략 가능한 건 §5-1·5-2(워크트리 생성·부팅) 뿐 — §5-0 참고.
- **"시작 시점에 다른 세션이 없었다"는 "끝날 때까지 없다"의 보증이 아니다.** 대화형 세션은 코드 줄 수는 적어도 조사·왕복이 길어 실제 경과 시간이 늘어나기 쉽다. 등록은 구현 착수 **전**에 하고, 커밋 직전 레지스트리를 한 번 더 읽어 그 사이 등록된 작업과 충돌이 없는지 재확인한다.

위 표에서 1·2번에 해당하면 §2 흐름을 처음부터 밟는다.

---

## 1. 핵심 개념

- **워크트리는 격리된 체크아웃**이다 (`.claude/worktrees/{slug}/`). 한 워크트리 안의 파일은 다른 워크트리/세션에서 보이지 않는다.
- 따라서 "지금 어떤 작업이 어떤 범위를 건드리는 중인지"는 **모든 세션이 절대경로로 읽는 공유 레지스트리**(`REGISTRY.md`)에만 존재한다. 충돌 감지의 SSoT다.
- 레지스트리와 계획서는 **메인 체크아웃의 gitignore된 경로**에 둔다. 어떤 브랜치에도 커밋되지 않는다.

### 공유 저장소 구조 (메인 체크아웃 기준)

```
<main-root>/.claude/worktrees/
├── REGISTRY.md          # 활성 작업 인덱스 (충돌 감지의 SSoT)
├── plans/
│   └── {slug}.md        # 작업별 상세 계획서
└── {slug}/              # EnterWorktree가 만드는 실제 워크트리 (자동 생성)
```

`.gitignore`에 `.claude/`가 통째로 등록되어 있어 별도 조치가 필요 없다.

### 메인 루트 / 레지스트리 경로 계산 (어느 워크트리에서든 동작)

```bash
MAIN_ROOT=$(cd "$(git rev-parse --git-common-dir)/.." && pwd)
REGISTRY="$MAIN_ROOT/.claude/worktrees/REGISTRY.md"
PLANS_DIR="$MAIN_ROOT/.claude/worktrees/plans"
```

`git rev-parse --git-common-dir`는 워크트리 안에서도 메인 체크아웃의 `.git`을 가리키므로, 그 부모가 항상 메인 루트다.

### REGISTRY.md 포맷

테이블 1행 = 활성 작업 1개. 파일이 없으면 헤더만 있는 새 테이블을 만든다.

```markdown
# 활성 병렬 작업 레지스트리

| slug | branch | worktree | status | port | files | slices | plan | created |
|------|--------|----------|--------|------|-------|--------|------|---------|
| pdf-export | worktree-pdf-export | .claude/worktrees/pdf-export | in-progress | 8082 | `app/(tabs)/reports/**`, `src/api/endpoints/reports.ts`, `src/stores/reportStore.ts` | reports | plans/pdf-export.md | 2026-07-28 |
```

- **branch**: `EnterWorktree` 가 `worktree-{slug}` 로 자동 생성한다 (`feat/*` 가 아니다 — 실측). 커밋 메시지 규약은 그대로지만 브랜치명은 이 형태를 그대로 쓴다.

- **status**: `in-progress` → `review` → `ready` (머지·release 대기). 「격리 & 부팅」에서 행을 만들 때 이미 작업이 시작되므로 `in-progress`부터다.
- **port**: 이 워크트리 전용 Metro/Expo 포트 (§5-2). 메인 체크아웃이 8081을 점유하므로 워크트리는 **8082부터** 비어 있는 번호를 잡는다. 포트도 충돌 대상이다.
- **files**: 영향 파일 glob 목록 (예: `src/stores/tripStore.ts`, `app/(tabs)/trips/**`).
- **slices**: 영향 기능 슬라이스명 (§3 표의 이름 사용 — 예: `trips`, `fields`).

---

## 2. 작업 흐름 개요

각 단계는 알파벳이 아니라 하는 일로 부른다. 아래 이름이 §3~§9의 단계명과 일치한다.

```
범위 분석        요청을 읽고 영향 파일·기능 슬라이스 산출
   ↓
충돌 감지        레지스트리 대조 (파일 · 슬라이스 · 포트)
   ├─ 충돌 → 사용자에게 알림·선택
   └─ 무충돌 ↓
격리 & 부팅      워크트리 생성 + node_modules/.env.local/포트 세팅 + 레지스트리 등록 + 계획서 작성
   ↓
구현            계획서 참조하며 작업 진행 (백엔드 필요분은 백로그 append 포함)
   ↓
자체 검증        self-review → typecheck/test → (시각 변경 시) 웹 실물 렌더 → /code-review
   ↓
인계 & 머지      사용자 확인 → main ff-only 머지 + push (release 는 별도 승인)
   ↓
정리            워크트리·브랜치·레지스트리·계획서 정리 → 다음 작업 대기
```

> PR 은 쓰지 않는다. 이 저장소는 main 이 평탄한 선형 히스토리이고 머지는 항상 ff-only 다 (§8).

---

## 3. 범위 분석 — 요청에서 영향 파일·기능 슬라이스 산출

이 프로젝트는 백엔드처럼 도메인 패키지가 한 폴더에 모여 있지 않다. **한 기능은 4계층에 흩어져 있으므로**, 슬라이스를 고르면 그 4계층을 각각 열어 실제로 건드릴 파일을 산출한다.

### 3-1. 독립 슬라이스 — 병렬화하기 좋은 단위

| 슬라이스 | 라우트 | 스토어 | API | 컴포넌트 |
|---|---|---|---|---|
| `fields` | `app/(tabs)/fields/**` | `src/stores/fieldStore.ts` | `src/api/endpoints/fields.ts` | `src/components/fields/**`, `FieldCard.tsx` |
| `trips` | `app/(tabs)/trips/**` | `src/stores/tripStore.ts`, `destinationStore.ts` | `src/api/endpoints/trips.ts` | `src/components/trips/**`, `TripStatusBanner.tsx` |
| `reports` | `app/(tabs)/reports/**` | `src/stores/reportStore.ts` | `src/api/endpoints/reports.ts` | — |
| `categories` | `app/(tabs)/fields/categories.tsx` | `src/stores/categoryStore.ts` | `src/api/endpoints/categories.ts` | `CategoryMultiPicker.tsx` |
| `projects` | — | `src/stores/projectStore.ts` | `src/api/endpoints/projects.ts` | `ProjectPicker.tsx` |
| `auth` | `app/(auth)/**` | `src/stores/authStore.ts`, `sessionGuardStore.ts`, `sessionActivity.ts` | `src/api/endpoints/auth.ts` | `SessionGuardModal.tsx` |
| `profile` | `app/(tabs)/profile/**` | `authStore.ts` | `auth.updateMe` / `auth.changePassword` (`endpoints/auth.ts`) | — |

`app/(tabs)/index.tsx` 는 `/(tabs)/trips` 로 보내는 리다이렉트일 뿐이다 — 여기엔 화면이 없다.

### 3-2. 교차 레이어 — 슬라이스가 아니다. 병렬화에 취약하다

아래 셋은 **여러 슬라이스의 화면이 함께 소비**한다. "map 작업" 이라고만 선언하면 실제로는 trips·fields·reports 를 동시에 잠그는데 레지스트리는 그걸 못 본다. 그래서 이 레이어를 건드리는 작업은 **소비 화면을 files 에 전부 적고**, 되도록 다른 작업과 동시에 돌리지 않는다.

| 레이어 | 실체 | 소비 화면 (files 에 포함) |
|---|---|---|
| `map` | `MapSheetLayout` → `MapDashboard` → `KakaoMapWebView`/`MapFilterBar`/`MapLegend`/`MapSearchBar`, `src/stores/mapSettingsStore.ts`, `src/api/endpoints/map.ts` | `fields/index`, `fields/[id]/index`, `trips/index`, `trips/[id]`, `trips/active`, `trips/visit`, `trips/new/select`, `trips/new/order`, `reports/index`, `reports/[id]/index` — 지도 직접 사용: `trips/navigate`, `reports/new` — 핀 편집: `fields/new`, `fields/[id]/edit`(`FieldPinMap`) |
| `visits` | `src/stores/visitStore.ts`, `src/api/endpoints/visits.ts`, `AttachmentPreview.tsx`, `src/components/trips/ReviewVisitCard.tsx` | `fields/[id]/checkin`·`index`·`edit`, `trips/visit`·`active`·`index`·`[id]`, `reports/index`·`new`·`[id]/index`·`[id]/field-report` |
| `ui/theme` | `src/components/ui/**`, `src/theme/**` | 사실상 전 화면 — 토큰·공용 컴포넌트 변경은 단독 사이클로 돌린다 |

슬라이스 간 다리 역할 파일도 같이 본다: `src/utils/postTripFlow.ts`(외근 종료 → 보고서), `src/components/fields/quickPhotoHandoff.ts`·`useQuickPhoto.ts`(`fields/new` ↔ `trips/active`).

범위가 불확실하면 `Grep`/`Glob`로 후보를 좁히고, 넓게 퍼질 가능성이 있으면 `Explore` 에이전트로 추정한다. 추정 범위는 보수적으로(넓게) 잡아 충돌을 놓치지 않는다.

`.web.tsx` 짝 파일에 주의한다 — `KakaoMapWebView.tsx`를 건드리면 `KakaoMapWebView.web.tsx`도 files 에 포함해야 한다(`FieldPinMap`, `useKakaoPlaceSearch`, `captureView` 동일).

### 암묵적(cross-cutting) 파일 의무 선언

충돌 감지는 각 세션의 스코프 선언 정확도에 전적으로 의존한다. 직접 열 계획이 없어도 **규약상 반드시 함께 바뀌는 파일**은 files 에 명시한다. 누락하면 다른 세션과의 강충돌을 레지스트리가 놓친다.

| 작업 성격 | files 에 반드시 포함 |
|---|---|
| 서버 데이터에 **새 필드/타입** 도입 | `src/types/entities.ts` (프론트 우선 원칙상 `optional`로 먼저 선언) |
| 백엔드 작업이 필요한 요청 발생 | `docs/backend/backend-backlog.md` (여러 세션이 동시 append 하는 대표적 cross-cutting 파일) |
| 디자인 토큰·공용 컴포넌트 변경 | `src/theme/**`, `src/components/ui/**`, `docs/reference/design-system.md` |
| 화면·네비게이션 **구조** 변경(라우트 신설/삭제/이동, 탭 구성) | `app/_layout.tsx` 또는 `app/(tabs)/_layout.tsx`, `docs/diagram/IAD.drawio` |
| 데이터 모델 구조 변경 | `docs/diagram/ERD.drawio` (백로그 §12-B 와 연동) |
| 로드맵 항목 착수/완료 | `docs/roadmap/NN_*.md` (상태 표기 갱신·`docs/reference/` 이동) |
| 전역 회로 변경 | `src/api/client.ts`, `src/api/errors.ts`, `src/utils/webAlertPatch.ts`, `src/utils/backNavigation.ts` |
| 의존성 추가·버전 변경 | `package.json`, `package-lock.json` (+ §5-2 node_modules 규칙이 달라진다) |
| 앱 메타/빌드 설정 | `app.json`, `eas.json`, `vercel.json` |

---

## 4. 충돌 감지 — 레지스트리 대조

`REGISTRY.md`를 읽어 기존 활성 작업과 비교한다.

| 판정 | 조건 | 조치 |
|------|------|------|
| **강충돌** | 동일 **파일**이 겹침 | 진행 보류. 어떤 작업과 어디서 겹치는지 알리고 선택 요청 (대기 / 범위 축소 / 강행) |
| **약충돌** | 동일 **슬라이스**지만 파일은 비겹침 | 경고만 출력하고, 사용자 확인 후 진행 |
| **무충돌** | 둘 다 안 겹침 | 바로 「격리 & 부팅」으로 |

- glob 비교는 의미 기준으로 한다 (`app/(tabs)/trips/**`와 `app/(tabs)/trips/active.tsx`는 겹침).
- **교차 레이어(§3-2: map · visits · ui/theme) 작업은 병렬 후보가 아니다.** 소비 화면이 슬라이스를 가로지르므로 사실상 모든 활성 작업과 겹친다 — 다른 작업이 도는 중이면 그 사실을 알리고 **단독 사이클로 미루자고 제안**한다. 강행 시엔 소비 화면을 files 에 전부 적어 다른 세션이 오탐 없이 보게 한다.
- **`docs/backend/backend-backlog.md` 는 append-only 라 예외**다. 두 작업이 서로 다른 §항목을 추가하는 것뿐이면 강충돌로 보지 않고 **약충돌로 낮춘다** — 대신 머지 순서가 뒤인 쪽이 §번호 중복을 직접 확인한다(§번호는 고정 식별자라 재번호 금지).
- 포트가 겹치면 새 작업의 포트를 비어 있는 번호로 올린다 (판정 대상 아님, 그냥 조정).
- 사용자가 강행을 택하면 그 결정을 계획서에 기록한다.

---

## 5. 격리 & 부팅 — 워크트리 생성·실행 환경 세팅·레지스트리 등록·계획서 작성

### 5-0. §0 3번 행(워크트리 없이 진행)일 때도 등록은 한다

**§0 판단 순서에서 1·2번에 걸렸으면 워크트리를 만드니 이 절만 읽고 넘어간다.** 3번(에이전트 자체 판단 + 30분 미만)으로 워크트리를 생략하는 경우에만 아래를 따른다:

1. 5-1·5-2(워크트리 생성, `node_modules`/`.env.local`/포트 부팅)는 생략한다.
2. **5-3(레지스트리 등록)은 생략하지 않는다.** 구현에 착수하기 **전에** `REGISTRY.md`에 최소 행을 추가한다 — `branch`·`worktree` 열엔 `main`·`—`를 쓴다 (실제로는 `figma-screens` 행이 이 형식이다). `plan` 열은 계획서를 안 쓰면 `—`로 둔다(정말 작은 작업은 계획서 생략 가능 — 계획서가 아니라 레지스트리 행이 SSoT 다).
3. 작업을 마치면(커밋 또는 중단) §9와 같은 방식으로 그 행을 지운다 — 지울 워크트리·브랜치가 없다는 점만 다르다.

**이게 왜 필요한가**: §1의 SSoT 는 "레지스트리에 없으면 존재하지 않는 작업"이라는 전제로 동작한다. 워크트리 없이 진행하면서 등록도 생략하면, 그 작업은 다른 세션의 「충돌 감지」에서 영구히 보이지 않는다 — 워크트리라는 물리적 격리가 없는데 레지스트리라는 논리적 등록마저 없으면 이중으로 안 보인다. 실제로 우연히 파일이 안 겹쳐 무사했던 사례가 §0 하단에 있다.

### 5-1. 워크트리 생성

`EnterWorktree(name="{slug}")`. 세션이 해당 워크트리로 전환된다.

- 이미 다른 워크트리 세션 안이면 새로 만들 수 없다. 먼저 메인으로 복귀(또는 새 세션 사용) 후 생성한다.
- **베이스는 `origin/main` 이 맞다.** EnterWorktree 기본값(`fresh` = origin/기본브랜치)이 이 저장소 규약과 일치하므로 jikgong 처럼 베이스를 교정할 필요가 없다. 대신 최신인지만 확인한다:
  ```bash
  git fetch origin main
  git merge-base --is-ancestor origin/main HEAD || git reset --hard origin/main
  ```
- **`release` 를 베이스로 삼지 않는다.** release 는 APK 빌드 트리거용 배포 브랜치이지 개발 베이스가 아니다.

### 5-2. 워크트리 부팅 (JS 프로젝트 특유 — 빼먹으면 아무것도 안 돌아간다)

새 워크트리에는 gitignore 된 것이 전부 없다. 세 가지를 채운다. (여기서 드는 고정비와 30분 기준은 §0.)

1. **`.env.local` 복사** (git 에 없으므로 워크트리에 존재하지 않는다):
   ```bash
   cp "$MAIN_ROOT/.env.local" .
   ```
2. **`node_modules` 확보** — 기본은 워크트리 자체 설치다 (2026-07-28 드라이런 실측):
   ```bash
   npm install --no-audit --no-fund   # 약 1분 20초, 782 패키지
   ```
   - **junction 공유는 `expo start` 를 깨뜨린다.** `@expo/cli` 의 `withMetroMultiPlatform.js` 에 `if (!isDirectoryIn(__dirname, projectRoot))` 분기가 있는데, junction 은 realpath 가 메인 트리로 풀려 CLI 가 "프로젝트 밖"으로 판정된다. 그러면 `require.resolve('metro-runtime/package.json')` 을 타는데 이 의존성 트리에 top-level `metro-runtime` 이 없어(`@expo/metro/metro-runtime` 만 존재) `MODULE_NOT_FOUND` 로 죽는다. 실측 확인된 실패다.
   - junction 이 유효한 범위는 **`npm run typecheck` / `npm test` 뿐**이다. dev 서버 없이 타입만 볼 작업이면 이걸로 1분을 아낄 수 있다:
     ```powershell
     $main = Split-Path (Resolve-Path (git rev-parse --git-common-dir)) -Parent
     cmd /c mklink /J "$PWD\node_modules" "$main\node_modules"
     ```
     나중에 dev 서버가 필요해지면 `cmd /c rmdir "$PWD\node_modules"` 로 링크만 걷고(메인 트리는 무사) `npm install` 로 전환한다.
   - `package.json` 을 건드리는 작업은 당연히 자체 설치만 허용된다.
3. **포트 지정** — 메인 체크아웃이 8081 을 쓰므로 워크트리는 자기 번호로 띄운다:
   ```
   npx expo start --web --port 8082
   ```
   레지스트리 `port` 열에 기록한다. 확인 URL 도 `localhost:8081` 이 아니라 그 포트가 된다.

> **포트를 바꾸면 웹에서 지도가 안 뜬다.** 카카오 JS SDK 는 Kakao Developers 에 등록된 웹 플랫폼 도메인(`http://localhost:8081`, 포트 포함)에서만 뜬다 — `KakaoMapWebView.web.tsx` 의 실패 안내문이 그렇게 말한다. 지도 화면을 웹으로 확인해야 하는 작업이면 (a) 쓸 포트를 Kakao Developers 에 등록하거나, (b) 메인 dev 서버를 잠깐 내리고 그 워크트리를 8081 로 띄운다. 지도와 무관한 작업이면 그냥 8082+ 로 둔다.

> Metro 가 `.claude/worktrees/` 사본까지 크롤링해 haste 중복·과다 감시를 일으키는 문제는 `metro.config.js` 의 `resolver.blockList` 에서 이미 차단해 뒀다(2026-07-28). 이 파일을 건드릴 일이 생기면 cross-cutting 으로 선언한다.

### 5-3. 등록·계획서

1. **레지스트리 등록**: `REGISTRY.md`를 **쓰기 직전에 다시 read**한 뒤(다른 세션이 그 사이 추가했을 수 있음) 새 행을 추가한다. status=`in-progress`.
2. **계획서 작성**: `plans/{slug}.md`에 목표·영향범위·구현 순서·검증 방법(특히 "이 변경을 무엇으로 확인할 것인가")을 적는다. 이후 작업 중 계속 참조·갱신한다.

> 동시성은 단순 처리한다: 쓰기 전 재-read만 한다. 락 파일·낙관적 동시성은 도입하지 않는다 — **개인이 소수 세션을 저빈도로 운용**하는 전제라 두 세션이 같은 순간 등록하는 경쟁은 사실상 발생하지 않는다고 본다. 재-read는 그 드문 창을 좁히는 용도지 경쟁을 원천 차단하진 못한다.

---

## 6. 구현 — 계획서 따라 작업 진행

- `plans/{slug}.md`를 참조하며 구현한다.
- 같은 파일군은 **순차 편집**하고, `Edit` 전 반드시 `Read`한다.
- 컨벤션은 `docs/reference/design-system.md`(토큰·공용 컴포넌트가 SSoT — 색·간격 하드코딩 금지)와 주변 코드의 관용을 따른다. 신규 화면은 `SafeScreen` + `src/components/ui/**` 조합을 기본으로 한다.
- 커밋은 한국어 본문, `type(scope): 요약 — 근거` 형태(예: `feat(trips,map): 진행 중 외근 실도로 경로 — 백로그 §22 2단계 연동`). **`Co-Authored-By` 트레일러는 넣지 않는다** (hook 이 impersonation 사유로 차단).
- 워크트리 안에서는 커밋까지만 하고 push 는 작업 브랜치로 한다. main 직행 push 는 §8 에서만.

### 백엔드가 필요할 때 — 프론트 우선

서버 변경이 필요해도 **막지 않는다**. 프론트에서 먼저 동작하게 만들고 요청을 남긴다:

1. 새 필드는 `src/types/entities.ts` 에 `optional`(`?`)로 선언 — 백엔드 미구현 상태에서도 타입 안전.
2. UI·스토어·API 페이로드를 먼저 구현. 서버가 무시해도 앱이 동작하도록.
3. `docs/backend/backend-backlog.md` 에 요청을 추가한다 — **§번호는 고정 식별자라 기존 번호 재사용·재번호 금지**, 새 항목은 다음 번호로 append. 완료 항목은 하단 아카이브로 한 줄 압축.
4. 백로그를 건드렸으면 그 사실을 §3 의무 선언대로 레지스트리 files 에 이미 반영돼 있어야 한다.

---

## 7. 자체 검증 — self-review·타입·테스트·실물 렌더·/code-review 게이트

검토를 사용자에게 넘기기 **전에** 1차 품질 게이트를 직접 통과시킨다.

1. **self-review**: diff 를 직접 읽고 정확성 버그·누락 케이스·동작 변경·컨벤션 위반을 점검. 의심 지점은 코드로 검증 후 단정.
2. **정적 검증**: `npm run typecheck` (필수). 유틸 로직을 건드렸으면 `npm test` 도.
3. **시각 변경이면 실물 렌더 확인 (필수)** — 목업·추측으로 끝내지 않는다. `npx expo start --web --port {port}` 로 띄워 브라우저에서 직접 본다. 지도가 포함된 화면이면 §5-2 의 카카오 도메인 제약 때문에 8081 이 필요할 수 있다. 기기 전용 이슈(제스처·바텀시트·안전영역)는 Expo Go + `console.log` 계측으로 **수치를 먼저 확정**한 뒤 고친다.
4. **contract 의심 시 실측**: 응답 형태를 OpenAPI(`https://ilgayo.co.kr/api-docs.json`)만 보고 단정하지 않는다 — 변경계 200 본문이 문서에 누락돼 있다. 실제 호출로 확인.
5. **백로그 반영 확인**: 이번 작업에서 백엔드 요청이 생겼다면 `docs/backend/backend-backlog.md` 에 빠짐없이 들어갔는지 점검(§6).
6. **`/code-review` (high effort)** 실행 → 지적사항 조치 → 통과까지 반복.

레지스트리 status=`review` → 통과 후 `ready` 로 갱신.

---

## 8. 인계 & 머지 — 사용자 확인 후 main ff-only

1. 변경 내용을 **자연어로 요약** 보고한다 (어떤 파일을 왜 바꿨는지 + 무엇으로 확인했는지). 시각 변경이면 렌더 확인 결과를 함께 제시하고 OK 를 받는다.
2. 사용자가 "머지해" 신호를 주면 (메인 체크아웃 세션에서):
   ```bash
   git checkout main && git pull --ff-only origin main
   git merge {branch} --ff-only && git push origin main
   ```
   - **ff-only 가 거부되면 그 사실을 즉시 보고**한다. `--no-ff` 로 자동 fallback 하지 않는다.
3. 머지 직후 "브랜치 삭제 진행할까요?" 를 **한 줄로 한 번** 묻는다 (머지와 삭제는 사용자가 분리해서 주는 신호다).
4. **`release` 머지는 별도 승인 사항**이다. release 머지는 APK 빌드를 트리거하므로, 시각 변경이 포함된 작업은 사용자 OK 없이 밀지 않는다. main 까지가 자동 범위다.

> 계획서는 여기서 지우지 않는다. 머지 후 추가 수정이 나올 수 있으므로 「정리」에서 청소한다. (계획서는 gitignore 된 메인 루트 경로라 애초에 커밋에 섞이지 않는다.)

---

## 9. 정리 — 머지 후 청소

> **중요**: `ExitWorktree`는 *같은 세션에서 `EnterWorktree`로 만든* 워크트리만 정리한다. 다른/이후 세션에서는 no-op 이다. 다중 세션 운영에서는 raw git 으로 정리한다.

```bash
MAIN_ROOT=$(cd "$(git rev-parse --git-common-dir)/.." && pwd)
git worktree remove "$MAIN_ROOT/.claude/worktrees/{slug}"   # 미커밋 변경 있으면 거부 → 확인 후 --force
git branch -d {branch}                                       # 미머지면 사용자 확인 후 -D
git push origin --delete {branch}                            # 원격에 올렸던 경우, 사용자 동의 후
```

- 같은 세션 안에서 끝내는 경우엔 `ExitWorktree(action="remove")`도 가능하다. 위 raw-git 경로는 2026-07-28 드라이런에서 그대로 검증했다.
- `git worktree remove` 는 워크트리에 `node_modules`·`.env.local` 이 남아 있어도 **거부하지 않는다**(둘 다 gitignore 대상). 다만 782 패키지를 지우느라 **약 1분 20초** 걸린다 — 멈춘 게 아니니 기다린다.
- node_modules 가 **junction 이면** 먼저 링크만 걷는다: `cmd /c rmdir "{worktree}\node_modules"`. junction 제거는 대상 폴더를 지우지 않는다 — 반드시 `rmdir`, `Remove-Item -Recurse` 금지(메인 트리 node_modules 가 통째로 날아간다).
- 브랜치명은 `worktree-{slug}` 다 (§1).
- `plans/{slug}.md`를 삭제한다.
- `REGISTRY.md`에서 해당 행을 삭제한다 (쓰기 전 재-read).
- 정리 완료 후 다음 작업을 대기한다.

### stale 행 청소

세션이 죽거나 작업이 방치되면 레지스트리 행이 영구히 남아 **이후 작업을 거짓 강충돌로 오탐**시킨다. 현황 조회(§10)나 새 작업 「충돌 감지」 시 다음을 만족하는 행은 **stale 후보**로 보고, 사용자에게 알린 뒤 정리한다.

- 워크트리 경로가 실재하지 않거나(`git worktree list`에 없음), 워크트리의 `git status -s`가 비어 있고 브랜치도 없으며,
- `created`가 충분히 경과(기본 7일 이상)한 경우.

판단이 애매하면 지우지 말고 사용자에게 확인을 받는다.

---

## 10. 보조 모드 — 현황 조회 / 워크트리 이동

- **현황 조회** ("진행중 작업 현황", "작업 목록"): `REGISTRY.md`를 읽어 표로 출력한다. 각 워크트리의 `git status -s`, 미푸시 커밋 수, 점유 포트를 함께 보여주면 유용하다.
- **워크트리 간 이동**: 이미 존재하는 다른 워크트리로 전환은 `EnterWorktree(path="<worktree-path>")`. 새 워크트리를 만들려면 워크트리 안이 아니라 메인 체크아웃에서 시작한다.

---

## 11. 주의사항

1. **사용자의 병렬 지시 > 에이전트의 크기 추정** — 사용자가 병렬/워크트리를 언급했거나 이 스킬을 지목했으면 무조건 워크트리다. "작아 보이니 생략" 판단으로 그 지시를 덮어쓰지 않는다 (§0).
2. **레지스트리가 SSoT** — 충돌 판정/현황은 항상 `REGISTRY.md` 기준. 쓰기 전 재-read. 워크트리 없이 진행해도 등록은 생략하지 않는다 (§5-0).
3. **베이스는 origin/main** — EnterWorktree 기본값이 맞다. release 는 베이스로 쓰지 않는다.
4. **머지는 ff-only, PR 없음** — 거부되면 자동 fallback 말고 보고.
5. **release 는 사용자 승인 후에만** — 시각 변경은 실물 렌더 확인이 선행 조건.
6. **워크트리 부팅 3종**(`.env.local`·node_modules·포트) 을 빼먹으면 검증 단계에서 시간을 다 잃는다.
7. **정리는 raw git** — ExitWorktree 는 같은 세션 한정. junction 은 `rmdir`. 레지스트리 행 삭제도 잊지 말 것.
8. **계획서는 「정리」 단계에 삭제** — 머지 후 수정 대비.
9. **self-review 먼저, 그 다음 사용자 확인** — typecheck green ≠ 화면이 맞음.
10. **커밋에 `Co-Authored-By` 금지**, 한국어 커밋 본문.
11. **프로젝트 고정 제약**: 지도·길찾기는 **카카오 전용**(구글·네이버 옵션 노출 금지), 데모/시드 데이터는 **부산 실주소**, `Alert.alert` 는 web 에서도 전역 패치로 동작하므로 web 분기 불필요.
12. **범위 제외**: `docs/roadmap/03_field-redefinition.md`(현장 → 점 자산 재정의, ERD v3급)는 2학기 과제다. 병렬 작업 후보로 올리지 않는다.
13. **OS**: PowerShell 이 주력이나 `git`/`gh` 는 Bash 도구로 실행. 경로 스니펫은 Bash 기준이고, junction 생성만 PowerShell/cmd 다.
