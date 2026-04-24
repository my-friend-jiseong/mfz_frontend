# mfz_frontend (내친지)

현장 방문 업무자를 위한 모바일 앱 프로토타입 (Expo + React Native + TypeScript).

## 실행법

```bash
npm install
npx expo start
```

- `w`: 웹 프리뷰 (가장 빠른 검증 방법)
- `i` / `a`: iOS / Android 시뮬레이터
- QR 스캔: Expo Go 앱으로 실기기 확인

## Kakao JS Key 설정 (선택)

지도 실제 렌더링을 보려면 Kakao Maps JS 키가 필요합니다. 없어도 플로우 검증은 placeholder로 가능합니다.

1. [Kakao Developers](https://developers.kakao.com) → 내 애플리케이션 → **JavaScript 키** 발급
2. 웹 프리뷰 사용 시 "플랫폼 > Web"에 로컬 도메인 등록 (예: `http://localhost:8081`)
3. 프로젝트 루트에 `.env.local` 생성 (`git` 추적 대상 아님):

   ```bash
   cp .env.example .env.local
   # 편집기로 .env.local 열어서 EXPO_PUBLIC_KAKAO_JS_KEY=... 로 키 입력
   ```

4. `npx expo start --clear` 로 재시작 (환경변수는 번들 시점에만 주입됨)

**절대 키를 app.json·소스 파일·커밋에 넣지 마세요.** Expo의 `EXPO_PUBLIC_*` 접두어가 붙은 변수만 클라이언트 번들에 포함됩니다.

## 프로토타입 범위

포함:
- 인증 (로그인·회원가입, in-memory 목업)
- 지도 대시보드 (마커·필터·표시모드 토글)
- 외근 (시작/종료, 내역, 상세 타임라인)
- 현장 CRUD (목록·주소검색 mock·상세·수정·삭제)
- 방문 기록 (체크인 + 텍스트 메모 + 사진 placeholder + 결과 상태 6개 Enum)

제외:
- 보고서 Domain 전체 (2차 이터레이션)
- 음성 메모, 실제 카메라/갤러리, 실제 위치 추적
- 백엔드 연동 (모든 데이터 in-memory)

## 스모크 시나리오

1. 로그인 (`test@mfz.local` / `test1234`)
2. 지도 탭 — 부산·대구 시드 현장 6개 마커 확인
3. 외근 탭 → "외근 시작"
4. 현장 탭 → 현장 선택 → "체크인" → 메모·사진·결과 상태 입력 → 저장
5. 외근 탭 → "외근 종료" → 내역에 방금 외근 추가 확인

## 구조

```
app/          # expo-router 파일 기반 라우트
src/
  types/      # ER 기반 TypeScript 타입
  stores/     # Zustand 스토어 4종 (auth/field/trip/visit)
  data/       # 시드 목업 데이터
  components/ # 공용 컴포넌트
  theme/      # 색/여백 토큰
  assets/     # WebView HTML 생성기
docs/         # ER/IA 다이어그램·기술 스택
```

## 한계

- In-memory 데이터: 앱 재시작 시 초기화 (의도된 동작)
- Kakao JS Key 없으면 지도는 placeholder 표시
- 웹 프리뷰의 WebView 동작은 모바일과 일부 차이 있을 수 있음
