import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from './authStore';

// 보고서 '작성 완료' 대체 저장(백로그 '2차 개편 요청' B). 서버 Report 에 상태 칸이 없어 상태를 내용으로 계산하는데,
// 9-12 '1곳이 아직 비어 있어요' → [저장]은 빈 현장을 빈 채로 두고 작성 완료로 넘긴다(정책 v133).
// 그래서 그때 비어 있던 현장 보고 id 를 기기에 남겨 두고, 그 현장들은 작성 중 판정에서 뺀다.
// 그 뒤에 새로 붙은 빈 현장(9-14)은 목록에 없으니 다시 작성 중이 된다. 다른 기기에서는 작성 중으로 보인다(서버가 상태를 주면 지운다).
// 사용자마다 따로 둔다 — 로그인하면 그 사용자 것을 읽고, 로그아웃하면 메모리에서 비운다.

const keyOf = (userId: string) => `report-accepted-empty:v1:${userId}`;

interface State {
  userId: string | null;
  /** reportId → 저장할 때 비어 있어도 된다고 받아들인 현장 보고 id */
  accepted: Record<string, string[]>;
  accept: (reportId: string, fieldReportIds: string[]) => void;
  forget: (reportId: string) => void;
}

const persist = (userId: string | null, accepted: Record<string, string[]>) => {
  if (!userId) return;
  AsyncStorage.setItem(keyOf(userId), JSON.stringify(accepted)).catch(() => {
    // 저장 실패는 이번 실행 동안만 유지된다 — 다음 실행엔 작성 중으로 보일 뿐이다.
  });
};

export const useReportCompletionStore = create<State>((set, get) => ({
  userId: null,
  accepted: {},
  accept: (reportId, fieldReportIds) => {
    const accepted = { ...get().accepted, [reportId]: fieldReportIds };
    if (fieldReportIds.length === 0) delete accepted[reportId];
    set({ accepted });
    persist(get().userId, accepted);
  },
  forget: (reportId) => {
    if (!(reportId in get().accepted)) return;
    const { [reportId]: _gone, ...rest } = get().accepted;
    set({ accepted: rest });
    persist(get().userId, rest);
  },
}));

async function switchUser(userId: string | null) {
  if (useReportCompletionStore.getState().userId === userId) return;
  useReportCompletionStore.setState({ userId, accepted: {} });
  if (!userId) return;
  try {
    const raw = await AsyncStorage.getItem(keyOf(userId));
    const parsed = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    // 읽는 사이 사용자가 바뀌었으면 버린다. 읽는 사이 accept 된 것이 있으면 그것이 이긴다.
    if (useReportCompletionStore.getState().userId !== userId) return;
    useReportCompletionStore.setState((s) => ({ accepted: { ...parsed, ...s.accepted } }));
  } catch {
    // 못 읽으면 빈 채로 — 작성 중으로 보일 뿐이다.
  }
}

const currentUserId = () => {
  const a = useAuthStore.getState();
  return a.isAuthenticated ? (a.user?.id ?? null) : null;
};
void switchUser(currentUserId());
useAuthStore.subscribe(() => void switchUser(currentUserId()));
