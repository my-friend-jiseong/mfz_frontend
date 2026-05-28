import { request } from '../client';

// ERD v2 신규 — 사용자별 프로젝트. 현장이 선택적으로 소속 (fields.project_id).
//   - GET /api/projects (페이지네이션), POST /api/projects, GET /api/projects/:projectId
//   - status enum 값은 §8 확인 대상.

export interface ProjectItem {
  // 백엔드 v2 는 projectId 키 사용 (fields 의 fieldId 와 동일 컨벤션). id 는 구버전 호환.
  projectId: string;
  id?: string;
  name: string;
  status: string;
  fieldCount?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface ProjectListResponse {
  items: ProjectItem[];
  pagination: { page: number; limit: number; total: number; hasNext: boolean };
  emptyMessage?: string | null;
}

export interface CreateProjectBody {
  name: string;
  status?: string;
}

export interface ListProjectsParams {
  page?: number;
  limit?: number;
}

export const projects = {
  list: (params?: ListProjectsParams) =>
    request<ProjectListResponse>('/api/projects', { query: params }),

  detail: (projectId: string) =>
    request<ProjectItem>(`/api/projects/${projectId}`),

  // 참고: 생성/목록 응답 모두 projectId 키 (검증 2026-05-28).

  create: (body: CreateProjectBody) =>
    request<ProjectItem>('/api/projects', { method: 'POST', body }),
};
