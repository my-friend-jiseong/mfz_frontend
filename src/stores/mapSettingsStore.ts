import { create } from 'zustand';
import type { FieldStatus } from '@/types/entities';

// 지도 표시 설정 — 모든 지도 화면(외근·현장 탭, 스코프 상세)이 공유한다.
// 한 탭에서 히트맵으로 바꾸거나 필터를 걸면 다른 탭의 배경 지도도 동일하게 반영되도록,
// MapDashboard 의 로컬 useState 였던 표시 상태를 전역 store 로 끌어올렸다.
// (myLocation·마지막 뷰는 기기/세션 성격이라 store 밖 — geolocation·lastMapView 가 따로 관리.)

export type DisplayMode = 'markers' | 'heatmap' | 'choropleth';
export type BaseMapType = 'roadmap' | 'skyview' | 'hybrid';
export type RangePreset = 'all' | '30d' | '7d' | '1d';
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
  setRangePreset: (preset: RangePreset) => void;
  toggleTag: (tag: string) => void;
  toggleAttachment: (kind: AttachmentKind) => void;
  toggleBoundary: () => void;
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
}));
