import { create } from 'zustand';

// 아직 서버에 없는 새 현장(8-3 체크인 · 새 현장)의 입력값. 체크인 화면과 위치 보정 모달(5-5 field-edit?draft=)이
// 같은 값을 고친다 — 라우트 인자로 넘기기엔 크고, 모달이 닫힌 뒤 체크인 화면이 바뀐 값을 바로 보아야 해서 스토어에 둔다.
// 체크인 화면이 닫히면 지운다. 기기에 남기지 않는다(앱을 다시 켜면 체크인도 새로 시작).

export interface FieldDraft {
  /** 비우면 주소가 이름이 된다(인수인계 '현장명: 기본값은 주소'). */
  name: string;
  detail: string;
  categories: string[];
  /** 분류를 마지막으로 고친 때 — 저장할 때 그 뒤에 끝난 이름 변경·삭제만 맞춘다(categoryCascade). */
  categoriesAt: number;
  projectId: string | null;
  projectName: string | null;
  road: string;
  jibun: string;
  sido?: string;
  sigungu?: string;
  lat: number;
  lng: number;
  /** 이 좌표의 주소를 찾지 못했다(역지오코딩 빈 결과·시간 초과) — '확인하고 있어요'에 머물지 않는다. */
  addrMissing?: boolean;
  /** 위치 보정으로 옮겼으면 true — GPS 오차 원·경고를 더 보이지 않는다. */
  moved: boolean;
}

interface FieldDraftState {
  drafts: Record<string, FieldDraft>;
  put: (key: string, draft: FieldDraft) => void;
  patch: (key: string, patch: Partial<FieldDraft>) => void;
  remove: (key: string) => void;
}

export const useFieldDraftStore = create<FieldDraftState>((set) => ({
  drafts: {},
  put: (key, draft) => set((s) => ({ drafts: { ...s.drafts, [key]: draft } })),
  patch: (key, patch) =>
    set((s) => (s.drafts[key] ? { drafts: { ...s.drafts, [key]: { ...s.drafts[key], ...patch } } } : s)),
  remove: (key) =>
    set((s) => {
      if (!s.drafts[key]) return s;
      const { [key]: _gone, ...rest } = s.drafts;
      return { drafts: rest };
    }),
}));
