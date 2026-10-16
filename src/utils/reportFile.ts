import { Platform } from 'react-native';
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

export type FileResult = { ok: true } | { ok: false; cancelled?: boolean; error: string };

const FAIL = '파일을 받지 못했어요. 잠시 뒤 다시 해 주세요.';

/** 앱 캐시에 받아 둔다(네이티브). 같은 이름이면 덮어쓴다. */
async function downloadToCache(url: string, name: string): Promise<string | null> {
  const dir = FileSystem.cacheDirectory;
  if (!dir) return null;
  try {
    const res = await FileSystem.downloadAsync(url, `${dir}${encodeURIComponent(name)}`);
    return res.status >= 200 && res.status < 300 ? res.uri : null;
  } catch {
    return null;
  }
}

// --- 웹 ---
async function fetchBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

function webDownload(blob: Blob | null, url: string, name: string) {
  if (!blob) {
    // 다른 출처라 받지 못하면(CORS) 새 탭으로 연다 — 브라우저가 받거나 보여 준다.
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

/** 9-5 — 폰 공유 창. 웹은 공유 API 가 파일을 받으면 그걸로, 아니면 내려받기. */
export async function shareReportFile(url: string, name: string, format: ReportFileFormat): Promise<FileResult> {
  if (Platform.OS === 'web') {
    const blob = await fetchBlob(url);
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (blob && typeof File !== 'undefined' && nav.canShare) {
      const file = new File([blob], name, { type: MIME[format] });
      if (nav.canShare({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: name });
          return { ok: true };
        } catch (e) {
          if ((e as { name?: string })?.name === 'AbortError') return { ok: false, cancelled: true, error: '' };
        }
      }
    }
    webDownload(blob, url, name);
    return { ok: true };
  }
  const local = await downloadToCache(url, name);
  if (!local) return { ok: false, error: FAIL };
  if (!(await Sharing.isAvailableAsync())) return { ok: false, error: '이 기기에서는 공유 창을 열 수 없어요.' };
  try {
    await Sharing.shareAsync(local, { mimeType: MIME[format], UTI: UTI[format], dialogTitle: name });
    return { ok: true };
  } catch {
    return { ok: false, error: '공유 창을 열지 못했어요.' };
  }
}

/**
 * 9-15 — 휴대폰에 저장. Android 는 저장할 폴더를 고르게 하고(저장소 접근 프레임워크) 그 폴더에 쓴다.
 * iOS 는 앱이 공용 폴더에 바로 쓸 수 없어 공유 창의 '파일에 저장'으로 넘긴다. 웹은 브라우저 내려받기.
 */
export async function saveReportFile(url: string, name: string, format: ReportFileFormat): Promise<FileResult> {
  if (Platform.OS === 'web') {
    webDownload(await fetchBlob(url), url, name);
    return { ok: true };
  }
  const local = await downloadToCache(url, name);
  if (!local) return { ok: false, error: FAIL };
  if (Platform.OS === 'android') {
    const saf = FileSystem.StorageAccessFramework;
    try {
      const perm = await saf.requestDirectoryPermissionsAsync();
      if (!perm.granted) return { ok: false, cancelled: true, error: '' };
      const base = name.replace(/\.[^.]+$/, '');
      const target = await saf.createFileAsync(perm.directoryUri, base, MIME[format]);
      const data = await FileSystem.readAsStringAsync(local, { encoding: FileSystem.EncodingType.Base64 });
      await FileSystem.writeAsStringAsync(target, data, { encoding: FileSystem.EncodingType.Base64 });
      return { ok: true };
    } catch {
      return { ok: false, error: '휴대폰에 저장하지 못했어요.' };
    }
  }
  try {
    await Sharing.shareAsync(local, { mimeType: MIME[format], UTI: UTI[format], dialogTitle: name });
    return { ok: true };
  } catch {
    return { ok: false, error: '휴대폰에 저장하지 못했어요.' };
  }
}
