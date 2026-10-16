// 체크인 화면(8 계열 · 3-7 방문 기록 수정) 주소. X 로 닫는 모달이라 루트 (modals) 스택의 /checkin 하나로 연다.
//   fieldId: 8 목적지(그 현장에 체크인)
//   mode=here: 8-6·7-7 '지금 위치 기록' — 100m 안 현장이 있으면 8-4, 없으면 8-3
//   visitId(+tripId): 3-7 방문 기록 수정

export const checkinHref = (fieldId: string) => ({ pathname: '/checkin', params: { fieldId } }) as const;

export const checkinHereHref = { pathname: '/checkin', params: { mode: 'here' } } as const;

export const visitEditHref = (visitId: string, tripId: string) =>
  ({ pathname: '/checkin', params: { visitId, tripId } }) as const;
