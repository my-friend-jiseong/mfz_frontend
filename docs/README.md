# 일가요(mfz) 프런트엔드 문서 인덱스

> **갱신일**: 2026-06-01

## 레퍼런스 — `reference/`

| 파일 | 내용 |
|---|---|
| [reference/tech_stack.md](reference/tech_stack.md) | 기술 스택 정리 (프론트 RN/Expo · 백엔드 Node/Express/Prisma) |
| [reference/design-system.md](reference/design-system.md) | 디자인 시스템 단일 진실 출처 — 토큰(`src/theme/`)·공용 컴포넌트(`src/components/ui/`) |
| [reference/ERD_REVOLUTION.md](reference/ERD_REVOLUTION.md) | ERD v2 스키마 단순화 changelog (백엔드 변경 요약) |

## 다이어그램 — `diagram/`

| 파일 | 내용 |
|---|---|
| [diagram/ERD.drawio](diagram/ERD.drawio) | ERD 다이어그램 (drawio) — 현 DB 상태 |
| [diagram/IAD.drawio](diagram/IAD.drawio) | IA 다이어그램 (drawio) — 현 프론트 구조 |

## 백엔드 협업 — `backend/`

| 파일 | 내용 |
|---|---|
| [backend/backend-backlog.md](backend/backend-backlog.md) | 프런트 측 누적 백엔드 요청 큐 |
| [backend/backend-handoff.md](backend/backend-handoff.md) | 백엔드 보충 가이드라인 — 프런트 선행 개발 항목 중 백엔드 활성화/명세 필요분 (활성 요청 0건, §1 `title` 완료) |
| [backend/demo-seed-request.md](backend/demo-seed-request.md) | 발표용 데모 데이터 — 프론트 자가 시드(`presentation/seed_demo_data.mjs`)로 전부 해결, 백엔드 작업 불필요(probe 검증) |

## QA — `qa/`

| 파일 | 내용 |
|---|---|
| [qa/integration-scenario.md](qa/integration-scenario.md) | 통합 테스트 시나리오 (ERD v2) — "무엇을 어떻게 시도하는가" |
| [qa/verify-report-wizard.mjs](qa/verify-report-wizard.mjs) | 보고서 생성 마법사 회귀 검증 (Playwright, §S7) — 생성·단계 이동·캡션 가드·폴백, 실행 후 원복 |
