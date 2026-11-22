// Tab 2 · event recommendation trace + reminder simulation (Lab steps H and I). Uses the same calendar.js / notify.js as Tab 1.
import { h, clear, f } from './util.js';
import { displayLayer, bangkokToday, isIso } from './calendar.js';
const SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const thaiDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${SHORT[m - 1]} ${y + 543}`; };
const thaiRange = (a, b) => (a === b ? thaiDate(a) : `${thaiDate(a)} – ${thaiDate(b)}`);

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
      R.eligible.length ? h('div', { class: 'scroll-x' }, h('table', { class: 'ev-table' }, h('thead', {}, h('tr', {}, ['network', 'display', 'กิจกรรม', 'เทพ', 'สถานที่', 'รวม', 'เสมอ', 'วันที่ (Layer B)', 'สถานะวันที่ / กำหนดการ', 'เส้นทางที่ใช้'].map((t, i) => h('th', { class: i === 3 || i === 4 || i === 5 || i === 6 ? 'n' : '' }, t)))),
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
