# 인앱 경로 표시 — 차량 한정

> **상태**: **1단계 구현 완료 · 2단계 착수 가능** (2026-07-28) — 2026-06-06 결정(**차량 경로만 추진**) 유지.
> **백로그**: [backend-backlog §22](../backend/backend-backlog.md) — **백엔드 프록시 배포 완료(2026-07-26), ✅ 아카이브.** 남은 건 프론트뿐.
> **배경**: 길찾기가 카카오 외부 앱 deep-link 뿐이라 앱 안에서 목적지 간 동선이 안 보이는 불편. MVP 동결 회고에서 미추적 상태로 재발견 → §22 등재 → 차량 한정 확정.

## 단계

### 1단계 — 순서 폴리라인 (프론트 단독) ✅ 완료 (2026-07-27, 외근 탭 UI/UX 사이클)
- active 외근 지도에서 목적지들을 **방문 순서대로 직선 연결** + 순서 번호 강조.
- 구현: `src/assets/kakaoMapHtml.ts` 에 `__mfzSetRoute`(`kakao.maps.Polyline`) + 순번 마커(원형·흰 숫자·상태 배지),
  `KakaoMapWebView` 의 `route`·`order` prop, 화면 배선은 `MapSheetLayout` 의 `routeFieldIds`.
- 스코프: 진행 중 외근(active) + 외근 상세. 지도 대시보드(전체 현장 뷰)에는 그리지 않음.

### 2단계 — 실도로 차량 경로 ⬜ 프론트 잔여 (백엔드 프록시 ✅ 배포됨)
- **백엔드 완료 (release 2026-07-26, 커밋 `386a195`)**:
  `POST /api/trips/:tripId/route` body `{ origin: {lat,lng}, destination: {lat,lng}, waypoints?: [{lat,lng}] }`
  → `{ distance(m), duration(s), vertexes: [{lat,lng}], ... }`. 카카오모빌리티 `v1/directions`·`v1/waypoints/directions`.
- **프론트 할 일**: `src/api/endpoints/trips.ts` 에 `route` 배선(현재 0건) → 1단계 직선 폴리라인을 `vertexes` 로 교체 +
  nearest-neighbor 의 직선거리 ETA(`src/utils/routeOptimize.ts`)를 `duration` 으로 대체.
- 확인 필요: 경유지 개수 제한(초과 시 분할 호출), 무료 쿼터 — 실호출로 실측.

## 보류 (결정 기록)
- **도보**: 카카오는 제휴(Partnership) API 한정이라 일반 신청 불가. 대안은 Tmap 보행자 API 였으나 **추진 안 함** (2026-06-06).
- **대중교통**: 카카오 미제공. 대안은 ODsay 였으나 **추진 안 함** (동일).
- 재론 조건: 도보 점검 비중이 커져 직선 폴리라인으로 부족하다는 실사용 피드백이 누적될 때.
