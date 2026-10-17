import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitCamera, zoomAnchor } from '../mapCamera';

test('zoomAnchor: 기준점으로 s 배 줌하면 target 이 가운데에 온다', () => {
  const c = { x: 200, y: 400 };
  for (const s of [2, 4, 0.5, 0.25]) {
    const t = { x: 260, y: 330 };
    const a = zoomAnchor(c, t, s);
    // target 의 새 화면 위치 = A + s(t − A)
    assert.ok(Math.abs(a.x + s * (t.x - a.x) - c.x) < 1e-9);
    assert.ok(Math.abs(a.y + s * (t.y - a.y) - c.y) < 1e-9);
  }
});

test('fitCamera: 점 하나면 그 점·기본 레벨', () => {
  assert.deepEqual(fitCamera([{ x: 10, y: 20 }], 7, 390, 800, [0, 0, 0, 0]), { level: 5, center: { x: 10, y: 20 } });
});

test('fitCamera: 여백 안에 들어가는 가장 가까운 레벨, 상자 가운데 정렬', () => {
  // 지금 레벨 6 에서 폭 100 — 상자 390−40 = 350 에 들어가는 가장 가까운 레벨은 5(200).
  const r = fitCamera([{ x: 100, y: 300 }, { x: 200, y: 300 }], 6, 390, 800, [100, 20, 300, 20]);
  assert.ok(r);
  assert.equal(r.level, 5);
  // 상자 가운데(y = 100 + 200 = 300)가 화면 가운데(400)보다 100 위 → 새 레벨(2배)에서 100 = 지금 레벨 50.
  assert.equal(r.center.x, 150);
  assert.equal(r.center.y, 350);
});

test('fitCamera: 레이아웃 전(상자 0)이면 null', () => {
  assert.equal(fitCamera([{ x: 0, y: 0 }, { x: 1, y: 1 }], 5, 0, 0, [10, 10, 10, 10]), null);
});
