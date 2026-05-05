import { create } from 'zustand';

// 강제 로그아웃 / 세션 무효화 상황을 사용자에게 모달로 노출하기 위한 일회성 안내 store.
// authStore 의 refresh 분기에서 set, 모달에서 ack 시 clear.
//
// type:
//   - 'superseded': 다른 기기에서 새로 로그인됨. 로컬 토큰 무효.
//   - 'revoked': 보안상의 이유로 모든 세션 종료됨 (refresh reuse 감지 등).
export type SessionNoticeType = 'superseded' | 'revoked';

interface SessionGuardState {
  notice: { type: SessionNoticeType; message: string } | null;
  show: (type: SessionNoticeType, message: string) => void;
  ack: () => void;
}

export const useSessionGuardStore = create<SessionGuardState>((set) => ({
  notice: null,
  show: (type, message) => set({ notice: { type, message } }),
  ack: () => set({ notice: null }),
}));
