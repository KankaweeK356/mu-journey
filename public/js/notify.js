// Follow / reminder / notification store, schema v2 (REMINDER_POLICY_V3). Pure logic + an optional storage object (localStorage or a test double).
// Parent follow + child reminder preferences:
//   concert_id  -> sale_id children        exam_id -> milestone children        CAL_VALENTINE / event_id -> one child (itself)
// Stored: local_user_id, followed parents, per-child reminder offsets, notifications, superseded offsets. Never stored: date of birth, name, e-mail.
import { occurrencesBetween, addDays } from './calendar.js';
import { REMINDER_POLICY_VERSION, parseBkk, fmtBkk, parseOffsets, evaluate, planCheck, reminderWindow, CODES } from './reminder.js';

export const SCHEMA_VERSION = 2;
export const STORAGE_KEY = 'mumu.notify.v2';
export const LEGACY_KEY = 'mumu.notify.v1';
export const keyOf = (uid, source, occ, offset) => `${uid}|${source}|${occ}|${offset}`;      // dedup key: user | source_entity_id | occurrence_datetime | offset_minutes

const uuid = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : 'u' + Math.random().toString(36).slice(2) + Date.now().toString(36));
const blank = () => ({ schema_version: SCHEMA_VERSION, rule_version: REMINDER_POLICY_VERSION, local_user_id: uuid(), follows: {}, notifications: [], superseded: {}, catchups: {}, sent: {} });

/** v1 (day based, one offset) -> v2. Only real network events are carried over; synthetic follows and old notifications are dropped. */
export function migrateV1(old) {
  const st = blank();
  if (old && old.local_user_id) st.local_user_id = old.local_user_id;
  for (const f of Object.values((old && old.follows) || {})) {
    if (!f || f.follow_status !== 'FOLLOWING' || f.origin !== 'NETWORK' || !f.schedule) continue;
    st.follows[f.event_id] = {
      parent_id: f.event_id, kind: 'EVENT', name: f.name, origin: 'NETWORK', place_id: f.place_id, place_name: f.place_name, deity_name: f.deity_name, wish_ids: f.wish_ids || [],
      follow_status: 'FOLLOWING', followed_at_min: parseBkk(f.followed_on) ?? 0,
      children: { [f.event_id]: { source_entity_id: f.event_id, source_type: 'EVENT', label: f.name, occ: { kind: 'schedule', schedule: f.schedule }, calendar_date_status: f.calendar_date, schedule_status: f.event_schedule,
        synthetic: false, offsets_available: [1440, 10080, 20160], offsets_enabled: f.reminder_enabled ? [Math.max(1, Number(f.notify_days_before) || 1) * 1440] : [] } },
    };
  }
  return st;
}

/** Occurrences of one child around `now` (epoch minutes): [{ key, target_min, end_min }]. */
export function occurrencesOf(child, now) {
  const o = child.occ || {};
  if (o.kind === 'single') { const t = parseBkk(o.datetime); return t == null ? [] : [{ key: fmtBkk(t), target_min: t, end_min: t }]; }
  if (o.kind === 'yearly') {
    const y = Number(fmtBkk(now).slice(0, 4)), out = [];
    for (const yy of [y - 1, y, y + 1]) { const t = parseBkk(`${yy}-${o.month_day}`); if (t != null) out.push({ key: fmtBkk(t), target_min: t, end_min: t }); }
    return out;
  }
  if (o.kind === 'schedule') {
    const a = fmtBkk(now).slice(0, 10);
    return occurrencesBetween(o.schedule, addDays(a, -2), addDays(a, 400)).map((x) => ({ key: fmtBkk(parseBkk(x.start)), target_min: parseBkk(x.start), end_min: parseBkk(x.end) }));
  }
  return [];
}

export function createStore({ storage = null, key = STORAGE_KEY, demo = false } = {}) {
  let st = blank();
  if (storage) {
    try {
      const raw = JSON.parse(storage.getItem(key) || 'null');
      if (raw && raw.schema_version === SCHEMA_VERSION && raw.local_user_id && raw.follows && Array.isArray(raw.notifications)) st = { ...blank(), ...raw };
      else if (!raw && key === STORAGE_KEY) {                                    // first run on v2: bring v1 follows over, then forget v1
        const legacy = JSON.parse(storage.getItem(LEGACY_KEY) || 'null');
        if (legacy && legacy.schema_version === 1) { st = migrateV1(legacy); storage.setItem(key, JSON.stringify(st)); storage.removeItem(LEGACY_KEY); }
      }
    } catch { /* unreadable or blocked storage: start empty */ }
  }
  const save = () => { if (storage) { try { storage.setItem(key, JSON.stringify(st)); } catch { /* quota or private mode: keep working in memory */ } } };
  const listeners = new Set();
  const changed = () => { save(); listeners.forEach((fn) => fn()); };
  const mode = demo ? 'SIMULATION' : 'NORMAL';

  const baseFor = (parent, child, occ, now) => ({
    mode, synthetic: !!child.synthetic, followed: parent.follow_status === 'FOLLOWING', reminder_enabled: child.offsets_enabled.length > 0,
    calendar_date_status: child.calendar_date_status, schedule_status: child.schedule_status, now,
    src: { source_type: child.source_type, milestone_type: child.milestone_type, exam_id: child.exam_id, target_min: occ.target_min, end_min: occ.end_min },
    ctx: { examClose: () => child.exam_close_min },
  });
  const stateFor = (source, occ, offset) => {
    const id = keyOf(st.local_user_id, source, occ.key, offset), n = st.notifications.find((x) => x.id === id);
    return { notified: !!n || !!st.sent[id], read: !!n && n.read_status === 'READ', superseded: !!st.superseded[id],
      previous_occurrence_notified: st.notifications.some((x) => x.source_entity_id === source && x.occurrence_min < occ.target_min) };
  };

  const api = {
    demo, mode,
    get state() { return st; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    userId: () => st.local_user_id,
    isFollowed: (pid) => !!(st.follows[pid] && st.follows[pid].follow_status === 'FOLLOWING'),
    follows: () => Object.values(st.follows).filter((f) => f.follow_status === 'FOLLOWING'),
    child: (pid, sid) => (st.follows[pid] && st.follows[pid].children[sid]) || null,

    /** parent: { parent_id, kind, name, origin, wish_ids, place_id?, place_name?, deity_name?, children:[child] } ; every child starts with its reminders OFF. */
    follow(parent, now) {
      const children = {};
      for (const c of parent.children) children[c.source_entity_id] = { ...c, offsets_enabled: [] };
      st.follows[parent.parent_id] = { ...parent, children, follow_status: 'FOLLOWING', followed_at_min: now };
      changed();
    },
    unfollow(pid) {
      delete st.follows[pid];
      st.notifications = st.notifications.filter((n) => n.parent_id !== pid);
      changed();
    },
    /** Consent for one child: the offsets (minutes) the user switched on. [] = reminders off.
     *  `now` = the moment of the switch; an offset whose due time is already behind that moment is a retro (catch-up) offset. */
    setOffsets(pid, sid, offsets, now) {
      const c = api.child(pid, sid), p = st.follows[pid];
      if (!c) return;
      const next = [...new Set(offsets)].filter((o) => c.offsets_available.includes(o)).sort((a, b) => b - a);
      const armed = { ...(c.armed_at || {}) };
      Object.keys(armed).forEach((k) => { if (!next.includes(Number(k))) delete armed[k]; });
      next.forEach((o) => { if (!c.offsets_enabled.includes(o) || armed[o] == null) armed[o] = Number.isInteger(now) ? now : p.followed_at_min; });
      c.offsets_enabled = next; c.armed_at = armed;
      changed();
    },

    /** Check-on-open / on-follow. Creates at most one notification per occurrence per check; persists SUPERSEDED_BY_CATCHUP. */
    runCheck(now) {
      const created = [], log = [];
      let dirty = false;
      for (const parent of api.follows()) {
        for (const child of Object.values(parent.children)) {
          if (!child.offsets_enabled.length) continue;
          for (const occ of occurrencesOf(child, now)) {
            const states = {};
            child.offsets_enabled.forEach((o) => { states[o] = stateFor(child.source_entity_id, occ, o); });
            const plan = planCheck(baseFor(parent, child, occ, now), child.offsets_enabled, states);
            log.push({ parent_id: parent.parent_id, source_entity_id: child.source_entity_id, occurrence: occ.key, results: plan.results });
            plan.superseded.forEach((o) => { st.superseded[keyOf(st.local_user_id, child.source_entity_id, occ.key, o)] = true; dirty = true; });
            let create = plan.create;
            if (create) {
              // A retro offset (already overdue when the user switched it on) is a catch-up: at most ONE per user + occurrence, remembered
              // across toggles, unfollow/follow and re-opens. An offset that only became due while the app was closed is not retro.
              const w0 = reminderWindow(baseFor(parent, child, occ, now).src, create.offset, { examClose: () => child.exam_close_min });
              const armedAt = (child.armed_at && child.armed_at[create.offset] != null) ? child.armed_at[create.offset] : parent.followed_at_min;
              if (w0.ok && w0.due < armedAt) {
                const lk = keyOf(st.local_user_id, child.source_entity_id, occ.key, 'CATCHUP');
                if (st.catchups[lk]) {
                  st.superseded[keyOf(st.local_user_id, child.source_entity_id, occ.key, create.offset)] = true; dirty = true;
                  log[log.length - 1].results = log[log.length - 1].results.map((r) => (r.offset === create.offset ? { ...r, code: CODES.SUPERSEDED_BY_CATCHUP } : r));
                  create = null;
                } else { st.catchups[lk] = { offset: create.offset, at: now }; dirty = true; }
              }
            }
            if (create) {
              const w = reminderWindow(baseFor(parent, child, occ, now).src, create.offset, { examClose: () => child.exam_close_min });
              const n = { id: keyOf(st.local_user_id, child.source_entity_id, occ.key, create.offset), parent_id: parent.parent_id, source_entity_id: child.source_entity_id,
                occurrence_datetime: occ.key, occurrence_min: occ.target_min, offset: create.offset, due_min: w.due, expires_min: w.expires, created_at_min: now,
                code: create.code, read_status: 'UNREAD', synthetic: !!child.synthetic, rule_version: REMINDER_POLICY_VERSION };
              st.notifications.push(n); st.sent[n.id] = true; created.push(n); dirty = true;     // `sent` outlives unfollow: never the same alert twice
            }
          }
        }
      }
      if (dirty) changed();
      return { created, log };
    },

    /** What each enabled/available offset would give right now for the next live occurrence of a child (no side effects). */
    explain(pid, sid, now) {
      const parent = st.follows[pid], child = api.child(pid, sid);
      if (!parent || !child) return null;
      const occs = occurrencesOf(child, now).filter((o) => {
        const w = reminderWindow(baseFor(parent, child, o, now).src, Math.min(...child.offsets_available), { examClose: () => child.exam_close_min });
        return !w.ok || now < Math.max(w.expires, o.end_min + 1);
      });
      const occ = occs.sort((a, b) => a.target_min - b.target_min)[0];
      if (!occ) return { occurrence: null, rows: [] };
      const rows = child.offsets_available.map((o) => {
        const enabled = child.offsets_enabled.includes(o);
        const b = { ...baseFor(parent, child, occ, now), reminder_enabled: enabled };
        return { offset: o, enabled, ...evaluate({ ...b, offset: o, state: stateFor(child.source_entity_id, occ, o) }) };
      });
      return { occurrence: occ, rows };
    },

    list(now) { return st.notifications.map((n) => ({ ...n, expired: now >= n.expires_min })).sort((a, b) => a.occurrence_min - b.occurrence_min || (a.id < b.id ? -1 : 1)); },
    unread(now) { return api.list(now).filter((n) => n.read_status === 'UNREAD' && !n.expired); },
    markRead(id) { const n = st.notifications.find((x) => x.id === id); if (n && n.read_status !== 'READ') { n.read_status = 'READ'; changed(); } },
    markAllRead() { st.notifications.forEach((n) => { n.read_status = 'READ'; }); changed(); },
    clear() { st = blank(); if (storage) { try { storage.removeItem(key); storage.removeItem(LEGACY_KEY); } catch { /* ignore */ } } listeners.forEach((fn) => fn()); },
  };
  return api;
}

/** Why reminders cannot be switched on for this child in this mode (null = they can). Uses steps 1 and 4 of the validation priority. */
export function reminderBlock(child, mode) {
  const r = evaluate({ mode, synthetic: !!child.synthetic, followed: true, reminder_enabled: true, calendar_date_status: child.calendar_date_status, schedule_status: child.schedule_status,
    src: { source_type: child.source_type, target_min: 0 }, offset: 0, now: 0 });
  return [CODES.BLOCKED_SYNTHETIC, CODES.DATE_UNVERIFIED, CODES.BLOCKED_UNVERIFIED].includes(r.code) ? r.code : null;
}
