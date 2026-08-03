// ER 다이어그램 기반 타입 정의 (docs/mfjs.drawio.xml 참조)
//
// ID 타입: 백엔드 실응답 기준 모두 string.
//   - User.id    : UUID (예: "6c478386-f20d-4d8e-bc68-cf8f6394f377")
//   - Trip.id    : "trip-{epoch}"
//   - Visit.id   : "visit-{epoch}"
//   - Field.id   : "field-{epoch}"
//   - 외래키도 동일 string

export type FieldStatus = 'pending' | 'in_progress' | 'done';
// 방문 상태 enum. ERD v2 에서 visits.result_status / status_reason 컬럼이 제거되어
// 단일 status 로 붕괴됨 — v2 실제 enum 값은 계획서 §8 확인 대상. 확정 전까지 기존 값 +
// alias 폴백을 방어적으로 유지 (normalizeVisitStatus 가 미지값을 'completed' 로 흡수).
export type VisitStatus =
  | 'completed'          // 완료 (resultStatus 자동 'normal')
  | 'absent'             // 부재
  | 'refused'            // 수취거절
  | 'unknown_address'    // 주소불명
  | 'revisit_needed'     // 재방문 필요
  | 'other';             // 기타 (검증 2026-05-28: reason 10자 이상 필수 — visit_status_reason_required)
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
  // ERD v2: trips.status — 'active' | 'ended'.
  status?: 'active' | 'ended';
  // 사용자 입력 제목 (예: "가로수 보수 공사", "동구 일상 점검").
  // 백엔드 미구현 단계에선 undefined — UI 는 시작 날짜로 fallback.
  title?: string;
  // 백엔드 GET /api/trips/list 가 돌려주는 카운트. 로컬 destination/visit store 가
  // 비어있을 때(다른 디바이스·세션) 트립 상세 카운트 라인이 "0곳/0건" 으로 빠지는
  // 회로를 server-truth 로 메우는 경로. backlog §11 destinations 영속화가 들어오면
  // 단일 진실값으로 격상.
  //
  // **두 카운트는 세는 대상이 다르다** (§26, 2026-07-29 백엔드 배포로 확정):
  //   siteCount        — 실제로 들른 서로 다른 현장 수 (distinct visit.fieldId)
  //   destinationCount — 계획 목적지 수 (trip_destinations 행 수)
  // 진행률 "방문 N / 계획 M곳" 의 분모는 **destinationCount** 다. siteCount 를 분모로 쓰면
  // 정의상 `siteCount ≤ visitCount` 라 분모가 항상 분자 이하가 되어 표기가 무너진다.
  siteCount?: number;
  destinationCount?: number;
  visitCount?: number;
}

export interface Field {
  id: string;
  userId: string;
  // ERD v2: 현장은 프로젝트에 선택적으로 소속 (fields.project_id).
  projectId?: string | null;
  // 백엔드 응답에 함께 오는 프로젝트 이름 — UI 표시용(편의).
  projectName?: string | null;
  status: FieldStatus;
  // 현장 표시명 — 등록 시 "도로명 (건물명)" 형태(예: "… (동아대학교)"). 백엔드 응답의 name.
  // address 엔 건물명이 없어, 장소·건물 이름 검색이 가능하도록 별도 보관(검색 haystack 포함).
  name?: string;
  // 주소·좌표는 locations 테이블 출처 (fields.location_id 1:1). UI 표시용으로 평탄 보관.
  address: string;
  addressDetail: string;
  latitude: number;
  longitude: number;
  // ERD v2: field_tags → field_categories. 분류 라벨 목록.
  categories?: string[];
  recentVisitedAt?: string | null;
  updatedAt?: string;
}

export interface Visit {
  id: string;
  status: VisitStatus;
  tripId: string;
  fieldId: string;
  visitedAt: string;
  // backend-backlog §21 — status='other' 시 사유. 백엔드 release 2026-06 부터 응답에 포함.
  reason?: string;
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
  // 클라이언트에서 발급된 미영속 행(진행 중 add·legacy 폴백) 표시 — 서버 PATCH 가드·
  // setFromServer 보존에 사용. 서버 hydrate 행은 이 플래그가 없다(undefined). (backend-backlog §11/§24)
  local?: boolean;
}

// ERD v2: memos 테이블은 현장(field) 전용 — visit 연결·좌표 컬럼 없음.
export interface TextMemo {
  id: string;
  fieldId: string;
  content: string;
  createdBy?: string;
  createdAt: string;
}

// ERD v2: 음성 메모(VoiceMemo) 폐기 — 오디오 테이블·API 모두 제거됨.

// ERD v2: field_photos 테이블은 현장 전용 — visit 연결·좌표·caption 컬럼 없음.
export interface Photo {
  id: string;
  fieldId: string;
  fileName?: string;
  mimeType?: string;
  fileUrl: string;
  fileSize?: number;
  createdAt: string;
}

// ERD v2: reports 는 content/summary/share/soft-delete 제거.
// 본문은 fieldReports(현장별 전·중·후 사진)로 대체.
export interface Report {
  id: string;
  creatorId: string;          // reports.created_by
  tripId: string | null;
  title: string;
  outputFileUrl?: string | null;
  // backend-backlog §20 — 위치도 이미지 URL(네이티브 캡처 업로드, 미첨부 시 null).
  overviewMapUrl?: string | null;
  fieldReports?: FieldReport[];
  createdAt: string;
  updatedAt: string | null;
}

// ERD v2 신규 — 사용자별 프로젝트. 현장이 선택적으로 소속.
export interface Project {
  id: string;
  userId: string;
  name: string;
  status: string;             // enum 값 확정 전 문자열 (계획서 §8)
  createdAt: string;
  updatedAt?: string;
}

// 사용자 커스텀 카테고리(분류) 마스터 — 현장이 이름으로 참조(Field.categories: string[]).
// 사용자가 직접 추가·이름변경·삭제하는 통제 어휘. MVP 는 이름만(색상/아이콘은 백로그).
export interface Category {
  id: string;
  name: string;
  createdAt: string;
  // 서버에 아직 없는 항목(오프라인 생성). **id 문자열로 추론하지 말 것** —
  // 백엔드 categoryId 도 `cat-` 로 시작해서(예: cat-1785238001539-f7e6c788) 접두 판정이
  // 서버 항목을 로컬로 오인한다. 실측 2026-07-28: 그 오인으로 rename/remove 가
  // 서버에 전송되지 않아 새로고침 시 값이 되돌아갔다.
  local?: boolean;
}

// ERD v2 신규 — 현장 주소·좌표 1:1 (fields.location_id UNIQUE).
export interface Location {
  id: string;
  latitude: number;
  longitude: number;
  sido?: string | null;
  sigungu?: string | null;
  roadAddress: string;
  detailAddress?: string | null;
}

// ERD v2 신규 — 보고서 본문을 대체하는 현장별 전·중·후 사진.
export interface FieldReport {
  id: string;
  reportId: string;
  fieldId: string;
  title?: string | null;
  beforePhotoUrl?: string | null;
  beforePhotoCaption?: string | null;
  pendingPhotoUrl?: string | null;     // 작업 "중" 사진
  pendingPhotoCaption?: string | null;
  afterPhotoUrl?: string | null;
  afterPhotoCaption?: string | null;
  createdAt: string;
  updatedAt?: string | null;
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
