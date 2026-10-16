import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { CheckinPhoto } from './visitRecord';

// 저장 대기열(checkinQueueStore)에 실은 사진 파일. 고른 사진은 앱 캐시에 있어 OS 가 지울 수 있다 —
// 대기열에 넣을 때 앱 문서 폴더로 옮겨 두고, 올렸거나 버리면 지운다.
// 웹은 파일 시스템이 없어 blob: 주소 그대로 둔다(페이지를 새로 고치면 사라진다 — 화면이 알린다).

const dir = () => (Platform.OS === 'web' || !FileSystem.documentDirectory ? null : `${FileSystem.documentDirectory}checkin-queue/`);

/** 대기열에 넣기 전에 사진 파일을 앱 문서 폴더로 복사한다. 실패한 것은 원래 경로를 그대로 쓴다. */
export async function keepQueuedPhotos(photos: CheckinPhoto[]): Promise<CheckinPhoto[]> {
  const base = dir();
  if (!base || !photos.some((p) => p.file)) return photos;
  await FileSystem.makeDirectoryAsync(base, { intermediates: true }).catch(() => undefined);
  const out: CheckinPhoto[] = [];
  for (const [i, p] of photos.entries()) {
    if (!p.file) {
      out.push(p);
      continue;
    }
    const to = `${base}${Date.now().toString(36)}-${i}-${p.file.name.replace(/[^\w.-]/g, '_')}`;
    try {
      await FileSystem.copyAsync({ from: p.file.uri, to });
      out.push({ ...p, uri: to, file: { ...p.file, uri: to } });
    } catch {
      out.push(p);
    }
  }
  return out;
}

/** 대기열이 갖고 있던 사진 파일을 지운다(올렸거나 버린 뒤). 대기열 폴더 밖의 파일은 건드리지 않는다. */
export function dropQueuedPhotos(photos: readonly CheckinPhoto[] | undefined): void {
  const base = dir();
  if (!base) return;
  for (const p of photos ?? []) {
    const uri = p.file?.uri ?? p.uri;
    if (uri.startsWith(base)) void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  }
}

/** 이 사진 파일이 아직 있는가. 모르면 true(일단 올려 본다). */
export async function queuedPhotoExists(p: CheckinPhoto): Promise<boolean> {
  if (!p.file) return true;
  if (Platform.OS === 'web') return !p.file.uri.startsWith('blob:') || (await fetch(p.file.uri).then(() => true, () => false));
  try {
    return (await FileSystem.getInfoAsync(p.file.uri)).exists;
  } catch {
    return true;
  }
}
