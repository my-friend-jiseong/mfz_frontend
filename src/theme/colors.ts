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
  textDisabled: palette.slate[300], // 비활성 라벨
  textInverse: palette.slate[50], // 다크 배경 위
  textLink: palette.blue[600], // 텍스트 링크 (필요 시)

  // === Background (surface 위계) ===
  background: palette.slate[50], // canvas — 화면 root
  surface: palette.white, // 카드·input 등 표면
  surfaceMuted: palette.slate[100], // 약한 분리 영역 (readonly 등)
  surfaceStrong: palette.slate[200], // 강조 분리
  overlay: 'rgba(15, 23, 42, 0.45)', // modal dim
  shadow: palette.slate[900], // 그림자 색 (alpha 는 elevation 에서)

  // === Border ===
  border: palette.slate[200], // default
  borderMuted: palette.slate[100], // 약한 구분선 (구 divider)
  borderStrong: palette.slate[300], // 강조 테두리
  focus: palette.blue[500], // 포커스 ring

  // === Brand (primary) ===
  primary: palette.blue[600],
  primaryHover: palette.blue[700], // web hover / pressed (모바일)
  primaryActive: palette.blue[800], // 더 강한 pressed
  primaryMuted: palette.blue[100], // 약한 tint (active chip 배경)
  primarySubtle: palette.blue[50], // 더 약한 tint

  // === Intent — Success ===
  success: palette.green[600],
  successHover: palette.green[700],
  successMuted: palette.green[100],
  successSubtle: palette.green[50],

  // === Intent — Danger ===
  danger: palette.red[600],
  dangerHover: palette.red[700],
  dangerMuted: palette.red[100],
  dangerSubtle: palette.red[50],

  // === Intent — Warning ===
  warning: palette.amber[600],
  warningHover: palette.amber[700],
  warningMuted: palette.amber[100],
  warningSubtle: palette.amber[50],

  // === Intent — Info ===
  info: palette.sky[600],
  infoHover: palette.sky[700],
  infoMuted: palette.sky[100],
  infoSubtle: palette.sky[50],

  // === Intent — Accent (violet, 보조 강조) ===
  accent: palette.violet[500],
  accentMuted: palette.violet[100],
  accentSubtle: palette.violet[50],

  // === Intent — Neutral (chip 등 무채색 tint) ===
  neutralMuted: palette.slate[100],
  neutralSubtle: palette.slate[50],

  // === Inverse (강한 단색 배경 위 전경) ===
  onPrimary: palette.white,
  onDanger: palette.white,
  onSuccess: palette.white,
  onWarning: palette.white,
  onInfo: palette.white,

  // === Domain — field.status ===
  // WCAG 3중 인코딩 (색+형상+라벨) — 색만 정보 전달 금지.
  fieldStatus: {
    pending: palette.amber[500],
    in_progress: palette.blue[600],
    done: palette.green[600],
  },
  fieldStatusSubtle: {
    pending: palette.amber[50],
    in_progress: palette.blue[50],
    done: palette.green[50],
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
  tripBanner: palette.red[600],

  // === Backward-compat alias ===
  // 점진 마이그레이션 끝나면 제거.
  divider: palette.slate[100], // → borderMuted
} as const;
