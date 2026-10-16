import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

// 9-5 공유 · 9-15 내려받기 — 서버가 만든 보고서 파일을 폰 공유 창으로 보내거나 휴대폰에 저장한다.
// 파일 주소는 인증 없이 열린다(기존 '다운로드'가 Linking.openURL 로 열던 것과 같다).

export type ReportFileFormat = 'docx' | 'pdf';

const MIME: Record<ReportFileFormat, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
};
const UTI: Record<ReportFileFormat, string> = {
  docx: 'org.openxmlformats.wordprocessingml.document',
  pdf: 'com.adobe.pdf',
};

/** 파일 이름으로 못 쓰는 글자를 뺀다. 비면 '보고서'. */
export function reportFileName(title: string, format: ReportFileFormat): string {
  const base = title.replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || '보고서';
  return `${base}.${format}`;
}

/**
 * 실패. fallback 이 있으면 안내 창의 [파일 열기]를 누른 그 순간에 부른다(웹: 사용자 동작 안에서만 새 탭·내려받기가 허용된다).
 */
export type FileResult = { ok: true } | { ok: false; cancelled?: boolean; error: string; fallback?: () => void };

const FAIL = '파일을 받지 못했어요. 잠시 뒤 다시 해 주세요.';

// === 네이티브 캐시 — 공유·저장에 넘길 파일을 잠깐 받아 둔다 ===
const cached = new Set<string>();

/** 받아 둔 파일을 지운다. 새로 내보내기 전에도 부른다(Android 공유는 받는 앱이 다 읽었는지 몰라 다음 번에 지운다). */
async function cleanupCache(only?: string) {
  const targets = only ? [only] : [...cached];
  for (const uri of targets) {
    cached.delete(uri);
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }
}

/** 앱 캐시에 받아 둔다(네이티브). 같은 이름이면 덮어쓴다. */
async function downloadToCache(url: string, name: string): Promise<string | null> {
  const dir = FileSystem.cacheDirectory;
  if (!dir) return null;
  await cleanupCache();
  try {
    const res = await FileSystem.downloadAsync(url, `${dir}${encodeURIComponent(name)}`);
    if (res.status < 200 || res.status >= 300) {
      await FileSystem.deleteAsync(res.uri, { idempotent: true }).catch(() => {});
      return null;
    }
    cached.add(res.uri);
    return res.uri;
  } catch {
    return null;
  }
}

// === 웹 ===
async function fetchBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

function webDownload(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

/** 웹에서 파일을 받지 못했을 때(다른 출처 CORS 등) — [파일 열기]로 새 탭에서 연다. */
const webOpenFallback = (url: string): FileResult => ({
  ok: false,
  error: '파일을 바로 받지 못했어요. [파일 열기]를 누르면 새 탭에서 열려요.',
  fallback: () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  },
});

/** 9-5 — 폰 공유 창. 웹은 공유 API 가 파일을 받으면 그걸로, 아니면 내려받기. */
export async function shareReportFile(url: string, name: string, format: ReportFileFormat): Promise<FileResult> {
  if (Platform.OS === 'web') {
    const blob = await fetchBlob(url);
    if (!blob) return webOpenFallback(url);
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    const file = typeof File !== 'undefined' ? new File([blob], name, { type: MIME[format] }) : null;
    if (file && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: name });
        return { ok: true };
      } catch (e) {
        if ((e as { name?: string })?.name === 'AbortError') return { ok: false, cancelled: true, error: '' };
        // 파일을 받는 사이 사용자 동작이 끝나 막혔다(NotAllowedError 등) — [파일 열기]로 내려받는다.
        return {
          ok: false,
          error: '공유 창을 열지 못했어요. [파일 열기]를 누르면 내려받아요.',
          fallback: () => webDownload(blob, name),
        };
      }
    }
    webDownload(blob, name);
    return { ok: true };
  }
  const local = await downloadToCache(url, name);
  if (!local) return { ok: false, error: FAIL };
  if (!(await Sharing.isAvailableAsync())) return { ok: false, error: '이 기기에서는 공유 창을 열 수 없어요.' };
  try {
    // shareAsync 는 보내기·취소 모두 그냥 끝난다(iOS 는 공유 창이 닫힐 때, 취소를 따로 알려 주지 않는다) — 둘 다 성공으로 본다.
    await Sharing.shareAsync(local, { mimeType: MIME[format], UTI: UTI[format], dialogTitle: name });
    // iOS 는 공유 창이 닫힌 뒤라 지워도 된다. Android 는 받는 앱이 아직 읽는 중일 수 있어 다음 내보내기 때 지운다.
    if (Platform.OS === 'ios') await cleanupCache(local);
    return { ok: true };
  } catch {
    return { ok: false, error: '공유 창을 열지 못했어요.' };
  }
}

const SAVE_DIR_KEY = 'report-save-dir:v1';

/**
 * Android — 저장할 폴더를 고르게 하고(저장소 접근 프레임워크) 그 폴더에 복사한다. 지난번 고른 폴더에서 고르기를 연다.
 * 새 파일 API(File.copy)로 옮겨 base64 로 통째로 읽고 쓰지 않는다. 복사가 안 되는 기기면 바이트로 쓴다.
 */
async function saveAndroid(local: string, name: string, format: ReportFileFormat): Promise<FileResult> {
  const { Directory, File } = await import('expo-file-system');
  const initial = (await AsyncStorage.getItem(SAVE_DIR_KEY).catch(() => null)) ?? undefined;
  let dir: Awaited<ReturnType<typeof Directory.pickDirectoryAsync>>;
  try {
    dir = await Directory.pickDirectoryAsync(initial);
  } catch {
    // 고르기를 닫았다.
    return { ok: false, cancelled: true, error: '' };
  }
  void AsyncStorage.setItem(SAVE_DIR_KEY, dir.uri).catch(() => {});
  try {
    const dest = dir.createFile(name.replace(/\.[^.]+$/, ''), MIME[format]);
    const src = new File(local);
    try {
      src.copy(dest);
    } catch {
      dest.write(await src.bytes());
    }
    return { ok: true };
  } catch {
    return { ok: false, error: '휴대폰에 저장하지 못했어요.' };
  }
}

/**
 * 9-15 — 휴대폰에 저장. Android 는 고른 폴더에 쓴다. iOS 는 앱이 공용 폴더에 바로 쓸 수 없어 공유 창의 '파일에 저장'으로
 * 넘긴다. 웹은 브라우저 내려받기.
 */
export async function saveReportFile(url: string, name: string, format: ReportFileFormat): Promise<FileResult> {
  if (Platform.OS === 'web') {
    const blob = await fetchBlob(url);
    if (!blob) return webOpenFallback(url);
    webDownload(blob, name);
    return { ok: true };
  }
  const local = await downloadToCache(url, name);
  if (!local) return { ok: false, error: FAIL };
  if (Platform.OS === 'android') {
    const r = await saveAndroid(local, name, format);
    await cleanupCache(local);
    return r;
  }
  try {
    // iOS: 공유 창이 닫힐 때 끝난다('파일에 저장'·취소 구분 없음).
    await Sharing.shareAsync(local, { mimeType: MIME[format], UTI: UTI[format], dialogTitle: name });
    await cleanupCache(local);
    return { ok: true };
  } catch {
    await cleanupCache(local);
    return { ok: false, error: '휴대폰에 저장하지 못했어요.' };
  }
}
