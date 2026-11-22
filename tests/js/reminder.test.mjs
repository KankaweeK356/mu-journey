// Notification store (schema v2, REMINDER_POLICY_V3).   node --test tests/js/reminder.test.mjs
// Business-rule change vs the earlier tests: following (or enabling a reminder) AFTER the due time now gives one catch-up reminder
// while the reminder is still useful (expert decision REMINDER_POLICY_V3). The old "no retro alert" test is replaced on purpose.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, migrateV1, keyOf, reminderBlock, STORAGE_KEY, LEGACY_KEY } from '../../public/js/notify.js';
import { parseBkk, fmtBkk, CODES } from '../../public/js/reminder.js';
import { bangkokToday } from '../../public/js/calendar.js';

const T = parseBkk;
const fake = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), dump: () => [...m.values()].join('\n'), keys: () => [...m.keys()] }; };

const valentine = () => ({ parent_id: 'CAL_VALENTINE', kind: 'FIXED', name: 'วันวาเลนไทน์', origin: 'FIXED', wish_ids: ['W01'], children: [{ source_entity_id: 'CAL_VALENTINE', source_type: 'FIXED_CALENDAR_DAY', label: 'วันวาเลนไทน์',
  occ: { kind: 'yearly', month_day: '02-14' }, calendar_date_status: 'CALENDAR_DATE_VERIFIED', schedule_status: 'NOT_APPLICABLE', synthetic: false, offsets_available: [10080, 1440] }] });
const network = () => ({ parent_id: 'E_NAVARATRI_2570', kind: 'EVENT', name: 'นวราตรี', origin: 'NETWORK', wish_ids: ['W01'], children: [{ source_entity_id: 'E_NAVARATRI_2570', source_type: 'EVENT', label: 'นวราตรี',
  occ: { kind: 'schedule', schedule: { kind: 'annual', occurrences: [{ start: '2027-09-29', end: '2027-10-09' }] } }, calendar_date_status: 'DATE_UNVERIFIED', schedule_status: 'EVENT_SCHEDULE_UNVERIFIED', synthetic: false, offsets_available: [1440, 10080, 20160] }] });
const concert = () => ({ parent_id: 'CON_DEMO_0001', kind: 'CONCERT', name: 'คอนเสิร์ตจำลอง', origin: 'DEMO', wish_ids: ['W05'], children: [
  { source_entity_id: 'SALE_GEN', source_type: 'TICKET_SALE', sale_phase: 'GENERAL_SALE', label: 'General', occ: { kind: 'single', datetime: '2027-01-06 10:00' }, calendar_date_status: 'SYNTHETIC_DATE', schedule_status: 'SYNTHETIC_DEMO', synthetic: true, offsets_available: [10080, 1440, 60] },
  { source_entity_id: 'SALE_FAN', source_type: 'TICKET_SALE', sale_phase: 'FANCLUB_PRESALE', label: 'Fanclub', occ: { kind: 'single', datetime: '2026-12-30 10:00' }, calendar_date_status: 'SYNTHETIC_DATE', schedule_status: 'SYNTHETIC_DEMO', synthetic: true, offsets_available: [10080, 1440, 60] }] });
const exam = () => ({ parent_id: 'EXAM_1', kind: 'EXAM', name: 'สอบจำลอง', origin: 'DEMO', wish_ids: ['W04'], children: [
  { source_entity_id: 'M_OPEN', source_type: 'EXAM_MILESTONE', milestone_type: 'APPLICATION_OPEN', exam_id: 'EXAM_1', exam_close_min: T('2027-01-13 16:30'), label: 'open', occ: { kind: 'single', datetime: '2026-12-04 09:00' }, calendar_date_status: 'SYNTHETIC_DATE', schedule_status: 'SYNTHETIC_DEMO', synthetic: true, offsets_available: [1440, 0] },
  { source_entity_id: 'M_RES', source_type: 'EXAM_MILESTONE', milestone_type: 'RESULT_ANNOUNCEMENT', exam_id: 'EXAM_1', label: 'result', occ: { kind: 'single', datetime: '2027-03-04 09:00' }, calendar_date_status: 'SYNTHETIC_DATE', schedule_status: 'SYNTHETIC_DEMO', synthetic: true, offsets_available: [1440, 0] }] });

test('follow never switches a reminder on; consent is per child', () => {
  const s = createStore({ demo: true });
  s.follow(concert(), T('2026-12-01 08:00'));
  assert.ok(s.follows()[0].children.SALE_GEN.offsets_enabled.length === 0 && s.follows()[0].children.SALE_FAN.offsets_enabled.length === 0);
  assert.equal(s.runCheck(T('2027-01-06 09:00')).created.length, 0);
  s.setOffsets('CON_DEMO_0001', 'SALE_GEN', [60]);
  assert.equal(s.runCheck(T('2027-01-06 09:00')).created.length, 1);
  assert.equal(s.child('CON_DEMO_0001', 'SALE_FAN').offsets_enabled.length, 0);      // presale stays off unless chosen
});

test('presale: only the presale the user switched on can notify (no automatic fan-out from the concert follow)', () => {
  const s = createStore({ demo: true });
  s.follow(concert(), T('2026-12-01 08:00'));
  s.setOffsets('CON_DEMO_0001', 'SALE_GEN', [60]);
  const r = s.runCheck(T('2026-12-30 09:00'));                                       // fanclub presale due, but not chosen
  assert.equal(r.created.length, 0);
  s.setOffsets('CON_DEMO_0001', 'SALE_FAN', [60]);
  assert.deepEqual(s.runCheck(T('2026-12-30 09:00')).created.map((n) => n.source_entity_id), ['SALE_FAN']);
});

test('Valentine: 7 days and 1 day before 00:00 Bangkok, once each, repeated opens never repeat', () => {
  const s = createStore({ demo: false });
  s.follow(valentine(), T('2026-11-22 10:00'));
  s.setOffsets('CAL_VALENTINE', 'CAL_VALENTINE', [10080, 1440]);
  assert.equal(s.runCheck(T('2027-02-06 23:59')).created.length, 0);
  const a = s.runCheck(T('2027-02-07 00:00')).created;
  assert.deepEqual(a.map((n) => [n.offset, n.code]), [[10080, CODES.CREATED]]);
  assert.equal(s.runCheck(T('2027-02-07 00:00')).created.length, 0);
  assert.equal(s.runCheck(T('2027-02-10 12:00')).created.length, 0);
  assert.deepEqual(s.runCheck(T('2027-02-13 00:00')).created.map((n) => [n.offset, n.code]), [[1440, CODES.CREATED]]);
  assert.equal(s.runCheck(T('2027-02-13 00:00')).created.length, 0);
  assert.equal(s.runCheck(T('2027-02-15 00:00')).created.length, 0);                 // expired
  assert.equal(s.unread(T('2027-02-15 00:00')).length, 0);
  assert.equal(s.unread(T('2027-02-14 23:59')).length, 2);
});

test('catch-up: opening on 14 Feb with both offsets unsent gives ONE reminder (closest) and persists SUPERSEDED_BY_CATCHUP', () => {
  const s = createStore({ demo: false });
  s.follow(valentine(), T('2027-01-01 09:00'));
  s.setOffsets('CAL_VALENTINE', 'CAL_VALENTINE', [10080, 1440]);
  const r = s.runCheck(T('2027-02-14 12:00')).created;
  assert.deepEqual(r.map((n) => [n.offset, n.code]), [[1440, CODES.CREATED_LATE]]);
  assert.equal(Object.keys(s.state.superseded).length, 1);
  assert.equal(s.runCheck(T('2027-02-14 12:05')).created.length, 0);                 // the superseded 7-day reminder never comes back
  assert.equal(s.runCheck(T('2027-02-14 23:59')).created.length, 0);
});

test('follow (and switch on) after the due time: one catch-up while still useful, nothing after expiry', () => {
  const s = createStore({ demo: true });
  s.follow(concert(), T('2027-01-06 09:30'));
  s.setOffsets('CON_DEMO_0001', 'SALE_GEN', [60]);
  assert.deepEqual(s.runCheck(T('2027-01-06 09:30')).created.map((n) => n.code), [CODES.CREATED_LATE]);
  const t = createStore({ demo: true });
  t.follow(concert(), T('2027-01-06 10:30'));
  t.setOffsets('CON_DEMO_0001', 'SALE_GEN', [60]);
  assert.equal(t.runCheck(T('2027-01-06 10:30')).created.length, 0);                 // the sale has started: nothing useful to prepare
});

test('Valentine every year: last year never blocks the new one', () => {
  const s = createStore({ demo: false });
  s.follow(valentine(), T('2026-11-22'));
  s.setOffsets('CAL_VALENTINE', 'CAL_VALENTINE', [1440]);
  assert.equal(s.runCheck(T('2027-02-13 00:00')).created[0].code, CODES.CREATED);
  const n = s.runCheck(T('2028-02-13 00:00')).created;
  assert.deepEqual(n.map((x) => [x.occurrence_datetime, x.code]), [['2028-02-14 00:00', CODES.CREATED_NEW_OCCURRENCE]]);
  assert.equal(new Set(s.state.notifications.map((x) => x.id)).size, 2);
});

test('exam: reminder per milestone; offset 0 on OPEN is valid until the application closes, 1440 expires at open', () => {
  const s = createStore({ demo: true });
  s.follow(exam(), T('2026-11-30 09:00'));
  s.setOffsets('EXAM_1', 'M_OPEN', [1440, 0]);
  assert.deepEqual(s.runCheck(T('2026-12-03 09:00')).created.map((n) => [n.source_entity_id, n.offset]), [['M_OPEN', 1440]]);
  assert.deepEqual(s.runCheck(T('2026-12-04 10:00')).created.map((n) => [n.offset, n.code]), [[0, CODES.CREATED_LATE]]);   // "open for applications"
  assert.equal(s.runCheck(T('2027-01-13 16:30')).created.length, 0);
  assert.equal(s.child('EXAM_1', 'M_RES').offsets_enabled.length, 0);                // other milestones were never switched on
});

test('real events whose schedule is unverified never notify; synthetic children never notify in the normal store', () => {
  const s = createStore({ demo: false });
  s.follow(network(), T('2027-09-01'));
  s.setOffsets('E_NAVARATRI_2570', 'E_NAVARATRI_2570', [1440]);
  assert.equal(s.runCheck(T('2027-09-28 00:00')).created.length, 0);
  assert.equal(reminderBlock(s.child('E_NAVARATRI_2570', 'E_NAVARATRI_2570'), 'NORMAL'), CODES.DATE_UNVERIFIED);
  const c = createStore({ demo: false });
  c.follow(concert(), T('2026-12-01'));
  c.setOffsets('CON_DEMO_0001', 'SALE_GEN', [60]);
  assert.equal(c.runCheck(T('2027-01-06 09:00')).created.length, 0);
  assert.equal(reminderBlock(c.child('CON_DEMO_0001', 'SALE_GEN'), 'NORMAL'), CODES.BLOCKED_SYNTHETIC);
  assert.equal(reminderBlock(c.child('CON_DEMO_0001', 'SALE_GEN'), 'SIMULATION'), null);
  assert.equal(reminderBlock(valentine().children[0], 'NORMAL'), null);               // Valentine may remind in normal mode
});

test('read / unread / unfollow, and dedup key format user|source|occurrence|offset', () => {
  const s = createStore({ demo: false });
  s.follow(valentine(), T('2026-11-22'));
  s.setOffsets('CAL_VALENTINE', 'CAL_VALENTINE', [1440]);
  s.runCheck(T('2027-02-13 08:00'));
  const n = s.list(T('2027-02-13 08:00'))[0];
  assert.equal(n.id, keyOf(s.userId(), 'CAL_VALENTINE', '2027-02-14 00:00', 1440));
  assert.equal(s.unread(T('2027-02-13 08:00')).length, 1);
  s.markRead(n.id);
  assert.equal(s.unread(T('2027-02-13 08:00')).length, 0);
  s.unfollow('CAL_VALENTINE');
  assert.equal(s.list(T('2027-02-13 08:00')).length, 0);
});

test('explain: window and code per offset without side effects', () => {
  const s = createStore({ demo: true });
  s.follow(concert(), T('2026-12-01'));
  s.setOffsets('CON_DEMO_0001', 'SALE_GEN', [60]);
  const e = s.explain('CON_DEMO_0001', 'SALE_GEN', T('2027-01-06 08:00'));
  assert.deepEqual(e.rows.map((r) => [r.offset, r.enabled, r.code]), [[10080, false, CODES.REMINDER_DISABLED], [1440, false, CODES.REMINDER_DISABLED], [60, true, CODES.NOT_DUE]]);
  assert.equal(fmtBkk(e.rows[2].due), '2027-01-06 09:00');
  assert.equal(s.state.notifications.length, 0);
});

test('storage: round trip, no date of birth, schema guard, blocked storage', () => {
  const st = fake();
  const a = createStore({ storage: st });
  a.follow(valentine(), T('2026-11-22'));
  a.setOffsets('CAL_VALENTINE', 'CAL_VALENTINE', [1440]);
  a.runCheck(T('2027-02-13 08:00'));
  const b = createStore({ storage: st });
  assert.equal(b.userId(), a.userId());
  assert.equal(b.follows().length, 1);
  assert.equal(b.list(T('2027-02-13 08:00')).length, 1);
  const raw = st.dump();
  assert.ok(!/birth|dob|วันเกิด/i.test(raw));
  for (const k of ['schema_version', 'local_user_id', 'follow_status', 'offsets_enabled', 'read_status', 'rule_version', 'superseded']) assert.ok(raw.includes(k), k);
  const bad = fake(); bad.setItem(STORAGE_KEY, '{"schema_version":99}');
  assert.equal(createStore({ storage: bad }).follows().length, 0);
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {} };
  const c = createStore({ storage: broken });
  c.follow(valentine(), T('2026-11-22'));
  assert.equal(c.follows().length, 1);
  a.clear();
  assert.equal(createStore({ storage: st }).follows().length, 0);
});

test('migration v1 -> v2: real network follows are kept, synthetic follows and old alerts are dropped, v1 key removed', () => {
  const st = fake();
  const sched = { kind: 'annual', occurrences: [{ start: '2027-09-29', end: '2027-10-09' }] };
  st.setItem(LEGACY_KEY, JSON.stringify({ schema_version: 1, local_user_id: 'u-old', notifications: [{ id: 'x' }], follows: {
    E_NAV: { event_id: 'E_NAV', name: 'นวราตรี', origin: 'NETWORK', follow_status: 'FOLLOWING', reminder_enabled: true, notify_days_before: 7, followed_on: '2026-11-22', schedule: sched, calendar_date: 'DATE_UNVERIFIED', event_schedule: 'EVENT_SCHEDULE_UNVERIFIED', wish_ids: ['W01'] },
    SYN_EV_1: { event_id: 'SYN_EV_1', name: 'จำลอง', origin: 'DIRECT', follow_status: 'FOLLOWING', reminder_enabled: true, notify_days_before: 1, followed_on: '2026-11-22', schedule: sched },
    GONE: { event_id: 'GONE', name: 'เลิกแล้ว', origin: 'NETWORK', follow_status: 'UNFOLLOWED', schedule: sched } } }));
  const s = createStore({ storage: st });
  assert.equal(s.userId(), 'u-old');
  assert.deepEqual(s.follows().map((f) => f.parent_id), ['E_NAV']);
  assert.deepEqual(s.child('E_NAV', 'E_NAV').offsets_enabled, [10080]);               // 7 days -> minutes
  assert.equal(s.state.notifications.length, 0);
  assert.equal(st.getItem(LEGACY_KEY), null);
  assert.ok(st.getItem(STORAGE_KEY));
  assert.equal(migrateV1(null).follows && Object.keys(migrateV1(null).follows).length, 0);
});

test('Bangkok date does not depend on the device time zone', () => {
  assert.equal(bangkokToday(new Date('2026-11-20T17:30:00Z')), '2026-11-21');
  assert.equal(bangkokToday(new Date('2026-11-20T16:59:00Z')), '2026-11-20');
});
