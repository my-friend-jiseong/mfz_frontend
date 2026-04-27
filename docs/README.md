# 내친지(mfz) 프런트엔드 문서 인덱스

> **갱신일**: 2026-04-27 (Phase 4 백엔드 §1·§2 복구 직후)
> **목적**: 활성 문서 / 백로그 / archive 분리. 새 사람도 진입하면 이 README 만 읽고 어떤 문서가 살아있는지 파악할 수 있게.

---

## 🟢 활성 — 지금 사용 중

### 백엔드 협업
| 파일 | 상태 | 내용 |
|---|---|---|
| [backend_requests_phase4.md](backend_requests_phase4.md) | 🟡 §3 진행 중 (백엔드) | §1·§2 ✅ 복구 / §3 반복 회귀 패턴 — 백엔드 후속 작업 |
| [backend_phase4_fix_report.md](backend_phase4_fix_report.md) | 🟢 방금 수신 (2026-04-27) | 백엔드의 §1·§2 복구 보고 + 프런트 폴백 제거 가이드 |
| [backend_requests_phase5.md](backend_requests_phase5.md) | 📦 백로그 | Daum → Kakao Local 단독 전환 (Phase 4 완료 후 재논의) |

### 프런트 자체 참조
| 파일 | 상태 | 내용 |
|---|---|---|
| [api_integration_plan.md](api_integration_plan.md) | 🟢 v0.2 | 백엔드 endpoint ↔ 프런트 store/화면 매핑 + Phase 1·2 PR 분할 흐름 |
| [_swagger.json](_swagger.json) | 🟢 latest | 백엔드 OpenAPI 스펙 원본 (curl 갱신: `curl ... /api-docs.json -o`) |
| [_swagger_responses.md](_swagger_responses.md) | 🟢 v3 누적 | 실 응답 shape 캡처 — Phase 0·2·3 검증 결과 누적 |

### 시스템 설계
| 파일 | 상태 | 내용 |
|---|---|---|
| [mfjs.drawio.xml](mfjs.drawio.xml) | 🟢 ER + IA | drawio 3페이지 — ER · 정보 아키텍처 · 시스템 아키텍처(미작성) |
| [tech_stack.md](tech_stack.md) | 🟢 | 기술 스택 정리 |

---

## 🗄 archive/ — historical (참고용, 더 이상 갱신 안 함)

| 파일 | 시점 | 정리 근거 |
|---|---|---|
| [archive/backend_api_request.md](archive/backend_api_request.md) | Phase 1, v0.2 | 프런트 시연 기반 33개 endpoint 요청서. 이후 swagger 가 단일 진실원이 되며 historical |
| [archive/backend_requests_phase2.md](archive/backend_requests_phase2.md) | Phase 2 | 백엔드가 모두 반영함. admin 항목·LOGIN_LOCKED 등 일부 의도적 보류 표시. archive 시점에 정정 박스 추가됨 |
| [archive/backend_phase3_complete.md](archive/backend_phase3_complete.md) | Phase 3 | 백엔드의 Phase 3 작업 완료 보고 |
| [archive/backend_phase3_regressions.md](archive/backend_phase3_regressions.md) | Phase 3 회귀 검증 | 18단계 smoke test 로 발견한 회귀 보고. Phase 3 fix → Phase 4 §1·§2 로 이어짐 |
| [archive/backend_phase3_regressions_fix_report.md](archive/backend_phase3_regressions_fix_report.md) | Phase 3 1차 복구 | 백엔드의 await/async 마이그레이션 복구 보고. 후속 회귀는 Phase 4 가 처리 |
| [archive/phase3.md](archive/phase3.md) | 프런트 Phase 3 작업 계획 | PR-G/H/I 등 완료. 작업 자체는 git history 가 진실원 |

archive 폴더의 문서는 **읽기 전용**. 새 결정이나 변경은 active 폴더에만 추가하고 archive 는 손대지 않습니다.

---

## 📦 다음 작업 (이 인덱스 갱신 트리거)

| 트리거 | 처리 |
|---|---|
| 백엔드 Phase 4 §3 (smoke test 자동화) 보고 수신 | `backend_phase4_fix_report.md` 와 함께 archive 로 이동, 새 보고서 active |
| 프런트 폴백 제거 PR 머지 | `_swagger_responses.md` 에 폴백 제거 시점 기록, fix report 도 archive 후보 |
| Phase 5 (Daum → Kakao Local) 본격 진행 | `backend_requests_phase5.md` 를 활성 사이클로 승격, fix report 수신 시 같은 패턴으로 archive |

> 다음 사이클이 끝날 때마다 이 README 의 표를 한 줄씩만 옮기면 됨.
