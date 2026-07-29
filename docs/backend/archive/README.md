# backend/archive — 종결 문서

> 역할이 끝난 백엔드 협업 문서를 모은다. **삭제하지 않는 이유**: `backend-backlog.md` 의
> 완료 항목들이 "어느 배치에서 무엇이 배포됐는지" 를 여기로 참조하기 때문이다.
> 활성 문서는 상위 [`../`](../) — 백로그 1건, 전달본 1건.

| 파일 | 종류 | 시점 | 내용 |
|---|---|---|---|
| [backend-handoff.md](./backend-handoff.md) | 프론트 → 백엔드 전달본 | 2026-05-08 | `Trip.title`/`Field.title` 컬럼 추가 요청. **§1 완료(2026-06-18)** — `Trip.title` 은 end-to-end 반영, `Field.title` 은 ERD v2 에서 개념 자체가 빠져 **상호 철회**. 활성 요청 0건으로 종결 |
| [release-2026-06-backend-backlog.md](./release-2026-06-backend-backlog.md) | 백엔드 → 프론트 결과보고서 | 2026-06-18 | 백로그 일괄 반영 1차 배치 (`6b1d6ea`·`23a771c`) |
| [release-2026-06-19-destinations-overview.md](./release-2026-06-19-destinations-overview.md) | 〃 | 2026-06-19 | §20 Word 위치도, §24 진행 중 목적지 단건 추가 (`ae4d2b9`) |
| [release-2026-07-26-backend-backlog.md](./release-2026-07-26-backend-backlog.md) | 〃 | 2026-07-26 | 활성 큐 일괄 처리 — §9·§10·§15·§19·§22·§25 (`af5320e` → `2a97fab`) |

## 읽는 순서

백엔드 배치 이력을 따라가려면 `release-*` 를 시간순으로 본다. 각 문서 머리에 이전 배치
링크가 있어 체인으로 이어진다.

> ⚠️ `release-*` 는 **백엔드 팀이 자기 repo 기준으로 쓴 문서**다. 본문의 일부 상대 경로
> (`./setup.md`, `../.env.example` 등)는 백엔드 저장소 구조를 가리키므로 이 repo 에서는
> 열리지 않는다 — 원래 그렇다.
