# roadmap — 미래 기능 명세 보관소

> **성격**: 아직 만들지 않은 기능의 명세를 모은다. 현행/과거 기록은 `docs/reference/`, 백엔드 요청은 `docs/backend/backend-backlog.md` — 여기는 "우리가 다음에 만들 것"의 단일 위치.
> **규약**: 기능당 파일 1개(kebab-case). 머리에 상태·백로그 연결을 명시. 구현이 끝나면 파일을 `docs/reference/` 로 옮기고 상태를 `구현 완료`로 닫는다.

## 상태 표기
- `검토` — 방향만 잡힘, 명세 미완
- `확정` — 사용자/팀 결정 완료, 착수 대기
- `착수` — 개발 중

## 목록

| 명세 | 상태 | 백로그 연결 | 한 줄 |
|---|---|---|---|
| [in-app-route.md](in-app-route.md) | 확정 (차량 한정) | §22 | 인앱 경로 표시 — 직선 폴리라인 → 카카오 자동차 경로 프록시 |
| [field-redefinition.md](field-redefinition.md) | 검토 (2학기 헤드라인) | — (ERD v3) | 현장을 거점에서 점(point) 자산으로 재정의 |
| [excel-field-io.md](excel-field-io.md) | 확정 | — (분해 예정) | 엑셀로 현장 일괄 등록 + 필터 반영 내보내기 |
| [report-export-formats.md](report-export-formats.md) | 확정 | §19·§20 | 보고서 PDF(우선)·HWP(HWPX 타깃) 내보내기 |
| [store-release-readiness.md](store-release-readiness.md) | 검토 (2026-06-07 감사) | §11 연관 | 안드로이드 스토어 출시 차단 4건 + 절차 요인 정리 |
