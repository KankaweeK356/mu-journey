// Reminder engine tests.   node --test tests/js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../public/js/notify.js';
import { bangkokToday, POLICY, addDays, classify } from '../../public/js/calendar.js';

const one = (d) => ({ kind: 'annual', occurrences: [{ start: d, end: d }] });
const syn = (id, date, off) => ({ event_id: id, name: id, origin: 'DIRECT', schedule: one(date), calendar_date: 'SYNTHETIC_DATE', event_schedule: 'SYNTHETIC_DEMO', notify_days_before: off, wish_ids: ['W04'] });
const real = (id, date, cal = 'DATE_UNVERIFIED') => ({ event_id: id, name: id, origin: 'NETWORK', schedule: one(date), calendar_date: cal, event_schedule: 'EVENT_SCHEDULE_UNVERIFIED', notify_days_before: 1, wish_ids: ['W01'] });
const fakeStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), dump: () => [...m.values()].join('') }; };

test('the three agreed test dates fire on the right day, once', () => {
  const cases = [['SYN_EV_025', '2027-01-20', 14, '2027-01-06'], ['SYN_EV_013', '2027-01-14', 7, '2027-01-07'], ['SYN_EV_001', '2027-01-10', 1, '2027-01-09']];
  for (const [id, date, off, simDay] of cases) {
    const s = createStore({ demo: true });
    s.follow(syn(id, date, off), '2026-12-01', { reminder: true });
    assert.equal(s.runCheck(addDays(simDay, -1)).length, 0, `${id} day before`);
    assert.equal(s.runCheck(simDay).length, 1, `${id} on the day`);
    assert.equal(s.runCheck(simDay).length, 0, `${id} dedup`);
    assert.equal(s.runCheck(addDays(simDay, 1)).length, 0, `${id} next day, same alert`);
    assert.equal(s.list(simDay)[0].due_on, simDay);
  }
});

test('follow does not switch the reminder on; unread/read/unfollow flow', () => {
  const s = createStore({ demo: true });
  s.follow(syn('SYN_EV_025', '2027-01-20', 14), '2026-12-01');
  assert.equal(s.follows()[0].reminder_enabled, false);
  assert.deepEqual(s.status('SYN_EV_025', '2027-01-06'), { user: 'FOLLOWED_REMINDER_OFF', time: null, notice: null });
  assert.equal(s.runCheck('2027-01-06').length, 0);
  s.setReminder('SYN_EV_025', true, 14, '2026-12-01');
  assert.equal(s.status('SYN_EV_025', '2027-01-05').time, 'NOT_DUE');
  assert.equal(s.status('SYN_EV_025', '2027-01-06').time, 'DUE');
  s.runCheck('2027-01-06');
  assert.equal(s.unread('2027-01-06').length, 1);
  assert.deepEqual(s.status('SYN_EV_025', '2027-01-06'), { user: 'FOLLOWED_REMINDER_ON', time: 'DUE', notice: 'ALREADY_NOTIFIED' });
  s.markRead(s.list('2027-01-06')[0].id);
  assert.equal(s.unread('2027-01-06').length, 0);
  assert.equal(s.status('SYN_EV_025', '2027-01-06').notice, 'READ');
  s.unfollow('SYN_EV_025');
  assert.equal(s.status('SYN_EV_025', '2027-01-06').user, 'NOT_FOLLOWED');
  assert.equal(s.list('2027-01-06').length, 0);
});

test('no retro alerts: following after the due date gives no alert for that occurrence', () => {
  const s = createStore({ demo: true });
  s.follow(syn('SYN_EV_025', '2027-01-20', 14), '2027-01-08', { reminder: true });   // due 6 Jan is already behind us
  assert.equal(s.runCheck('2027-01-08').length, 0);
  assert.equal(s.runCheck('2027-01-19').length, 0);
});

test('a missed day is caught on open (check-on-open), but an expired alert is not counted as unread', () => {
  const s = createStore({ demo: true });
  s.follow(syn('SYN_EV_001', '2027-01-10', 1), '2026-12-01', { reminder: true });
  assert.equal(s.runCheck('2027-01-10').length, 1);          // first opened on the day itself: due 9 Jan, event today
  assert.equal(s.unread('2027-01-10').length, 1);
  assert.equal(s.unread('2027-01-11').length, 0);            // event over
  assert.equal(s.status('SYN_EV_001', '2027-01-11').time, 'EXPIRED');
});

test('real events: info only by default, alert with a label only under the pending policy B, and never without a computable date', () => {
  const s = createStore();
  s.follow(real('E_NAVARATRI_2570', '2027-09-29'), '2027-09-01', { reminder: true });
  s.follow(real('E_CHINESE_MOON_NEW', '2027-09-29', 'NO_COMPUTABLE_DATE'), '2027-09-01', { reminder: true });
  assert.equal(s.runCheck('2027-09-28').length, 0);
  assert.equal(s.status('E_NAVARATRI_2570', '2027-09-28').user, 'BLOCKED_UNVERIFIED');
  const b = s.runCheck('2027-09-28', { policy: POLICY.ALERT_WITH_LABEL });
  assert.equal(b.length, 1);
  assert.equal(b[0].event_id, 'E_NAVARATRI_2570');
  assert.equal(b[0].label, 'SCHEDULE_UNCONFIRMED');
  s.follow({ ...real('E_X', '2027-09-29', 'CALENDAR_DATE_VERIFIED'), event_schedule: 'EVENT_SCHEDULE_VERIFIED' }, '2027-09-01', { reminder: true });
  assert.equal(s.runCheck('2027-09-28').find((n) => n.event_id === 'E_X').label, null);   // fully verified: no warning label
});

test('synthetic events never alert outside the demo simulation', () => {
  const s = createStore({ demo: false });
  s.follow(syn('SYN_EV_001', '2027-01-10', 1), '2026-12-01', { reminder: true });
  assert.equal(s.runCheck('2027-01-09', { policy: POLICY.ALERT_WITH_LABEL }).length, 0);
  assert.equal(s.status('SYN_EV_001', '2027-01-09').user, 'BLOCKED_UNVERIFIED');
});

test('weekly rule: one alert per occurrence, keeps the event_id', () => {
  const s = createStore({ demo: true });
  const ev = { ...real('E_LAKSHMI_WEEKLY', '2026-01-01', 'CALENDAR_DATE_VERIFIED'), schedule: { kind: 'weekly', weekdays: [4] } };
  s.follow(ev, '2026-11-20', { reminder: true });
  const n = s.runCheck('2026-11-26', { policy: POLICY.ALERT_WITH_LABEL });            // Thursday: Friday 27th is due (offset 1)
  assert.deepEqual(n.map((x) => [x.event_id, x.occurrence_start]), [['E_LAKSHMI_WEEKLY', '2026-11-27']]);
  assert.equal(s.runCheck('2026-11-26', { policy: POLICY.ALERT_WITH_LABEL }).length, 0);
  assert.equal(s.runCheck('2026-12-03', { policy: POLICY.ALERT_WITH_LABEL }).length, 1); // next week's Friday, a new occurrence
});

test('storage: round trip, schema guard, blocked storage, and no date of birth anywhere', () => {
  const st = fakeStorage();
  const a = createStore({ storage: st, demo: true });
  a.follow(syn('SYN_EV_001', '2027-01-10', 1), '2026-12-01', { reminder: true });
  a.runCheck('2027-01-09');
  const b = createStore({ storage: st, demo: true });
  assert.equal(b.userId(), a.userId());
  assert.equal(b.follows().length, 1);
  assert.equal(b.list('2027-01-09').length, 1);
  const raw = st.dump();
  assert.ok(!/birth|dob|วันเกิด/i.test(raw));
  for (const k of ['schema_version', 'local_user_id', 'follow_status', 'reminder_enabled', 'notify_days_before', 'read_status']) assert.ok(raw.includes(k), k);
  const bad = fakeStorage(); bad.setItem('mumu.notify.v1', '{"schema_version":99}');
  assert.equal(createStore({ storage: bad }).follows().length, 0);
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {} };
  const c = createStore({ storage: broken });
  c.follow(syn('SYN_EV_001', '2027-01-10', 1), '2026-12-01');
  assert.equal(c.follows().length, 1);
  a.clear();
  assert.equal(createStore({ storage: st }).follows().length, 0);
});

test('Bangkok date does not depend on the device time zone', () => {
  assert.equal(bangkokToday(new Date('2026-11-20T17:30:00Z')), '2026-11-21');   // 00:30 in Bangkok
  assert.equal(bangkokToday(new Date('2026-11-20T16:59:00Z')), '2026-11-20');
});

test('a past 2569 date is never moved into 2570', () => {
  assert.equal(classify(one('2026-11-08'), '2026-11-21').display_status, 'PAST');
  assert.equal(classify(one('2026-11-08'), '2027-11-08').display_status, 'PAST');
  assert.equal(classify(one('2027-10-28'), '2026-11-21').display_status, 'UPCOMING');
});
