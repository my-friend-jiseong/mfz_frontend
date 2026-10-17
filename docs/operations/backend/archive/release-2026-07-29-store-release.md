# 백엔드 결과보고서 — 2026-07-29 (`release`)

> **반영 범위:** `fa708c0` → `ee4c453` (커밋 8개)  
> **브랜치:** `release`  
> **작성일:** 2026-07-29  
> **소스:**  
> - 프론트 백로그 후속 (§27·§28·§26·§19 메시지)  
> - 핸드오프 [`handoff-2026-07-29-store-release.md`](./) · 백로그 §30 (A~E)  
> **출시 대상:** Google Play 단독 (App Store 계획 없음)  
> **약관 시행일 기준:** 2026-08-03

이전 배치: [release-2026-07-26-backend-backlog.md](./release-2026-07-26-backend-backlog.md)

---

## 1. 한 줄 요약

| § / 항목 | 우선순위 | 결과 | 내용 |
|----------|----------|------|------|
| **§27** | 🟠 | ✅ 코드 | `field_photos.phase` + from-trip을 **field** 사진 기준, `phaseProgress` OpenAPI |
| **§28** | 🟠 | ✅ 코드 | 주소검색 `buildingName` (`place_name` / `building_name`) |
| **§26** | 🟡 | ✅ 코드 | `siteCount` 설명 + `destinationCount`/`plannedSiteCount` |
| **§19** | — | ✅ 코드 | PDF/Word 공통 에러 메시지에서 “Word” 제거 |
| **§30-A** | 🔴 출시 차단 | ✅ 코드 | `DELETE /api/me` 앱 내 회원 탈퇴 |
| **§30-C** | 🟠 소급 불가 | ✅ 코드 | 약관 동의 **버전** 이력 (`legal_consents`) |
| **§30-D** | 🔴 8/3 전 | ⏸ 결정 대기 | 보관 30일 파기 배치 **없음** 확인 → 문서화 |
| **§30-B** | 🔴 심사 | ⏸ 대기 | 약관 본문(노션 정합) 후 `/location-terms` + md 전환 |
| **§30-E** | 🟢 | ⏸ 낮음 | 비밀번호 재설정 SMTP (스텁 유지) |

---

## 2. 커밋 목록 (`release`)

| SHA | 메시지 |
|-----|--------|
| `5185350` | Add field photo phase and map from-trip from field photos (§27). |
| `fc6cf70` | Return buildingName on address search items (§28). |
| `1fbfc11` | Clarify siteCount and add destinationCount on trip list (§26). |
| `64313d2` | Neutralize export error messages for Word and PDF (§19). |
| `d39c7eb` | Add DELETE /api/me account deletion for Play store (§30-A). |
| `9416565` | Document pending 30-day retention policy decision (§30-D). |
| `a521304` | Record legal consent versions on signup and profile (§30-C). |
| `ee4c453` | Document terms_version_invalid in errors reference. |

**푸시 상태 (보고서 작성 시점)**

| 구간 | 상태 |
|------|------|
| `fa708c0..64313d2` (§27~§19) | `origin/release` 반영됨 |
| `d39c7eb..ee4c453` (§30) | 로컬 ahead — **배포 전 푸시 필요** |

---

## 3. DB 마이그레이션

배포 시 컨테이너 기동 후 `prisma migrate deploy` 자동 실행.

| 마이그레이션 | 내용 |
|-------------|------|
| `20260728120000_field_photo_phase` | `field_photos.phase` VARCHAR(16) nullable (§27) |
| `20260729120000_legal_consents` | `legal_consents` 테이블 (§30-C) |

로컬:

```bash
npx prisma migrate deploy
npx prisma generate
```

---

## 4. 항목별 상세

### 4.1 §27 — field photo phase

- `POST /api/fields/:fieldId/photos` multipart에 `phase?` (`before`\|`during`\|`after`)
- 응답: `photo.phase`, `phaseProgress`
- trip timeline / visit 상세: visit + **field** 사진 합산으로 `phaseProgress`
- `POST /api/reports/from-trip/:tripId`: **`field_photos`** phase → field_reports 슬롯
- 마이그레이션: `field_photos.phase`

### 4.2 §28 — 주소검색 `buildingName`

- `GET /api/fields/address/search`
- 키워드 결과: Kakao `place_name` → `buildingName`
- 주소 결과: `road_address.building_name` (없으면 null)

### 4.3 §26 — trip list counts

- `siteCount` = 방문한 **distinct** `fieldId` 수 (OpenAPI 설명 명시)
- `destinationCount` / `plannedSiteCount` = `trip_destinations` 행 수 (동의어)

### 4.4 §19 — export 에러 문구

- `report_no_field_reports` / `report_no_photos`: “Word를…” → **“보고서를…”** (PDF·Word 공통)

### 4.5 §30-A — `DELETE /api/me` (Play 출시 차단)

| | |
|--|--|
| Method | `DELETE /api/me` |
| Auth | Bearer |
| Body | `{ "password": "..." }` (재인증) |
| 성공 | **200** `{ deleted: true }` |
| 비밀번호 불일치 | **400** `current_password_invalid` |
| 이미 삭제 | **404** `user_not_found` |

**계약 확정값**

1. **재인증:** 비밀번호 (`PATCH /api/me/password`와 동일 code)
2. **삭제 범위:** 외근·방문·보고서·메모·카테고리·현장·사진/파일(스토리지) + 세션 전부 무효. **진행 중 외근 포함 삭제**
3. **성공 응답:** `{ deleted: true }` (프론트 204도 허용)
4. **재가입:** soft delete + 이메일 익명화 → **동일 이메일 재가입 허용**
5. **법령 별도 보관:** 없음 (계정·업무 데이터 파기). 동의 이력 행은 soft-deleted user에 남을 수 있음(감사)

**미확인 (운영/Play Console)**

- 앱 밖 삭제 요청 URL(`/account-deletion` 등) 필요 여부 — 데이터 안전 양식 확인 필요

### 4.6 §30-C — 약관 동의 버전

| | |
|--|--|
| 테이블 | `legal_consents` (`user_id` × `doc_type` × `version` **append-only**) |
| Signup | `termsAgreed` 유지 + optional `agreedTerms: { service, privacy, location }` (시행일 `YYYY-MM-DD`) |
| 구앱 | `agreedTerms` 없으면 기존처럼 성공, 버전 이력 null |
| `GET /api/me` | `legal: { agreed, current, needsReaccept }` |
| 재동의 | `POST /api/me/legal/accept` `{ agreedTerms }` → 행 **추가** (덮어쓰기 금지) |
| 현행 버전 | `src/legal/legalVersions.js` — 기본 `2026-08-03` |
| 에러 | `terms_version_invalid`(400) |

재동의 정책(강제 vs 통지)은 **미정** — 이력 구조로 어느 쪽이든 대응 가능.

### 4.7 §30-D — 보관기간 30일

- 확인: cron/purge/retention **0건** (조회 필터의 “30일”만 존재)
- 문서: [`docs/legal-retention-30d-decision.md`](./legal-retention-30d-decision.md)
- **8/3 전 팀 결정 필요:** 파기 배치 구현 vs 약관 문구 수정

### 4.8 §30-B · §30-E (미착수)

| 항목 | 상태 | 비고 |
|------|------|------|
| §30-B 정책 페이지 | 대기 | 노션 본문 정합 후 `docs/legal/{terms,privacy,location-terms}.md` + `GET /location-terms`. 문의처 `myfriendjiseong@gmail.com` 통일 |
| §30-E 비밀번호 재설정 SMTP | 낮음 | 스텁 유지. 메일 발송 구현 시 프론트에 통지 |

---

## 5. 프론트 연동 체크리스트

### 이미 선반영·즉시 동작

- [x] `DELETE /api/me` + `{ password }` + `current_password_invalid` / `user_not_found` 분기

### 계약 확정 후 배선

- [ ] Signup `agreedTerms` optional (`service`/`privacy`/`location` = `2026-08-03`)
- [ ] `GET /api/me` → `legal.needsReaccept` 배너(정책 확정 후)
- [ ] `POST /api/me/legal/accept` 재동의
- [ ] `/location-terms` 페이지 오픈 시 `LOCATION_TERMS_AVAILABLE` + signup 링크 (§30-B 배포 후)

### 팀 결정

- [ ] 보관 30일: 배치 vs 문서 수정 (§30-D)
- [ ] Play Console: 웹 삭제 URL 필요 여부

---

## 6. 검증 가이드 (배포 후)

```bash
# 탈퇴
DELETE /api/me  Authorization: Bearer …  { "password": "…" }
# → 200 { "deleted": true }
# 이후 GET /api/me → 401

# 동의 버전 가입
POST /auth/signup
{ …, "termsAgreed": true, "agreedTerms": { "service":"2026-08-03", "privacy":"2026-08-03", "location":"2026-08-03" } }
GET /api/me → legal.agreed.* / legal.current.* / needsReaccept === false

# 구앱 호환
POST /auth/signup  (agreedTerms 없음) → 201, legal.agreed 전부 null, needsReaccept true

# OpenAPI
# deleteMe, acceptLegalTerms, field photo phase, buildingName, destinationCount 존재
```

---

## 7. 잔여 / 리스크

| 리스크 | 심각도 | 대응 |
|--------|--------|------|
| §30 커밋 미푸시 | 🔴 | `release` 푸시 → 배포 → migrate `legal_consents` |
| 약관 HTML 구 초안 + `/location-terms` 404 | 🔴 | §30-B 본문 수령 후 교체 |
| 보관 30일 선언 vs 미파기 | 🔴 | 8/3 전 §30-D 결정 |
| `support@ilgayo.co.kr` 공개 페이지 | 🟠 | §30-B와 함께 `myfriendjiseong@gmail.com`으로 교체 |
| 문서↔앱 불일치(백그라운드 위치·관리자 등) | 🟠 | 문서 수정 방향(부록 B) — 백엔드 구현 대상 아님 |

---

## 8. 참조

- 핸드오프: `handoff-2026-07-29-store-release.md` (카톡 전달)
- 스키마: [`docs/db-schema.md`](./db-schema.md)
- 보관 결정: [`docs/legal-retention-30d-decision.md`](./legal-retention-30d-decision.md)
- 기능 목록: [`docs/features.md`](./features.md)
- 현행 약관 버전 상수: `src/legal/legalVersions.js`
