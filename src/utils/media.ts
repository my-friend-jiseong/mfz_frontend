import { Alert, Linking, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';

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

// 서버 multipart 검증(multer)이 허용하는 이미지 형식. content-type/확장자 둘 다
// 이 집합 밖이면 "JPEG/PNG/WebP/HEIC만 허용됩니다" 로 거부되므로 단일 출처로 정규화.
const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heic', // iOS HEIF 컨테이너 → 서버는 heic 로 인식
};
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};
const ALLOWED_MIME = new Set(Object.keys(EXT_BY_MIME));

function extOf(s: string): string {
  const m = s.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  return m ? m[1].toLowerCase() : '';
}

// 디바이스가 주는 mimeType 을 서버 허용 형식으로 정규화.
// 빈 문자열·image/heif·image/jpg 등 변형과, 확장자 없는 cache uri 를 모두 흡수.
// 허용 밖이면 파일명/URI 확장자로 추론, 그래도 모르면 jpeg.
function normalizeImageMime(
  rawMime: string | null | undefined,
  ...sources: (string | null | undefined)[]
): string {
  const m = (rawMime ?? '').toLowerCase().trim();
  if (ALLOWED_MIME.has(m)) return m;
  if (m === 'image/jpg') return 'image/jpeg';
  if (m === 'image/heif' || m === 'image/heic-sequence') return 'image/heic';
  for (const s of sources) {
    const byExt = MIME_BY_EXT[extOf(s ?? '')];
    if (byExt) return byExt;
  }
  return 'image/jpeg';
}

// 파일명에 mime 과 일치하는 확장자 보장 — 서버가 확장자로 검증하는 경우 대비
// (Expo Go picker uri 는 확장자 없는 경우가 있음).
function withMatchingExt(name: string, mime: string): string {
  const want = EXT_BY_MIME[mime] ?? 'jpg';
  const cur = extOf(name);
  if (cur && MIME_BY_EXT[cur] === mime) return name;
  const base = (name || 'photo').replace(/\.[a-zA-Z0-9]+$/, '') || 'photo';
  return `${base}.${want}`;
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
  // type 은 허용 형식으로 정규화, name 은 그 type 과 맞는 확장자를 보장 →
  // 서버가 content-type 으로 검증하든 확장자로 검증하든 통과.
  const type = normalizeImageMime(a.mimeType, a.fileName, a.uri);
  const rawName = a.fileName ?? basenameFromUri(a.uri, `photo-${Date.now()}.jpg`);
  const name = withMatchingExt(rawName, type);
  return { uri: a.uri, name, type };
}

/**
 * 현장에 이미 등록된 원격 사진을 보고서 슬롯에 재사용하기 위한 업로드 파일 변환.
 * (backend-backlog §9 phase 미머지 동안의 프론트 임시 대안 — 현장 사진을 슬롯으로 수동 불러오기.)
 *
 * web: appendUploadFile 의 web 분기가 원격 URL 을 fetch→blob 으로 처리하므로 URL 그대로 전달.
 * native: RN multipart serializer 는 file://·content:// uri 만 인식 → 원격 URL 은 직렬화 못 함.
 *         캐시 디렉터리로 다운로드해 로컬 file:// uri 를 만든 뒤 그걸 업로드.
 *
 * absoluteUrl 은 호출부에서 toAbsoluteFileUrl 로 절대화한 URL. 다운로드 실패 시 null.
 */
export async function remotePhotoToUploadFile(
  absoluteUrl: string,
): Promise<UploadFile | null> {
  const type = normalizeImageMime(undefined, absoluteUrl);
  const name = withMatchingExt(
    basenameFromUri(absoluteUrl, `field-photo-${Date.now()}.jpg`),
    type,
  );
  if (Platform.OS === 'web') {
    return { uri: absoluteUrl, name, type };
  }
  try {
    const dir = FileSystem.cacheDirectory ?? '';
    if (!dir) return null;
    const target = `${dir}field-photo-${Date.now()}.jpg`;
    const res = await FileSystem.downloadAsync(absoluteUrl, target);
    return { uri: res.uri, name, type };
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
