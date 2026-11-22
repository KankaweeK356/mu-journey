// REMINDER_POLICY_V3: due / expiry windows, validation priority, catch-up and canonical result codes.
// Pure functions (no DOM, no storage, no network). Time is Asia/Bangkok = UTC+07:00 with a fixed offset (Thailand has no DST),
// handled as integer minutes since the Unix epoch, so results never depend on the device time zone.
export const REMINDER_POLICY_VERSION = 'REMINDER_POLICY_V3';
export const TZ_OFFSET_MIN = 7 * 60;

export const CODES = Object.freeze({
  CREATED: 'CREATED', CREATED_LATE: 'CREATED_LATE', CREATED_NEW_OCCURRENCE: 'CREATED_NEW_OCCURRENCE',
  NOT_DUE: 'NOT_DUE', EXPIRED: 'EXPIRED', NOT_FOLLOWED: 'NOT_FOLLOWED', REMINDER_DISABLED: 'REMINDER_DISABLED',
  DUPLICATE_BLOCKED: 'DUPLICATE_BLOCKED', DUPLICATE_BLOCKED_READ: 'DUPLICATE_BLOCKED_READ', SUPERSEDED_BY_CATCHUP: 'SUPERSEDED_BY_CATCHUP',
  DATE_UNVERIFIED: 'DATE_UNVERIFIED', BLOCKED_UNVERIFIED: 'BLOCKED_UNVERIFIED', BLOCKED_SYNTHETIC: 'BLOCKED_SYNTHETIC', INVALID_REMINDER_WINDOW: 'INVALID_REMINDER_WINDOW',
});
/** Names the expert used in prose map onto the canonical (dataset) codes; no detail is lost. */
export const ALIASES = Object.freeze({ ALREADY_NOTIFIED: 'DUPLICATE_BLOCKED' });
export const canonical = (c) => ALIASES[c] || c;
export const CREATED_CODES = new Set([CODES.CREATED, CODES.CREATED_LATE, CODES.CREATED_NEW_OCCURRENCE]);

/* ------------------------------------------------------------------ time (explicit +07:00, no ambiguous parsing) */
/** 'YYYY-MM-DD' (= 00:00) or 'YYYY-MM-DD HH:MM' in Asia/Bangkok -> integer minutes since the epoch, or null when invalid. */
export function parseBkk(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/.exec(String(s == null ? '' : s).trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = [+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0)];
  if (h > 23 || mi > 59) return null;
  const t = Date.UTC(y, mo - 1, d, h, mi);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return t / 60000 - TZ_OFFSET_MIN;
}
export const fmtBkk = (min) => new Date((min + TZ_OFFSET_MIN) * 60000).toISOString().slice(0, 16).replace('T', ' ');
export const dateBkk = (min) => fmtBkk(min).slice(0, 10);
/** 00:00 Asia/Bangkok of the day after `min`. */
export const nextDayStart = (min) => Math.floor((min + TZ_OFFSET_MIN) / 1440) * 1440 + 1440 - TZ_OFFSET_MIN;
/** The current instant as epoch minutes (the only place that reads the device clock). */
export const nowMin = (d = new Date()) => Math.floor(d.getTime() / 60000);

/** '10080;1440;60' -> [10080, 1440, 60]. Returns null when any piece is not a non-negative integer. */
export function parseOffsets(s) {
  const parts = String(s == null ? '' : s).split(';').map((x) => x.trim()).filter((x) => x !== '');
  if (!parts.length || parts.some((x) => !/^\d+$/.test(x))) return null;
  return parts.map(Number);
}

/* ------------------------------------------------------------------ due / expiry per source and offset */
/**
 * src: { source_type: 'TICKET_SALE'|'EXAM_MILESTONE'|'FIXED_CALENDAR_DAY'|'EVENT', target_min, ... }
 *   EXAM_MILESTONE needs milestone_type (and exam_id + ctx.examClose(exam_id) for APPLICATION_OPEN with offset 0)
 *   EVENT needs end_min (last minute of the activity; expiry = the next 00:00 Bangkok)
 * Returns { ok, due, expires } or { ok:false, reason:'INVALID_REMINDER_WINDOW', why }.
 */
export function reminderWindow(src, offset, ctx = {}) {
  const bad = (why) => ({ ok: false, reason: CODES.INVALID_REMINDER_WINDOW, why });
  if (!Number.isInteger(offset) || offset < 0) return bad('offset');
  if (!Number.isInteger(src && src.target_min)) return bad('target');
  const target = src.target_min, due = target - offset;
  let expires;
  switch (src.source_type) {
    case 'TICKET_SALE': expires = target; break;                                   // expires when the sale starts (exclusive); sale_end is never used
    case 'FIXED_CALENDAR_DAY': expires = nextDayStart(target); break;              // an all-day occasion: valid until 00:00 of the next day
    case 'EVENT': expires = nextDayStart(Number.isInteger(src.end_min) ? src.end_min : target); break;
    case 'EXAM_MILESTONE': {
      const t = src.milestone_type;
      if (offset > 0) { expires = target; break; }                                 // a "before" reminder ends when the milestone happens
      if (t === 'APPLICATION_OPEN') {
        const close = ctx.examClose ? ctx.examClose(src.exam_id) : undefined;
        if (!Number.isInteger(close)) return bad('no application close time for this exam');
        expires = close;
      } else if (t === 'RESULT_ANNOUNCEMENT') expires = nextDayStart(target);
      else return bad(`offset 0 is not allowed for ${t}`);                          // APPLICATION_CLOSE, EXAM_DATE
      break;
    }
    default: return bad('unknown source_type');
  }
  if (!(expires > due)) return bad('expiry is not after due time');
  return { ok: true, due, expires };
}

/* ------------------------------------------------------------------ one offset, validation priority */
/**
 * input: { mode:'SIMULATION'|'NORMAL', synthetic, followed, reminder_enabled, calendar_date_status, schedule_status,
 *          src, offset, now, state:{ notified, read, superseded, previous_occurrence_notified }, ctx }
 * Priority: 1 data mode / synthetic safety, 2 follow, 3 consent, 4 date & schedule verification, 5 due/expiry window,
 *           6 duplicate / superseded, 7 creation.
 */
export function evaluate(input) {
  const st = input.state || {};
  const out = (code, extra = {}) => ({ code, offset: input.offset, ...extra });
  if (input.synthetic && input.mode !== 'SIMULATION') return out(CODES.BLOCKED_SYNTHETIC);
  if (!input.followed) return out(CODES.NOT_FOLLOWED);
  if (!input.reminder_enabled) return out(CODES.REMINDER_DISABLED);
  const cal = input.calendar_date_status, sch = input.schedule_status;
  if (cal === 'DATE_UNVERIFIED' || cal === 'NO_COMPUTABLE_DATE') return out(CODES.DATE_UNVERIFIED);
  if (!input.synthetic && sch !== 'EVENT_SCHEDULE_VERIFIED' && sch !== 'NOT_APPLICABLE') return out(CODES.BLOCKED_UNVERIFIED);
  const w = reminderWindow(input.src, input.offset, input.ctx);
  if (!w.ok) return out(CODES.INVALID_REMINDER_WINDOW, { why: w.why });
  const base = { due: w.due, expires: w.expires };
  if (input.now < w.due) return out(CODES.NOT_DUE, base);
  if (input.now >= w.expires) return out(CODES.EXPIRED, base);
  if (st.superseded) return out(CODES.SUPERSEDED_BY_CATCHUP, base);
  if (st.notified) return out(st.read ? CODES.DUPLICATE_BLOCKED_READ : CODES.DUPLICATE_BLOCKED, base);
  const late = input.now > w.due;
  return out(st.previous_occurrence_notified ? CODES.CREATED_NEW_OCCURRENCE : late ? CODES.CREATED_LATE : CODES.CREATED, { ...base, late });
}

/**
 * One check of one occurrence over every offset the user switched on (catch-up rule).
 * At most one notification is created per occurrence per check: the offset closest to the target among those that are due
 * and not expired. The other due offsets become SUPERSEDED_BY_CATCHUP (the caller must persist that). Offsets not yet due stay open.
 * base = every evaluate() field except offset and state; states = { [offset]: state }.
 */
export function planCheck(base, offsets, states = {}) {
  const results = offsets.map((o) => evaluate({ ...base, offset: o, state: states[o] || {} }));
  const candidates = results.filter((r) => CREATED_CODES.has(r.code));
  if (!candidates.length) return { create: null, superseded: [], results };
  const pick = candidates.reduce((a, b) => (b.offset < a.offset ? b : a));        // smallest offset = closest to the target time
  const superseded = candidates.filter((r) => r !== pick).map((r) => r.offset);
  const final = results.map((r) => (superseded.includes(r.offset) ? { ...r, code: CODES.SUPERSEDED_BY_CATCHUP } : r));
  return { create: pick, superseded, results: final };
}

/** Wording follows the clock, never a stale "in N days". kind: milestone_type | sale_phase | 'FIXED_CALENDAR_DAY' */
export function reminderText(kind, src, offset, now) {
  const left = src.target_min - now;
  const days = Math.ceil(left / 1440);
  const when = left <= 0 ? 'ผ่านเวลาแล้ว' : left < 60 ? `อีก ${left} นาที` : left < 1440 ? `อีก ${Math.ceil(left / 60)} ชั่วโมง` : `อีก ${days} วัน`;
  switch (kind) {
    case 'FIXED_CALENDAR_DAY': return dateBkk(now) === dateBkk(src.target_min) ? 'วันนี้' : left > 0 ? `ใกล้ถึง · ${when}` : 'ผ่านไปแล้ว';
    case 'APPLICATION_OPEN': return left > 0 ? `ใกล้เปิดรับสมัคร · ${when}` : 'เปิดรับสมัครแล้ว';
    case 'APPLICATION_CLOSE': return `ใกล้ปิดรับสมัคร · ${when}`;
    case 'EXAM_DATE': return `ใกล้วันสอบ · ${when}`;
    case 'RESULT_ANNOUNCEMENT': return left > 0 ? `ใกล้ประกาศผล · ${when}` : 'วันนี้มีกำหนดประกาศผล';
    case 'EVENT': return left > 0 ? `ใกล้ถึง · ${when}` : 'อยู่ในช่วงกิจกรรม';
    default: return left > 0 ? `ใกล้เปิดขาย · ${when}` : 'ถึงเวลาแล้ว';          // TICKET_SALE
  }
}
