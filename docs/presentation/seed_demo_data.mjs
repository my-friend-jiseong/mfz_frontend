// 발표용 데모 데이터 자가 시드 (프론트가 직접 API 로 생성) — 부산 기준 대규모 세트.
//
// 만드는 것: 프로젝트 1 · 현장 30(부산 10개 구 × 3시설, 상태 분산, 카카오 지오코딩) ·
//            완결 외근 6(권역별, 방문 다수) · 보고서 6(각 방문 현장 전·중·후 사진 URL 포함).
// 백엔드 의존 없음 — field_report 사진 URL 저장은 probe 검증(2026-06-01).
//
//   사전: Node 18+ (전역 fetch). 운영 도메인(ilgayo.co.kr)에 그대로 실행 OK — 단, 발표용 테스트 계정으로.
//   실행(PowerShell):
//     $env:SEED_EMAIL="demo2@ilgayo.co.kr"; $env:SEED_PW="<데모 계정 비밀번호>"; $env:SEED_NAME="정현우"; node docs/presentation/seed_demo_data.mjs
//   옵션 env:
//     SEED_BASE       API 베이스 (기본 https://ilgayo.co.kr).
//     SEED_NAME       주어지면 먼저 회원가입(signup) 시도 → 이미 있으면 login 폴백. (시연용 새 계정 생성)
//     SEED_FORCE_END  "1" 이면 기존 active 외근을 강제 종료하고 진행(기본은 active 있으면 중단).
//
// 방문이 박힌 현장·외근은 삭제가 막히므로(409/404), 다시 깔끔히 만들려면 새 계정에 1회 실행 권장.

const BASE = (process.env.SEED_BASE ?? 'https://ilgayo.co.kr').replace(/\/$/, '');
const EMAIL = process.env.SEED_EMAIL;
const PW = process.env.SEED_PW;
const NAME = process.env.SEED_NAME;
const FORCE_END = process.env.SEED_FORCE_END === '1';

if (!EMAIL || !PW) {
  console.error('✖ SEED_EMAIL / SEED_PW 환경변수가 필요합니다. (발표용 테스트 계정으로 실행)');
  process.exit(1);
}

let TOKEN = null;

async function api(path, { method = 'GET', body, query, auth = true } = {}) {
  const url = new URL(BASE + (path.startsWith('/') ? path : `/${path}`));
  if (query) for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.append(k, String(v));
  const headers = { 'Content-Type': 'application/json' };
  if (auth && TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!res.ok) {
    const code = data && typeof data === 'object' ? data.code : undefined;
    const msg = data && typeof data === 'object' && data.message ? data.message : `HTTP ${res.status}`;
    throw new Error(`${method} ${path} → ${res.status} ${code ?? ''} ${msg}`);
  }
  return data;
}

// ── 부산 데이터 정의 ─────────────────────────────────────────────────────────
const PROJECT_NAME = '2026 상반기 부산 시설 정기점검';

// 10개 구 × 도로 + 근사 좌표(지오코딩 실패 시 폴백)
const DISTRICTS = [
  { place: '서면', gu: '부산진구', road: '중앙대로',   lat: 35.1577, lng: 129.0594 },
  { place: '센텀', gu: '해운대구', road: '센텀중앙로', lat: 35.1690, lng: 129.1300 },
  { place: '사상', gu: '사상구',   road: '광장로',     lat: 35.1620, lng: 128.9910 },
  { place: '남포', gu: '중구',     road: '중앙대로',   lat: 35.1019, lng: 129.0356 },
  { place: '대연', gu: '남구',     road: '수영로',     lat: 35.1366, lng: 129.0843 },
  { place: '광안', gu: '수영구',   road: '수영로',     lat: 35.1456, lng: 129.1130 },
  { place: '연산', gu: '연제구',   road: '중앙대로',   lat: 35.1762, lng: 129.0756 },
  { place: '동래', gu: '동래구',   road: '충렬대로',   lat: 35.2049, lng: 129.0836 },
  { place: '장전', gu: '금정구',   road: '중앙대로',   lat: 35.2429, lng: 129.0925 },
  { place: '하단', gu: '사하구',   road: '낙동대로',   lat: 35.1043, lng: 128.9747 },
];
const FACILITIES = ['본관', '지하기계실', '옥상설비', '펌프실', '전기실', '저수조', '보일러실', '변전실', '환기설비', '소방설비'];
const CATS = ['정기점검', '신규설치', '긴급보수'];
const STATUSES = ['done', 'in_progress', 'pending', 'pending'];

function detailFor(fac) {
  if (['지하기계실', '보일러실', '펌프실', '변전실', '전기실'].includes(fac)) return '지하 1층';
  if (['옥상설비', '환기설비'].includes(fac)) return '옥상';
  if (['저수조', '소방설비'].includes(fac)) return '지하 2층';
  if (fac === '본관') return '본관 1층';
  return '1층';
}

// 30 현장 생성 (구당 3시설)
const FIELDS = [];
let n = 0;
for (let i = 0; i < DISTRICTS.length; i++) {
  const d = DISTRICTS[i];
  for (let j = 0; j < 3; j++) {
    const fac = FACILITIES[(i * 3 + j) % FACILITIES.length];
    const num = 100 + ((i * 3 + j) * 7) % 800;
    FIELDS.push({
      name: `${d.place} ${fac}`,
      place: d.place,
      gu: d.gu,
      road: `부산 ${d.gu} ${d.road} ${num}`,
      detail: detailFor(fac),
      cat: CATS[n % CATS.length],
      status: STATUSES[n % STATUSES.length],
      fallback: { lat: d.lat + (j - 1) * 0.0025, lng: d.lng + (j - 1) * 0.0025 },
    });
    n++;
  }
}

// 6 외근 — 권역별 방문 현장 인덱스 (구당 0,1,2 / 센텀 3,4,5 / ... / 하단 27,28,29)
const TRIP_GROUPS = [
  [0, 1, 2, 18, 19],     // 서면 + 연산
  [3, 4, 5, 15, 16],     // 센텀 + 광안
  [6, 7, 8, 27, 28],     // 사상 + 하단
  [9, 10, 11, 12, 13],   // 남포 + 대연
  [21, 22, 23, 24, 25],  // 동래 + 장전
  [14, 17, 20, 26, 29],  // 잔여 권역 순회
];

const photo = (idx, phase) => `https://picsum.photos/seed/f${idx}${phase}/1024/768`;
const visitStatusFor = (idx) => (idx % 7 === 0 ? 'revisit_needed' : idx % 11 === 0 ? 'absent' : 'completed');

async function geocode(field) {
  try {
    const r = await api('/api/fields/address/search', { query: { keyword: field.road } });
    const it = r?.items?.[0];
    if (it && typeof it.lat === 'number' && typeof it.lng === 'number') {
      return { lat: it.lat, lng: it.lng, sido: it.sido, sigungu: it.sigungu, roadAddress: it.roadAddress ?? field.road };
    }
  } catch { /* 폴백 */ }
  return { ...field.fallback, sido: '부산', sigungu: field.gu, roadAddress: field.road };
}

async function main() {
  console.log(`\n▶ SEED 대상: ${BASE}  계정: ${EMAIL}\n`);

  // 1) 인증 — SEED_NAME 있으면 회원가입 시도(시연용 새 계정), 실패 시 로그인 폴백
  if (NAME) {
    try {
      const s = await api('/auth/signup', {
        method: 'POST', auth: false,
        body: { email: EMAIL, password: PW, passwordConfirm: PW, name: NAME, termsAgreed: true },
      });
      TOKEN = s.accessToken;
      console.log(`✓ 회원가입: ${s.user?.name ?? NAME} (${EMAIL})`);
    } catch (e) {
      console.warn(`  · 회원가입 건너뜀(이미 존재 등): ${e.message}`);
    }
  }
  if (!TOKEN) {
    const s = await api('/auth/login', { method: 'POST', auth: false, body: { email: EMAIL, password: PW } });
    TOKEN = s.accessToken;
    console.log(`✓ 로그인: ${s.user?.name ?? EMAIL}`);
  }

  // 2) active 외근 가드
  const active = await api('/api/trips/active');
  if (active?.isActive) {
    if (!FORCE_END) {
      console.error(`✖ 진행 중 외근(tripId=${active.tripId})이 있습니다. SEED_FORCE_END=1 로 강제 종료 후 재실행하세요.`);
      process.exit(1);
    }
    await api('/api/trips/end', { method: 'POST', body: { forceEndWithoutVisit: true } });
    console.log(`✓ 기존 active 외근 강제 종료`);
  }

  // 3) 프로젝트 (있으면 재사용)
  let projectId;
  const existing = (await api('/api/projects', { query: { limit: 100 } }))?.items?.find((p) => p.name === PROJECT_NAME);
  if (existing) {
    projectId = existing.projectId ?? existing.id;
    console.log(`✓ 프로젝트 재사용: ${PROJECT_NAME} (${projectId})`);
  } else {
    const project = await api('/api/projects', { method: 'POST', body: { name: PROJECT_NAME } });
    projectId = project.projectId ?? project.id;
    console.log(`✓ 프로젝트 생성: ${PROJECT_NAME} (${projectId})`);
  }

  // 4) 현장 30 (지오코딩 + 상태 분산)
  console.log(`\n── 현장 ${FIELDS.length}건 ──`);
  const ids = [];
  for (const f of FIELDS) {
    const geo = await geocode(f);
    const res = await api('/api/fields', {
      method: 'POST',
      body: {
        name: f.name, status: f.status,
        roadAddress: geo.roadAddress, detailAddress: f.detail,
        lat: geo.lat, lng: geo.lng, sido: geo.sido, sigungu: geo.sigungu,
        projectId, categories: [f.cat],
      },
    });
    ids.push(res.fieldId ?? res.field?.fieldId);
    process.stdout.write(`  ✓ ${f.name} [${f.status}] ${geo.lat.toFixed(4)},${geo.lng.toFixed(4)}\n`);
  }

  // 5) 외근 6 + 방문 + 6 보고서(전·중·후 사진)
  console.log(`\n── 외근 ${TRIP_GROUPS.length}건 + 보고서 ──`);
  for (let k = 0; k < TRIP_GROUPS.length; k++) {
    const group = TRIP_GROUPS[k];
    const places = [...new Set(group.map((idx) => FIELDS[idx].place))];
    const title = `${places.slice(0, 2).join('·')} 정기점검 ${k + 1}차`;

    const start = await api('/api/trips/start', { method: 'POST', body: { title } });
    const tripId = start.tripId;
    for (const idx of group) {
      const ci = await api('/api/visits/check-in', { method: 'POST', body: { fieldId: ids[idx] } });
      await api(`/api/visits/${ci.visitId}/status`, { method: 'PATCH', body: { status: visitStatusFor(idx) } });
    }
    await api('/api/trips/end', { method: 'POST', body: {} });

    const report = await api('/api/reports', { method: 'POST', body: { title: `${title} 결과`, tripId } });
    for (const idx of group) {
      await api(`/api/reports/${report.id}/field-reports`, {
        method: 'POST',
        body: {
          fieldId: ids[idx],
          beforePhotoUrl: photo(idx, 'b'), beforePhotoCaption: '점검 전',
          pendingPhotoUrl: photo(idx, 'p'), pendingPhotoCaption: '조치 중',
          afterPhotoUrl: photo(idx, 'a'), afterPhotoCaption: '조치 완료',
        },
      });
    }
    console.log(`  ✓ ${title} — 방문 ${group.length} · 보고서+사진 (report ${report.id})`);
  }

  console.log(`\n✔ 시드 완료: 현장 ${FIELDS.length} · 외근 ${TRIP_GROUPS.length} · 보고서 ${TRIP_GROUPS.length}. 백엔드 의존 없음.`);
}

main().catch((e) => { console.error('\n✖ 시드 실패:', e.message); process.exit(1); });
