// 7페이지 지도 컷(마커·히트맵·단계구분도) + 보고서 컷 깔끔본 재캡처.
// 현장 탭은 focus 마다 시트가 100%(지도 가림)로 reset → 시트 핸들을 드래그해 18%로 내린 뒤 촬영.
//   실행: QA_EMAIL=abc@abc.com QA_PW=abcd1234 node docs/presentation/capture_map.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const WEB = process.env.QA_BASE ?? 'http://localhost:8081';
const API = process.env.SEED_BASE ?? 'https://ilgayo.co.kr';
const EMAIL = process.env.QA_EMAIL ?? 'abc@abc.com';
const PW = process.env.QA_PW ?? 'abcd1234';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'screenshots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

let TOKEN = null;
async function api(p, { method = 'GET', body, auth = true } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (auth && TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(API + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await res.text(); let d = null; if (t) { try { d = JSON.parse(t); } catch { d = t; } }
  return { ok: res.ok, status: res.status, data: d };
}

async function main() {
  const lr = await api('/auth/login', { method: 'POST', auth: false, body: { email: EMAIL, password: PW } });
  if (!lr.ok) { console.error('API 로그인 실패', lr.status); process.exit(1); }
  TOKEN = lr.data.accessToken;
  const reports = (await api('/api/reports?limit=200')).data?.items ?? [];
  let bestReport = null, bestPhotos = -1;
  for (const r of reports) {
    const det = (await api('/api/reports/' + (r.reportId ?? r.id))).data;
    const withPhoto = (det?.fieldReports ?? []).filter((f) => f.beforePhotoUrl || f.pendingPhotoUrl || f.afterPhotoUrl).length;
    if (withPhoto > bestPhotos) { bestPhotos = withPhoto; bestReport = { id: r.reportId ?? r.id, title: r.title }; }
  }
  console.log('report=', JSON.stringify(bestReport));

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 896 },
    deviceScaleFactor: 2,
    geolocation: { latitude: 35.1858, longitude: 129.0862 },
    permissions: ['geolocation'],
  });
  const pg = await ctx.newPage();
  pg.setDefaultNavigationTimeout(120000);
  pg.setDefaultTimeout(15000);
  pg.on('pageerror', (e) => console.log('  [pageerror]', e.message));

  async function shot(name) { await sleep(900); await pg.screenshot({ path: path.join(OUT, name + '.png') }); results.push('OK   ' + name); console.log('  shot:', name); }
  async function step(name, fn) { try { await fn(); } catch (e) { results.push('FAIL ' + name + ' :: ' + (e.message || '').split('\n')[0]); console.log('  FAIL', name, (e.message || '').split('\n')[0]); } }
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
  async function go(route, wait = 1500) { await pg.goto(WEB + route, { waitUntil: 'domcontentloaded' }); await sleep(wait); await ensureAuthed(); }

  // 시트 핸들을 위에서 아래로 드래그해 최소(18%)로 내림 → 지도 노출.
  async function collapseSheet() {
    const x = 207;
    await pg.mouse.move(x, 12);
    await pg.mouse.down();
    for (let y = 12; y <= 840; y += 28) { await pg.mouse.move(x, y, { steps: 2 }); await sleep(12); }
    await pg.mouse.up();
    await sleep(1100);
  }

  // 로그인
  await pg.goto(WEB, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  await ensureAuthed();

  // 7페이지 — 마커(클러스터링)
  await step('slide7_markers', async () => {
    await go('/fields', 3500);
    await collapseSheet();
    await sleep(1500); // 마커 렌더
    await shot('slide7_markers');
  });
  // 7페이지 — 히트맵
  await step('slide7_heatmap', async () => {
    await go('/fields', 3000);
    await collapseSheet();
    await pg.getByText('표시 방식', { exact: true }).first().click({ timeout: 6000 });
    await sleep(500);
    await pg.getByText('히트맵', { exact: true }).first().click({ timeout: 6000 });
    await sleep(2500);
    await shot('slide7_heatmap');
  });
  // 7페이지 — 단계구분도
  await step('slide7_choropleth', async () => {
    await go('/fields', 3000);
    await collapseSheet();
    await pg.getByText('표시 방식', { exact: true }).first().click({ timeout: 6000 });
    await sleep(500);
    await pg.getByText('단계구분도', { exact: true }).first().click({ timeout: 6000 });
    await sleep(2500);
    await shot('slide7_choropleth');
  });

  // 8페이지 — 보고서(시트 100%로 올려 깔끔본 + 사진 그리드)
  await step('slide8_report_clean', async () => {
    if (!bestReport) throw new Error('no report');
    await go('/reports/' + bestReport.id, 3500);
    await shot('slide8_report_clean');         // 진입 직후(위치도 포함)
    await pg.mouse.wheel(0, 700); await sleep(1000);
    await shot('slide8_report_photos2');        // 전·중·후 사진 그리드
  });

  console.log('\n=== 결과 ===');
  results.forEach((r) => console.log(r));
  await browser.close();
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
