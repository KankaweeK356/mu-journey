// Follow / reminder / notification store. Pure logic + an optional storage object (localStorage or a test double).
// Stored: local_user_id, followed events, reminder settings, notifications. Never stored: date of birth, name, e-mail.
import { alertRule, dueOccurrences, dedupKey, daysBetween, addDays, OFFSETS, POLICY } from './calendar.js';

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'mumu.notify.v1';

const uuid = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : 'u' + Math.random().toString(36).slice(2) + Date.now().toString(36));

function blank() { return { schema_version: SCHEMA_VERSION, local_user_id: uuid(), follows: {}, notifications: [] }; }

export function createStore({ storage = null, key = STORAGE_KEY, demo = false } = {}) {
  let st = blank();
  if (storage) {
    try {
      const raw = JSON.parse(storage.getItem(key) || 'null');
      if (raw && raw.schema_version === SCHEMA_VERSION && raw.local_user_id && raw.follows && Array.isArray(raw.notifications)) st = raw;
    } catch { /* unreadable or blocked storage: start empty */ }
  }
  const save = () => { if (storage) { try { storage.setItem(key, JSON.stringify(st)); } catch { /* quota or private mode: keep working in memory */ } } };
  const listeners = new Set();
  const changed = () => { save(); listeners.forEach((fn) => fn()); };

  const api = {
    demo,
    get state() { return st; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    userId: () => st.local_user_id,

    isFollowed: (id) => !!(st.follows[id] && st.follows[id].follow_status === 'FOLLOWING'),
    follows: () => Object.values(st.follows).filter((f) => f.follow_status === 'FOLLOWING'),

    /** snap: {event_id, name, place_id, place_name, deity_name, date_text, schedule, calendar_date, event_schedule, origin, wish_ids, notify_days_before?} */
    follow(snap, today, { reminder = false, offset } = {}) {
      const off = OFFSETS.includes(offset) ? offset : OFFSETS.includes(snap.notify_days_before) ? snap.notify_days_before : 1;
      st.follows[snap.event_id] = { ...snap, follow_status: 'FOLLOWING', reminder_enabled: !!reminder, notify_days_before: off, followed_on: today };
      changed();
    },
    unfollow(id) {
      if (st.follows[id]) st.follows[id] = { ...st.follows[id], follow_status: 'UNFOLLOWED', reminder_enabled: false };
      st.notifications = st.notifications.filter((n) => n.event_id !== id);
      changed();
    },
    setReminder(id, on, offset, today) {
      const f = st.follows[id];
      if (!f || f.follow_status !== 'FOLLOWING') return;
      if (OFFSETS.includes(offset)) f.notify_days_before = offset;
      if (on && !f.reminder_enabled && today) f.followed_on = today;   // switching a reminder on starts from today: no retro alerts
      f.reminder_enabled = !!on;
      changed();
    },

    /** Check-on-open. Creates a notification for every occurrence that is due and not yet alerted. Returns the new ones. */
    runCheck(today, { policy = POLICY.INFO_ONLY } = {}) {
      const created = [];
      for (const f of api.follows()) {
        if (!f.reminder_enabled) continue;
        const rule = alertRule(f, { policy, demo });
        if (!rule.ok) continue;
        for (const o of dueOccurrences(f.schedule, today, f.notify_days_before, f.followed_on)) {
          const id = dedupKey(st.local_user_id, f.event_id, o.start, f.notify_days_before);
          if (st.notifications.some((n) => n.id === id)) continue;     // dedup: same user + event + occurrence + offset
          const n = { id, event_id: f.event_id, occurrence_start: o.start, occurrence_end: o.end, offset: f.notify_days_before, due_on: o.due_on,
            created_on: today, read_status: 'UNREAD', label: rule.label, origin: f.origin };
          st.notifications.push(n); created.push(n);
        }
      }
      if (created.length) changed();
      return created;
    },

    /** Notifications that are still relevant on `today` (an unread alert for an event that already finished is EXPIRED). */
    list(today) {
      return st.notifications.map((n) => ({ ...n, expired: daysBetween(n.occurrence_end, today) > 0 }))
        .sort((a, b) => (a.occurrence_start < b.occurrence_start ? -1 : a.occurrence_start > b.occurrence_start ? 1 : a.event_id < b.event_id ? -1 : 1));
    },
    unread(today) { return api.list(today).filter((n) => n.read_status === 'UNREAD' && !n.expired); },
    markRead(id) { const n = st.notifications.find((x) => x.id === id); if (n && n.read_status !== 'READ') { n.read_status = 'READ'; changed(); } },
    markAllRead() { st.notifications.forEach((n) => { n.read_status = 'READ'; }); changed(); },

    /** Four-dimension status contract: user state, time state, notice state (+ why an alert is blocked). */
    status(id, today, { policy = POLICY.INFO_ONLY } = {}) {
      const f = st.follows[id];
      if (!f || f.follow_status !== 'FOLLOWING') return { user: 'NOT_FOLLOWED', time: null, notice: null };
      if (!f.reminder_enabled) return { user: 'FOLLOWED_REMINDER_OFF', time: null, notice: null };
      const rule = alertRule(f, { policy, demo });
      if (!rule.ok) return { user: 'BLOCKED_UNVERIFIED', time: null, notice: null, why: rule.why };
      const mine = api.list(today).filter((n) => n.event_id === id);
      const latest = mine[mine.length - 1];
      if (latest) {
        if (latest.expired) return { user: 'FOLLOWED_REMINDER_ON', time: 'EXPIRED', notice: latest.read_status === 'READ' ? 'READ' : 'ALREADY_NOTIFIED' };
        return { user: 'FOLLOWED_REMINDER_ON', time: 'DUE', notice: latest.read_status === 'READ' ? 'READ' : 'ALREADY_NOTIFIED' };
      }
      return { user: 'FOLLOWED_REMINDER_ON', time: dueOccurrences(f.schedule, today, f.notify_days_before, f.followed_on).length ? 'DUE' : 'NOT_DUE', notice: null };
    },

    clear() { st = blank(); if (storage) { try { storage.removeItem(key); } catch { /* ignore */ } } listeners.forEach((fn) => fn()); },
  };
  return api;
}

export { addDays };
