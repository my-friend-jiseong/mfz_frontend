import { Alert, Linking, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

// ERD v2: 음성 메모 폐기 — 녹음·재생(expo-av) 유틸 제거. 사진 첨부만 유지.

// 첨부 업로드 시 백엔드 multipart 가 받는 file 객체 형태.
export type UploadFile = { uri: string; name: string; type: string };

// multipart 파일 파트 append — 플랫폼 분기 단일 출처.
// RN FormData 는 { uri, name, type } 객체를 커스텀 serializer 가 인식해 uri 를 직접 파트로 박는다.
// web 의 표준 DOM FormData 는 Blob | File | string 만 받아, 객체를 그대로 append 하면
// String(obj) = "[object Object]" 가 들어가 백엔드가 "사진 파일이 필요합니다" 를 반환한다 →
// web 은 uri 를 fetch 해 진짜 Blob 으로 변환해 넣는다.
export async function appendUploadFile(
  fd: FormData,
  field: string,
  file: UploadFile,
): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = await fetch(file.uri).then((r) => r.blob());
    fd.append(field, blob, file.name);
  } else {
    fd.append(field, file as unknown as Blob);
  }
}

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
