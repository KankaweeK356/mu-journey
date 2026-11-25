// Display layer for the user pages (Tab 1): turns internal data-QA wording into plain Thai.
// The source data files are NOT edited. Warnings about simulated, unverified or conflicting information are always kept.
// Pure functions (no DOM), tested in tests/js/usertext.test.mjs.

const INTERNAL = /ในไฟล์|ในรายงาน|จากรายงานโครงการ|แหล่งที่ค้น|จากการค้น/;
export const UNSOURCED = 'ข้อมูลบางรายการยังไม่มีแหล่งยืนยัน';

/** A ritual / place note: parts that talk about the team's own files or searches become one plain warning. */
export function userNote(detail) {
  const text = String(detail || '').replace(/^\(จากรายงานโครงการ\)\s*/, '');
  if (!INTERNAL.test(text)) return text;
  const parts = text.split(/\s+—\s+|;\s*/).map((p) => (INTERNAL.test(p) ? UNSOURCED : p));
  return parts.filter((p, i) => parts.indexOf(p) === i).join(' — ');
}

const SOURCE_NAME = { '(general Hindu practice)': 'หลักปฏิบัติทั่วไป (ไม่ใช่ประกาศของสถานที่นี้)', '(search gap)': 'ยังไม่มีแหล่งอ้างอิง', 'Mu-Ticket report': 'รายงานจากผู้ใช้' };
export const userSourceName = (s) => SOURCE_NAME[s] || s || 'ยังไม่มีแหล่งอ้างอิง';

const VERIFICATION = {
  multi_source: 'พบในหลายแหล่ง', single_source: 'พบจากแหล่งเดียว', needs_verification: 'รอตรวจสอบ',
  user_report_unverified: 'รายงานจากผู้ใช้ ยังไม่ยืนยัน', conflicting: 'แหล่งข้อมูลขัดกัน',
};
export const userVerification = (v) => VERIFICATION[v] || 'รอตรวจสอบ';

const CAUTION = {
  'Candidate; verify shrine entry windows': 'เวลาเปิด-ปิดยังรอตรวจสอบ ควรตรวจกับสถานที่ก่อนเดินทาง',
  'Synthetic assumed window; never display as real hours': 'เวลาเปิด-ปิดที่แสดงเป็นข้อมูลจำลอง ไม่ใช่เวลาจริง ควรตรวจกับสถานที่ก่อนเดินทาง',
  'CONFLICT in sources; review before real visits': 'แหล่งข้อมูลระบุเวลาไม่ตรงกัน ควรตรวจกับสถานที่ก่อนเดินทาง',
};
/** A caution we do not know is still a warning: never drop it silently. */
export const userCaution = (c) => (!c ? null : CAUTION[c] || 'ข้อมูลสถานที่นี้ยังรอตรวจสอบ ควรตรวจกับสถานที่ก่อนเดินทาง');

const LIMITED = { 'No more source-backed permissible paths': 'ไม่มีเส้นทางในฐานข้อมูลที่ผ่านเงื่อนไขเพิ่มเติม' };
export const userLimitedReason = (r) => LIMITED[r] || 'ไม่มีเส้นทางในฐานข้อมูลที่ผ่านเงื่อนไขเพิ่มเติม';

/* ------------------------------------------------------------------ transit: only values that exist in the data, never filled in */
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
export const stationText = (name, system, id, lead = 'สถานี') => (name || id ? `${lead} ${system ? system + ' ' : ''}${name || id}` : 'ยังไม่มีข้อมูลสถานีรถไฟฟ้า');
/** Access time (station → place) is separate from rail travel time. */
export const accessText = (min) => (num(min) == null ? 'ยังไม่มีข้อมูลเวลาเข้าถึงสถานที่' : `เข้าถึงสถานที่จากสถานีประมาณ ${num(min)} นาที (ประมาณการ)`);
/** One stored trip leg -> lines of text: rail part and access part, each with its own stored time. */
export function legLines(leg, accessMode) {
  if (!leg) return [];
  const sys = leg.systems && leg.systems.length ? leg.systems.join(' + ') : 'รถไฟฟ้า';
  const rail = num(leg.rail_min_est), walk = num(leg.access_walk_min_est), wait = num(leg.boarding_wait_assumption_min);
  const out = [];
  if (leg.from === leg.to) out.push(`🚆 ไม่ต้องนั่งรถไฟฟ้า (อยู่ที่สถานี ${sys} ${leg.to_name || leg.to})`);
  else out.push(`🚆 ${sys}: ${leg.from_name || leg.from} → ${leg.to_name || leg.to}${rail == null ? ' · ยังไม่มีข้อมูลเวลา' : ` · เวลาเดินทางประมาณ ${rail} นาที`}${wait ? ` + รอรถ ${wait} นาที (ค่าสมมติ)` : ''}`);
  if (walk != null) out.push(`🚶 เข้าถึงสถานที่ (${accessMode === 'skywalk' ? 'Skywalk' : 'เดิน'}) ประมาณ ${walk} นาที`);
  return out;
}

/* ------------------------------------------------------------------ birth weekday: say what really happened to it */
/** signal = birth_signal from the server. The weekday already starts with "วัน". */
export function birthText(signal) {
  if (!signal) return '';
  const { status, weekday } = signal;
  if (status === 'NOT_PROVIDED') return 'ไม่ได้ระบุวันเกิด ระบบแนะนำจากความสนใจที่คุณเลือก';
  if (status === 'APPLIED') return `เกิด${weekday} — ใช้ความเชื่อประจำ${weekday} (${signal.deities.map((d) => d.name).join(', ')}) เป็นสัญญาณรองน้ำหนักน้อย ความสนใจที่คุณเลือกยังเป็นหลัก อันดับอาจเปลี่ยนหรือไม่เปลี่ยนก็ได้`;
  if (status === 'EXCLUDED') {
    const why = signal.excluded.map((d) => `${d.name} (${[d.by_deity_choice ? 'คุณเลือกไม่ต้องการ' : null, ...d.by_groups.map((g) => `กลุ่มความเชื่อ "${g}"`)].filter(Boolean).join(', ')})`).join(' · ');
    return `เกิด${weekday} — สิ่งศักดิ์สิทธิ์ที่เกี่ยวกับ${weekday}ถูกตัดออกตามข้อจำกัดของคุณ: ${why} จึงไม่ใช้สัญญาณวันเกิด`;
  }
  return `เกิด${weekday} — เวอร์ชันนี้ยังไม่มีข้อมูลความเชื่อประจำ${weekday}ที่ผ่านเกณฑ์ ระบบจึงแนะนำจากความสนใจที่คุณเลือกเป็นหลัก`;
}
export const BIRTH_STATUS_TH = {
  NOT_PROVIDED: 'ไม่ได้ระบุวันเกิด', APPLIED: 'ใช้สัญญาณวันเกิด', NO_ELIGIBLE_DATA: 'ไม่มีข้อมูลที่ผ่านเกณฑ์สำหรับวันนี้', EXCLUDED: 'ถูกตัดด้วยข้อจำกัดของผู้ใช้',
};
