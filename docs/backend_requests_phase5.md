# 백엔드 추가 보강 요청 — Phase 5 (백로그)

> **수신**: mfz_backend 팀
> **발신**: mfz_frontend 팀 (njs)
> **작성일**: 2026-04-27
> **상태**: 📦 **백로그 — Phase 4 완료 후 재논의**
> **선행 의존**: [`docs/backend_requests_phase4.md`](backend_requests_phase4.md) 의 P0 항목들이 먼저 처리되어야 합니다. Phase 5 는 그 이후 사이클에서 다룰 항목.

---

## 0. 한 눈에

| 순위 | 항목 | 차단도 | 사유 |
|---|---|---|---|
| **P3** | [§1] 주소 검색을 Daum 우편번호 → **Kakao Local API 단독** 전환 | 🟢 비차단 | 의존성 일원화, Kakao Maps SDK 이미 사용 중. 현재 `address/search` 가 동작 중이므로 시연 차단 없음 |

---

## 1. [P3] 주소 검색 provider 단일화 — Daum 의존성 제거

### 배경

[`docs/_swagger_responses.md` §4.4](_swagger_responses.md) 의 `GET /api/fields/address/search` 응답에 다음과 같이 명시됨:

```json
"provider": {
  "primary": "daum_postcode",
  "secondary": "kakao_local_rest",
  "retryOnFailure": 1,
  "manualCoordinateFallback": true
}
```

즉 백엔드가 **Daum 우편번호 서비스 (1차) + Kakao Local REST (2차)** 두 가지를 결합 사용 중. 역할 분담:

- **Daum 우편번호 서비스**: 한국 주소 자동완성 UI (팝업 형태). 무료·키 불필요. **좌표 미반환** — 주소 문자열만.
- **Kakao Local REST**: Daum 이 반환한 주소를 좌표로 변환 (geocoding). REST API key 필요.

### 단일화 가능성

**Kakao Local API 만으로 동일 기능 모두 제공됩니다.**

| Endpoint | 용도 | 비고 |
|---|---|---|
| `GET https://dapi.kakao.com/v2/local/search/address.json?query={q}` | **주소 검색 + 좌표** (도로명·지번 모두) | Daum + 좌표 변환을 한 번에 |
| `GET .../search/keyword.json` | 장소(POI) 검색 | 빌딩명·상호 검색 |
| `GET .../geo/coord2regioncode.json` | 좌표 → 행정구역 (역지오코딩) | sido/sigungu 자동 추출 |

응답 예시 (Kakao Local 단독):
```json
{
  "documents": [
    {
      "address_name": "서울 중구 세종대로 110",
      "address_type": "ROAD_ADDR",
      "road_address": {
        "address_name": "서울 중구 세종대로 110",
        "building_name": "서울특별시청",
        "zone_no": "04524"
      },
      "address": {
        "address_name": "서울 중구 태평로1가 31",
        "region_1depth_name": "서울",
        "region_2depth_name": "중구"
      },
      "x": "126.978...",  // longitude
      "y": "37.566..."    // latitude
    }
  ]
}
```

### 권장 조치 (백엔드)

1. `searchFieldAddress` 의 `daum_postcode` 분기 제거
2. `kakao_local_rest` 단독으로 호출 (Kakao REST API key 사용)
3. **응답 shape 그대로 유지** (`roadAddress`, `jibunAddress`, `buildingName`, `lat`, `lng`, `sido`, `sigungu`, `zonecode`) — 매핑만 Kakao response → 위 키로 변환
4. `provider` 메타도 `{ primary: "kakao_local_rest", manualCoordinateFallback: true }` 로 단순화

### 장단점

| 항목 | 단일화 후 | 현재 (혼합) |
|---|---|---|
| 의존성 수 | 1 | 2 |
| 키 관리 | Kakao REST 1개 | Kakao + Daum (Daum 은 키 없지만 별도 SDK 의존) |
| 한국 주소 커버리지 | 도로명·지번·우편번호·빌딩명 모두 | 동일 (좌표는 어차피 Kakao 거침) |
| RN 환경 UX | 네이티브 검색바 + Kakao Local 직접 호출 → 매끄러움 | Daum 자동완성 팝업이 RN에서는 WebView 필요 — 자연스럽지 않음 |
| 비용 | Kakao API quota | 동일 |
| 시연 차단 영향 | 0 (현재 동작) | 0 |

### 프런트 영향

**응답 shape 동일 유지 시 프런트 코드 변경 0.** [`src/api/endpoints/fields.ts`](../src/api/endpoints/fields.ts) 의 `AddressSearchItem` 인터페이스가 그대로 유효.

응답 키가 살짝 달라지는 경우 (예: `road_address.building_name` 직접 노출) 어댑터 1~2줄 추가만 필요.

---

## 2. 진행 시점

- **언제**: [Phase 4](backend_requests_phase4.md) 의 P0 항목 (§1 tripId FK violation, §3 반복 패턴 체계 보강) 처리 완료 후
- **누가 먼저 의제 제기**: 프런트 — 다음 시연 후 Phase 4 검증 통과 시점에 본 문서 다시 꺼내서 백엔드와 논의
- **시연 영향**: 없음. Phase 4 가 차단 항목이라 그쪽 우선

---

## 3. 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-04-27 | Phase 5 백로그 초안 — Daum → Kakao Local 단독 전환 |

---

## 4. 참조

- [docs/backend_requests_phase4.md](backend_requests_phase4.md) — 선행 의존 항목 (P0)
- [docs/_swagger_responses.md §4.4](_swagger_responses.md) — 현재 `address/search` 응답 shape
- Kakao Local API 문서: https://developers.kakao.com/docs/latest/ko/local/dev-guide
