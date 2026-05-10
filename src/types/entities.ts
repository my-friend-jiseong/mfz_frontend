// ER 다이어그램 기반 타입 정의 (docs/mfjs.drawio.xml 참조)
//
// ID 타입: 백엔드 실응답 기준 모두 string.
//   - User.id    : UUID (예: "6c478386-f20d-4d8e-bc68-cf8f6394f377")
//   - Trip.id    : "trip-{epoch}"
//   - Visit.id   : "visit-{epoch}"
//   - Field.id   : "field-{epoch}"
//   - 외래키도 동일 string

export type FieldStatus = 'pending' | 'in_progress' | 'done';
// 백엔드 canonical (handoff §5 응답 기준 — Phase 6 contract).
// 'completed' 와 별개의 'resultStatus' (normal | abnormal) 가 응답에 따로 있음.
export type VisitStatus =
  | 'completed'          // 완료 (resultStatus 자동 'normal')
  | 'absent'             // 부재
  | 'refused'            // 수취거절
  | 'unknown_address'    // 주소불명
  | 'revisit_needed'     // 재방문 필요
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
  // 사용자 입력 제목 (예: "가로수 보수 공사", "동구 일상 점검").
  // 백엔드 미구현 단계에선 undefined — UI 는 시작 날짜로 fallback.
  title?: string;
  // 백엔드 GET /api/trips/list 가 돌려주는 카운트. 로컬 destination/visit store 가
  // 비어있을 때(다른 디바이스·세션) 트립 상세 카운트 라인이 "0곳/0건" 으로 빠지는
  // 회로를 server-truth 로 메우는 경로. backlog §11 destinations 영속화가 들어오면
  // 단일 진실값으로 격상.
  siteCount?: number;
  visitCount?: number;
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
  // 사용자 입력 제목 (예: "1번 가로수", "A동 정문").
  // 백엔드 미구현 단계에선 undefined — UI 는 주소로 fallback.
  title?: string;
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
  'completed',
  'absent',
  'refused',
  'unknown_address',
  'revisit_needed',
  'other',
];

// 사용자 표시용 한국어 라벨 — 코드 식별자(영문) ↔ 표시값(한국어) 분리.
export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  completed: '완료',
  absent: '부재',
  refused: '수취거절',
  unknown_address: '주소불명',
  revisit_needed: '재방문필요',
  other: '기타',
};

// 호환 안전망 — 백엔드가 한글 enum 또는 옛 영문값 ('normal' / 'revisit_required') 으로
// 응답할 가능성. 'normal' 은 visit.status 의 옛 값 또는 resultStatus 와 충돌 가능 — 문맥상
// status 자리에선 'completed' 로 정규화.
const VISIT_STATUS_ALIAS: Record<string, VisitStatus> = {
  '완료': 'completed',
  '부재': 'absent',
  '수취거절': 'refused',
  '주소불명': 'unknown_address',
  '재방문필요': 'revisit_needed',
  '기타': 'other',
  // 옛 프론트 영문값 (잘못된 가정) — 백엔드 정정 후 들어와도 흡수.
  normal: 'completed',
  revisit_required: 'revisit_needed',
};

/**
 * 어떤 형태의 visit status 를 받아도 안전하게 영문 enum 으로 정규화.
 * 매핑 실패 시 'completed' 폴백 (체크인 직후 백엔드 기본값).
 */
export function normalizeVisitStatus(raw: unknown): VisitStatus {
  if (typeof raw !== 'string') return 'completed';
  if ((VISIT_STATUS_VALUES as string[]).includes(raw)) return raw as VisitStatus;
  if (raw in VISIT_STATUS_ALIAS) return VISIT_STATUS_ALIAS[raw];
  return 'completed';
}

export const FIELD_STATUS_VALUES: FieldStatus[] = ['pending', 'in_progress', 'done'];

// 사용자 표시용 한국어 라벨 — 코드 식별자(영문) ↔ 표시값(한국어) 분리.
// "조치" 도메인 어휘로 통일 (이전: 대기/진행중/완료).
export const FIELD_STATUS_LABEL: Record<FieldStatus, string> = {
  pending: '조치 전',
  in_progress: '조치 중',
  done: '조치 완료',
};

export const DESTINATION_STATUS_VALUES: DestinationStatus[] = [
  'pending',
  'arrived',
  'skipped',
];
