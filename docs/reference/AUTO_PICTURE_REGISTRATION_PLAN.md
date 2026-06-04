# 사진 자동 현장 매칭 등록 계획 (Quick Photo / 일가요 mfz_frontend)

> **목적**: Claude Code 작업 지시서. 현재 "현장 선택 → 해당 현장에 사진 등록" 플로우에,
> **"사진을 찍으면 → 촬영 위치에서 가장 가까운 현장에 자동 등록"** 되는 빠른 등록 경로를 추가한다.
>
> **상태**: 구현 완료 (2026-06-04, `feat/quick-photo`). 아래 §4 의 파일 경로는 구현하며
> 코드베이스 컨벤션(훅은 컴포넌트와 colocate)에 맞게 일부 조정됨 — 본문에 반영 완료.
> QA: docs/qa/integration-scenario.md §S11.

---

## 1. 확정된 제품 결정 (사용자 합의 완료)

| 결정 항목 | 확정안 | 비고 |
|---|---|---|
| **진입점** | 글로벌 '빠른 촬영' 버튼 **신설** — 현장 목록 화면에 추가 | 기존 현장 상세의 "사진 추가" 플로우는 **그대로 유지** (두 경로 공존) |
| **확인 UX** | 촬영 직후 **확인 1탭 후 등록** — "○○현장 (32m)에 등록할까요?" 시트, 가까운 다른 후보로 변경 가능 | 완전 자동(무확인)은 오등록 리스크로 배제 |
| **거리 정책** | **100m 임계값** — 이내 현장 없으면 "근처 현장이 없습니다" 안내 후 기존 현장 **수동 선택 리스트로 폴백** | 도심 현장 밀집 환경 기준 |
| **갤러리 사진** | **카메라 직촬영만** 자동 매칭. 갤러리 사진은 기존 수동 플로우 유지 | 과거 사진은 촬영 위치 ≠ 현재 위치. EXIF 처리 연기 방침([[project_field_redefinition]])과 일치 |
| **위치 출처** | 촬영 시점의 **기기 GPS** (`expo-location`) | EXIF GPS 파싱은 범위 밖 (2학기 ERD v3 과제) |
| **phase** | 빠른 등록 사진은 phase **미지정** (일반 사진) | 작업 전/중/후 슬롯은 체크인 화면 전용으로 유지 |

## 2. 현재 구조 (조사 완료 — 활용 자산)

| 자산 | 위치 | 활용 방법 |
|---|---|---|
| 사진 선택/촬영 | `src/utils/media.ts:35` `pickPhoto('camera')` | 그대로 재사용 (`exif: true` 이미 켜져 있으나 파싱은 안 함) |
| 위치 획득 | `src/utils/geolocation.ts:10` `requestUserLocation()` | **주의**: 현재 `Accuracy.Balanced`(~100m 오차). 이 플로우는 100m 임계값과 충돌하므로 **`Accuracy.High` 옵션 추가** 필요 (§4-1) |
| 거리 계산 | `src/utils/routeOptimize.ts:8` `haversineKm(a, b)` | import 해서 재사용 (이동 금지 — 외근 최적화가 의존) |
| 현장 목록 | `src/api/endpoints/fields.ts:194` `fields.listMine()` / `fieldStore` | **주의**: 백엔드 기본값이 "visit 최근 30일" 스코프 — 매칭은 **`visitDateScope: 'all'`** 로 전체 현장 대상 (§6-5) |
| 현장 좌표 | `Field.latitude/longitude` — **필수 필드** | 좌표 없는 현장 케이스 없음 (방어 코드만) |
| 사진 업로드 | `src/api/endpoints/fields.ts:236` `addPhoto` → `POST /api/fields/{fieldId}/photos` | 그대로 재사용 — **백엔드 변경 불필요** |
| 진입점 후보 | `app/(tabs)/fields/index.tsx:248` `StickyBottomBar`("새 현장" 버튼) | 카메라 버튼 추가 위치 (§4-3) |

**기존 플로우** (유지): 현장 상세(`app/(tabs)/fields/[id]/index.tsx:390`) → "사진 추가" → `promptPhotoSource()` → `fieldStore.addPhoto`.

## 3. 새 플로우 (Quick Photo)

```
[현장 목록] ── 📷 빠른 촬영 버튼
     │
     ├─ ① 카메라 권한 + 위치 권한 요청
     │      └─ 위치 거부/실패 → ⓕ 수동 선택 폴백
     ├─ ② pickPhoto('camera')  ← 촬영 (취소 시 종료)
     ├─ ③ requestUserLocation({ high: true })  ← 촬영 직후 좌표 1회
     ├─ ④ 전체 현장(listMine all) 대상 haversine 최근접 계산
     │      ├─ 100m 이내 후보 ≥1 → ⑤ 확인 시트
     │      └─ 후보 0 → ⓕ "근처 현장이 없습니다" + 수동 선택 폴백
     ├─ ⑤ 확인 시트: "○○현장 (32m)에 등록할까요?"
     │      ├─ [등록] → ⑥
     │      ├─ 100m 이내 차순위 후보 칩 목록 (최대 3개, 거리 표시) → 선택 변경
     │      └─ [다른 현장 선택] → ⓕ
     ├─ ⑥ fieldStore.addPhoto(fieldId, file)  ← phase 없음
     └─ ⑦ 성공 토스트(Alert) + "현장 보기" 액션 → /fields/[id]
ⓕ 폴백: 기존 현장 검색 리스트 시트 → 선택 → ⑥
```

핵심 원칙: **촬영을 먼저, 매칭은 그다음.** 사용자는 카메라부터 보고, 현장 결정은 시스템이 제안한다.

## 4. 구현 단계

### 4-1. 위치 정밀도 옵션 — `src/utils/geolocation.ts`
`requestUserLocation(opts?: { high?: boolean })` 로 시그니처 확장.
`high: true` 면 `Accuracy.High`. 기존 호출부(지도 등)는 무인자 → Balanced 그대로 (회귀 없음).

### 4-2. 매칭 유틸 — `src/utils/nearestField.ts` (신규)
```ts
const QUICK_PHOTO_MAX_DISTANCE_M = 100;
// 좌표 보유 현장만 대상, haversineKm * 1000 ≤ 임계값 필터 → 거리 오름차순 정렬
export function findNearbyFields(pos: LatLng, fields: Field[], maxDistanceM?: number):
  Array<{ field: Field; distanceM: number }>
```
순수 함수로 분리 → 단위 테스트 대상 (§7). UI/스토어 의존 금지.

### 4-3. 진입점 — `app/(tabs)/fields/index.tsx`
`StickyBottomBar` 내부를 2버튼 행으로: 기존 "새 현장"(주 버튼) + **카메라 아이콘 보조 버튼**.
바텀시트 헤더의 빈 상태 버튼(`:238`)은 손대지 않음. 디자인 토큰은 `design-system.md` 준수.

### 4-4. Quick Photo 플로우 훅 — `src/components/fields/useQuickPhoto.ts` (신규)
①~④ + ⑥~⑦ 의 오케스트레이션. 화면이 아닌 훅으로 만들어, 추후 지도 화면 등
다른 진입점에서도 재사용 가능하게. 상태: `idle | locating | matching | confirming | uploading`.

### 4-5. 확인/폴백 시트 — `src/components/fields/QuickPhotoSheet.tsx` (신규)
- 확인 모드: 촬영 썸네일 + 1순위 주소·상세주소·거리 기본 선택 + 차순위 후보 라디오 행(최대 3) + [이 현장에 등록] / [다른 현장 선택]
- 폴백 모드: 사유 안내 + 현장 검색 입력 + 리스트 행(주소·상세주소) 탭 → 즉시 등록
- ~~`@gorhom/bottom-sheet` BottomSheetModal~~ → **RN `Modal` 카드** (AddDestinationModal 패턴).
  코드베이스에 BottomSheetModalProvider 가 없어 gorhom modal 은 루트 변경이 필요했음 — 기존 패턴 재사용이 우위.

### 4-6. 업로드 & 완료
- `fieldStore.addPhoto(fieldId, file)` 그대로 (phase 인자 없음).
- 성공: `Alert.alert('등록 완료', '○○현장에 사진을 등록했어요', [현장 보기 | 닫기])`
  — web 분기 불필요, `Alert.alert` 그대로 사용 ([[project_web_alert_patch]] — webAlertPatch가 전역 처리).
- 실패: 에러 Alert + [다시 시도] (파일은 메모리에 유지, 재촬영 불필요).

## 5. 백엔드 영향 — **없음**

매칭은 100% 클라이언트(이미 받은 현장 목록 + 기기 좌표). 업로드는 기존
`POST /api/fields/{fieldId}/photos` 그대로. `docs/backend/backend-backlog.md` 추가 항목 없음.

(선택, 후속) 사진에 촬영 좌표 메타를 남기고 싶어지면 — 프론트 optional 필드 선행 후
백로그 문서로 요청하는 기존 절차([[feedback_frontend_first]])를 따른다. 이번 범위 아님.

## 6. 엣지 케이스 (구현 시 필수 처리)

1. **위치 권한 거부 / GPS 실패** → 에러 없이 ⓕ 수동 선택 폴백 (`requestUserLocation` 이 null 반환하는 기존 silent 계약 유지). 안내 문구: "위치를 확인할 수 없어 현장을 직접 선택해 주세요."
2. **카메라 권한 거부** → `pickPhoto` 기존 Alert 처리 그대로, 플로우 종료.
3. **현장 0개** (신규 사용자) → 폴백 시트 대신 "등록된 현장이 없습니다" + [새 현장 등록] 으로 `/fields/new` 유도.
4. **100m 이내 후보 다수** → 거리 오름차순 1순위 기본 선택, 나머지는 칩으로 노출 (§4-5). 동률(같은 건물 등)도 동일 규칙.
5. **현장 목록 스코프** → 매칭용 페치는 화면 필터와 무관하게 `visitDateScope: 'all'` 로 별도 호출 (화면의 30일 필터 상태를 오염시키지 않게 스토어 상태와 분리하거나 일회성 API 호출).
6. **web 플랫폼** → `pickPhoto('camera')` 는 web 에서 파일 선택기로 동작, 위치는 브라우저 geolocation. 동작은 하되 1차 타깃은 모바일 — web 은 "동작 확인" 수준이면 충분.
7. **업로드 중 이탈** → uploading 상태에서 시트 dismiss 방지 (체크인 화면의 업로드 가드 패턴 참고).
8. **좌표 결측 현장** → 모델상 필수지만 방어적으로 매칭 대상에서 제외 (크래시 금지).

## 7. QA / 검증

- **단위 테스트** (`src/utils/__tests__/nearestField.test.ts`, 실행 `npm test` — tsx 러너 도입): 임계값 경계(99/101m), 정렬 순서, 빈 목록, 좌표 결측 제외, 커스텀 임계값, formatDistanceM. 부산 좌표 픽스처 ([[feedback_demo_data_busan]]).
- **수동 QA 시나리오** (기존 QA 문서 체계에 추가):
  1. 현장 30m 거리에서 촬영 → 1순위 제안 일치 + 등록 + 현장 상세에서 사진 확인
  2. 임계값 밖(>100m)에서 촬영 → 폴백 시트 → 수동 선택 등록
  3. 위치 권한 거부 상태 → 폴백 진입
  4. 기존 플로우(현장 상세 사진 추가) 회귀 없음
  5. 체크인 3단계 슬롯 회귀 없음 (phase 사진과 섞이지 않는지)
- **회귀 주의 지점**: `geolocation.ts` 시그니처 확장(기존 호출부 무영향), `StickyBottomBar` 레이아웃(스크롤 hide 동작 유지), fieldStore 목록 상태 오염 여부(§6-5).

## 8. 작업 순서 제안 (커밋 단위)

1. `feat(photo): 최근접 현장 매칭 유틸 + 테스트` — §4-1, §4-2 (UI 없음, 순수 로직)
2. `feat(photo): Quick Photo 훅 + 확인/폴백 시트` — §4-4, §4-5
3. `feat(photo): 현장 목록에 빠른 촬영 진입점 연결` — §4-3, §4-6
4. `docs(qa): Quick Photo QA 시나리오 추가` — §7

각 단계 독립 동작 가능 (1은 미사용 코드지만 테스트로 검증됨, 2는 진입점 없이도 단독 검증 가능).
