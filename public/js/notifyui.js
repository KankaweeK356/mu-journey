// Tab 1 notification UI (normal user mode only): header bell, bottom bar, notification centre, event cards, "ปฏิทินมูของฉัน".
// Logic lives in calendar.js / reminder.js / notify.js (tested in Node). This file only draws and wires.
// Tab 1 uses the REAL store only: synthetic concert/exam data is never loaded here and cannot raise a reminder (REMINDER_POLICY_V3).
import { h, clear } from './util.js';
import { S, store, todayISO, nowMinute, catalogNames, emit, subscribe, realUserStore } from './state.js';
import { classify } from './calendar.js';
import { reminderBlock } from './notify.js';
import { reminderText, dateBkk, fmtBkk, CODES } from './reminder.js';

const SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const thaiDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${SHORT[m - 1]} ${y + 543}`; };
export const thaiRange = (a, b) => (a === b ? thaiDate(a) : `${thaiDate(a)} – ${thaiDate(b)}`);
export const thaiMinute = (min) => `${thaiDate(dateBkk(min))} ${fmtBkk(min).slice(11)} น.`;
/** The day a reminder falls due (Bangkok). A day already behind us is said so instead of looking like a future alert. */
export const remindDateText = (target, offset, now) => (dateBkk(target - offset) < dateBkk(now) ? `ครบกำหนดแล้วเมื่อ ${thaiDate(dateBkk(target - offset))}` : `เตือนวันที่ ${thaiDate(dateBkk(target - offset))}`);
export const offsetLabel = (o) => (o === 0 ? 'ตอนเริ่ม' : o % 1440 === 0 ? `${o / 1440} วัน` : o % 60 === 0 ? `${o / 60} ชั่วโมง` : `${o} นาที`);

const hooks = { continueWith: () => {}, showBar: () => S.step >= 4 };
export const setHooks = (x) => Object.assign(hooks, x);

const UNCONFIRMED = 'กำหนดการยังไม่ยืนยัน';
const BASIS = { RULE: 'วันที่คำนวณจากกฎปฏิทิน', HKO_TABLE: 'วันที่คำนวณจากตารางปฏิทินจีนของหอดูดาวฮ่องกง (HKO)', TYPED_IN_SHEET: 'วันที่จากตารางข้อมูลของโครงการ (ยังไม่ได้ตรวจกับแหล่งอื่น)' };
const BLOCK_TEXT = { DATE_UNVERIFIED: 'วันที่ยังไม่ได้ตรวจกับแหล่งอื่น', BLOCKED_UNVERIFIED: UNCONFIRMED, BLOCKED_SYNTHETIC: 'เป็นข้อมูลสมมติ' };

/* ------------------------------------------------------------------ parents built from what the pages show */
export const snapNetwork = (r) => ({ event_id: r.event_id, name: r.event_name, origin: 'NETWORK', place_id: r.place_id, place_name: r.place_name, deity_name: r.deity_name,
  date_text: r.date_text, schedule: r.schedule, calendar_date: r.static.calendar_date, event_schedule: r.static.event_schedule, wish_ids: r.compatible_wish_ids });
export const parentFromNetwork = (s) => ({ parent_id: s.event_id, kind: 'EVENT', name: s.name, origin: 'NETWORK', place_id: s.place_id, place_name: s.place_name, deity_name: s.deity_name, wish_ids: s.wish_ids || [],
  children: [{ source_entity_id: s.event_id, source_type: 'EVENT', label: s.name, occ: { kind: 'schedule', schedule: s.schedule }, calendar_date_status: s.calendar_date, schedule_status: s.event_schedule,
    synthetic: false, offsets_available: [1440, 10080, 20160] }] });

const kindOf = (child) => (child.source_type === 'EXAM_MILESTONE' ? child.milestone_type : child.source_type === 'FIXED_CALENDAR_DAY' ? 'FIXED_CALENDAR_DAY' : child.source_type);
const whenText = (child, min) => (child.source_type === 'EVENT' || child.source_type === 'FIXED_CALENDAR_DAY' ? thaiDate(dateBkk(min)) : thaiMinute(min));
const whyText = (f) => {
  const names = (f.wish_ids || []).map((w) => catalogNames.wish[w] || w).join(' · ');
  return f.origin === 'NETWORK' ? `${names} → ${f.deity_name} → ${f.place_name} → ${f.name}` : `วันสำคัญตามปฏิทินที่เกี่ยวกับเรื่อง ${names} (จับคู่ตรงจากเรื่องที่ขอ ไม่ผ่านเครือข่าย)`;
};
const labelChip = (f) => (f.origin === 'NETWORK' ? h('span', { class: 'chip st-cand' }, UNCONFIRMED) : h('span', { class: 'chip ok' }, 'วันที่ตรวจตามปฏิทินแล้ว'));

function check() { return store().runCheck(nowMinute()); }
export function changed() { check(); emit(); refresh(); }

/** Per-child reminder consent: one checkbox per offset. Off by default. Disabled (with the reason) when the data cannot raise a reminder. */
export function offsetControls(pid, sid) {
  const st = store(), child = st.child(pid, sid);
  if (!child) return null;
  const block = reminderBlock(child, 'NORMAL');
  // Cannot remind: no checkboxes at all, only the reason (a checkbox the user cannot tick is a broken promise).
  if (block) return h('div', { class: 'small muted', 'data-no-reminder': block }, `บันทึกไว้ดูเท่านั้น ไม่มีการแจ้งเตือน เพราะ${BLOCK_TEXT[block]} จึงไม่มีวันแจ้งเตือน`);
  const now = nowMinute(), occ = (st.explain(pid, sid, now) || {}).occurrence;
  const boxes = child.offsets_available.map((o) => h('label', { class: 'row', style: 'flex-wrap:nowrap;align-items:center;gap:4px' },
    h('input', { type: 'checkbox', checked: child.offsets_enabled.includes(o), onchange: (e) => {
      const next = e.target.checked ? [...child.offsets_enabled, o] : child.offsets_enabled.filter((x) => x !== o);
      st.setOffsets(pid, sid, next, nowMinute()); changed(); } }), h('span', {}, `ก่อน ${offsetLabel(o)}`, occ ? h('span', { class: 'faint', 'data-remind-date': dateBkk(occ.target_min - o) }, ` · ${remindDateText(occ.target_min, o, now)}`) : null)));
  return h('div', { class: 'stack small', style: 'gap:4px' }, h('div', { class: 'row' }, h('span', {}, 'เตือนล่วงหน้า:'), ...boxes),
    h('div', { class: 'faint' }, occ ? 'ระบบตรวจการเตือนตอนเปิดหน้าเว็บนี้เท่านั้น ถ้าไม่ได้เปิดในวันนั้นจะเห็นเมื่อเปิดครั้งถัดไปก่อนหมดช่วงวันกิจกรรม' : 'ยังคำนวณวันแจ้งเตือนไม่ได้ เพราะไม่มีรอบวันที่ที่กำลังจะมาถึง'));
}

/** Words follow what the app can really do: "ติดตาม" only where a reminder can be raised, otherwise "บันทึกไว้". */
export const canRemindNetwork = (snap) => !reminderBlock(parentFromNetwork(snap).children[0], 'NORMAL');

/* ------------------------------------------------------------------ event card (step 05) */
export function eventCard(snap, { evidence = null } = {}) {
  const st = store(), today = todayISO(), c = classify(snap.schedule, today), followed = st.isFollowed(snap.event_id), remind = canRemindNetwork(snap);
  const when = c.display_status === 'ONGOING' ? `กำลังจัดอยู่ (ถึง ${thaiDate(c.next_end)})`
    : c.display_status === 'UPCOMING' ? `${thaiRange(c.next_start, c.next_end)} · อีก ${c.days_until} วัน` : 'ไม่มีรอบที่กำลังจะมาถึง';
  return h('div', { class: 'card flat stack ev-card' },
    h('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-start;flex-wrap:nowrap' }, h('div', { style: 'min-width:0' }, h('b', {}, snap.name), h('div', { class: 'small muted' }, `${snap.deity_name} · ${snap.place_name}`)),
      h('button', { type: 'button', class: 'btn sm' + (followed ? ' primary' : ''), 'aria-pressed': String(followed),
        onclick: () => { followed ? st.unfollow(snap.event_id) : st.follow(parentFromNetwork(snap), nowMinute()); changed(); } }, remind ? (followed ? '✓ ติดตามอยู่' : '＋ ติดตาม') : (followed ? '✓ บันทึกไว้แล้ว' : '＋ บันทึกไว้'))),
    h('div', { class: 'small' }, '📅 ', when), h('div', { class: 'row' }, h('span', { class: 'chip st-cand' }, UNCONFIRMED), snap.schedule.calendar_basis ? h('span', { class: 'small faint' }, BASIS[snap.schedule.calendar_basis]) : null),
    evidence ? h('div', { class: 'path' }, evidence) : null, followed ? offsetControls(snap.event_id, snap.event_id) : null);
}

/* ------------------------------------------------------------------ notification centre */
const dlg = h('dialog', { class: 'nc', 'aria-label': 'การแจ้งเตือน' });
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
document.body.append(dlg);

function noteCard(n) {
  const st = store(), f = st.state.follows[n.parent_id], child = f && f.children[n.source_entity_id];
  if (!child) return null;
  const now = nowMinute();
  return h('div', { class: 'card flat stack nc-item' + (n.read_status === 'READ' || n.expired ? ' read' : '') },
    h('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-start' }, h('b', { style: 'flex:1 1 150px;min-width:0' }, '🔔 ' + f.name), n.read_status === 'UNREAD' && !n.expired ? h('span', { class: 'chip pink' }, 'ใหม่') : n.expired ? h('span', { class: 'chip' }, 'หมดเวลาแล้ว') : h('span', { class: 'chip' }, 'อ่านแล้ว')),
    h('div', { class: 'small' }, reminderText(kindOf(child), { target_min: n.occurrence_min }, n.offset, now)),
    h('div', { class: 'small' }, `📅 ${whenText(child, n.occurrence_min)}`),
    f.place_name ? h('div', { class: 'small' }, '📍 ' + f.place_name) : null,
    h('div', { class: 'small muted' }, 'ทำไมแนะนำ: ', h('span', { class: 'path', style: 'display:inline-block' }, whyText(f))),
    f.disclaimer ? h('div', { class: 'small faint' }, f.disclaimer) : null,
    h('div', { class: 'row' }, labelChip(f)),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn primary sm', disabled: n.expired, onclick: () => { st.markRead(n.id); dlg.close(); hooks.continueWith(f); } }, 'มูเรื่องนี้ต่อ'),
      n.read_status === 'UNREAD' ? h('button', { type: 'button', class: 'btn sm', onclick: () => { st.markRead(n.id); } }, 'ทำเครื่องหมายว่าอ่านแล้ว') : null,
      h('button', { type: 'button', class: 'btn sm', onclick: () => { st.setOffsets(f.parent_id, child.source_entity_id, []); changed(); drawCenter(); } }, 'ปิดการเตือน'),
      h('button', { type: 'button', class: 'btn sm ghost', onclick: () => { st.unfollow(f.parent_id); changed(); drawCenter(); } }, 'เลิกติดตาม')));
}

function drawCenter() {
  const st = store(), now = nowMinute();
  const list = st.list(now).sort((a, b) => (a.read_status === b.read_status ? 0 : a.read_status === 'UNREAD' ? -1 : 1)).map(noteCard).filter(Boolean);
  const unread = st.unread(now).length;
  clear(dlg).append(h('div', { class: 'dlg-h' }, h('h3', {}, 'การแจ้งเตือน'), h('button', { type: 'button', class: 'btn sm', 'aria-label': 'ปิด', onclick: () => dlg.close() }, '✕')),
    h('div', { class: 'dlg-b stack' },
      list.length ? [unread ? h('div', { class: 'row', style: 'justify-content:flex-end' }, h('button', { type: 'button', class: 'btn sm', onclick: () => st.markAllRead() }, 'อ่านทั้งหมดแล้ว')) : null, ...list]
        : h('div', { class: 'callout info' }, h('b', {}, 'ยังไม่มีแจ้งเตือน'), h('p', { class: 'small', style: 'margin:.3em 0 0' },
          'ศูนย์นี้แสดงเฉพาะการเตือนที่ผ่านเงื่อนไข ติดตามวันสำคัญ เช่น วาเลนไทน์ แล้วเลือกเวลาเตือนล่วงหน้า ระบบจะตรวจตอนเปิดหน้าเว็บ กิจกรรมของสถานที่ที่ยังไม่ยืนยันกำหนดการกับผู้จัด จะบันทึกไว้ดูได้แต่ไม่แจ้งเตือน (ไม่มีการส่งข้อความนอกหน้านี้)')),
      h('div', { class: 'callout warn small' }, UNCONFIRMED + ': ข้อมูลวันจัดกิจกรรมของสถานที่จริงยังไม่ได้ยืนยันกับผู้จัด ควรตรวจก่อนเดินทาง')));
}
export function openCenter() { drawCenter(); if (!dlg.open) dlg.showModal(); }
realUserStore.subscribe(() => { if (dlg.open) drawCenter(); refresh(); });

/* ------------------------------------------------------------------ "ปฏิทินมูของฉัน" (step 07) */
export function calendarCard() {
  const st = store(), now = nowMinute();
  const item = (f) => {
    const child = Object.values(f.children)[0], ex = st.explain(f.parent_id, child.source_entity_id, now), occ = ex && ex.occurrence;
    const block = reminderBlock(child, 'NORMAL'), on = child.offsets_enabled.length;
    return h('div', { class: 'path stack', style: 'gap:6px' }, h('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-start' }, h('b', { style: 'flex:1 1 150px;min-width:0' }, f.name),
      h('span', { class: 'chip ' + (on ? 'ok' : block ? 'st-cand' : '') }, on ? `เปิดเตือน ${on} ช่วง` : block ? 'บันทึกไว้ · ' + BLOCK_TEXT[block] : 'ติดตาม · ปิดเตือน')),
      h('div', { class: 'small muted' }, occ ? `📅 ${whenText(child, occ.target_min)}` : 'ไม่มีรอบที่กำลังจะมาถึง', f.place_name ? ` · 📍 ${f.place_name}` : ''),
      h('div', { class: 'row small' }, labelChip(f), h('button', { type: 'button', class: 'btn sm ghost', onclick: () => { st.unfollow(f.parent_id); changed(); } }, block ? 'เลิกบันทึก' : 'เลิกติดตาม')),
      offsetControls(f.parent_id, child.source_entity_id));
  };
  const rows = st.follows();
  return h('div', { class: 'card stack' }, h('h3', {}, '📅 ปฏิทินมูของฉัน'),
    rows.length ? rows.map(item) : h('p', { class: 'small muted', style: 'margin:0' }, 'ยังไม่ได้ติดตามหรือบันทึกอะไร กด "＋ ติดตาม" ที่วันสำคัญ หรือ "＋ บันทึกไว้" ที่กิจกรรมในขั้นที่ 4–5'),
    h('div', { class: 'small faint' }, 'ข้อมูลการติดตามเก็บในเบราว์เซอร์นี้เท่านั้น (ไม่มีวันเกิด) ลบได้ด้วยปุ่ม "ล้างข้อมูลของฉัน"'));
}

/* ------------------------------------------------------------------ header bell and bottom bar */
const badge = h('span', { class: 'badge', hidden: true });
const bell = h('button', { type: 'button', class: 'hbtn', 'aria-label': 'การแจ้งเตือน', title: 'การแจ้งเตือน', onclick: openCenter }, '🔔', badge);
const bar = h('div', { class: 'nbar', role: 'status', hidden: true });
let barTimer = null, barSeen = '';

export function refresh() {
  const st = store(), unread = st.unread(nowMinute());
  badge.hidden = !unread.length; badge.textContent = String(unread.length);
  bell.setAttribute('aria-label', unread.length ? `การแจ้งเตือน ${unread.length} รายการ` : 'การแจ้งเตือน');
  const sig = unread.map((n) => n.id).join(',');
  const visible = unread.length && hooks.showBar();
  if (!visible) { bar.hidden = true; if (!unread.length) barSeen = ''; return; }
  if (sig !== barSeen) {                                  // a new alert: show the bar, then tuck it away after about 8 seconds
    barSeen = sig; bar.hidden = false; clearTimeout(barTimer); barTimer = setTimeout(() => { bar.hidden = true; }, 8000);
  }
  clear(bar).append(h('button', { type: 'button', class: 'nbar-main', onclick: openCenter }, `🔔 มีแจ้งเตือน ${unread.length} รายการ`, h('span', { 'aria-hidden': 'true' }, ' ›')),
    h('button', { type: 'button', class: 'nbar-x', 'aria-label': 'ซ่อนแถบแจ้งเตือน', onclick: () => { bar.hidden = true; clearTimeout(barTimer); } }, '✕'));
}

/** "ล้างข้อมูลของฉัน": removes followed items, reminder choices and alerts kept in this browser. */
export function clearAllNotifyData() { realUserStore.clear(); barSeen = ''; refresh(); }

export function mountChrome() {
  const row = document.querySelector('.hdr-row');
  if (!row || bell.isConnected) return;
  row.append(h('div', { class: 'hdr-tools' }, bell));
  document.body.append(bar);
  subscribe(refresh);
  check(); refresh();                                   // check-on-open: reminders that became due while the page was closed
}

export { CODES };
