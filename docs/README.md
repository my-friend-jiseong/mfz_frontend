# 일가요(mfz) 프런트엔드 문서

> **갱신일**: 2026-10-17 — 4분류 체계로 재편. 분류 규칙은 [conventions/documentation.md](conventions/documentation.md).

| 폴더 | 담는 것 | 입구 |
|---|---|---|
| [`features/`](features/) | 앱을 바꾸는 일. 일 하나 = 폴더 하나 (기획·설계·인수인계·결과) | [기능 목록·작업 순서](features/README.md) · [IA 다이어그램](features/IAD.drawio) |
| [`conventions/`](conventions/) | 모든 일에 공통으로 적용하는 규칙 | [디자인 시스템](conventions/design-system.md) · [기술 스택](conventions/tech-stack.md) · [문서 규칙](conventions/documentation.md) |
| [`operations/`](operations/) | 앱 코드를 바꾸지 않는 일 — 백엔드 협업·출시·장애 | 아래 표 |
| [`deliverables/`](deliverables/) | 외부 사람에게 보여주려고 만든 결과물 — 주간보고·발표·자산 | [주간보고](deliverables/weekly-reports/) · [자산](deliverables/assets/) |

## operations

| 위치 | 내용 |
|---|---|
| [backend/backend-backlog.md](operations/backend/backend-backlog.md) | **백엔드 요청 활성 큐의 1차 소스.** 상단이 활성 항목, 하단에 종결 이력 |
| [backend/handoff-2026-10-01-ui-v2.md](operations/backend/handoff-2026-10-01-ui-v2.md) | 현행 전달본 — UI v2 가 드러낸 방문 단위 API + 이월 항목 |
| [backend/archive/](operations/backend/archive/) | 종결된 전달본·백엔드 결과보고서. [인덱스](operations/backend/archive/README.md) |
| [backend/ERD.drawio](operations/backend/ERD.drawio) | ERD — **직접 편집 금지.** `node docs/operations/backend/gen-erd.mjs` 로 재생성 (진실 출처: 백엔드 `prisma/schema.prisma`) |
| [release/store-readiness.md](operations/release/store-readiness.md) | 스토어 출시 준비도 (차단 항목·절차) |
| [release/REQUIREMENTS_BEFORE_LAUNCHING.md](operations/release/REQUIREMENTS_BEFORE_LAUNCHING.md) | 약관·심사 통과용 추가 개발 권장 기능 |
| [release/운영-현황-질문지.md](operations/release/운영-현황-질문지.md) | 약관·스토어 문구 ↔ 실제 운영 대조 질문지 (2026-07-29 작성) |
| [incidents/](operations/incidents/) | 장애 기록 |
| [admin-dashboard.md](operations/admin-dashboard.md) | 관리자 웹은 별도 프로젝트(mfz_admin)로 분리됨 |

> 스토어 심사·데모 계정과 시드 명령은 **`docs/tmp/README.md`** 에 있다. 이 저장소는 공개라
> 비밀번호를 추적 문서에 옮기지 않는다 (`docs/tmp/` 는 `.gitignore` 대상).

## git 밖 작업 폴더

`docs/tmp/`(발표 준비 작업물)·`docs/presentation/`(데모 녹화 원본)은 `.gitignore` 대상이다.
**결과물을 여기 두면 정리 때 사라진다** — 남길 것은 `deliverables/` 로 옮긴다.

## 이전 구조에서 사라진 것

`reference/` · `roadmap/` · `backend/` · `diagram/` · `infra/` · `handoff/` 는 2026-10-17 재편으로 위 4분류에
흡수됐다. 옛 경로는 `git log --follow -- <새 경로>` 로 추적된다.

2026-07-29 에 제거한 `docs/qa/` · `docs/report/` · `docs/presentation/*.mjs` 는 git 이력에 남아 있다 —
`git log --diff-filter=D -- docs/qa` 로 삭제 커밋을 찾고 `git show <commit>^:<경로>` 로 꺼낸다.

> ⚠️ 스토어 스크린샷(`presentation/screenshots/`)은 `.gitignore` 대상이라 **git 이력에도 없다.**
> 로컬 백업이 없으면 재캡처해야 한다 — [release/store-readiness.md](operations/release/store-readiness.md) 「절차·품질」 참조.
