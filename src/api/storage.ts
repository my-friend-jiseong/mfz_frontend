import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// refresh 토큰 보관:
// - 네이티브: iOS Keychain (AfterFirstUnlockThisDeviceOnly) / Android EncryptedSharedPreferences
// - 웹: localStorage (시연 환경에서 새로고침/hot reload 후에도 자동 로그인 유지)
// 액세스 토큰은 메모리(authStore)에만 둔다 — 매 부팅 시 refresh → access 재발급.

const KEY = 'mfz.refreshToken';
const isWeb = Platform.OS === 'web';

function hasWebStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function isAvailable(): boolean {
  if (isWeb) return hasWebStorage();
  return typeof SecureStore.setItemAsync === 'function';
}

export async function saveRefreshToken(token: string): Promise<void> {
  if (!isAvailable()) return;
  try {
    if (isWeb) {
      window.localStorage.setItem(KEY, token);
      return;
    }
    await SecureStore.setItemAsync(KEY, token, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  } catch {
    // 저장 실패해도 앱 동작은 계속 — 다음 부팅 시 재로그인만 필요해짐
  }
}

export async function loadRefreshToken(): Promise<string | null> {
  if (!isAvailable()) return null;
  try {
    if (isWeb) return window.localStorage.getItem(KEY);
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function clearRefreshToken(): Promise<void> {
  if (!isAvailable()) return;
  try {
    if (isWeb) {
      window.localStorage.removeItem(KEY);
      return;
    }
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // ignore
  }
}
