// Tab 1 notification UI: header bell, bottom bar, notification popup, event cards, "ปฏิทินมูของฉัน", hidden demo clock.
// Logic lives in calendar.js / notify.js (tested in Node). This file only draws and wires.
import { h, clear, toast } from './util.js';
import { S, CLOCK, store, todayISO, catalogNames, emit, subscribe, realUserStore, demoUserStore } from './state.js';
import { classify, OFFSETS, alertRule, daysBetween, addDays, isIso, POLICY, bangkokToday } from './calendar.js';

const SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const thaiDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${SHORT[m - 1]} ${y + 543}`; };
export const thaiRange = (a, b) => (a === b ? thaiDate(a) : `${thaiDate(a)} – ${thaiDate(b)}`);

const hooks = { continueWith: () => {}, showBar: () => S.step >= 4 };
export const setHooks = (x) => Object.assign(hooks, x);

const UNCONFIRMED = 'กำหนดการยังไม่ยืนยัน';
const BASIS = { RULE: 'วันที่คำนวณจากกฎปฏิทิน', HKO_TABLE: 'วันที่คำนวณจากตารางปฏิทินจีนของหอดูดาวฮ่องกง (HKO)', TYPED_IN_SHEET: 'วันที่จากตารางข้อมูลของโครงการ (ยังไม่ได้ตรวจกับแหล่งอื่น)' };

/* ------------------------------------------------------------------ snapshots stored with a follow (no birth date, no wish names) */
export const snapNetwork = (r) => ({ event_id: r.event_id, name: r.event_name, origin: 'NETWORK', place_id: r.place_id, place_name: r.place_name, deity_name: r.deity_name,
  date_text: r.date_text, schedule: r.schedule, calendar_date: r.static.calendar_date, event_schedule: r.static.event_schedule, wish_ids: r.compatible_wish_ids, notify_days_before: 1 });
export const snapDirect = (d) => ({ event_id: d.event_id, name: d.event_name, origin: 'DIRECT', place_id: null, place_name: null, deity_name: null, date_text: d.event_date,
  schedule: { kind: 'annual', occurrences: [{ start: d.event_date, end: d.event_date }], calendar_basis: 'SYNTHETIC' }, calendar_date: d.calendar_date, event_schedule: d.event_schedule,
  wish_ids: [d.wish_id], notify_days_before: d.notify_days_before });

const whyText = (f) => {
  const names = (f.wish_ids || []).map((w) => catalogNames.wish[w] || w).join(' · ');
  return f.origin === 'NETWORK' ? `${names} → ${f.deity_name} → ${f.place_name} → ${f.name}` : `เกี่ยวข้องกับเรื่อง ${names} (จับคู่ตรงจากเรื่องที่ขอ ไม่ผ่านเครือข่าย)`;
};
const ruleOf = (f) => alertRule(f, { policy: CLOCK.policy, demo: CLOCK.demo });
const labelChips = (f) => [
  f.origin === 'DIRECT' ? h('span', { class: 'chip st-syn' }, 'ข้อมูลจำลอง') : h('span', { class: 'chip st-cand' }, UNCONFIRMED)];

function check() { return store().runCheck(todayISO(), { policy: CLOCK.policy }); }
function changed() { check(); emit(); refresh(); }

/* ------------------------------------------------------------------ event card (step 05) */
export function eventCard(snap, { evidence = null, showFollow = true } = {}) {
  const st = store(), today = todayISO(), c = classify(snap.schedule, today), followed = st.isFollowed(snap.event_id);
  const when = c.display_status === 'ONGOING' ? `กำลังจัดอยู่ (ถึง ${thaiDate(c.next_end)})`
    : c.display_status === 'UPCOMING' ? `${thaiRange(c.next_start, c.next_end)} · อีก ${c.days_until} วัน` : 'ไม่มีรอบที่กำลังจะมาถึง';
  const rule = ruleOf(snap), f = followed ? st.state.follows[snap.event_id] : null;
  const ctrl = f ? h('div', { class: 'stack small', style: 'gap:6px' },
    h('label', { class: 'row', style: 'flex-wrap:nowrap;align-items:center' }, h('input', { type: 'checkbox', checked: f.reminder_enabled, disabled: !rule.ok,
      onchange: (e) => { st.setReminder(snap.event_id, e.target.checked, f.notify_days_before, today); changed(); } }), h('span', {}, 'เตือนล่วงหน้า'),
    h('select', { 'aria-label': 'เตือนล่วงหน้ากี่วัน', disabled: !rule.ok, onchange: (e) => { st.setReminder(snap.event_id, f.reminder_enabled, Number(e.target.value), today); changed(); } },
      OFFSETS.map((o) => h('option', { value: o, selected: o === f.notify_days_before }, `${o} วัน`)))),
    !rule.ok ? h('div', { class: 'muted' }, 'ติดตามเป็นข้อมูลเท่านั้น ยังไม่แจ้งเตือน เพราะ' + (snap.origin === 'DIRECT' ? 'เป็นข้อมูลจำลอง ใช้ได้ในโหมดสาธิต' : 'กำหนดการยังไม่ยืนยัน')) : null) : null;
  return h('div', { class: 'card flat stack ev-card' },
    h('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-start;flex-wrap:nowrap' }, h('div', { style: 'min-width:0' }, h('b', {}, snap.name), h('div', { class: 'small muted' }, snap.place_name ? `${snap.deity_name} · ${snap.place_name}` : 'กิจกรรมตัวอย่าง')),
      showFollow ? h('button', { type: 'button', class: 'btn sm' + (followed ? ' primary' : ''), 'aria-pressed': String(followed),
        onclick: () => { followed ? st.unfollow(snap.event_id) : st.follow(snap, today); changed(); } }, followed ? '✓ ติดตามอยู่' : '＋ ติดตาม') : null),
    h('div', { class: 'small' }, '📅 ', when), h('div', { class: 'row' }, ...labelChips(snap), snap.schedule.calendar_basis && snap.schedule.calendar_basis !== 'SYNTHETIC' ? h('span', { class: 'small faint' }, BASIS[snap.schedule.calendar_basis]) : null),
    evidence ? h('div', { class: 'path' }, evidence) : null, ctrl);
}

/* ------------------------------------------------------------------ popup ("notification center") */
const dlg = h('dialog', { class: 'nc', 'aria-label': 'การแจ้งเตือน' });
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
document.body.append(dlg);

function noteCard(n) {
  const st = store(), f = st.state.follows[n.event_id];
  if (!f) return null;
  const today = todayISO(), left = daysBetween(today, n.occurrence_start);
  const rule = ruleOf(f);
  return h('div', { class: 'card flat stack nc-item' + (n.read_status === 'READ' || n.expired ? ' read' : '') },
    h('div', { class: 'row', style: 'justify-content:space-between;flex-wrap:nowrap' }, h('b', {}, '🔔 ' + f.name), n.read_status === 'UNREAD' && !n.expired ? h('span', { class: 'chip pink' }, 'ใหม่') : n.expired ? h('span', { class: 'chip' }, 'หมดเวลาแล้ว') : h('span', { class: 'chip' }, 'อ่านแล้ว')),
    h('div', { class: 'small' }, `📅 ${thaiRange(n.occurrence_start, n.occurrence_end)}`, left > 0 ? ` · อีก ${left} วัน` : left === 0 ? ' · วันนี้' : ''),
    f.place_name ? h('div', { class: 'small' }, '📍 ' + f.place_name) : null,
    h('div', { class: 'small muted' }, 'ทำไมแนะนำ: ', h('span', { class: 'path', style: 'display:inline-block' }, whyText(f))),
    h('div', { class: 'row' }, ...labelChips(f), n.label === 'SCHEDULE_UNCONFIRMED' || f.origin === 'NETWORK' ? null : null),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn primary sm', disabled: n.expired, onclick: () => { st.markRead(n.id); dlg.close(); hooks.continueWith(f); } }, 'มูเรื่องนี้ต่อ'),
      n.read_status === 'UNREAD' ? h('button', { type: 'button', class: 'btn sm', onclick: () => { st.markRead(n.id); } }, 'ทำเครื่องหมายว่าอ่านแล้ว') : null,
      rule.ok ? h('button', { type: 'button', class: 'btn sm', onclick: () => { st.setReminder(f.event_id, false, f.notify_days_before, todayISO()); changed(); drawCenter(); } }, 'ปิดการเตือน') : null,
      h('button', { type: 'button', class: 'btn sm ghost', onclick: () => { st.unfollow(f.event_id); changed(); drawCenter(); } }, 'เลิกติดตาม')));
}

function drawCenter() {
  const st = store(), today = todayISO();
  const list = st.list(today).sort((a, b) => (a.read_status === b.read_status ? 0 : a.read_status === 'UNREAD' ? -1 : 1)).map(noteCard).filter(Boolean);
  const unread = st.unread(today).length;
  clear(dlg).append(h('div', { class: 'dlg-h' }, h('h3', {}, `การแจ้งเตือน${CLOCK.demo ? ' (โหมดสาธิต)' : ''}`), h('button', { type: 'button', class: 'btn sm', 'aria-label': 'ปิด', onclick: () => dlg.close() }, '✕')),
    h('div', { class: 'dlg-b stack' },
      list.length ? [unread ? h('div', { class: 'row', style: 'justify-content:flex-end' }, h('button', { type: 'button', class: 'btn sm', onclick: () => st.markAllRead() }, 'อ่านทั้งหมดแล้ว')) : null, ...list]
        : h('div', { class: 'callout info' }, h('b', {}, 'ยังไม่มีแจ้งเตือน'), h('p', { class: 'small', style: 'margin:.3em 0 0' },
          'กด "＋ ติดตาม" ที่กิจกรรมในขั้นที่ 5 แล้วเปิด "เตือนล่วงหน้า" ระบบจะตรวจตอนเปิดหน้าเว็บและแจ้งเมื่อถึงวันเตือน (ไม่มีการส่งข้อความนอกหน้านี้)')),
      h('div', { class: 'callout warn small' }, UNCONFIRMED + ': ข้อมูลวันจัดกิจกรรมของสถานที่จริงยังไม่ได้ยืนยันกับผู้จัด ควรตรวจก่อนเดินทาง')));
}
export function openCenter() { drawCenter(); if (!dlg.open) dlg.showModal(); }
[realUserStore, demoUserStore].forEach((s) => s.subscribe(() => { if (dlg.open) drawCenter(); refresh(); }));

/* ------------------------------------------------------------------ "ปฏิทินมูของฉัน" (step 07) */
export function calendarCard() {
  const st = store(), today = todayISO();
  const rows = st.follows().map((f) => ({ f, c: classify(f.schedule, today) })).sort((a, b) => (a.c.next_start || '9999') < (b.c.next_start || '9999') ? -1 : 1);
  const chipFor = (s) => ({ NOT_FOLLOWED: ['', 'ยังไม่ติดตาม'], FOLLOWED_REMINDER_OFF: ['', 'ติดตาม · ปิดเตือน'], FOLLOWED_REMINDER_ON: ['ok', 'ติดตาม · เปิดเตือน'], BLOCKED_UNVERIFIED: ['st-cand', 'ข้อมูลเท่านั้น · ' + UNCONFIRMED] })[s.user];
  const item = ({ f, c }) => {
    const s = st.status(f.event_id, today, { policy: CLOCK.policy }), rule = ruleOf(f), [cls, txt] = chipFor(s);
    return h('div', { class: 'path stack', style: 'gap:6px' }, h('div', { class: 'row', style: 'justify-content:space-between;flex-wrap:nowrap' }, h('b', {}, f.name), h('span', { class: 'chip ' + cls }, txt)),
      h('div', { class: 'small muted' }, c.next_start ? `📅 ${thaiRange(c.next_start, c.next_end)}${c.days_until ? ` · อีก ${c.days_until} วัน` : ''}` : 'ไม่มีรอบที่กำลังจะมาถึง', f.place_name ? ` · 📍 ${f.place_name}` : ''),
      s.notice ? h('div', { class: 'small' }, s.time === 'EXPIRED' ? 'แจ้งเตือนหมดเวลาแล้ว' : s.notice === 'READ' ? 'อ่านแจ้งเตือนแล้ว' : 'มีแจ้งเตือนใหม่') : null,
      h('div', { class: 'row small' }, ...labelChips(f),
        h('label', { class: 'row', style: 'flex-wrap:nowrap;align-items:center' }, h('input', { type: 'checkbox', checked: f.reminder_enabled, disabled: !rule.ok, onchange: (e) => { st.setReminder(f.event_id, e.target.checked, f.notify_days_before, today); changed(); } }), 'เตือน'),
        h('select', { 'aria-label': 'เตือนล่วงหน้ากี่วัน', disabled: !rule.ok, onchange: (e) => { st.setReminder(f.event_id, f.reminder_enabled, Number(e.target.value), today); changed(); } }, OFFSETS.map((o) => h('option', { value: o, selected: o === f.notify_days_before }, `${o} วัน`))),
        h('button', { type: 'button', class: 'btn sm ghost', onclick: () => { st.unfollow(f.event_id); changed(); } }, 'เลิกติดตาม')));
  };
  return h('div', { class: 'card stack' }, h('h3', {}, '📅 ปฏิทินมูของฉัน'),
    rows.length ? rows.map(item) : h('p', { class: 'small muted', style: 'margin:0' }, 'ยังไม่ได้ติดตามกิจกรรมใด กด "＋ ติดตาม" ที่กิจกรรมในขั้นที่ 5'),
    h('div', { class: 'small faint' }, 'ข้อมูลการติดตามเก็บในเบราว์เซอร์นี้เท่านั้น (ไม่มีวันเกิด) ลบได้ด้วยปุ่ม "ล้างข้อมูลของฉัน"'));
}

/* ------------------------------------------------------------------ header bell, bottom bar, banner */
const badge = h('span', { class: 'badge', hidden: true });
const bell = h('button', { type: 'button', class: 'hbtn', 'aria-label': 'การแจ้งเตือน', title: 'การแจ้งเตือน', onclick: openCenter }, '🔔', badge);
const clockBtn = h('button', { type: 'button', class: 'hbtn faintbtn', 'aria-label': 'ตั้งค่าโหมดสาธิต', title: 'โหมดสาธิต', onclick: () => openClock() }, '🕒');
const banner = h('div', { class: 'demo-banner', role: 'status', hidden: true });
const bar = h('div', { class: 'nbar', role: 'status', hidden: true });
let barTimer = null, barSeen = '';

export function refresh() {
  const st = store(), today = todayISO(), unread = st.unread(today);
  badge.hidden = !unread.length; badge.textContent = String(unread.length);
  bell.setAttribute('aria-label', unread.length ? `การแจ้งเตือน ${unread.length} รายการ` : 'การแจ้งเตือน');
  banner.hidden = !CLOCK.demo;
  if (CLOCK.demo) clear(banner).append(h('div', { class: 'wrap row', style: 'justify-content:center;gap:10px' }, h('b', {}, '🧪 โหมดสาธิต'), `วันที่จำลอง ${thaiDate(today)} · ข้อมูลแยกจากข้อมูลจริง ไม่บันทึกลงเครื่อง`,
    h('button', { type: 'button', class: 'btn sm', onclick: () => openClock() }, 'ตั้งวันที่'), h('button', { type: 'button', class: 'btn sm', onclick: () => setDemo(false) }, 'ออก')));
  const sig = unread.map((n) => n.id).join(',');
  const visible = unread.length && hooks.showBar();
  if (!visible) { bar.hidden = true; if (!unread.length) barSeen = ''; return; }
  if (sig !== barSeen) {                                  // a new alert: show the bar, then tuck it away after about 8 seconds
    barSeen = sig; bar.hidden = false; clearTimeout(barTimer); barTimer = setTimeout(() => { bar.hidden = true; }, 8000);
  }
  clear(bar).append(h('button', { type: 'button', class: 'nbar-main', onclick: openCenter }, `🔔 มีแจ้งเตือน ${unread.length} รายการ`, h('span', { 'aria-hidden': 'true' }, ' ›')),
    h('button', { type: 'button', class: 'nbar-x', 'aria-label': 'ซ่อนแถบแจ้งเตือน', onclick: () => { bar.hidden = true; clearTimeout(barTimer); } }, '✕'));
}

/* ------------------------------------------------------------------ hidden demo clock */
const clk = h('dialog', { class: 'nc', 'aria-label': 'โหมดสาธิต' });
clk.addEventListener('click', (e) => { if (e.target === clk) clk.close(); });
document.body.append(clk);

function setDemo(on) {
  CLOCK.demo = on;
  if (on && !CLOCK.date) CLOCK.date = bangkokToday();
  if (!on) CLOCK.policy = POLICY.INFO_ONLY;
  barSeen = ''; changed(); if (clk.open) openClock();
}
function setDate(iso) { if (!isIso(iso)) return; CLOCK.date = iso; barSeen = ''; changed(); if (clk.open) openClock(); }

export function openClock() {
  const d = todayISO();
  clear(clk).append(h('div', { class: 'dlg-h' }, h('h3', {}, '🕒 โหมดสาธิต'), h('button', { type: 'button', class: 'btn sm', 'aria-label': 'ปิด', onclick: () => clk.close() }, '✕')),
    h('div', { class: 'dlg-b stack' },
      h('p', { class: 'small muted', style: 'margin:0' }, 'ใช้ทดสอบการแจ้งเตือนโดยไม่ต้องรอวันจริง ใช้นาฬิกาจำลองและข้อมูลแยกต่างหาก ไม่กระทบรายการติดตามจริงของคุณ'),
      h('label', { class: 'row', style: 'flex-wrap:nowrap;align-items:center' }, h('input', { type: 'checkbox', checked: CLOCK.demo, onchange: (e) => setDemo(e.target.checked) }), h('b', {}, 'เปิดโหมดสาธิต')),
      CLOCK.demo ? h('div', { class: 'stack' },
        h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'วันที่จำลอง'), h('input', { type: 'date', value: d, onchange: (e) => setDate(e.target.value) })),
        h('div', { class: 'row' }, [[-1, '−1 วัน'], [1, '+1 วัน'], [7, '+7 วัน']].map(([n, t]) => h('button', { type: 'button', class: 'btn sm', onclick: () => setDate(addDays(d, n)) }, t)), h('button', { type: 'button', class: 'btn sm', onclick: () => setDate(bangkokToday()) }, 'วันนี้จริง')),
        h('div', { class: 'row small' }, h('span', { class: 'muted' }, 'กิจกรรมจริงที่ยังไม่ยืนยันกำหนดการ:'),
          h('div', { class: 'seg', role: 'group', 'aria-label': 'นโยบายกิจกรรมจริง' }, [[POLICY.INFO_ONLY, 'ข้อมูลเท่านั้น (ก)'], [POLICY.ALERT_WITH_LABEL, 'แจ้งเตือนพร้อมป้าย (ข)']].map(([v, t]) =>
            h('button', { type: 'button', 'aria-pressed': String(CLOCK.policy === v), onclick: () => { CLOCK.policy = v; changed(); openClock(); } }, t)))),
        h('div', { class: 'callout small' }, 'ตัวอย่างวันทดสอบ: สอบ 20 ม.ค. 2570 เตือน 14 วัน → ตั้งวันที่ 6 ม.ค. 2570 · ความรัก 14 ม.ค. เตือน 7 วัน → 7 ม.ค. · คอนเสิร์ต 10 ม.ค. เตือน 1 วัน → 9 ม.ค.'),
        h('button', { type: 'button', class: 'btn sm', onclick: () => { demoUserStore.clear(); toast('ล้างข้อมูลโหมดสาธิตแล้ว'); changed(); openClock(); } }, 'ล้างข้อมูลโหมดสาธิต')) : null));
  if (!clk.open) clk.showModal();
}

/** Wipes the real follow data too ("ล้างข้อมูลของฉัน"). */
export function clearAllNotifyData() { realUserStore.clear(); demoUserStore.clear(); CLOCK.demo = false; CLOCK.date = null; CLOCK.policy = POLICY.INFO_ONLY; barSeen = ''; refresh(); }

export function mountChrome() {
  const row = document.querySelector('.hdr-row');
  if (!row || bell.isConnected) return;
  row.append(h('div', { class: 'hdr-tools' }, clockBtn, bell));
  document.querySelector('.hdr').append(banner);
  document.body.append(bar);
  subscribe(refresh);
  check(); refresh();                                   // check-on-open: alerts that became due while the page was closed
}
