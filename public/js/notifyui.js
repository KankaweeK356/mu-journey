// Tab 1 notification UI (normal user mode only): header bell, notification centre, event cards, "ปฏิทินมูของฉัน".
// Proactive bell (2026-11-25): related upcoming items appear by themselves; there is nothing to tick and nothing is pushed or popped up.
// What the bell lists is decided in inbox.js (tested in Node). This file only draws and wires.
// Tab 1 uses the REAL store only, and only to keep what the user saved: synthetic concert/exam data is never loaded here.
import { h, clear, getJSON } from './util.js';
import { S, store, todayISO, nowMinute, catalogNames, emit, subscribe, realUserStore, activeWishes } from './state.js';
import { classify } from './calendar.js';
import { buildInbox, unseenItems, seenKey, WINDOW_DAYS, MAX_ITEMS, NEAR_DAYS } from './inbox.js';

const SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const thaiDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${SHORT[m - 1]} ${y + 543}`; };
export const thaiRange = (a, b) => (a === b ? thaiDate(a) : `${thaiDate(a)} – ${thaiDate(b)}`);

const hooks = { continueWith: () => {} };
export const setHooks = (x) => Object.assign(hooks, x);

const UNCONFIRMED = 'กำหนดการยังไม่ยืนยัน';
const BASIS = { RULE: 'วันที่คำนวณจากกฎปฏิทิน', HKO_TABLE: 'วันที่คำนวณจากตารางปฏิทินจีนของหอดูดาวฮ่องกง (HKO)', TYPED_IN_SHEET: 'วันที่จากตารางข้อมูลของโครงการ (ยังไม่ได้ตรวจกับแหล่งอื่น)' };

/* ------------------------------------------------------------------ parents built from what the pages show */
export const snapNetwork = (r) => ({ event_id: r.event_id, name: r.event_name, origin: 'NETWORK', place_id: r.place_id, place_name: r.place_name, deity_name: r.deity_name,
  date_text: r.date_text, schedule: r.schedule, calendar_date: r.static.calendar_date, event_schedule: r.static.event_schedule, wish_ids: r.compatible_wish_ids });
export const parentFromNetwork = (s) => ({ parent_id: s.event_id, kind: 'EVENT', name: s.name, origin: 'NETWORK', place_id: s.place_id, place_name: s.place_name, deity_name: s.deity_name, wish_ids: s.wish_ids || [],
  children: [{ source_entity_id: s.event_id, source_type: 'EVENT', label: s.name, occ: { kind: 'schedule', schedule: s.schedule }, calendar_date_status: s.calendar_date, schedule_status: s.event_schedule,
    synthetic: false, offsets_available: [1440, 10080, 20160] }] });

const whyText = (f) => {
  const names = (f.wish_ids || []).map((w) => catalogNames.wish[w] || w).join(' · ');
  return f.origin === 'NETWORK' ? `${names} → ${f.deity_name} → ${f.place_name} → ${f.name}` : `วันสำคัญตามปฏิทินที่เกี่ยวกับเรื่อง ${names} (จับคู่ตรงจากเรื่องที่ขอ ไม่ผ่านเครือข่าย)`;
};
const labelChip = (f) => (f.origin === 'NETWORK' ? h('span', { class: 'chip st-cand' }, UNCONFIRMED) : h('span', { class: 'chip ok' }, 'วันที่ตรวจตามปฏิทินแล้ว'));

export function changed() { emit(); refresh(); }
/** Keeps or removes one item in this browser. Saving never switches a reminder on. */
export function toggleSaved(parent) {
  const st = store();
  st.isFollowed(parent.parent_id) ? st.unfollow(parent.parent_id) : st.follow(parent, nowMinute());
  changed();
}
export const saveButton = (parent) => {
  const saved = store().isFollowed(parent.parent_id);
  return h('button', { type: 'button', class: 'btn sm' + (saved ? ' primary' : ''), 'aria-pressed': String(saved), 'data-save': parent.parent_id, onclick: () => toggleSaved(parent) }, saved ? '✓ บันทึกไว้แล้ว' : '＋ บันทึกไว้');
};

/* ------------------------------------------------------------------ event card (step 05) */
export function eventCard(snap, { evidence = null } = {}) {
  const today = todayISO(), c = classify(snap.schedule, today);
  const when = c.display_status === 'ONGOING' ? `กำลังจัดอยู่ (ถึง ${thaiDate(c.next_end)})`
    : c.display_status === 'UPCOMING' ? `${thaiRange(c.next_start, c.next_end)} · อีก ${c.days_until} วัน` : 'ไม่มีรอบที่กำลังจะมาถึง';
  return h('div', { class: 'card flat stack ev-card' },
    h('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-start;flex-wrap:nowrap' }, h('div', { style: 'min-width:0' }, h('b', {}, snap.name), h('div', { class: 'small muted' }, `${snap.deity_name} · ${snap.place_name}`)),
      saveButton(parentFromNetwork(snap))),
    h('div', { class: 'small' }, '📅 ', when), h('div', { class: 'row' }, h('span', { class: 'chip st-cand' }, UNCONFIRMED), snap.schedule.calendar_basis ? h('span', { class: 'small faint' }, BASIS[snap.schedule.calendar_basis]) : null),
    evidence ? h('div', { class: 'path' }, evidence) : null,
    h('div', { class: 'small faint' }, 'ไม่มีวันเตือนล่วงหน้า เพราะกำหนดการยังไม่ยืนยันกับผู้จัด'));
}

/* ------------------------------------------------------------------ the bell: what it lists */
const seen = new Set(), dismissed = new Set();      // this page only: nothing new is stored about the user
let fixedDays = null;
const fixedParent = (d) => ({ parent_id: d.calendar_item_id, kind: 'FIXED', name: d.event_name, origin: 'FIXED', wish_ids: [d.wish_id], disclaimer: d.disclaimer || '',
  children: [{ source_entity_id: d.calendar_item_id, source_type: 'FIXED_CALENDAR_DAY', label: d.event_name, occ: { kind: 'yearly', month_day: d.month_day },
    calendar_date_status: d.calendar_date_status, schedule_status: d.event_schedule_status, synthetic: false, offsets_available: [...d.reminder_offsets_minutes], matching_method: d.matching_method }] });
export function inboxItems() {
  const related = !!S.result;                     // related items need the computed result, which already respects the exclusions
  return buildInbox({ fixedDays: related ? fixedDays || [] : [], eligible: related && S.result.events ? S.result.events.eligible : [], saved: store().follows(),
    wishes: related ? activeWishes() : [], today: todayISO(), dismissed });
}
/** The object "มูเรื่องนี้ต่อ" and the save button work with. A saved item keeps what was saved. */
const parentOf = (item) => item.savedParent || (item.fixed ? fixedParent(item.fixed) : parentFromNetwork(snapNetwork(item.row)));

/* ------------------------------------------------------------------ notification centre */
const dlg = h('dialog', { class: 'nc', 'aria-label': 'การแจ้งเตือน' });
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
document.body.append(dlg);

function itemCard(item, fresh) {
  const f = parentOf(item), left = item.ongoing ? 'กำลังอยู่ในช่วง' : item.days === 0 ? 'วันนี้' : `อีก ${item.days} วัน`;
  return h('div', { class: 'card flat stack nc-item', 'data-inbox-item': item.id, 'data-group': item.group },
    h('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-start;flex-wrap:nowrap' }, h('b', { style: 'flex:1 1 150px;min-width:0' }, item.name),
      h('button', { type: 'button', class: 'btn sm ghost', 'aria-label': 'ปิดรายการ ' + item.name, title: 'ปิดรายการนี้', 'data-dismiss': item.id, onclick: () => { dismissed.add(item.id); drawCenter(); refresh(); } }, '✕')),
    h('div', { class: 'row' }, item.near ? h('span', { class: 'chip gold', 'data-near': 'true' }, 'ใกล้ถึง') : null, fresh ? h('span', { class: 'chip pink' }, 'ใหม่') : null, item.saved ? h('span', { class: 'chip' }, 'บันทึกไว้') : null, labelChip(f)),
    h('div', { class: 'small' }, `📅 ${thaiRange(item.start, item.end)} · ${left}`),
    f.place_name ? h('div', { class: 'small' }, '📍 ' + f.place_name) : null,
    h('div', { class: 'small muted' }, 'เกี่ยวข้องเพราะ: ', h('span', { class: 'path', style: 'display:inline-block' }, whyText(f))),
    item.group === 'DAY'
      ? h('div', { class: 'small faint', 'data-remind-date': item.nearFrom }, item.near ? `อยู่ในช่วง ${NEAR_DAYS} วันก่อนถึงวัน` : `จะติดป้าย "ใกล้ถึง" ตั้งแต่ ${thaiDate(item.nearFrom)} (เห็นเมื่อเปิดเว็บ)`)
      : h('div', { class: 'small faint', 'data-no-reminder': 'BLOCKED_UNVERIFIED' }, 'ไม่มีวันเตือนล่วงหน้า เพราะกำหนดการยังไม่ยืนยันกับผู้จัด'),
    f.disclaimer ? h('div', { class: 'small faint' }, f.disclaimer) : null,
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary sm', onclick: () => { dlg.close(); hooks.continueWith(f); } }, 'มูเรื่องนี้ต่อ'), saveButton(f)));
}

let freshNow = new Set();                          // items that were new when the centre was opened keep their "ใหม่" mark while it is open
function drawCenter() {
  const items = inboxItems();
  items.forEach((x) => seen.add(seenKey(x)));
  const group = (key, title) => { const list = items.filter((x) => x.group === key); return list.length ? h('div', { class: 'stack', 'data-inbox-group': key }, h('h4', {}, title), list.map((x) => itemCard(x, freshNow.has(x.id)))) : null; };
  clear(dlg).append(h('div', { class: 'dlg-h' }, h('h3', {}, 'การแจ้งเตือน'), h('button', { type: 'button', class: 'btn sm', 'aria-label': 'ปิด', onclick: () => dlg.close() }, '✕')));
  const body = h('div', { class: 'dlg-b stack' });
  if (items.length) body.append(...[group('DAY', 'วันสำคัญ'), group('EVENT', `กิจกรรมที่อาจเกี่ยวข้อง (${UNCONFIRMED})`)].filter(Boolean));
  else body.append(h('div', { class: 'callout info' }, h('b', {}, 'ยังไม่มีรายการที่เกี่ยวข้อง'), h('p', { class: 'small', style: 'margin:.3em 0 0' },
    S.result ? `ไม่พบวันสำคัญหรือกิจกรรมที่เกี่ยวกับความสนใจที่เลือกภายใน ${WINDOW_DAYS} วัน` : 'เลือกความสนใจแล้วไปถึงขั้น 04 รายการที่เกี่ยวข้องจะขึ้นที่นี่เอง')));
  body.append(h('div', { class: 'callout warn small' }, `แสดงรายการภายใน ${WINDOW_DAYS} วัน ไม่เกิน ${MAX_ITEMS} รายการ ตรวจตอนเปิดหน้าเว็บนี้เท่านั้น ไม่มีการส่งข้อความนอกหน้านี้ · ${UNCONFIRMED}: ควรตรวจกับผู้จัดก่อนเดินทาง`));
  dlg.append(body);
  refresh();
}
export function openCenter() { freshNow = new Set(unseenItems(inboxItems(), seen).map((x) => x.id)); drawCenter(); if (!dlg.open) dlg.showModal(); }
let drawing = false;
realUserStore.subscribe(() => { if (dlg.open && !drawing) { drawing = true; drawCenter(); drawing = false; } refresh(); });

/* ------------------------------------------------------------------ "ปฏิทินมูของฉัน" (step 07): what the user saved, no reminder settings */
export function calendarCard() {
  const today = todayISO();
  const item = (f) => {
    const child = Object.values(f.children)[0];
    const next = child.occ.kind === 'schedule' ? classify(child.occ.schedule, today).next_start : [Number(today.slice(0, 4)), Number(today.slice(0, 4)) + 1].map((y) => `${y}-${child.occ.month_day}`).find((d) => d >= today);
    return h('div', { class: 'path stack', style: 'gap:6px' }, h('b', {}, f.name),
      h('div', { class: 'small muted' }, next ? `📅 ${thaiDate(next)}` : 'ไม่มีรอบที่กำลังจะมาถึง', f.place_name ? ` · 📍 ${f.place_name}` : ''),
      h('div', { class: 'row small' }, labelChip(f), h('button', { type: 'button', class: 'btn sm ghost', onclick: () => { store().unfollow(f.parent_id); changed(); } }, 'เลิกบันทึก')));
  };
  const rows = store().follows();
  return h('div', { class: 'card stack' }, h('h3', {}, '📅 ปฏิทินมูของฉัน'),
    rows.length ? rows.map(item) : h('p', { class: 'small muted', style: 'margin:0' }, 'ยังไม่ได้บันทึกอะไร กด "＋ บันทึกไว้" ที่วันสำคัญ กิจกรรม หรือรายการในกระดิ่ง'),
    h('div', { class: 'small faint' }, 'รายการที่บันทึกเก็บในเบราว์เซอร์นี้เท่านั้น (ไม่มีวันเกิด) ลบได้ด้วยปุ่ม "ล้างข้อมูลของฉัน"'));
}

/* ------------------------------------------------------------------ header bell */
const badge = h('span', { class: 'badge', hidden: true });
const bell = h('button', { type: 'button', class: 'hbtn', 'aria-label': 'การแจ้งเตือน', title: 'การแจ้งเตือน', onclick: openCenter }, '🔔', badge);

export function refresh() {
  const n = unseenItems(inboxItems(), seen).length;
  badge.hidden = !n; badge.textContent = String(n);
  bell.setAttribute('aria-label', n ? `การแจ้งเตือน มีรายการใหม่ ${n} รายการ` : 'การแจ้งเตือน');
}

/** "ล้างข้อมูลของฉัน": removes saved items kept in this browser and what this page remembers about the bell. */
export function clearAllNotifyData() { seen.clear(); dismissed.clear(); realUserStore.clear(); refresh(); }

export function mountChrome() {
  const row = document.querySelector('.hdr-row');
  if (!row || bell.isConnected) return;
  row.append(h('div', { class: 'hdr-tools' }, bell));
  subscribe(refresh);
  getJSON('/data/calendar_fixed.json').then((d) => { fixedDays = d.fixed_days || []; refresh(); }).catch(() => { fixedDays = []; });
  refresh();
}
