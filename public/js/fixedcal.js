// Step 04 · Direct Calendar Matching for REAL calendar facts (CL_FIXED_CALENDAR_DAYS, e.g. Valentine).
// Separate from the network-based event cards: matched by the user's wish (W01), not through the network, no PPR score, no place path.
// It says only what the data says: the date is a calendar fact. It never claims a special event at any place.
import { h, getJSON } from './util.js';
import { store, nowMinute } from './state.js';
import { parseBkk, dateBkk } from './reminder.js';
import { thaiDate, offsetControls, changed } from './notifyui.js';

let cache = null, loading = false;
const dismissed = new Set();
export const resetFixedDismissed = () => dismissed.clear();

export const parentFromFixed = (day) => ({ parent_id: day.calendar_item_id, kind: 'FIXED', name: day.event_name, origin: 'FIXED', wish_ids: [day.wish_id], disclaimer: day.disclaimer || '',
  children: [{ source_entity_id: day.calendar_item_id, source_type: 'FIXED_CALENDAR_DAY', label: day.event_name, occ: { kind: 'yearly', month_day: day.month_day },
    calendar_date_status: day.calendar_date_status, schedule_status: day.event_schedule_status, synthetic: false, offsets_available: [...day.reminder_offsets_minutes], matching_method: day.matching_method }] });

/** The next occurrence that is still "today or later" in Bangkok (an all-day occasion counts until 00:00 of the next day). */
export function nextOccurrence(day, now) {
  const y = Number(dateBkk(now).slice(0, 4));
  for (const yy of [y, y + 1, y + 2]) { const t = parseBkk(`${yy}-${day.month_day}`); if (t != null && t + 1440 > now) return t; }
  return null;
}

/** Returns a DOM node or null (null while loading, when nothing matches the user's wishes, or when the user dismissed the card). */
export function fixedCalendarSection({ wishes, focus = 'ALL', redraw }) {
  if (!cache) {
    if (!loading) { loading = true; getJSON('/data/calendar_fixed.json').then((d) => { cache = d; redraw(); }).catch(() => { cache = { fixed_days: [] }; }); }
    return null;
  }
  const now = nowMinute(), st = store();
  const days = (cache.fixed_days || []).filter((d) => d.visibility_scope === 'NORMAL_CALENDAR' && d.data_origin !== 'SYNTHETIC_DEMO' && wishes.includes(d.wish_id)
    && (focus === 'ALL' || focus === d.wish_id) && !dismissed.has(d.calendar_item_id));
  if (!days.length) return null;
  const card = (day) => {
    const t = nextOccurrence(day, now), left = t == null ? null : Math.floor((t - now) / 1440), followed = st.isFollowed(day.calendar_item_id);
    const when = t == null ? '' : dateBkk(now) === dateBkk(t) ? 'วันนี้' : `อีก ${Math.max(1, Math.ceil((t - now) / 1440))} วัน`;
    return h('div', { class: 'card flat stack fixed-card' },
      h('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-start;flex-wrap:nowrap' },
        h('div', { style: 'min-width:0' }, h('div', {}, h('b', {}, day.event_name)), h('div', { class: 'small muted' }, `วันสำคัญตามปฏิทิน · ${thaiDate(dateBkk(t))}${when ? ' · ' + when : ''}`)),
        h('div', { class: 'row', style: 'flex-wrap:nowrap' },
          h('button', { type: 'button', class: 'btn sm' + (followed ? ' primary' : ''), 'aria-pressed': String(followed), onclick: () => { followed ? st.unfollow(day.calendar_item_id) : st.follow(parentFromFixed(day), nowMinute()); changed(); redraw(); } }, followed ? '✓ ติดตามอยู่' : '＋ ติดตาม'),
          h('button', { type: 'button', class: 'btn sm ghost', 'aria-label': 'ปิดการ์ดนี้', title: 'ปิดการ์ดนี้', onclick: () => { dismissed.add(day.calendar_item_id); redraw(); } }, '✕'))),
      h('div', { class: 'row' }, h('span', { class: 'chip ok' }, 'วันที่ตรวจตามปฏิทินแล้ว'), h('span', { class: 'small faint' }, 'จับคู่ตรงจากเรื่องที่คุณเลือก ไม่ผ่านเครือข่าย')),
      day.disclaimer ? h('div', { class: 'small faint' }, day.disclaimer) : null,
      followed ? offsetControls(day.calendar_item_id, day.calendar_item_id) : null);
  };
  return h('div', { class: 'card stack', role: 'region', 'aria-label': 'วันสำคัญที่เกี่ยวกับความสนใจของคุณ' }, h('h3', {}, '🎀 วันสำคัญที่เกี่ยวกับความสนใจของคุณ'), ...days.map(card));
}
