// What the Tab 1 bell shows (proactive list, 2026-11-25): upcoming days and activities related to the chosen interests, plus what the
// user saved. It is a list of RELATED items, not a delivery promise: real activities keep "schedule not confirmed" and get no reminder date.
// Pure functions (no DOM, no storage, no network). Real data only: synthetic concerts / exams never come here.
import { displayLayer, classify, addDays, daysBetween } from './calendar.js';

export const WINDOW_DAYS = 90, MAX_ITEMS = 5, NEAR_DAYS = 7;

/** Next 'YYYY-MM-DD' of a yearly 'MM-DD' day that is today or later. */
export function nextYearly(monthDay, today) {
  const y = Number(today.slice(0, 4));
  return [y, y + 1].map((yy) => `${yy}-${monthDay}`).find((d) => d >= today);
}

/** Confirmed calendar days get a "ใกล้ถึง" mark from NEAR_DAYS before, and count again at 1 day. */
const dayStage = (days) => (days <= 1 ? 'D1' : days <= NEAR_DAYS ? 'D7' : 'NEW');

function dayItem(id, name, date, today, extra) {
  const days = daysBetween(today, date);
  return { id, group: 'DAY', name, start: date, end: date, days, near: days <= NEAR_DAYS, nearFrom: addDays(date, -NEAR_DAYS), stage: dayStage(days), ...extra };
}
function eventItem(id, name, c, extra) {
  return { id, group: 'EVENT', name, start: c.next_start, end: c.next_end, days: c.days_until, ongoing: c.display_status === 'ONGOING', near: false, nearFrom: null, stage: 'NEW', ...extra };
}

/**
 * fixedDays: rows of calendar_fixed.json · eligible: result.events.eligible (already passed the user's exclusions) · saved: the follow store's items
 * wishes: the interests asked about now · returns at most MAX_ITEMS items, saved first, then calendar days, then activities; shown nearest first.
 */
export function buildInbox({ fixedDays = [], eligible = [], saved = [], wishes = [], today, dismissed = new Set() }) {
  const out = new Map();
  const inWindow = (days) => days != null && days >= 0 && days <= WINDOW_DAYS;
  for (const f of saved) {
    const child = f && f.children && Object.values(f.children)[0];
    if (!child || child.synthetic) continue;
    if (child.occ.kind === 'yearly') {
      const date = nextYearly(child.occ.month_day, today), it = date && dayItem(f.parent_id, f.name, date, today, { saved: true, savedParent: f });
      if (it && inWindow(it.days)) out.set(it.id, it);
    } else if (child.occ.kind === 'schedule') {
      const c = classify(child.occ.schedule, today);
      if ((c.display_status === 'UPCOMING' || c.display_status === 'ONGOING') && inWindow(c.days_until)) out.set(f.parent_id, eventItem(f.parent_id, f.name, c, { saved: true, savedParent: f }));
    }
  }
  for (const d of fixedDays) {
    if (d.visibility_scope !== 'NORMAL_CALENDAR' || d.data_origin === 'SYNTHETIC_DEMO' || !wishes.includes(d.wish_id)) continue;
    const date = nextYearly(d.month_day, today);
    if (!date) continue;
    const it = dayItem(d.calendar_item_id, d.event_name, date, today, { fixed: d });
    if (inWindow(it.days)) out.set(it.id, { ...it, ...(out.get(it.id) || {}), fixed: d });
  }
  const seenSame = new Set([...out.values()].map((x) => `${x.name}|${x.start}`));
  for (const r of displayLayer(eligible, today).displayable) {
    if (!inWindow(r.days_until) || !(r.evidence_paths && r.evidence_paths.length) || !(r.compatible_wish_ids || []).some((w) => wishes.includes(w))) continue;
    if (out.has(r.event_id)) { out.set(r.event_id, { ...out.get(r.event_id), row: r }); continue; }
    const key = `${r.event_name}|${r.next_start}`;
    if (seenSame.has(key)) continue;
    seenSame.add(key);
    out.set(r.event_id, eventItem(r.event_id, r.event_name, r, { row: r }));
  }
  const rank = (x) => (x.saved ? 0 : x.group === 'DAY' ? 1 : 2);
  return [...out.values()].filter((x) => !dismissed.has(x.id))
    .sort((a, b) => rank(a) - rank(b) || a.days - b.days).slice(0, MAX_ITEMS)
    .sort((a, b) => (a.group === b.group ? a.days - b.days : a.group === 'DAY' ? -1 : 1));
}

export const seenKey = (item) => `${item.id}|${item.stage}`;
export const unseenItems = (items, seen) => items.filter((x) => !seen.has(seenKey(x)));
