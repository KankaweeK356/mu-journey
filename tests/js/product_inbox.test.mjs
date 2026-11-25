// Trip rounds, the proactive bell list and the Tab 2 reminder preview (pure functions).  node --test tests/js/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { priceText, roundLabel, productOf, upcomingRounds, chosenRound } from '../../public/js/tripproduct.js';
import { buildInbox, unseenItems, seenKey, nextYearly, MAX_ITEMS, WINDOW_DAYS } from '../../public/js/inbox.js';
import { suggestionFor, reminderTimeline } from '../../public/js/calendarpreview.js';
import { parseBkk, dateBkk } from '../../public/js/reminder.js';

const data = (f) => JSON.parse(readFileSync(new URL('../../public/data/' + f, import.meta.url), 'utf-8'));
const products = data('trip_products.json'), fixedDays = data('calendar_fixed.json').fixed_days;
const D = { demo: data('calendar_demo.json'), fixed: data('calendar_fixed.json') };

test('price text and round label', () => {
  assert.equal(priceText(899), '899 บาท');
  assert.equal(priceText(1099), '1,099 บาท');
  assert.equal(roundLabel('2026-12-05'), 'เสาร์ 5 ธ.ค. 2569');
  assert.equal(roundLabel('2026-12-06'), 'อาทิตย์ 6 ธ.ค. 2569');
});

test('only rounds that have not passed are offered; none is invented', () => {
  assert.equal(upcomingRounds(products, 'TRIP_LOVE', '2026-11-25').length, 8);
  assert.equal(upcomingRounds(products, 'TRIP_LOVE', '2026-11-25')[0].service_date, '2026-12-05');
  assert.equal(upcomingRounds(products, 'TRIP_LOVE', '2026-12-05')[0].service_date, '2026-12-05');     // the travel date itself has not passed
  assert.equal(upcomingRounds(products, 'TRIP_LOVE', '2026-12-06')[0].service_date, '2026-12-06');
  assert.equal(upcomingRounds(products, 'TRIP_LOVE', '2026-12-28').length, 0);
  assert.equal(upcomingRounds(products, 'TRIP_NONE', '2026-11-25').length, 0);
  assert.equal(productOf(products, 'TRIP_NONE'), null);
});

test('a chosen date counts only while it is an upcoming round of that trip', () => {
  assert.ok(chosenRound(products, 'TRIP_CAREER', '2026-11-25', '2026-12-12'));
  assert.equal(chosenRound(products, 'TRIP_CAREER', '2026-12-13', '2026-12-12'), null);
  assert.equal(chosenRound(products, 'TRIP_CAREER', '2026-11-25', '2026-12-07'), null);
});

const ev = (id, date, extra = {}) => ({ event_id: id, event_name: 'กิจกรรม ' + id, compatible_wish_ids: ['W01'], evidence_paths: [{ text: 'x' }], static: { calendar_date: 'DATE_UNVERIFIED', event_schedule: 'EVENT_SCHEDULE_UNVERIFIED' },
  schedule: { kind: 'dates', dates: [date] }, ...extra });
const base = { fixedDays, wishes: ['W01'], today: '2026-11-25' };

test('related items appear by themselves: calendar day first group, activities second, nearest first', () => {
  const items = buildInbox({ ...base, eligible: [ev('E2', '2026-12-20'), ev('E1', '2026-12-01')] });
  assert.deepEqual(items.map((x) => [x.id, x.group, x.days]), [['CAL_VALENTINE', 'DAY', 81], ['E1', 'EVENT', 6], ['E2', 'EVENT', 25]]);
  assert.equal(items[0].nearFrom, '2027-02-07');
  assert.equal(items[1].near, false);                                    // unconfirmed activities never get a reminder mark
});

test('not cluttered: 90 days, at most 5, no duplicates, nothing past, unrelated or without a path', () => {
  const many = Array.from({ length: 9 }, (_, i) => ev('E' + i, `2026-12-0${i + 1}`));
  const items = buildInbox({ ...base, eligible: [...many, ev('SAME', '2026-12-01', { event_name: 'กิจกรรม E0' })] });
  assert.equal(items.length, MAX_ITEMS);
  assert.ok(items.some((x) => x.id === 'CAL_VALENTINE'), 'the confirmed day is not pushed out by activities');
  assert.equal(new Set(items.map((x) => x.name + x.start)).size, items.length);
  const none = buildInbox({ ...base, wishes: ['W02'], eligible: [ev('OLD', '2026-11-01'), ev('FAR', '2027-05-01'), ev('NOPATH', '2026-12-01', { evidence_paths: [] }), ev('OTHER', '2026-12-01')] });
  assert.deepEqual(none, []);
  assert.equal(WINDOW_DAYS, 90);
  assert.deepEqual(buildInbox({ ...base, today: '2026-11-15', eligible: [] }), []);                       // Valentine is 91 days away
});

test('dismissed items stay away; seen items stop counting until a calendar day gets near', () => {
  assert.deepEqual(buildInbox({ ...base, dismissed: new Set(['CAL_VALENTINE']) }), []);
  const first = buildInbox(base), seen = new Set(first.map(seenKey));
  assert.equal(unseenItems(first, seen).length, 0);
  for (const [today, near] of [['2027-02-06', false], ['2027-02-07', true], ['2027-02-13', true]]) {
    const now = buildInbox({ ...base, today });
    assert.equal(now[0].near, near, today);
    assert.equal(unseenItems(now, seen).length, near ? 1 : 0, today);
    now.forEach((x) => seen.add(seenKey(x)));
  }
});

test('a saved item is listed even without a chosen interest; synthetic items never are', () => {
  const saved = (synthetic) => [{ parent_id: 'CAL_VALENTINE', name: 'V', wish_ids: ['W01'], children: { CAL_VALENTINE: { synthetic, occ: { kind: 'yearly', month_day: '02-14' } } } }];
  assert.deepEqual(buildInbox({ today: '2027-02-13', saved: saved(false) }).map((x) => [x.id, x.saved]), [['CAL_VALENTINE', true]]);
  assert.deepEqual(buildInbox({ today: '2027-02-13', saved: saved(true) }), []);
  assert.equal(nextYearly('02-14', '2027-02-15'), '2028-02-14');
});

test('Tab 2 preview: the real engine creates one reminder per chosen offset, in order, from one consent', () => {
  const from = parseBkk('2026-11-25 10:00');
  for (const [scenario, offsets] of [['VALENTINE', 2], ['EXAM_DATE', 3], ['TICKET', 3]]) {
    const x = suggestionFor(scenario, D, from);
    assert.ok(x, scenario);
    assert.ok(x.target - Math.max(...x.child.offsets_available) >= from, 'the whole schedule is still ahead');
    const rows = reminderTimeline(x, from);
    assert.equal(rows.length, offsets, scenario);
    assert.ok(rows.every((r, i) => r.code === 'CREATED' || r.code === 'CREATED_NEW_OCCURRENCE', scenario) && rows.every((r, i) => !i || rows[i - 1].at < r.at), JSON.stringify(rows));
    assert.ok(rows.every((r) => r.at < x.target));
  }
  assert.equal(dateBkk(suggestionFor('VALENTINE', D, from).target), '2027-02-14');
  assert.equal(suggestionFor('EXAM_DATE', D, parseBkk('2030-01-01 00:00')), null);
});
