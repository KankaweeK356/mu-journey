// Layered SVG view of the Wish → Sacred entity → Place graph (101 nodes / 114 edges) with filters.
import { h, clear } from './util.js';
import { s } from './icons.js';

const COLORS = { W: '#d6336c', D: '#7c4dcc', P: '#e8a317' };
const TYPE_TH = { W: 'เรื่องที่ขอ (Wish)', D: 'สิ่งศักดิ์สิทธิ์ (Deity)', P: 'สถานที่ (Place)' };
const STATUS_CLS = { SOURCE: 'st-source', CANDIDATE: 'st-cand', UNVERIFIED: 'st-unv' };
const short = (t, n) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
export const hue = (i) => `hsl(${(i * 137.5) % 360} 55% 48%)`;

/** mountGraph(container, graph, {onSelect}) → {setFilter, setMode, setScores, setGone, setLive, setRanks, select} */
export function mountGraph(container, graph, { onSelect } = {}) {
  const adj = {};
  graph.nodes.forEach((n) => { adj[n.id] = new Set(); });
  graph.edges.forEach((e) => { adj[e.s].add(e.t); adj[e.t].add(e.s); });
  const byId = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));

  let filter = { types: new Set(['W', 'D', 'P']), wish: null, community: null, labels: true, connectedOnly: false };
  let selected = null, mode = 'type', scores = null, gone = new Set(), live = null, ranks = null;
  let nodeEl = {}, edgeEl = [];
  const holder = h('div', { class: 'graph' });
  clear(container).append(holder);

  function visibleIds() {
    let ids = graph.nodes.filter((n) => filter.types.has(n.type) && (filter.community == null || n.community === filter.community)).map((n) => n.id);
    if (filter.wish) {
      const keep = new Set([filter.wish]);
      adj[filter.wish].forEach((d) => { keep.add(d); adj[d].forEach((p) => keep.add(p)); });
      ids = ids.filter((id) => keep.has(id));
    }
    if (filter.connectedOnly) ids = ids.filter((id) => byId[id].degree > 0);
    return new Set(ids);
  }

  function build() {
    const vis = visibleIds();
    const cols = { W: [], D: [], P: [] };
    graph.nodes.filter((n) => vis.has(n.id)).forEach((n) => cols[n.type].push(n));
    cols.W.sort((a, b) => a.id.localeCompare(b.id));
    cols.D.sort((a, b) => a.community - b.community || a.label.localeCompare(b.label, 'th'));
    cols.P.sort((a, b) => (a.degree === 0) - (b.degree === 0) || a.community - b.community || a.id.localeCompare(b.id));
    const ROW = 18, TOP = 44, X = { W: 170, D: 500, P: 820 };
    const rows = Math.max(cols.W.length * 2, cols.D.length, cols.P.length, 6);
    const H = TOP + rows * ROW + 14;
    const pos = {};
    for (const t of ['W', 'D', 'P']) {
      const gap = t === 'W' ? Math.min(40, (rows * ROW) / Math.max(cols.W.length, 1)) : ROW;
      cols[t].forEach((n, i) => { pos[n.id] = { x: X[t], y: TOP + 10 + i * gap }; });
    }
    const svg = s('svg', { viewBox: `0 0 1000 ${H}`, role: 'img', 'aria-label': 'กราฟความสัมพันธ์ เรื่องที่ขอ สิ่งศักดิ์สิทธิ์ และสถานที่' });
    svg.append(...[['W', 'เรื่องที่ขอ'], ['D', 'สิ่งศักดิ์สิทธิ์'], ['P', 'สถานที่']].map(([t, l]) => s('text', { x: X[t], y: 22, 'text-anchor': 'middle', class: 'colhead' }, `${l} (${cols[t].length})`)));
    const gE = s('g'), gN = s('g');
    svg.append(gE, gN);
    edgeEl = [];
    graph.edges.forEach((e) => {
      if (!pos[e.s] || !pos[e.t]) return;
      const a = pos[e.s], b = pos[e.t], mx = (a.x + b.x) / 2;
      const p = s('path', { d: `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`, class: 'edge ' + STATUS_CLS[e.status] });
      gE.append(p); edgeEl.push({ el: p, e });
    });
    nodeEl = {};
    graph.nodes.forEach((n) => {
      if (!pos[n.id]) return;
      const { x, y } = pos[n.id], left = n.type === 'W';
      const label = s('text', { x: left ? x - 12 : x + 11, y: y + 4, 'text-anchor': left ? 'end' : 'start', display: filter.labels ? null : 'none' }, short(n.label, n.type === 'P' ? 24 : 22));
      const circ = s('circle', { cx: x, cy: y, r: 6, fill: COLORS[n.type] });
      const g = s('g', { class: 'node', tabindex: '0', role: 'button', 'aria-label': `${TYPE_TH[n.type]}: ${n.label}` }, s('title', {}, n.label), circ, label);
      g.addEventListener('mouseenter', () => focusNode(n.id)); g.addEventListener('mouseleave', () => focusNode(selected));
      g.addEventListener('focus', () => focusNode(n.id)); g.addEventListener('blur', () => focusNode(selected));
      g.addEventListener('click', () => select(n.id));
      g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(n.id); } });
      gN.append(g); nodeEl[n.id] = { g, circ, label, n };
    });
    clear(holder).append(svg);
    paint();
    if (selected && nodeEl[selected]) focusNode(selected); else if (selected) { selected = null; if (onSelect) onSelect(null); }
  }

  function focusNode(id) {
    const near = id ? new Set([id, ...adj[id]]) : null;
    for (const { el, e } of edgeEl) { el.classList.toggle('dim', !!near && !(e.s === id || e.t === id)); el.classList.toggle('hi', !!near && (e.s === id || e.t === id)); }
    for (const [nid, o] of Object.entries(nodeEl)) o.g.classList.toggle('dim', !!near && !near.has(nid));
  }
  function select(id) {
    selected = selected === id ? null : id;
    focusNode(selected);
    if (onSelect) onSelect(selected ? byId[selected] : null);
  }
  function paint() {
    const max = scores ? Math.max(...Object.values(scores)) : 1;
    for (const [id, o] of Object.entries(nodeEl)) {
      const n = o.n;
      let fill = COLORS[n.type], r = 6;
      if (mode === 'community') fill = hue(n.community);
      if (mode === 'score' && scores) r = 4 + 11 * Math.sqrt((scores[id] || 0) / max);
      o.circ.setAttribute('fill', fill); o.circ.setAttribute('r', r.toFixed(1));
      o.g.classList.toggle('gone', gone.has(id));
      const rk = ranks && ranks[id];
      o.label.textContent = (rk ? `#${rk} ` : '') + short(n.label, n.type === 'P' ? 24 : 22);
      o.label.style.fontWeight = rk ? '700' : '';
    }
    for (const { el, e } of edgeEl) {
      const dead = gone.has(e.s) || gone.has(e.t), isLive = !!live && live.has(e.s + '>' + e.t);
      el.style.display = dead ? 'none' : ''; el.classList.toggle('live', isLive); el.style.opacity = live && !isLive ? '.1' : '';
    }
  }
  build();

  return {
    setFilter(patch) { filter = { ...filter, ...patch }; build(); return filter; },
    setMode(m) { mode = m; paint(); },
    setScores(sc) { scores = sc; paint(); },
    setGone(set) { gone = set || new Set(); paint(); },
    setLive(set) { live = set; paint(); },
    setRanks(r) { ranks = r; paint(); },
    select,
  };
}

export function graphLegend() {
  return h('div', { class: 'legend' },
    h('span', {}, h('i', { style: 'background:#d6336c' }), 'Wish (เรื่องที่ขอ)'), h('span', {}, h('i', { style: 'background:#7c4dcc' }), 'Deity (สิ่งศักดิ์สิทธิ์)'), h('span', {}, h('i', { style: 'background:#e8a317' }), 'Place (สถานที่)'),
    h('span', {}, h('s', { style: 'border-color:#2f8f4b' }), 'SOURCE'), h('span', {}, h('s', { style: 'border-color:#c58a12;border-top-style:dashed' }), 'CANDIDATE'), h('span', {}, h('s', { style: 'border-color:#b0a6c4;border-top-style:dotted' }), 'UNVERIFIED'));
}
