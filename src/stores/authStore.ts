import { create } from 'zustand';
import type { User } from '@/types/entities';
import { mockUser } from '@/data/mockSeed';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => boolean;
  signup: (email: string, password: string, name: string) => boolean;
  logout: () => void;
}

// 프로토타입: in-memory 목업. 어떤 이메일/비번도 허용 (최소 형식만 체크)
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,

  login: (email, password) => {
    if (!email.includes('@') || password.length < 4) return false;
    set({
      user: mockUser,
      token: 'mock-token-' + Date.now(),
      isAuthenticated: true,
    });
    return true;
  },

  signup: (email, password, name) => {
    if (!email.includes('@') || password.length < 4 || !name) return false;
    set({
      user: { ...mockUser, id: Date.now() },
      token: 'mock-token-' + Date.now(),
      isAuthenticated: true,
    });
    return true;
  },

  logout: () => set({ user: null, token: null, isAuthenticated: false }),
}));
