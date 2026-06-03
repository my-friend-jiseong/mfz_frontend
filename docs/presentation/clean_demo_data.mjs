// 데모 계정 데이터 정리 — 재시드 전 깨끗이 비운다. 로그인 계정의 보고서·외근·현장을 삭제.
// 프로젝트는 DELETE 엔드포인트가 없어 남는다(seed 가 동명 프로젝트를 재사용).
//
//   실행: $env:SEED_EMAIL="demo@ilgayo.co.kr"; $env:SEED_PW="..."; node docs/presentation/clean_demo_data.mjs
const BASE = (process.env.SEED_BASE ?? 'https://ilgayo.co.kr').replace(/\/$/, '');
const EMAIL = process.env.SEED_EMAIL;
const PW = process.env.SEED_PW;
if (!EMAIL || !PW) { console.error('✖ SEED_EMAIL / SEED_PW 필요'); process.exit(1); }
let TOKEN = null;

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data = null; if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  let r = await api('/auth/login', { method: 'POST', auth: false, body: { email: EMAIL, password: PW } });
  if (!r.ok) { console.error('로그인 실패', r.status, JSON.stringify(r.data)); process.exit(1); }
  TOKEN = r.data.accessToken;
  console.log(`✓ 로그인: ${r.data.user?.name ?? EMAIL} (${EMAIL})\n`);

  // 1) 보고서 (field_reports 는 보고서 삭제 시 함께)
  const reps = (await api('/api/reports?limit=100')).data?.items ?? [];
  for (const x of reps) {
    const d = await api(`/api/reports/${x.reportId}`, { method: 'DELETE' });
    console.log(`보고서 삭제 ${x.reportId} (${x.title}) → ${d.status} ${d.ok ? 'OK' : 'FAIL'}`);
  }

  // 2) 외근 — active 면 먼저 종료, 그 후 삭제 시도(DELETE 미배포면 404/405)
  const active = (await api('/api/trips/active')).data;
  if (active?.isActive) {
    await api('/api/trips/end', { method: 'POST', body: { forceEndWithoutVisit: true } });
    console.log(`active 외근 종료 (${active.tripId})`);
  }
  const trips = (await api('/api/trips?limit=100')).data?.items ?? [];
  for (const x of trips) {
    const d = await api(`/api/trips/${x.tripId}`, { method: 'DELETE' });
    console.log(`외근 삭제 ${x.tripId} (${x.title ?? ''}) → ${d.status} ${d.ok ? 'OK' : '미지원/실패'}`);
  }

  // 3) 현장 (visitDateScope=all 로 전부)
  const fields = (await api('/api/fields/mine?visitDateScope=all&limit=100')).data?.items ?? [];
  for (const x of fields) {
    const d = await api(`/api/fields/${x.fieldId}`, { method: 'DELETE' });
    console.log(`현장 삭제 ${x.fieldId} (${x.name}) → ${d.status} ${d.ok ? 'OK' : 'FAIL'}`);
  }

  // 4) 프로젝트 — DELETE 없음, 잔존 알림만
  const projs = (await api('/api/projects?limit=100')).data?.items ?? [];
  if (projs.length) console.log(`\n(프로젝트 ${projs.length}건 잔존 — DELETE 엔드포인트 없음, seed 가 재사용): ${projs.map((p) => p.name).join(', ')}`);

  console.log('\n✔ 정리 완료.');
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
