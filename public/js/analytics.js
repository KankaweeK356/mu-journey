// Tab 2 — Network Analytics for the examiner: how the trips were built, the graph, the structure,
// a live "ask the graph" explainer, trip matching, evaluation (incl. what lost) and data gaps.
import { h, clear, getJSON, postJSON, f, pct, statusChip, STATUS, TRIP_TH, bar, makeTabs, labelMap, MONTHS_TH } from './util.js';
import { mountGraph, graphLegend } from './graphview.js';

const TRIPS = ['TRIP_LOVE', 'TRIP_CAREER', 'TRIP_WEALTH'];
const kpi = (lab, val, foot) => h('div', { class: 'card kpi' }, h('div', { class: 'lab' }, lab), h('div', { class: 'val' }, val), foot ? h('div', { class: 'foot' }, foot) : null);
const head = (t, p) => h('div', { class: 'lede' }, h('h2', {}, t), p ? h('p', {}, p) : null);
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`;

export async function renderAnalytics(root) {
  let graph, results, design, cat;
  try {
    [graph, results, design, cat] = await Promise.all([getJSON('/data/graph.json'), getJSON('/data/results.json'), getJSON('/data/trips_design.json'), getJSON('/api/catalog')]);
  } catch (e) { root.append(h('div', { class: 'callout bad' }, 'โหลดข้อมูลวิเคราะห์ไม่สำเร็จ: ' + e.message)); return; }
  const ctx = { graph, results, design, cat, names: labelMap(graph), trace: null, onTrace: [] };
  const tabs = makeTabs([
    { n: '1', label: 'ทริปสร้างจากอะไร', render: (p) => tOrigin(p, ctx) },
    { n: '2', label: 'Knowledge Graph', render: (p) => tGraph(p, ctx) },
    { n: '3', label: 'โครงสร้างเครือข่าย', render: (p) => tStructure(p, ctx) },
    { n: '4', label: 'ลองถาม: คำนวณทีละขั้น', render: (p) => tAsk(p, ctx) },
    { n: '5', label: 'จับคู่ทริปให้ผู้ใช้', render: (p) => tMatch(p, ctx) },
    { n: '6', label: 'ผลทดสอบ (รวมที่แพ้)', render: (p) => tEval(p, ctx) },
    { n: '7', label: 'ช่องว่างข้อมูลและข้อจำกัด', render: (p) => tGaps(p, ctx) },
  ], { sub: true, label: 'หัวข้อ Network Analytics' });
  root.append(h('div', { class: 'lede' }, h('h2', {}, 'Network Analytics: ตอบได้อย่างมีหลักการว่าทำไมแนะนำสิ่งนี้'),
    h('p', {}, `โมเดล ${results.version} · ข้อมูลทั้งหมดมาจาก Drive Baseline v2 · ตัวเลขทุกตัวมาจากโมเดลต้นฉบับ ไม่ได้คำนวณใหม่ในหน้าเว็บ`)), tabs.root);
  tabs.root.start();
}

/* ============================================================ 1. where do the trips come from */
async function tOrigin(p, { design, results }) {
  const bc = design.business_constraints, ow = design.objective_weights, tg = design.transit_graph;
  p.append(head('ทริปของเราสร้างมาจากอะไร',
    'ทริป 3 รายการถูกออกแบบ "ล่วงหน้า" (Offline) ด้วยเครือข่าย 3 ชั้นซ้อนกัน แล้วล็อกเป็นสินค้า เมื่อผู้ใช้เข้าแอป ระบบแค่จับคู่ ไม่คำนวณเส้นทางใหม่'));
  p.append(h('div', { class: 'flow' },
    h('div', {}, h('h4', {}, 'ความเกี่ยวข้องในเครือข่าย'), h('p', {}, 'ให้น้ำหนักเรื่องที่ขอของแต่ละธีม แล้วรัน Personalized PageRank บนกราฟ Wish → เทพ → สถานที่ ได้ผู้สมัครสูงสุด 15 แห่งต่อธีม')),
    h('div', {}, h('h4', {}, 'เส้นทางสั้นที่สุดบนรถไฟฟ้า'), h('p', {}, `กราฟ BTS/MRT ${tg.eligible_BTS_MRT_stations} สถานี ${tg.rail_edges} เส้นทาง บวกเดิน/Skywalk ใช้ Dijkstra หาเวลาเดินทาง สถานที่ที่เข้าถึงได้ ${tg.eligible_places_with_rail_walk_access} แห่ง ตัดออก ${tg.excluded_places.length} แห่ง`)),
    h('div', {}, h('h4', {}, 'ค้นหาเส้นทางที่ดีที่สุด'), h('p', {}, `ลองทุกลำดับของ ${bc.stops} จุดแวะในกลุ่มผู้สมัคร ภายใต้ข้อจำกัดเวลา คัดทริปที่ผ่านแล้วให้คะแนนด้วย 4 ปัจจัย`)),
    h('div', {}, h('h4', {}, 'เลือก 3 ทริปที่ไม่ซ้ำกัน แล้วล็อก'), h('p', {}, `ประเมินชุดทริปที่ไม่ซ้ำสถานที่ ${design.portfolio_evaluated_combinations.toLocaleString('en-US')} ชุด เลือกที่ดีที่สุด เก็บไว้ในไฟล์ที่ล็อกแล้ว ผู้ใช้ไม่ทำให้เส้นทางเปลี่ยน`))));

  p.append(h('div', { class: 'grid g2', style: 'margin-top:18px' },
    h('div', { class: 'card' }, h('h3', {}, 'ข้อจำกัดของทริป'), h('div', { class: 'sub' }, 'ค่าที่ล็อกไว้ในขั้นออกแบบ'),
      h('table', {}, h('tbody', {}, [
        ['จุดนัดพบ/เวลาเริ่ม', `BTS สยาม ${hhmm(bc.start_min)} (สมมติ)`], ['จุดแวะ', bc.stops + ' จุด'], ['เวลารวมสูงสุด', bc.max_total_minutes + ' นาที'],
        ['เวลาในแต่ละจุด', `${bc.site_dwell_min} นาที + บัฟเฟอร์กลุ่ม ${bc.on_site_group_buffer_min} นาที`], ['บรีฟกลุ่ม / พักกลางวัน', `${bc.group_briefing_min} / ${bc.midday_break_min} นาที`],
        ['การเดินทาง', bc.allowed_station_systems.join(' + ') + ' + เดิน/Skywalk'], ['ห้ามใช้', 'รถเมล์ เรือ แท็กซี่ วินมอเตอร์ไซค์ SRT ARL']].map(([a, b]) => h('tr', {}, h('td', {}, a), h('td', {}, b)))))),
    h('div', { class: 'card' }, h('h3', {}, 'คะแนนของทริป (Objective)'), h('div', { class: 'sub' }, 'ใช้เลือกลำดับจุดแวะในขั้นที่ 3'),
      [['PPR เฉลี่ยของจุดแวะ', ow.ppr_mean], ['ครอบคลุมเรื่องที่ขอของธีม', ow.theme_wish_coverage], ['ประสิทธิภาพการเดินทาง', ow.journey_efficiency], ['ความหลากหลายของสิ่งศักดิ์สิทธิ์', ow.deity_diversity]].map(([t, v]) =>
        h('div', { style: 'margin-bottom:8px' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('span', {}, t), h('b', { class: 'mono' }, v.toFixed(2))), bar(v, 0.5, 'gold'))))));

  p.append(h('div', { class: 'card', style: 'margin-top:14px' }, h('h3', {}, 'การค้นหาในแต่ละธีม'), h('div', { class: 'sub' }, 'ตัวเลขจากไฟล์ออกแบบ offline_signature_trip_v1.json'),
    h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['ธีม', 'น้ำหนักเรื่องที่ขอ', 'ผู้สมัคร', 'ลำดับที่ตรวจ', 'ลำดับที่ผ่านเงื่อนไข', 'ชุดสถานที่ไม่ซ้ำ'].map((t, i) => h('th', { class: i > 1 ? 'n' : '' }, t)))),
      h('tbody', {}, design.per_theme_search.map((t) => h('tr', {}, h('td', {}, TRIP_TH[t.trip_id], h('div', { class: 'small faint' }, t.theme)),
        h('td', { class: 'small' }, Object.entries(t.wish_weights).map(([w, v]) => `${w} ${v}`).join(' · ')),
        h('td', { class: 'n' }, t.candidate_places), h('td', { class: 'n' }, t.permutations_checked.toLocaleString('en-US')), h('td', { class: 'n' }, t.feasible_permutations.toLocaleString('en-US')), h('td', { class: 'n' }, t.unique_feasible_sets))))))));

  const box = h('div', { class: 'grid g3', style: 'margin-top:14px' }, h('p', { class: 'muted' }, 'กำลังโหลดทริป…'));
  p.append(h('h3', { style: 'margin:18px 0 8px' }, 'ผลลัพธ์: 3 ทริปที่ล็อกไว้'), box);
  try {
    const trips = await Promise.all(TRIPS.map((id) => getJSON('/api/trips/' + id)));
    clear(box).append(...trips.map((T) => h('article', { class: 'card stack' },
      h('div', {}, h('h3', {}, TRIP_TH[T.trip_id]), h('div', { class: 'small muted' }, T.title + ' · ' + Object.entries(T.theme_weight_names).map(([k, v]) => `${k} ${v}`).join(' + '))),
      h('ol', { class: 'timeline' }, T.stops.map((s) => h('li', {}, h('div', { class: 't' }, `${s.arrival}–${s.finish} · ${s.station_id}`), h('div', {}, s.name), h('div', { class: 'small muted' }, s.featured_deity)))),
      h('div', { class: 'small' }, `จบประมาณ ${T.finish_clock} · รวม ${Math.round(T.duration_min)} นาที (รถไฟ ${Math.round(T.rail_min)} + เดิน ${Math.round(T.walk_min)} + รอ ${Math.round(T.train_wait_min)})`),
      h('div', { class: 'row' }, h('span', { class: 'chip' }, 'คะแนน ' + f(T.metrics.objective_score, 1)), h('span', { class: 'chip' }, 'PPR เฉลี่ย ' + f(T.metrics.ppr_mean_norm, 2)), h('span', { class: 'chip' }, 'ครอบคลุม ' + pct(T.metrics.wish_coverage_weighted, 0))),
      h('div', { class: 'small faint' }, 'คุณภาพเวลาเปิด: ' + T.hours_quality))));
  } catch (e) { clear(box).append(h('div', { class: 'callout bad' }, e.message)); }

  p.append(h('div', { class: 'grid g2', style: 'margin-top:14px' },
    h('div', { class: 'card' }, h('h3', {}, 'ระยะเวลาของทริป'), h('img', { src: '/figures/03_fixed_trip_duration.png', alt: 'กราฟระยะเวลาของ 3 ทริปคงที่ แยกเป็นรถไฟ เดิน รอ และเวลาที่จุดแวะ', style: 'width:100%;height:auto;border-radius:8px' })),
    h('div', { class: 'card' }, h('h3', {}, 'อ่านอย่างระวัง'), h('ul', { class: 'small', style: 'margin:0;padding-left:18px' }, design.limitations.map((t) => h('li', {}, t))))));
}

/* ============================================================ 2. knowledge graph */
function tGraph(p, { graph, names }) {
  p.append(head('Knowledge Graph: เรื่องที่ขอ → สิ่งศักดิ์สิทธิ์ → สถานที่', `${graph.nodes.length} โหนด ${graph.edges.length} เส้นเชื่อม — เอาเมาส์ไปชี้หรือกดที่โหนดเพื่อดูเพื่อนบ้าน เส้นเชื่อมแต่ละเส้นมีสถานะข้อมูลของตัวเอง`));
  const info = h('div', { class: 'card small', 'aria-live': 'polite' }, 'เลือกโหนดเพื่อดูรายละเอียด');
  const holder = h('div');
  const view = mountGraph(holder, graph, { onSelect: (n) => {
    clear(info);
    if (!n) { info.append('เลือกโหนดเพื่อดูรายละเอียด'); return; }
    const nb = graph.edges.filter((e) => e.s === n.id || e.t === n.id).map((e) => (e.s === n.id ? e.t : e.s));
    info.append(h('b', {}, n.label), ` (${{ W: 'เรื่องที่ขอ', D: 'สิ่งศักดิ์สิทธิ์', P: 'สถานที่' }[n.type]}${n.tradition ? ' · ' + n.tradition : ''}) · degree ${n.degree} · betweenness ${f(n.betweenness, 4)} · closeness ${f(n.closeness, 4)} · ชุมชน ${n.community + 1}`,
      h('div', { class: 'row', style: 'margin-top:6px' }, nb.length ? nb.map((x) => h('span', { class: 'chip' }, names[x])) : h('span', { class: 'chip st-unv' }, 'ไม่มีเส้นเชื่อม — เป็นช่องว่างข้อมูล')));
  } });
  const seg = h('div', { class: 'row' }, h('span', { class: 'small muted' }, 'สีโหนด:'),
    ...[['type', 'ตามประเภท'], ['community', 'ตามชุมชน (community)']].map(([m, t], i) => h('button', { type: 'button', class: 'pill', 'aria-pressed': String(i === 0), onclick: (e) => { view.setMode(m); seg.querySelectorAll('.pill').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } }, t)));
  p.append(h('div', { class: 'stack' }, seg, info, holder, graphLegend(),
    h('div', { class: 'callout small' }, `สถานที่ ${graph.isolated_places.length} แห่งไม่มีเส้นเชื่อมกับสิ่งศักดิ์สิทธิ์เลย (อยู่ท้ายคอลัมน์สถานที่) ระบบจึงไม่แนะนำที่เหล่านี้ และไม่เพิ่มเส้นเชื่อมด้วยการเดา`)));
}

/* ============================================================ 3. structure */
function tStructure(p, { results, graph, names }) {
  const g = results.graph_eda;
  p.append(head('โครงสร้างเครือข่าย: อะไรสำคัญ และอ่านผลอย่างไร', 'วิเคราะห์ด้วย degree, betweenness, closeness, components และ community — แต่ไม่ตีความจำนวนเส้นเชื่อมว่าเป็นความนิยมจริง'));
  p.append(h('div', { class: 'grid g4' },
    kpi('โหนด / เส้นเชื่อม', `${g.nodes} / ${g.edges}`, `เรื่องที่ขอ ${g.by_type.wish} · สิ่งศักดิ์สิทธิ์ ${g.by_type.deity} · สถานที่ ${g.by_type.place}`),
    kpi('Density ทั้งกราฟ', f(g.density_full, 4), `เรื่อง–เทพ ${f(g.density_wish_deity, 3)} · เทพ–สถานที่ ${f(g.density_deity_place, 3)}`),
    kpi('Components', g.components, `โหนดโดดเดี่ยว ${g.isolates} (สถานที่ ${g.isolated_place_ids.length})`),
    kpi('Communities', g.communities, `modularity ${f(g.modularity, 4)}`)));
  const hubs = (title, list, key, note) => h('div', { class: 'card' }, h('h3', {}, title), h('div', { class: 'sub' }, note),
    h('table', {}, h('tbody', {}, list.slice(0, 6).map((x) => h('tr', {}, h('td', {}, x.name, h('div', { class: 'small faint' }, { W: 'เรื่องที่ขอ', D: 'สิ่งศักดิ์สิทธิ์', P: 'สถานที่' }[x.type])), h('td', { class: 'n' }, key === 'degree' ? x.degree : f(x[key], 4)))))));
  p.append(h('div', { class: 'grid g3', style: 'margin-top:14px' },
    hubs('Degree สูงสุด', g.degree_hubs, 'degree', 'โหนดที่มีเส้นเชื่อมมากที่สุด'),
    hubs('Betweenness สูงสุด', g.betweenness_hubs, 'betweenness', 'จุดเชื่อมระหว่างกลุ่ม ถ้าหายไปกราฟขาดง่าย'),
    hubs('Closeness สูงสุด', g.closeness_hubs, 'closeness', 'โหนดที่ใกล้โหนดอื่นโดยเฉลี่ย')));
  p.append(h('div', { class: 'card', style: 'margin-top:14px' }, h('h3', {}, 'ชุมชนที่ใหญ่ที่สุด 8 ชุมชน'), h('div', { class: 'sub' }, 'ใช้ greedy modularity'),
    h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', { class: 'n' }, 'โหนด'), h('th', {}, 'เรื่องที่ขอในชุมชน'), h('th', {}, 'ตัวอย่างสถานที่'))),
      h('tbody', {}, g.largest_community_summaries.map((c) => h('tr', {}, h('td', { class: 'n' }, c.node_count), h('td', {}, c.wishes.join(', ') || '—'), h('td', { class: 'small' }, c.example_places.join(' · ') || '—'))))))));
  p.append(h('div', { class: 'grid g2', style: 'margin-top:14px' },
    h('div', { class: 'callout' }, h('b', {}, 'Hub ไม่เท่ากับความนิยม. '), 'degree สูงอาจแปลว่าแหล่งข้อมูลหรือการสกัดข้อมูลครอบคลุมโหนดนั้นมาก ระบบจึงใช้ความเกี่ยวข้องผ่านเส้นทางจริง (PPR) ร่วมกับการอธิบายเส้นทาง ไม่ใช้ degree เป็นอันดับความนิยม'),
    h('div', { class: 'callout' }, h('b', {}, 'Community ไม่เท่ากับทริป. '), 'ชุมชนบอกกลุ่มความสัมพันธ์ในกราฟ แต่ทริปต้องผ่านเงื่อนไขรถไฟฟ้า เวลาเปิด และข้อจำกัดของบริษัทด้วย 25 ชุมชนจึงไม่ใช่ 25 กลุ่มลูกค้า'),
    h('div', { class: 'callout' }, h('b', {}, 'Density ต้องอ่านตามชนิดของกราฟ. '), g.analysis_caveat),
    h('div', { class: 'callout warn' }, h('b', {}, 'สถานที่ที่ไม่มีเส้นเชื่อม: '), g.isolated_place_ids.map((id) => names['P:' + id] || id).slice(0, 5).join(', '), ` และอีก ${Math.max(0, g.isolated_place_ids.length - 5)} แห่ง — ดูรายการเต็มที่แท็บ 7`)));
}

/* ============================================================ 4. ask the graph */
function tAsk(p, ctx) {
  const { cat } = ctx;
  const S = { wishes: ['W01'], groups: new Set(), deities: new Set(), day: '', month: '', year: '' };
  const out = h('div', { class: 'stack' }, h('div', { class: 'callout' }, 'เลือกเรื่องที่อยากมู แล้วกด "คำนวณและอธิบาย" — ทุกตัวเลขในขั้นถัดไปมาจากโมเดลต้นฉบับ'));
  const wishBox = h('div', { class: 'chips' });
  const drawWishes = () => { clear(wishBox); cat.wishes.forEach((w) => { const on = S.wishes.includes(w.id); wishBox.append(h('button', { type: 'button', class: 'pill', 'aria-pressed': String(on), disabled: !on && S.wishes.length >= 3, onclick: () => { S.wishes = on ? S.wishes.filter((x) => x !== w.id) : [...S.wishes, w.id]; drawWishes(); } }, w.label)); }); };
  drawWishes();
  const grp = cat.tradition_groups.map((g) => h('label', {}, h('input', { type: 'checkbox', checked: S.groups.has(g), onchange: (e) => { e.target.checked ? S.groups.add(g) : S.groups.delete(g); } }), g));
  const dl = h('div', { class: 'checklist' }, cat.deities.map((d) => h('label', {}, h('input', { type: 'checkbox', checked: S.deities.has(d.id), 'data-id': d.id, onchange: (e) => { e.target.checked ? S.deities.add(d.id) : S.deities.delete(d.id); } }), h('span', {}, d.name_th))));
  const years = []; for (let y = 2569; y >= 2470; y--) years.push(y);
  const dsel = (key, opts, ph) => h('select', { 'aria-label': ph, onchange: (e) => { S[key] = e.target.value; } }, h('option', { value: '' }, ph), opts.map(([v, t]) => h('option', { value: v }, t)));
  const run = h('button', { type: 'button', class: 'btn primary', onclick: go }, 'คำนวณและอธิบาย');
  const presets = [
    ['ความรัก', () => ({ wishes: ['W01'] })], ['ความรัก + การงาน + การเงิน', () => ({ wishes: ['W01', 'W02', 'W03'] })], ['เสี่ยงโชค', () => ({ wishes: ['W09'] })],
    ['ความรัก (ไม่เอาฮินดู)', () => ({ wishes: ['W01'], groups: ['ฮินดู'] })], ['บัตรคอน (ไม่เอาฮินดู) → ไม่มีผล', () => ({ wishes: ['W05'], groups: ['ฮินดู'] })], ['เรียน/สอบ (ไม่เอาพระพิฆเนศ)', () => ({ wishes: ['W04'], deities: ['D_GANESHA'] })]];
  const form = h('div', { class: 'card stack' }, h('h3', {}, 'ถามกราฟ'),
    h('div', {}, h('div', { class: 'small', style: 'font-weight:600;margin-bottom:6px' }, 'ตัวอย่างที่ลองได้เลย'), h('div', { class: 'chips' }, presets.map(([t, fn]) => h('button', { type: 'button', class: 'btn sm', onclick: () => { const v = fn(); S.wishes = v.wishes; S.groups = new Set(v.groups || []); S.deities = new Set(v.deities || []); drawWishes(); grp.forEach((l, i) => { l.querySelector('input').checked = S.groups.has(cat.tradition_groups[i]); }); dl.querySelectorAll('input').forEach((i) => { i.checked = S.deities.has(i.dataset.id); }); go(); } }, t)))),
    h('div', {}, h('div', { class: 'small', style: 'font-weight:600;margin-bottom:6px' }, 'เรื่องที่อยากมู (1–3)'), wishBox),
    h('div', {}, h('div', { class: 'small', style: 'font-weight:600;margin-bottom:6px' }, 'ไม่ต้องการ'), h('div', { class: 'checklist' }, grp), h('details', { style: 'margin-top:8px' }, h('summary', {}, 'สิ่งศักดิ์สิทธิ์เฉพาะองค์'), h('div', { class: 'inner' }, dl))),
    h('div', {}, h('div', { class: 'small', style: 'font-weight:600;margin-bottom:6px' }, 'วันเกิด (ไม่บังคับ — สัญญาณรอง)'), h('div', { class: 'row' }, dsel('day', Array.from({ length: 31 }, (_, i) => [i + 1, i + 1]), 'วัน'), dsel('month', MONTHS_TH.map((m, i) => [i + 1, m]), 'เดือน'), dsel('year', years.map((y) => [y, 'พ.ศ. ' + y]), 'ปี'))),
    h('div', { class: 'row' }, run));
  p.append(head('ลองถาม: เลือกเรื่องที่มู แล้วดูว่าคำนวณอย่างไรจนได้ผล',
    'หน้านี้เรียกโมเดลเดียวกับแอปจริง (POST /api/trace) แล้วแสดงขั้นกลางทุกขั้น: ตัดโหนดต้องห้าม → ตั้งจุดเริ่ม → PageRank → เลือกให้ครอบคลุม → ผลลัพธ์'),
    h('div', { class: 'grid g-side' }, form, out));

  async function go() {
    if (!S.wishes.length) { clear(out).append(h('div', { class: 'callout bad', role: 'alert' }, 'เลือกอย่างน้อย 1 เรื่อง')); return; }
    let birthdate = null;
    if (S.day || S.month || S.year) {
      if (!(S.day && S.month && S.year)) { clear(out).append(h('div', { class: 'callout bad', role: 'alert' }, 'กรอกวัน เดือน ปี ให้ครบ หรือเว้นว่างทั้งหมด')); return; }
      const y = S.year - 543; birthdate = `${y}-${String(S.month).padStart(2, '0')}-${String(S.day).padStart(2, '0')}`;
      const d = new Date(Date.UTC(y, S.month - 1, S.day));
      if (d.getUTCMonth() !== S.month - 1 || d > new Date()) { clear(out).append(h('div', { class: 'callout bad', role: 'alert' }, 'วันเกิดไม่ถูกต้อง')); return; }
    }
    run.disabled = true;
    try {
      const T = await postJSON('/api/trace', { wish_ids: S.wishes, birthdate, exclusions: { tradition_groups: [...S.groups], deity_ids: [...S.deities], place_ids: [] } });
      ctx.trace = T; ctx.onTrace.forEach((fn) => fn());
      drawTrace(out, T, ctx);
    } catch (e) { clear(out).append(h('div', { class: 'callout bad', role: 'alert' }, e.message)); } finally { run.disabled = false; }
  }
  go();
}

function drawTrace(out, T, { graph, names }) {
  const par = T.parameters, pf = T.profile;
  const nm = (id) => names[id] || id;
  const step = (n, title, ...kids) => h('section', { class: 'card stack' }, h('h3', {}, h('span', { class: 'chip', style: 'margin-right:8px' }, 'ขั้น ' + n), title), ...kids);
  const cands = T.step3_pagerank.candidates;
  const sel = T.step5_result.top5;
  const gone = new Set([...T.step1_prune.removed_deities.map((d) => 'D:' + d.id), ...T.step1_prune.removed_places.map((x) => 'P:' + x.id)]);
  const live = new Set();
  for (const pid of sel) for (const z of T.step5_result.paths[pid]) { live.add(`W:${z.wish_id}>D:${z.deity_id}`); live.add(`D:${z.deity_id}>P:${pid}`); }
  const ranks = Object.fromEntries(sel.map((pid, i) => ['P:' + pid, i + 1]));
  const holder = h('div');

  clear(out).append(
    h('div', { class: 'row' }, h('span', { class: T.step5_result.matches_reference ? 'chip ok' : 'chip bad' }, T.step5_result.matches_reference ? '✓ ผลตรงกับ Python Reference Model' : '✗ ไม่ตรงกับ Reference'),
      h('span', { class: 'chip' }, 'เรื่องที่เลือก: ' + pf.wish_names.join(' + ')), pf.weekday ? h('span', { class: 'chip' }, 'เกิด' + pf.weekday) : null),

    step(1, 'ตัดสิ่งที่ไม่ต้องการออกก่อนคำนวณ',
      h('p', { class: 'small muted', style: 'margin:0' }, `โหนดก่อนตัด ${T.step1_prune.nodes_before} → หลังตัด ${T.step1_prune.nodes_after} (ตัดออกจากกราฟจริง ไม่ใช่แค่ซ่อนผลลัพธ์ จึงไม่มีทางอ้อมให้เส้นทางต้องห้ามกลับมา)`),
      T.step1_prune.removed_deities.length || T.step1_prune.removed_places.length ? h('div', { class: 'row' }, [...T.step1_prune.removed_deities.map((d) => h('span', { class: 'chip bad' }, `${d.name} · ${d.tradition}`)), ...T.step1_prune.removed_places.map((x) => h('span', { class: 'chip bad' }, x.name))]) : h('div', { class: 'small faint' }, 'ไม่ได้เลือกสิ่งที่ไม่ต้องการ จึงไม่มีโหนดถูกตัด')),

    step(2, 'ตั้งจุดเริ่มของ PageRank (restart)',
      h('div', { class: 'formula' }, 'PPR = ', h('b', {}, 'α'), '·M·PPR + (1−', h('b', {}, 'α'), ')·p     α = ', par.alpha, h('br'), 'p = เวกเตอร์จุดเริ่ม รวมเป็น 1'),
      h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'โหนดเริ่ม'), h('th', {}, 'ชนิด'), h('th', { class: 'n' }, 'น้ำหนัก (ก่อนปรับรวมเป็น 1)'))),
        h('tbody', {}, Object.entries(T.step2_seeds.seeds).map(([id, v]) => h('tr', {}, h('td', {}, nm(id)), h('td', {}, id.startsWith('W') ? 'เรื่องที่ขอ' : 'สิ่งศักดิ์สิทธิ์ (จากวันเกิด)'), h('td', { class: 'n' }, f(v, 4)))))),
      h('div', { class: 'small faint' }, T.step2_seeds.note + (T.step2_seeds.birth_deity_ids.length ? ` · ใช้ ${T.step2_seeds.birth_claim_ids.length} ข้อความอ้างอิง` : ' · ไม่มีสัญญาณวันเกิดที่ใช้ได้'))),

    step(3, `PageRank → คะแนนสถานที่ (ผู้สมัคร ${T.step3_pagerank.candidate_count} แห่ง)`,
      h('div', { class: 'formula' }, 'คะแนน(p) = PPR(p) ÷ ', h('b', {}, '√(degree(p)+1)'), '   แล้วหารด้วยค่าสูงสุดของผู้สมัคร → 0–1', h('br'), 'ผู้สมัครต้องมีเส้นทาง เรื่องที่ขอ → เทพ → สถานที่ ที่ผ่านข้อจำกัดจริง'),
      cands.length ? h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['สถานที่', 'เส้นทาง', 'PPR ดิบ', 'degree', 'หลังปรับ degree', 'คะแนน 0–1', ''].map((t, i) => h('th', { class: i > 1 && i < 6 ? 'n' : '' }, t)))),
        h('tbody', {}, cands.slice(0, 10).map((c) => h('tr', { class: sel.includes(c.place_id) ? 'pick' : '' }, h('td', {}, c.name), h('td', { class: 'small', title: c.paths.map((z) => `${z.wish_name} → ${z.deity_name}`).join('\n') }, `${c.paths.length} เส้นทาง · ${[...new Set(c.paths.map((z) => z.wish_name))].join(', ')}`),
          h('td', { class: 'n' }, f(c.pagerank_raw, 5)), h('td', { class: 'n' }, c.degree), h('td', { class: 'n' }, f(c.degree_corrected, 5)), h('td', { class: 'n' }, f(c.ppr_normalized, 3)), h('td', { style: 'width:90px' }, bar(c.ppr_normalized, 1, 'alt'))))))) : h('div', { class: 'callout warn' }, 'ไม่มีสถานที่ผู้สมัครที่ผ่านข้อจำกัด'),
      h('div', { class: 'small faint' }, 'แถวที่ไฮไลต์คือสถานที่ที่ถูกเลือกในขั้น 4')),

    step(4, 'เลือก 5 แห่งแบบครอบคลุมทุกเรื่องที่ขอ (Coverage-aware re-ranking)',
      h('div', { class: 'formula' }, 'utility(p) = ', h('b', {}, '0.75'), ' × คะแนน PPR(p) + ', h('b', {}, '0.25'), ' × (เรื่องที่ขอที่ p ครอบคลุมและยังไม่เคยถูกครอบคลุม ÷ จำนวนเรื่องที่เลือก)', h('br'), 'เลือกที่ utility สูงสุดทีละแห่ง ทำซ้ำสูงสุด 5 รอบ'),
      T.step4_coverage.steps.length ? T.step4_coverage.steps.map((st, i) => h('details', { open: i === 0 }, h('summary', {}, `รอบ ${st.step}: เลือก ${nm('P:' + st.choice)}`),
        h('div', { class: 'inner scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['สถานที่', 'PPR', 'เรื่องใหม่ที่เพิ่ม', 'utility'].map((t, j) => h('th', { class: j === 1 || j === 3 ? 'n' : '' }, t)))),
          h('tbody', {}, st.table.map((r) => h('tr', { class: r.chosen ? 'pick' : '' }, h('td', {}, (r.chosen ? '✓ ' : '') + r.name), h('td', { class: 'n' }, f(r.ppr_normalized, 3)), h('td', { class: 'small' }, r.new_wishes.length ? r.new_wishes.map((w) => nm('W:' + w)).join(', ') : 'ไม่เพิ่ม'), h('td', { class: 'n' }, f(r.utility, 3))))))))) : h('div', { class: 'small faint' }, 'ไม่มีผู้สมัคร จึงไม่มีรอบเลือก')),

    step(5, `ผลลัพธ์ ${sel.length}/5 แห่ง`,
      sel.length ? h('ol', { style: 'margin:0;padding-left:20px' }, sel.map((pid) => h('li', { style: 'margin-bottom:6px' }, h('b', {}, T.step5_result.names[pid]),
        T.step5_result.paths[pid].map((z) => h('div', { class: 'small muted' }, `${z.wish_name} → ${z.deity_name} → ${T.step5_result.names[pid]}`))))) :
        h('div', { class: 'callout warn' }, 'ไม่มีสถานที่ที่มีเส้นทางผ่านข้อจำกัด ระบบตอบว่า "ไม่มี" แทนการแนะนำสิ่งที่ขัดกับที่ไม่ต้องการ'),
      sel.length < 5 && sel.length ? h('div', { class: 'small faint' }, 'น้อยกว่า 5 เพราะไม่มีเส้นทางที่มีแหล่งอ้างอิงเพิ่ม ระบบไม่เติมรายการให้ครบ') : null,
      h('div', { class: 'grid g2' },
        h('div', {}, h('div', { class: 'small', style: 'font-weight:600' }, 'ถ้าเรียงตามความนิยมในกราฟ (degree) แทน'), h('div', { class: 'small muted' }, T.baselines.popularity_degree_top5.map((x) => nm('P:' + x)).join(' · ') || '—')),
        h('div', {}, h('div', { class: 'small', style: 'font-weight:600' }, 'ถ้ากรองเฉพาะ 2 hop ตรง ๆ (ไม่มี PageRank)'), h('div', { class: 'small muted' }, T.baselines.direct_two_hop_top5.map((x) => nm('P:' + x)).join(' · ') || '—'))),
      h('div', { class: 'small faint' }, 'การเทียบนี้ดูแค่ความต่างของรายชื่อ ผลทดสอบเชิงตัวเลขอยู่ในแท็บ 6 ซึ่ง PPR ไม่ได้ชนะทุกกรณี')),

    h('section', { class: 'card stack' }, h('h3', {}, 'ภาพบนกราฟ: ขนาดโหนด = คะแนน PPR · เส้นหนา = เส้นทางของผลลัพธ์'), holder, graphLegend()));
  const view = mountGraph(holder, graph);
  view.setMode('score'); view.setScores(T.step3_pagerank.node_scores); view.setGone(gone); view.setLive(live); view.setRanks(ranks);
}

/* ============================================================ 5. online trip matching */
function tMatch(p, ctx) {
  const box = h('div', { class: 'stack' });
  p.append(head('จับคู่ทริปให้ผู้ใช้ (Online): เลือก 1 จาก 3 ทริปที่ล็อกไว้ หรือยอมรับว่าไม่มี',
    'ใช้โปรไฟล์ล่าสุดจากแท็บ 4 — ขั้นนี้ไม่มีการคำนวณเส้นทางใหม่ มีแค่ตรวจเงื่อนไข ให้คะแนน และเลือกที่สูงสุดที่ผ่าน'), box);
  const draw = () => {
    const T = ctx.trace;
    clear(box);
    if (!T) { box.append(h('div', { class: 'callout' }, 'ยังไม่มีผลจากแท็บ 4 — เปิดแท็บ "ลองถาม" แล้วกดคำนวณก่อน')); return; }
    const M = T.trip_matching, res = M.result;
    box.append(
      h('div', { class: 'row' }, h('span', { class: 'chip' }, 'โปรไฟล์: ' + T.profile.wish_names.join(' + ')), h('span', { class: res.matched_trip ? 'chip ok' : 'chip bad' }, res.matched_trip ? 'ผลลัพธ์: ' + TRIP_TH[res.matched_trip.trip_id] : 'ผลลัพธ์: NO_ELIGIBLE_SIGNATURE_TRIP')),
      h('div', { class: 'card stack' }, h('h3', {}, 'ลำดับการตัดสินใจ'),
        h('ol', { class: 'small', style: 'margin:0;padding-left:18px' },
          h('li', {}, 'ตรวจ Hard constraint: พิธีเด่นของทริปเกี่ยวกับสิ่งศักดิ์สิทธิ์ที่ไม่ต้องการหรือไม่ · มีสถานที่ต้องห้ามหรือไม่'),
          h('li', {}, 'ตรวจ Wish coverage: เรื่องที่ทริปครอบคลุม ÷ เรื่องที่ผู้ใช้เลือก ต้อง ≥ 30%'),
          h('li', {}, 'ให้คะแนน คะแนน = 0.75 × ค่าเฉลี่ย PPR ของ 4 จุดแวะ + 0.25 × coverage'),
          h('li', {}, 'เลือกทริปที่ผ่านและคะแนนสูงสุด ถ้าไม่มีทริปผ่านเลย → NO_ELIGIBLE_SIGNATURE_TRIP')),
        h('div', { class: 'formula' }, 'score = ', h('b', {}, '0.75'), ' × mean(PPR ของ 4 จุดแวะ) + ', h('b', {}, '0.25'), ' × coverage')),
      h('div', { class: 'grid g3' }, res.all_trip_scores.map((s) => {
        const t = M.trips.find((x) => x.trip_id === s.trip_id);
        const win = res.matched_trip && res.matched_trip.trip_id === s.trip_id;
        return h('article', { class: 'card stack', style: win ? 'border-color:var(--brand);border-width:2px' : '' },
          h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', {}, TRIP_TH[s.trip_id]), h('span', { class: s.eligible ? 'chip ok' : 'chip bad' }, win ? '★ ได้รับเลือก' : s.eligible ? 'ผ่านเกณฑ์' : 'ไม่ผ่าน')),
          h('table', {}, h('tbody', {}, t.stops.map((x) => h('tr', {}, h('td', { class: 'small' }, x.name), h('td', { class: 'n' }, f(x.ppr_normalized, 3)))))),
          h('div', { class: 'small' }, `ความเกี่ยวข้อง (ค่าเฉลี่ย) `, h('b', { class: 'mono' }, f(s.graph_relevance, 3))),
          h('div', { class: 'small' }, `Coverage `, h('b', { class: 'mono' }, pct(s.coverage_fraction, 0)), s.user_wishes_covered.length ? ` (${s.user_wishes_covered.map((w) => ctx.names['W:' + w]).join(', ')})` : ' (ไม่ครอบคลุมเรื่องที่เลือก)'),
          h('div', { class: 'small' }, 'คะแนน = 0.75 × ', f(s.graph_relevance, 3), ' + 0.25 × ', f(s.coverage_fraction, 2), ' = ', h('b', { class: 'mono' }, f(s.matching_score, 3))),
          s.reason_codes.length ? h('div', { class: 'callout bad small' }, s.reason_codes.join(' · ')) : null);
      })),
      h('div', { class: 'callout' }, 'ผลนี้เป็นคำแนะนำเชิงความสนใจ ยังไม่ตรวจที่นั่ง ราคา หรือวันเดินทาง และ route_reoptimized_per_user = ' + String(res.route_reoptimized_per_user)));
  };
  ctx.onTrace.push(draw);
  draw();
}

/* ============================================================ 6. evaluation */
function tEval(p, { results }) {
  const sa = results.structural_acceptance, fx = sa.source_aligned_fixture_results, ho = results.graph_link_holdout, ac = results.acceptance, se = results.model_sensitivity;
  const names = { popularity: 'Popularity (degree)', direct: 'Direct two-hop', ppr: 'PPR', ppr_coverage: 'PPR + Coverage (โมเดลที่ใช้)' };
  p.append(head('ผลทดสอบ: บอกทั้งที่ชนะและที่แพ้', 'ตัวเลขทั้งหมดมาจากไฟล์ผลลัพธ์ของโมเดล เราตั้งใจแสดงส่วนที่ PPR แพ้ เพื่อไม่อ้างเกินหลักฐาน'));
  p.append(h('div', { class: 'grid g2' },
    h('div', { class: 'card stack' }, h('h3', {}, 'A · Structural acceptance (15 โปรไฟล์ที่กำหนดไว้ล่วงหน้า)'), h('div', { class: 'sub' }, 'NDCG@5 เฉลี่ย (เฉพาะโปรไฟล์ที่มี label ผ่านเงื่อนไข)'),
      Object.entries(fx).map(([k, v]) => h('div', {}, h('div', { class: 'row', style: 'justify-content:space-between' }, h('span', { class: k === 'ppr_coverage' ? '' : 'muted', style: k === 'ppr_coverage' ? 'font-weight:600' : '' }, names[k]), h('b', { class: 'mono' }, f(v.mean_ndcg_at5_over_nonempty, 4))), bar(v.mean_ndcg_at5_over_nonempty, 1, k === 'ppr_coverage' ? '' : 'grey'))),
      h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['วิธี', 'Precision@5', 'Recall@5', 'เรื่องที่ครอบคลุม@5'].map((t, i) => h('th', { class: i ? 'n' : '' }, t)))),
        h('tbody', {}, Object.entries(fx).map(([k, v]) => h('tr', {}, h('td', {}, names[k]), h('td', { class: 'n' }, f(v.mean_precision_at5, 3)), h('td', { class: 'n' }, f(v.mean_recall_at5, 3)), h('td', { class: 'n' }, f(v.mean_covered_selected_wishes_at5, 3))))))),
      h('div', { class: 'callout warn small' }, sa.limitation)),
    h('div', { class: 'card stack' }, h('h3', {}, 'B · ซ่อนเส้นแล้วทายคืน (Edge holdout, 48 ตัวอย่าง)'), h('div', { class: 'sub' }, 'Hit@5: ซ่อนเส้นเทพ–สถานที่ แล้วดูว่าจัดอันดับสถานที่ที่ถูกซ่อนไว้ใน 5 อันดับแรกหรือไม่'),
      ['degree', 'ppr'].map((k) => h('div', {}, h('div', { class: 'row', style: 'justify-content:space-between' }, h('span', { style: k === 'degree' ? 'font-weight:600' : '' }, { degree: 'Degree (ชนะ)', ppr: 'PPR' }[k]), h('b', { class: 'mono' }, pct(ho.models[k].hit_rate_at5, 2))), bar(ho.models[k].hit_rate_at5, 1, k === 'degree' ? 'gold' : 'grey'))),
      h('div', { class: 'callout bad small' }, h('b', {}, 'Degree ชนะ PPR ในโจทย์นี้. '), 'จึงไม่อ้างว่า PPR ดีกว่าวิธีทั่วไปทุกกรณี โจทย์นี้ทายเส้นที่ซ่อน ไม่ใช่ความตรงใจผู้ใช้'),
      h('div', { class: 'small faint' }, ho.warning))));
  const dist = ac.trip_choice_distribution;
  p.append(h('div', { class: 'grid g2', style: 'margin-top:14px' },
    h('div', { class: 'card stack' }, h('h3', {}, 'C · Acceptance 75 โปรไฟล์จำลอง'),
      h('div', { class: 'row' }, h('span', { class: ac.zero_exclusion_violations ? 'chip ok' : 'chip bad' }, 'ละเมิด exclusion 0 ครั้ง'), h('span', { class: ac.valid_explanation_paths ? 'chip ok' : 'chip bad' }, 'ทุกผลมีเส้นทางอธิบายที่ตรวจแล้ว'), h('span', { class: ac.all_trip_routes_fixed ? 'chip ok' : 'chip bad' }, 'เส้นทางทริปไม่เปลี่ยน')),
      h('table', {}, h('tbody', {}, [['ทริปความรัก', dist.TRIP_LOVE], ['ทริปการงาน', dist.TRIP_CAREER], ['ทริปโชคลาภ', dist.TRIP_WEALTH], ['ไม่มีทริปที่เหมาะ (Abstain)', dist.ABSTAIN], ['ผลน้อยกว่า 5 แห่ง', ac.limited_results]].map(([a, b]) => h('tr', {}, h('td', {}, a), h('td', { class: 'n' }, b))))),
      h('div', { class: 'small faint' }, 'ชุดทดสอบจำลองเพื่อตรวจกฎของระบบ ไม่ใช่ความถูกต้องกับผู้ใช้จริง')),
    h('div', { class: 'card stack' }, h('h3', {}, 'D · ความไวของผล'),
      h('p', { class: 'small', style: 'margin:0' }, `ปรับสัดส่วน PPR เป็น 0.50 / 0.75 / 0.90 กับ 15 โปรไฟล์: ทริปที่ถูกเลือกเปลี่ยน ${se.changed_trip_choice_count} ราย`),
      h('div', { class: 'small', style: 'font-weight:600' }, 'จำลองเวลาเดินทางเพิ่ม (นาที, ไม่เปลี่ยนเส้นทาง)'),
      h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'ทริป'), [0, 15, 30, 50].map((x) => h('th', { class: 'n' }, '+' + x + '%')))),
        h('tbody', {}, ['TRIP_LOVE', 'TRIP_CAREER', 'TRIP_WEALTH'].map((id) => h('tr', {}, h('td', {}, TRIP_TH[id]), ...se.travel_delay_scenarios.filter((x) => x.trip_id === id).map((x) => h('td', { class: 'n', style: x.under_360min ? '' : 'color:var(--bad);font-weight:700' }, Math.round(x.duration_min_approx)))))))),
      h('div', { class: 'small faint' }, 'สีแดง = เกิน 360 นาที · ' + se.caveat))));
  p.append(h('div', { class: 'card', style: 'margin-top:14px' }, h('img', { src: '/figures/02_structural_baseline.png', alt: 'กราฟเปรียบเทียบ baseline ของ Popularity, Direct two-hop, PPR และ PPR+Coverage', style: 'width:100%;max-width:760px;height:auto;border-radius:8px' })));
}

/* ============================================================ 7. gaps */
function tGaps(p, { graph, results, names }) {
  const cnt = (arr, fn) => arr.reduce((a, x) => { const k = fn(x); a[k] = (a[k] || 0) + 1; return a; }, {});
  const edges = cnt(graph.edges, (e) => e.kind + ':' + e.status);
  const hours = cnt(graph.nodes.filter((n) => n.type === 'P'), (n) => n.hours_status);
  const q = results.qa;
  p.append(head('ช่องว่างของข้อมูลและขอบเขตที่เรากล้ายืนยัน', 'ระบบสาธิตเชิงวิเคราะห์ ยังไม่ใช่บริการจริง — แยกสถานะข้อมูลให้เห็นชัดทุกจุดที่แสดงบนหน้าจอ'));
  p.append(h('div', { class: 'grid g2' },
    h('div', { class: 'card stack' }, h('h3', {}, 'สถานะข้อมูล 4 ระดับ'),
      h('table', {}, h('tbody', {}, Object.entries(STATUS).map(([k, v]) => h('tr', {}, h('td', {}, statusChip(k)), h('td', { class: 'small' }, { SOURCE: 'อ้างอิงแหล่งทางการหรือเว็บไซต์ทางการ', CANDIDATE: 'จากเว็บ/บทความ ยังรอตรวจ', SYNTHETIC: 'สร้างขึ้นเพื่อสาธิต (เวลาเปิดบางแห่ง ผู้ให้บริการ ข้อเสนอ ผู้ใช้)', UNVERIFIED: 'ความเชื่อหรือค่าที่ยังไม่มีใครยืนยัน' }[k]))))),
      h('div', { class: 'small' }, h('b', {}, 'เส้นเชื่อม: '), `เรื่อง–เทพ ${edges['wish_deity:UNVERIFIED'] || 0} เส้น = UNVERIFIED ทั้งหมด · เทพ–สถานที่ SOURCE ${edges['deity_place:SOURCE'] || 0} / CANDIDATE ${edges['deity_place:CANDIDATE'] || 0}`),
      h('div', { class: 'small' }, h('b', {}, 'เวลาเปิดของสถานที่: '), `SYNTHETIC ${hours.SYNTHETIC || 0} · CANDIDATE ${hours.CANDIDATE || 0}`),
      h('div', { class: 'small' }, h('b', {}, 'พิกัด: '), `สถานที่ ${q.unverified_place_coordinates} แห่งยังไม่มีพิกัดจริง ใช้พิกัดสถานีเท่านั้น (ห้ามปักหมุดว่าเป็นที่ตั้ง)`)),
    h('div', { class: 'card stack' }, h('h3', {}, `ช่องว่างความครอบคลุม: สถานที่ ${graph.isolated_places.length} แห่งไม่มีเส้นเชื่อม`), h('div', { class: 'sub' }, 'ต้องให้ทีมข้อมูลตรวจแหล่งอ้างอิงก่อนนำมาจัดอันดับ ห้ามเพิ่มเส้นด้วยการเดา'),
      h('div', { class: 'chips' }, graph.isolated_places.map((id) => h('span', { class: 'chip' }, names[id]))))));
  p.append(h('div', { class: 'grid g2', style: 'margin-top:14px' },
    h('div', { class: 'card stack' }, h('h3', {}, '✓ สิ่งที่เรายืนยันได้'), h('ul', { class: 'small', style: 'margin:0;padding-left:18px' }, [
      'โมเดลทำงานซ้ำได้และตรวจสอบได้ (Python Reference + unit tests + ผลที่บันทึกไว้)', 'ไม่แนะนำเส้นทางความเชื่อที่ขัดกับสิ่งที่ผู้ใช้ไม่ต้องการ (0 ครั้งใน 75 โปรไฟล์)',
      'ทุกสถานที่ที่แนะนำมีเส้นทาง เรื่องที่ขอ → เทพ → สถานที่ พร้อมแหล่งอ้างอิง', 'ทริปเป็น 1 ใน 3 ทริปที่ล็อกไว้ หรือแจ้งว่าไม่มี — ไม่คำนวณเส้นทางใหม่ตามผู้ใช้', 'แสดงผลน้อยกว่า 5 แห่งหรือว่างเปล่าได้ ไม่เติมรายการให้ครบ'].map((t) => h('li', {}, t)))),
    h('div', { class: 'card stack' }, h('h3', {}, '✗ สิ่งที่เราไม่อ้าง'), h('ul', { class: 'small', style: 'margin:0;padding-left:18px' }, [
      'ไม่ใช่ความแม่นยำกับผู้ใช้จริง (label มาจากกราฟเดียวกัน ยังไม่มี label อิสระ)', 'ไม่ได้พิสูจน์ว่า PPR ดีกว่าวิธีทั่วไปทุกกรณี (แพ้ Degree ใน edge holdout)', 'ไม่ใช่ผลหรือความศักดิ์สิทธิ์ของการขอพร ความเชื่อทั้งหมดเป็น claim จากแหล่งอ้างอิง',
      'ไม่ใช่ทริปที่เปิดขายได้ ยังไม่มีเวลาเปิดจริง ตำแหน่งทางเดิน ราคา ที่นั่ง หรือสิทธิ์จากสถานที่', 'บริการฝากมูเป็นรายการจำลอง ไม่ใช่ผู้ให้บริการจริง'].map((t) => h('li', {}, t)))),
    h('div', { class: 'card stack' }, h('h3', {}, 'Phase 2 และสิ่งที่ต้องทำก่อนใช้งานจริง'), h('ul', { class: 'small', style: 'margin:0;padding-left:18px' }, [
      'Phase 2: เรียนรู้จาก feedback, การจองและชำระเงินจริง, แจ้งเตือนปฏิทินอัตโนมัติ', 'ก่อนใช้งานจริง: ตรวจสิทธิ์และ ToS ของแหล่งข้อมูล, พิกัดจริง, เวลาเปิดสด, เส้นทางเดินที่ปลอดภัย, ตารางรถไฟจริง, ราคา/ความจุ/ไกด์, ขออนุญาตสถานที่, ตรวจผู้ใช้และผู้เชี่ยวชาญอิสระ, ความยินยอมตาม PDPA'].map((t) => h('li', {}, t)))),
    h('div', { class: 'card stack' }, h('h3', {}, 'ความรับผิดชอบ'), h('p', { class: 'small', style: 'margin:0' }, 'AI ช่วยพัฒนาความสอดคล้องของข้อมูลและโค้ด ส่วนมนุษย์ต้องอนุมัติหลักฐานความเชื่อ กฎสิทธิผู้ใช้ นโยบายสถานที่ และการเปิดขาย ในเว็บนี้วันเกิดถูกใช้ในหน่วยความจำเท่านั้น และไม่เก็บลงฐานข้อมูล'))));
}
