// Shared in-memory session state for Tab 1 and Tab 2. Nothing here is written to storage:
// the birth date lives only in this page's memory and disappears on reload.
import { API } from './api.js';

export const S = {
  step: 1, maxStep: 1,
  era: 'BE', d: '', m: '', y: '',
  wishes: [], groups: new Set(), deities: new Set(), places: new Set(),
  focus: 'ALL',                       // UI presentation state only (never sent to the model)
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

/** The model's data contract: wish_ids, birthdate, exclusions. Nothing else goes to the engine. */
export function profile() {
  return {
    wish_ids: [...S.wishes], birthdate: birthdateISO() || null,
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
