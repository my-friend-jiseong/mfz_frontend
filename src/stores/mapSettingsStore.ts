import { create } from 'zustand';
import type { FieldStatus } from '@/types/entities';

// 지도 표시 설정 — 모든 지도 화면(외근·현장 탭, 스코프 상세)이 공유한다.
// 한 탭에서 히트맵으로 바꾸거나 필터를 걸면 다른 탭의 배경 지도도 동일하게 반영되도록,
// MapDashboard 의 로컬 useState 였던 표시 상태를 전역 store 로 끌어올렸다.
// (myLocation·마지막 뷰는 기기/세션 성격이라 store 밖 — geolocation·lastMapView 가 따로 관리.)

export type DisplayMode = 'markers' | 'heatmap' | 'choropleth';
export type BaseMapType = 'roadmap' | 'skyview' | 'hybrid';
// 1-3 '최근 방문일': 전체 / 1주 / 1달 / 3달.
export type RangePreset = 'all' | '7d' | '30d' | '90d';
export const RANGE_DAYS: Record<Exclude<RangePreset, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 };
export type AttachmentKind = 'text' | 'photo';
export type VisibleAttachments = Record<AttachmentKind, boolean>;

interface MapSettingsState {
  displayMode: DisplayMode;
  baseMapType: BaseMapType;
  selectedStatuses: FieldStatus[];
  rangePreset: RangePreset;
  selectedTags: string[];
  visibleAttachments: VisibleAttachments;
  showBoundary: boolean;

  setDisplayMode: (mode: DisplayMode) => void;
  setBaseMapType: (type: BaseMapType) => void;
  toggleStatus: (status: FieldStatus) => void;
  /** 빈 배열 = 전체. 1-3 칩은 '보이는 상태'를 고르므로 셋 다 고르면 빈 배열로 둔다. */
  setStatuses: (statuses: FieldStatus[]) => void;
  setRangePreset: (preset: RangePreset) => void;
  toggleTag: (tag: string) => void;
  toggleAttachment: (kind: AttachmentKind) => void;
  toggleBoundary: () => void;
  /** 1-3 [초기화] — 표시 방식·배경 지도·필터를 처음으로. */
  reset: () => void;
}

export const useMapSettingsStore = create<MapSettingsState>((set) => ({
  displayMode: 'markers',
  baseMapType: 'roadmap',
  selectedStatuses: [],
  rangePreset: 'all',
  selectedTags: [],
  visibleAttachments: { text: true, photo: true },
  showBoundary: false,

  setDisplayMode: (mode) => set({ displayMode: mode }),
  setBaseMapType: (type) => set({ baseMapType: type }),
  toggleStatus: (status) =>
    set((s) => ({
      selectedStatuses: s.selectedStatuses.includes(status)
        ? s.selectedStatuses.filter((x) => x !== status)
        : [...s.selectedStatuses, status],
    })),
  setStatuses: (statuses) => set({ selectedStatuses: statuses }),
  setRangePreset: (preset) => set({ rangePreset: preset }),
  toggleTag: (tag) =>
    set((s) => ({
      selectedTags: s.selectedTags.includes(tag)
        ? s.selectedTags.filter((x) => x !== tag)
        : [...s.selectedTags, tag],
    })),
  toggleAttachment: (kind) =>
    set((s) => ({
      visibleAttachments: { ...s.visibleAttachments, [kind]: !s.visibleAttachments[kind] },
    })),
  toggleBoundary: () => set((s) => ({ showBoundary: !s.showBoundary })),
  reset: () =>
    set({
      displayMode: 'markers',
      baseMapType: 'roadmap',
      selectedStatuses: [],
      rangePreset: 'all',
      selectedTags: [],
      showBoundary: false,
    }),
}));
