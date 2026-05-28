// ERD v2 read-only 렌더 스모크 — dist/ 정적 서브 + chromium 헤드리스.
// 백엔드 mutation 없음. 부팅·로그인·signup·not-found 렌더 + 런타임/콘솔 에러 스캔.
import { chromium } from 'playwright';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const DIST = join(process.cwd(), 'dist');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.ico': 'image/x-icon', '.png': 'image/png',
  '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.map': 'application/json',
};

const server = http.createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
    let filePath = join(DIST, rel);
    let isFile = false;
    try { isFile = (await stat(filePath)).isFile(); } catch {}
    if (!isFile) filePath = join(DIST, 'index.html'); // SPA fallback
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
});

const findings = [];
const add = (kind, label, detail) => {
  findings.push({ kind });
  const tag = kind === 'PASS' ? '✓' : kind === 'FAIL' ? '✗' : '·';
  console.log(`${tag} [${kind}] ${label}${detail ? ' — ' + detail : ''}`);
};

await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;
console.log('serving dist at', BASE);

const browser = await chromium.launch();

async function visit(path, fn) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const pageErrors = [], consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  try { await fn(page, { pageErrors, consoleErrors }); }
  finally { await ctx.close(); }
}

// A2 — 부팅 → 로그인 렌더 (localStorage 비움)
await visit('/', async (page, ctx) => {
  await page.goto(BASE);
  await page.evaluate(() => window.localStorage.clear());
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
  const email = await page.locator('input[type="email"], input[autocomplete="email"], input[inputmode="email"]').first().isVisible().catch(() => false);
  const pw = await page.locator('input[type="password"]').first().isVisible().catch(() => false);
  // 입력 type 이 web 에서 다를 수 있어, 텍스트로도 갈음
  const hasLoginText = await page.getByText(/로그인|이메일|비밀번호/).first().isVisible().catch(() => false);
  if ((email && pw) || hasLoginText) add('PASS', 'A2 부팅 → 로그인 화면 렌더', `email=${email} pw=${pw} text=${hasLoginText}`);
  else add('FAIL', 'A2 로그인 화면 미진입', `email=${email} pw=${pw} text=${hasLoginText}`);
  if (ctx.pageErrors.length) add('FAIL', 'A2 런타임 에러', ctx.pageErrors.slice(0, 3).join(' | '));
  else add('PASS', 'A2 런타임 에러 0건');
  if (ctx.consoleErrors.length) add('WARN', 'A2 콘솔 에러', ctx.consoleErrors.slice(0, 3).join(' | '));
});

// A3 — signup 라우트 렌더
await visit('/signup', async (page, ctx) => {
  await page.goto(BASE + '/signup');
  await page.waitForLoadState('networkidle');
  const ok = await page.getByText(/회원가입|약관|이메일/).first().isVisible().catch(() => false);
  add(ok ? 'PASS' : 'WARN', 'A3 signup 라우트 렌더', `text=${ok}`);
  if (ctx.pageErrors.length) add('FAIL', 'A3 런타임 에러', ctx.pageErrors.slice(0, 3).join(' | '));
  else add('PASS', 'A3 런타임 에러 0건');
});

// A4 — not-found 라우트 (SPA fallback → 클라 라우터가 +not-found 렌더)
await visit('/zzz-no-such-route', async (page, ctx) => {
  await page.goto(BASE + '/zzz-no-such-route');
  await page.waitForLoadState('networkidle');
  const crashed = ctx.pageErrors.length > 0;
  add(crashed ? 'FAIL' : 'PASS', 'A4 not-found 라우트 — 런타임 에러 없이 렌더', crashed ? ctx.pageErrors.slice(0, 2).join(' | ') : '');
});

await browser.close();
server.close();

const fails = findings.filter((f) => f.kind === 'FAIL').length;
const warns = findings.filter((f) => f.kind === 'WARN').length;
console.log(`\n=== SMOKE DONE — FAIL=${fails} WARN=${warns} PASS=${findings.filter(f=>f.kind==='PASS').length} ===`);
process.exit(fails > 0 ? 1 : 0);
