// Layer B (calendar display) + reminder rules. Pure functions: no DOM, no storage, no network, so Node can test them.
// Mirrors api/_calendar.py (a parity test compares the two). All dates are Asia/Bangkok calendar dates ('YYYY-MM-DD').
export const TZ = 'Asia/Bangkok';

/** Today's date in Bangkok, whatever the device time zone is. */
export function bangkokToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
const dayNo = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
const isoOf = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
export const addDays = (iso, n) => isoOf(dayNo(iso) + n);
export const daysBetween = (a, b) => dayNo(b) - dayNo(a);
export const weekdayOf = (iso) => (new Date(dayNo(iso) * 86400000).getUTCDay() + 6) % 7; // Monday = 0, like Python

export function isIso(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return isoOf(dayNo(s)) === s;
}

/** Every occurrence of a schedule rule that overlaps [a, b]. Same event_id on every occurrence; a past date is never moved to next year. */
export function occurrencesBetween(sched, a, b) {
  const out = [];
  if (!sched) return out;
  if (sched.kind === 'weekly') {
    for (let n = dayNo(a); n <= dayNo(b); n++) { const iso = isoOf(n); if (sched.weekdays.includes(weekdayOf(iso))) out.push({ start: iso, end: iso }); }
  } else if (sched.kind === 'first_weekday_of_month') {
    let y = +a.slice(0, 4), m = +a.slice(5, 7);
    while (dayNo(`${y}-${String(m).padStart(2, '0')}-01`) <= dayNo(b)) {
      const first = `${y}-${String(m).padStart(2, '0')}-01`;
      const f = addDays(first, (sched.weekday - weekdayOf(first) + 7) % 7);
      if (dayNo(f) >= dayNo(a) && dayNo(f) <= dayNo(b)) out.push({ start: f, end: f });
      if (m === 12) { y += 1; m = 1; } else m += 1;
    }
  } else if (sched.kind === 'dates') {
    sched.dates.forEach((x) => { if (dayNo(x) >= dayNo(a) && dayNo(x) <= dayNo(b)) out.push({ start: x, end: x }); });
  } else {
    (sched.occurrences || []).forEach((o) => { if (dayNo(o.start) <= dayNo(b) && dayNo(o.end) >= dayNo(a)) out.push(o); });
  }
  return out;
}

export function classify(sched, today, horizon = 400) {
  const occ = occurrencesBetween(sched, today, addDays(today, horizon));
  if (occ.length) {
    const o = occ[0], ongoing = dayNo(o.start) <= dayNo(today) && dayNo(today) <= dayNo(o.end);
    return { display_status: ongoing ? 'ONGOING' : 'UPCOMING', next_start: o.start, next_end: o.end, days_until: Math.max(0, daysBetween(today, o.start)) };
  }
  if ((sched.kind === 'annual' || sched.kind === 'none') && sched.occurrences && sched.occurrences.length) {
    return { display_status: 'PAST', next_start: null, next_end: null, days_until: null, last_end: sched.occurrences.map((o) => o.end).sort().pop() };
  }
  return { display_status: 'NO_OCCURRENCE_IN_RANGE', next_start: null, next_end: null, days_until: null };
}

/** Keeps the Layer A order (network_rank) and shows only events that are still coming or running. Never changes a score. */
export function displayLayer(eligibleRows, today) {
  const shown = [], hidden = [];
  eligibleRows.forEach((r) => {
    const row = { ...r, ...classify(r.schedule, today) };
    (row.display_status === 'UPCOMING' || row.display_status === 'ONGOING' ? shown : hidden).push(row);
  });
  shown.forEach((r, i) => { r.display_rank = i + 1; });
  return { as_of: today, displayable: shown, not_displayed: hidden };
}

/* ------------------------------------------------------------------ reminder rules */
export const POLICY = { INFO_ONLY: 'INFO_ONLY', ALERT_WITH_LABEL: 'ALERT_WITH_LABEL' };
export const OFFSETS = [1, 7, 14];

export const isSynthetic = (ev) => ev.event_schedule === 'SYNTHETIC_DEMO' || ev.calendar_date === 'SYNTHETIC_DATE';

/**
 * May this event raise a reminder?  Real events need CALENDAR_DATE_VERIFIED and EVENT_SCHEDULE_VERIFIED (none of the 37 has the second one).
 * Policy ALERT_WITH_LABEL (option B, pending expert approval) lets a real event alert with a visible "schedule not confirmed" label.
 * Synthetic events alert only in the demo simulation, never against the real clock.
 */
export function alertRule(ev, { policy = POLICY.INFO_ONLY, demo = false } = {}) {
  if (isSynthetic(ev)) return demo ? { ok: true, label: 'SYNTHETIC_DEMO' } : { ok: false, why: 'SYNTHETIC_OUTSIDE_SIMULATION' };
  if (ev.calendar_date === 'CALENDAR_DATE_VERIFIED' && ev.event_schedule === 'EVENT_SCHEDULE_VERIFIED') return { ok: true, label: null };
  if (policy === POLICY.ALERT_WITH_LABEL && ev.calendar_date !== 'NO_COMPUTABLE_DATE') return { ok: true, label: 'SCHEDULE_UNCONFIRMED' };
  return { ok: false, why: 'BLOCKED_UNVERIFIED' };
}

/** Occurrences that are due today and have not been alerted yet. due = start - offset at 00:00 Bangkok; no alert for a due date before the follow. */
export function dueOccurrences(sched, today, offset, followedOn, horizon = 400) {
  return occurrencesBetween(sched, today, addDays(today, horizon))
    .map((o) => ({ ...o, due_on: addDays(o.start, -offset) }))
    .filter((o) => daysBetween(o.due_on, today) >= 0 && daysBetween(today, o.end) >= 0 && daysBetween(followedOn, o.due_on) >= 0);
}

export const dedupKey = (uid, eventId, occStart, offset) => `${uid}|${eventId}|${occStart}|${offset}`;

/* ------------------------------------------------------------------ proactive discovery card (step 04) */
export const NEAR_DAYS = 14;

/** Wording rule: "ใกล้ถึง" only when the calendar date itself is verified AND it is within NEAR_DAYS. Anything else is "may interest you". */
export function discoveryTone(row) {
  const dateOk = row.static && row.static.calendar_date === 'CALENDAR_DATE_VERIFIED';
  return dateOk && row.display_status === 'UPCOMING' && row.days_until <= NEAR_DAYS ? 'NEAR' : dateOk && row.display_status === 'ONGOING' ? 'NEAR' : 'MAYBE';
}

/**
 * Real network events only (rows of EVENT_RANKING_V1, which already passed the hard exclusions). Keeps the Layer A order,
 * drops events that are over, optionally narrows to the focused wish (presentation only), shows at most 2, hides when empty.
 */
export function pickDiscovery(eligibleRows, today, { focus = 'ALL', dismissed = new Set(), max = 2 } = {}) {
  const shown = displayLayer(eligibleRows, today).displayable
    .filter((r) => !dismissed.has(r.event_id))
    .filter((r) => focus === 'ALL' || (r.compatible_wish_ids || []).includes(focus))
    .filter((r) => r.evidence_paths && r.evidence_paths.length);       // every card must carry a real evidence path
  return shown.slice(0, Math.min(max, 2)).map((r) => ({ ...r, tone: discoveryTone(r) }));
}
