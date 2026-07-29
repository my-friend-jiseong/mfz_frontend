# 일가요(mfz) 프런트엔드 문서 인덱스

> **갱신일**: 2026-07-29

## 레퍼런스 — `reference/`

| 파일 | 내용 |
|---|---|
| [reference/tech_stack.md](reference/tech_stack.md) | 기술 스택 정리 (프론트 RN/Expo · 백엔드 Node/Express/Prisma) |
| [reference/design-system.md](reference/design-system.md) | 디자인 시스템 단일 진실 출처 — 토큰(`src/theme/`)·공용 컴포넌트(`src/components/ui/`) |
| [reference/ERD_REVOLUTION.md](reference/ERD_REVOLUTION.md) | ERD v2 스키마 단순화 changelog (백엔드 변경 요약) |
| [reference/in-app-route.md](reference/in-app-route.md) | 인앱 경로 표시(차량) — 구현 완료 명세, 로드맵 01 에서 이관 |

## 다이어그램 — `diagram/`

| 파일 | 내용 |
|---|---|
| [diagram/ERD.drawio](diagram/ERD.drawio) | ERD 다이어그램 (drawio) — 현 DB 상태. **직접 편집하지 말 것**, 아래 생성기로 재생성 |
| [diagram/gen-erd.mjs](diagram/gen-erd.mjs) | ERD 재생성기 — `node docs/diagram/gen-erd.mjs`. 진실 출처는 백엔드 `prisma/schema.prisma`(dump: 백엔드 `docs/db-schema.md`). 겹침·앵커·관통 자가검증 포함 |
| [diagram/IAD.drawio](diagram/IAD.drawio) | IA 다이어그램 (drawio) — 현 프론트 구조 |

## 백엔드 협업 — `backend/`

| 파일 | 내용 |
|---|---|
| [backend/backend-backlog.md](backend/backend-backlog.md) | **활성 큐의 1차 소스** — 프런트 측 누적 백엔드 요청. 상단이 활성 항목, 하단에 종결 이력·아카이브 |
| [backend/handoff-2026-07-29-store-release.md](backend/handoff-2026-07-29-store-release.md) | **현행 전달본** — 스토어 출시 차단(§30 A~E). 백로그에서 넘길 것만 뽑은 문서 |
| [backend/archive/](backend/archive/) | 종결 문서 — 이전 전달본 1건 + 백엔드 결과보고서 3건. [인덱스](backend/archive/README.md) 참조 |

> 백엔드에 넘길 때는 백로그를 통째로 주지 않고 `handoff-*.md` 전달본을 뽑는다.
> 전달이 끝나면 `archive/` 로 옮기고, 백로그 항목은 「완료 항목(아카이브)」에 한 줄로 압축한다.

## QA — `qa/`

| 파일 | 내용 |
|---|---|
| [qa/integration-scenario.md](qa/integration-scenario.md) | 통합 테스트 시나리오 (ERD v2) — "무엇을 어떻게 시도하는가" |
| [qa/verify-report-wizard.mjs](qa/verify-report-wizard.mjs) | 보고서 생성 마법사 회귀 검증 (Playwright, §S7) — 생성·단계 이동·캡션 가드·폴백, 실행 후 원복 |
