// 발표용 스크린샷 부분 재캡처 (Playwright) — 2026-06-06 단일 화면 전환 이후분만.
//
//   교체: 11_field_edit · 12_field_new · 13_field_new_place · 14_field_new_pin (구버전 단계식 UI)
//   신규: 23_quick_photo (빠른 촬영 매칭 시트) · 24_report_field_edit (현장 보고 전·중·후 편집)
//
//   사전: Expo web 이 localhost:8081 에서 떠 있어야 함  (CI=1 npx expo start --web --port 8081)
//   실행: QA_PW=<demo2 비밀번호> node docs/presentation/recapture_screens.mjs
//   결과: docs/presentation/screenshots/NN_*.png (기존 번호 덮어쓰기)
//
// capture_screens.mjs 와 같은 골격. 차이: ① 지오로케이션을 시드 현장 좌표로 부여(빠른 촬영
// 최근접 매칭 + 등록 화면 자동 측위), ② filechooser 로 '촬영'을 파일 선택으로 대체.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const WEB = process.env.QA_BASE ?? 'http://localhost:8081';
const API = process.env.SEED_BASE ?? 'https://ilgayo.co.kr';
// 공개 리포 — 자격증명은 env 로만 받는다. 하드코딩 금지.
const EMAIL = process.env.QA_EMAIL ?? 'demo2@ilgayo.co.kr';
const PW = process.env.QA_PW;
if (!PW) {
  console.error('✖ QA_PW 환경변수가 필요합니다. (발표용 테스트 계정 비밀번호)');
  process.exit(1);
}
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'screenshots');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

let TOKEN = null;
async function api(p, { method = 'GET', body, auth = true } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (auth && TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(API + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await res.text();
  let d = null; if (t) { try { d = JSON.parse(t); } catch { d = t; } }
  return { ok: res.ok, status: res.status, data: d };
}

async function main() {
  // 0) API 로그인 + ID·좌표 수집
  const lr = await api('/auth/login', { method: 'POST', auth: false, body: { email: EMAIL, password: PW } });
  if (!lr.ok) { console.error('API 로그인 실패', lr.status, JSON.stringify(lr.data)); process.exit(1); }
  TOKEN = lr.data.accessToken;
  const fields = (await api('/api/fields/mine?visitDateScope=all&limit=200')).data?.items ?? [];
  const reports = (await api('/api/reports?limit=200')).data?.items ?? [];
  const fieldEditId = (fields.find((f) => f.status === 'pending') ?? fields[0])?.fieldId;
  // 빠른 촬영 매칭 기준점 — 첫 현장 좌표를 그대로 브라우저 지오로케이션으로.
  const geoField = fields.find((f) => Number.isFinite(f.lat) && Number.isFinite(f.lng)) ?? null;
  if (!geoField) { console.error('좌표 있는 현장이 없습니다 — 시드 먼저 실행'); process.exit(1); }
  // 현장 보고 편집 — fieldReports 가 있는 보고서. 테스트성 제목은 거르고,
  // 사진이 실제로 채워진 fr 우선 (hero 컷 품질).
  let reportEditTarget = null;
  for (const r of reports) {
    if (/테스트|test|ㅁㄴㅇ/i.test(r.title ?? '')) continue;
    const det = (await api('/api/reports/' + r.reportId)).data;
    const frs = det?.fieldReports ?? [];
    const fr = frs.find((f) => f.beforePhotoUrl || f.pendingPhotoUrl || f.afterPhotoUrl) ?? frs[0];
    if (fr) { reportEditTarget = { reportId: r.reportId, frId: fr.id }; break; }
  }
  console.log(`수집: edit=${fieldEditId} geo=(${geoField.lat},${geoField.lng}) reportEdit=${JSON.stringify(reportEditTarget)}`);

  // '촬영' 파일 — 현장 사진이 서버에 있으면 받아서 쓰고, 없으면 기존 캡처 PNG 재사용.
  let photoPath = path.join(OUT, '10_field_detail.png');
  try {
    const det = (await api('/api/fields/' + geoField.fieldId)).data;
    const url = det?.photos?.[0]?.fileUrl;
    if (url) {
      const abs = url.startsWith('http') ? url : API + url;
      const buf = Buffer.from(await (await fetch(abs)).arrayBuffer());
      photoPath = path.join(HERE, '_tmp_quick_photo.jpg');
      fs.writeFileSync(photoPath, buf);
      console.log('  촬영용 사진: 서버 현장 사진 사용');
    }
  } catch { /* 폴백 PNG 그대로 */ }

  // ── 브라우저 — 지오로케이션을 시드 현장 좌표로 ─────────────────────────
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 896 },
    deviceScaleFactor: 2,
    geolocation: { latitude: Number(geoField.lat), longitude: Number(geoField.lng) },
    permissions: ['geolocation'],
  });
  const pg = await ctx.newPage();
  pg.setDefaultNavigationTimeout(120000);
  pg.setDefaultTimeout(15000);
  pg.on('pageerror', (e) => console.log('  [pageerror]', e.message));

  async function shot(name) {
    await sleep(800);
    await pg.screenshot({ path: path.join(OUT, name + '.png') });
    results.push('OK   ' + name);
    console.log('  shot:', name);
  }
  async function step(name, fn) {
    try { await fn(); }
    catch (e) { results.push('FAIL ' + name + ' :: ' + (e.message || '').split('\n')[0]); console.log('  FAIL', name, (e.message || '').split('\n')[0]); }
  }
  async function ensureAuthed() {
    const pwField = pg.locator('input[type="password"]').first();
    if (await pwField.isVisible({ timeout: 1500 }).catch(() => false)) {
      const email = pg.locator('input[type="email"], input[autocomplete="email"]').first();
      await email.fill(EMAIL); await pwField.fill(PW);
      await pg.getByText('로그인', { exact: true }).first().click();
      await pg.waitForFunction(() => /외근|현장|보고서/.test(document.body.innerText) && !/비밀번호/.test(document.body.innerText), { timeout: 25000 });
      await sleep(1200);
    }
  }
  async function go(route, wait = 1500) {
    await pg.goto(WEB + route, { waitUntil: 'domcontentloaded' });
    await sleep(wait);
    await ensureAuthed();
  }

  // 1) 로그인 (캡처 없음 — 세션 확보용)
  await pg.goto(WEB, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  await ensureAuthed();

  // 11) 현장 수정 — 단일 화면 (검색창 상시 + 핀 지도)
  await step('11_field_edit', async () => {
    if (!fieldEditId) throw new Error('no field');
    await go('/fields/' + fieldEditId + '/edit', 3200); // 핀 지도 로드 여유
    await shot('11_field_edit');
  });

  // 12) 현장 등록 — 단일 화면 진입 직후 (자동 측위 → 핀 지도)
  await step('12_field_new', async () => {
    await go('/fields/new', 3200);
    await shot('12_field_new');
  });

  // 13) 현장 등록 — 장소명 검색 결과 (단일 화면 위 오버레이)
  await step('13_field_new_place', async () => {
    await go('/fields/new', 2400);
    const input = pg.getByPlaceholder(/동아대학교|해운대|주소/).first();
    await input.click({ timeout: 5000 });
    await input.fill('동아대학교');
    await sleep(2600); // 백엔드 주소 + 클라이언트 키워드 병합 대기
    await shot('13_field_new_place');
  });

  // 14) 현장 등록 — 검색 결과 선택 → 핀 지도에 반영된 상태
  await step('14_field_new_pin', async () => {
    await go('/fields/new', 2400);
    const input = pg.getByPlaceholder(/동아대학교|해운대|주소/).first();
    await input.click({ timeout: 5000 });
    await input.fill('동아대학교');
    await pg.waitForFunction(() => /동아대/.test(document.body.innerText), { timeout: 8000 }).catch(() => {});
    await sleep(1200);
    await pg.getByText(/동아대/).first().click({ timeout: 5000 });
    await sleep(2800); // 선택 → 카드·핀 지도 갱신
    await shot('14_field_new_pin');
  });

  // 23) 빠른 촬영 — 버튼 → (웹: 파일 선택으로 촬영 대체) → 최근접 매칭 시트
  await step('23_quick_photo', async () => {
    await go('/fields', 3000);
    const btn = pg.locator('[aria-label*="빠른 촬영"], [aria-label*="빠른촬영"]').first();
    const chooser = pg.waitForEvent('filechooser', { timeout: 12000 });
    if (await btn.isVisible({ timeout: 4000 }).catch(() => false)) await btn.click();
    else await pg.getByText(/빠른 촬영/).first().click({ timeout: 5000 });
    const fc = await chooser;
    await fc.setFiles(photoPath);
    // 매칭 시트(후보·거리) 렌더 대기
    await pg.waitForFunction(() => /등록|현장.*선택|m\b|미터/.test(document.body.innerText), { timeout: 12000 }).catch(() => {});
    await sleep(1500);
    await shot('23_quick_photo');
    // 시트 닫기 (실등록 방지)
    await pg.keyboard.press('Escape').catch(() => {});
  });

  // 24) 현장 보고 편집 — 전·중·후 사진+캡션 슬롯.
  // 딥링크 직행은 페이지 리로드로 스토어 캐시가 비어 폴백("찾을 수 없습니다")이 뜬다 —
  // 상세를 먼저 띄워 캐시를 채운 뒤 카드의 "수정" 버튼으로 SPA 내 이동해야 한다.
  await step('24_report_field_edit', async () => {
    if (!reportEditTarget) throw new Error('fieldReports 있는 보고서 없음');
    await go('/reports/' + reportEditTarget.reportId, 3200);
    await pg.mouse.wheel(0, 1200); await sleep(900); // 현장 보고 카드 영역으로
    // '수정' 은 카드(현장 보고)와 페이지 하단(보고서 제목) 두 군데 — DOM 순서상 first 가 카드.
    await pg.getByText('수정', { exact: true }).first().click({ timeout: 6000 });
    await pg.waitForFunction(() => /현장 보고|캡션|사진/.test(document.body.innerText), { timeout: 10000 }).catch(() => {});
    await sleep(2200);
    await shot('24_report_field_edit');
  });

  console.log('\n=== 재캡처 결과 ===');
  results.forEach((r) => console.log(r));
  const ok = results.filter((r) => r.startsWith('OK')).length;
  console.log(`\n총 ${ok} 컷 (실패 ${results.length - ok})`);
  await browser.close();
  try { fs.unlinkSync(path.join(HERE, '_tmp_quick_photo.jpg')); } catch {}
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
