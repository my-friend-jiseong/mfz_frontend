# 백엔드 수정·보강 사항

> 정리 기준: Phase 3 요구와 연관된 `mfz_backend` 변경(인증·현장/보고서·OpenAPI·문서).

---

## 1. 인증 (회원가입 / 로그인)

| 구분 | 변경 전 | 변경 후 |
|------|---------|---------|
| 회원가입 잠실패 누적 | 동일 이메일로 실패 시 **일시 잠금(429, `signup_locked`)** | **잠금 제거** — 실패해도 잠기지 않음 |
| 비밀번호 정책 | 10자 이상, 영·숫·특 수 조합, 연속/반복/이메일 포함 등 복잡 규칙 | **8자 이상**만 충족 시 허용 |
| API | `signup_locked` 429 처리, OpenAPI 429 | 해당 응답·스펙 **삭제** |

**관련 파일**

- `src/auth/sessionService.js` — `validatePasswordPolicy`, `SIGNUP_FAILURES`·잠금 관련 로직 제거
- `src/server.js` — `signup_locked` 429 분기 제거
- `src/openapi/paths/auth.js` — 회원가입 `429` 응답 제거
- `docs/features.md` — 비밀번호·잠금 설명 갱신

**참고:** Phase 3 문서(§0)에 따라 **4xx + `code` 필드 통일(409 `EMAIL_TAKEN` 등)** 은 _이번에 범위에 넣지 않음_(인증 정교화 보류).

---

## 2. 보고서 — 작성자 표시 (Phase 3 §1.2)

| 항목 | 내용 |
|------|------|
| 문제 | `GET /api/reports/{id}`의 `creator.name`이 `userId` UUID 그대로 노출 |
| 대응 | 인메모리 가입 프로필(`USERS_AUTH`)의 `name` → 없으면 이메일 local-part → 그다음 `sub` |

**관련 파일**

- `src/auth/sessionService.js` — `getDisplayNameForUserId(userId)` 추가
- `src/reports/registerReportRoutes.js` — `toReportDetail`의 `creator.name`에 위 함수 사용

---

## 3. 현장 — 응답 키 정리 (Phase 3 §1.3)

| 항목 | 내용 |
|------|------|
| 목록 카드 | `userId`와 `assigneeUserId` **중복** → **`assigneeUserId`만** 유지 |
| 상세 | 기존처럼 `assigneeUserId`만 두는 쪽과 정합 |

**관련 파일**

- `src/fieldwork/tripsService.js` — `toFieldCard()`에서 `userId` 필드 제거

---

## 4. 보고서 — AI 생성 · 저장 (Phase 3 §2.1)

| 항목 | 내용 |
|------|------|
| 인증 | `POST /api/reports/generate` — **Bearer 필수** (이전: 미인증 가능) |
| 본문 | `notes` 필수, `title`, `extraNotes`, `tripId`, `location`, `before_photo` / `after_photo` (multipart) |
| 처리 | Gemini 분석 → Word(`generateWordReport`) → **`createReport`로 DB(인메모리 Map)에 저장** |
| 응답 | `id`, `tripId`, `title`, `content`, `summary`, `generatedByAi`, `outputFileUrl` / `fileUrl` / `downloadUrl`, `outputFileName`, `analysis` 일부, `generationMetadata`(`model`, `tokens`, `elapsedMs`) |
| 실패 | AI 분석 결과 없음 → `400`, `error: "ai_analysis_empty"` |

**관련 파일**

- `src/reports/registerReportRoutes.js` — 라우트에 `authRequired`, `createReport` 연동, 응답 본문
- `src/openapi/paths/reports.js` — `security`, 요청/응답 스키마, `components/schemas/ReportGenerateSuccessData` 참조
- `src/openapi/components.js` — `ReportGenerateSuccessData` 정의
- `docs/features.md` — generate 동작·필드 요약

**참고:** 수동/상세 API는 여전히 `reportId` 키를 쓰고, generate 응답 `data`는 `id`를 씀(클라이언트에서 통일 여부는 추후 정책).

---

## 5. 보고서 — 공유 · 만료 · 해제 (Phase 3 §2.2)

| 항목 | 내용 |
|------|------|
| 만료 | `enableShare` 시 `shareExpiresAt` 설정 — 기본 **7일** (`REPORT_SHARE_EXPIRES_DAYS`로 조절) |
| 발급 응답 | `expiresAt`, `shareExpiresAt`, 기존 `shareToken`·`shareUrl` 등 |
| 조회 | `GET /api/reports/shared/{token}` — **만료 시** `getReportByShareToken` → `null` → **404** |
| 해제 | **`DELETE /api/reports/{reportId}/share`** — `disableShare`로 토큰·만료·`sharedAt` 정리 |
| 재발급 | `POST .../share` 재호출 시 **새 토큰·새 만료** (이전 토큰은 무효) |

**관련 파일**

- `src/reports/reportRepository.js` — `shareExpiresAt` 필드, `enableShare` / `disableShare`, `getReportByShareToken` 만료 판정
- `src/reports/registerReportRoutes.js` — POST share 응답 필드, DELETE share
- `src/openapi/paths/reports.js` — share POST 응답 스키마, **DELETE** 경로
- `docs/features.md` — 공유·만료·DELETE 설명

---

## 6. 첨부 — 응답 shape · OpenAPI (Phase 3 §2.3)

**방문 (visits)**

- 텍스트/사진/음성 첨부 객체에 `visitId`, `fieldId`(해당 시) 정리
- 사진: `byteSize` 등, 음성: `durationSec`와 `durationSeconds` 병기 등

**현장 (fields) 직접 첨부**

- 사진/음성에 `byteSize`, 음성에 `durationSeconds` / `durationSec` 등

**OpenAPI**

- `src/openapi/components.js` — `VisitTextMemoAttachment`, `VisitPhotoAttachment`, `VisitAudioAttachment`, `FieldPhotoAttachment`, `FieldAudioAttachment` 등
- `src/openapi/paths/trips.js` — 해당 `POST` **201** 응답에 위 스키마·래퍼(`visitId`/`fieldId` + `attachment`) 명시
- `OfficialNoticeResponse` — `POST /api/trips/{tripId}/official-notice` **200** body

**알려진 기존 이슈(별도 정리 권장)**

- `multer` **memory** 사용 구간에서 `fileUrl`이 디스크 파일명과 어긋날 수 있음(다운로드/정적 경로는 추후 PR-G와 함께 정리)

---

## 7. 주소 검색 (Phase 3 §1.4 — 목업)

| 항목 | 내용 |
|------|------|
| `items[]` | `roadAddress`, `jibunAddress`, `lat`, `lng` 외 **`buildingName`**(없으면 `null`) 명시 |
| 동작 | 개발·목업: 키워드 2자 이상, 도로명/지번 **부분일치** — 키워드에 맞는 건만 `items` 채움 |

**관련 파일**

- `src/fieldwork/tripsService.js` — `searchFieldAddress` 목록 항목
- `src/openapi/paths/trips.js` — `GET /api/fields/address/search` **200** 응답 스키마

---

## 8. 문서 (프로젝트 내부)

| 파일 | 용도 |
|------|------|
| `docs/features.md` | 인증, 현장 키, 주소, 보고서(generate·공유·DELETE), `creator.name` |
| `docs/백엔드-수정사항.md` | 본 문서 — 변경 요약(추가·이력 기록용) |

---

## 9. 환경 변수 (참고)

| 변수 | 의미 | 비고 |
|------|------|------|
| `REPORT_SHARE_EXPIRES_DAYS` | 공유 링크 만료 일 수 | 기본 `7` |
| `GEMINI_API_KEY` | AI generate | 미설정 시 런타임 오류 가능 |
| `JWT_SECRET` 등 | 기존과 동일 | — |

---

## 10. 커밋 시 참고용 제목 예시

```text
feat: phase3 백엔드 반영 — 보고서·현장·공유·첨부 명세
```

본문에 인증(비밀번호 8자·잠금 제거)이 같은 커밋이면 그 한두 줄을 함께 적으면 됩니다.
