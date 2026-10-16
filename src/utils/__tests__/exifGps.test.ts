// 8-7 사진 위치 읽기 단위 테스트. 실행: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base64ToBytes, exifDateToIso, metaFromJpeg, metaFromPickerExif, validLatLng } from '../exifGps';

// --- 테스트용 JPEG(SOI + APP1 Exif + 빈 SOS) 조립 ---
function buildJpeg(opts: { lat?: number; lng?: number; date?: string; offset?: string; be?: boolean }): Uint8Array {
  const be = !!opts.be;
  const bytes: number[] = [];
  const u16 = (v: number) => (be ? [(v >> 8) & 255, v & 255] : [v & 255, (v >> 8) & 255]);
  const u32 = (v: number) =>
    be ? [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255] : [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  const dms = (deg: number) => {
    const a = Math.abs(deg);
    const d = Math.floor(a);
    const m = Math.floor((a - d) * 60);
    const s = Math.round(((a - d) * 60 - m) * 60 * 10000);
    return [d, 1, m, 1, s, 10000];
  };
  // 레이아웃: header(8) · IFD0 · ExifIFD · GPSIFD · 데이터
  const hasGps = opts.lat !== undefined && opts.lng !== undefined;
  const ifd0Entries = 1 + (hasGps ? 1 : 0);
  const ifd0 = 8;
  const ifd0Size = 2 + ifd0Entries * 12 + 4;
  const exifIfd = ifd0 + ifd0Size;
  const exifEntries = 1 + (opts.offset ? 1 : 0);
  const exifSize = 2 + exifEntries * 12 + 4;
  const gpsIfd = exifIfd + exifSize;
  const gpsSize = hasGps ? 2 + 4 * 12 + 4 : 0;
  let data = gpsIfd + gpsSize;
  const tail: number[] = [];
  const put = (arr: number[]) => {
    const at = data;
    tail.push(...arr);
    data += arr.length;
    return at;
  };
  const tiff: number[] = [...(be ? [0x4d, 0x4d] : [0x49, 0x49]), ...u16(42), ...u32(ifd0)];
  const entry = (tag: number, type: number, count: number, valueOrOffset: number[]) => [...u16(tag), ...u16(type), ...u32(count), ...valueOrOffset];
  // IFD0
  tiff.push(...u16(ifd0Entries));
  tiff.push(...entry(0x8769, 4, 1, u32(exifIfd)));
  if (hasGps) tiff.push(...entry(0x8825, 4, 1, u32(gpsIfd)));
  tiff.push(...u32(0));
  // Exif IFD
  const dateStr = [...Buffer.from((opts.date ?? '2025:10:14 10:12:05') + '\0', 'ascii')];
  const dateAt = put(dateStr);
  tiff.push(...u16(exifEntries));
  tiff.push(...entry(0x9003, 2, dateStr.length, u32(dateAt)));
  if (opts.offset) {
    const offStr = [...Buffer.from(opts.offset + '\0', 'ascii')];
    const offAt = put(offStr);
    tiff.push(...entry(0x9011, 2, offStr.length, u32(offAt)));
  }
  tiff.push(...u32(0));
  if (hasGps) {
    const latAt = put(dms(opts.lat!).flatMap((x) => u32(x)));
    const lngAt = put(dms(opts.lng!).flatMap((x) => u32(x)));
    tiff.push(...u16(4));
    tiff.push(...entry(1, 2, 2, [(opts.lat! < 0 ? 'S' : 'N').charCodeAt(0), 0, 0, 0]));
    tiff.push(...entry(2, 5, 3, u32(latAt)));
    tiff.push(...entry(3, 2, 2, [(opts.lng! < 0 ? 'W' : 'E').charCodeAt(0), 0, 0, 0]));
    tiff.push(...entry(4, 5, 3, u32(lngAt)));
    tiff.push(...u32(0));
  }
  tiff.push(...tail);
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const len = app1.length + 2;
  bytes.push(0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0); // JFIF 자리(빈 APP0)
  bytes.push(0xff, 0xe1, (len >> 8) & 255, len & 255, ...app1);
  bytes.push(0xff, 0xda, 0, 2, 0xff, 0xd9);
  return Uint8Array.from(bytes);
}

const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-5;

test('JPEG Exif: GPS·촬영 시각(리틀 엔디언)', () => {
  const m = metaFromJpeg(buildJpeg({ lat: 35.1059, lng: 128.9668, date: '2025:10:14 10:12:05', offset: '+09:00' }));
  assert.ok(near(m.lat, 35.1059));
  assert.ok(near(m.lng, 128.9668));
  assert.equal(m.takenAt, '2025-10-14T01:12:05.000Z');
});

test('JPEG Exif: 빅 엔디언·남반구/서반구 부호', () => {
  const m = metaFromJpeg(buildJpeg({ lat: -33.8688, lng: -70.6693, be: true, offset: '-03:00' }));
  assert.ok(near(m.lat, -33.8688));
  assert.ok(near(m.lng, -70.6693));
  assert.equal(m.takenAt, '2025-10-14T13:12:05.000Z');
});

test('JPEG Exif: GPS 없으면 위치 null, 시각은 읽음', () => {
  const m = metaFromJpeg(buildJpeg({}));
  assert.equal(m.lat, null);
  assert.equal(m.lng, null);
  assert.ok(m.takenAt);
});

test('JPEG 가 아니거나 잘린 파일은 빈 값', () => {
  assert.deepEqual(metaFromJpeg(Uint8Array.from([0x89, 0x50, 0x4e, 0x47])), { lat: null, lng: null, takenAt: null });
  const full = buildJpeg({ lat: 35.1, lng: 129 });
  const cut = metaFromJpeg(full.subarray(0, 40));
  assert.equal(cut.lat, null);
  assert.deepEqual(metaFromJpeg(new Uint8Array()), { lat: null, lng: null, takenAt: null });
});

test('picker exif — iOS 모양', () => {
  const m = metaFromPickerExif({
    '{GPS}': { Latitude: 35.1059, LatitudeRef: 'N', Longitude: 128.9668, LongitudeRef: 'E' },
    '{Exif}': { DateTimeOriginal: '2025:10:14 10:12:05', OffsetTimeOriginal: '+09:00' },
  });
  assert.ok(near(m.lat, 35.1059));
  assert.ok(near(m.lng, 128.9668));
  assert.equal(m.takenAt, '2025-10-14T01:12:05.000Z');
});

test('picker exif — Android 모양(십진수·유리수 글·ref)', () => {
  const a = metaFromPickerExif({ GPSLatitude: 35.1059, GPSLongitude: 128.9668, DateTimeOriginal: '2025:10:14 10:12:05' });
  assert.ok(near(a.lat, 35.1059));
  const b = metaFromPickerExif({ GPSLatitude: '35/1,6/1,2124/100', GPSLatitudeRef: 'N', GPSLongitude: '128/1,58/1,0/1', GPSLongitudeRef: 'W' });
  assert.ok(near(b.lat, 35 + 6 / 60 + 21.24 / 3600));
  assert.ok(near(b.lng, -(128 + 58 / 60)));
  // 이미 음수인 십진수에 ref 가 S 여도 두 번 뒤집지 않는다.
  const c = metaFromPickerExif({ GPSLatitude: -33.5, GPSLatitudeRef: 'S', GPSLongitude: 151.2 });
  assert.ok(near(c.lat, -33.5));
});

test('picker exif — 위치 없음·0,0·이상한 값', () => {
  assert.equal(metaFromPickerExif(null).lat, null);
  assert.equal(metaFromPickerExif({ GPSLatitude: 0, GPSLongitude: 0 }).lat, null);
  assert.equal(metaFromPickerExif({ GPSLatitude: 'abc', GPSLongitude: 129 }).lat, null);
  assert.equal(metaFromPickerExif({ '{GPS}': {} }).lng, null);
});

test('exifDateToIso: 형식 오류는 null, 시간대 없으면 기기 시간대', () => {
  assert.equal(exifDateToIso('0000:00:00 00:00:00'), null);
  assert.equal(exifDateToIso(''), null);
  assert.equal(exifDateToIso(123), null);
  assert.equal(exifDateToIso('2025:10:14 10:12:05'), new Date(2025, 9, 14, 10, 12, 5).toISOString());
});

test('validLatLng', () => {
  assert.equal(validLatLng(35, 129), true);
  assert.equal(validLatLng(91, 129), false);
  assert.equal(validLatLng(null, 129), false);
});

test('base64ToBytes', () => {
  const src = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10, 0x45]);
  const b64 = Buffer.from(src).toString('base64');
  assert.deepEqual([...base64ToBytes(b64)], [...src]);
  assert.deepEqual([...base64ToBytes(Buffer.from([1, 2]).toString('base64'))], [1, 2]);
});
