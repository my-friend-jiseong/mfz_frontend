import type { Place } from '../features/places/type';

export const mockPlaces: Place[] = [
  {
    id: 1,
    name: '가로등 점검 1',
    address: '부산 사하구 하단동 123-1',
    lat: 35.1066,
    lng: 128.9666,
    status: 'PENDING',
    memo: '현장 확인 필요',
    photos: [],
  },
  {
    id: 2,
    name: '불법투기 민원 지역',
    address: '부산 사하구 당리동 88-2',
    lat: 35.104,
    lng: 128.974,
    status: 'IN_PROGRESS',
    memo: '반복 민원 발생',
    photos: [],
  },
];