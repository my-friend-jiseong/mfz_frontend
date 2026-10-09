import test from 'node:test';
import assert from 'node:assert/strict';
import { configureAuth, request } from '../../api/client';

(globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
test('photo measurement records logical final results, including auth retries and network failures', async () => {
  const originalFetch = globalThis.fetch;
  const events: unknown[] = []; let attempts = 0, mode = 'retry';
  configureAuth({ getAccessToken: () => 'test-token', onUnauthorized: async () => 'fresh-test-token' });
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/api/analytics/events')) { events.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ ok: true }), { status: 200 }); }
    attempts++;
    if (mode === 'network') throw new TypeError('isolated network failure');
    const status = mode === 'invalid' ? 400 : attempts === 1 ? 401 : 200;
    return new Response(JSON.stringify(status === 200 ? { ok: true } : { code: 'photo_format_invalid', message: 'invalid photo' }), { status });
  };
  try {
    const upload = () => request('/api/visits/private-visit/photos', { method: 'POST', multipart: true, body: new FormData() });
    await upload(); assert.equal(attempts, 2); assert.deepEqual(events, [{ kind: 'photo_upload', success: true }]);
    mode = 'invalid'; await assert.rejects(upload); assert.deepEqual(events.at(-1), { kind: 'photo_upload', success: false });
    mode = 'network'; await assert.rejects(upload); assert.deepEqual(events.at(-1), { kind: 'photo_upload', success: false });
    const count = events.length; mode = 'success'; await request('/api/reports', { method: 'POST', body: { title: 'not logged in telemetry' } });
    assert.equal(events.length, count);
    assert.doesNotMatch(JSON.stringify(events), /private-visit|title|filename|token/);
  } finally {
    globalThis.fetch = originalFetch;
    configureAuth({ getAccessToken: () => null, onUnauthorized: async () => null });
  }
});
