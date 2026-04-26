import { create } from 'zustand';
import type { Report } from '@/types/entities';

// 백엔드는 현재 POST /api/reports/generate (Gemini AI 자동 생성·Word 출력) 만 제공.
// 목록(GET /api/reports) · 상세 · 수정 · 삭제는 미구현.
// → 시연 흐름 유지를 위해 reportStore 는 당분간 in-memory 로 동작.
//   백엔드 CRUD 추가 시 다른 store 들과 동일 패턴(API 호출 + async 결과 객체)으로 전환.

interface ReportState {
  reports: Report[];
  create: (input: {
    creatorId: string;
    tripId: string;
    title: string;
    content: string;
  }) => Report;
  update: (
    id: string,
    patch: Partial<Pick<Report, 'title' | 'content'>>,
  ) => void;
  remove: (id: string) => void; // soft delete
}

let nextLocalSeq = 6000;

export const useReportStore = create<ReportState>((set) => ({
  // 시드 제거. 작성 시 in-memory 로만 추가됨 — 앱 재시작 시 초기화됨.
  reports: [],

  create: ({ creatorId, tripId, title, content }) => {
    const now = new Date().toISOString();
    const report: Report = {
      id: `report-local-${++nextLocalSeq}`,
      creatorId,
      tripId,
      title,
      content,
      createdAt: now,
      updatedAt: null,
      deletedAt: null,
    };
    set((state) => ({ reports: [...state.reports, report] }));
    return report;
  },

  update: (id, patch) =>
    set((state) => ({
      reports: state.reports.map((r) =>
        r.id === id
          ? { ...r, ...patch, updatedAt: new Date().toISOString() }
          : r,
      ),
    })),

  remove: (id) =>
    set((state) => ({
      reports: state.reports.map((r) =>
        r.id === id ? { ...r, deletedAt: new Date().toISOString() } : r,
      ),
    })),
}));
