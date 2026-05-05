export const colors = {
  primary: '#2563eb',
  primaryDark: '#1d4ed8',
  surface: '#ffffff',
  background: '#f8fafc',
  border: '#e2e8f0',
  text: '#0f172a',
  textMuted: '#64748b',
  danger: '#dc2626',
  warning: '#d97706',
  success: '#16a34a',

  // field.status별
  fieldStatus: {
    pending: '#f59e0b',
    in_progress: '#2563eb',
    done: '#16a34a',
  },

  // visit.status별 (KWCAG 3중 인코딩 준수 — 색 + 형상 + 라벨 전제). 키는 영문 enum.
  visitStatus: {
    normal: '#16a34a',
    absent: '#64748b',
    refused: '#dc2626',
    unknown_address: '#a855f7',
    revisit_required: '#d97706',
    other: '#475569',
  },

  // 외근 진행 중 배너
  tripBanner: '#dc2626',
} as const;
