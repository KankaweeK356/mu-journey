// Final improvement round: pure display functions (Node).  node --test tests/js/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { userNote, userSourceName, userVerification, userCaution, userLimitedReason, stationText, accessText, legLines, birthText, BIRTH_STATUS_TH, UNSOURCED } from '../../public/js/usertext.js';

const rows = JSON.parse(readFileSync(new URL('../../model/ritual_claims.json', import.meta.url), 'utf-8')).rows;
const INTERNAL = /ในไฟล์|ในรายงาน|จากรายงานโครงการ|แหล่งที่ค้น|จากการค้น|Top_Deities|search gap|general Hindu practice|needs_verification|single_source|multi_source/;

test('no ritual row shows internal team wording on the user page', () => {
  for (const r of rows) {
    const shown = `${userNote(r[3])} ${userSourceName(r[4])} ${userVerification(r[6])}`;
    assert.doesNotMatch(shown, INTERNAL, `${r[0]} ${r[2]}: ${shown}`);
  }
});

test('hiding internal wording keeps the unverified warning and leaves other notes unchanged', () => {
  const internal = rows.filter((r) => userNote(r[3]) !== r[3]);
  assert.ok(internal.length >= 4);
  for (const r of internal.filter((x) => !x[3].startsWith('(จากรายงานโครงการ)'))) assert.match(userNote(r[3]), new RegExp(UNSOURCED), r[3]);
  for (const r of rows.filter((x) => !/ในไฟล์|ในรายงาน|จากรายงานโครงการ|แหล่งที่ค้น|จากการค้น/.test(x[3]))) assert.equal(userNote(r[3]), r[3]);
});

test('a report from a user is still marked unverified', () => {
  assert.match(userVerification('user_report_unverified'), /ยังไม่ยืนยัน/);
  assert.match(userVerification('something_new'), /รอตรวจสอบ/);
});

test('cautions are translated, never dropped', () => {
  assert.match(userCaution('Synthetic assumed window; never display as real hours'), /จำลอง/);
  assert.match(userCaution('CONFLICT in sources; review before real visits'), /ไม่ตรงกัน/);
  assert.match(userCaution('Candidate; verify shrine entry windows'), /รอตรวจสอบ/);
  assert.match(userCaution('a new english caution'), /รอตรวจสอบ/);
  assert.equal(userCaution(null), null);
  assert.doesNotMatch(userLimitedReason('No more source-backed permissible paths'), /[A-Za-z]/);
});

test('missing station or access time is said plainly, never printed as null or filled in', () => {
  assert.equal(accessText(null), 'ยังไม่มีข้อมูลเวลาเข้าถึงสถานที่');
  assert.equal(stationText(null, undefined, null), 'ยังไม่มีข้อมูลสถานีรถไฟฟ้า');
  assert.equal(stationText(null, 'BTS', 'E1'), 'สถานี BTS E1');
  assert.match(accessText(8), /8 นาที/);
  for (const t of [accessText(undefined), ...legLines({ from: 'A', to: 'B', rail_min_est: null, access_walk_min_est: null, boarding_wait_assumption_min: 0, systems: [] }, 'walk')]) assert.doesNotMatch(t, /null|undefined|NaN/);
});

test('a leg shows rail time and access time separately', () => {
  const lines = legLines({ from: 'E1', to: 'S2', from_name: 'ชิดลม', to_name: 'ศาลาแดง', systems: ['BTS'], rail_min_est: 7.7, access_walk_min_est: 12, boarding_wait_assumption_min: 5 }, 'walk');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /BTS.*7\.7 นาที.*5 นาที \(ค่าสมมติ\)/);
  assert.match(lines[1], /เข้าถึงสถานที่ \(เดิน\) ประมาณ 12 นาที/);
  assert.match(legLines({ from: 'BL29', to: 'BL29', systems: ['MRT'], rail_min_est: 0, access_walk_min_est: 7, boarding_wait_assumption_min: 0 }, 'skywalk')[0], /ไม่ต้องนั่งรถไฟฟ้า/);
});

test('birth sentence for each status', () => {
  const base = { weekday: 'วันพุธ', deities: [], claim_ids: [], excluded: [] };
  assert.match(birthText({ ...base, status: 'NO_ELIGIBLE_DATA' }), /เกิดวันพุธ — เวอร์ชันนี้ยังไม่มีข้อมูลความเชื่อประจำวันพุธที่ผ่านเกณฑ์/);
  assert.match(birthText({ ...base, weekday: null, status: 'NOT_PROVIDED' }), /ไม่ได้ระบุวันเกิด/);
  assert.match(birthText({ ...base, weekday: 'วันศุกร์', status: 'APPLIED', deities: [{ name: 'พระแม่ลักษมี' }] }), /พระแม่ลักษมี.*สัญญาณรอง.*อาจเปลี่ยนหรือไม่เปลี่ยน/);
  const ex = birthText({ ...base, weekday: 'วันจันทร์', status: 'EXCLUDED', excluded: [{ name: 'พระแม่อุมา', by_deity_choice: false, by_groups: ['ฮินดู'] }] });
  assert.match(ex, /พระแม่อุมา \(กลุ่มความเชื่อ "ฮินดู"\)/);
  assert.deepEqual(Object.keys(BIRTH_STATUS_TH), ['NOT_PROVIDED', 'APPLIED', 'NO_ELIGIBLE_DATA', 'EXCLUDED']);
});
