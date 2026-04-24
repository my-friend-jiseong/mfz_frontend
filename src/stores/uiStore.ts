import { create } from 'zustand';

interface UiState {
  sheetIndex: number;
  setSheetIndex: (i: number) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sheetIndex: 1,
  setSheetIndex: (i) => set({ sheetIndex: i }),
}));
