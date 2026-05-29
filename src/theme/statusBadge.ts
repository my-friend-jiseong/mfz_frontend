import type { BadgeShape, BadgeTone } from '@/components/ui/Badge';
import type { Destination, VisitStatus } from '@/types/entities';

// 색 + 형상 + 라벨 3중 인코딩 (KWCAG). 단일 진실 출처 — 4 화면에서 import.

export const VISIT_STATUS_BADGE: Record<
  VisitStatus,
  { tone: BadgeTone; shape: BadgeShape }
> = {
  completed: { tone: 'success', shape: 'square' },
  absent: { tone: 'neutral', shape: 'circle' },
  refused: { tone: 'danger', shape: 'triangle' },
  unknown_address: { tone: 'info', shape: 'diamond' },
  revisit_needed: { tone: 'warning', shape: 'diamond' },
  other: { tone: 'neutral', shape: 'diamond' },
};

export const DESTINATION_STATUS_BADGE: Record<
  Destination['status'],
  { tone: BadgeTone; shape: BadgeShape; label: string }
> = {
  pending: { tone: 'warning', shape: 'circle', label: '예정' },
  arrived: { tone: 'success', shape: 'square', label: '방문 완료' },
  skipped: { tone: 'neutral', shape: 'diamond', label: '건너뜀' },
};
