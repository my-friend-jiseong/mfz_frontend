// ER 다이어그램 기반 타입 정의 (docs/mfjs.drawio.xml 참조)
//
// ID 타입: 백엔드 실응답 기준 모두 string.
//   - User.id    : UUID (예: "6c478386-f20d-4d8e-bc68-cf8f6394f377")
//   - Trip.id    : "trip-{epoch}"
//   - Visit.id   : "visit-{epoch}"
//   - Field.id   : "field-{epoch}"
//   - 외래키도 동일 string

export type FieldStatus = 'pending' | 'in_progress' | 'done';
// 백엔드와 주고받는 enum 은 영문 (안정성·국제화). 사용자 표시는 VISIT_STATUS_LABEL 매핑.
export type VisitStatus =
  | 'normal'             // 완료
  | 'absent'             // 부재
  | 'refused'            // 수취거절
  | 'unknown_address'    // 주소불명
  | 'revisit_required'   // 재방문필요
  | 'other';             // 기타 (statusReason 10자 이상 필수)
export type DestinationStatus = 'pending' | 'arrived' | 'skipped';

export interface User {
  id: string;
  email: string;
  name: string;
  // 본 서비스에는 단일 Actor (필드 워커) 만 존재. 백엔드 응답에 들어 있는 role 값은
  // 그대로 받아만 두고 분기에는 사용하지 않음.
  role: string;
  createdAt: string;
}

export interface Trip {
  id: string;
  workerId: string;
  startedAt: string;
  endedAt: string | null;
}

export interface Field {
  id: string;
  userId: string;
  status: FieldStatus;
  address: string;
  addressDetail: string;
  latitude: number;
  longitude: number;
  tags?: string[];
  recentVisitedAt?: string | null;
  updatedAt?: string;
}

export interface Visit {
  id: string;
  status: VisitStatus;
  tripId: string;
  fieldId: string;
  visitedAt: string;
}

// 외근 계획상의 목적지 (Trip 시작 시점에 N개 생성)
// ERD: docs/mfjs.drawio.xml `Destination(목적지)` 테이블 참조
// ID는 다른 엔티티와 동일하게 string. 백엔드 미연동 단계에서는 클라이언트에서 발급.
export interface Destination {
  id: string;
  tripId: string;
  fieldId: string;
  order: number;
  status: DestinationStatus;
}

export interface TextMemo {
  id: string;
  visitId: string | null;
  fieldId: string;
  content: string;
  latitude: number;
  longitude: number;
  createdAt: string;
}

export interface VoiceMemo {
  id: string;
  visitId: string | null;
  fieldId: string;
  content: string;
  latitude: number;
  longitude: number;
  createdAt: string;
}

export interface Photo {
  id: string;
  visitId: string | null;
  fieldId: string;
  fileUrl: string;
  latitude: number;
  longitude: number;
  createdAt: string;
}

export interface Report {
  id: string;
  creatorId: string;
  tripId: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  fileUrl?: string | null;
}

export const VISIT_STATUS_VALUES: VisitStatus[] = [
  'normal',
  'absent',
  'refused',
  'unknown_address',
  'revisit_required',
  'other',
];

// 사용자 표시용 한국어 라벨 — 코드 식별자(영문) ↔ 표시값(한국어) 분리.
export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  normal: '완료',
  absent: '부재',
  refused: '수취거절',
  unknown_address: '주소불명',
  revisit_required: '재방문필요',
  other: '기타',
};

// 백엔드가 과거 한글 enum 으로 응답할 가능성에 대한 양방향 매핑 — 호환 안전망.
// 백엔드가 영문 정합되면 자연스럽게 무시됨.
const KOREAN_TO_VISIT_STATUS: Record<string, VisitStatus> = {
  '완료': 'normal',
  '부재': 'absent',
  '수취거절': 'refused',
  '주소불명': 'unknown_address',
  '재방문필요': 'revisit_required',
  '기타': 'other',
};

/**
 * 어떤 형태(영문/한글/미지정)의 status 를 받아도 안전하게 영문 enum 으로 정규화.
 * 매핑 실패 시 'normal' 폴백 (체크인 직후 기본값).
 */
export function normalizeVisitStatus(raw: unknown): VisitStatus {
  if (typeof raw !== 'string') return 'normal';
  if ((VISIT_STATUS_VALUES as string[]).includes(raw)) return raw as VisitStatus;
  if (raw in KOREAN_TO_VISIT_STATUS) return KOREAN_TO_VISIT_STATUS[raw];
  return 'normal';
}

export const FIELD_STATUS_VALUES: FieldStatus[] = ['pending', 'in_progress', 'done'];

export const DESTINATION_STATUS_VALUES: DestinationStatus[] = [
  'pending',
  'arrived',
  'skipped',
];
