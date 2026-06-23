// 기말발표 v32 — "UI 넣을 곳" 슬롯용 캡처 (Playwright, 모바일 414×896@2x).
//   7페이지(데이터 지도): 마커 / 히트맵 / 단계구분도
//   8페이지(계획→보고서): 현장등록(역지오코딩) / 빠른촬영 최근접매칭 / 자동 보고서
//
//   사전: Expo web 이 localhost:8081 에서 떠 있어야 함.
//   실행: QA_EMAIL=abc@abc.com QA_PW=abcd1234 node docs/presentation/capture_slides.mjs
//   결과: docs/presentation/screenshots/slideNN_*.png
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

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
  const t = await res.text();
  let d = null; if (t) { try { d = JSON.parse(t); } catch { d = t; } }
  return { ok: res.ok, status: res.status, data: d };
}

async function main() {
  // 0) API 로그인 + 대상 ID·좌표 수집
  const lr = await api('/auth/login', { method: 'POST', auth: false, body: { email: EMAIL, password: PW } });
  if (!lr.ok) { console.error('API 로그인 실패', lr.status, JSON.stringify(lr.data)); process.exit(1); }
  TOKEN = lr.data.accessToken;
  const fields = (await api('/api/fields/mine?visitDateScope=all&limit=200')).data?.items ?? [];
  const reports = (await api('/api/reports?limit=200')).data?.items ?? [];
  // 사진이 가장 많이 채워진 보고서 = hero 컷.
  let bestReport = null, bestPhotos = -1;
  for (const r of reports) {
    const det = (await api('/api/reports/' + (r.reportId ?? r.id))).data;
    const frs = det?.fieldReports ?? [];
    const withPhoto = frs.filter((f) => f.beforePhotoUrl || f.pendingPhotoUrl || f.afterPhotoUrl).length;
    if (withPhoto > bestPhotos) { bestPhotos = withPhoto; bestReport = { id: r.reportId ?? r.id, title: r.title, withPhoto }; }
  }
  // 밀집 권역(연제구 근처) 좌표를 지오로케이션으로 — /fields/new 자동측위 + 빠른촬영 매칭 기준.
  const geoField = fields.find((f) => Number.isFinite(f.lat) && f.sigungu === '연제구')
    ?? fields.find((f) => Number.isFinite(f.lat) && Number.isFinite(f.lng));
  console.log(`수집: fields=${fields.length} report=${JSON.stringify(bestReport)} geo=(${geoField?.lat},${geoField?.lng})`);

  // 빠른촬영 '촬영' 파일 — 기존 캡처 PNG 재사용(파일 선택 대체).
  const photoPath = path.join(OUT, '10_field_detail.png');

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
    await sleep(900);
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

  // 로그인 (세션 확보)
  await pg.goto(WEB, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  await ensureAuthed();

  // ── 7페이지: 데이터 지도 ──────────────────────────────────────────
  // 마커(기본) — 클러스터링 + 라벨
  await step('slide7_markers', async () => {
    await go('/fields', 4000); // 지도+마커 로드 여유
    await shot('slide7_markers');
  });
  // 히트맵
  await step('slide7_heatmap', async () => {
    await go('/fields', 3000);
    await pg.getByText('표시 방식', { exact: true }).first().click({ timeout: 5000 });
    await sleep(500);
    await pg.getByText('히트맵', { exact: true }).first().click({ timeout: 5000 });
    await sleep(2200); // KDE 렌더
    await shot('slide7_heatmap');
  });
  // 단계구분도
  await step('slide7_choropleth', async () => {
    await go('/fields', 3000);
    await pg.getByText('표시 방식', { exact: true }).first().click({ timeout: 5000 });
    await sleep(500);
    await pg.getByText('단계구분도', { exact: true }).first().click({ timeout: 5000 });
    await sleep(2200);
    await shot('slide7_choropleth');
  });

  // ── 8페이지: 계획 → 보고서 ────────────────────────────────────────
  // 현장 등록 — 자동측위 → 핀 지도 + 역지오코딩 주소 카드
  await step('slide8_field_new', async () => {
    await go('/fields/new', 3800);
    await shot('slide8_field_new');
  });
  // 현장 등록 — 장소명 검색 → 핀 좌표 반영
  await step('slide8_field_new_pin', async () => {
    await go('/fields/new', 2600);
    const input = pg.getByPlaceholder(/동아대학교|해운대|주소/).first();
    await input.click({ timeout: 5000 });
    await input.fill('부산시청');
    await pg.waitForFunction(() => /부산.*시청|중앙대로/.test(document.body.innerText), { timeout: 8000 }).catch(() => {});
    await sleep(1200);
    await pg.getByText(/부산.*시청|시청/).first().click({ timeout: 5000 }).catch(() => {});
    await sleep(2800);
    await shot('slide8_field_new_pin');
  });
  // 빠른 촬영 — 최근접 현장 매칭 시트
  await step('slide8_quick_photo', async () => {
    await go('/fields', 3000);
    const btn = pg.locator('[aria-label*="빠른 촬영"], [aria-label*="빠른촬영"]').first();
    const chooser = pg.waitForEvent('filechooser', { timeout: 12000 });
    if (await btn.isVisible({ timeout: 4000 }).catch(() => false)) await btn.click();
    else await pg.getByText(/빠른 촬영/).first().click({ timeout: 5000 });
    const fc = await chooser;
    await fc.setFiles(photoPath);
    await pg.waitForFunction(() => /등록|현장.*선택|미터|m 이내|가까운/.test(document.body.innerText), { timeout: 12000 }).catch(() => {});
    await sleep(1500);
    await shot('slide8_quick_photo');
    await pg.keyboard.press('Escape').catch(() => {});
  });
  // 자동 보고서 — 사진 가장 많은 보고서 상세
  await step('slide8_report', async () => {
    if (!bestReport) throw new Error('no report');
    await go('/reports/' + bestReport.id, 3500);
    await shot('slide8_report_top');
    await pg.mouse.wheel(0, 900); await sleep(1000);
    await shot('slide8_report_photos');
  });

  console.log('\n=== 캡처 결과 ===');
  results.forEach((r) => console.log(r));
  const ok = results.filter((r) => r.startsWith('OK')).length;
  console.log(`\n총 ${ok} 컷 (실패 ${results.length - ok})`);
  await browser.close();
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
