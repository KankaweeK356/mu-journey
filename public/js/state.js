// Shared in-memory session state for Tab 1 and Tab 2. Nothing here is written to storage:
// the birth date lives only in this page's memory and disappears on reload.
import { API } from './api.js';

export const S = {
  step: 1, maxStep: 1,
  era: 'BE', d: '', m: '', y: '',
  wishes: [], groups: new Set(), deities: new Set(), places: new Set(),
  focus: 'ALL',                       // UI presentation state only (never sent to the model)
  topic: null,                        // step 04 dropdown: a single wish outside the chosen ones (recomputes with that wish only)
  eventContext: null,                 // set by "มูเรื่องนี้ต่อ": the event the user continues with into step 07
  result: null, resultKey: null, status: 'idle', error: null,
  picked: new Set(), service: null,
  lab: { profile: null, source: null, trace: null, key: null },
};

const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const emit = () => listeners.forEach((fn) => fn());

/** null = no date, false = invalid / incomplete, otherwise 'YYYY-MM-DD' (Gregorian). */
export function birthdateISO() {
  const { d, m, y, era } = S;
  if (!d && !m && !y) return null;
  if (!d || !m || !y) return false;
  const yy = era === 'BE' ? Number(y) - 543 : Number(y);
  const dt = new Date(Date.UTC(yy, Number(m) - 1, Number(d)));
  if (dt.getUTCFullYear() !== yy || dt.getUTCMonth() !== Number(m) - 1 || dt.getUTCDate() !== Number(d) || dt > new Date()) return false;
  return `${yy}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Wishes the engine is asked about now: the single topic picked in step 04 when it is outside the chosen ones, else the chosen wishes. */
export const activeWishes = () => (S.topic ? [S.topic] : [...S.wishes]);

/** The model's data contract: wish_ids, birthdate, exclusions. Nothing else goes to the engine. */
export function profile() {
  return {
    wish_ids: activeWishes(), birthdate: birthdateISO() || null,
    exclusions: { tradition_groups: [...S.groups], deity_ids: [...S.deities], place_ids: [...S.places] },
  };
}
export const keyOf = (p) => JSON.stringify([p.wish_ids, p.birthdate, p.exclusions.tradition_groups, p.exclusions.deity_ids, p.exclusions.place_ids]);

/** Any change to birth date, wishes or exclusions invalidates the computed result. Focus does not. */
export function invalidate() { S.result = null; S.resultKey = null; S.status = 'idle'; S.error = null; S.picked.clear(); S.service = null; }

let ticket = 0;
export async function ensureResult(force = false) {
  const p = profile(), k = keyOf(p);
  if (!force && S.result && S.resultKey === k) return S.result;
  const mine = ++ticket;
  S.status = 'loading'; S.error = null; emit();
  try {
    const r = await API.recommend(p);
    if (mine !== ticket) return S.result;       // a newer request superseded this one
    S.result = r; S.resultKey = k; S.status = 'ready';
    S.picked = new Set([...S.picked].filter((id) => r.top5.some((x) => x.place_id === id)));
  } catch (e) {
    if (mine !== ticket) return S.result;
    S.result = null; S.resultKey = null; S.status = 'error'; S.error = e.message || 'เกิดข้อผิดพลาด';
  }
  emit();
  return S.result;
}

export const hasProfile = () => S.wishes.length > 0;

/* ------------------------------------------------------------------ calendar, follows and reminders (Tab 1: the real store only) */
import { createStore, STORAGE_KEY } from './notify.js';
import { bangkokToday } from './calendar.js';
import { nowMin } from './reminder.js';

function safeLocalStorage() {
  try { const s = window.localStorage; s.setItem('__t', '1'); s.removeItem('__t'); return s; } catch { return null; }   // private mode / blocked
}
// Normal user mode: never a simulation store, never a virtual clock. Synthetic data cannot raise a reminder here (see reminder.js).
const realStore = createStore({ storage: safeLocalStorage(), key: STORAGE_KEY, demo: false });
export const store = () => realStore;
export const realUserStore = realStore;
export const todayISO = () => bangkokToday();
export const nowMinute = () => nowMin();
export const catalogNames = { wish: {} };                                        // filled by demo.js after the catalog loads
