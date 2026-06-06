// 발표용 데모 영상 자동 녹화 (Playwright recordVideo) — MVP_INFORMATION §8 동선.
//
//   사전: Expo web 이 localhost:8081 에서 떠 있어야 함  (CI=1 npx expo start --web --port 8081)
//   실행: QA_PW=<demo2 비밀번호> node docs/presentation/record_demo.mjs
//   결과: docs/presentation/demo/demo.webm + demo.mp4 (pptx 임베드용) + qa_frame_*.png
//
// 주의: 동선 중 실데이터(현장 1·외근 1·방문·사진·보고서 1)가 데모 계정에 생성된다 —
//       시연용으로 자연스러운 데이터라 의도적으로 남긴다. 리셋은 clean/seed 스크립트.
// 한계: 웹 빌드 녹화(커서 미표시·클릭은 즉시 전환). window.confirm 다이얼로그는
//       영상에 안 보이고 결과 상태만 보인다 (webAlertPatch).
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const WEB = process.env.QA_BASE ?? 'http://localhost:8081';
const API = process.env.SEED_BASE ?? 'https://ilgayo.co.kr';
const EMAIL = process.env.QA_EMAIL ?? 'demo2@ilgayo.co.kr';
const PW = process.env.QA_PW;
if (!PW) { console.error('✖ QA_PW 환경변수가 필요합니다.'); process.exit(1); }
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'demo');
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  // 0) API — 좌표·정리. 진행 중 외근이 있으면 종료(녹화 일관성).
  const lr = await api('/auth/login', { method: 'POST', auth: false, body: { email: EMAIL, password: PW } });
  if (!lr.ok) { console.error('API 로그인 실패', lr.status); process.exit(1); }
  TOKEN = lr.data.accessToken;
  const fields = (await api('/api/fields/mine?visitDateScope=all&limit=200')).data?.items ?? [];
  const geoField = fields.find((f) => Number.isFinite(f.lat) && Number.isFinite(f.lng));
  if (!geoField) { console.error('좌표 있는 현장 없음 — 시드 먼저'); process.exit(1); }
  if ((await api('/api/trips/active')).data?.isActive) {
    await api('/api/trips/end', { method: 'POST', body: { forceEndWithoutVisit: true } });
  }
  // 완성된 보고서(전·중·후 사진 채워진) — 피날레 직전 보여줄 대상.
  let showcaseReportId = null;
  for (const r of (await api('/api/reports?limit=100')).data?.items ?? []) {
    if (/테스트|test|ㅁㄴㅇ/i.test(r.title ?? '')) continue;
    const det = (await api('/api/reports/' + r.reportId)).data;
    if (det?.fieldReports?.some((f) => f.beforePhotoUrl || f.afterPhotoUrl)) { showcaseReportId = r.reportId; break; }
  }
  // '촬영' 파일 — 서버 현장 사진 재사용.
  let photoPath = path.join(HERE, 'screenshots', '10_field_detail.png');
  try {
    const det = (await api('/api/fields/' + geoField.fieldId)).data;
    const url = det?.photos?.[0]?.fileUrl;
    if (url) {
      const buf = Buffer.from(await (await fetch(url.startsWith('http') ? url : API + url)).arrayBuffer());
      photoPath = path.join(OUT, '_tmp_photo.jpg');
      fs.writeFileSync(photoPath, buf);
    }
  } catch {}

  // ── 브라우저 (녹화 ON) ─────────────────────────────────────────────────
  const browser = await chromium.launch({ slowMo: 150 });
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 896 },
    deviceScaleFactor: 2,
    geolocation: { latitude: Number(geoField.lat), longitude: Number(geoField.lng) },
    permissions: ['geolocation'],
    // size 는 viewport 와 일치시켜야 함 — 더 크게 주면 업스케일이 아니라 회색 패딩이 생긴다(실측).
    recordVideo: { dir: OUT, size: { width: 414, height: 896 } },
  });
  const pg = await ctx.newPage();
  pg.setDefaultNavigationTimeout(120000);
  pg.setDefaultTimeout(12000);
  // webAlertPatch → window.alert/confirm. 모두 수락 (영상엔 결과 상태만 남음).
  pg.on('dialog', (d) => { void d.accept(); });

  const scenes = [];
  async function scene(name, fn) {
    try { await fn(); scenes.push('OK   ' + name); console.log('scene OK:', name); }
    catch (e) {
      scenes.push('SKIP ' + name + ' :: ' + (e.message || '').split('\n')[0]);
      console.log('scene SKIP:', name, (e.message || '').split('\n')[0]);
      await pg.screenshot({ path: path.join(OUT, `fail_${name}.png`) }).catch(() => {});
    }
  }
  async function go(route, wait = 2200) {
    await pg.goto(WEB + route, { waitUntil: 'domcontentloaded' });
    await sleep(wait);
  }
  const tap = async (loc, t = 8000) => { await loc.first().click({ timeout: t }); };

  // S1. 로그인 — 타이핑이 보이도록 pressSequentially
  await scene('S1_login', async () => {
    await pg.goto(WEB, { waitUntil: 'domcontentloaded' });
    await sleep(2500);
    const email = pg.locator('input[type="email"], input[autocomplete="email"]').first();
    await email.waitFor({ timeout: 90000 });
    await email.click(); await email.pressSequentially(EMAIL, { delay: 40 });
    const pw = pg.locator('input[type="password"]').first();
    await pw.click(); await pw.pressSequentially(PW, { delay: 40 });
    await sleep(400);
    await tap(pg.getByText('로그인', { exact: true }));
    await pg.waitForFunction(() => /외근|현장|보고서/.test(document.body.innerText) && !/비밀번호/.test(document.body.innerText), { timeout: 30000 });
    await sleep(2000);
  });

  // S2. 현장 등록 — 단일 화면 (검색 타이핑 → 결과 선택 → 핀 지도 → 등록)
  await scene('S2_field_new', async () => {
    await go('/fields/new', 2600);
    const input = pg.getByPlaceholder(/동아대학교|해운대|주소/).first();
    await input.click();
    await input.pressSequentially('동아대학교', { delay: 110 });
    await pg.waitForFunction(() => /동아대/.test(document.body.innerText), { timeout: 9000 });
    await sleep(1400);
    await tap(pg.getByText(/동아대/));
    await sleep(3000); // 카드·핀 지도 갱신을 영상에 담는 구간
    await pg.mouse.wheel(0, 700); await sleep(1500);
    await pg.mouse.wheel(0, 700); await sleep(1200);
    await tap(pg.getByText('현장 등록', { exact: true }).last());
    await sleep(2800);
  });

  // S3. 외근 시작 — 현장 2곳 선택 → 순서 확인 → 최적 순서 추천 → 시작
  await scene('S3_trip_start', async () => {
    await go('/trips/new/select', 2600);
    // 행 Pressable 은 role="checkbox" (button 아님 — 실측 확인)
    const rows = pg.locator('[role="checkbox"]');
    await rows.nth(0).click({ timeout: 10000 }); await sleep(800);
    await rows.nth(1).click(); await sleep(800);
    await tap(pg.getByText(/^다음/)); // StickyBottomBar "다음 (N)"
    await sleep(2200);
    await tap(pg.getByText(/최적 순서 추천/)); // confirm 자동 수락
    await sleep(1800);
    await tap(pg.getByText(/외근 시작/));
    await sleep(3000);
  });

  // S4. 진행 중 외근 — 목적지 목록 훑기 → 체크인 진입
  await scene('S4_active_checkin', async () => {
    await go('/trips/active', 2800);
    await pg.mouse.wheel(0, 500); await sleep(1500);
    await tap(pg.getByText('체크인', { exact: true })); // CurrentDestCard 1차 액션
    await sleep(2600);
    // 체크인 화면 — 전 사진 1장 첨부 시도 후 완료
    const chooser = pg.waitForEvent('filechooser', { timeout: 6000 });
    await tap(pg.getByText(/사진|촬영|업로드/).first(), 5000).catch(() => {});
    try { const fc = await chooser; await fc.setFiles(photoPath); await sleep(2200); } catch {}
    await pg.mouse.wheel(0, 900); await sleep(1300);
    await tap(pg.getByText(/체크인 완료/));
    await sleep(2800);
  });

  // S5. 빠른 촬영 — 매칭 시트 → 실제 등록
  await scene('S5_quick_photo', async () => {
    await go('/fields', 2800);
    const chooser = pg.waitForEvent('filechooser', { timeout: 10000 });
    const btn = pg.locator('[aria-label*="빠른 촬영"]').first();
    if (await btn.isVisible({ timeout: 4000 }).catch(() => false)) await btn.click();
    else await tap(pg.getByText(/빠른 촬영|촬영/));
    const fc = await chooser; await fc.setFiles(photoPath);
    await pg.waitForFunction(() => /등록할까요|이 현장에 등록/.test(document.body.innerText), { timeout: 10000 });
    await sleep(2000);
    await tap(pg.getByText(/이 현장에 등록/));
    await sleep(2800);
  });

  // S6. 외근 종료 (confirm 자동 수락)
  await scene('S6_trip_end', async () => {
    await go('/trips/active', 2600);
    await tap(pg.getByText(/외근 종료/));
    await sleep(3000);
  });

  // S7. 보고서 — 새 보고서 생성(제목 타이핑 → 외근 선택 → 만들기) → 완성본 쇼케이스
  await scene('S7_report', async () => {
    await go('/reports/new', 2600);
    const title = pg.locator('input').first();
    await title.click(); await title.pressSequentially('사하구 정기점검 결과', { delay: 80 });
    await sleep(600);
    await tap(pg.getByText('외근 선택', { exact: true }), 5000).catch(() => {});
    await sleep(1200);
    // 피커 모달 첫 항목 (날짜 패턴 포함 행)
    await tap(pg.getByText(/2026|점검|외근/).last(), 5000).catch(() => {});
    await sleep(1400);
    await tap(pg.getByText('보고서 만들기', { exact: true }));
    await sleep(3200); // 마법사/상세 진입 화면 노출
    await pg.mouse.wheel(0, 800); await sleep(1600);
  });
  await scene('S7b_report_showcase', async () => {
    if (!showcaseReportId) throw new Error('완성 보고서 없음');
    await go('/reports/' + showcaseReportId, 3000);
    await pg.mouse.wheel(0, 700); await sleep(1600);
    await pg.mouse.wheel(0, 900); await sleep(1600);
    await pg.mouse.wheel(0, 900); await sleep(1800); // 전·중·후 카드 + Word 버튼
  });

  // S8. 피날레 — 지도 대시보드 3모드 + 기간 필터
  await scene('S8_dashboard', async () => {
    await go('/fields', 3000);
    // 포커스 시 시트가 100% 로 리셋돼 지도·칩이 가려짐 — 핸들을 아래로 드래그해 지도 노출.
    await pg.mouse.move(207, 36); await pg.mouse.down();
    for (let y = 36; y <= 780; y += 60) { await pg.mouse.move(207, y); await sleep(30); }
    await pg.mouse.up(); await sleep(1800);
    await tap(pg.getByText('표시 방식', { exact: true }), 15000); await sleep(900);
    await tap(pg.getByText('히트맵', { exact: true })); await sleep(2600);
    await tap(pg.getByText('단계구분도', { exact: true })); await sleep(2600);
    await tap(pg.getByText('마커', { exact: true })); await sleep(1400);
    await tap(pg.getByText(/최근 30일/), 5000).catch(() => {});
    await sleep(2200);
    await tap(pg.getByText('전체', { exact: true }), 5000).catch(() => {});
    await sleep(2400);
  });

  const video = pg.video();
  await ctx.close(); // 비디오 flush
  await browser.close();
  const raw = await video.path();
  const webm = path.join(OUT, 'demo.webm');
  fs.copyFileSync(raw, webm); fs.rmSync(raw, { force: true });
  try { fs.rmSync(path.join(OUT, '_tmp_photo.jpg'), { force: true }); } catch {}

  // mp4 변환 (pptx 임베드용) + QA 프레임 4장
  try {
    const { default: ffmpeg } = await import('ffmpeg-static');
    const mp4 = path.join(OUT, 'demo.mp4');
    execFileSync(ffmpeg, ['-y', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4], { stdio: 'ignore' });
    // QA 프레임 — 15초당 1장 덤프 (영상 검수용, 전달물 아님)
    execFileSync(ffmpeg, ['-y', '-i', mp4, '-vf', 'fps=1/15', path.join(OUT, 'qa_frame_%02d.png')], { stdio: 'ignore' });
    console.log('mp4 변환 완료');
  } catch (e) { console.log('mp4 변환 생략:', (e.message || '').split('\n')[0]); }

  console.log('\n=== 장면 결과 ===');
  scenes.forEach((s) => console.log(s));
  console.log('\n산출물:', OUT);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
