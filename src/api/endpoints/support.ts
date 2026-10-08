import { request } from '../client';

export type SupportCategory = '기능 문의' | '개선 제안' | '오류 제보' | '일반 문의';
export interface SupportInquiry {
  id: string;
  title: string;
  body: string;
  category: SupportCategory;
  date: string;
  status: '접수' | '처리 중' | '답변 완료';
  reply: string;
}
export interface SupportInquiryPage { items: SupportInquiry[]; total: number; page: number; limit: number }
export interface CreateSupportInquiry { title: string; body: string; category: SupportCategory; privacyAcknowledged: boolean }
export const support = {
  list: (page = 1) => request<SupportInquiryPage>('/api/support/inquiries', { query: { page, limit: 20 } }),
  create: (body: CreateSupportInquiry) => request<SupportInquiry>('/api/support/inquiries', { method: 'POST', body }),
};
