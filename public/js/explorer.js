// Tab 2 · 01 Network Explorer — structure of the Wish → Deity → Place graph, filters, node details, insights.
import { h, clear, put, f, statusChip, getJSON } from './util.js';
import { mountGraph, graphLegend, hue } from './graphview.js';
import { degreeByType, degreeRankings, communityVerdict, randomGraphRows } from './netstats.js';

const kpi = (ic, val, lab, foot) => h('div', { class: 'card kpi' }, h('div', { class: 'ic' }, ic), h('div', {}, h('div', { class: 'val' }, val), h('div', { class: 'lab' }, lab), foot ? h('div', { class: 'small faint' }, foot) : null));

export function renderExplorer(p, { graph, results, names }) {
  const g = results.graph_eda;
  p.append(h('div', { class: 'page-h' }, h('div', { class: 'ic' }, '🕸️'), h('div', {}, h('h2', {}, '01 Network Explorer'), h('p', {}, 'สำรวจ Knowledge Graph (Wish → Deity → Place) วิเคราะห์โครงสร้างเครือข่าย และค้นพบ Insight ที่ใช้ในการตัดสินใจ'))));
  p.append(h('div', { class: 'grid g5' }, kpi('🔵', g.nodes, 'Nodes', `Wish ${g.by_type.wish} · Deity ${g.by_type.deity} · Place ${g.by_type.place}`), kpi('🔗', g.edges, 'Edges', `เรื่อง–เทพ ${g.edge_types.wish_deity} · เทพ–สถานที่ ${g.edge_types.deity_place}`),
    kpi('🧩', g.components, 'Components', `โหนดโดดเดี่ยว ${g.isolates}`), kpi('👥', g.communities, 'Communities', `modularity ${f(g.modularity, 4)}`), kpi('📈', f(g.density_full, 5), 'Density', 'ทั้งกราฟ (ต่างชนิดกัน)')));

  /* filters + graph + node detail */
  const types = new Set(['W', 'D', 'P']);
  const degrees = degreeByType(graph);
  const typedDegree = Object.fromEntries(degrees.map((d) => [d.id, d.type === 'D' ? [['เชื่อมกับเรื่องที่ขอ (Wish)', d.wishes], ['เชื่อมกับสถานที่ (Place)', d.places]] : [['เชื่อมกับสิ่งศักดิ์สิทธิ์ (Deity)', d.deities]]]));
  const info = h('div', { class: 'stack small', 'aria-live': 'polite' }, h('p', { class: 'muted' }, 'เลือกโหนดในกราฟเพื่อดูรายละเอียด'));
  const holder = h('div');
  const showInfo = (n) => {
    clear(info);
    if (!n) { info.append(h('p', { class: 'muted' }, 'เลือกโหนดในกราฟเพื่อดูรายละเอียด')); return; }
    const nbrs = graph.edges.filter((e) => e.s === n.id || e.t === n.id);
    const typeTh = { W: 'Wish (เรื่องที่ขอ)', D: 'Deity (สิ่งศักดิ์สิทธิ์)', P: 'Place (สถานที่)' }[n.type];
    const paths = [];
    if (n.type === 'P') nbrs.forEach((e) => graph.edges.filter((x) => x.t === e.s).forEach((x) => paths.push([names[x.s], names[e.s], n.label])));
    if (n.type === 'D') nbrs.filter((e) => e.t === n.id).forEach((a) => nbrs.filter((e) => e.s === n.id).slice(0, 1).forEach((b) => paths.push([names[a.s], n.label, names[b.t]])));
    if (n.type === 'W') nbrs.slice(0, 4).forEach((e) => graph.edges.filter((x) => x.s === e.t).slice(0, 1).forEach((x) => paths.push([n.label, names[e.t], names[x.t]])));
    const statuses = ['SOURCE', 'CANDIDATE', 'UNVERIFIED'].filter((c) => nbrs.some((e) => e.status === c));
    put(info, h('div', {}, h('h4', {}, n.label), h('div', { class: 'row', style: 'margin-top:4px' }, h('span', { class: 'chip' }, typeTh), h('span', { class: 'chip' }, n.id), n.tradition ? h('span', { class: 'chip pink' }, n.tradition) : null)),
      h('div', {}, h('b', {}, 'ข้อมูลเครือข่าย'), h('table', {}, h('tbody', {}, [...typedDegree[n.id].map(([label, value]) => [label, value]), ['Betweenness Centrality', f(n.betweenness, 4)], ['Closeness Centrality', f(n.closeness, 4)], ['Community (หมายเลขกลุ่ม)', `${n.community + 1} (${graph.communities[n.community].size} โหนด)`]].map(([a, b]) => h('tr', {}, h('td', {}, a), h('td', { class: 'n' }, b)))))),
      paths.length ? h('div', {}, h('b', {}, 'ความสัมพันธ์ (ตัวอย่าง)'), paths.slice(0, 4).map((x) => h('div', { class: 'path' }, x.join(' → ')))) : null,
      n.degree === 0 ? h('div', { class: 'callout warn' }, 'Data gap: ยังไม่มีความสัมพันธ์ในฐานข้อมูล ระบบจึงไม่แนะนำสถานที่นี้') : h('div', { class: 'callout small' }, h('div', {}, 'สถานะของเส้นความสัมพันธ์ที่เชื่อมกับโหนดนี้'), h('div', { class: 'row', style: 'margin-top:4px' }, statuses.map((c) => statusChip(c)))),
      n.hours_status ? h('div', {}, statusChip(n.hours_status, 'เวลาเปิด')) : null);
  };
  const view = mountGraph(holder, graph, { onSelect: showInfo });
  const refresh = (patch) => view.setFilter(patch);
  const typeBox = ['W', 'D', 'P'].map((t) => h('label', { class: 'cb' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { e.target.checked ? types.add(t) : types.delete(t); refresh({ types: new Set(types) }); } }), { W: 'Wish (เรื่องที่สนใจ)', D: 'Deity (สิ่งศักดิ์สิทธิ์)', P: 'Place (สถานที่)' }[t]));
  const wishSel = h('select', { 'aria-label': 'เลือกเรื่องที่สนใจ', onchange: (e) => refresh({ wish: e.target.value || null }) }, h('option', { value: '' }, `ทั้งหมด (${g.by_type.wish} เรื่อง)`), graph.nodes.filter((n) => n.type === 'W').map((n) => h('option', { value: n.id }, n.label)));
  const comSel = h('select', { 'aria-label': 'เลือก community', onchange: (e) => refresh({ community: e.target.value === '' ? null : Number(e.target.value) }) }, h('option', { value: '' }, `ทั้งหมด (${g.communities} กลุ่ม)`), graph.communities.filter((c) => c.size > 1).map((c) => h('option', { value: c.index }, `Community ${c.index + 1} (${c.size} โหนด)`)));
  const labels = h('input', { type: 'checkbox', checked: true, onchange: (e) => refresh({ labels: e.target.checked }) });
  const conn = h('input', { type: 'checkbox', onchange: (e) => refresh({ connectedOnly: e.target.checked }) });
  const reset = () => { types.clear(); ['W', 'D', 'P'].forEach((t) => types.add(t)); typeBox.forEach((l) => { l.querySelector('input').checked = true; }); wishSel.value = ''; comSel.value = ''; labels.checked = true; conn.checked = false; refresh({ types: new Set(types), wish: null, community: null, labels: true, connectedOnly: false }); };
  const mode = h('div', { class: 'seg', role: 'group', 'aria-label': 'สีโหนด' }, [['type', 'สีตามประเภท'], ['community', 'สีตาม Community']].map(([m, t], i) => h('button', { type: 'button', 'aria-pressed': String(i === 0), onclick: (e) => { view.setMode(m); mode.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } }, t)));

  p.append(h('div', { class: 'explorer', style: 'margin-top:14px' },
    h('div', { class: 'card filters' }, h('h3', {}, 'ตัวกรองเครือข่าย'), h('div', { class: 'fl' }, 'ประเภทโหนด (Node Type)'), typeBox, h('div', { class: 'fl' }, 'เลือกเรื่องที่สนใจ (Wish)'), wishSel, h('div', { class: 'fl' }, 'เลือก Community'), comSel,
      h('label', { class: 'cb', style: 'margin-top:10px' }, labels, 'แสดงชื่อโหนด'), h('label', { class: 'cb' }, conn, 'แสดงเฉพาะที่มีเส้นเชื่อม'), h('button', { type: 'button', class: 'btn sm primary', style: 'margin-top:12px;width:100%', onclick: reset }, '↻ รีเซ็ตกราฟ')),
    h('div', { class: 'stack' }, h('div', { class: 'row' }, mode, h('span', { class: 'small muted' }, 'ชี้หรือแตะโหนดเพื่อดูเพื่อนบ้าน')), holder, graphLegend()),
    h('div', { class: 'card' }, h('h3', {}, 'รายละเอียดโหนดที่เลือก'), h('div', { style: 'margin-top:10px' }, info))));

  /* degree: one ranking per question, node types are never mixed in one list */
  const rankTable = (r) => h('div', { class: 'card', 'data-degree': r.key }, h('h4', {}, r.title), h('table', { style: 'margin-top:8px' }, h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, r.nodeHead), h('th', { class: 'n' }, r.valueHead))),
    h('tbody', {}, r.rows.map((x, i) => h('tr', {}, h('td', {}, i + 1), h('td', {}, x.label), h('td', { class: 'n' }, x.value))))),
    r.moreTied ? h('div', { class: 'small faint' }, `ยังมีอีก ${r.moreTied} โหนดที่ได้ค่าเท่าอันดับสุดท้าย (เรียงตามชื่อ)`) : null);
  p.append(h('h3', { style: 'margin:18px 0 8px' }, 'Degree แยกตามประเภทโหนด'), h('div', { class: 'grid g2' }, degreeRankings(degrees).map(rankTable)),
    h('p', { class: 'small faint' }, 'Degree คือจำนวนความสัมพันธ์ที่บันทึกในฐานข้อมูล ไม่ใช่ความนิยม ความศักดิ์สิทธิ์ หรือผลของการขอพร'));

  /* communities, random-graph comparison and insights: from scripts/network_analysis.py (read-only analysis) */
  const evidence = h('div', { class: 'stack', style: 'margin-top:14px', 'data-community-evidence': 'true' }, h('div', { class: 'spinner' }));
  p.append(evidence);
  getJSON('/data/network_analysis.json').then((A) => put(clear(evidence), ...communityCards(A))).catch((err) => clear(evidence).append(h('div', { class: 'callout bad' }, 'โหลดผลวิเคราะห์ Community ไม่สำเร็จ: ' + err.message)));

  function communityCards(A) {
    const groups = A.communities.filter((c) => c.size > 1), singles = A.communities.length - groups.length;
    const verdict = communityVerdict(A);
    const hubs = degreeRankings(degrees).map((r) => `${r.title}: ${r.rows[0].label} (${r.rows[0].value})`);
    return [
      h('div', { class: 'card stack' }, h('h3', {}, 'Community คืออะไร และเชื่อได้แค่ไหน'),
        h('p', { class: 'small', style: 'margin:0' }, 'Community คือกลุ่มโหนดที่มีเส้นเชื่อมกันภายในกลุ่มมากกว่าที่เชื่อมออกนอกกลุ่ม คำนวณด้วยวิธี Greedy Modularity จากโครงสร้างกราฟเท่านั้น หมายเลขกลุ่มไม่ได้บอกความหมาย ไม่ใช่กลุ่มผู้ใช้ และไม่ใช่ทริป ระบบแนะนำสถานที่ไม่ได้ใช้ Community ในการให้คะแนน'),
        h('div', { class: 'callout ' + (verdict.pass ? 'ok' : 'warn') + ' small', 'data-verdict': verdict.pass ? 'pass' : 'fail' }, verdict.text),
        h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['Community', 'โหนด', 'เรื่อง / เทพ / สถานที่', 'เรื่องที่ขอในกลุ่ม', 'เส้นใน / เส้นออกนอกกลุ่ม', 'ความคงที่ต่ำสุดของสมาชิก', 'การเรียกชื่อ'].map((t) => h('th', {}, t)))),
          h('tbody', {}, groups.map((c) => h('tr', { 'data-community': String(c.number) }, h('td', {}, h('i', { style: `display:inline-block;width:10px;height:10px;border-radius:50%;background:${hue(c.index)};margin-right:6px` }), c.number),
            h('td', { class: 'n' }, c.size), h('td', { class: 'n' }, `${c.types.W} / ${c.types.D} / ${c.types.P}`), h('td', { class: 'small' }, c.wishes.join(', ') || 'ไม่มี'),
            h('td', { class: 'n' }, `${c.internal_edges.total} / ${c.external_edges.total}`),
            h('td', { class: 'small' }, `${f(c.stability.min_confidence, 2)}${c.stability.members_below_threshold.length ? ` (ต่ำกว่า 0.80 จำนวน ${c.stability.members_below_threshold.length} โหนด)` : ' (ผ่าน 0.80 ทุกโหนด)'}`),
            h('td', { class: 'small' }, c.named ? c.name : 'ใช้หมายเลขกลุ่ม')))))),
        h('div', { class: 'small faint' }, `อีก ${singles} กลุ่มมีโหนดเดียว (โหนดที่ยังไม่มีเส้นเชื่อม) · ความคงที่: รัน Louvain ${A.criteria.stability_runs} ครั้งด้วย Random Seed ต่างกัน แล้ววัดสัดส่วนรอบที่โหนดยังอยู่กลุ่มเดียวกับเพื่อนในกลุ่ม · เกณฑ์ ${A.criteria.stable_confidence_at_least} เป็นเกณฑ์ที่ใช้ในรายวิชา ไม่ใช่ความแม่นยำ`)),
      h('div', { class: 'card stack' }, h('h3', {}, `กราฟจริงเทียบกับกราฟสุ่ม ${A.criteria.null_copies.toLocaleString('en-US')} ชุด`),
        h('div', { class: 'scroll-x' }, h('table', { 'data-null-table': 'true' }, h('thead', {}, h('tr', {}, ['ค่าที่เทียบ', 'กราฟจริง', 'กราฟสุ่ม (เฉลี่ย)', 'ช่วง 95% ของกราฟสุ่ม', 'สุ่มได้ ≥ กราฟจริง'].map((t, i) => h('th', { class: i ? 'n' : '' }, t)))),
          h('tbody', {}, randomGraphRows(A).map((r) => h('tr', {}, h('td', {}, r.label), h('td', { class: 'n' }, r.observed), h('td', { class: 'n' }, r.mean), h('td', { class: 'n' }, r.range), h('td', { class: 'n' }, r.atLeast)))))),
        h('div', { class: 'small faint' }, 'กราฟสุ่มสลับปลายเส้นภายในความสัมพันธ์ชนิดเดียวกัน (เรื่อง–เทพ และ เทพ–สถานที่) ทุกโหนดจึงมีจำนวนเส้นเท่าเดิม และไม่เกิดความสัมพันธ์ชนิดใหม่ ผลนี้เป็นการวิเคราะห์โครงสร้างของข้อมูลชุดนี้เท่านั้น')),
      h('div', { class: 'card' }, h('h3', {}, 'สรุปที่ข้อมูลรองรับ (ร่าง รอเจ้าของงานยืนยัน)'), h('ul', { class: 'insights', style: 'margin-top:8px' },
        ...hubs.map((t) => h('li', {}, t)),
        h('li', {}, `มี ${g.components} Components กลุ่มใหญ่สุด ${g.component_sizes[0]} จาก ${g.nodes} โหนด`),
        h('li', {}, `ช่องว่างข้อมูล: สถานที่ ${g.isolated_place_ids.length} แห่งยังไม่มีเส้นเชื่อม เรื่อง–เทพ–สถานที่ จึงไม่ถูกแนะนำ`),
        h('li', {}, 'Hub ไม่เท่ากับความนิยม และ Community ไม่เท่ากับทริป'))),
    ];
  }
}
