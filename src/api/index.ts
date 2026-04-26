export { API_BASE_URL } from './config';
export { ApiError, NetworkError } from './errors';
export { request, configureAuth } from './client';

export { auth } from './endpoints/auth';
export type { ApiUser, AuthSession, SignupBody, LoginBody } from './endpoints/auth';

export { trips } from './endpoints/trips';
export type {
  TripStartResponse,
  TripEndResponse,
  ActiveTripResponse,
  TripListResponse,
  TripListItem,
  TripDetailResponse,
  TripTimelineEntry,
} from './endpoints/trips';

export { visits } from './endpoints/visits';
export type { CheckInBody, CheckInResponse, VisitDetailResponse } from './endpoints/visits';

export { fields } from './endpoints/fields';
export type {
  FieldListItem,
  FieldListResponse,
  FieldDetailResponse,
  CreateFieldBody,
  CreateFieldResponse,
  AddressSearchResponse,
  ListMineParams,
} from './endpoints/fields';

export { reports } from './endpoints/reports';
export { map } from './endpoints/map';
export { system } from './endpoints/system';
export type { SessionPolicy } from './endpoints/system';
