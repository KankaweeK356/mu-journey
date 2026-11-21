// Checks that Tab 1 (/api/mumu/recommendations) and Tab 2 (/api/trace) agree for one profile.
export const PERSONAS = [
  { id: 'A', name: 'Case A · ผู้ใช้ทั่วไป', note: 'ความรัก + การงาน + การเงิน ไม่มีข้อจำกัด', profile: { wish_ids: ['W01', 'W02', 'W03'], birthdate: '2000-03-12', exclusions: { tradition_groups: [], deity_ids: [], place_ids: [] } } },
  { id: 'B', name: 'Case B · มีข้อจำกัด', note: 'ความรัก ไม่เอากลุ่มความเชื่อฮินดู', profile: { wish_ids: ['W01'], birthdate: '2000-03-12', exclusions: { tradition_groups: ['ฮินดู'], deity_ids: [], place_ids: [] } } },
  { id: 'C', name: 'Case C · ไม่มีทริปผ่านเงื่อนไข', note: 'บัตรคอน/กิจกรรมติ่ง ไม่เอาฮินดู', profile: { wish_ids: ['W05'], birthdate: '2000-03-12', exclusions: { tradition_groups: ['ฮินดู'], deity_ids: [], place_ids: [] } } },
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pathKey = (z) => `${z.wish_id}>${z.deity_id}`;

/** rec = response of recommendations (Tab 1), tr = response of trace (Tab 2). Returns [{label, ok, detail}]. */
export function compare(rec, tr) {
  const ids1 = rec.top5.map((p) => p.place_id), ids2 = tr.step5_result.top5;
  const paths = ids1.every((id) => {
    const a = rec.top5.find((p) => p.place_id === id).paths.map(pathKey).sort();
    const b = (tr.step5_result.paths[id] || []).map(pathKey).sort();
    return same(a, b);
  });
  const t1 = (rec.trip.matched || {}).trip_id || rec.trip.decision, t2 = (tr.trip_matching.result.matched_trip || {}).trip_id || tr.trip_matching.result.decision;
  const blockedD = new Set(tr.profile.blocked_deity_ids), blockedP = new Set(tr.profile.blocked_place_ids);
  const violation = rec.top5.some((p) => blockedP.has(p.place_id) || p.paths.some((z) => blockedD.has(z.deity_id)));
  const v1 = rec.versions || {}, v2 = tr.versions || {};
  return [
    { label: 'Top 5 ตรงกัน (ลำดับเดียวกัน)', ok: same(ids1, ids2), detail: ids1.join(', ') || '(ว่าง)' },
    { label: 'Evidence paths ตรงกัน', ok: paths, detail: `${rec.top5.reduce((n, p) => n + p.paths.length, 0)} เส้นทาง` },
    { label: 'ทริป Top 1 ตรงกัน', ok: t1 === t2, detail: t1 },
    { label: 'ไม่ละเมิดข้อจำกัด', ok: !violation, detail: `${blockedD.size} สิ่งศักดิ์สิทธิ์ / ${blockedP.size} สถานที่ถูกตัด` },
    { label: 'Model และ Data Snapshot Version ตรงกัน', ok: same(v1, v2) && !!v1.model && !!v1.snapshot_sha256, detail: `${v1.model || '?'} · snapshot ${v1.snapshot_sha256 || '?'}` },
    { label: 'Trace ตรงกับ Reference Model', ok: tr.step5_result.matches_reference === true, detail: 'matches_reference' },
    (() => { // event ranking (EVENT_RANKING_V1): the same events, order and scores in both tabs
      const e1 = (rec.events || {}).eligible || [], e2 = (tr.event_ranking || {}).eligible || [];
      const ok = e1.length === e2.length && e1.every((r, i) => r.event_id === e2[i].event_id && r.event_score === e2[i].event_score);
      return { label: 'อันดับกิจกรรม (EVENT_RANKING_V1) ตรงกัน', ok, detail: `${e1.length} กิจกรรม` };
    })(),
  ];
}
