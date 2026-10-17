# 일가요(mfz) 프런트엔드 문서 인덱스

> **갱신일**: 2026-07-29

## 레퍼런스 — `reference/`

| 파일 | 내용 |
|---|---|
| [reference/tech_stack.md](conventions/tech-stack.md) | 기술 스택 정리 (프론트 RN/Expo · 백엔드 Node/Express/Prisma) |
| [reference/design-system.md](conventions/design-system.md) | 디자인 시스템 단일 진실 출처 — 토큰(`src/theme/`)·공용 컴포넌트(`src/components/ui/`) |
| [reference/ERD_REVOLUTION.md](operations/backend/archive/erd-v2-changelog-2026-05-20.md) | ERD v2 스키마 단순화 changelog (백엔드 변경 요약) |
| [reference/in-app-route.md](features/in-app-route/README.md) | 인앱 경로 표시(차량) — 구현 완료 명세, 로드맵 01 에서 이관 |

## 다이어그램 — `diagram/`

| 파일 | 내용 |
|---|---|
| [diagram/ERD.drawio](operations/backend/ERD.drawio) | ERD 다이어그램 (drawio) — 현 DB 상태. **직접 편집하지 말 것**, 아래 생성기로 재생성 |
| [diagram/gen-erd.mjs](operations/backend/gen-erd.mjs) | ERD 재생성기 — `node docs/operations/backend/gen-erd.mjs`. 진실 출처는 백엔드 `prisma/schema.prisma`(dump: 백엔드 `docs/db-schema.md`). 겹침·앵커·관통 자가검증 포함 |
| [diagram/IAD.drawio](features/IAD.drawio) | IA 다이어그램 (drawio) — 현 프론트 구조 |

## 백엔드 협업 — `backend/`

| 파일 | 내용 |
|---|---|
| [backend/backend-backlog.md](operations/backend/backend-backlog.md) | **활성 큐의 1차 소스** — 프런트 측 누적 백엔드 요청. 상단이 활성 항목, 하단에 종결 이력·아카이브 |
| [backend/handoff-2026-10-01-ui-v2.md](operations/backend/handoff-2026-10-01-ui-v2.md) | **현행 전달본** — UI v2 개편이 드러낸 방문 단위 API(§35·§36·§40 등) + 이월 항목(§34 TLS·§30-B 약관·§31-B Word). 백로그에서 넘길 것만 뽑은 문서 |
| [backend/archive/](operations/backend/archive/) | 종결 문서 — 이전 전달본 3건 + 백엔드 결과보고서 5건. [인덱스](operations/backend/archive/README.md) 참조 |

> 백엔드에 넘길 때는 백로그를 통째로 주지 않고 `handoff-*.md` 전달본을 뽑는다.
> 전달이 끝나면 `archive/` 로 옮기고, 백로그 항목은 「완료 항목(아카이브)」에 한 줄로 압축한다.

## 제거된 디렉터리 (2026-07-29)

`docs/presentation/` · `docs/qa/` · `docs/report/` 를 정리했다. **git 이력에 남아 있으므로
필요하면 되살릴 수 있다** — `git log --diff-filter=D -- docs/qa` 로 삭제 커밋을 찾고
`git show <commit>^:<경로>` 로 꺼낸다.

| 있던 것 | 비고 |
|---|---|
| `qa/integration-scenario.md` · `qa/verify-report-wizard.mjs` | 통합 시나리오·보고서 마법사 회귀 검증(Playwright). 루트 [`qa-runner.mjs`](../qa-runner.mjs) 는 **남아 있다** |
| `presentation/*.mjs` | 데모 시드·화면 캡처·녹화 스크립트 |
| `report/*.md` | 주간·결과 보고서 초안 |

> ⚠️ `presentation/screenshots/` (스토어 스크린샷 24장) 는 [`.gitignore:20`](../.gitignore) 대상이라
> **git 이력에도 없다.** 로컬 백업이 없으면 재캡처해야 한다 — [roadmap/00](operations/release/store-readiness.md) 「절차·품질」 참조.
