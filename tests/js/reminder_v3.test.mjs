// REMINDER_POLICY_V3 unit tests.   node --test tests/js/reminder_v3.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBkk, fmtBkk, nextDayStart, parseOffsets, reminderWindow, evaluate, planCheck, reminderText, CODES, canonical, REMINDER_POLICY_VERSION } from '../../public/js/reminder.js';

const T = (s) => parseBkk(s);
const sale = (start) => ({ source_type: 'TICKET_SALE', target_min: T(start) });
const ms = (type, dt, exam = 'EXAM_1') => ({ source_type: 'EXAM_MILESTONE', milestone_type: type, target_min: T(dt), exam_id: exam });
const valentine = (d) => ({ source_type: 'FIXED_CALENDAR_DAY', target_min: T(d) });
const ctx = { examClose: (id) => (id === 'EXAM_1' ? T('2027-01-13 16:30') : undefined) };
const synth = { mode: 'SIMULATION', synthetic: true, followed: true, reminder_enabled: true, calendar_date_status: 'SYNTHETIC_DATE', schedule_status: 'SYNTHETIC_DEMO', ctx };
const real = { mode: 'NORMAL', synthetic: false, followed: true, reminder_enabled: true, calendar_date_status: 'CALENDAR_DATE_VERIFIED', schedule_status: 'NOT_APPLICABLE', ctx };
const run = (base, src, offset, now, state) => evaluate({ ...base, src, offset, now: T(now), state });

test('policy version is recorded', () => assert.equal(REMINDER_POLICY_VERSION, 'REMINDER_POLICY_V3'));

test('time: explicit +07:00, strict parsing, no dependence on the device time zone', () => {
  assert.equal(fmtBkk(T('2027-01-06 10:00')), '2027-01-06 10:00');
  assert.equal(T('2027-01-06 10:00'), Date.UTC(2027, 0, 6, 3, 0) / 60000);          // 10:00 Bangkok = 03:00 UTC
  assert.equal(T('2027-01-06'), T('2027-01-06 00:00'));
  for (const bad of ['2027-02-30', '2027-13-01', '2027-01-06 24:00', '2027-01-06 10:60', '6/1/2027', '', null, undefined, '2027-01-06T10:00']) assert.equal(parseBkk(bad), null, String(bad));
  assert.equal(fmtBkk(nextDayStart(T('2027-02-14 13:45'))), '2027-02-15 00:00');
  assert.equal(fmtBkk(nextDayStart(T('2027-02-14 00:00'))), '2027-02-15 00:00');
  assert.equal(fmtBkk(nextDayStart(T('2027-02-28 23:59'))), '2027-03-01 00:00');
});

test('offsets parse as integer minutes', () => {
  assert.deepEqual(parseOffsets('10080;1440;60'), [10080, 1440, 60]);
  assert.deepEqual(parseOffsets('1440;0'), [1440, 0]);
  for (const bad of ['', 'a;1', '1.5', '-1', null]) assert.equal(parseOffsets(bad), null, String(bad));
});

test('ticket sale: due = sale_start - offset, expires at sale_start (exclusive), sale_end never used', () => {
  const w = reminderWindow(sale('2027-01-06 10:00'), 60);
  assert.equal(fmtBkk(w.due), '2027-01-06 09:00');
  assert.equal(fmtBkk(w.expires), '2027-01-06 10:00');
  assert.equal(run(synth, sale('2027-01-06 10:00'), 60, '2027-01-06 08:59').code, 'NOT_DUE');
  assert.equal(run(synth, sale('2027-01-06 10:00'), 60, '2027-01-06 09:00').code, 'CREATED');         // inclusive at due
  assert.equal(run(synth, sale('2027-01-06 10:00'), 60, '2027-01-06 09:45').code, 'CREATED_LATE');
  assert.equal(run(synth, sale('2027-01-06 10:00'), 60, '2027-01-06 09:59').code, 'CREATED_LATE');
  assert.equal(run(synth, sale('2027-01-06 10:00'), 60, '2027-01-06 10:00').code, 'EXPIRED');         // exclusive at expiry
  assert.equal(run(synth, sale('2027-01-06 10:00'), 60, '2027-01-06 10:30').code, 'EXPIRED');
});

test('exam expiry for all four milestone types (offset > 0 ends at the milestone time)', () => {
  for (const [type, dt] of [['APPLICATION_OPEN', '2026-12-04 09:00'], ['APPLICATION_CLOSE', '2027-01-13 16:30'], ['EXAM_DATE', '2027-02-07 09:00'], ['RESULT_ANNOUNCEMENT', '2027-03-04 09:00']]) {
    const w = reminderWindow(ms(type, dt), 1440, ctx);
    assert.equal(w.expires, T(dt), type);
    assert.equal(run(synth, ms(type, dt), 1440, dt).code, 'EXPIRED', type + ' at the milestone');
  }
});

test('offset 0: OPEN ends at APPLICATION_CLOSE of the same exam; RESULT ends at the next 00:00; CLOSE and EXAM_DATE are invalid', () => {
  const open = ms('APPLICATION_OPEN', '2026-12-04 09:00');
  assert.equal(run(synth, open, 0, '2026-12-04 08:59').code, 'NOT_DUE');
  assert.equal(run(synth, open, 0, '2026-12-04 09:00').code, 'CREATED');
  assert.equal(run(synth, open, 0, '2026-12-04 10:00').code, 'CREATED_LATE');                        // still open for applications
  assert.equal(run(synth, open, 0, '2027-01-13 16:29').code, 'CREATED_LATE');
  assert.equal(run(synth, open, 0, '2027-01-13 16:30').code, 'EXPIRED');
  const res = ms('RESULT_ANNOUNCEMENT', '2027-03-04 09:00');
  assert.equal(run(synth, res, 0, '2027-03-04 15:00').code, 'CREATED_LATE');                         // "today there is a result announcement"
  assert.equal(run(synth, res, 0, '2027-03-04 23:59').code, 'CREATED_LATE');
  assert.equal(run(synth, res, 0, '2027-03-05 00:00').code, 'EXPIRED');
  for (const t of ['APPLICATION_CLOSE', 'EXAM_DATE']) assert.equal(run(synth, ms(t, '2027-02-07 09:00'), 0, '2027-02-07 09:00').code, 'INVALID_REMINDER_WINDOW', t);
  assert.equal(run(synth, ms('APPLICATION_OPEN', '2026-12-04 09:00', 'NO_SUCH_EXAM'), 0, '2026-12-04 09:00').code, 'INVALID_REMINDER_WINDOW');   // no time is assumed
});

test('offset > 0 on RESULT_ANNOUNCEMENT is unchanged by the existence of offset 0 (AFTER_EVENT stays EXPIRED)', () => {
  const res = ms('RESULT_ANNOUNCEMENT', '2027-12-12 09:00');
  assert.equal(run(synth, res, 1440, '2027-12-12 09:01').code, 'EXPIRED');
  assert.equal(run(synth, res, 0, '2027-12-12 09:01').code, 'CREATED_LATE');                         // a separate offset, evaluated on its own
});

test('Valentine: all-day occasion, 7d/1d reminders, valid until 00:00 of the next day, text says "today"', () => {
  const v = valentine('2027-02-14');
  assert.equal(fmtBkk(reminderWindow(v, 10080).due), '2027-02-07 00:00');
  assert.equal(fmtBkk(reminderWindow(v, 1440).due), '2027-02-13 00:00');
  assert.equal(fmtBkk(reminderWindow(v, 1440).expires), '2027-02-15 00:00');
  assert.equal(run(real, v, 1440, '2027-02-12 23:59').code, 'NOT_DUE');
  assert.equal(run(real, v, 1440, '2027-02-13 00:00').code, 'CREATED');
  assert.equal(run(real, v, 1440, '2027-02-14 12:00').code, 'CREATED_LATE');                         // opened on the day itself
  assert.equal(run(real, v, 1440, '2027-02-14 23:59').code, 'CREATED_LATE');
  assert.equal(run(real, v, 1440, '2027-02-15 00:00').code, 'EXPIRED');
  assert.equal(reminderText('FIXED_CALENDAR_DAY', v, 1440, T('2027-02-14 12:00')), 'วันนี้');
  assert.match(reminderText('FIXED_CALENDAR_DAY', v, 1440, T('2027-02-13 08:00')), /ใกล้ถึง/);
});

test('Valentine yearly: last year\'s notification never blocks the new year', () => {
  const y27 = valentine('2027-02-14'), y28 = valentine('2028-02-14');
  assert.equal(run(real, y27, 1440, '2027-02-13 00:00', { notified: true }).code, 'DUPLICATE_BLOCKED');
  assert.equal(run(real, y28, 1440, '2028-02-13 00:00', { previous_occurrence_notified: true }).code, 'CREATED_NEW_OCCURRENCE');
  assert.equal(run(real, y28, 1440, '2028-02-13 00:00', {}).code, 'CREATED');
});

test('validation priority: mode, follow, consent, date/schedule, window, duplicate, creation', () => {
  const s = sale('2027-01-06 10:00');
  const bad = { synthetic: true, mode: 'NORMAL', followed: false, reminder_enabled: false, calendar_date_status: 'DATE_UNVERIFIED' };
  assert.equal(run({ ...synth, ...bad }, s, 60, '2027-01-07 00:00', { notified: true }).code, 'BLOCKED_SYNTHETIC');
  assert.equal(run({ ...synth, followed: false, reminder_enabled: false, calendar_date_status: 'DATE_UNVERIFIED' }, s, 60, '2027-01-07 00:00').code, 'NOT_FOLLOWED');
  assert.equal(run({ ...synth, reminder_enabled: false, calendar_date_status: 'DATE_UNVERIFIED' }, s, 60, '2027-01-07 00:00').code, 'REMINDER_DISABLED');
  assert.equal(run({ ...synth, calendar_date_status: 'DATE_UNVERIFIED' }, s, 60, '2027-01-07 00:00').code, 'DATE_UNVERIFIED');       // before the window check
  assert.equal(run(synth, s, 60, '2027-01-07 00:00', { notified: true }).code, 'EXPIRED');                                              // window before duplicate
  assert.equal(run(synth, s, 60, '2027-01-06 09:30', { notified: true, read: true }).code, 'DUPLICATE_BLOCKED_READ');
  assert.equal(run(synth, s, 60, '2027-01-06 09:30', { notified: true }).code, 'DUPLICATE_BLOCKED');
  assert.equal(canonical('ALREADY_NOTIFIED'), 'DUPLICATE_BLOCKED');
});

test('real events whose schedule is not verified stay blocked (BLOCKED_UNVERIFIED), a typed date is DATE_UNVERIFIED', () => {
  const ev = { source_type: 'EVENT', target_min: T('2027-09-29'), end_min: T('2027-10-09') };
  assert.equal(run({ ...real, schedule_status: 'EVENT_SCHEDULE_UNVERIFIED' }, ev, 1440, '2027-09-28').code, 'BLOCKED_UNVERIFIED');
  assert.equal(run({ ...real, calendar_date_status: 'DATE_UNVERIFIED', schedule_status: 'EVENT_SCHEDULE_UNVERIFIED' }, ev, 1440, '2027-09-28').code, 'DATE_UNVERIFIED');
  assert.equal(run({ ...real, schedule_status: 'EVENT_SCHEDULE_VERIFIED' }, ev, 1440, '2027-09-28').code, 'CREATED');
});

test('catch-up: several offsets due -> one notification (closest to the target); the rest SUPERSEDED_BY_CATCHUP', () => {
  const s = sale('2027-01-06 10:00'), base = { ...synth, src: s, now: T('2027-01-06 09:30') };
  const p = planCheck(base, [10080, 1440, 60]);
  assert.equal(p.create.offset, 60);
  assert.deepEqual(p.superseded.sort((a, b) => a - b), [1440, 10080]);
  assert.equal(p.results.filter((r) => r.code === 'CREATED_LATE').length, 1);
  assert.equal(p.results.filter((r) => r.code === 'SUPERSEDED_BY_CATCHUP').length, 2);
});

test('catch-up: superseded offsets never come back; future offsets still fire normally', () => {
  const s = sale('2027-01-06 10:00'), states = {};
  const check = (now, offsets = [10080, 1440, 60]) => {
    const p = planCheck({ ...synth, src: s, now: T(now) }, offsets, states);
    if (p.create) states[p.create.offset] = { notified: true };
    p.superseded.forEach((o) => { states[o] = { superseded: true }; });
    return p;
  };
  assert.equal(check('2027-01-06 08:00').create.offset, 1440);        // 7d and 1d both due, none sent yet -> only the 1d one
  assert.equal(states[10080].superseded, true);
  assert.equal(check('2027-01-06 08:30').create, null);               // reopen: nothing again
  assert.equal(check('2027-01-06 09:00').create.offset, 60);          // the future offset fires at its own time
  assert.equal(check('2027-01-06 09:10').create, null);
  assert.equal(check('2027-01-06 10:00').create, null);               // expired
});

test('catch-up: follow after the due time (late follower) gets one reminder only while still useful', () => {
  const s = sale('2027-01-06 10:00');
  for (const [now, expect] of [['2027-01-06 08:00', null], ['2027-01-06 09:30', 60], ['2027-01-06 10:30', null]]) {
    const p = planCheck({ ...synth, src: s, now: T(now) }, [60]);
    assert.equal(p.create ? p.create.offset : null, expect, now);
  }
  assert.equal(planCheck({ ...synth, reminder_enabled: false, src: s, now: T('2027-01-06 09:30') }, [60]).create, null);   // consent off
});

test('catch-up: expired offsets are never revived; an offset already notified is not repeated', () => {
  const res = ms('RESULT_ANNOUNCEMENT', '2027-03-04 09:00');
  const p = planCheck({ ...synth, src: res, now: T('2027-03-04 09:01') }, [1440, 0]);            // 1440 expired, 0 still valid
  assert.equal(p.create.offset, 0);
  assert.equal(p.results.find((r) => r.offset === 1440).code, 'EXPIRED');
  const q = planCheck({ ...synth, src: res, now: T('2027-03-03 09:00') }, [1440, 0], { 1440: { notified: true } });
  assert.equal(q.create, null);
  assert.equal(q.results.find((r) => r.offset === 1440).code, 'DUPLICATE_BLOCKED');
});

test('exam text changes with the clock', () => {
  const open = ms('APPLICATION_OPEN', '2026-12-04 09:00'), res = ms('RESULT_ANNOUNCEMENT', '2027-03-04 09:00');
  assert.match(reminderText('APPLICATION_OPEN', open, 1440, T('2026-12-03 09:00')), /ใกล้เปิดรับสมัคร/);
  assert.equal(reminderText('APPLICATION_OPEN', open, 0, T('2026-12-04 10:00')), 'เปิดรับสมัครแล้ว');
  assert.match(reminderText('RESULT_ANNOUNCEMENT', res, 1440, T('2027-03-03 09:00')), /ใกล้ประกาศผล/);
  assert.equal(reminderText('RESULT_ANNOUNCEMENT', res, 0, T('2027-03-04 15:00')), 'วันนี้มีกำหนดประกาศผล');
});

test('full precision: one minute either side of every boundary', () => {
  const s = sale('2027-06-09 10:00');
  assert.equal(run(synth, s, 1440, '2027-06-08 09:59').code, 'NOT_DUE');
  assert.equal(run(synth, s, 1440, '2027-06-08 10:00').code, 'CREATED');
  assert.equal(run(synth, s, 1440, '2027-06-08 10:01').code, 'CREATED_LATE');
  assert.equal(run(synth, s, 1440, '2027-06-09 09:59').code, 'CREATED_LATE');
  assert.equal(run(synth, s, 1440, '2027-06-09 10:00').code, 'EXPIRED');
});

test('wording after the time has passed never prints "null" (regression found in the Valentine end-to-end run)', () => {
  const v = valentine('2027-02-14');
  assert.equal(reminderText('FIXED_CALENDAR_DAY', v, 1440, T('2027-02-15 00:00')), 'ผ่านไปแล้ว');
  assert.equal(reminderText('FIXED_CALENDAR_DAY', v, 1440, T('2027-02-14 23:59')), 'วันนี้');
  for (const kind of ['APPLICATION_CLOSE', 'EXAM_DATE', 'TICKET_SALE', 'EVENT', 'APPLICATION_OPEN', 'RESULT_ANNOUNCEMENT']) {
    const text = reminderText(kind, { target_min: T('2027-02-14 10:00') }, 60, T('2027-02-14 11:00'));
    assert.ok(!/null|undefined/.test(text), `${kind}: ${text}`);
  }
});
