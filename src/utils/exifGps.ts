// 사진 촬영 위치·시각 읽기(8-7 사진으로 여러 곳 등록).
// RN/expo import 없는 순수 모듈 — node 단위 테스트 대상(src/utils/__tests__/exifGps.test.ts).
//
// 두 경로를 받는다.
//  1) expo-image-picker 가 준 exif 객체(네이티브). 플랫폼마다 모양이 다르다:
//     iOS  { '{GPS}': { Latitude, LatitudeRef, Longitude, LongitudeRef }, '{Exif}': { DateTimeOriginal, OffsetTimeOriginal } }
//     Android { GPSLatitude: 35.1 (부호 있는 십진수) | '35/1,6/1,2112/100', GPSLatitudeRef, DateTimeOriginal, … }
//  2) 파일 바이트(JPEG APP1 Exif). 웹은 picker 가 exif 를 주지 않아 이쪽만 쓴다. HEIC 는 읽지 않는다.

export interface PhotoMeta {
  lat: number | null;
  lng: number | null;
  /** ISO 시각. 모르면 null. */
  takenAt: string | null;
}

const EMPTY: PhotoMeta = { lat: null, lng: null, takenAt: null };

/** 위경도가 쓸 만한가 — 0,0(위치 없음을 0 으로 채운 기기)과 범위 밖은 버린다. */
export function validLatLng(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  return !(lat === 0 && lng === 0);
}

/**
 * EXIF 시각 'YYYY:MM:DD HH:MM:SS' → ISO. offset('+09:00')이 있으면 그 시간대, 없으면 기기 시간대로 본다
 * (EXIF 시각은 찍은 곳의 벽시계 — 대부분 지금 기기와 같은 시간대).
 */
export function exifDateToIso(raw: unknown, offset?: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = raw.trim().match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  if (y < 1990 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const off = typeof offset === 'string' ? offset.trim().match(/^([+-])(\d{2}):?(\d{2})$/) : null;
  let t: number;
  if (off) {
    const sign = off[1] === '-' ? -1 : 1;
    const mins = sign * (Number(off[2]) * 60 + Number(off[3]));
    t = Date.UTC(y, mo - 1, d, h, mi, s) - mins * 60_000;
  } else {
    t = new Date(y, mo - 1, d, h, mi, s).getTime();
  }
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

// '35/1,6/1,2112/100' · '35/1 6/1 2112/100' · [35, 6, 21.12] · 35.1 → 도(양수 그대로, 부호는 ref 가 정한다).
function toDegrees(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (Array.isArray(v)) {
    const n = v.map((x) => (typeof x === 'number' ? x : typeof x === 'string' ? ratio(x) : NaN));
    if (n.length === 0 || n.some((x) => !Number.isFinite(x))) return null;
    return n[0] + (n[1] ?? 0) / 60 + (n[2] ?? 0) / 3600;
  }
  if (typeof v === 'string') {
    const parts = v.split(/[,\s]+/).filter(Boolean);
    if (parts.length === 1) {
      const x = ratio(parts[0]);
      return Number.isFinite(x) ? x : null;
    }
    return toDegrees(parts);
  }
  return null;
}

function ratio(s: string): number {
  const [a, b] = s.split('/');
  const n = Number(a);
  if (b === undefined) return n;
  const d = Number(b);
  return d === 0 ? NaN : n / d;
}

function signed(deg: number | null, ref: unknown, neg: 'S' | 'W'): number | null {
  if (deg === null) return null;
  const r = typeof ref === 'string' ? ref.trim().toUpperCase() : '';
  if (r === neg) return -Math.abs(deg);
  return deg;
}

type Dict = Record<string, unknown>;
const isDict = (v: unknown): v is Dict => !!v && typeof v === 'object' && !Array.isArray(v);

/** expo-image-picker asset.exif → 위치·시각. 모양을 모르면 빈 값. */
export function metaFromPickerExif(exif: unknown): PhotoMeta {
  if (!isDict(exif)) return EMPTY;
  const gps = isDict(exif['{GPS}']) ? (exif['{GPS}'] as Dict) : null;
  const ex = isDict(exif['{Exif}']) ? (exif['{Exif}'] as Dict) : null;
  const pick = (...keys: [Dict | null, string][]) => {
    for (const [o, k] of keys) if (o && o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
    return undefined;
  };
  const lat = signed(
    toDegrees(pick([gps, 'Latitude'], [gps, 'GPSLatitude'], [exif, 'GPSLatitude'], [exif, 'Latitude'])),
    pick([gps, 'LatitudeRef'], [gps, 'GPSLatitudeRef'], [exif, 'GPSLatitudeRef']),
    'S',
  );
  const lng = signed(
    toDegrees(pick([gps, 'Longitude'], [gps, 'GPSLongitude'], [exif, 'GPSLongitude'], [exif, 'Longitude'])),
    pick([gps, 'LongitudeRef'], [gps, 'GPSLongitudeRef'], [exif, 'GPSLongitudeRef']),
    'W',
  );
  const takenAt = exifDateToIso(
    pick([ex, 'DateTimeOriginal'], [exif, 'DateTimeOriginal'], [ex, 'DateTimeDigitized'], [exif, 'DateTime']),
    pick([ex, 'OffsetTimeOriginal'], [exif, 'OffsetTimeOriginal']),
  );
  const ok = validLatLng(lat, lng);
  return { lat: ok ? lat : null, lng: ok ? lng : null, takenAt };
}

// === JPEG 바이트 → Exif(APP1) ===

const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATETIME = 0x0132;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_OFFSET_TIME_ORIGINAL = 0x9011;
const GPS_LAT_REF = 1;
const GPS_LAT = 2;
const GPS_LNG_REF = 3;
const GPS_LNG = 4;
// 형식별 바이트 수(1 BYTE, 2 ASCII, 3 SHORT, 4 LONG, 5 RATIONAL, 7 UNDEFINED, 9 SLONG, 10 SRATIONAL).
const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

/** JPEG 파일 앞부분(Exif 는 보통 처음 64KB 안) → 위치·시각. JPEG 가 아니거나 Exif 가 없으면 빈 값. */
export function metaFromJpeg(bytes: Uint8Array): PhotoMeta {
  try {
    return readJpeg(bytes) ?? EMPTY;
  } catch {
    return EMPTY;
  }
}

function readJpeg(b: Uint8Array): PhotoMeta | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let p = 2;
  while (p + 4 <= b.length) {
    if (b[p] !== 0xff) return null;
    const marker = b[p + 1];
    // 채움 바이트(0xFF 연속)
    if (marker === 0xff) {
      p += 1;
      continue;
    }
    // 길이 없는 표지
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      p += 2;
      continue;
    }
    // 화상 데이터 시작 — 그 뒤로는 Exif 가 없다.
    if (marker === 0xda || marker === 0xd9) return null;
    const len = (b[p + 2] << 8) | b[p + 3];
    if (len < 2) return null;
    const start = p + 4;
    if (marker === 0xe1 && start + 6 <= b.length && isExifHeader(b, start)) {
      const tiffStart = start + 6;
      const end = Math.min(b.length, p + 2 + len);
      return readTiff(b.subarray(tiffStart, end));
    }
    p += 2 + len;
  }
  return null;
}

function isExifHeader(b: Uint8Array, at: number): boolean {
  // 'Exif\0\0'
  return b[at] === 0x45 && b[at + 1] === 0x78 && b[at + 2] === 0x69 && b[at + 3] === 0x66 && b[at + 4] === 0 && b[at + 5] === 0;
}

interface Entry {
  type: number;
  count: number;
  /** 값이 놓인 곳(4바이트 안이면 항목 안, 아니면 가리키는 곳). */
  at: number;
}

function readTiff(t: Uint8Array): PhotoMeta | null {
  if (t.length < 8) return null;
  const le = t[0] === 0x49 && t[1] === 0x49;
  const be = t[0] === 0x4d && t[1] === 0x4d;
  if (!le && !be) return null;
  const u16 = (o: number) => {
    if (o < 0 || o + 2 > t.length) throw new RangeError('exif');
    return le ? t[o] | (t[o + 1] << 8) : (t[o] << 8) | t[o + 1];
  };
  const u32 = (o: number) => {
    if (o < 0 || o + 4 > t.length) throw new RangeError('exif');
    return le
      ? (t[o] | (t[o + 1] << 8) | (t[o + 2] << 16) | (t[o + 3] << 24)) >>> 0
      : ((t[o] << 24) | (t[o + 1] << 16) | (t[o + 2] << 8) | t[o + 3]) >>> 0;
  };
  if (u16(2) !== 42) return null;

  const readIfd = (off: number): Map<number, Entry> => {
    const out = new Map<number, Entry>();
    if (off <= 0 || off + 2 > t.length) return out;
    const n = u16(off);
    for (let i = 0; i < n && i < 512; i++) {
      const e = off + 2 + i * 12;
      if (e + 12 > t.length) break;
      const tag = u16(e);
      const type = u16(e + 2);
      const count = u32(e + 4);
      const size = (TYPE_SIZE[type] ?? 0) * count;
      if (size === 0) continue;
      const at = size <= 4 ? e + 8 : u32(e + 8);
      if (at + size > t.length) continue;
      out.set(tag, { type, count, at });
    }
    return out;
  };
  const ascii = (e: Entry | undefined): string | null => {
    if (!e || e.type !== 2) return null;
    let s = '';
    for (let i = 0; i < e.count; i++) {
      const c = t[e.at + i];
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  };
  const rationals = (e: Entry | undefined): number[] | null => {
    if (!e || (e.type !== 5 && e.type !== 10)) return null;
    const out: number[] = [];
    for (let i = 0; i < e.count && i < 3; i++) {
      const o = e.at + i * 8;
      let num = u32(o);
      let den = u32(o + 4);
      if (e.type === 10) {
        num = num | 0;
        den = den | 0;
      }
      out.push(den === 0 ? NaN : num / den);
    }
    return out;
  };
  const pointer = (m: Map<number, Entry>, tag: number): number => {
    const e = m.get(tag);
    if (!e || (e.type !== 4 && e.type !== 3)) return 0;
    return e.type === 4 ? u32(e.at) : u16(e.at);
  };

  const ifd0 = readIfd(u32(4));
  const exifIfd = readIfd(pointer(ifd0, TAG_EXIF_IFD));
  const gpsIfd = readIfd(pointer(ifd0, TAG_GPS_IFD));

  const takenAt = exifDateToIso(
    ascii(exifIfd.get(TAG_DATETIME_ORIGINAL)) ?? ascii(ifd0.get(TAG_DATETIME)),
    ascii(exifIfd.get(TAG_OFFSET_TIME_ORIGINAL)) ?? undefined,
  );
  const lat = signed(toDegrees(rationals(gpsIfd.get(GPS_LAT))), ascii(gpsIfd.get(GPS_LAT_REF)), 'S');
  const lng = signed(toDegrees(rationals(gpsIfd.get(GPS_LNG))), ascii(gpsIfd.get(GPS_LNG_REF)), 'W');
  const ok = validLatLng(lat, lng);
  return { lat: ok ? lat : null, lng: ok ? lng : null, takenAt };
}

/** base64 → 바이트(네이티브에서 파일 앞부분을 base64 로 읽을 때). atob 에 기대지 않는다. */
export function base64ToBytes(b64: string): Uint8Array {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i + 1 < clean.length; i += 4) {
    const a = A.indexOf(clean[i]);
    const b = A.indexOf(clean[i + 1]);
    const c = i + 2 < clean.length ? A.indexOf(clean[i + 2]) : -1;
    const d = i + 3 < clean.length ? A.indexOf(clean[i + 3]) : -1;
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0 && o < out.length) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0 && o < out.length) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}
