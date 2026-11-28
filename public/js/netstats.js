// Pure functions for the Network Explorer (no DOM). Degree is always read per node type and per relation.
export function degreeByType(graph) {
  const type = Object.fromEntries(graph.nodes.map((n) => [n.id, n.type]));
  const count = Object.fromEntries(graph.nodes.map((n) => [n.id, { W: 0, D: 0, P: 0 }]));
  for (const e of graph.edges) { count[e.s][type[e.t]] += 1; count[e.t][type[e.s]] += 1; }
  return graph.nodes.map((n) => ({ id: n.id, type: n.type, label: n.label, wishes: count[n.id].W, deities: count[n.id].D, places: count[n.id].P }));
}

const RANKINGS = [
  { key: 'wish-deity', type: 'W', field: 'deities', title: 'เรื่องที่ขอ: จำนวนเทพที่เชื่อมถึง', nodeHead: 'เรื่องที่ขอ', valueHead: 'จำนวนเทพ' },
  { key: 'place-deity', type: 'P', field: 'deities', title: 'สถานที่: จำนวนเทพที่เชื่อมถึง', nodeHead: 'สถานที่', valueHead: 'จำนวนเทพ' },
  { key: 'deity-wish', type: 'D', field: 'wishes', title: 'เทพ: จำนวนเรื่องที่ขอที่เชื่อมถึง', nodeHead: 'สิ่งศักดิ์สิทธิ์', valueHead: 'จำนวนเรื่อง' },
  { key: 'deity-place', type: 'D', field: 'places', title: 'เทพ: จำนวนสถานที่ที่เชื่อมถึง', nodeHead: 'สิ่งศักดิ์สิทธิ์', valueHead: 'จำนวนสถานที่' },
];
/** Top `k` per question; ties are ordered by name and the number left out with the same value is reported. */
export function degreeRankings(degrees, k = 5) {
  return RANKINGS.map((r) => {
    const all = degrees.filter((d) => d.type === r.type).map((d) => ({ id: d.id, label: d.label, value: d[r.field] }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'th'));
    const rows = all.slice(0, k);
    const moreTied = rows.length ? all.slice(k).filter((x) => x.value === rows[rows.length - 1].value).length : 0;
    return { ...r, rows, moreTied };
  });
}

/** One summary line per question. A shared first place names every node that has it, never just the first by name. */
const COUNT_WORDS = { 'wish-deity': ['เรื่อง', 'องค์'], 'place-deity': ['แห่ง', 'องค์'], 'deity-wish': ['องค์', 'เรื่อง'], 'deity-place': ['องค์', 'แห่ง'] };
export function degreeLeaders(degrees) {
  return degreeRankings(degrees, degrees.length).map((r) => {
    const value = r.rows[0].value, names = r.rows.filter((x) => x.value === value).map((x) => x.label), [item, unit] = COUNT_WORDS[r.key];
    return `${r.title}: ${names.join(', ')} (${names.length > 1 ? `${item}ละ ${value} ${unit} เสมอกัน ${names.length} ${item}` : value})`;
  });
}

const fix = (x, d) => Number(x).toFixed(d);
export function communityVerdict(A) {
  const m = A.null_model.metrics, a = m.modularity_greedy, b = m.modularity_louvain_best10, pass = A.null_model.modularity_above_chance;
  const named = A.communities.filter((c) => c.named).length;
  const numbers = `Greedy Modularity: กราฟสุ่ม ${a.copies_ge_observed} จาก ${a.copies} ชุดได้ค่าไม่น้อยกว่ากราฟจริง · Louvain (ดีที่สุดจาก ${A.criteria.louvain_runs_per_graph} รอบ): ${b.copies_ge_observed} จาก ${b.copies} ชุด · เกณฑ์ผ่านคือไม่เกิน ${Math.round(A.criteria.chance_limit_p * 100)} ใน 100`;
  return {
    pass,
    text: pass ? `การแบ่งกลุ่มชัดกว่าที่สุ่มได้ตามเกณฑ์ (${numbers}) · ตั้งชื่อแล้ว ${named} กลุ่มที่คงที่ครบทุกโหนด`
      : `ยังสรุปไม่ได้ว่าการแบ่งกลุ่มนี้ต่างจากความบังเอิญ (${numbers}) จึงไม่ตั้งชื่อกลุ่ม แสดงเป็นหมายเลขพร้อมส่วนประกอบของกลุ่ม`,
  };
}

const ROWS = [['components', 'จำนวน Components', 1], ['largest_component', 'ขนาด Component ใหญ่สุด (โหนด)', 1],
  ['modularity_greedy', 'Modularity (Greedy ที่หน้าเว็บใช้)', 3], ['modularity_louvain_best10', 'Modularity (Louvain ดีที่สุดจาก 10 รอบ)', 3]];
export function randomGraphRows(A) {
  return ROWS.map(([key, label, d]) => {
    const m = A.null_model.metrics[key], int = d === 1;
    return { key, label, observed: int ? String(m.observed) : fix(m.observed, 3), mean: fix(m.null_mean, d),
      range: `${int ? m.null_p2_5 : fix(m.null_p2_5, 3)} – ${int ? m.null_p97_5 : fix(m.null_p97_5, 3)}`, atLeast: `${m.copies_ge_observed} / ${m.copies}` };
  });
}
