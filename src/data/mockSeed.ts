import type { Trip, Field, Visit, Report, TextMemo, Photo, VoiceMemo } from '@/types/entities';

// 시연용 in-memory 시드. 백엔드 ID 패턴 모방(string).
// 사용자(User) 는 실 인증 흐름에서 백엔드가 제공하므로 시드 불필요.

// 부산·대구 실좌표 기반 시드 현장 6개
export const mockFields: Field[] = [
  {
    id: 'field-1',
    userId: 'user-1',
    status: 'in_progress',
    address: '부산광역시 해운대구 우동',
    addressDetail: '해운대해수욕장 입구',
    latitude: 35.1587,
    longitude: 129.1603,
  },
  {
    id: 'field-2',
    userId: 'user-1',
    status: 'pending',
    address: '부산광역시 서면 부전동',
    addressDetail: '서면역 2번 출구',
    latitude: 35.1577,
    longitude: 129.0593,
  },
  {
    id: 'field-3',
    userId: 'user-1',
    status: 'done',
    address: '부산광역시 중구 광복동',
    addressDetail: '광복로 문화의거리',
    latitude: 35.1006,
    longitude: 129.0348,
  },
  {
    id: 'field-4',
    userId: 'user-1',
    status: 'pending',
    address: '대구광역시 중구 동성로',
    addressDetail: '동성로 패션거리 입구',
    latitude: 35.8696,
    longitude: 128.5953,
  },
  {
    id: 'field-5',
    userId: 'user-1',
    status: 'in_progress',
    address: '대구광역시 수성구 두산동',
    addressDetail: '수성못 인근',
    latitude: 35.8276,
    longitude: 128.6222,
  },
  {
    id: 'field-6',
    userId: 'user-1',
    status: 'pending',
    address: '부산광역시 금정구 장전동',
    addressDetail: '부산대학교 정문 앞',
    latitude: 35.2323,
    longitude: 129.0842,
  },
];

export const mockTrips: Trip[] = [
  {
    id: 'trip-101',
    workerId: 'user-1',
    startedAt: '2026-04-20T09:00:00Z',
    endedAt: '2026-04-20T17:30:00Z',
  },
  {
    id: 'trip-102',
    workerId: 'user-1',
    startedAt: '2026-04-22T08:30:00Z',
    endedAt: '2026-04-22T16:00:00Z',
  },
];

export const mockReports: Report[] = [
  {
    id: 'report-5001',
    creatorId: 'user-1',
    tripId: 'trip-101',
    title: '4/20 해운대·서면 외근 최종 보고',
    content:
      '해운대 입구 현장(#3)에서 정기 점검을 완료했으며, 서면역 2번출구 현장(#2)은 수취인 부재로 재방문 예정. 다음 회차에 두 건 모두 재확인 필요.',
    createdAt: '2026-04-20T18:00:00Z',
    updatedAt: null,
    deletedAt: null,
  },
  {
    id: 'report-5002',
    creatorId: 'user-1',
    tripId: 'trip-101',
    title: '4/20 특이사항 별지',
    content:
      '광복동 현장(#3)의 인접 주차 여건이 개선되어 차후 외근 시 도보 이동거리 단축 가능. 운영팀 공유 필요.',
    createdAt: '2026-04-20T18:20:00Z',
    updatedAt: null,
    deletedAt: null,
  },
];

export const mockTextMemos: TextMemo[] = [
  {
    id: 'memo-3001',
    visitId: 'visit-1001',
    fieldId: 'field-3',
    content: '문 앞에 안내문 부착 완료. 다음 방문 시 서명 수령 예정.',
    latitude: 35.1006,
    longitude: 129.0348,
    createdAt: '2026-04-20T10:20:00Z',
  },
  {
    id: 'memo-3002',
    visitId: 'visit-1004',
    fieldId: 'field-5',
    content: '현장 진입로 공사 중 — 차량 우회 필요. 다음 방문 전 전화 확인 요망.',
    latitude: 35.8276,
    longitude: 128.6222,
    createdAt: '2026-04-22T14:25:00Z',
  },
];

export const mockPhotos: Photo[] = [
  {
    id: 'photo-4001',
    visitId: 'visit-1001',
    fieldId: 'field-3',
    fileUrl: 'https://placehold.co/400x300?text=광복동+현장',
    latitude: 35.1006,
    longitude: 129.0348,
    createdAt: '2026-04-20T10:25:00Z',
  },
  {
    id: 'photo-4002',
    visitId: 'visit-1003',
    fieldId: 'field-4',
    fileUrl: 'https://placehold.co/400x300?text=동성로+현장',
    latitude: 35.8696,
    longitude: 128.5953,
    createdAt: '2026-04-22T10:10:00Z',
  },
];

export const mockVoiceMemos: VoiceMemo[] = [
  {
    id: 'voice-4501',
    visitId: 'visit-1003',
    fieldId: 'field-4',
    content: 'voice-mock.m4a',
    latitude: 35.8696,
    longitude: 128.5953,
    createdAt: '2026-04-22T10:12:00Z',
  },
];

export const mockVisits: Visit[] = [
  {
    id: 'visit-1001',
    status: '완료',
    tripId: 'trip-101',
    fieldId: 'field-3',
    visitedAt: '2026-04-20T10:15:00Z',
  },
  {
    id: 'visit-1002',
    status: '부재',
    tripId: 'trip-101',
    fieldId: 'field-2',
    visitedAt: '2026-04-20T13:40:00Z',
  },
  {
    id: 'visit-1003',
    status: '완료',
    tripId: 'trip-102',
    fieldId: 'field-4',
    visitedAt: '2026-04-22T10:00:00Z',
  },
  {
    id: 'visit-1004',
    status: '재방문필요',
    tripId: 'trip-102',
    fieldId: 'field-5',
    visitedAt: '2026-04-22T14:20:00Z',
  },
];
