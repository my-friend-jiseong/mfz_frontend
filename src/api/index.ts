export { API_BASE_URL } from './config';
export { ApiError, NetworkError, localizeError, errorCode, applyFieldErrors } from './errors';
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
  OptimizeNavigationBody,
  OptimizeNavigationResponse,
  OptimizedOrderItem,
  GeofenceRegisterBody,
  GeofenceRegisterResponse,
  GeofenceArrivalBody,
  GeofenceArrivalResponse,
  NavigationDeepLinksBody,
  NavigationDeepLinksResponse,
  TripStateTransition,
  TripStateHistoryListItem,
  StateHistoryResponse,
  OptimizePreviewBody,
  OptimizePreviewResponse,
  OfficialNoticeBody,
} from './endpoints/trips';

export { visits } from './endpoints/visits';
export type { CheckInBody, CheckInResponse, VisitDetailResponse } from './endpoints/visits';

export { fields } from './endpoints/fields';
export type {
  FieldListItem,
  FieldListResponse,
  FieldDetailResponse,
  FieldDirectAttachment,
  RecentVisitItem,
  CreateFieldBody,
  CreateFieldResponse,
  UpdateFieldBody,
  PatchStatusResponse,
  FieldTextMemoResponse,
  AddressSearchResponse,
  AddressSearchItem,
  ListMineParams,
} from './endpoints/fields';

export { reports } from './endpoints/reports';
export type {
  ReportListItem,
  ReportListResponse,
  ReportDetailResponse,
  ReportCreateData,
  CreateReportBody,
  UpdateReportBody,
  ListReportsParams,
  ShareReportData,
  DisableShareData,
  ReportGenerateData,
  ReportAnalysis,
} from './endpoints/reports';
export { map } from './endpoints/map';
export { system } from './endpoints/system';
export type { SessionPolicy, SessionActivityResponse } from './endpoints/system';
