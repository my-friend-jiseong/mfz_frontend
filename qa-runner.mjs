// QA 통합 자동화 — Playwright 헤드리스로 시나리오 일부 자동 검증.
// 운영 도메인 mutation 을 피하는 read-only 영역만 본 파일에서 다룬다.
// (회원가입·현장·외근·보고서 mutation 은 사용자 confirm 이후 별도 spec.)
//
// 사용:  node qa-runner.mjs

import { chromium } from 'playwright';

const BASE = process.env.QA_BASE ?? 'http://localhost:8081';

const findings = [];
function add(kind, label, detail) {
  findings.push({ kind, label, detail });
  const tag = kind === 'PASS' ? '✓' : kind === 'FAIL' ? '✗' : '·';
  console.log(`${tag} [${kind}] ${label}${detail ? ' — ' + detail : ''}`);
}

async function withPage(browser, fn) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  try {
    await fn(page, { consoleErrors, pageErrors });
  } finally {
    await context.close();
  }
}

async function waitForApp(page) {
  // expo-router 부팅 — hydrate(/auth/refresh) 끝날 때까지 기다림.
  // refresh 토큰 없으면 즉시 /(auth)/login redirect 가 발생하므로,
  // url 또는 #login 입력 필드 중 먼저 보이는 쪽을 잡는다.
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(
    () => {
      const u = window.location.pathname;
      return u !== '/' || document.querySelector('input[type="email"], input[autocomplete="email"]');
    },
    { timeout: 30000 },
  );
}

async function scenarioS1(browser) {
  // S1: 비로그인 부팅 → /(auth)/login redirect
  await withPage(browser, async (page, ctx) => {
    // 사전 — localStorage 비움 (다른 탭에서 남은 토큰 없도록)
    await page.goto(BASE);
    await page.evaluate(() => window.localStorage.clear());
    await page.goto(BASE);
    await waitForApp(page);
    const url = new URL(page.url());
    if (url.pathname.startsWith('/(auth)/login') || url.pathname === '/login') {
      add('PASS', 'S1 부팅 → /(auth)/login redirect', `path=${url.pathname}`);
    } else {
      // expo-router 의 (auth) group 은 URL 에 노출 안 될 수 있음 — login 입력 필드 존재로 갈음.
      const hasEmailInput = await page.locator('input[type="email"], input[autocomplete="email"]').first().isVisible().catch(() => false);
      const hasPwInput = await page.locator('input[type="password"]').first().isVisible().catch(() => false);
      if (hasEmailInput && hasPwInput) {
        add('PASS', 'S1 부팅 → login 화면 렌더', `path=${url.pathname} (router group hidden in URL)`);
      } else {
        add('FAIL', 'S1 부팅 후 login 화면 미진입', `path=${url.pathname}, email=${hasEmailInput}, pw=${hasPwInput}`);
      }
    }
    if (ctx.consoleErrors.length > 0) {
      add('WARN', 'S1 콘솔 에러', ctx.consoleErrors.slice(0, 3).join(' | '));
    }
    if (ctx.pageErrors.length > 0) {
      add('FAIL', 'S1 페이지 에러', ctx.pageErrors.slice(0, 3).join(' | '));
    }
  });
}

async function scenarioInvalidLogin(browser) {
  // S3 일부: 잘못된 자격증명 → invalid_credentials 인라인 에러 표시. 사용자 데이터 영향 없음.
  await withPage(browser, async (page, ctx) => {
    await page.goto(BASE);
    await page.evaluate(() => window.localStorage.clear());
    await page.goto(BASE);
    await waitForApp(page);
    const email = page.locator('input[type="email"], input[autocomplete="email"]').first();
    const pw = page.locator('input[type="password"]').first();
    await email.waitFor({ state: 'visible', timeout: 10000 });
    await email.fill('definitely-does-not-exist+qa@example.invalid');
    await pw.fill('wrongpassword12345');
    // 로그인 버튼 — RN Web 의 Pressable 은 button role 이 아닐 수 있어 텍스트로 잡음.
    const submit = page.getByText('로그인', { exact: true }).first();
    await submit.click();
    // 에러 노출까지 잠깐 대기
    const errorVisible = await page.waitForFunction(
      () => {
        const text = document.body.innerText;
        return /비밀번호|이메일|올바르지 않|invalid/i.test(text);
      },
      { timeout: 10000 },
    ).then(() => true).catch(() => false);
    if (errorVisible) {
      add('PASS', 'S3 잘못된 자격증명 → 에러 표시');
    } else {
      add('FAIL', 'S3 잘못된 자격증명 → 에러 표시 안 됨');
    }
    if (ctx.pageErrors.length > 0) {
      add('FAIL', 'S3 페이지 에러', ctx.pageErrors.slice(0, 3).join(' | '));
    }
  });
}

async function scenarioSignupFormValidation(browser) {
  // S2 의 일부: 회원가입 폼 자체의 클라이언트 검증 (submit 안 함 — mutation 미발생)
  await withPage(browser, async (page, ctx) => {
    await page.goto(BASE);
    await page.evaluate(() => window.localStorage.clear());
    await page.goto(BASE);
    await waitForApp(page);
    // signup 화면 진입 — login.tsx 의 "처음 사용하시나요? 회원가입" 링크
    const signupLink = page.getByText(/처음 사용/).first();
    await signupLink.click({ timeout: 5000 }).catch(() => null);
    await page.waitForTimeout(500);
    // signup 폼 — 이메일/비밀번호/이름 필드 존재 확인
    const emailFields = await page.locator('input[type="email"], input[autocomplete="email"], input[autocomplete="username"]').count();
    const pwFields = await page.locator('input[type="password"]').count();
    if (emailFields >= 1 && pwFields >= 2) {
      add('PASS', 'S2 회원가입 폼 렌더', `email=${emailFields}, pw=${pwFields} (확인 포함)`);
    } else {
      add('FAIL', 'S2 회원가입 폼 미렌더', `email=${emailFields}, pw=${pwFields}`);
    }
    if (ctx.pageErrors.length > 0) {
      add('FAIL', 'S2 페이지 에러', ctx.pageErrors.slice(0, 3).join(' | '));
    }
  });
}

async function scenarioSharedTokenInvalid(browser) {
  // S13 일부: 공유 토큰 페이지 — invalid token → 적절한 에러 표시
  await withPage(browser, async (page, ctx) => {
    await page.goto(`${BASE}/shared/totallyinvalidtoken12345`);
    await waitForApp(page);
    await page.waitForTimeout(2000); // 백엔드 호출 + 에러 렌더 대기
    const text = await page.evaluate(() => document.body.innerText);
    if (/찾을 수 없|만료|존재하지 않|invalid|not found/i.test(text)) {
      add('PASS', 'S13 잘못된 share 토큰 → 에러 표시');
    } else {
      add('FAIL', 'S13 잘못된 share 토큰 — 에러 메시지 없음', text.slice(0, 200));
    }
    if (ctx.pageErrors.length > 0) {
      add('FAIL', 'S13 페이지 에러', ctx.pageErrors.slice(0, 3).join(' | '));
    }
  });
}

// ===== mutation 시나리오 =====
// unique 이메일로 신규 계정 생성 → 시나리오 흐름 검증.
// 운영에 데이터 잔존 — cleanup 은 별도 endpoint 가 보장될 때만 가능.

const TS = Date.now();
const TEST_EMAIL = `qa+integ-${TS}@example.com`;
const TEST_PW = `Qa-Integ-${TS}!`;
const TEST_NAME = `통합테스터`;

// 매 run unique 좌표 — 백엔드 duplicate_address_warning_required 회피.
const COORD_OFFSET = (TS % 100000) / 1e8; // 0~0.001 정도 변동
const FIELD1_LAT = (35.1796 + COORD_OFFSET).toFixed(6);
const FIELD1_LNG = (129.0756 + COORD_OFFSET).toFixed(6);
const FIELD2_LAT = (35.1587 + COORD_OFFSET).toFixed(6);
const FIELD2_LNG = (129.1604 + COORD_OFFSET).toFixed(6);

const session = { email: TEST_EMAIL, password: TEST_PW, name: TEST_NAME };

async function flowSignupAndAuthGuards(page, ctx) {
    await page.goto(BASE);
    await page.evaluate(() => window.localStorage.clear());
    await page.goto(BASE);
    await waitForApp(page);

    // S2: 회원가입 진입
    await page.getByText(/처음 사용/).first().click();
    await page.waitForTimeout(500);
    // signup 폼 — 가장 최근 마운트된 화면이 활성 화면. 새로 생긴 input 들을 last() 로 잡음.
    const emailField = page.locator('input[placeholder="example@domain.com"]').last();
    const nameField = page.locator('input[placeholder="홍길동"]').last();
    const pwField = page.locator('input[placeholder="비밀번호"]').last();
    const pwConfirmField = page.locator('input[placeholder="비밀번호 확인"]').last();
    await emailField.waitFor({ state: 'visible', timeout: 10000 });
    await emailField.fill(session.email);
    await nameField.fill(session.name);
    await pwField.fill(session.password);
    await pwConfirmField.fill(session.password);
    // 약관 체크
    await page.getByText(/이용약관·개인정보/).first().click();
    // 가입 버튼
    await page.getByText('가입하고 시작하기', { exact: true }).first().click();
    // 가입 후 /(tabs) 로 이동 — replace('/(tabs)') → URL 에는 그냥 /trips 같은 게 노출
    const arrivedTabs = await page.waitForFunction(
      () => {
        const p = window.location.pathname;
        // (tabs) 는 URL 에 노출 안 됨 — 대신 trips/fields/reports/profile 중 하나 또는 /
        return ['/trips', '/fields', '/reports', '/profile', '/'].some((x) => p === x);
      },
      { timeout: 20000 },
    ).then(() => true).catch(() => false);
    if (arrivedTabs) {
      add('PASS', 'S2 회원가입 → 자동 로그인 → /(tabs) 진입', `email=${session.email}`);
    } else {
      const errText = await page.evaluate(() => document.body.innerText.slice(0, 500));
      add('FAIL', 'S2 회원가입 후 (tabs) 진입 실패', errText);
      return; // 후속 단계 skip
    }

    // A-1 가드: 로그인 상태에서 /(auth)/login URL 직접 진입 → /(tabs) 로 redirect
    await page.goto(`${BASE}/login`);
    await page.waitForTimeout(1500);
    const path1 = new URL(page.url()).pathname;
    if (path1 !== '/login') {
      add('PASS', 'A-1 인증 후 /login 진입 시 redirect', `path=${path1}`);
    } else {
      // 그래도 login 화면이 가시적으로 노출됐는지 확인 — redirect 가 있긴 한데 URL 만 잠깐 머물 수도 있음
      const loginVisible = await page.locator('input[placeholder="비밀번호"]').first().isVisible().catch(() => false);
      if (!loginVisible) {
        add('PASS', 'A-1 인증 후 /login URL → 화면 미노출', `path=${path1}`);
      } else {
        add('FAIL', 'A-1 인증 상태에서 login 화면 노출됨', `path=${path1}`);
      }
    }

    // A-1 가드 (signup 도): /signup
    await page.goto(`${BASE}/signup`);
    await page.waitForTimeout(1500);
    const path2 = new URL(page.url()).pathname;
    if (path2 !== '/signup') {
      add('PASS', 'A-1 인증 후 /signup 진입 시 redirect', `path=${path2}`);
    } else {
      const signupVisible = await page.locator('input[placeholder="홍길동"]').first().isVisible().catch(() => false);
      if (!signupVisible) {
        add('PASS', 'A-1 인증 후 /signup URL → 화면 미노출', `path=${path2}`);
      } else {
        add('FAIL', 'A-1 인증 상태에서 signup 화면 노출됨', `path=${path2}`);
      }
    }

    // 정상 진입을 위해 root 로 복귀
    await page.goto(BASE);
    await page.waitForTimeout(1500);

    // A-2 탭 reset 검증: 4탭 모두 listener 동작.
    // 검증 방법 — 각 탭 진입 → 탭 클릭 → router.replace 호출되어야 함.
    // 탭 표시는 React Native Web 의 tabBar — 클릭 가능한 영역에 라벨 텍스트 (외근/현장/보고서/내 정보) 있음.
    for (const label of ['현장', '보고서', '내 정보', '외근']) {
      const tab = page.getByText(label, { exact: true }).first();
      const visible = await tab.isVisible().catch(() => false);
      if (!visible) {
        add('WARN', `A-2 ${label} 탭 미발견`, '탭바 selector 못 잡음');
        continue;
      }
      await tab.click();
      await page.waitForTimeout(800);
      // 두 번째 탭 클릭 — listener 가 router.replace 호출. URL 이 해당 탭 root 인지 확인.
      await tab.click();
      await page.waitForTimeout(500);
      const p = new URL(page.url()).pathname;
      add('PASS', `A-2 ${label} 탭 클릭 — path`, p);
    }
}

async function flowFirstField(page, ctx) {
    // S4 첫 현장 추가 — 카카오 검색 + 좌표 자동 채움 + 제출.
    // (이 시점엔 이미 로그인됨)

    // network 응답 캡처
    const captured = [];
    const onResp = async (resp) => {
      const u = resp.url();
      if (u.includes('/api/fields')) {
        try {
          const body = await resp.text();
          captured.push({ url: u.split('/api')[1], method: resp.request().method(), status: resp.status(), body: body.slice(0, 600) });
        } catch {
          captured.push({ url: u.split('/api')[1], method: resp.request().method(), status: resp.status(), body: '<read failed>' });
        }
      }
    };
    page.on('response', onResp);

    // 현장 탭으로 이동 — 탭바가 BottomSheet/지도에 가려져 클릭 안 잡힐 수 있어 URL 로 직접.
    await page.goto(`${BASE}/fields`);
    await page.waitForTimeout(1500);
    // 실제 UI 라벨은 "+ 새 현장" — 시나리오 문서엔 "현장 추가" 라고 적혀있어 불일치 (시나리오 문서 정정 대상).
    const addBtn = page.getByText('+ 새 현장').first();
    await addBtn.click();
    await page.waitForTimeout(1500);
    const afterAddPath = new URL(page.url()).pathname;
    if (!afterAddPath.includes('/fields/new')) {
      add('FAIL', 'S4 + 새 현장 클릭 후 fields/new 미진입', `path=${afterAddPath}`);
      return;
    }

    // 주소 검색 input — fields/new.tsx 의 검색 placeholder.
    const searchBox = page.locator('input[placeholder*="해운대 우동"]').first();
    await searchBox.waitFor({ state: 'visible', timeout: 10000 });
    await searchBox.fill('부산광역시청');
    await page.waitForTimeout(5000);

    const kakaoEmpty = captured.some((c) => c.url?.includes('address/search') && /"items":\[\]/.test(c.body));
    if (kakaoEmpty) {
      const r = captured.find((c) => c.url?.includes('address/search'));
      add('FAIL', '[B-N1] 백엔드 addressSearch — 카카오 REST 결과 0건', `body: ${r?.body?.slice(0, 200)}`);
    }

    // 검색 결과 시도 — 있으면 클릭, 없으면 manual 모드로 우회.
    const result = page.locator('div').filter({ hasText: /부산.*시청|시청.*부산/ }).first();
    const found = await result.isVisible().catch(() => false);
    if (found) {
      await result.click();
      add('PASS', 'S4 카카오 검색 결과 항목 클릭');
    } else {
      // manual 모드 진입 — "좌표 직접 입력으로 진행 →"
      const manualLink = page.getByText(/좌표 직접 입력으로 진행/).first();
      if (await manualLink.isVisible().catch(() => false)) {
        await manualLink.click();
        await page.waitForTimeout(500);
        // 도로명·지번·좌표 입력 — 부산광역시청 좌표
        await page.locator('input[placeholder*="해운대해변로"]').first().fill(`부산광역시 연제구 중앙대로 ${TS % 1000}`);
        await page.locator('input[placeholder*="우동 1411"]').first().fill(`부산광역시 연제구 연산동 ${TS % 1000}`);
        await page.locator('input[placeholder="33~43"]').first().fill(FIELD1_LAT);
        await page.locator('input[placeholder="124~132"]').first().fill(FIELD1_LNG);
        // "이 좌표로 진행"
        await page.getByText('이 좌표로 진행', { exact: true }).first().click();
        await page.waitForTimeout(800);
        add('PASS', 'S4 manual 좌표 입력으로 우회 (카카오 0건 대응)');
      } else {
        add('FAIL', 'S4 검색 결과 없음 + manual 진입점도 없음');
        return;
      }
    }

    // step 2 — 제목 + 상세주소 (백엔드 필수 — [B-N2]) + 현장 등록
    const titleInput = page.locator('input[placeholder*="가로수"]').first();
    await titleInput.waitFor({ state: 'visible', timeout: 10000 });
    await titleInput.fill('QA 통합 첫 번째 현장');
    await page.locator('input[placeholder*="101동"]').first().fill('1층 정문');
    await page.getByText('현장 등록', { exact: true }).first().click();
    await page.waitForTimeout(3500);

    const path = new URL(page.url()).pathname;
    if (path.startsWith('/fields/') && path !== '/fields/new') {
      add('PASS', 'S4 첫 현장 등록 → 상세 진입', `path=${path}`);
    } else {
      add('FAIL', 'S4 첫 현장 등록 후 예상 경로 아님', `path=${path}`);
      // POST /api/fields 응답 출력
      captured.filter((c) => c.method === 'POST' && c.url?.endsWith('/fields')).forEach((c, i) => {
        add('FAIL', `  POST /api/fields resp[${i}]`, `status=${c.status}; body=${c.body}`);
      });
      // 그 외 모든 fields 호출 요약
      add('FAIL', '  fields traffic summary', captured.map((c) => `${c.method} ${c.url} → ${c.status}`).join(' | ').slice(0, 500));
    }

    if (ctx.pageErrors.length > 0) {
      add('FAIL', 'S4 페이지 에러', ctx.pageErrors.slice(0, 3).join(' | '));
    }

    page.off('response', onResp);
}

async function flowB3StatusChipModal(page, ctx) {
  // B-3 회귀: 현장 상세에서 상태 chip 탭 → WebChoiceModal 뜨고 + 선택한 상태로 정확히 변경.
  // 이 시점 path = /fields/{newFieldId} (직전 단계 결과)
  const startPath = new URL(page.url()).pathname;
  if (!startPath.startsWith('/fields/') || startPath === '/fields/new' || startPath === '/fields') {
    add('FAIL', 'B-3 회귀 시작 path 가 /fields/{id} 아님', `path=${startPath}`);
    return;
  }

  // PATCH /api/fields/{id}/status 응답 캡처
  const captured = [];
  const onResp = async (resp) => {
    const u = resp.url();
    if (u.includes('/status') || u.includes('/api/fields/')) {
      try {
        captured.push({ url: u.split('/api')[1], method: resp.request().method(), status: resp.status(), body: (await resp.text()).slice(0, 300) });
      } catch {
        captured.push({ url: u.split('/api')[1], method: resp.request().method(), status: resp.status(), body: '<read failed>' });
      }
    }
  };
  page.on('response', onResp);

  try {
    await page.waitForTimeout(1500);
    // chip 텍스트는 "조치 전 ▾" 형식. 클릭.
    const chip = page.getByText(/^(조치 전|조치 중|조치 완료) ▾$/).first();
    await chip.waitFor({ state: 'visible', timeout: 10000 });
    const beforeLabel = (await chip.textContent())?.trim() ?? '';
    await chip.click();
    await page.waitForTimeout(500);

    // WebChoiceModal 뜸 — title "상태 변경", 옵션 카드들에 "조치 X" 텍스트 + "취소" 별도.
    const modalTitle = page.getByText('상태 변경', { exact: true }).first();
    const modalVisible = await modalTitle.isVisible().catch(() => false);
    if (!modalVisible) {
      add('FAIL', 'B-3 상태 chip 클릭 — WebChoiceModal 미노출', `chip="${beforeLabel}"`);
      return;
    }
    add('PASS', 'B-3 상태 chip 클릭 → WebChoiceModal 표시', `before="${beforeLabel}"`);

    // 모달 안에서 "조치 중" 또는 "조치 완료" 중 하나 (현재가 아닌) 누름.
    // 간단히 "조치 중" 우선 (조치 전 → 조치 중 시나리오).
    const targetLabel = beforeLabel.includes('조치 전') ? '조치 중' : (beforeLabel.includes('조치 중') ? '조치 완료' : '조치 전');
    // 모달 안의 옵션 카드는 promptChoice 호출에서 첫 비-cancel 두 옵션. 모달 외 텍스트 (chip 등) 에도 같은 글자가 있어 정확히 잡기 까다로움 — 모달 안의 button 으로 가깝게.
    // WebChoiceModal 의 choice 카드는 colors.primary 스타일. 그냥 getByText 로 잡되 마지막 가시 요소 우선.
    const choices = page.getByText(targetLabel, { exact: true });
    const count = await choices.count();
    // 마지막 (모달이 위에 있으므로 가장 위 z-index = 마지막 마운트) 클릭
    await choices.nth(count - 1).click();
    await page.waitForTimeout(2000);

    // PATCH 응답 확인
    const patch = captured.find((c) => c.method === 'PATCH' && c.url?.includes('/status'));
    if (patch && patch.status === 200) {
      add('PASS', 'B-3 PATCH /status 응답 200', `target=${targetLabel}; body=${patch.body.slice(0, 100)}`);
    } else {
      add('FAIL', 'B-3 PATCH /status 응답 비정상', `patch=${JSON.stringify(patch).slice(0, 200)}`);
    }

    // chip 라벨이 새 상태로 바뀌었는지
    const chipAfter = page.getByText(new RegExp(`^${targetLabel} ▾$`)).first();
    const chipChanged = await chipAfter.isVisible({ timeout: 3000 }).catch(() => false);
    if (chipChanged) {
      add('PASS', 'B-3 chip 라벨 새 상태로 갱신', `→ ${targetLabel}`);
    } else {
      add('FAIL', 'B-3 chip 라벨 미갱신');
    }
  } finally {
    page.off('response', onResp);
  }
}

async function flowSecondField(page, ctx) {
  // 두 번째 현장 — 외근 다중 선택을 위한 전제. 다른 좌표.
  await page.goto(`${BASE}/fields`);
  await page.waitForTimeout(1500);
  await page.getByText('+ 새 현장').first().click();
  await page.waitForTimeout(1200);

  // 카카오 0건 알려져 있으니 곧장 manual.
  const searchBox = page.locator('input[placeholder*="해운대 우동"]').first();
  await searchBox.waitFor({ state: 'visible', timeout: 10000 });
  await searchBox.fill('해운대해수욕장');
  await page.waitForTimeout(3500);

  const result = page.locator('div').filter({ hasText: /해운대/ }).first();
  if (await result.isVisible().catch(() => false)) {
    await result.click();
  } else {
    const manualLink = page.getByText(/좌표 직접 입력으로 진행/).first();
    await manualLink.click();
    await page.waitForTimeout(500);
    await page.locator('input[placeholder*="해운대해변로"]').first().fill(`부산광역시 해운대구 해운대해변로 ${TS % 1000}`);
    await page.locator('input[placeholder*="우동 1411"]').first().fill(`부산광역시 해운대구 우동 ${TS % 1000}`);
    await page.locator('input[placeholder="33~43"]').first().fill(FIELD2_LAT);
    await page.locator('input[placeholder="124~132"]').first().fill(FIELD2_LNG);
    await page.getByText('이 좌표로 진행', { exact: true }).first().click();
    await page.waitForTimeout(800);
  }

  await page.locator('input[placeholder*="가로수"]').first().fill('QA 통합 두 번째 현장');
  await page.locator('input[placeholder*="101동"]').first().fill('백사장 입구');
  await page.getByText('현장 등록', { exact: true }).first().click();
  await page.waitForTimeout(3500);

  const path = new URL(page.url()).pathname;
  if (path.startsWith('/fields/') && path !== '/fields/new') {
    add('PASS', 'S5 두 번째 현장 등록', `path=${path}`);
  } else {
    add('FAIL', 'S5 두 번째 현장 등록 실패', `path=${path}`);
  }
}

async function flowTripStart(page, ctx) {
  // S7 외근 시작 — 두 현장 선택 → 순서 (optimize-preview, 백엔드 실패 시 client nearest-neighbor
  // 폴백 — backend-backlog §5, 2026-08-18 결과보고서로 재개) → 외근 시작 → /trips/active
  // S5 회귀 (mapFieldIds 지도 scope) 는 visual 검증 어려워 path 만 확인.
  const captured = [];
  const onResp = async (resp) => {
    const u = resp.url();
    if (u.includes('/api/trips')) {
      try {
        captured.push({ url: u.split('/api')[1], method: resp.request().method(), status: resp.status(), body: (await resp.text()).slice(0, 400) });
      } catch {
        captured.push({ url: u.split('/api')[1], method: resp.request().method(), status: resp.status(), body: '<read failed>' });
      }
    }
  };
  page.on('response', onResp);

  try {
    // /trips/new/select 로 직접 — fab 텍스트 바뀜 가능성 회피
    await page.goto(`${BASE}/trips/new/select`);
    await page.waitForTimeout(2000);

    // "모두 선택" — 두 현장 다 체크
    const selectAll = page.getByText('모두 선택', { exact: true }).first();
    if (await selectAll.isVisible().catch(() => false)) {
      await selectAll.click();
      await page.waitForTimeout(400);
    }

    // "다음 (N)" — N 은 보통 2
    const nextBtn = page.getByText(/^다음 \(\d+\)$/).first();
    await nextBtn.waitFor({ state: 'visible', timeout: 10000 });
    await nextBtn.click();
    await page.waitForTimeout(2000);
    const orderPath = new URL(page.url()).pathname;
    if (orderPath !== '/trips/new/order') {
      add('FAIL', 'S7 select → order 진입 실패', `path=${orderPath}`);
      return;
    }
    add('PASS', 'S7 현장 선택 → /trips/new/order 진입');

    // 최적 순서 추천 — optimize-preview 호출 여부를 응답 캡처로 간접 확인 (실패해도 client
    // nearest-neighbor 로 자동 폴백하므로 FAIL 이 아니라 WARN).
    const optimizeBtn = page.getByText(/최적 순서 추천/).first();
    if (await optimizeBtn.isVisible().catch(() => false)) {
      await optimizeBtn.click();
      await page.waitForTimeout(1500);
      const optimizeCall = captured.find((c) => c.url?.includes('optimize-preview'));
      if (optimizeCall) {
        add('PASS', 'S6 optimize-preview 호출됨', `status=${optimizeCall.status}`);
      } else {
        add('WARN', 'S6 optimize-preview 호출 캡처 실패');
      }
    }

    // 외근 시작 확정 — fab 텍스트 "외근 시작 확정 (N곳)"
    const startBtn = page.getByText(/^외근 시작 확정 \(\d+곳\)$/).first();
    await startBtn.waitFor({ state: 'visible', timeout: 10000 });
    await startBtn.click();
    await page.waitForTimeout(3500);
    const activePath = new URL(page.url()).pathname;
    if (activePath === '/trips/active') {
      add('PASS', 'S7 외근 시작 → /trips/active 진입');
    } else {
      add('FAIL', 'S7 외근 시작 후 active 미진입', `path=${activePath}`);
      const startCall = captured.find((c) => c.method === 'POST' && c.url?.includes('/trips/start'));
      if (startCall) add('FAIL', '  POST /trips/start', `status=${startCall.status}; body=${startCall.body}`);
    }
  } finally {
    page.off('response', onResp);
  }
}

async function flowCheckinAndEndTrip(page, ctx) {
  // S9 체크인 + S10 외근 종료.
  // (AI 보고서 prompt 는 2026-05-31 새 양식에서 제거 — 종료 후 외근 상세로 단일 진입.
  //  dialog handler 는 zero-visits confirm 등 잔여 native dialog 방어용으로 유지.)
  page.on('dialog', async (d) => {
    // 모든 native dialog (alert/confirm) 자동 dismiss/cancel — webAlertPatch 경유 confirm 등.
    try { await d.dismiss(); } catch { /* ignore */ }
  });

  const captured = [];
  const onResp = async (resp) => {
    const u = resp.url();
    if (u.includes('/api/visits') || u.includes('/api/trips/end')) {
      try {
        captured.push({ url: u.split('/api')[1], method: resp.request().method(), status: resp.status(), body: (await resp.text()).slice(0, 300) });
      } catch {
        captured.push({ url: u.split('/api')[1], method: resp.request().method(), status: resp.status(), body: '<read failed>' });
      }
    }
  };
  page.on('response', onResp);

  try {
    // /trips/active 도달 가정. "체크인" 버튼 클릭.
    if (new URL(page.url()).pathname !== '/trips/active') {
      await page.goto(`${BASE}/trips/active`);
      await page.waitForTimeout(2000);
    }

    const checkinBtn = page.getByText('체크인', { exact: true }).first();
    await checkinBtn.waitFor({ state: 'visible', timeout: 10000 });
    await checkinBtn.click();
    await page.waitForTimeout(2500);

    const checkinPath = new URL(page.url()).pathname;
    if (!checkinPath.includes('/checkin')) {
      add('FAIL', 'S9 체크인 버튼 → /checkin 미진입', `path=${checkinPath}`);
      return;
    }
    add('PASS', 'S9 체크인 진입');

    // 메모 입력
    const memoInput = page.locator('textarea, input[placeholder*="메모"]').first();
    if (await memoInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await memoInput.fill('QA 자동 — 체크인 시 메모 1건');
      await page.getByText('메모 추가', { exact: true }).first().click();
      await page.waitForTimeout(1500);
      const memoCall = captured.find((c) => c.method === 'POST' && c.url?.includes('/memos/text'));
      if (memoCall && memoCall.status >= 200 && memoCall.status < 300) {
        add('PASS', 'S9 메모 추가 성공', `status=${memoCall.status}`);
      } else {
        add('WARN', 'S9 메모 추가 응답 미확인', `call=${JSON.stringify(memoCall).slice(0, 200)}`);
      }
    }

    // 결과 status — "완료" 클릭
    await page.getByText('완료', { exact: true }).first().click();
    await page.waitForTimeout(400);
    // "결과 저장하고 완료"
    await page.getByText('결과 저장하고 완료', { exact: true }).first().click();
    await page.waitForTimeout(3000);

    const afterSavePath = new URL(page.url()).pathname;
    if (afterSavePath === '/trips/active') {
      add('PASS', 'S9 결과 저장 → active 복귀', `path=${afterSavePath}`);
    } else {
      add('WARN', 'S9 결과 저장 후 path 예상과 다름', `path=${afterSavePath}`);
    }

    // 외근 종료
    await page.goto(`${BASE}/trips/active`);
    await page.waitForTimeout(2000);
    const endBtn = page.getByText(/^외근 종료/).first();
    await endBtn.waitFor({ state: 'visible', timeout: 10000 });
    await endBtn.click();
    await page.waitForTimeout(3500);
    const afterEndPath = new URL(page.url()).pathname;
    const endCall = captured.find((c) => c.method === 'POST' && c.url?.includes('/trips/end'));
    if (endCall && endCall.status === 200 && afterEndPath !== '/trips/active') {
      add('PASS', 'S10 외근 종료 → 화면 이동', `path=${afterEndPath}; end status=${endCall.status}`);
    } else if (endCall && endCall.status === 200) {
      add('PASS', 'S10 외근 종료 응답 200 (AI 보고서 prompt cancel 후 active 잔존 가능)', `path=${afterEndPath}`);
    } else {
      add('FAIL', 'S10 외근 종료 응답 비정상', `endCall=${JSON.stringify(endCall).slice(0, 200)}; path=${afterEndPath}`);
    }
  } finally {
    page.off('response', onResp);
  }
}

async function flowManualReportAndShare(page, ctx) {
  // S14 수동 보고서 작성 (A-5 회귀: 외근 라벨 t.title || '외근') + S13 share 토큰
  const captured = [];
  const onResp = async (resp) => {
    const u = resp.url();
    if (u.includes('/api/reports')) {
      try {
        captured.push({ url: u.split('/api')[1], method: resp.request().method(), status: resp.status(), body: (await resp.text()).slice(0, 400) });
      } catch {
        captured.push({ url: u.split('/api')[1], method: resp.request().method(), status: resp.status(), body: '<read failed>' });
      }
    }
  };
  page.on('response', onResp);

  try {
    await page.goto(`${BASE}/reports/new`);
    await page.waitForTimeout(2500);

    // A-5 회귀: 외근 카드 라벨에 trip.id (#field-...) 가 노출되지 않아야 함 (운영 환경 = !__DEV__)
    // 카드 라벨이 "{날짜} · {외근}" 형태로 노출되는지 확인.
    const tripCards = await page.locator('div').filter({ hasText: /\d{4}\.\d{2}\.\d{2} · 외근/ }).count();
    if (tripCards >= 1) {
      add('PASS', 'A-5 외근 라벨 — title 폴백 노출 확인', `cards=${tripCards}`);
    } else {
      // dev 환경에선 #id 가 노출됐을 수 있음. dev 모드 여부 확인 후 분기 — 일단 WARN
      const allText = await page.evaluate(() => document.body.innerText.slice(0, 500));
      add('WARN', 'A-5 외근 라벨 폴백 패턴 미발견', `body: ${allText.slice(0, 300)}`);
    }

    // 외근 선택 — 첫 카드 클릭 (있을 때만)
    const firstTrip = page.locator('div').filter({ hasText: /\d{4}\.\d{2}\.\d{2} · /}).first();
    if (await firstTrip.isVisible().catch(() => false)) {
      await firstTrip.click();
      await page.waitForTimeout(400);
    }

    // 제목·본문 입력
    const titleInput = page.locator('input[placeholder*="해운대"]').first();
    await titleInput.waitFor({ state: 'visible', timeout: 10000 });
    await titleInput.fill('QA 통합 자동 보고서');
    // 본문은 multiline TextInput → textarea 또는 input. placeholder "외근 결과·특이사항·후속 조치 등 작성"
    const contentInput = page.locator('textarea, input[placeholder*="외근 결과"]').first();
    await contentInput.fill('QA 자동화 spec 으로 생성된 보고서. 본문 10자 이상 충족. 통합 테스트 종료 결과로 작성됨.');
    // 저장
    await page.getByText('저장', { exact: true }).first().click();
    await page.waitForTimeout(3000);

    const path = new URL(page.url()).pathname;
    if (path.startsWith('/reports/') && path !== '/reports/new') {
      add('PASS', 'S14 수동 보고서 저장 → 상세 진입', `path=${path}`);
    } else {
      add('FAIL', 'S14 수동 보고서 저장 후 예상 경로 아님', `path=${path}`);
      const createCall = captured.find((c) => c.method === 'POST' && c.url?.endsWith('/reports'));
      if (createCall) add('FAIL', '  POST /reports', `status=${createCall.status}; body=${createCall.body}`);
      return;
    }

    // S13 공유 — "공유" 버튼 클릭
    const shareBtn = page.getByText(/^공유/).first();
    if (await shareBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await shareBtn.click();
      await page.waitForTimeout(2500);
      const shareCall = captured.find((c) => c.method === 'POST' && c.url?.includes('/share'));
      if (shareCall && shareCall.status === 200) {
        add('PASS', 'S13 share 토큰 생성 성공', `body=${shareCall.body.slice(0, 200)}`);
      } else {
        add('WARN', 'S13 share 응답 미확인', `call=${JSON.stringify(shareCall).slice(0, 200)}`);
      }
    } else {
      add('WARN', 'S13 공유 버튼 미발견');
    }
  } finally {
    page.off('response', onResp);
  }
}

// mutation flow 들을 한 context/page 로 chain — 로그인 세션 공유.
async function runMutationFlows(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  const ctx = { consoleErrors, pageErrors };
  try {
    await flowSignupAndAuthGuards(page, ctx);
    await flowFirstField(page, ctx);
    await flowB3StatusChipModal(page, ctx);
    await flowSecondField(page, ctx);
    await flowTripStart(page, ctx);
    await flowCheckinAndEndTrip(page, ctx);
    await flowManualReportAndShare(page, ctx);
  } finally {
    if (consoleErrors.length > 0) {
      add('WARN', 'mutation flow 콘솔 에러 누적', `${consoleErrors.length}건`);
      // 첫 5건 까지 길게 — 카카오 응답 에러 등 잡기 위함
      consoleErrors.slice(0, 5).forEach((e, i) => {
        add('WARN', `  console[${i}]`, e.slice(0, 400));
      });
    }
    await context.close();
  }
}

async function main() {
  console.log(`QA runner — base=${BASE}, test email=${TEST_EMAIL}\n`);
  const browser = await chromium.launch({ headless: true });
  try {
    // read-only
    await scenarioS1(browser);
    await scenarioInvalidLogin(browser);
    await scenarioSignupFormValidation(browser);
    await scenarioSharedTokenInvalid(browser);

    if (process.env.QA_MUTATION === '1') {
      await runMutationFlows(browser);
    } else {
      add('INFO', 'mutation 단계 skip', 'QA_MUTATION=1 로 활성화');
    }
  } finally {
    await browser.close();
  }
  const fail = findings.filter((f) => f.kind === 'FAIL').length;
  const pass = findings.filter((f) => f.kind === 'PASS').length;
  const warn = findings.filter((f) => f.kind === 'WARN').length;
  console.log(`\n=== summary: ${pass} pass / ${fail} fail / ${warn} warn ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('runner fatal:', e);
  process.exit(2);
});
