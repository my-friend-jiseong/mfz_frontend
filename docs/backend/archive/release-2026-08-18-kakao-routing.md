# 카카오 라우팅 API 구현 결과보고서

> 작성일: 2026-08-18  
> 대상 저장소: `mfz_backend`  
> 반영 브랜치: `release`  
> 반영 커밋: `a01dfb0` (`Harden Kakao routing and optimize visit order`)  
> 원격 반영: `origin/release` 푸시 완료 — 자동 배포 대상

---

## 1. 작업 목적

`kakao-routing-api-report.md`의 제안을 현재 백엔드 구현과 대조하고, 실제 적용 가능한 항목을 반영했다.

핵심 목표는 다음과 같다.

- 카카오 REST API 키를 앱에 노출하지 않고 백엔드 프록시에서만 사용
- 단일 목적지 및 다중 경유지 자동차 경로 조회 지원
- 카카오 장애·쿼터 초과·타임아웃을 구분해 안정적으로 처리
- 경로 API 호출량을 줄이기 위한 단기 캐시 적용
- 소수 방문지의 순서를 기존 휴리스틱보다 정확하게 계산
- OpenAPI 및 백엔드 계약 문서 동기화

---

## 2. 구현 결과 요약

| 구분 | 구현 결과 |
|---|---|
| 자동차 경로 프록시 | 기존 `POST /api/trips/:tripId/route` 보강 |
| 경유지 0개 | 카카오 `GET /v1/directions` 사용 |
| 경유지 1~30개 | 카카오 `POST /v1/waypoints/directions` 사용 |
| 폴리라인 | 모든 `sections[].roads[].vertexes`를 `{ lat, lng }[]`로 병합 |
| 요청 제한 | 최대 경유지 30개 유지 |
| 타임아웃 | 기본 8초 |
| 재시도 | 네트워크 오류 및 카카오 5xx에 한해 1회 |
| 캐시 | 성공 응답 5분 인메모리 캐시 |
| 요청 추적 | 카카오 `trans_id`를 `transId`로 응답 |
| 순서 최적화 | 8개 이하 완전탐색, 9개 이상 nearest-neighbor |
| 문서 | OpenAPI, `docs/features.md`, `docs/errors.md`, `.env.example` 동기화 |

---

## 3. API 계약

### 3.1 자동차 경로 조회

```http
POST /api/trips/:tripId/route
Authorization: Bearer {accessToken}
Content-Type: application/json
```

요청 예시:

```json
{
  "origin": { "lat": 37.4024, "lng": 127.1076 },
  "destination": { "lat": 37.3944, "lng": 127.1098 },
  "waypoints": [
    { "lat": 37.3963, "lng": 127.1134 }
  ]
}
```

성공 응답 예시:

```json
{
  "tripId": "trip-example",
  "distance": 19032,
  "duration": 3494,
  "vertexes": [
    { "lat": 37.4024, "lng": 127.1076 },
    { "lat": 37.4032, "lng": 127.1064 }
  ],
  "origin": { "lat": 37.4024, "lng": 127.1076 },
  "destination": { "lat": 37.3944, "lng": 127.1098 },
  "waypointCount": 1,
  "provider": "kakao_mobility",
  "transId": "카카오 요청 추적 ID",
  "cached": false
}
```

동일한 좌표 조합이 캐시에서 반환되면 `cached: true`가 된다.

### 3.2 방문 순서 최적화

대상 API:

- `POST /api/trips/optimize-preview`
- `POST /api/trips/:tripId/navigation/optimize`

알고리즘:

| 방문 후보 수 | 알고리즘 | 응답 `summary.algorithm` |
|---|---|---|
| 1~8개 | 직선거리 완전탐색 | `exhaustive_straight_line` |
| 9개 이상 | 최근접 이웃 휴리스틱 | `nearest_neighbor` |

완전탐색은 출발지에서 모든 방문 후보를 한 번씩 방문하는 순서 중 직선거리 합이 가장 짧은 순서를 선택한다. 실제 도로 폴리라인과 소요 시간은 최종 순서를 이용해 `/api/trips/:tripId/route`에서 별도로 조회한다.

---

## 4. 안정성 보강

### 4.1 타임아웃과 재시도

- 기본 upstream 타임아웃: 8초
- 네트워크 실패 또는 HTTP 5xx: 최대 1회 재시도
- 4xx, 잘못된 요청, 쿼터 초과: 재시도하지 않음
- 환경변수로 조정 가능

```env
KAKAO_ROUTE_TIMEOUT_MS=8000
KAKAO_ROUTE_CACHE_TTL_MS=300000
```

`KAKAO_ROUTE_CACHE_TTL_MS=0`으로 설정하면 캐시를 끌 수 있다.

### 4.2 캐시

- 좌표를 소수점 4자리로 정규화해 캐시 키 생성
- 출발지, 순서가 적용된 경유지, 목적지 전체를 키에 포함
- 기본 TTL 5분
- 최대 500개 항목을 유지하는 프로세스 인메모리 캐시
- 서버 재기동 시 캐시는 초기화됨
- 성공한 경로만 캐시하며 오류 응답은 캐시하지 않음

### 4.3 카카오 응답 검증

- HTTP 성공 여부 검사
- `routes[0].result_code === 0` 검사
- `sections[].roads[].vertexes` 전체 병합
- 빈 폴리라인이면 성공으로 처리하지 않고 제공자 오류 반환
- 실패 로그에 HTTP 상태, `x-request-id`, `trans_id`, 결과 코드와 결과 메시지를 기록

---

## 5. 오류 계약

| 코드 | HTTP | 의미 |
|---|---:|---|
| `route_points_required` | 400 | 출발지 또는 목적지 누락 |
| `route_waypoints_too_many` | 400 | 경유지 30개 초과 |
| `destination_invalid` | 400 | 잘못된 경유지 좌표 |
| `kakao_route_unavailable` | 503 | 카카오 경로 조회 실패 또는 유효한 경로 없음 |
| `kakao_route_quota_exceeded` | 503 | 카카오 API 쿼터 초과 (`429` 또는 오류 코드 `-10`) |
| `kakao_route_timeout` | 504 | upstream 요청 시간 초과 |

기존 주소검색 오류 `kakao_provider_unavailable`과 자동차 경로 오류를 분리해, 사용자 메시지와 운영 로그가 혼동되지 않도록 했다.

---

## 6. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `.env.example` | 경로 timeout·cache TTL 환경변수 예시 |
| `src/fieldwork/tripsService.js` | 경로 프록시 안정화, 캐시, 오류 분류, 완전탐색 최적화 |
| `src/http/errorResponse.js` | 경로 전용 오류 3종 추가 |
| `src/openapi/paths/trips.js` | 경유지 제한, 응답 필드, 오류 및 알고리즘 설명 |
| `docs/features.md` | API 계약·운영 설정 문서화 |
| `docs/errors.md` | 신규 오류 코드 문서화 |

사용자 소유 미추적 파일 `.agents/`, `AGENTS.md`는 커밋에서 제외했다.

---

## 7. 검증 결과

- `git diff --check`: 통과
- 변경 범위: 라우팅 관련 6개 파일만 커밋
- Git 커밋: 성공 (`a01dfb0`)
- `origin/release` 푸시: 성공
- 자동 배포: `release` push로 트리거 대상

제약 사항:

- 작업 환경에 Node 실행 파일이 없어 `node --check` 및 로컬 서버 기동 검증은 수행하지 못했다.
- 실제 카카오 API 호출은 운영 키와 유효한 사용자·외근 토큰이 필요해 이번 로컬 검증에는 포함하지 않았다.

---

## 8. 배포 후 확인 체크리스트

- [ ] GitHub Actions 배포 성공 여부 확인
- [ ] 운영 `/health`가 HTTP 200인지 확인
- [ ] OpenAPI에 `/api/trips/{tripId}/route`의 `transId`, `cached`, 503·504 설명이 노출되는지 확인
- [ ] 경유지 없는 자동차 경로 조회 성공 확인
- [ ] 경유지 1개 이상 다중 경유지 경로 조회 성공 확인
- [ ] 동일 요청을 연속 호출했을 때 두 번째 응답이 `cached: true`인지 확인
- [ ] 잘못된 좌표·경유지 31개 요청이 400인지 확인
- [ ] 실제 기기에서 카카오맵 딥링크 `car`, `publictransit`, `foot` 동작 확인
- [ ] 카카오 개발자 콘솔에서 API 활성화 앱 및 무료 쿼터 대상 여부 확인

---

## 9. 후속 권장사항

1. 운영 모니터링에 `transId`, 오류 코드, 응답시간, 캐시 적중 여부를 구조화 로그로 수집한다.
2. 다중 인스턴스 배포 또는 장기 캐시가 필요해지면 인메모리 캐시를 Redis로 전환한다.
3. 실제 도로 소요시간 기반 순서 최적화는 호출량·비용을 측정한 뒤 2단계 기능으로 검토한다.
4. 카카오 쿼터 임계치 알림을 추가한다.
5. `by=publictransit`, `by=foot` URL Scheme은 문서만 믿지 않고 출시 기기에서 확인한다.

---

## 10. 최종 결론

카카오 자동차 경로 표시와 소규모 방문 순서 최적화에 필요한 백엔드 핵심 기능을 구현하고 `release`에 반영했다. 현재 구조는 API 키를 서버에 보호하면서 단일·다중 경유지 경로를 모두 지원하며, 장애·타임아웃·쿼터 초과를 구분하고 호출량을 줄이는 캐시까지 포함한다.

출시 전 남은 핵심 작업은 자동 배포 성공 확인과 운영 토큰을 이용한 실제 경로 스모크 테스트다.
