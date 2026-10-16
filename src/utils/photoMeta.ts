import { Platform } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { base64ToBytes, metaFromJpeg, metaFromPickerExif, type PhotoMeta } from './exifGps';

// Exif(APP1)는 JPEG 맨 앞 64KB 안에 있다. 썸네일이 큰 파일을 생각해 조금 더 읽는다.
const HEAD_BYTES = 128 * 1024;

async function readHead(uri: string): Promise<Uint8Array | null> {
  try {
    if (Platform.OS === 'web') {
      const blob = await fetch(uri).then((r) => r.blob());
      return new Uint8Array(await blob.slice(0, HEAD_BYTES).arrayBuffer());
    }
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      position: 0,
      length: HEAD_BYTES,
    });
    return base64ToBytes(b64);
  } catch {
    return null;
  }
}

/**
 * 고른 사진의 촬영 위치·시각(8-7). picker 가 준 exif → 없으면 파일 바이트(JPEG)를 직접 읽는다.
 * 웹은 picker 가 exif 를 주지 않아 파일에서만 읽는다. 시각을 모르면 파일 수정 시각(웹), 그것도 없으면 null.
 *
 * 안드로이드 10+ 는 앱에 ACCESS_MEDIA_LOCATION 이 없으면 사진의 위치를 지운 채 넘긴다(인수인계 §4, 실기기 확인).
 * 그때는 '위치 없음'으로 보여 지도에서 지정하게 된다.
 */
export async function readPhotoMeta(asset: ImagePickerAsset): Promise<PhotoMeta> {
  const fromExif = metaFromPickerExif(asset.exif);
  let meta = fromExif;
  if (meta.lat === null || meta.takenAt === null) {
    const head = await readHead(asset.uri);
    const fromFile = head ? metaFromJpeg(head) : null;
    if (fromFile) {
      meta = {
        lat: meta.lat ?? fromFile.lat,
        lng: meta.lat !== null ? meta.lng : fromFile.lng,
        takenAt: meta.takenAt ?? fromFile.takenAt,
      };
    }
  }
  if (!meta.takenAt) {
    const file = (asset as ImagePickerAsset & { file?: { lastModified?: number } }).file;
    if (file?.lastModified) meta = { ...meta, takenAt: new Date(file.lastModified).toISOString() };
  }
  return meta;
}
