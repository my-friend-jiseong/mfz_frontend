// 2차 외근 표기·보고서 상태 단위 테스트(PR4). 실행: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultTripTitle, fmtSpan, fmtTripDateLine, fmtTripSummary, tripHistoryGroup, tripTitle } from '../tripFormat';
import { reportStateOf } from '../reportStage';
import type { FieldReport, Report } from '../../types/entities';

// 로컬 시각으로 만든다 — 표기는 기기 시간대 기준.
const at = (y: number, mo: number, d: number, h = 9, mi = 0) => new Date(y, mo - 1, d, h, mi).toISOString();

test('기본 제목은 M월 D일 외근, 입력한 제목이 있으면 그것', () => {
  assert.equal(defaultTripTitle(at(2026, 10, 14)), '10월 14일 외근');
  assert.equal(tripTitle({ title: '  ', startedAt: at(2026, 10, 6) }), '10월 6일 외근');
  assert.equal(tripTitle({ title: '하신중앙로 점검', startedAt: at(2026, 10, 6) }), '하신중앙로 점검');
});

test('걸린 시간은 0분을 붙이지 않는다', () => {
  assert.equal(fmtSpan(at(2026, 10, 6, 9, 40), at(2026, 10, 6, 11, 40)), '2시간');
  assert.equal(fmtSpan(at(2026, 10, 8, 9, 10), at(2026, 10, 8, 14, 30)), '5시간 20분');
  assert.equal(fmtSpan(at(2026, 10, 7, 10, 30), at(2026, 10, 7, 10, 42)), '12분');
  assert.equal(fmtSpan(at(2026, 10, 7), null), '');
});

test('외근 상세 날짜 줄·내역 보조 줄', () => {
  const trip = { startedAt: at(2026, 10, 6, 9, 40), endedAt: at(2026, 10, 6, 11, 40) };
  assert.equal(fmtTripDateLine(trip), '10월 6일 (화) · 09:40 – 11:40 · 2시간');
  assert.equal(fmtTripSummary(2, trip), '방문 2건 · 2시간');
});

test('외근 내역 묶음: 이번 주 · 지난주 · M월 · 지난해', () => {
  const now = new Date(2026, 9, 8, 12); // 2026-10-08 (목)
  assert.equal(tripHistoryGroup(at(2026, 10, 5), now), '이번 주'); // 월
  assert.equal(tripHistoryGroup(at(2026, 10, 4), now), '지난주'); // 일
  assert.equal(tripHistoryGroup(at(2026, 9, 28), now), '지난주'); // 월
  assert.equal(tripHistoryGroup(at(2026, 9, 18), now), '9월');
  assert.equal(tripHistoryGroup(at(2025, 12, 3), now), '2025년 12월');
});

const report = (fieldReports?: Partial<FieldReport>[]): Report => ({
  id: 'r1',
  creatorId: 'u',
  tripId: 't1',
  title: '보고',
  createdAt: at(2026, 10, 6),
  updatedAt: null,
  fieldReports: fieldReports?.map((f, i) => ({ id: `f${i}`, reportId: 'r1', fieldId: `x${i}`, createdAt: '', ...f })),
});

test('보고서 상태: 없음 → 작성 전, 빈 현장 보고가 있으면 작성 중, 다 채우면 작성 완료', () => {
  const ok = { listLoaded: true, detailStatus: 'success' as const };
  assert.equal(reportStateOf(undefined, undefined, ok).stage, 'none');
  const draft = reportStateOf(report([{ afterPhotoUrl: 'a.jpg' }, {}, { beforePhotoCaption: ' ' }]), undefined, ok);
  assert.deepEqual([draft.stage, draft.filled, draft.total], ['draft', 1, 3]);
  assert.equal(reportStateOf(report([{ afterPhotoUrl: 'a.jpg' }]), undefined, ok).stage, 'done');
});

test('보고서 상태: 모를 때는 checking — 목록 전엔 작성 전으로, 상세 전엔 완료로 보이지 않게', () => {
  // 목록을 아직 못 받았으면 보고서가 없어 보여도 작성 전이 아니다(중복 생성 방지).
  assert.equal(reportStateOf(undefined, undefined, { listLoaded: false }).stage, 'checking');
  assert.equal(reportStateOf(report(undefined), undefined, { listLoaded: true, detailStatus: 'loading' }).stage, 'checking');
  // 상세를 못 받았으면 작성 완료로 둔다(대체 동작).
  assert.equal(reportStateOf(report(undefined), undefined, { listLoaded: true, detailStatus: 'missing' }).stage, 'done');
});
