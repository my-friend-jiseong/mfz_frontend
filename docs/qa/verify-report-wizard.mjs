// 보고서 생성 마법사 플로우 회귀 검증 — Playwright (integration-scenario §S7).
//
// 커버: 생성→마법사 (n/N) 진입 / 사진 없는 캡션 저장 차단 / 저장 후 다음 현장 /
//       건너뛰기 / 마지막 단계 저장 후 완료(통지 alert) / 나중에 작성하기 /
//       상세→수정은 비마법사 / 방문 0건 외근은 상세 직행.
//
//   사전: Expo web 이 localhost:8081 에서 떠 있어야 함 (CI=1 npx expo start --web --port 8081)
//        + 방문 현장 3곳 이상인 완결 외근을 가진 테스트 계정.
//   실행: $env:QA_PW="<테스트 계정 비밀번호>"; node docs/qa/verify-report-wizard.mjs
//   동작: 검증용 보고서 2~3건을 실제로 생성하고, 종료 시 전부 DELETE 로 원복.
//        운영 도메인에 실행해도 안전하나 반드시 테스트 계정으로.
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
  console.error('✖ QA_PW 환경변수가 필요합니다. (테스트 계정 비밀번호)');
  process.exit(1);
}
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'tmp', 'verify_wizard'); // docs/tmp — gitignore 대상
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const createdReportIds = [];

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
  // ── 0) API 로그인 + 마법사 대상 외근 선정 ─────────────────────────
  const lr = await api('/auth/login', { method: 'POST', auth: false, body: { email: EMAIL, password: PW } });
  if (!lr.ok) { console.error('API 로그인 실패', lr.status); process.exit(1); }
  TOKEN = lr.data.accessToken;

  const trips = (await api('/api/trips?limit=200')).data?.items ?? [];
  let target = null; // { tripId, uniqueFields }
  let zeroVisitTrip = null;
  for (const t of trips) {
    const d = (await api(`/api/trips/${t.tripId}`)).data;
    if (!d) continue;
    const uniq = new Set((d.timeline ?? []).map((e) => e.fieldId).filter(Boolean));
    if (!target && uniq.size >= 3) target = { tripId: t.tripId, uniqueFields: uniq.size };
    if (!zeroVisitTrip && uniq.size === 0) zeroVisitTrip = t.tripId;
    if (target && zeroVisitTrip) break;
  }
  if (!target) { console.error('방문 현장 3곳+ 외근 없음 — 검증 불가'); process.exit(1); }
  log(`대상 외근: ${target.tripId} (고유 현장 ${target.uniqueFields}곳), 0방문 외근: ${zeroVisitTrip ?? '없음'}`);

  // ── 브라우저 ──────────────────────────────────────────────────────
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  pg.setDefaultNavigationTimeout(180000);
  pg.setDefaultTimeout(20000);
  pg.on('pageerror', (e) => log('  [pageerror]', e.message));
  const dialogs = [];
  pg.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); });

  const shot = async (name) => { await sleep(700); await pg.screenshot({ path: path.join(OUT, name + '.png') }); log('  shot:', name); };
  const bodyHas = (re, timeout = 20000) =>
    pg.waitForFunction((src) => new RegExp(src).test(document.body.innerText), re.source, { timeout });
  // 딥링크 이동 후 로그인 화면으로 튕기면 재로그인 (capture_screens 패턴).
  async function ensureAuthed() {
    const pwField = pg.locator('input[type="password"]').first();
    if (await pwField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await pg.locator('input[type="email"], input[autocomplete="email"]').first().fill(EMAIL);
      await pwField.fill(PW);
      await pg.getByText('로그인', { exact: true }).first().click();
      await bodyHas(/외근|현장|보고서/, 30000);
      await sleep(1200);
      log('  (재로그인)');
    }
  }
  async function go(route, wait = 2000) {
    await pg.goto(WEB + route, { waitUntil: 'domcontentloaded' });
    await sleep(wait);
    const pwVisible = await pg.locator('input[type="password"]').first()
      .isVisible({ timeout: 2000 }).catch(() => false);
    if (pwVisible) {
      // 재로그인하면 기본 탭으로 떨어지므로 딥링크를 다시 연다.
      await ensureAuthed();
      await pg.goto(WEB + route, { waitUntil: 'domcontentloaded' });
      await sleep(wait);
    }
  }

  // UI 로그인
  await pg.goto(WEB, { waitUntil: 'domcontentloaded' });
  await pg.evaluate(() => window.localStorage.clear()).catch(() => {});
  await pg.goto(WEB, { waitUntil: 'domcontentloaded' });
  const email = pg.locator('input[type="email"], input[autocomplete="email"]').first();
  await email.waitFor({ timeout: 120000 }); // 콜드 번들 여유
  await email.fill(EMAIL);
  await pg.locator('input[type="password"]').first().fill(PW);
  await pg.getByText('로그인', { exact: true }).first().click();
  await bodyHas(/외근|현장|보고서/, 30000);
  await sleep(1500);
  log('UI 로그인 OK');

  // 신규 보고서 폼 작성 + 제출 → 마법사 1단계 도달까지. 생성된 reportId 반환.
  async function createReportAndEnterWizard(titleSuffix) {
    await go(`/reports/new?tripId=${target.tripId}`);
    const title = pg.getByPlaceholder(/사하구 가로수/).first();
    try {
      await title.waitFor({ timeout: 30000 });
    } catch (e) {
      await shot(`new_form_missing_${titleSuffix}`);
      log('  화면 텍스트:', (await pg.evaluate(() => document.body.innerText.slice(0, 600))).replace(/\n+/g, ' | '));
      throw e;
    }
    await title.fill(`마법사 검증 ${titleSuffix}`);
    await bodyHas(/현장 \d+곳의 현장 보고가/, 25000); // 외근 hydrate 완료 신호 (새 안내 문구)
    await shot(`new_form_${titleSuffix}`);
    await pg.getByText('보고서 만들기', { exact: true }).first().click();
    await bodyHas(/현장 보고 작성 \(1\/\d+\)/, 40000);
    const url = pg.url();
    const m = url.match(/reports\/([^/]+)\/field-report/);
    if (m) createdReportIds.push(m[1]);
    log(`  마법사 진입 OK — url: ${url}`);
    return m?.[1];
  }

  // ── 1) 생성 → 마법사 (1/N) 진입 ───────────────────────────────────
  await createReportAndEnterWizard('A');
  const heading1 = await pg.evaluate(() => document.body.innerText.match(/현장 보고 작성 \((\d+)\/(\d+)\)/)?.[0]);
  // Stack 헤더 바 + 본문 h2 양쪽에 단계가 떠야 함 → 본문 내 출현 2회로 검증.
  // (document.title 은 앱 이름 고정이 expo-router 기본 — 검사 대상 아님.)
  const headingCount1 = await pg.evaluate(
    () => (document.body.innerText.match(/현장 보고 작성 \(1\//g) ?? []).length,
  );
  log(`STEP1 헤딩: ${heading1} / 화면 내 출현 ${headingCount1}회 (헤더+본문=2 기대)`);
  if (headingCount1 < 2) log('⚠ Stack 헤더 바에 단계 미반영 의심');
  await shot('wizard_step1');

  // ── 2) 🔍 probe: 사진 없는 캡션만 입력 → 저장 차단(인라인 에러) ────
  await pg.getByPlaceholder('조치 전 캡션 (선택)').first().fill('조치 전 캡션 — 마법사 검증');
  await pg.getByText('저장 후 다음 현장', { exact: true }).first().click();
  await bodyHas(/사진 없이 캡션만 입력돼 있습니다/, 15000);
  const stillStep1 = await pg.evaluate(() => /현장 보고 작성 \(1\//.test(document.body.innerText));
  log(`사진 없는 캡션 → 저장 차단 OK (단계 유지: ${stillStep1})`);
  await shot('orphan_caption_blocked');

  // 캡션 비우고 재저장 → (2/N) 정상 전환
  await pg.getByPlaceholder('조치 전 캡션 (선택)').first().fill('');
  await pg.getByText('저장 후 다음 현장', { exact: true }).first().click();
  await bodyHas(/현장 보고 작성 \(2\/\d+\)/, 25000);
  log('캡션 비운 뒤 저장 후 다음 현장 → (2/N) OK');
  await shot('wizard_step2');

  // ── 3) '이 현장 건너뛰기' 로 마지막 단계까지 ──────────────────────
  let guard = 0;
  while (guard++ < 15) {
    const h = await pg.evaluate(() => document.body.innerText.match(/현장 보고 작성 \((\d+)\/(\d+)\)/));
    if (!h) throw new Error('마법사 헤딩 소실');
    const [, k, n] = h;
    if (k === n) break;
    await pg.getByText('이 현장 건너뛰기', { exact: true }).first().click();
    await bodyHas(new RegExp(`현장 보고 작성 \\(${Number(k) + 1}/${n}\\)`), 20000);
    log(`건너뛰기 → (${Number(k) + 1}/${n}) OK`);
  }

  // ── 4) 마지막 단계 — 버튼 라벨 + '저장 후 완료' → 통지 + 상세 ─────
  const lastHasSaveDone = await pg.getByText('저장 후 완료', { exact: true }).first().isVisible().catch(() => false);
  const lastHasSkipDone = await pg.getByText('건너뛰고 완료', { exact: true }).first().isVisible().catch(() => false);
  const lastHasLater = await pg.getByText('나중에 작성하기', { exact: true }).first().isVisible().catch(() => false);
  log(`마지막 단계 버튼 — 저장 후 완료:${lastHasSaveDone} 건너뛰고 완료:${lastHasSkipDone} 나중에(없어야 정상):${lastHasLater}`);
  await shot('wizard_last_step');
  dialogs.length = 0;
  await pg.getByText('저장 후 완료', { exact: true }).first().click();
  await bodyHas(/현장별 전·중·후/, 30000);
  log(`상세 도착 OK — url: ${pg.url()}`);
  const doneNotice = dialogs.find((m) => m.includes('보고서 작성 완료'));
  log(`완료 통지(window.alert): ${doneNotice ? 'OK — ' + doneNotice.split('\n')[0] : '누락!'}`);
  await sleep(1500);
  await shot('detail_after_wizard');

  // ── 5) 🔍 probe: 두 번째 보고서 — 1단계에서 '나중에 작성하기' ─────
  await createReportAndEnterWizard('B');
  await pg.getByText('나중에 작성하기', { exact: true }).first().click();
  await bodyHas(/현장별 전·중·후/, 30000);
  log(`나중에 작성하기 → 상세 직행 OK — url: ${pg.url()}`);
  await shot('later_to_detail');

  // ── 6) 🔍 probe: 상세의 기존 '수정' 진입은 마법사가 아니어야 함 ────
  await pg.getByText('수정', { exact: true }).first().scrollIntoViewIfNeeded().catch(() => {});
  // FieldReportCard 의 '수정' 버튼 (첫 카드)
  await pg.getByText('수정', { exact: true }).first().click();
  await sleep(2000);
  const editHeading = await pg.evaluate(() => document.body.innerText.match(/현장 보고 (수정|작성 \(\d+\/\d+\))/)?.[0]);
  const editHasNext = await pg.getByText('저장 후 다음 현장', { exact: true }).first().isVisible().catch(() => false);
  log(`상세→수정 진입 헤딩: "${editHeading}", 다음현장 버튼(없어야 정상): ${editHasNext}`);
  await shot('normal_edit_mode');

  // ── 7) 🔍 probe: 0방문 외근 → 마법사 없이 상세 직행 ───────────────
  if (zeroVisitTrip) {
    await go(`/reports/new?tripId=${zeroVisitTrip}`);
    const t2 = pg.getByPlaceholder(/사하구 가로수/).first();
    await t2.waitFor({ timeout: 30000 });
    await t2.fill('마법사 검증 C (0방문)');
    await bodyHas(/방문 기록이 없어/, 20000);
    await pg.getByText('보고서 만들기', { exact: true }).first().click();
    await bodyHas(/현장별 전·중·후|등록된 현장 보고가 없습니다/, 30000);
    const wentWizard = /field-report/.test(pg.url());
    const m = pg.url().match(/reports\/([^/?]+)/);
    if (m) createdReportIds.push(m[1]);
    log(`0방문 외근 → 마법사 우회(상세 직행): ${!wentWizard} — url: ${pg.url()}`);
    await shot('zero_visit_detail');
  } else {
    log('0방문 외근 없음 — probe 7 생략');
  }

  await browser.close();

  // ── 정리: 생성한 보고서 삭제 (cascade 로 field_reports 도 삭제) ────
  for (const id of createdReportIds) {
    const r = await api(`/api/reports/${id}`, { method: 'DELETE' });
    log(`cleanup: DELETE report ${id} → ${r.status}`);
  }
  log('\n=== 검증 스크립트 정상 종료 ===');
}

main().catch(async (e) => {
  console.error('FATAL', e.message);
  for (const id of createdReportIds) {
    const r = await api(`/api/reports/${id}`, { method: 'DELETE' });
    console.log(`cleanup(after-fail): DELETE report ${id} → ${r.status}`);
  }
  process.exit(1);
});
