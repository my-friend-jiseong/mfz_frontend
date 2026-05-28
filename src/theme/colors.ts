export const colors = {
  // 브랜드
  primary: '#2563eb',
  primaryDark: '#1d4ed8',
  primaryMuted: '#dbeafe', // primary tint 배경 (포커스/선택)

  // 표면
  surface: '#ffffff',
  surfaceMuted: '#f1f5f9', // 카드 안 구분 영역
  background: '#f8fafc',

  // 경계/구분
  border: '#e2e8f0',
  divider: '#eef2f7',
  focus: '#3b82f6', // 포커스 outline

  // 텍스트
  text: '#0f172a',
  textMuted: '#64748b',
  textSubtle: '#94a3b8', // 보조 메타 (날짜·카운트 등)

  // intent
  danger: '#dc2626',
  warning: '#d97706',
  success: '#16a34a',
  info: '#0284c7',

  // intent tint (badge·chip 배경)
  dangerMuted: '#fee2e2',
  warningMuted: '#fef3c7',
  successMuted: '#dcfce7',
  infoMuted: '#e0f2fe',
  neutralMuted: '#f1f5f9',

  // overlay
  overlay: 'rgba(15, 23, 42, 0.45)',
  shadow: '#0f172a',

  // 인버스 (다크 배경 위 텍스트/아이콘)
  onPrimary: '#ffffff',
  onDanger: '#ffffff',

  // field.status별
  fieldStatus: {
    pending: '#f59e0b',
    in_progress: '#2563eb',
    done: '#16a34a',
  },

  // visit.status별 (KWCAG 3중 인코딩 준수 — 색 + 형상 + 라벨 전제). 키는 영문 enum.
  // handoff §5: completed / revisit_needed 가 백엔드 canonical.
  visitStatus: {
    completed: '#16a34a',
    absent: '#64748b',
    refused: '#dc2626',
    unknown_address: '#a855f7',
    revisit_needed: '#d97706',
    other: '#475569',
  },

  // 외근 진행 중 배너
  tripBanner: '#dc2626',
} as const;
