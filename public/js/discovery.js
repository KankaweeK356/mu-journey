// Step 04 "Proactive Event Recommendation Card". Discovery only: it never touches the follow store, never creates a
// notification record, never changes the bell counter and never opens the notification centre.
import { h } from './util.js';
import { pickDiscovery } from './calendar.js';
import { thaiDate, thaiRange } from './notifyui.js';

const dismissed = new Set();               // this page only; a dismissed card stays hidden until reload
export const resetDismissed = () => dismissed.clear();

/** Returns a DOM node, or null when nothing qualifies (the whole section is then hidden, nothing is made up). */
export function discoverySection(R, { today, focus = 'ALL', onDetail, redraw }) {
  if (!R || !R.events) return null;
  const cards = pickDiscovery(R.events.eligible, today, { focus, dismissed });
  if (!cards.length) return null;
  const card = (r) => {
    const verified = r.static.calendar_date === 'CALENDAR_DATE_VERIFIED';
    const when = r.next_start ? (r.display_status === 'ONGOING' ? `กำลังอยู่ในช่วง (ถึง ${thaiDate(r.next_end)})` : verified ? `รอบถัดไปตามปฏิทิน ${thaiRange(r.next_start, r.next_end)}` : `วันที่ในตารางข้อมูลของโครงการ ${thaiRange(r.next_start, r.next_end)} (ยังไม่ได้ตรวจกับแหล่งอื่น)`) : null;
    return h('div', { class: 'card flat stack disc-card' },
      h('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-start;flex-wrap:nowrap' },
        h('div', { style: 'min-width:0' }, r.tone === 'NEAR' ? h('span', { class: 'chip gold' }, `ใกล้ถึง · อีก ${r.days_until} วัน`) : null, h('div', {}, h('b', {}, r.event_name)), h('div', { class: 'small muted' }, `${r.deity_name} · ${r.place_name}`)),
        h('button', { type: 'button', class: 'btn sm ghost', 'aria-label': 'ปิดการ์ดนี้', title: 'ปิดการ์ดนี้', onclick: () => { dismissed.add(r.event_id); redraw(); } }, '✕')),
      when ? h('div', { class: 'small' }, '📅 ' + when) : null,
      h('div', { class: 'row' }, h('span', { class: 'chip st-cand' }, 'กำหนดการยังไม่ยืนยัน'), h('span', { class: 'small faint' }, 'ยังไม่ยืนยันกับผู้จัดว่าจะจัดงานในวันดังกล่าว')),
      h('div', { class: 'path' }, r.evidence_paths[0].text));
  };
  return h('div', { class: 'card stack', role: 'region', 'aria-label': 'กิจกรรมที่คุณอาจสนใจ' }, h('h3', {}, '🗓 กิจกรรมที่คุณอาจสนใจ'),
    ...cards.map(card),
    h('div', { class: 'row small' }, h('button', { type: 'button', class: 'btn sm', onclick: onDetail }, 'ดูรายละเอียดที่ขั้น 05'),
      h('span', { class: 'faint' }, 'เป็นคำแนะนำจากเครือข่าย ไม่ใช่การแจ้งเตือน และไม่เปลี่ยนอันดับสถานที่')));
}
