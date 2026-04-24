// ER 다이어그램 기반 타입 정의 (docs/mfjs.drawio.xml 참조)

export type FieldStatus = 'pending' | 'in_progress' | 'done';
export type VisitStatus = '완료' | '부재' | '수취거절' | '주소불명' | '재방문필요' | '기타';

export interface User {
  id: number;
  createdAt: string;
}

export interface Trip {
  id: number;
  workerId: number;
  startedAt: string;
  endedAt: string | null;
}

export interface Field {
  id: number;
  userId: number;
  status: FieldStatus;
  address: string;
  addressDetail: string;
  latitude: number;
  longitude: number;
}

export interface Visit {
  id: number;
  status: VisitStatus;
  tripId: number;
  fieldId: number;
  visitedAt: string;
}

export interface TextMemo {
  id: number;
  visitId: number | null;
  fieldId: number;
  content: string;
  latitude: number;
  longitude: number;
  createdAt: string;
}

export interface VoiceMemo {
  id: number;
  visitId: number | null;
  fieldId: number;
  content: string;
  latitude: number;
  longitude: number;
  createdAt: string;
}

export interface Photo {
  id: number;
  visitId: number | null;
  fieldId: number;
  fileUrl: string;
  latitude: number;
  longitude: number;
  createdAt: string;
}

export interface Report {
  id: number;
  creatorId: number;
  tripId: number;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null; // soft delete
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
