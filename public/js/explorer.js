// Tab 2 · 01 Network Explorer — structure of the Wish → Deity → Place graph, filters, node details, insights.
import { h, clear, f, statusChip } from './util.js';
import { s } from './icons.js';
import { mountGraph, graphLegend, hue } from './graphview.js';

const kpi = (ic, val, lab, foot) => h('div', { class: 'card kpi' }, h('div', { class: 'ic' }, ic), h('div', {}, h('div', { class: 'val' }, val), h('div', { class: 'lab' }, lab), foot ? h('div', { class: 'small faint' }, foot) : null));

function donut(parts, total) {
  const R = 40, C = 2 * Math.PI * R;
  let off = 0;
  const svg = s('svg', { viewBox: '0 0 100 100', role: 'img', 'aria-label': 'สัดส่วนโหนดในแต่ละชุมชน' }, s('circle', { cx: 50, cy: 50, r: R, fill: 'none', stroke: '#f1ecfb', 'stroke-width': 16 }));
  parts.forEach((p) => {
    const len = (p.size / total) * C;
    svg.append(s('circle', { cx: 50, cy: 50, r: R, fill: 'none', stroke: p.color, 'stroke-width': 16, 'stroke-dasharray': `${len} ${C - len}`, 'stroke-dashoffset': -off, transform: 'rotate(-90 50 50)' }));
    off += len;
  });
  svg.append(s('text', { x: 50, y: 55, 'text-anchor': 'middle', style: 'font-size:18px;font-weight:700;fill:#512b86' }, String(parts.filter((x) => !x.other).length >= 0 ? total : '')));
  return svg;
}

export function renderExplorer(p, { graph, results, names }) {
  const g = results.graph_eda;
  p.append(h('div', { class: 'page-h' }, h('div', { class: 'ic' }, '🕸️'), h('div', {}, h('h2', {}, '01 Network Explorer'), h('p', {}, 'สำรวจ Knowledge Graph (Wish → Deity → Place) วิเคราะห์โครงสร้างเครือข่าย และค้นพบ Insight ที่ใช้ในการตัดสินใจ'))));
  p.append(h('div', { class: 'grid g5' }, kpi('🔵', g.nodes, 'Nodes', `Wish ${g.by_type.wish} · Deity ${g.by_type.deity} · Place ${g.by_type.place}`), kpi('🔗', g.edges, 'Edges', `เรื่อง–เทพ ${g.edge_types.wish_deity} · เทพ–สถานที่ ${g.edge_types.deity_place}`),
    kpi('🧩', g.components, 'Components', `โหนดโดดเดี่ยว ${g.isolates}`), kpi('👥', g.communities, 'Communities', `modularity ${f(g.modularity, 4)}`), kpi('📈', f(g.density_full, 5), 'Density', 'ทั้งกราฟ (ต่างชนิดกัน)')));

  /* filters + graph + node detail */
  const types = new Set(['W', 'D', 'P']);
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
    const hasSource = nbrs.some((e) => e.status === 'SOURCE');
    info.append(h('div', {}, h('h4', {}, n.label), h('div', { class: 'row', style: 'margin-top:4px' }, h('span', { class: 'chip' }, typeTh), h('span', { class: 'chip' }, n.id), n.tradition ? h('span', { class: 'chip pink' }, n.tradition) : null)),
      h('div', {}, h('b', {}, 'ข้อมูลเครือข่าย'), h('table', {}, h('tbody', {}, [['Degree (จำนวนความเชื่อมโยง)', n.degree], ['Betweenness Centrality', f(n.betweenness, 4)], ['Closeness Centrality', f(n.closeness, 4)], ['Community', `${n.community + 1} (${graph.communities[n.community].size} โหนด)`]].map(([a, b]) => h('tr', {}, h('td', {}, a), h('td', { class: 'n' }, b)))))),
      paths.length ? h('div', {}, h('b', {}, 'ความสัมพันธ์ (ตัวอย่าง)'), paths.slice(0, 4).map((x) => h('div', { class: 'path' }, x.join(' → ')))) : null,
      n.degree === 0 ? h('div', { class: 'callout warn' }, 'Data gap: ยังไม่มีความสัมพันธ์ในฐานข้อมูล ระบบจึงไม่แนะนำสถานที่นี้') : h('div', { class: 'callout ok' }, 'Data QA: มีความสัมพันธ์ในฐานข้อมูล ', hasSource ? statusChip('SOURCE') : statusChip(n.type === 'W' ? 'UNVERIFIED' : 'CANDIDATE')),
      n.hours_status ? h('div', {}, statusChip(n.hours_status, 'เวลาเปิด')) : null);
  };
  const view = mountGraph(holder, graph, { onSelect: showInfo });
  const refresh = (patch) => view.setFilter(patch);
  const typeBox = ['W', 'D', 'P'].map((t) => h('label', { class: 'cb' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { e.target.checked ? types.add(t) : types.delete(t); refresh({ types: new Set(types) }); } }), { W: 'Wish (เรื่องที่สนใจ)', D: 'Deity (สิ่งศักดิ์สิทธิ์)', P: 'Place (สถานที่)' }[t]));
  const wishSel = h('select', { 'aria-label': 'เลือกเรื่องที่สนใจ', onchange: (e) => refresh({ wish: e.target.value || null }) }, h('option', { value: '' }, `ทั้งหมด (${g.by_type.wish} เรื่อง)`), graph.nodes.filter((n) => n.type === 'W').map((n) => h('option', { value: n.id }, n.label)));
  const comSel = h('select', { 'aria-label': 'เลือก community', onchange: (e) => refresh({ community: e.target.value === '' ? null : Number(e.target.value) }) }, h('option', { value: '' }, `ทั้งหมด (${g.communities} กลุ่ม)`), graph.communities.filter((c) => c.size > 1).map((c) => h('option', { value: c.index }, `ชุมชน ${c.index + 1} (${c.size} โหนด)`)));
  const labels = h('input', { type: 'checkbox', checked: true, onchange: (e) => refresh({ labels: e.target.checked }) });
  const conn = h('input', { type: 'checkbox', onchange: (e) => refresh({ connectedOnly: e.target.checked }) });
  const reset = () => { types.clear(); ['W', 'D', 'P'].forEach((t) => types.add(t)); typeBox.forEach((l) => { l.querySelector('input').checked = true; }); wishSel.value = ''; comSel.value = ''; labels.checked = true; conn.checked = false; refresh({ types: new Set(types), wish: null, community: null, labels: true, connectedOnly: false }); };
  const mode = h('div', { class: 'seg', role: 'group', 'aria-label': 'สีโหนด' }, [['type', 'สีตามประเภท'], ['community', 'สีตามชุมชน']].map(([m, t], i) => h('button', { type: 'button', 'aria-pressed': String(i === 0), onclick: (e) => { view.setMode(m); mode.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } }, t)));

  p.append(h('div', { class: 'explorer', style: 'margin-top:14px' },
    h('div', { class: 'card filters' }, h('h3', {}, 'ตัวกรองเครือข่าย'), h('div', { class: 'fl' }, 'ประเภทโหนด (Node Type)'), typeBox, h('div', { class: 'fl' }, 'เลือกเรื่องที่สนใจ (Wish)'), wishSel, h('div', { class: 'fl' }, 'เลือก Community'), comSel,
      h('label', { class: 'cb', style: 'margin-top:10px' }, labels, 'แสดงชื่อโหนด'), h('label', { class: 'cb' }, conn, 'แสดงเฉพาะที่มีเส้นเชื่อม'), h('button', { type: 'button', class: 'btn sm primary', style: 'margin-top:12px;width:100%', onclick: reset }, '↻ รีเซ็ตกราฟ')),
    h('div', { class: 'stack' }, h('div', { class: 'row' }, mode, h('span', { class: 'small muted' }, 'ชี้หรือแตะโหนดเพื่อดูเพื่อนบ้าน')), holder, graphLegend()),
    h('div', { class: 'card' }, h('h3', {}, 'รายละเอียดโหนดที่เลือก'), h('div', { style: 'margin-top:10px' }, info))));

  /* bottom row: degree table, communities, insights */
  const topDeg = [...graph.nodes].sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label, 'th')).slice(0, 5);
  const comm = graph.communities.map((c) => ({ ...c, color: hue(c.index) }));
  const top = comm.slice(0, 5), rest = comm.slice(5).reduce((a, c) => a + c.size, 0);
  const parts = [...top, { size: rest, color: '#c9c1d8', other: true, index: -1 }];
  const total = graph.nodes.length;
  const ex = (c) => graph.nodes.filter((n) => n.community === c.index);
  p.append(h('div', { class: 'grid g3', style: 'margin-top:14px' },
    h('div', { class: 'card' }, h('h3', {}, 'Node ที่มีความเชื่อมโยงสูง (Degree)'), h('table', { style: 'margin-top:8px' }, h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'โหนด'), h('th', {}, 'ประเภท'), h('th', { class: 'n' }, 'Degree'))),
      h('tbody', {}, topDeg.map((n, i) => h('tr', {}, h('td', {}, i + 1), h('td', {}, n.label), h('td', {}, h('span', { class: 'chip' }, { W: 'Wish', D: 'Deity', P: 'Place' }[n.type])), h('td', { class: 'n' }, n.degree)))))),
    h('div', { class: 'card' }, h('h3', {}, 'Community (กลุ่มความสัมพันธ์)'), h('div', { class: 'donut', style: 'margin-top:8px' }, donut(parts, total),
      h('ul', {}, parts.map((c) => h('li', {}, h('i', { style: `background:${c.color}` }), c.other ? `อื่น ๆ (${graph.communities.length - 5} กลุ่ม)` : `ชุมชน ${c.index + 1}: ${ex(c).filter((n) => n.type === 'W').map((n) => n.label).join(', ') || ex(c)[0].label}`, h('span', { class: 'faint' }, ` ${((c.size / total) * 100).toFixed(1)}%`)))))),
    h('div', { class: 'card' }, h('h3', {}, 'สรุป Insight ที่สำคัญ'), h('ul', { class: 'insights', style: 'margin-top:8px' },
      h('li', {}, `Hub สำคัญ: ${topDeg.slice(0, 3).map((n) => `${n.label} (${n.degree})`).join(', ')}`),
      h('li', {}, `เครือข่ายแบ่งเป็น ${g.communities} Communities (modularity = ${f(g.modularity, 4)})`),
      h('li', {}, `มี ${g.components} Components โดยส่วนใหญ่เป็นโครงข่ายหลัก ${g.component_sizes[0]} โหนด`),
      h('li', {}, `Density = ${f(g.density_full, 5)} แสดงว่าเครือข่ายค่อนข้างกระจายตัว`),
      h('li', {}, `Data gap: มีสถานที่ ${g.isolated_place_ids.length} แห่งที่ยังไม่มีเส้นเชื่อม Wish–Deity–Place`),
      h('li', {}, 'Hub ไม่เท่ากับความนิยม และ Community ไม่เท่ากับทริป')))));
}
