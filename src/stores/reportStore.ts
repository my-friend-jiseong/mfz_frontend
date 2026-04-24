import { create } from 'zustand';
import type { Report } from '@/types/entities';
import { mockReports } from '@/data/mockSeed';

interface ReportState {
  reports: Report[];
  create: (input: {
    creatorId: number;
    tripId: number;
    title: string;
    content: string;
  }) => Report;
  update: (
    id: number,
    patch: Partial<Pick<Report, 'title' | 'content'>>,
  ) => void;
  remove: (id: number) => void; // soft delete
}

let nextId = 6000;

export const useReportStore = create<ReportState>((set) => ({
  reports: [...mockReports],

  create: ({ creatorId, tripId, title, content }) => {
    const now = new Date().toISOString();
    const report: Report = {
      id: ++nextId,
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
