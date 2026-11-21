// Tab 2 · event recommendation trace + reminder simulation (Lab steps H and I). Uses the same calendar.js / notify.js as Tab 1.
import { h, clear, f } from './util.js';
import { displayLayer, classify, alertRule, dueOccurrences, addDays, bangkokToday, isIso, OFFSETS, POLICY } from './calendar.js';
import { createStore } from './notify.js';
import { snapNetwork, snapDirect, thaiDate, thaiRange } from './notifyui.js';

const CAL_TH = { CALENDAR_DATE_VERIFIED: 'วันที่ตรวจแล้ว', DATE_UNVERIFIED: 'วันที่ยังไม่ตรวจ', NO_COMPUTABLE_DATE: 'คำนวณวันที่ไม่ได้', SYNTHETIC_DATE: 'วันที่จำลอง' };
const SCH_TH = { EVENT_SCHEDULE_UNVERIFIED: 'กำหนดการยังไม่ยืนยัน', EVENT_SCHEDULE_VERIFIED: 'กำหนดการยืนยันแล้ว', SYNTHETIC_DEMO: 'จำลอง' };
const NET_TH = { HARD_EXCLUDED: 'ถูกข้อจำกัดตัดออก', NO_PATH_FOR_PROFILE: 'ไม่มีเส้นทางสำหรับโปรไฟล์นี้', ZERO_NETWORK_SCORE: 'คะแนนเครือข่ายเป็นศูนย์', NO_VALID_NETWORK_PATH: 'ไม่มีเรื่อง→เทพที่ถูกต้อง (ข้อมูลต้นทาง)', RELATIONSHIP_REVIEW_REQUIRED: 'ความสัมพันธ์เทพ–สถานที่รอตรวจ (ไม่แก้ข้อมูลต้นทาง)' };
const STAB_TH = { STABLE: 'คงที่', SENSITIVE: 'ไวต่อน้ำหนัก', TIE_BOUNDARY_REVIEW: 'คะแนนเท่ากันคาบเกี่ยวอันดับ 5 (ตรวจแยก)', NOT_EVALUABLE: 'ประเมินไม่ได้', NOT_EVALUABLE_CONSTANT_RANKING: 'ประเมินไม่ได้ (อันดับคงที่)' };

const step = (tag, ttl, ...kids) => h('section', { class: 'card lab-step stack fade-in' }, h('h3', {}, h('span', { class: 'tag' }, tag), ttl), ...kids);

/* ------------------------------------------------------------------ H: event recommendation trace */
export function eventTrace(T) {
  const R = T.event_ranking, today = bangkokToday();
  const body = h('div', { class: 'stack' });
  const draw = (asOf) => {
    const L = displayLayer(R.eligible, asOf), disp = Object.fromEntries([...L.displayable, ...L.not_displayed].map((r) => [r.event_id, r]));
    const st = R.stability;
    clear(body).append(
      h('div', { class: 'row' }, h('span', { class: R.step05_check ? 'chip ok' : 'chip bad' }, R.step05_check ? '✓ คะแนนสถานที่เท่ากับ Step 05' : '✗ คะแนนสถานที่ไม่ตรง Step 05'),
        h('span', { class: 'chip' }, R.version), h('span', { class: 'chip' }, `น้ำหนักเทพ ${R.weights.deity} · สถานที่ ${R.weights.place}`), h('span', { class: 'chip ok' }, `อยู่ในเครือข่าย ${R.counts.eligible} กิจกรรม`), h('span', { class: 'chip' }, `ถูกตัด/ไม่มีเส้นทาง ${R.counts.excluded}`), h('span', { class: 'chip' }, `คู่เทพ–สถานที่ไม่ซ้ำ ${R.counts.distinct_deity_place_pairs}`)),
      h('div', { class: 'formula' }, 'EventScore = 0.5 × DeityScore + 0.5 × PlaceScore', h('br'), 'PlaceScore = คะแนนเดียวกับ Step 05 · DeityScore = PPR ดิบของเทพ ÷ ค่าสูงสุดของเทพที่ผ่านเงื่อนไข · เสมอกันเรียงตาม event_id · ', R.relative_scores_note),
      h('label', { class: 'row small' }, 'ดูผลคัดตามวันที่ (Layer B): ', h('input', { type: 'date', value: asOf, onchange: (e) => { if (isIso(e.target.value)) draw(e.target.value); } }), h('span', { class: 'faint' }, 'วันที่ใช้แค่คัดกิจกรรมที่ยังมาไม่ถึง ไม่เปลี่ยนคะแนนหรือ network_rank')),
      R.eligible.length ? h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['network', 'display', 'กิจกรรม', 'เทพ', 'สถานที่', 'รวม', 'เสมอ', 'วันที่ (Layer B)', 'สถานะวันที่ / กำหนดการ', 'เส้นทางที่ใช้'].map((t, i) => h('th', { class: i === 3 || i === 4 || i === 5 || i === 6 ? 'n' : '' }, t)))),
        h('tbody', {}, R.eligible.map((r) => { const d = disp[r.event_id]; return h('tr', { class: d.display_status === 'PAST' || d.display_status === 'NO_OCCURRENCE_IN_RANGE' ? 'out' : '' },
          h('td', { class: 'n' }, r.network_rank), h('td', { class: 'n' }, d.display_rank || '—'), h('td', {}, r.event_name, h('div', { class: 'small faint' }, r.event_id)),
          h('td', { class: 'n' }, f(r.deity_score, 4)), h('td', { class: 'n' }, f(r.place_score, 4)), h('td', { class: 'n' }, f(r.event_score, 4)), h('td', { class: 'n' }, r.tie_group_size > 1 ? '×' + r.tie_group_size : '—'),
          h('td', { class: 'small' }, d.display_status === 'PAST' ? `ผ่านแล้ว (${thaiDate(d.last_end)})` : d.next_start ? `${d.display_status === 'ONGOING' ? 'กำลังจัด ' : ''}${thaiRange(d.next_start, d.next_end)}` : 'ไม่มีรอบในช่วงที่คำนวณได้'),
          h('td', { class: 'small' }, `${CAL_TH[r.static.calendar_date]} · ${SCH_TH[r.static.event_schedule]}`),
          h('td', { class: 'small' }, r.evidence_paths.slice(0, 2).map((z) => h('div', {}, `${z.wish_name} → ${z.deity_name} → ${z.place_name}`)), r.evidence_paths.length > 2 ? h('div', { class: 'faint' }, `และอีก ${r.evidence_paths.length - 2} เส้นทาง`) : null)); })))) :
        h('div', { class: 'callout warn' }, 'ไม่มีกิจกรรมที่เครือข่ายเชื่อมกับโปรไฟล์นี้ ระบบไม่เติมกิจกรรมให้'),
      h('details', {}, h('summary', {}, `กิจกรรมที่ไม่ได้อยู่ในอันดับ (${R.excluded.length}) และเหตุผล`), h('div', { class: 'inner stack' }, R.excluded.map((x) => h('div', { class: 'small' }, h('b', {}, x.event_name), ' — ', NET_TH[x.network_status] || x.network_status)))),
      R.direct.length ? h('div', { class: 'callout small' }, h('b', {}, 'กิจกรรมจับคู่ตรง (ข้อมูลจำลอง) '), `${R.direct.length} รายการ แยกจากอันดับเครือข่าย ไม่มีเส้นทางและไม่มีคะแนน PPR`) : null,
      h('div', { class: 'card flat stack' }, h('b', {}, 'เสถียรภาพของอันดับเมื่อเปลี่ยนน้ำหนัก (30/70 · 50/50 · 70/30)'),
        h('div', { class: 'row' }, h('span', { class: 'chip' }, st.status), st.interpretation ? h('span', { class: st.interpretation === 'STABLE' ? 'chip ok' : 'chip st-cand' }, STAB_TH[st.interpretation] || st.interpretation) : null, h('span', { class: 'chip' }, `${st.n_events} กิจกรรม · ${st.distinct_deity_place_pairs ?? '-'} คู่เทพ–สถานที่`)),
        st.scenarios ? h('div', { class: 'small muted' }, Object.entries(st.scenarios).filter(([k]) => k !== 'baseline_50_50').map(([k, v]) => `${k}: top5 overlap ${v.top5_overlap ?? '—'} · Spearman ${v.spearman == null ? '—' : f(v.spearman, 3)}`).join(' | ')) : null,
        h('div', { class: 'small faint' }, 'เกณฑ์ 0.80 เป็นเกณฑ์ภายในสำหรับสาธิต ไม่ใช่ความแม่นยำ คะแนนที่เท่ากันเพราะหลายกิจกรรมใช้เทพและสถานที่คู่เดียวกัน')),
      h('div', { class: 'small faint' }, `ปฏิทินจันทรคติ: ${R.lunar_source.source_name} · ${R.lunar_source.provider} · ดึงเมื่อ ${R.lunar_source.retrieved_at} · ${R.lunar_source.leap_month_check} · `, h('a', { href: R.lunar_source.source_url, target: '_blank', rel: 'noopener noreferrer' }, 'แหล่งข้อมูล'), ' · วันที่ตรวจแล้วไม่ได้แปลว่ากำหนดการจัดงานยืนยันแล้ว'),
      h('div', { class: 'callout small' }, 'กฎการเตือน: ต้องติดตาม + เปิดเตือน + วันที่ตรวจแล้ว + กำหนดการยืนยันแล้ว กิจกรรมจริงทั้ง 37 รายการยังไม่ผ่านข้อสุดท้าย จึงเป็นข้อมูลเท่านั้น (ผู้เชี่ยวชาญเลือกทาง ก) กิจกรรมจำลองทดสอบเตือนได้เฉพาะใน Reminder Simulation ของ Tab 2 นี้ ศูนย์แจ้งเตือนใน Tab 1 ไม่สร้างแจ้งเตือนจากกิจกรรมที่ยังไม่ยืนยัน'));
  };
  draw(today);
  return step('H', `Event Recommendation Trace (${R.counts.eligible} กิจกรรม)`, body);
}

/** Live, in-browser correctness checks of the reminder rules (same functions Tab 1 uses). Isolated stores, no real data touched. */
export function reminderChecks() {
  const one = (d) => ({ kind: 'annual', occurrences: [{ start: d, end: d }] });
  const syn = (id, date, off) => ({ event_id: id, name: id, origin: 'DIRECT', schedule: one(date), calendar_date: 'SYNTHETIC_DATE', event_schedule: 'SYNTHETIC_DEMO', notify_days_before: off, wish_ids: [] });
  const real = (id, cal) => ({ event_id: id, name: id, origin: 'NETWORK', schedule: one('2027-09-29'), calendar_date: cal, event_schedule: 'EVENT_SCHEDULE_UNVERIFIED', notify_days_before: 1, wish_ids: [] });
  const checks = [];
  const add = (label, ok, detail) => checks.push({ label, ok: !!ok, detail });
  for (const [id, date, off, day] of [['SYN_EV_025', '2027-01-20', 14, '2027-01-06'], ['SYN_EV_013', '2027-01-14', 7, '2027-01-07'], ['SYN_EV_001', '2027-01-10', 1, '2027-01-09']]) {
    const s = createStore({ demo: true });
    s.follow(syn(id, date, off), '2026-12-01', { reminder: true });
    const before = s.runCheck(addDays(day, -1)).length, on = s.runCheck(day).length, again = s.runCheck(day).length;
    add(`${id}: เตือนวันที่ ${day} (ก่อนหน้า ${before} · วันนั้น ${on} · ตรวจซ้ำ ${again})`, before === 0 && on === 1 && again === 0, 'due = วันจัด − ล่วงหน้า, ไม่ซ้ำ');
  }
  const d = createStore({ demo: true }); d.follow(syn('X', '2027-01-20', 14), '2026-12-01', { reminder: true }); d.runCheck('2027-01-06');
  const id0 = d.list('2027-01-06')[0].id; const unread1 = d.unread('2027-01-06').length; d.markRead(id0);
  add('Read / Unread', unread1 === 1 && d.unread('2027-01-06').length === 0, 'อ่านแล้วไม่นับเป็นยังไม่อ่าน');
  d.unfollow('X'); add('Follow / Unfollow', d.list('2027-01-06').length === 0 && d.status('X', '2027-01-06').user === 'NOT_FOLLOWED', 'เลิกติดตามล้างแจ้งเตือนของกิจกรรมนั้น');
  const r = createStore({ demo: true }); r.follow(syn('Y', '2027-01-20', 14), '2027-01-08', { reminder: true });
  add('ไม่เตือนย้อนหลัง', r.runCheck('2027-01-08').length === 0, 'ติดตามหลังวันเตือน จึงไม่เตือน');
  const k = createStore({ demo: false }); k.follow(real('A', 'DATE_UNVERIFIED'), '2027-09-01', { reminder: true }); k.follow(real('B', 'NO_COMPUTABLE_DATE'), '2027-09-01', { reminder: true });
  const a1 = k.runCheck('2027-09-28').length, a2 = k.runCheck('2027-09-28', { policy: POLICY.ALERT_WITH_LABEL });
  add('สิทธิ์เตือนตามสถานะปฏิทิน', a1 === 0 && a2.length === 1 && a2[0].label === 'SCHEDULE_UNCONFIRMED', 'จริง+ยังไม่ยืนยัน: ก = ไม่เตือน, ข = เตือนพร้อมป้าย, ไม่มีวันที่ = ไม่เตือน');
  const sy = createStore({ demo: false }); sy.follow(syn('S', '2027-01-10', 1), '2026-12-01', { reminder: true });
  add('กิจกรรมจำลองไม่เตือนนอกโหมดสาธิต', sy.runCheck('2027-01-09', { policy: POLICY.ALERT_WITH_LABEL }).length === 0, 'กันข้อมูลจำลองปนข้อมูลจริง');
  const raw = JSON.stringify(createStore({ demo: true }).state);
  add('ไม่เก็บวันเกิด', !/birth|dob/i.test(raw), 'schema: local_user_id, follows, notifications');
  return checks;
}

/* ------------------------------------------------------------------ I: reminder simulation (isolated virtual clock + store) */
export function reminderSimulation(T) {
  const R = T.event_ranking, pool = [...R.eligible.map((r) => snapNetwork(r)), ...(R.simulation_events || []).map(snapDirect)];
  const byId = Object.fromEntries(pool.map((s) => [s.event_id, s]));
  const TESTS = [['สอบ 20 ม.ค. 2570 · เตือน 14 วัน', 'SYN_EV_025', 14], ['ความรัก 14 ม.ค. 2570 · เตือน 7 วัน', 'SYN_EV_013', 7], ['คอนเสิร์ต 10 ม.ค. 2570 · เตือน 1 วัน', 'SYN_EV_001', 1]];
  const sim = { store: createStore({ demo: true }), event: pool.find((s) => s.event_id === 'SYN_EV_025') ? 'SYN_EV_025' : (pool[0] && pool[0].event_id), date: '2026-12-01', offset: 14, policy: POLICY.INFO_ONLY, reminder: false, log: [], last: [] };
  const out = h('div', { class: 'stack' });
  const snap = () => byId[sim.event];
  const followed = () => sim.store.isFollowed(sim.event);
  const draw = () => {
    const s = snap(), st = sim.store;
    if (!s) { clear(out).append(h('div', { class: 'callout warn' }, 'ไม่มีกิจกรรมให้จำลอง')); return; }
    const rule = alertRule(s, { policy: sim.policy, demo: true });
    const f0 = st.state.follows[sim.event], off = f0 ? f0.notify_days_before : sim.offset;
    const due = classify(s.schedule, sim.date), nextOcc = due.next_start;
    const status = st.status(sim.event, sim.date, { policy: sim.policy });
    const list = st.list(sim.date).filter((n) => n.event_id === sim.event);
    const sel = (label, el) => h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), el);
    clear(out).append(
      h('div', { class: 'grid g2' },
        sel('① โปรไฟล์', h('div', { class: 'small muted' }, 'ใช้โปรไฟล์ด้านบน (' + T.profile.wish_names.join(', ') + ')')),
        sel('② กิจกรรม', h('select', { onchange: (e) => { sim.event = e.target.value; draw(); } }, h('optgroup', { label: 'จากเครือข่าย (ข้อมูลจริง)' }, R.eligible.map((r) => h('option', { value: r.event_id, selected: r.event_id === sim.event }, r.event_name))),
          h('optgroup', { label: 'กิจกรรมจำลอง (ใช้ทดสอบเตือน)' }, (R.simulation_events || []).map((r) => h('option', { value: r.event_id, selected: r.event_id === sim.event }, `${r.event_name} · ${r.event_date} · เตือน ${r.notify_days_before} วัน`))))),
        sel('③ สถานะติดตาม', h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn sm' + (followed() ? ' primary' : ''), onclick: () => { followed() ? st.unfollow(sim.event) : st.follow(s, sim.date, { reminder: sim.reminder, offset: sim.offset }); draw(); } }, followed() ? '✓ ติดตามอยู่ (กดเพื่อเลิก)' : '＋ ติดตาม'))),
        sel('④ เปิดเตือน', h('input', { type: 'checkbox', checked: f0 ? f0.reminder_enabled : sim.reminder, disabled: !followed(), onchange: (e) => { sim.reminder = e.target.checked; st.setReminder(sim.event, e.target.checked, off, sim.date); draw(); } })),
        sel('⑤ เตือนล่วงหน้า (วัน)', h('select', { onchange: (e) => { sim.offset = Number(e.target.value); if (followed()) st.setReminder(sim.event, f0.reminder_enabled, sim.offset, sim.date); draw(); } }, OFFSETS.map((o) => h('option', { value: o, selected: o === off }, o)))),
        sel('⑥ วันที่จำลอง', h('div', { class: 'row' }, h('input', { type: 'date', value: sim.date, onchange: (e) => { if (isIso(e.target.value)) { sim.date = e.target.value; draw(); } } }), h('button', { type: 'button', class: 'btn sm', onclick: () => { sim.date = addDays(sim.date, -1); draw(); } }, '−1'), h('button', { type: 'button', class: 'btn sm', onclick: () => { sim.date = addDays(sim.date, 1); draw(); } }, '+1'))),
        sel('⑦ นโยบายกิจกรรมจริง', h('div', { class: 'small muted' }, 'ผู้เชี่ยวชาญกำหนดแล้ว: กิจกรรมจริงที่ยังไม่ยืนยันกำหนดการ = ข้อมูลเท่านั้น ไม่เตือน'))),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn primary', onclick: () => { const c = st.runCheck(sim.date, { policy: sim.policy }); sim.log.push({ date: sim.date, created: c.length, unread: st.unread(sim.date).length }); sim.last = c; draw(); } }, '⑧ Run Reminder Check'),
        h('button', { type: 'button', class: 'btn', disabled: !st.unread(sim.date).length, onclick: () => { st.markAllRead(); draw(); } }, '⑨ ทำเครื่องหมายว่าอ่านแล้ว'),
        h('button', { type: 'button', class: 'btn', onclick: () => { st.clear(); sim.log = []; sim.last = []; draw(); } }, '⑩ รีเซ็ตการจำลอง')),
      h('div', { class: 'row small' }, h('b', {}, '⑪ ชุดทดสอบ: '), TESTS.map(([t, id, o]) => h('button', { type: 'button', class: 'btn sm', disabled: !byId[id], onclick: () => { st.clear(); sim.log = []; sim.last = []; sim.event = id; sim.offset = o; sim.reminder = true; sim.date = '2026-12-01'; st.follow(byId[id], sim.date, { reminder: true, offset: o }); sim.date = addDays(byId[id].schedule.occurrences[0].start, -o - 1); draw(); } }, t))),
      h('div', { class: 'card flat stack' },
        h('div', { class: 'row' }, h('span', { class: 'chip' }, 'ผู้ใช้: ' + status.user), status.time ? h('span', { class: 'chip' }, 'เวลา: ' + status.time) : null, status.notice ? h('span', { class: 'chip' }, 'แจ้งเตือน: ' + status.notice) : null,
          !rule.ok ? h('span', { class: 'chip st-cand' }, 'ถูกบล็อก: ' + rule.why) : rule.label === 'SCHEDULE_UNCONFIRMED' ? h('span', { class: 'chip st-cand' }, 'เตือนได้พร้อมป้าย "กำหนดการยังไม่ยืนยัน"') : h('span', { class: 'chip ok' }, 'เตือนได้')),
        h('div', { class: 'small' }, nextOcc ? `วันจัดถัดไป ${thaiRange(nextOcc, due.next_end)} · วันเตือน = ${thaiDate(addDays(nextOcc, -off))} (ตี 00:00 เวลา Asia/Bangkok) · วันที่จำลอง ${thaiDate(sim.date)}` : 'ไม่มีรอบจัดที่กำลังจะมาถึง'),
        h('div', { class: 'small muted' }, `ครบกำหนดตอนนี้: ${f0 ? dueOccurrences(s.schedule, sim.date, off, f0.followed_on).length : 0} รอบ · ผลตรวจล่าสุด: ใหม่ ${sim.last.length} รายการ${sim.log.length && !sim.last.length ? ' (ซ้ำ/ไม่ถึงกำหนด จึงไม่สร้างซ้ำ)' : ''}`),
        list.length ? list.map((n) => h('div', { class: 'path' }, `🔔 ${s.name} · จัด ${thaiRange(n.occurrence_start, n.occurrence_end)} · ${n.read_status === 'READ' ? 'อ่านแล้ว' : n.expired ? 'หมดเวลา' : 'ยังไม่อ่าน'} · key ${n.id.split('|').slice(1).join('|')}`)) : h('div', { class: 'small faint' }, 'ยังไม่มีแจ้งเตือนของกิจกรรมนี้'),
        sim.log.length ? h('table', {}, h('thead', {}, h('tr', {}, ['รอบตรวจ', 'วันที่จำลอง', 'สร้างใหม่', 'ยังไม่อ่านรวม'].map((t) => h('th', {}, t)))), h('tbody', {}, sim.log.map((l, i) => h('tr', {}, h('td', {}, i + 1), h('td', {}, thaiDate(l.date)), h('td', { class: 'n' }, l.created), h('td', { class: 'n' }, l.unread))))) : null));
  };
  draw();
  return step('I', 'Reminder Simulation (นาฬิกาจำลอง · แยกจากข้อมูลจริง)', h('p', { class: 'small muted', style: 'margin:0' }, 'ใช้ตรรกะเดียวกับ Tab 1 (calendar.js / notify.js) แต่ข้อมูลอยู่ในหน่วยความจำของส่วนนี้เท่านั้น ไม่แตะรายการติดตามจริง'), out);
}
