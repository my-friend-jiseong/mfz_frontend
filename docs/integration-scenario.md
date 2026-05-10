# 통합 테스트 시나리오 — 회원가입부터 보고서까지 전 범위

> 작성일: 2026-05-09 (마지막 갱신: 2026-05-11 — 보고서 통합·모달 picker·safeBack·외근 탭 자동 로드 차단 반영)
> 대상 빌드: 일가요(mfz) 프론트엔드 main 브랜치 (HEAD: `102a6c2` 시점 기준)
> 진행 환경: web (`npm run web`) — 모바일 전용 기능(geofence, 카메라/마이크 네이티브, expo-secure-store) 은 web fallback 으로 평가
>
> 기록은 [`qa-log-2026-05-09.md`](qa-log-2026-05-09.md) 에 누적. 이 문서는 "무엇을 어떻게 시도하는가" 만 정의하고, 발견되는 문제·모호점·환경 제약은 모두 QA 로그로 빼서 통합 테스트 종료 후 일괄 처리.

---

## 0. 사전 준비

| 항목 | 값 / 위치 |
|---|---|
| 백엔드 base URL | `EXPO_PUBLIC_API_BASE_URL` (`.env.local`) → `src/api/config.ts` |
| 토큰 저장소 (web) | `localStorage` key `mfz.refreshToken` (access 는 메모리) |
| 토큰 저장소 (native) | `expo-secure-store` |
| 오프라인 큐 키 | `AsyncStorage.mfz.offlineQueue.v1` |
| 회원가입 정책 | 이메일 정규식 + 비밀번호 10자 이상 + 영대/영소/숫자/특수문자 중 3종, 한글 불가 |

테스트 계정 (시나리오 진행 중 신규 생성):
- email: `qa+integ-20260509@example.com`
- password: `Qa-Integ-20260509!` (3종 충족)
- name: `통합테스터`

---

## 1. 시나리오 본편 — 신규 사용자 김외근의 하루

### S1. 첫 진입 (부팅, 비로그인)

1. 브라우저로 `/` 접속.
2. 기대: `app/index.tsx` → `app/_layout.tsx` 의 `hydrate()` 가 동작. refresh token 이 없어 비로그인 분기 → `/(auth)/login` 으로 리다이렉트.
3. 로그인 화면이 정상 렌더되는지 확인.

### S2. 회원가입

1. 로그인 화면 하단 "처음 사용하시나요? 회원가입" 클릭 → `/(auth)/signup`.
2. 입력:
   - 이메일: 비워두고 제출 → 인라인 에러
   - 잘못된 이메일 (`abc@`) → 인라인 에러
   - 약한 비밀번호 (`password`) → 인라인 에러 ("10자 이상, 3종 조합")
   - 비밀번호 확인 불일치 → 인라인 에러
   - 약관 미동의 → 제출 비활성/에러
   - 정상 입력 후 제출 → `POST /auth/signup` 성공
3. 기대: 자동 로그인 (refresh/access 토큰 저장) → `/(tabs)` 진입 + 첫 화면(외근 탭) 렌더.
   - **자동 로드 차단 검증 (PR `102a6c2`)**: 외근 탭이 첫 화면이지만 fields 전체 페치는 일어나지 않아야 함. 네트워크 탭에서 `GET /api/fields` 미발화 확인. fields 는 (a) 현장 탭 진입 시, (b) 외근 시작 흐름 `trips/new/select` 진입 시에만 페치.
4. 동일 이메일로 재가입 시도 → `email_already_exists` Alert 처리.

### S3. 로그아웃 후 재로그인

1. 프로필 탭 → 로그아웃.
2. 다시 로그인 → S2 에서 만든 계정 입력 → 성공 시 외근 탭 진입.
3. 잘못된 비밀번호 → `invalid_credentials` 인라인 에러 + 비밀번호 필드 클리어 + 포커스.

### S4. 첫 현장 추가

1. 현장 탭 → "현장 추가" → `/(tabs)/fields/new`.
2. 주소 검색:
   - 짧은 키워드 (1자) → `MIN_KEYWORD_LEN` 미만이라 검색 미발화
   - 정상 키워드 ("동아대학교 부민캠퍼스") → 디바운스 후 결과 리스트
   - 항목 선택 → 좌표 자동 채움 (한국 영역 가드 `isInKorea`)
3. 정보 입력:
   - 제목·상세주소: 입력 필드의 `maxLength` (제목 50자·상세 100자) 가 초과 입력 자체를 차단 → 키보드로 51번째 글자가 들어가지 않는지 확인 (서버 검증 분기 도달 X)
   - 상태: "조치 전" 기본값 (라벨 통일 후) — 셀렉트 토글 동작 확인
4. 제출 → `POST /api/fields` 성공 → 현장 상세 진입.
5. **중복 주소 분기**: 같은 주소로 다시 추가 시도 → `duplicate_address_warning_required` → confirm Alert → "계속 추가" → `forceCreateWithDuplicate=true` 재호출 → 성공.

### S5. 두 번째 현장 추가

1. 다른 주소 ("부산광역시청") 로 같은 흐름 반복. 외근 시작 시 다중 선택을 시험하기 위해 최소 2개의 현장 확보.

### S6. 현장 상세 → 상태 변경

1. 현장 카드 진입 → `/(tabs)/fields/[id]`.
2. 상태 chip 탭 → Alert 로 다른 상태 노출 ("조치 중" / "조치 완료") → "조치 중" 선택.
3. 기대: `PATCH /api/fields/{id}/status` 성공 → 상세 화면 chip 색·라벨 즉시 갱신.
4. 빠른 연속 탭 — `statusBusyRef` 가드 동작하는지.
5. 현장 수정 화면 진입 → `/(tabs)/fields/[id]/edit` → 제목/태그/상세주소 수정 → 저장.

### S7. 외근 시작 (현장 2곳 선택)

1. 외근 탭 → "외근 시작" → `/(tabs)/trips/new/select`.
   - **fields refresh 트리거 검증 (PR `102a6c2`)**: 이 진입 시점에 `fieldStore.refresh()` 가 호출되어 fields 가 채워지는지. 외근 탭 첫 진입에선 자동 로드를 차단했으므로, 외근 시작 흐름이 명시 트리거 역할.
2. 검색·상태 필터 toggle 동작 확인.
3. 위에서 만든 2개 현장 체크 → "다음" → `/(tabs)/trips/new/order`.
4. 순서 최적화:
   - "최적 순서 추천" → `POST /api/trips/navigation/optimize-preview` 시도 — 실패하면 클라이언트 nearest-neighbor fallback.
   - 드래그/스왑으로 수동 재정렬.
5. 외근 제목 입력 (선택) → "외근 시작" → `POST /api/trips/start` → destinations bulk 생성 → `/(tabs)/trips/active` 리다이렉트.

### S8. 외근 진행 — 길찾기 / 체크인 / 건너뛰기

`/(tabs)/trips/active` 에서:

0. **deep-link 직진 진입 (PR `102a6c2`)**: 페이지 새로고침 또는 URL 직접 입력으로 `/trips/active` 에 들어왔을 때 — destinations 의 fieldId 중 store 에 없는 항목만 `loadDetail` 로 ensure-load. 모든 현장을 페치하는 게 아니라 외근 소속 현장만 채워지는지 확인. `fieldId` 키 의존성으로 무한 루프 없이 1회만 호출되는지.
1. **지도 scope** 검증: 배경 지도에 이 외근의 현장만 마커로 보여야 함 (직전 PR `08bc06c` 대상).
2. **길찾기**: "현재 목적지" 카드의 "길찾기" → `POST /api/trips/{tripId}/navigation/deep-links` → 카카오맵 web URL 단독 또는 다이얼로그.
   - web 환경: `kakaomap://`·`nmap://` 스킴은 가드로 제외 → 카카오 web URL 만 남는 경로 검증.
3. **체크인**: 첫 번째 목적지 "체크인" → `/(tabs)/fields/[id]/checkin`.
4. **건너뛰기**: 두 번째 목적지 행에서 → "건너뛰기" → `markSkipped(destId)`.
5. **재최적화 버튼**: pending 2개 미만이면 비노출 — pending 1개 + skipped 1개 상태에서 버튼이 사라지는지 확인.

### S9. 체크인 화면 — 결과/메모/사진

`/(tabs)/fields/[id]/checkin` 에서:

1. 진입 시 `POST /api/visits/check-in` 자동 호출 → visit 생성.
2. 결과 status:
   - "기타" 선택 → statusReason 10자 미만이면 차단 / 10자 이상이면 통과
3. 텍스트 메모:
   - 빈 메모 제출 → 차단
   - 짧은 메모 추가 → `POST /api/visits/{id}/memos/text`
4. 사진:
   - web 에선 카메라 미지원 → 갤러리/파일 선택만
   - 1장 추가 → `POST /api/visits/{id}/photos` (multipart)
5. 음성 메모: web 에선 expo-av 동작 확인. 미지원이면 회로가 막혀 있어야 함 (Alert 등).
6. 결과 status "완료" → `PATCH /api/visits/{id}/status` → destination 상태 arrived → 활성 외근 화면으로 복귀.

### S10. 외근 종료

1. `/(tabs)/trips/active` 의 하단 "외근 종료" 버튼 클릭.
2. 1건 방문 + 1건 skipped 상태이므로 정상 종료 — `POST /api/trips/end`.
3. 종료 직후 `/(tabs)/trips` 로 이동, AI 보고서 작성 prompt (web 분기 `window.confirm`).
4. **방문 0건 분기**: 따로 새 외근 시작 → 현장 1곳 선택 → 체크인 없이 즉시 종료 → `confirm_required_zero_visits` → 다이얼로그 → "종료" → `force=true` 재호출 → 종료 성공.

### S11. 외근 상세 조회

1. `/(tabs)/trips` 목록의 방금 종료한 외근 카드 → `/(tabs)/trips/[id]`.
2. **시트 헤더**: trip.title 있으면 그것, 없으면 "외근 상세" (직전 PR `2653811` 대상).
3. **본문 ListHeader**: 시작/종료 시각, 계획 N곳·실제 방문 N건, 계획된 목적지 status별 라벨, AI/수동 보고서 CTA.
4. **상태 전환 이력**: `GET /api/trips/state-history` 호출 → 응답이 비면 history box 미노출.
5. **지도 scope**: 배경 지도가 이 외근의 현장만 노출되는지 (직전 PR `08bc06c` 대상).

### S12. 보고서 작성 — 통합 폼 (AI 초안 / 직접 저장)

> **변경**: PR `2f2c700` 으로 AI 보고서·수동 보고서 두 화면이 `/reports/new` 단일 폼으로 통합됨. 옛 경로 `/reports/generate` 는 같은 tripId 를 끌고 `/reports/new` 로 redirect.
> 진입점도 단일화: 외근 상세·보고서 인덱스의 두 CTA → 단일 "📝 보고서 작성" 버튼 (PR `2f2c700`/`9aa47da`).

1. **진입 경로 검증**:
   - 외근 상세 `/(tabs)/trips/{id}` 의 "📝 보고서 작성" → `/(tabs)/reports/new?tripId={tripId}`.
   - 보고서 탭 인덱스 하단 "📝 보고서 작성" → 외근 미선택 상태로 `/(tabs)/reports/new`.
   - 백호환: 옛 링크 `/(tabs)/reports/generate?tripId={tripId}` 직접 진입 → `/(tabs)/reports/new?tripId={tripId}` 로 즉시 replace 되는지 (PR `2f2c700`).

2. **외근 선택 — 트리거 + 모달 picker (PR `5e2cca6`)**:
   - 폼이 열리면 외근이 미선택 상태일 때 "+ 외근 선택" 버튼만, 선택된 상태일 때 외근 카드 1개 (변경/해제 액션) 노출. 폼 안에서 myTrips 가 인라인 리스트로 나오지 않는지 확인.
   - 트리거 탭 → RN Modal 안에서 myTrips 리스트 노출 → 항목 선택 시 모달 닫히고 폼에 카드 채워짐.
   - 라벨 일관성 (PR `2f2c700`): `{날짜} · {title || 폴백}` / 보조 라인 `{시작 시각} · 방문 {N}건`. 어디에도 raw `#{tripId}` 가 보이면 안 됨.
   - "변경" → 모달 재오픈 / "해제" → 외근 미연결 상태로 초기화.

3. **공통 입력**:
   - 제목 (선택), 본문 (필수, 10자 이상 50,000자 이하).
   - 외근 사진 import 슬롯 (before/after) — 외근이 선택된 경우에만 노출.
   - web 에서 사진 슬롯 선택 / 메모 import 시 `WebChoiceModal` (PR `9b1ed7e`) 가 열려 사용자가 명시적으로 슬롯·동작을 고르는지. (B-4·B-5 회귀 검증)

4. **하단 액션 분기 (PR `2f2c700`)**:
   - **[✨ AI로 초안 받기]** → `POST /api/reports/generate` (multipart, 사진/메모 동봉) → Gemini 응답 → 보고서 상세로 이동.
   - **[✏ 직접 저장]** → `POST /api/reports` → 즉시 저장 → 보고서 상세로 이동. 외근 미연결도 허용.
   - 본문 9자 / 50,001자 → 양쪽 액션 모두 인라인 차단.
   - 같은 외근 내 동일 제목 중복 → 경고 (차단 X) → "계속 저장" 가능.
   - 백엔드 미응답·타임아웃 시 에러 메시지 노출 + 폼 입력 보존.

### S13. 보고서 상세 / 수정 / 공유

1. `/(tabs)/reports/{id}` 진입 → 제목·본문·생성자·외근 정보·다운로드 링크.
2. "수정" → `/(tabs)/reports/{id}/edit` → 제목·본문 수정 → `PATCH /api/reports/{id}` → 상세로 복귀.
3. "공유" → `POST /api/reports/{id}/share` → 토큰·URL 받기 → 클립보드 복사 또는 Linking.
4. **공유 토큰 화면**: `/shared/{token}` 비로그인 접근 시 보고서 노출 — 만료 처리·잘못된 토큰 분기.

### S14. 보고서 탭 진입점 정리 (PR `9aa47da`)

> **변경**: 보고서 탭의 외근별 섹션 우측 "+ 추가" 버튼 제거. 외근별 다중 보고서는 화면 하단 "📝 보고서 작성" 진입점에서 외근을 선택하는 방식으로 동일 가능.

1. 보고서 탭 `/(tabs)/reports` 진입 → 외근별 섹션 헤더 우측에 "+ 추가" 가 더 이상 보이지 않는지.
2. 같은 외근에 보고서를 더 작성하려면 → 하단 "📝 보고서 작성" → 외근 picker 에서 해당 외근 재선택 → 폼 진입.
3. 화면 하단 "📝 보고서 작성" 진입점은 외근 선택 없이 직접 입력 (수동 저장) 도 허용.

### S15. 오프라인 큐 (네트워크 끊김 시나리오)

1. DevTools Network 탭 → Offline 모드.
2. 활성 외근에서 체크인 후 텍스트 메모 추가 → NetworkError → AsyncStorage 큐에 적재 + optimistic UI.
3. 결과 status PATCH 도 큐잉.
4. Online 복귀 → 자동 flush (auth 게이트 통과 후) → 서버 동기화.
5. 부팅 직후 hydrate 실패 (refresh 401) → flush 보류, 강제 로그아웃 race 차단 (직전 PR `320ce80` 대상).

### S16. 토큰 만료/회전

1. localStorage 의 refresh token 을 일부러 깨뜨림 (예: 한 글자 변경).
2. 페이지 새로고침 → `POST /auth/refresh` 401 → 토큰 폐기 + 로그인 화면 이동.
3. **이상 분기**: refresh 응답에 `user` 가 없는 경우 (직전 PR `c12d359` 가 다룬 contract 정합) — 본 시나리오에선 백엔드 응답 정상이라 가정, 회로 자체는 정적 점검만.

### S17. 흰화면 fallback (`safeBack` / +not-found, PR `9aa47da`)

> **변경**: deep-link 로 깊은 라우트 진입 후 한 번도 push 하지 않은 상태에서 router.back() 을 호출하면 expo-router 가 navigation 을 닫아버려 흰 화면으로 떨어지던 회로. 모든 onBack 진입점이 `src/utils/backNavigation.ts` 의 `safeBack(router)` 을 거치도록 통일 + `app/+not-found.tsx` 라우트 추가.

1. **safeBack 회귀**: 시크릿 창에서 다음 경로들로 직접 진입 → "뒤로" 버튼 → `/(tabs)/trips` 로 폴백되는지 확인:
   - `/(tabs)/fields/{id}` / `/(tabs)/fields/{id}/edit` / `/(tabs)/fields/{id}/checkin`
   - `/(tabs)/reports/{id}` / `/(tabs)/reports/{id}/edit` / `/(tabs)/reports/new`
   - `/(tabs)/trips/{id}` / `/(tabs)/trips/active` / `/(tabs)/trips/visit`
   - `/(tabs)/trips/new/select` / `/(tabs)/trips/new/order`
   - `/(auth)/signup` (비로그인 직진)
2. **+not-found**: 존재하지 않는 경로 (예: `/foo/bar`) 직접 진입 → not-found 화면이 렌더되는지, 거기서 "뒤로" 도 fallback 동작 하는지.
3. 일반 흐름 (탭 → 카드 → 상세) 에선 stack 이 살아 있어 평소처럼 직전 화면으로 돌아가는지 회귀 확인.

---

## 2. 검증 체크리스트 (요약)

- [ ] 부팅 후 비로그인 → /(auth)/login 으로 진입
- [ ] 회원가입 정책 검증 (이메일·비밀번호·약관·비밀번호 확인·중복 이메일)
- [ ] 로그인 후 외근 탭 첫 진입 시 fields 자동 페치 차단 (PR `102a6c2`)
- [ ] 로그인 실패 시 invalid_credentials 처리
- [ ] 현장 추가 — 주소 검색·중복 경고·강제 추가
- [ ] 현장 상태 변경 — 빠른 연속 탭 가드 / web 인라인 선택 (B-3 회귀)
- [ ] 외근 시작 — `trips/new/select` 진입 시 fields refresh 트리거 / 다중 선택 / 순서 최적화 / start
- [ ] 외근 진행 — deep-link 진입 시 외근 소속 fields 만 ensure-load / 지도 scope·길찾기·체크인·건너뛰기·재최적화
- [ ] 체크인 — 결과·메모·사진·음성 / 기타 사유 10자
- [ ] 외근 종료 — 정상·zero_visits force
- [ ] 외근 상세 — 헤더 라벨·timeline·보고서 CTA (단일 "📝 보고서 작성")
- [ ] 보고서 통합 폼 — `/reports/generate` → `/reports/new` redirect / AI 초안·직접 저장 분기 / WebChoiceModal (B-4·B-5 회귀)
- [ ] 보고서 외근 선택 — 트리거 + 모달 picker / 라벨에 raw `#tripId` 미노출 (A-5 회귀)
- [ ] 보고서 탭 — 외근 섹션 "+ 추가" 버튼 제거 확인
- [ ] 보고서 — 수정·공유 / shared 토큰 페이지
- [ ] 오프라인 큐 — 큐잉·flush·boot race
- [ ] 토큰 회전 — refresh 401·user 없는 응답
- [ ] 흰화면 fallback — deep-link 진입 후 safeBack → `/(tabs)/trips` / +not-found 라우트

검증 결과는 [`qa-log-2026-05-09.md`](qa-log-2026-05-09.md) 의 카테고리별 섹션으로 누적.
