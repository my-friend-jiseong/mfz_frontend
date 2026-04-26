// ER 다이어그램 기반 타입 정의 (docs/mfjs.drawio.xml 참조)
//
// ID 타입: 백엔드 실응답 기준 모두 string.
//   - User.id    : UUID (예: "6c478386-f20d-4d8e-bc68-cf8f6394f377")
//   - Trip.id    : "trip-{epoch}"
//   - Visit.id   : "visit-{epoch}"
//   - Field.id   : "field-{epoch}"
//   - 외래키도 동일 string

export type FieldStatus = 'pending' | 'in_progress' | 'done';
export type VisitStatus = '완료' | '부재' | '수취거절' | '주소불명' | '재방문필요' | '기타';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
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
}

export interface Visit {
  id: string;
  status: VisitStatus;
  tripId: string;
  fieldId: string;
  visitedAt: string;
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
}

export const VISIT_STATUS_VALUES: VisitStatus[] = [
  '완료',
  '부재',
  '수취거절',
  '주소불명',
  '재방문필요',
  '기타',
];

export const FIELD_STATUS_VALUES: FieldStatus[] = ['pending', 'in_progress', 'done'];
