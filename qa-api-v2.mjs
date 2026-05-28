// ERD v2 API 계약 검증 — 운영 백엔드(https://ilgayo.co.kr) 에 프론트와 동일한 요청을
// 그대로 태워 §8 미확정 계약(visit status·field_reports·projects·location shape) 을 확인.
// Node fetch (CORS 무관). 각 호출의 status + body 를 출력.

const BASE = (process.env.EXPO_PUBLIC_API_BASE_URL || 'https://ilgayo.co.kr').replace(/\/$/, '');
let TOKEN = null;

function short(v, n = 700) {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s && s.length > n ? s.slice(0, n) + '…' : s;
}

async function call(method, path, { body, multipart, auth = true } = {}) {
  const headers = {};
  if (!multipart) headers['Content-Type'] = 'application/json';
  if (auth && TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
  let res, text, parsed;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
    });
    text = await res.text();
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  } catch (e) {
    console.log(`✗ ${method} ${path} — NETWORK ${e.message}`);
    return { ok: false, status: 0, body: null };
  }
  const tag = res.ok ? '✓' : '✗';
  console.log(`${tag} ${method} ${path} → ${res.status}`);
  console.log('   ', short(parsed));
  return { ok: res.ok, status: res.status, body: parsed };
}

function pick(obj, keys) {
  if (!obj || typeof obj !== 'object') return obj;
  const o = {};
  for (const k of keys) if (k in obj) o[k] = obj[k];
  return o;
}

const stamp = Date.now();
const EMAIL = `qa-erdv2-${stamp}@example.com`;
const PASSWORD = 'QaErdV2-Pass1!';
const NAME = 'ERDv2테스터';

console.log('=== BASE', BASE, '===\n');

// ---- 1. AUTH ----
console.log('## 1. AUTH');
let s = await call('POST', '/auth/signup', {
  auth: false,
  body: { email: EMAIL, password: PASSWORD, passwordConfirm: PASSWORD, name: NAME, termsAgreed: true },
});
if (s.ok && s.body?.accessToken) {
  TOKEN = s.body.accessToken;
} else {
  // 이미 있으면 로그인
  const l = await call('POST', '/auth/login', { auth: false, body: { email: EMAIL, password: PASSWORD } });
  if (l.ok && l.body?.accessToken) TOKEN = l.body.accessToken;
}
console.log('   token?', !!TOKEN, '\n');
if (!TOKEN) { console.log('인증 실패 — 중단'); process.exit(1); }

await call('GET', '/api/me');

// ---- 2. PROJECTS (신규) ----
console.log('\n## 2. PROJECTS');
await call('GET', '/api/projects');
const proj = await call('POST', '/api/projects', { body: { name: `QA프로젝트-${stamp}` } });
const projectId = proj.body?.id ?? proj.body?.data?.id;
if (projectId) await call('GET', `/api/projects/${projectId}`);

// ---- 3. FIELDS (v2 계약) ----
console.log('\n## 3. FIELDS');
const fieldBody = {
  name: `QA현장-${stamp}`,
  status: 'pending',
  roadAddress: '부산광역시 연제구 중앙대로 1001',
  detailAddress: 'QA 1동',
  lat: 35.1798,
  lng: 129.0750,
  ...(projectId ? { projectId } : {}),
  categories: ['가로수', 'QA'],
};
const fc = await call('POST', '/api/fields', { body: fieldBody });
const fieldId = fc.body?.fieldId ?? fc.body?.field?.fieldId ?? fc.body?.id;
console.log('   fieldId =', fieldId);
await call('GET', '/api/fields/mine');
if (fieldId) {
  const fd = await call('GET', `/api/fields/${fieldId}`);
  console.log('   [현장 상세 핵심 필드]', short(pick(fd.body, ['fieldId', 'userId', 'assigneeUserId', 'projectId', 'categories', 'tags', 'roadAddress', 'detailAddress', 'sido', 'sigungu', 'lat', 'lng', 'location'])));
  // 현장 메모/사진 (현장 전용)
  await call('POST', `/api/fields/${fieldId}/memos`, { body: { text: 'QA 현장 메모' } });
}

// ---- 4. TRIPS + VISITS ----
console.log('\n## 4. TRIPS + VISITS');
const ts = await call('POST', '/api/trips/start', { body: { title: `QA외근-${stamp}` } });
const tripId = ts.body?.tripId ?? ts.body?.id;
console.log('   tripId =', tripId);
await call('GET', '/api/trips/active');
let visitId = null;
if (fieldId) {
  const ci = await call('POST', '/api/visits/check-in', { body: { fieldId } });
  visitId = ci.body?.visitId ?? ci.body?.id;
  console.log('   visitId =', visitId);
}
if (visitId) {
  // §8: PATCH /api/visits/:id/status 존속·body 확인
  await call('PATCH', `/api/visits/${visitId}/status`, { body: { status: 'completed' } });
  if (tripId) await call('GET', `/api/trips/${tripId}/visits/${visitId}`);
}

// ---- 5. REPORTS + FIELD-REPORTS ----
console.log('\n## 5. REPORTS');
const rc = await call('POST', '/api/reports', { body: { title: `QA보고서-${stamp}`, ...(tripId ? { tripId } : {}) } });
const reportId = rc.body?.id ?? rc.body?.reportId;
console.log('   reportId =', reportId);
if (reportId) {
  const rd = await call('GET', `/api/reports/${reportId}`);
  console.log('   [보고서 상세 핵심]', short(pick(rd.body, ['reportId', 'title', 'tripId', 'outputFileUrl', 'createdBy', 'creator', 'content', 'fieldReports'])));
  // §8: field-reports CRUD
  await call('GET', `/api/reports/${reportId}/field-reports`);
  if (fieldId) {
    await call('POST', `/api/reports/${reportId}/field-reports`, {
      body: { fieldId, title: 'QA 현장보고', beforePhotoCaption: '전', afterPhotoCaption: '후' },
    });
  }
}

// ---- 6. CLEANUP (best-effort) ----
console.log('\n## 6. CLEANUP');
if (reportId) await call('DELETE', `/api/reports/${reportId}`);
if (tripId) await call('POST', '/api/trips/end', { body: {} });
if (fieldId) await call('DELETE', `/api/fields/${fieldId}`);

console.log('\n=== DONE ===');
