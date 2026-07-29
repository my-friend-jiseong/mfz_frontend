import type { BadgeShape, BadgeTone } from '@/components/ui/Badge';
import type { Destination, FieldStatus, VisitStatus } from '@/types/entities';

// 색 + 형상 + 라벨 3중 인코딩 (KWCAG). 단일 진실 출처 — 4 화면에서 import.
//
// 형상은 **도메인 안에서만** 색을 보완한다. 같은 화면에 두 도메인의 배지가 나란히
// 서지 않으므로 도메인 간 형상이 겹쳐도 된다 (예: ▲ 는 visit 에선 '거절',
// field 에선 '진행 중'). 한 도메인 안에서 겹치면 그건 버그다.

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

// field.status — 이전엔 FieldCard 안에 ●▲■ 맵과 withAlpha 칩이 손으로 박혀 있어
// 3중 인코딩 규칙에 두 번째 구현이 있었다. tone 은 colors.fieldStatus 와 같은 색을
// 가리킨다 (pending=amber600 / in_progress=blue600 / done=green600).
export const FIELD_STATUS_BADGE: Record<
  FieldStatus,
  { tone: BadgeTone; shape: BadgeShape }
> = {
  pending: { tone: 'warning', shape: 'circle' },
  in_progress: { tone: 'primary', shape: 'triangle' },
  done: { tone: 'success', shape: 'square' },
};

export const DESTINATION_STATUS_BADGE: Record<
  Destination['status'],
  { tone: BadgeTone; shape: BadgeShape; label: string }
> = {
  pending: { tone: 'warning', shape: 'circle', label: '예정' },
  arrived: { tone: 'success', shape: 'square', label: '방문 완료' },
  skipped: { tone: 'neutral', shape: 'diamond', label: '건너뜀' },
};
