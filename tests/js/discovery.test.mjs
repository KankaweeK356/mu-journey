// Proactive discovery card logic.   node --test tests/js/discovery.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickDiscovery, discoveryTone } from '../../public/js/calendar.js';

const ann = (d) => ({ kind: 'annual', occurrences: [{ start: d, end: d }] });
const row = (id, sched, cal = 'DATE_UNVERIFIED', wishes = ['W01'], paths = [{ text: 'a → b → c → d' }]) => ({ event_id: id, event_name: id, schedule: sched, static: { calendar_date: cal, event_schedule: 'EVENT_SCHEDULE_UNVERIFIED' }, compatible_wish_ids: wishes, evidence_paths: paths });
const today = '2026-11-21';

test('at most 2 cards, in the unchanged network order', () => {
  const rows = ['E1', 'E2', 'E3', 'E4'].map((id) => row(id, ann('2027-03-01')));
  assert.deepEqual(pickDiscovery(rows, today).map((r) => r.event_id), ['E1', 'E2']);
  assert.equal(pickDiscovery(rows, today, { max: 9 }).length, 2);
});

test('past events are hidden and nothing is shifted to next year', () => {
  const rows = [row('PAST', ann('2026-11-08')), row('NEXT', ann('2027-10-28'))];
  assert.deepEqual(pickDiscovery(rows, today).map((r) => r.event_id), ['NEXT']);
});

test('empty input hides the section (no sample data is invented)', () => {
  assert.deepEqual(pickDiscovery([], today), []);
  assert.deepEqual(pickDiscovery([row('PAST', ann('2020-01-01'))], today), []);
});

test('a card without a real evidence path is never shown', () => {
  assert.deepEqual(pickDiscovery([row('X', ann('2027-03-01'), 'DATE_UNVERIFIED', ['W01'], [])], today), []);
});

test('dismissed cards stay hidden; the next one takes its place', () => {
  const rows = ['E1', 'E2', 'E3'].map((id) => row(id, ann('2027-03-01')));
  assert.deepEqual(pickDiscovery(rows, today, { dismissed: new Set(['E1']) }).map((r) => r.event_id), ['E2', 'E3']);
});

test('focus narrows the list for presentation only', () => {
  const rows = [row('LOVE', ann('2027-03-01'), 'DATE_UNVERIFIED', ['W01']), row('WORK', ann('2027-03-02'), 'DATE_UNVERIFIED', ['W02'])];
  assert.deepEqual(pickDiscovery(rows, today, { focus: 'W02' }).map((r) => r.event_id), ['WORK']);
  assert.deepEqual(pickDiscovery(rows, today, { focus: 'W09' }), []);
});

test('wording: "ใกล้ถึง" (NEAR) only for a verified calendar date within 14 days; otherwise "อาจสนใจ" (MAYBE)', () => {
  const weekly = row('W', { kind: 'weekly', weekdays: [4] }, 'CALENDAR_DATE_VERIFIED');           // next Friday 27 Nov = 6 days
  const far = row('F', ann('2027-05-01'), 'CALENDAR_DATE_VERIFIED');
  const typed = row('T', ann('2026-11-25'), 'DATE_UNVERIFIED');                                    // close, but the date is only typed in the sheet
  const out = Object.fromEntries(pickDiscovery([weekly, far, typed], today, { max: 2 }).map((r) => [r.event_id, r.tone]));
  assert.equal(out.W, 'NEAR');
  assert.equal(pickDiscovery([far], today)[0].tone, 'MAYBE');
  assert.equal(pickDiscovery([typed], today)[0].tone, 'MAYBE');
  assert.equal(discoveryTone({ static: { calendar_date: 'NO_COMPUTABLE_DATE' }, display_status: 'UPCOMING', days_until: 1 }), 'MAYBE');
});
