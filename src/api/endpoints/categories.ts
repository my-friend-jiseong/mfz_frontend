import { request } from '../client';

// 사용자 커스텀 카테고리(분류) 마스터 리소스 — projects 패턴 복제 + 관리용 PATCH/DELETE.
// 현재 백엔드 미구현(backend-backlog): 프론트가 contract 를 선행 정의하고, categoryStore 가
// 서버 실패/404 시 AsyncStorage 로 graceful degrade 한다. 배포 후 store 소스만 서버로 스왑.
//   - GET /api/categories, POST /api/categories
//   - PATCH /api/categories/:categoryId, DELETE /api/categories/:categoryId

export interface CategoryItem {
  // projects 와 동일 컨벤션 — categoryId 키, 구버전 호환 id.
  categoryId: string;
  id?: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CategoryListResponse {
  items: CategoryItem[];
  pagination?: { page: number; limit: number; total: number; hasNext: boolean };
  emptyMessage?: string | null;
}

export interface CreateCategoryBody {
  name: string;
}

export interface UpdateCategoryBody {
  name: string;
}

export interface ListCategoriesParams {
  page?: number;
  limit?: number;
}

export const categories = {
  list: (params?: ListCategoriesParams) =>
    request<CategoryListResponse>('/api/categories', { query: params }),

  create: (body: CreateCategoryBody) =>
    request<CategoryItem>('/api/categories', { method: 'POST', body }),

  update: (categoryId: string, body: UpdateCategoryBody) =>
    request<CategoryItem>(`/api/categories/${categoryId}`, {
      method: 'PATCH',
      body,
    }),

  remove: (categoryId: string) =>
    request<void>(`/api/categories/${categoryId}`, { method: 'DELETE' }),
};
