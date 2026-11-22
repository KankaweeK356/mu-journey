// The 60 GD_REMINDER_TEST_CASES fixtures against REMINDER_POLICY_V3.   node --test tests/js/fixtures_v3.test.mjs
// Expected results are NEVER edited here: expected_create and expected_reason come straight from the dataset.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBkk, evaluate, CREATED_CODES, CODES, canonical } from '../../public/js/reminder.js';

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf-8'));
const FX = load('../fixtures/reminder_test_cases.json');
const DEMO = load('../../public/data/calendar_demo.json');
const sale = Object.fromEntries(DEMO.ticket_sales.map((r) => [r.sale_id, r]));
const mile = Object.fromEntries(DEMO.exam_milestones.map((r) => [r.milestone_id, r]));
const closeOf = {};
DEMO.exam_milestones.filter((r) => r.milestone_type === 'APPLICATION_CLOSE').forEach((r) => { closeOf[r.exam_id] = parseBkk(r.milestone_datetime); });
const ctx = { examClose: (id) => closeOf[id] };
const yes = (v) => v === 'Y';

export function runCase(c) {
  const isSale = c.source_type === 'TICKET_SALE';
  const parent = isSale ? sale[c.source_entity_id] : mile[c.source_entity_id];
  const target = parseBkk(c.event_datetime);
  const src = isSale ? { source_type: 'TICKET_SALE', target_min: target }
    : { source_type: 'EXAM_MILESTONE', milestone_type: parent.milestone_type, exam_id: parent.exam_id, target_min: target };
  return evaluate({
    mode: c.mode, synthetic: c.schedule_status === 'SYNTHETIC_DEMO', followed: yes(c.followed), reminder_enabled: yes(c.reminder_enabled),
    calendar_date_status: c.calendar_date_status, schedule_status: c.schedule_status, src, offset: Number(c.offset_minutes), now: parseBkk(c.simulation_datetime),
    state: { notified: yes(c.already_notified), read: yes(c.already_read), previous_occurrence_notified: yes(c.previous_occurrence_already_notified) }, ctx,
  });
}

test('fixture file is the 60-case dataset with the expected columns', () => {
  assert.equal(FX.cases.length, 60);
  for (const k of ['test_id', 'test_scenario', 'source_entity_id', 'source_type', 'event_datetime', 'offset_minutes', 'simulation_datetime', 'expected_create', 'expected_reason']) assert.ok(k in FX.cases[0], k);
  assert.equal(FX.meta.dataset_version, 'MUMU_CALENDAR_V3');
});

test('every fixture agrees with its source row (event_datetime = sale_start / milestone_datetime)', () => {
  const off = FX.cases.filter((c) => (c.source_type === 'TICKET_SALE' ? sale[c.source_entity_id].sale_start_datetime : mile[c.source_entity_id].milestone_datetime) !== c.event_datetime);
  assert.deepEqual(off.map((c) => c.test_id), []);
});

test('all 60 fixtures: expected_create and expected_reason match, no expected value edited', () => {
  const failed = [];
  for (const c of FX.cases) {
    const r = runCase(c);
    const okReason = canonical(r.code) === c.expected_reason, okCreate = CREATED_CODES.has(r.code) === yes(c.expected_create);
    if (!(okReason && okCreate)) failed.push(`${c.test_id} [${c.test_scenario}] expected ${c.expected_reason}/${c.expected_create} got ${r.code}`);
  }
  assert.deepEqual(failed, [], `${failed.length} of 60 failed`);
});

test('every expected_reason in the dataset is a code the engine can return', () => {
  const emitted = new Set(Object.values(CODES));
  const wanted = new Set(FX.cases.map((c) => c.expected_reason));
  assert.deepEqual([...wanted].filter((x) => !emitted.has(x)), []);
  assert.equal(wanted.size, 11);                                                            // the 11 codes present in the dataset
});

test('12 scenarios x 5 sets, and no scenario is silently skipped', () => {
  const by = {};
  FX.cases.forEach((c) => { by[c.test_scenario] = (by[c.test_scenario] || 0) + 1; });
  assert.equal(Object.keys(by).length, 12);
  assert.ok(Object.values(by).every((n) => n === 5), JSON.stringify(by));
});
