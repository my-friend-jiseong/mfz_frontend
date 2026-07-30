import { palette } from './palette';

// Semantic color tokens — 화면 코드는 항상 이 객체를 참조.
// raw hex 는 palette.ts 에만, 화면은 의미(text/bg/border/intent/status) 로 사용.
//
// 구조:
//   text.*       — 전경 (텍스트·아이콘)
//   bg.*         — 배경 (canvas/surface/elevated/overlay)
//   border.*     — 테두리·구분선
//   primary.*    — 브랜드 (기본 액션)
//   intent.*     — success/danger/warning/info 상태 의미
//   fieldStatus.*, visitStatus.*  — 도메인 status (색+형상+라벨 3중 인코딩 일부)
//
// backward-compat:
//   기존 callsite (colors.text, colors.textMuted, colors.primary, colors.danger 등) 가
//   40+ 화면에 흩어져 있어 한 번에 깨지 않도록 flat alias 도 함께 노출.
//   점진 마이그레이션 끝나면 alias 제거.

export const colors = {
  // === Foreground (text·icon) ===
  text: palette.slate[900], // primary — 헤딩·강조 본문
  textMuted: palette.slate[500], // secondary — 메타·보조
  textSubtle: palette.slate[400], // tertiary — placeholder·매우 약함
  textInverse: palette.slate[50], // 다크 배경 위 (profile avatar 1 곳)

  // === Background (surface 위계) ===
  background: palette.slate[50], // canvas — 화면 root
  surface: palette.white, // 카드·input 등 표면
  surfaceMuted: palette.slate[100], // 약한 분리 영역 (readonly 등)
  // 누르는 순간의 표면. **opacity 로는 안 된다** — 흰 카드(#fff)를 slate50 캔버스 위에서
  // 0.85 로 깔면 합성 결과가 (254,254,255) 로 채널당 1/255 변한다(2026-07-30 계산).
  // 즉 목록의 모든 카드가 press 피드백이 없는 상태였다. 값을 직접 바꿔야 보인다.
  // surfaceMuted 와 같은 값이지만 역할이 다르다 — 이건 **누르는 동안만** 쓰는 전이 상태다.
  surfacePressed: palette.slate[100],
  overlay: 'rgba(15, 23, 42, 0.45)', // modal dim
  shadow: palette.slate[900], // 그림자 색 (alpha 는 elevation 에서)

  // === Border ===
  border: palette.slate[200], // default
  borderMuted: palette.slate[100], // 약한 구분선
  focus: palette.blue[500], // 포커스 ring

  // === Control (input·select·checkbox 등 입력 표면) ===
  // 입력은 inset — 주변 표면보다 어둡다. 이전엔 Input 이 surface(흰색)+border 라
  // Card 와 채움·테두리·radius 가 전부 같아 '테두리 색으로만' 구분됐다.
  // 흰 카드 위에서도 slate50 캔버스 위에서도 채움만으로 "여기에 입력" 이 읽히도록
  // surface 토큰과 분리해 둔다 — 입력만 따로 조정 가능.
  control: {
    bg: palette.slate[100],
    bgDisabled: palette.slate[200],
    border: palette.slate[200],
    borderFocus: palette.blue[500],
    borderError: palette.red[600],
  },

  // === Brand (primary) ===
  primary: palette.blue[600],
  primaryMuted: palette.blue[100], // 약한 tint (active chip 배경)

  // === Intent — Success ===
  success: palette.green[600],
  successMuted: palette.green[100],

  // === Intent — Danger ===
  danger: palette.red[600],
  dangerMuted: palette.red[100],

  // === Intent — Warning ===
  warning: palette.amber[600],
  warningMuted: palette.amber[100],

  // === Intent — Info ===
  info: palette.sky[600],
  infoMuted: palette.sky[100],

  // === Intent — Neutral (chip 등 무채색 tint) ===
  neutralMuted: palette.slate[100],

  // === Inverse (강한 단색 배경 위 전경) ===
  onPrimary: palette.white,
  onDanger: palette.white,

  // === Domain — field.status ===
  // WCAG 3중 인코딩 (색+형상+라벨) — 색만 정보 전달 금지.
  // pending 은 amber[500] 이었는데 Badge 의 warning tone(amber[600])과 한 단계 어긋나
  // 같은 상태가 카드에선 밝고 지도 마커에선 어두웠다. 600 으로 맞춰 하나로 만든다
  // (야외 조도에서 대비도 함께 올라간다). 형상·라벨 매핑은 statusBadge.ts.
  fieldStatus: {
    pending: palette.amber[600],
    in_progress: palette.blue[600],
    done: palette.green[600],
  },

  // === Domain — visit.status ===
  visitStatus: {
    completed: palette.green[600],
    absent: palette.slate[500],
    refused: palette.red[600],
    unknown_address: palette.violet[500],
    revisit_needed: palette.amber[600],
    other: palette.slate[600],
  },

  // === Other ===
  // 진행 중 외근 상단 배너 — '활성 세션' 의미는 brand(파랑). 빨강은 파괴적 액션(외근 종료)에만
  // 두어 색의 의미를 1:1 로 유지 (UI/UX P1-2). 이전엔 red[600] 이라 종료 버튼과 빨강이 중복됐음.
  tripBanner: palette.blue[600],
} as const;
