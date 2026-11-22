// Tab 2 · Lab section I: Calendar v3 scenarios (Valentine, Concert Ticket Sale, Exam Application / Date / Result) on a virtual clock.
// Isolated on purpose: its own in-memory store (mode SIMULATION), never the Tab 1 store, never the Tab 1 notification centre.
// Direct Calendar Matching only: no PPR, no Deity -> Concert/Exam relation is created anywhere here.
import { h, clear, getJSON } from './util.js';
import { createStore, reminderBlock } from './notify.js';
import { parseBkk, fmtBkk, dateBkk, reminderText, reminderWindow, evaluate, CREATED_CODES, canonical, CODES, REMINDER_POLICY_VERSION } from './reminder.js';

const SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const thaiDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${SHORT[m - 1]} ${y + 543}`; };
const thaiMin = (min) => `${thaiDate(dateBkk(min))} ${fmtBkk(min).slice(11)} น.`;
const offLabel = (o) => (o === 0 ? 'ตอนเริ่ม (0)' : o % 1440 === 0 ? `${o / 1440} วัน (${o})` : o % 60 === 0 ? `${o / 60} ชม. (${o})` : `${o} นาที`);
const DEMO_BADGE = 'DEMO — ข้อมูลสมมติ';
const SCENARIOS = [['VALENTINE', 'Valentine (W01 · วันสำคัญตามปฏิทิน)'], ['TICKET', 'Concert Ticket Sale (W05)'], ['EXAM_APPLICATION', 'Exam Application (W04 · เปิด/ปิดรับสมัคร)'], ['EXAM_DATE', 'Exam Date (W04)'], ['EXAM_RESULT', 'Exam Result (W04)']];
const EXAM_CHILD = { EXAM_APPLICATION: ['APPLICATION_OPEN', 'APPLICATION_CLOSE'], EXAM_DATE: ['EXAM_DATE'], EXAM_RESULT: ['RESULT_ANNOUNCEMENT'] };
const CODE_TH = { CREATED: 'สร้างแจ้งเตือน ณ เวลาที่ถึงกำหนด', CREATED_LATE: 'สร้างแจ้งเตือน (ล่าช้าแต่ยังทัน)', CREATED_NEW_OCCURRENCE: 'สร้างแจ้งเตือน (รอบใหม่)', NOT_DUE: 'ยังไม่ถึงกำหนด', EXPIRED: 'เลยช่วงที่มีประโยชน์แล้ว',
  NOT_FOLLOWED: 'ยังไม่ได้ติดตาม', REMINDER_DISABLED: 'ยังไม่ได้เปิด Reminder', DUPLICATE_BLOCKED: 'เคยแจ้งแล้ว (กันซ้ำ)', DUPLICATE_BLOCKED_READ: 'เคยแจ้งและอ่านแล้ว (กันซ้ำ)', SUPERSEDED_BY_CATCHUP: 'ถูกแทนที่ด้วยการแจ้งชดเชยรายการอื่น',
  DATE_UNVERIFIED: 'วันที่ยังไม่ตรวจ', BLOCKED_UNVERIFIED: 'กำหนดการยังไม่ยืนยัน', BLOCKED_SYNTHETIC: 'ข้อมูลสมมติ ใช้ได้เฉพาะโหมดจำลอง', INVALID_REMINDER_WINDOW: 'ช่วงเวลาเตือนไม่ถูกต้อง' };

let cache = null;
async function loadData() {
  if (!cache) { const [demo, fixed] = await Promise.all([getJSON('/data/calendar_demo.json'), getJSON('/data/calendar_fixed.json')]); cache = { demo, fixed }; }
  return cache;
}

/* ------------------------------------------------------------------ build a parent + children for a scenario */
function buildParent(kind, id, D) {
  if (kind === 'VALENTINE') {
    const day = D.fixed.fixed_days[0];
    return { parent: { parent_id: day.calendar_item_id, kind: 'FIXED', name: day.event_name, origin: 'FIXED', wish_ids: [day.wish_id], children: [{ source_entity_id: day.calendar_item_id, source_type: 'FIXED_CALENDAR_DAY', label: day.event_name,
      occ: { kind: 'yearly', month_day: day.month_day }, calendar_date_status: day.calendar_date_status, schedule_status: day.event_schedule_status, synthetic: false, offsets_available: [...day.reminder_offsets_minutes], matching_method: day.matching_method, data_origin: day.data_origin, visibility_scope: day.visibility_scope }] },
      row: day, synthetic: false, title: day.event_name, wish: day.wish_id, note: day.disclaimer };
  }
  if (kind === 'TICKET') {
    const c = D.demo.concerts.find((x) => x.concert_id === id), sales = D.demo.ticket_sales.filter((s) => s.concert_id === id);
    return { parent: { parent_id: c.concert_id, kind: 'CONCERT', name: c.concert_name, origin: 'DEMO', wish_ids: [c.wish_id], children: sales.map((s) => ({ source_entity_id: s.sale_id, source_type: 'TICKET_SALE', sale_phase: s.sale_phase, label: s.sale_phase,
      eligibility_rule: s.eligibility_rule, sale_end: s.sale_end_datetime, occ: { kind: 'single', datetime: s.sale_start_datetime }, calendar_date_status: 'SYNTHETIC_DATE', schedule_status: 'SYNTHETIC_DEMO', synthetic: true,
      offsets_available: [...s.reminder_offsets_minutes], matching_method: s.matching_method, data_origin: s.data_origin, visibility_scope: s.visibility_scope })) },
      row: c, synthetic: true, title: c.concert_name, wish: c.wish_id, note: `คอนเสิร์ตจริงไม่มี: ${c.ticket_url_status} · ศิลปินสมมติ ${c.artist_id}` };
  }
  const p = D.demo.exam_programs.find((x) => x.exam_id === id), ms = D.demo.exam_milestones.filter((m) => m.exam_id === id);
  const close = parseBkk(ms.find((m) => m.milestone_type === 'APPLICATION_CLOSE').milestone_datetime);
  return { parent: { parent_id: p.exam_id, kind: 'EXAM', name: p.exam_name, origin: 'DEMO', wish_ids: [p.wish_id], children: ms.map((m) => ({ source_entity_id: m.milestone_id, source_type: 'EXAM_MILESTONE', milestone_type: m.milestone_type, exam_id: m.exam_id,
    exam_close_min: close, label: m.milestone_type, occ: { kind: 'single', datetime: m.milestone_datetime }, calendar_date_status: 'SYNTHETIC_DATE', schedule_status: 'SYNTHETIC_DEMO', synthetic: true,
    offsets_available: [...m.reminder_offsets_minutes], matching_method: m.matching_method, data_origin: m.data_origin, visibility_scope: m.visibility_scope })) },
    row: p, synthetic: true, title: p.exam_name, wish: p.wish_id, note: `${p.official_source_status} · ผู้จัดสมมติ` };
}
const kindOfChild = (c) => (c.source_type === 'EXAM_MILESTONE' ? c.milestone_type : c.source_type);

/* ------------------------------------------------------------------ Lab section I */
export function reminderSimulation(T) {
  const out = h('div', { class: 'stack' }, h('div', { class: 'spinner' }));
  const wishNames = Object.fromEntries((T.profile.wish_ids || []).map((w, i) => [w, T.profile.wish_names[i]]));
  const sim = { scenario: 'VALENTINE', sourceId: null, childId: null, store: createStore({ demo: true }), now: parseBkk('2027-02-06 12:00'), offsetPick: null, last: null, log: [], D: null };

  const resetStore = () => { sim.store = createStore({ demo: true }); sim.last = null; sim.log = []; };
  const pickDefaults = () => {
    const D = sim.D;
    if (sim.scenario === 'TICKET') { sim.sourceId = D.demo.concerts.some((c) => c.concert_id === sim.sourceId) ? sim.sourceId : D.demo.concerts[0].concert_id; }
    else if (sim.scenario !== 'VALENTINE') { sim.sourceId = D.demo.exam_programs.some((e) => e.exam_id === sim.sourceId) ? sim.sourceId : D.demo.exam_programs[0].exam_id; }
    else sim.sourceId = 'CAL_VALENTINE';
    const b = buildParent(sim.scenario, sim.sourceId, D);
    const allowed = sim.scenario === 'TICKET' ? b.parent.children.map((c) => c.source_entity_id)
      : sim.scenario === 'VALENTINE' ? ['CAL_VALENTINE'] : b.parent.children.filter((c) => EXAM_CHILD[sim.scenario].includes(c.milestone_type)).map((c) => c.source_entity_id);
    if (!allowed.includes(sim.childId)) sim.childId = allowed[0];
    return { b, allowed };
  };
  const setScenario = (s) => {
    sim.scenario = s; resetStore();
    sim.sourceId = null; sim.childId = null; sim.offsetPick = null;
    sim.now = parseBkk(s === 'VALENTINE' ? '2027-02-06 12:00' : s === 'TICKET' ? '2026-12-29 09:00' : '2026-12-03 09:00');
    draw();
  };

  function draw() {
    const D = sim.D, { b, allowed } = pickDefaults(), st = sim.store, parent = b.parent;
    const child = (st.child(parent.parent_id, sim.childId)) || parent.children.find((c) => c.source_entity_id === sim.childId);
    const followed = st.isFollowed(parent.parent_id);
    const live = followed ? st.child(parent.parent_id, sim.childId) : null;
    const ex = followed ? st.explain(parent.parent_id, sim.childId, sim.now) : null;
    const occ = ex && ex.occurrence;
    const block = reminderBlock(child, 'SIMULATION');
    const sel = (label, el) => h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), el);
    const tm = fmtBkk(sim.now);
    const setNow = (min) => { sim.now = min; draw(); };
    const pickOffset = sim.offsetPick != null && child.offsets_available.includes(sim.offsetPick) ? sim.offsetPick : (live && live.offsets_enabled.length ? Math.min(...live.offsets_enabled) : child.offsets_available[child.offsets_available.length - 1]);
    const win = (() => { const t0 = parseBkk(child.occ.kind === 'yearly' ? `${dateBkk(sim.now).slice(0, 4)}-${child.occ.month_day}` : child.occ.datetime);
      const w = reminderWindow({ source_type: child.source_type, milestone_type: child.milestone_type, exam_id: child.exam_id, target_min: t0 }, pickOffset, { examClose: () => child.exam_close_min }); return w.ok ? w : null; })();
    const eligib = child.eligibility_rule && child.eligibility_rule !== 'PUBLIC';

    clear(out).append(
      h('div', { class: 'row' }, h('span', { class: b.synthetic ? 'chip st-syn' : 'chip ok' }, b.synthetic ? DEMO_BADGE : 'วันสำคัญจริงตามปฏิทิน'), h('span', { class: 'chip' }, 'Direct Calendar Matching (ไม่ผ่านเครือข่าย · ไม่มี PPR)'),
        h('span', { class: 'chip' }, REMINDER_POLICY_VERSION), h('span', { class: 'chip' }, 'โหมด SIMULATION · Virtual Clock · แยกจากศูนย์แจ้งเตือนจริง')),
      h('div', { class: 'grid g2' },
        sel('Scenario', h('select', { onchange: (e) => setScenario(e.target.value) }, SCENARIOS.map(([v, t]) => h('option', { value: v, selected: v === sim.scenario }, t)))),
        sim.scenario === 'VALENTINE' ? sel('แหล่งข้อมูล', h('div', { class: 'small muted' }, 'CL_FIXED_CALENDAR_DAYS · กฎ 14 ก.พ. ทุกปี (ไม่ใช้วันจำลองเก่า SYN_EV_014)')) :
          sel(sim.scenario === 'TICKET' ? 'คอนเสิร์ต (concert_id)' : 'รอบสอบ (exam_id)', h('select', { onchange: (e) => { sim.sourceId = e.target.value; sim.childId = null; resetStore(); draw(); } },
            (sim.scenario === 'TICKET' ? D.demo.concerts.map((c) => [c.concert_id, c.concert_name]) : D.demo.exam_programs.map((p) => [p.exam_id, p.exam_name])).map(([v, t]) => h('option', { value: v, selected: v === sim.sourceId }, `${t} · ${v}`)))),
        sim.scenario === 'VALENTINE' ? null : sel(sim.scenario === 'TICKET' ? 'รอบขาย (sale_id)' : 'Milestone (milestone_id)', h('select', { onchange: (e) => { sim.childId = e.target.value; sim.offsetPick = null; draw(); } },
          allowed.map((id) => { const c = parent.children.find((x) => x.source_entity_id === id); return h('option', { value: id, selected: id === sim.childId }, `${c.label} · ${id}`); })))),
      // the 11 items the expert listed
      h('div', { class: 'card flat stack' },
        h('div', { class: 'small' }, h('b', {}, '1 · User Wish: '), `${b.wish} ${wishNames[b.wish] ? '(' + wishNames[b.wish] + ' — อยู่ในโปรไฟล์ด้านบน)' : '(ไม่อยู่ในโปรไฟล์ด้านบน — จับคู่ตรงจากป้ายเรื่อง)'}`),
        h('div', { class: 'small' }, h('b', {}, '2 · Calendar Matching Method: '), `${child.matching_method} — ไม่ใช้ PPR ไม่สร้างเส้นทาง Deity→${sim.scenario === 'TICKET' ? 'Concert' : sim.scenario === 'VALENTINE' ? 'Valentine' : 'Exam'} (Network Recommendation ของสถานที่ยังเป็นส่วน A–H ด้านบน)`),
        h('div', { class: 'small' }, h('b', {}, '3 · Source Entity: '), `${child.source_entity_id} ← parent ${parent.parent_id} · ${b.title} · ${child.data_origin} · ${child.visibility_scope}`),
        h('div', { class: 'small' }, h('b', {}, '4 · Calendar Occurrence: '), child.occ.kind === 'yearly' ? `ทุกปี ${child.occ.month_day} 00:00 (Asia/Bangkok)` : `${thaiMin(parseBkk(child.occ.datetime))} (${child.occ.datetime} +07:00)${child.sale_end ? ` · ปิดรอบขาย ${child.sale_end} (แสดงสถานะเท่านั้น ไม่ใช้ขยายอายุ Reminder)` : ''}`),
        b.note ? h('div', { class: 'small faint' }, b.note) : null,
        eligib ? h('div', { class: 'callout warn small' }, `รอบนี้มีเงื่อนไขสิทธิ์ (${child.eligibility_rule}) โปรดตรวจสอบก่อนซื้อ ระบบไม่สรุปว่าผู้ใช้มีสิทธิ์`) : null),
      h('div', { class: 'grid g2' },
        sel('5 · Reminder Offset (ผู้ใช้เลือกเอง ค่าเริ่มต้นปิด)', h('div', { class: 'row' }, child.offsets_available.map((o) => h('label', { class: 'row', style: 'flex-wrap:nowrap;align-items:center;gap:4px' },
          h('input', { type: 'checkbox', checked: !!live && live.offsets_enabled.includes(o), disabled: !followed || !!block, onchange: (e) => { const cur = live.offsets_enabled; st.setOffsets(parent.parent_id, child.source_entity_id, e.target.checked ? [...cur, o] : cur.filter((x) => x !== o), sim.now); draw(); } }), offLabel(o))))),
        sel('6 · Follow State (Parent Follow)', h('button', { type: 'button', class: 'btn sm' + (followed ? ' primary' : ''), onclick: () => { followed ? st.unfollow(parent.parent_id) : st.follow(parent, sim.now); draw(); } }, followed ? `✓ ติดตาม ${parent.kind} อยู่ (กดเพื่อเลิก)` : `＋ ติดตาม ${parent.parent_id}`)),
        sel('7 · Reminder Enabled', h('div', { class: 'small' }, live && live.offsets_enabled.length ? `เปิด ${live.offsets_enabled.length} ช่วง: ${live.offsets_enabled.map(offLabel).join(', ')}` : 'ปิด (consent ยังไม่ได้ให้)', block ? ` · ถูกบล็อก: ${block}` : '')),
        sel('8 · Simulation Date/Time (Asia/Bangkok)', h('div', { class: 'row' }, h('input', { type: 'date', value: tm.slice(0, 10), onchange: (e) => { const t = parseBkk(`${e.target.value} ${tm.slice(11)}`); if (t != null) setNow(t); } }),
          h('input', { type: 'time', value: tm.slice(11), onchange: (e) => { const t = parseBkk(`${tm.slice(0, 10)} ${e.target.value}`); if (t != null) setNow(t); } })))),
      h('div', { class: 'row small' }, [['−1 วัน', -1440], ['−1 ชม.', -60], ['−1 นาที', -1], ['+1 นาที', 1], ['+1 ชม.', 60], ['+1 วัน', 1440]].map(([t, d]) => h('button', { type: 'button', class: 'btn sm', onclick: () => setNow(sim.now + d) }, t)),
        h('span', { class: 'muted' }, 'ไปที่ offset'), h('select', { 'aria-label': 'เลือก offset สำหรับปุ่มลัด', onchange: (e) => { sim.offsetPick = Number(e.target.value); draw(); } }, child.offsets_available.map((o) => h('option', { value: o, selected: o === pickOffset }, offLabel(o)))),
        win ? [['due −1 นาที', win.due - 1], ['due', win.due], ['due +1 นาที', win.due + 1], ['expiry −1 นาที', win.expires - 1], ['expiry', win.expires]].map(([t, m]) => h('button', { type: 'button', class: 'btn sm', onclick: () => setNow(m) }, t)) : null),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn primary', disabled: !followed, onclick: () => { const r = st.runCheck(sim.now); sim.last = { ...r, at: sim.now }; sim.log.push({ at: sim.now, created: r.created.length }); draw(); } }, '▶ Run Reminder Check'),
        h('button', { type: 'button', class: 'btn', disabled: !st.unread(sim.now).length, onclick: () => { st.markAllRead(); draw(); } }, 'ทำเครื่องหมายว่าอ่านแล้ว'),
        h('button', { type: 'button', class: 'btn', onclick: () => { resetStore(); draw(); } }, 'รีเซ็ตการจำลอง')),
      h('div', { class: 'card flat stack' },
        h('b', {}, '9 · Due / Not Due ต่อ offset ที่เวลาจำลอง ' + thaiMin(sim.now)),
        followed && ex && ex.rows.length ? h('div', { class: 'scroll-x' }, h('table', { class: 'sim-table' }, h('thead', {}, h('tr', {}, ['offset', 'เปิด', 'due', 'expires (exclusive)', 'รหัสผลลัพธ์'].map((t) => h('th', {}, t)))),
          h('tbody', {}, ex.rows.map((r) => h('tr', {}, h('td', {}, offLabel(r.offset)), h('td', {}, r.enabled ? '✓' : '—'), h('td', { class: 'small' }, r.due != null ? fmtBkk(r.due) : '—'), h('td', { class: 'small' }, r.expires != null ? fmtBkk(r.expires) : '—'),
            h('td', {}, h('b', {}, r.code), h('div', { class: 'small faint' }, CODE_TH[r.code] || '')))))))
          : h('div', { class: 'small faint' }, followed ? 'ไม่มีรอบที่ยังมีประโยชน์ ณ เวลานี้' : 'ยังไม่ได้ติดตาม (NOT_FOLLOWED)'),
        h('b', {}, '10 · Notification Result (ศูนย์แจ้งเตือนจำลองของส่วนนี้เท่านั้น)'),
        sim.last ? h('div', { class: 'small' }, `รอบตรวจล่าสุด ${thaiMin(sim.last.at)}: สร้างใหม่ ${sim.last.created.length} รายการ${sim.last.created.length ? ' → ' + sim.last.created.map((n) => `${n.code} (${offLabel(n.offset)})`).join(', ') : ''}`) : h('div', { class: 'small faint' }, 'ยังไม่ได้ Run'),
        ...st.list(sim.now).map((n) => { const c2 = st.child(n.parent_id, n.source_entity_id); return h('div', { class: 'path' }, `🔔 ${reminderText(kindOfChild(c2), { target_min: n.occurrence_min }, n.offset, sim.now)} · ${c2.label} · ${n.occurrence_datetime} · ${n.read_status === 'READ' ? 'อ่านแล้ว' : n.expired ? 'หมดเวลา' : 'ยังไม่อ่าน'} · code ${n.code}`); }),
        h('b', {}, '11 · Deduplication'),
        h('div', { class: 'small muted' }, 'key = local_user_id|source_entity_id|occurrence_datetime|offset_minutes · กด Run ซ้ำที่เวลาเดิม ต้อง "สร้างใหม่ 0" และรอบใหม่ (occurrence_datetime เปลี่ยน) ต้องแจ้งได้อีก'),
        st.state.notifications.length ? h('div', { class: 'small faint' }, st.state.notifications.map((n) => n.id).join('  ·  ')) : null,
        sim.log.length ? h('table', {}, h('thead', {}, h('tr', {}, ['รอบ', 'เวลาจำลอง', 'สร้างใหม่'].map((t) => h('th', {}, t)))), h('tbody', {}, sim.log.map((l, i) => h('tr', {}, h('td', {}, i + 1), h('td', {}, thaiMin(l.at)), h('td', { class: 'n' }, l.created))))) : null,
        Object.keys(st.state.superseded).length ? h('div', { class: 'small' }, `SUPERSEDED_BY_CATCHUP ที่บันทึกถาวร: ${Object.keys(st.state.superseded).length} offset (ไม่แจ้งย้อนหลัง)`) : null));
  }

  loadData().then((D) => { sim.D = D; draw(); }).catch((e) => clear(out).append(h('div', { class: 'callout bad' }, 'โหลดข้อมูล Calendar v3 ไม่สำเร็จ: ' + e.message)));
  return h('section', { class: 'card lab-step stack fade-in' }, h('h3', {}, h('span', { class: 'tag' }, 'I'), 'Calendar v3 · Reminder Simulation (Virtual Clock · แยกจากข้อมูลจริง)'),
    h('p', { class: 'small muted', style: 'margin:0' }, `${DEMO_BADGE} — คอนเสิร์ต วันเปิดขายบัตร และรอบสอบเป็นข้อมูลจำลอง ไม่ใช่ประกาศจากผู้จัดหรือหน่วยงาน ไม่มี URL ขายบัตรหรือสมัครสอบจริง Valentine เป็นวันตามปฏิทิน ส่วนนี้ไม่ส่งอะไรเข้าศูนย์แจ้งเตือนจริงของ Tab 1`), out);
}

/* ------------------------------------------------------------------ Model Evaluation: live reminder checks (60 fixtures + store behaviour) */
export async function reminderChecks() {
  const [fx, D] = await Promise.all([getJSON('/data/calendar_demo_fixtures.json'), loadData()]);
  const mile = Object.fromEntries(D.demo.exam_milestones.map((r) => [r.milestone_id, r]));
  const closeOf = {};
  D.demo.exam_milestones.filter((r) => r.milestone_type === 'APPLICATION_CLOSE').forEach((r) => { closeOf[r.exam_id] = parseBkk(r.milestone_datetime); });
  const failed = [], codes = {};
  for (const c of fx.cases) {
    const isSale = c.source_type === 'TICKET_SALE', p = isSale ? null : mile[c.source_entity_id];
    const src = isSale ? { source_type: 'TICKET_SALE', target_min: parseBkk(c.event_datetime) } : { source_type: 'EXAM_MILESTONE', milestone_type: p.milestone_type, exam_id: p.exam_id, target_min: parseBkk(c.event_datetime) };
    const r = evaluate({ mode: c.mode, synthetic: c.schedule_status === 'SYNTHETIC_DEMO', followed: c.followed === 'Y', reminder_enabled: c.reminder_enabled === 'Y', calendar_date_status: c.calendar_date_status, schedule_status: c.schedule_status,
      src, offset: Number(c.offset_minutes), now: parseBkk(c.simulation_datetime), state: { notified: c.already_notified === 'Y', read: c.already_read === 'Y', previous_occurrence_notified: c.previous_occurrence_already_notified === 'Y' }, ctx: { examClose: (id) => closeOf[id] } });
    codes[r.code] = (codes[r.code] || 0) + 1;
    if (canonical(r.code) !== c.expected_reason || CREATED_CODES.has(r.code) !== (c.expected_create === 'Y')) failed.push(c.test_id);
  }
  const checks = [{ label: `ชุดทดสอบ Reminder ${fx.cases.length} แถว (ไม่แก้ค่าที่คาด)`, ok: failed.length === 0 && fx.cases.length === 60, detail: failed.length ? 'ไม่ผ่าน: ' + failed.join(', ') : `ผ่าน ${fx.cases.length}/${fx.cases.length} · ${Object.keys(codes).length} รหัส`, }];
  const T = parseBkk;
  const val = () => ({ parent_id: 'CAL_VALENTINE', kind: 'FIXED', name: 'V', origin: 'FIXED', wish_ids: ['W01'], children: [{ source_entity_id: 'CAL_VALENTINE', source_type: 'FIXED_CALENDAR_DAY', label: 'V', occ: { kind: 'yearly', month_day: '02-14' },
    calendar_date_status: 'CALENDAR_DATE_VERIFIED', schedule_status: 'NOT_APPLICABLE', synthetic: false, offsets_available: [10080, 1440] }] });
  const s = createStore({ demo: false }); s.follow(val(), T('2027-01-01')); s.setOffsets('CAL_VALENTINE', 'CAL_VALENTINE', [10080, 1440]);
  const first = s.runCheck(T('2027-02-14 12:00')).created, again = s.runCheck(T('2027-02-14 12:05')).created;
  checks.push({ label: 'Catch-up: หลาย offset ที่พลาด → แจ้ง 1 รายการ และไม่ย้อนแจ้งซ้ำ', ok: first.length === 1 && first[0].offset === 1440 && again.length === 0, detail: 'SUPERSEDED_BY_CATCHUP บันทึกถาวร' });
  const o = createStore({ demo: false }); o.follow(val(), T('2027-02-14 09:00'));
  o.setOffsets('CAL_VALENTINE', 'CAL_VALENTINE', [10080], T('2027-02-14 12:00')); const one = o.runCheck(T('2027-02-14 12:00')).created;
  o.setOffsets('CAL_VALENTINE', 'CAL_VALENTINE', [10080, 1440], T('2027-02-14 12:00')); const two = o.runCheck(T('2027-02-14 12:00')).created;
  checks.push({ label: 'Catch-up ติ๊กทีละช่อง (7 วัน แล้ว 1 วัน): ได้ 1 รายการต่อ occurrence', ok: one.length === 1 && two.length === 0 && o.list(T('2027-02-14 12:00')).length === 1, detail: 'บันทึก catch-up ต่อผู้ใช้+occurrence' });
  const y = createStore({ demo: false }); y.follow(val(), T('2026-11-22')); y.setOffsets('CAL_VALENTINE', 'CAL_VALENTINE', [1440]); y.runCheck(T('2027-02-13 00:00'));
  const next = y.runCheck(T('2028-02-13 00:00')).created;
  checks.push({ label: 'Valentine รายปี: ของปีเก่าไม่บล็อกปีใหม่', ok: next.length === 1 && next[0].code === CODES.CREATED_NEW_OCCURRENCE, detail: '2027 → 2028' });
  const syn = { parent_id: 'C', kind: 'CONCERT', name: 'C', origin: 'DEMO', wish_ids: ['W05'], children: [{ source_entity_id: 'S', source_type: 'TICKET_SALE', label: 'S', occ: { kind: 'single', datetime: '2027-01-06 10:00' }, calendar_date_status: 'SYNTHETIC_DATE', schedule_status: 'SYNTHETIC_DEMO', synthetic: true, offsets_available: [60] }] };
  const n = createStore({ demo: false }); n.follow(syn, T('2026-12-01')); n.setOffsets('C', 'S', [60]);
  checks.push({ label: 'ข้อมูลสมมติไม่แจ้งเตือนในโหมดผู้ใช้ปกติ (BLOCKED_SYNTHETIC)', ok: n.runCheck(T('2027-01-06 09:30')).created.length === 0, detail: 'Normal store ไม่สร้าง Notification' });
  const m = createStore({ demo: true }); m.follow(syn, T('2026-12-01')); m.setOffsets('C', 'S', [60]); const mk = m.runCheck(T('2027-01-06 09:30')).created;
  m.markRead(mk[0].id);
  checks.push({ label: 'Read/Unread · Follow/Unfollow', ok: m.unread(T('2027-01-06 09:30')).length === 0 && (m.unfollow('C'), m.list(T('2027-01-06 09:30')).length === 0), detail: 'อ่านแล้วไม่นับเป็นยังไม่อ่าน · เลิกติดตามล้างแจ้งเตือน' });
  checks.push({ label: 'ไม่เก็บวันเกิด', ok: !/birth|dob/i.test(JSON.stringify(s.state)), detail: 'schema v2: local_user_id, follows, notifications, superseded' });
  return checks;
}
