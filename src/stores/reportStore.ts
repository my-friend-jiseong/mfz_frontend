import { create } from 'zustand';
import type { Report } from '@/types/entities';
import { mockReports } from '@/data/mockSeed';

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
  reports: [...mockReports],

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
