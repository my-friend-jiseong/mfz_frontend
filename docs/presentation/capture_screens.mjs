// 발표용 시연 스크린샷 자동 캡처 (Playwright) — demo2 계정, 부산 시드 데이터 기준 20+컷.
//
//   사전: Expo web 이 localhost:8081 에서 떠 있어야 함  (CI=1 npx expo start --web --port 8081)
//   실행: node docs/presentation/capture_screens.mjs
//   결과: docs/presentation/screenshots/NN_*.png
//
// 동작: ① API 로그인해 엔티티 ID 수집 ② 브라우저 UI 로그인 ③ 딥링크로 각 화면 캡처
//       ④ 캡처 막바지에 API 로 외근 1건 start+check-in → active 화면 캡처 → end 로 원복.
// 상세/딥링크 위주라 카드 클릭 의존을 최소화. 각 스텝은 독립(실패해도 계속).
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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

// ── API 헬퍼 (ID 수집 + active 외근 연출) ───────────────────────────────
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
  // 0) API 로그인 + ID 수집
  const lr = await api('/auth/login', { method: 'POST', auth: false, body: { email: EMAIL, password: PW } });
  if (!lr.ok) { console.error('API 로그인 실패', lr.status, JSON.stringify(lr.data)); process.exit(1); }
  TOKEN = lr.data.accessToken;
  const fields = (await api('/api/fields/mine?visitDateScope=all&limit=200')).data?.items ?? [];
  const trips = (await api('/api/trips?limit=200')).data?.items ?? [];
  const reports = (await api('/api/reports?limit=200')).data?.items ?? [];
  const doneField = fields.find((f) => f.status === 'done') ?? fields[0];
  const fieldDetailId = doneField?.fieldId;
  const fieldEditId = (fields.find((f) => f.status === 'pending') ?? fields[1] ?? fields[0])?.fieldId;
  const tripDetailId = trips[0]?.tripId;
  const reportDetailId = reports[0]?.reportId;
  const activeFieldIds = fields.slice(0, 3).map((f) => f.fieldId);
  console.log(`수집: field=${fieldDetailId} trip=${tripDetailId} report=${reportDetailId} (현장 ${fields.length}·외근 ${trips.length}·보고서 ${reports.length})`);

  // active 외근 가드 — 이미 active 면 캡처 일관성 위해 종료
  const act0 = (await api('/api/trips/active')).data;
  if (act0?.isActive) { await api('/api/trips/end', { method: 'POST', body: { forceEndWithoutVisit: true } }); }

  // ── 브라우저 ─────────────────────────────────────────────────────────
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  pg.setDefaultNavigationTimeout(120000); // 콜드 Metro 번들 빌드 여유
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
  // 딥링크 이동 후 로그인 화면으로 튕기면 재로그인.
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

  // 1) 로그인 화면 + 로그인
  await pg.goto(WEB, { waitUntil: 'domcontentloaded' });
  await pg.evaluate(() => window.localStorage.clear()).catch(() => {});
  await pg.goto(WEB, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  await step('01_login', async () => {
    const email = pg.locator('input[type="email"], input[autocomplete="email"]').first();
    const pw = pg.locator('input[type="password"]').first();
    await email.waitFor({ timeout: 60000 });
    await email.fill(EMAIL); await pw.fill(PW);
    await shot('01_login');
    await pg.getByText('로그인', { exact: true }).first().click();
    await pg.waitForFunction(() => /외근|현장|보고서/.test(document.body.innerText) && !/비밀번호/.test(document.body.innerText), { timeout: 25000 });
    await sleep(1800);
  });

  // 2) 외근 탭 (지도 + 외근 내역)
  await step('02_trips_list', async () => { await go('/trips', 2600); await shot('02_trips_list'); });
  // 3) 외근 상세 (타임라인 + 마커/경로)
  await step('03_trip_detail', async () => { if (!tripDetailId) throw new Error('no trip'); await go('/trips/' + tripDetailId, 2800); await shot('03_trip_detail'); });
  // 4) 새 외근 — 현장 선택
  await step('04_trip_new_select', async () => { await go('/trips/new/select', 2200); await shot('04_trip_new_select'); });
  // 5) 새 외근 — 현장 2~3곳 체크 후 순서 자동정렬
  await step('05_trip_new_order', async () => {
    await go('/trips/new/select', 2000);
    const items = pg.locator('[role="button"], [tabindex="0"]');
    const n = await items.count();
    let picked = 0;
    for (let i = 0; i < n && picked < 3; i++) {
      const el = items.nth(i);
      const txt = (await el.innerText().catch(() => '')) || '';
      if (/펌프실|전기실|본관|설비|기계실|보일러|변전|저수조|소방/.test(txt)) { await el.click().catch(() => {}); picked++; await sleep(250); }
    }
    await pg.getByText(/다음|순서|정렬|선택 완료/).first().click({ timeout: 3500 }).catch(() => {});
    await sleep(2200);
    await shot('05_trip_new_order');
  });

  // 6) 현장 탭 — 지도 대시보드 (30 마커, 상태별 색)
  await step('06_fields_map', async () => { await go('/fields', 3000); await shot('06_fields_map'); });
  // 7) 상태 필터 적용 (조치 완료 칩)
  await step('07_fields_filter', async () => {
    await go('/fields', 2600);
    await pg.getByText(/조치 완료|완료/).first().click({ timeout: 3000 }).catch(() => {});
    await sleep(1600);
    await shot('07_fields_filter');
  });
  // 8) 히트맵 토글 — "표시 방식" 펼친 뒤 히트맵 칩
  await step('08_fields_heatmap', async () => {
    await go('/fields', 2600);
    await pg.getByText('표시 방식', { exact: true }).first().click({ timeout: 4000 });
    await sleep(700);
    await pg.getByText('히트맵', { exact: true }).first().click({ timeout: 4000 });
    await sleep(2200);
    await shot('08_fields_heatmap');
  });
  // 9) 단계구분도 토글 — "표시 방식" 펼친 뒤 단계구분도 칩
  await step('09_fields_choropleth', async () => {
    await go('/fields', 2600);
    await pg.getByText('표시 방식', { exact: true }).first().click({ timeout: 4000 });
    await sleep(700);
    await pg.getByText('단계구분도', { exact: true }).first().click({ timeout: 4000 });
    await sleep(2200);
    await shot('09_fields_choropleth');
  });

  // 10) 현장 상세 (상태칩·분류·주소·미니맵)
  await step('10_field_detail', async () => { if (!fieldDetailId) throw new Error('no field'); await go('/fields/' + fieldDetailId, 2800); await shot('10_field_detail'); });
  // 11) 현장 수정
  await step('11_field_edit', async () => { if (!fieldEditId) throw new Error('no field'); await go('/fields/' + fieldEditId + '/edit', 2400); await shot('11_field_edit'); });
  // 12) 새 현장 — 주소/장소 검색 (빈 폼)
  await step('12_field_new', async () => { await go('/fields/new', 2000); await shot('12_field_new'); });
  // 13) 새 현장 — 장소명 검색 "동아대학교" (신규 키워드 검색)
  await step('13_field_new_place', async () => {
    await go('/fields/new', 1800);
    const input = pg.getByPlaceholder(/동아대학교|해운대|주소/).first();
    await input.click({ timeout: 4000 });
    await input.fill('동아대학교');
    await sleep(2600); // 백엔드 주소 + 클라이언트 키워드 병합 대기
    await shot('13_field_new_place');
  });
  // 14) 새 현장 — 결과 선택 → step2 핀 지도 (신규 드래그 핀)
  await step('14_field_new_pin', async () => {
    await go('/fields/new', 1800);
    const input = pg.getByPlaceholder(/동아대학교|해운대|주소/).first();
    await input.click({ timeout: 4000 });
    await input.fill('동아대학교');
    await pg.waitForFunction(() => /동아대/.test(document.body.innerText), { timeout: 8000 }).catch(() => {});
    await sleep(1200);
    await pg.getByText(/동아대/).first().click({ timeout: 5000 });
    await pg.waitForFunction(() => /선택한 주소|상세 입력|상세 주소/.test(document.body.innerText), { timeout: 8000 }).catch(() => {});
    await sleep(2600); // 핀 지도 로드
    await shot('14_field_new_pin');
  });

  // 15) 보고서 탭 목록
  await step('15_reports_list', async () => { await go('/reports', 2600); await shot('15_reports_list'); });
  // 16) 보고서 상세 (현장별 전·중·후 사진 카드)
  await step('16_report_detail', async () => { if (!reportDetailId) throw new Error('no report'); await go('/reports/' + reportDetailId, 3200); await shot('16_report_detail'); });
  // 17) 보고서 작성
  await step('17_report_new', async () => { await go('/reports/new', 2200); await shot('17_report_new'); });

  // 18) 내 정보 (프로필)
  await step('18_profile', async () => { await go('/profile', 1800); await shot('18_profile'); });

  // 19) 보고서 상세 하단 스크롤 — 사진 카드 더 보이게
  await step('19_report_detail_scroll', async () => {
    if (!reportDetailId) throw new Error('no report');
    await go('/reports/' + reportDetailId, 3000);
    await pg.mouse.wheel(0, 1400); await sleep(1400);
    await shot('19_report_detail_scroll');
  });

  // ── active 외근 연출 (API start + check-in → 캡처 → end 로 원복) ──────
  let activeTripId = null;
  await step('seed_active', async () => {
    const s = await api('/api/trips/start', { method: 'POST', body: { title: '광안·센텀 정기점검 현장' } });
    if (!s.ok) throw new Error('start ' + s.status);
    activeTripId = s.data.tripId;
    for (const fid of activeFieldIds) {
      const ci = await api('/api/visits/check-in', { method: 'POST', body: { fieldId: fid } });
      if (ci.ok && ci.data?.visitId) await api(`/api/visits/${ci.data.visitId}/status`, { method: 'PATCH', body: { status: 'completed' } });
    }
    console.log('  active trip:', activeTripId, '(check-in', activeFieldIds.length, ')');
  });

  // 20) 진행 중 외근 — active 화면 (마커 + 경로)
  await step('20_trip_active', async () => { await go('/trips/active', 3000); await shot('20_trip_active'); });
  // 21) 진행 중 외근 — 외근 탭 진입(직행) 화면
  await step('21_trip_active_tab', async () => { await go('/trips', 2800); await shot('21_trip_active_tab'); });
  // 22) 현장 체크인 화면 (전·중·후 사진 + 방문결과)
  await step('22_field_checkin', async () => {
    if (!fieldDetailId) throw new Error('no field');
    await go('/fields/' + activeFieldIds[0] + '/checkin', 2400);
    await shot('22_field_checkin');
  });

  // active 원복
  await step('end_active', async () => {
    const e = await api('/api/trips/end', { method: 'POST', body: {} });
    if (!e.ok) await api('/api/trips/end', { method: 'POST', body: { forceEndWithoutVisit: true } });
    console.log('  active 외근 종료');
  });

  console.log('\n=== 캡처 결과 ===');
  results.forEach((r) => console.log(r));
  const ok = results.filter((r) => r.startsWith('OK')).length;
  console.log(`\n총 ${ok} 컷 캡처 (실패 ${results.length - ok})`);
  await browser.close();
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
