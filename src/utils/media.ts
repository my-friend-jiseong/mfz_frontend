import { Alert, Linking, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

// ERD v2: 음성 메모 폐기 — 녹음·재생(expo-av) 유틸 제거. 사진/문서 첨부만 유지.

// 첨부 업로드 시 백엔드 multipart 가 받는 file 객체 형태.
// RN FormData 는 { uri, name, type } 객체를 받아 동작.
export type UploadFile = { uri: string; name: string; type: string };

function inferMime(uri: string, fallback: string): string {
  const m = uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  if (!m) return fallback;
  const ext = m[1].toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'heic') return 'image/heic';
  return fallback;
}

function basenameFromUri(uri: string, defaultName: string): string {
  const last = uri.split('/').pop() || '';
  return last.split('?')[0] || defaultName;
}

function openSettings() {
  // Linking.openSettings() 는 iOS/Android 둘 다 지원. ios 별도 'app-settings:' 분기 불필요.
  void Linking.openSettings();
}

/**
 * 카메라 또는 갤러리에서 사진 1장 선택. 권한 거부 시 Alert + 설정 이동 옵션.
 * 사용자가 취소하면 null 반환.
 */
export async function pickPhoto(source: 'camera' | 'library'): Promise<UploadFile | null> {
  const perm =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!perm.granted) {
    Alert.alert(
      source === 'camera' ? '카메라 권한 필요' : '사진 라이브러리 권한 필요',
      '설정에서 권한을 허용해주세요.',
      [
        { text: '취소', style: 'cancel' },
        { text: '설정 열기', onPress: openSettings },
      ],
    );
    return null;
  }

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
          exif: true,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
          exif: true,
        });

  if (result.canceled || !result.assets[0]) return null;

  const a = result.assets[0];
  const name = a.fileName ?? basenameFromUri(a.uri, `photo-${Date.now()}.jpg`);
  const type = a.mimeType ?? inferMime(a.uri, 'image/jpeg');
  return { uri: a.uri, name, type };
}

/**
 * 원격 URL 의 사진을 캐시 디렉토리에 다운로드해 multipart 업로드 가능한 UploadFile 로 변환.
 * RN FormData 가 https URL 을 직접 받기엔 OS 별 동작이 일관되지 않아 명시적 다운로드 후 file:// URI 로 보냄.
 * 실패 (네트워크/4xx/5xx) 시 null.
 */
export async function downloadToUploadFile(
  remoteUrl: string,
  hint: { name?: string; mime?: string } = {},
): Promise<UploadFile | null> {
  try {
    const mime = hint.mime ?? inferMime(remoteUrl, 'image/jpeg');
    const ext = mime.split('/')[1] ?? 'jpg';
    const filename = hint.name ?? `imported-${Date.now()}.${ext}`;
    const target = `${FileSystem.cacheDirectory ?? ''}${filename}`;
    const res = await FileSystem.downloadAsync(remoteUrl, target);
    if (res.status >= 400) return null;
    return { uri: res.uri, name: filename, type: mime };
  } catch {
    return null;
  }
}

/**
 * 사용자에게 카메라 vs 라이브러리 선택을 묻는 Alert.
 *
 * Web: react-native-web 의 Alert.alert 는 multi-button 선택을 제대로 처리하지
 * 않아 onPress 콜백이 호출되지 않음 → 사용자에게 무반응으로 보임.
 * Web 에서는 곧장 갤러리 선택으로 진행 (브라우저 file input).
 */
export function promptPhotoSource(onPick: (src: 'camera' | 'library') => void) {
  if (Platform.OS === 'web') {
    onPick('library');
    return;
  }
  Alert.alert('사진 첨부', '어떻게 첨부할까요?', [
    { text: '취소', style: 'cancel' },
    { text: '카메라', onPress: () => onPick('camera') },
    { text: '갤러리에서 선택', onPress: () => onPick('library') },
  ]);
}

/**
 * 일반 파일(문서 등) 선택. 사용자가 취소하면 null.
 */
export async function pickDocument(): Promise<UploadFile | null> {
  try {
    const res = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets?.[0]) return null;
    const a = res.assets[0];
    return {
      uri: a.uri,
      name: a.name ?? basenameFromUri(a.uri, 'file'),
      type: a.mimeType ?? inferMime(a.uri, 'application/octet-stream'),
    };
  } catch {
    return null;
  }
}
