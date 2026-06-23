// 기말발표 v32 "UI 넣을 곳" — 후보 전수 캡처 (사용자가 직접 고름).
//   결과: docs/ui_tmp/슬라이드_UI/*.png
//   실행: QA_EMAIL=abc@abc.com QA_PW=abcd1234 node docs/presentation/capture_candidates.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const WEB = process.env.QA_BASE ?? 'http://localhost:8081';
const API = process.env.SEED_BASE ?? 'https://ilgayo.co.kr';
const EMAIL = process.env.QA_EMAIL ?? 'abc@abc.com';
const PW = process.env.QA_PW ?? 'abcd1234';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', 'ui_tmp', '슬라이드_UI');
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
    const wp = (det?.fieldReports ?? []).filter((f) => f.beforePhotoUrl || f.pendingPhotoUrl || f.afterPhotoUrl).length;
    if (wp > bestPhotos) { bestPhotos = wp; bestReport = { id: r.reportId ?? r.id, title: r.title }; }
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
  async function collapseSheet() {
    const x = 207; await pg.mouse.move(x, 12); await pg.mouse.down();
    for (let y = 12; y <= 840; y += 28) { await pg.mouse.move(x, y, { steps: 2 }); await sleep(12); }
    await pg.mouse.up(); await sleep(1100);
  }
  const clickText = async (re, t = 6000) => pg.getByText(re, typeof re === 'string' ? { exact: true } : undefined).first().click({ timeout: t });

  // 로그인
  await pg.goto(WEB, { waitUntil: 'domcontentloaded' });
  await sleep(2500); await ensureAuthed();

  // ─────────── 7페이지: 데이터 지도 ───────────
  await step('07_지도_마커클러스터링', async () => {
    await go('/fields', 3500); await collapseSheet(); await sleep(1500); await shot('07_지도_마커클러스터링');
  });
  await step('07_지도_마커클러스터링_줌인', async () => {
    await go('/fields', 3500); await collapseSheet(); await sleep(800);
    // 지도 중앙 더블클릭으로 줌인 → 클러스터 풀리고 라벨 노출
    for (let i = 0; i < 3; i++) { await pg.mouse.dblclick(207, 360); await sleep(700); }
    await sleep(1200); await shot('07_지도_마커클러스터링_줌인');
  });
  await step('07_지도_히트맵', async () => {
    await go('/fields', 3000); await collapseSheet();
    await clickText('표시 방식'); await sleep(500); await clickText('히트맵'); await sleep(2500); await shot('07_지도_히트맵');
  });
  await step('07_지도_단계구분도', async () => {
    await go('/fields', 3000); await collapseSheet();
    await clickText('표시 방식'); await sleep(500); await clickText('단계구분도'); await sleep(2500); await shot('07_지도_단계구분도');
  });
  await step('07_지도_시군구경계', async () => {
    await go('/fields', 3000); await collapseSheet();
    await clickText('표시 여부'); await sleep(500);
    await clickText(/시.?군.?구 경계|경계/); await sleep(2000); await shot('07_지도_시군구경계');
  });

  // ─────────── 8페이지: 입력 (역지오코딩 · 촬영위치매핑) ───────────
  await step('08_입력_현장등록_자동주소', async () => {
    await go('/fields/new', 3800); await shot('08_입력_현장등록_자동주소');
  });
  await step('08_입력_현장등록_검색결과', async () => {
    await go('/fields/new', 2600);
    const input = pg.getByPlaceholder(/동아대학교|해운대|주소/).first();
    await input.click({ timeout: 5000 }); await input.fill('부산시청');
    await pg.waitForFunction(() => /시청|중앙대로|연제/.test(document.body.innerText), { timeout: 8000 }).catch(() => {});
    await sleep(1500); await shot('08_입력_현장등록_검색결과');
  });
  await step('08_입력_현장등록_핀선택', async () => {
    await go('/fields/new', 2600);
    const input = pg.getByPlaceholder(/동아대학교|해운대|주소/).first();
    await input.click({ timeout: 5000 }); await input.fill('부산시청');
    await pg.waitForFunction(() => /시청|중앙대로/.test(document.body.innerText), { timeout: 8000 }).catch(() => {});
    await sleep(1000); await pg.getByText(/시청|중앙대로/).first().click({ timeout: 5000 }).catch(() => {});
    await sleep(2800); await shot('08_입력_현장등록_핀선택');
  });
  await step('08_입력_현장등록_지도드래그', async () => {
    await go('/fields/new', 3500);
    // 핀 지도 영역을 드래그해 위치 변경 → 주소 재매칭 (역지오코딩 강조)
    await pg.mouse.move(207, 470); await pg.mouse.down();
    await pg.mouse.move(250, 430, { steps: 6 }); await pg.mouse.move(280, 410, { steps: 6 }); await pg.mouse.up();
    await sleep(2600); await shot('08_입력_현장등록_지도드래그');
  });
  await step('08_입력_빠른촬영_최근접', async () => {
    await go('/fields', 3000);
    const btn = pg.locator('[aria-label*="빠른 촬영"], [aria-label*="빠른촬영"]').first();
    const chooser = pg.waitForEvent('filechooser', { timeout: 12000 });
    if (await btn.isVisible({ timeout: 4000 }).catch(() => false)) await btn.click();
    else await pg.getByText(/빠른 촬영/).first().click({ timeout: 5000 });
    const fc = await chooser; await fc.setFiles(path.join(OUT, '07_지도_히트맵.png'));
    await pg.waitForFunction(() => /등록|현장.*선택|미터|m\b|가까운/.test(document.body.innerText), { timeout: 12000 }).catch(() => {});
    await sleep(1500); await shot('08_입력_빠른촬영_최근접');
  });
  await step('08_입력_빠른촬영_후보목록', async () => {
    await go('/fields', 3000);
    const btn = pg.locator('[aria-label*="빠른 촬영"], [aria-label*="빠른촬영"]').first();
    const chooser = pg.waitForEvent('filechooser', { timeout: 12000 });
    if (await btn.isVisible({ timeout: 4000 }).catch(() => false)) await btn.click();
    else await pg.getByText(/빠른 촬영/).first().click({ timeout: 5000 });
    const fc = await chooser; await fc.setFiles(path.join(OUT, '07_지도_히트맵.png'));
    await sleep(1500);
    await pg.getByText(/다른 현장 선택/).first().click({ timeout: 6000 });
    await sleep(1500); await shot('08_입력_빠른촬영_후보목록');
  });

  // ─────────── 8페이지: 출력 (자동 보고서) ───────────
  await step('08_출력_보고서목록', async () => { await go('/reports', 3000); await shot('08_출력_보고서목록'); });
  await step('08_출력_보고서상세_위치도', async () => {
    if (!bestReport) throw new Error('no report'); await go('/reports/' + bestReport.id, 3500); await shot('08_출력_보고서상세_위치도');
  });
  await step('08_출력_보고서상세_전중후사진', async () => {
    if (!bestReport) throw new Error('no report'); await go('/reports/' + bestReport.id, 3500);
    await pg.mouse.move(207, 720); for (let i = 0; i < 6; i++) { await pg.mouse.wheel(0, 260); await sleep(350); }
    await sleep(900); await shot('08_출력_보고서상세_전중후사진');
  });
  await step('08_출력_보고서_생성마법사', async () => { await go('/reports/generate', 3000); await shot('08_출력_보고서_생성마법사'); });

  // ─────────── 8페이지: 계획 (외근 시작) ───────────
  await step('08_계획_외근_현장선택', async () => { await go('/trips/new/select', 3500); await shot('08_계획_외근_현장선택'); });
  await step('08_계획_외근_순서정렬', async () => { await go('/trips/new/order', 3000); await shot('08_계획_외근_순서정렬'); });

  console.log('\n=== 결과 ===');
  results.forEach((r) => console.log(r));
  const ok = results.filter((r) => r.startsWith('OK')).length;
  console.log(`\n총 ${ok} 컷 (실패 ${results.length - ok})`);
  await browser.close();
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
