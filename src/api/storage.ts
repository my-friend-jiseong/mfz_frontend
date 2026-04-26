import * as SecureStore from 'expo-secure-store';

// refresh 토큰 보관: iOS Keychain (AfterFirstUnlockThisDeviceOnly) / Android EncryptedSharedPreferences.
// 액세스 토큰은 메모리(authStore)에만 둔다 — 매 부팅 시 refresh → access 재발급.
//
// 웹(브라우저)은 expo-secure-store 미지원 → noop. 웹은 시연용으로만 사용하므로 자동 로그인 미지원 OK.

const KEY = 'mfz.refreshToken';

function isAvailable(): boolean {
  return typeof SecureStore.setItemAsync === 'function';
}

export async function saveRefreshToken(token: string): Promise<void> {
  if (!isAvailable()) return;
  try {
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
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function clearRefreshToken(): Promise<void> {
  if (!isAvailable()) return;
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // ignore
  }
}
