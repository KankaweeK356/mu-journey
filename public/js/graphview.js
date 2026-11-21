// Layered SVG view of the Wish → Sacred entity → Place graph (101 nodes / 114 edges).
import { h, clear } from './util.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
};
const COLORS = { W: '#b4541a', D: '#4a3f8f', P: '#0f6e66' };
const TYPE_TH = { W: 'เรื่องที่ขอ', D: 'สิ่งศักดิ์สิทธิ์', P: 'สถานที่' };
const STATUS_CLS = { SOURCE: 'st-source', CANDIDATE: 'st-cand', UNVERIFIED: 'st-unv' };
const short = (t, n) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
const hue = (i) => `hsl(${(i * 137.5) % 360} 55% 42%)`;

/**
 * mount(container, graph, {onSelect})
 * returns {setMode, setScores, setGone, setLive, select, destroy}
 */
export function mountGraph(container, graph, { onSelect } = {}) {
  const byType = { W: [], D: [], P: [] };
  graph.nodes.forEach((n) => byType[n.type].push(n));
  byType.W.sort((a, b) => a.id.localeCompare(b.id));
  byType.D.sort((a, b) => a.community - b.community || a.label.localeCompare(b.label, 'th'));
  byType.P.sort((a, b) => (a.degree === 0) - (b.degree === 0) || a.community - b.community || a.id.localeCompare(b.id));

  const ROW = 17, TOP = 44, X = { W: 170, D: 500, P: 820 };
  const rows = Math.max(byType.W.length, byType.D.length, byType.P.length);
  const H = TOP + rows * ROW + 12;
  const pos = {};
  for (const t of ['W', 'D', 'P']) {
    const list = byType[t];
    const gap = t === 'W' ? 36 : ROW;
    const off = t === 'W' ? TOP + 40 : TOP;
    list.forEach((n, i) => { pos[n.id] = { x: X[t], y: off + i * gap }; });
  }
  const svg = s('svg', { viewBox: `0 0 1000 ${H}`, role: 'img', 'aria-label': 'กราฟความสัมพันธ์ เรื่องที่ขอ สิ่งศักดิ์สิทธิ์ และสถานที่' });
  const gE = s('g'), gN = s('g');
  svg.append(
    s('text', { x: X.W, y: 22, 'text-anchor': 'middle', class: 'colhead' }, 'เรื่องที่ขอ (10)'),
    s('text', { x: X.D, y: 22, 'text-anchor': 'middle', class: 'colhead' }, 'สิ่งศักดิ์สิทธิ์ (39)'),
    s('text', { x: X.P, y: 22, 'text-anchor': 'middle', class: 'colhead' }, 'สถานที่ (52)'),
    gE, gN);

  const nodeEl = {}, edgeEl = [];
  const adj = {};
  graph.nodes.forEach((n) => { adj[n.id] = new Set(); });
  graph.edges.forEach((e) => {
    adj[e.s].add(e.t); adj[e.t].add(e.s);
    const a = pos[e.s], b = pos[e.t], mx = (a.x + b.x) / 2;
    const p = s('path', { d: `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`, class: 'edge ' + STATUS_CLS[e.status] });
    p.dataset.s = e.s; p.dataset.t = e.t;
    gE.append(p); edgeEl.push({ el: p, e });
  });
  graph.nodes.forEach((n) => {
    const { x, y } = pos[n.id];
    const left = n.type === 'W';
    const label = s('text', { x: left ? x - 12 : x + 11, y: y + 4, 'text-anchor': left ? 'end' : 'start' }, short(n.label, n.type === 'P' ? 24 : 22));
    const circ = s('circle', { cx: x, cy: y, r: 6, fill: COLORS[n.type] });
    const g = s('g', { class: 'node', tabindex: '0', role: 'button', 'aria-label': `${TYPE_TH[n.type]}: ${n.label}` }, s('title', {}, n.label), circ, label);
    g.addEventListener('mouseenter', () => focusNode(n.id));
    g.addEventListener('mouseleave', () => focusNode(selected));
    g.addEventListener('focus', () => focusNode(n.id));
    g.addEventListener('blur', () => focusNode(selected));
    g.addEventListener('click', () => select(n.id));
    g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(n.id); } });
    gN.append(g); nodeEl[n.id] = { g, circ, label, n };
  });

  let selected = null, mode = 'type', scores = null, gone = new Set(), live = null, ranks = null;

  function focusNode(id) {
    const near = id ? new Set([id, ...adj[id]]) : null;
    for (const { el, e } of edgeEl) {
      el.classList.toggle('dim', !!near && !(e.s === id || e.t === id));
      el.classList.toggle('hi', !!near && (e.s === id || e.t === id));
    }
    for (const [nid, o] of Object.entries(nodeEl)) o.g.classList.toggle('dim', !!near && !near.has(nid));
  }
  function select(id) {
    selected = selected === id ? null : id;
    focusNode(selected);
    if (onSelect) onSelect(selected ? graph.nodes.find((n) => n.id === selected) : null);
  }
  function paint() {
    const max = scores ? Math.max(...Object.values(scores)) : 1;
    for (const [id, o] of Object.entries(nodeEl)) {
      const n = o.n;
      let fill = COLORS[n.type], r = 6;
      if (mode === 'community') fill = hue(n.community);
      if (mode === 'score' && scores) {
        const v = scores[id] || 0;
        r = 4 + 11 * Math.sqrt(v / max);
        fill = COLORS[n.type];
      }
      o.circ.setAttribute('fill', fill);
      o.circ.setAttribute('r', r.toFixed(1));
      o.g.classList.toggle('gone', gone.has(id));
      const rk = ranks && ranks[id];
      o.label.textContent = (rk ? `#${rk} ` : '') + short(n.label, n.type === 'P' ? 24 : 22);
      o.label.style.fontWeight = rk ? '700' : '';
    }
    for (const { el, e } of edgeEl) {
      const dead = gone.has(e.s) || gone.has(e.t);
      el.style.display = dead ? 'none' : '';
      el.classList.toggle('live', !!live && live.has(e.s + '>' + e.t));
      el.style.opacity = live && !live.has(e.s + '>' + e.t) ? '.12' : '';
    }
  }
  paint();
  clear(container).append(h('div', { class: 'graph' }, svg));

  return {
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
    h('span', {}, h('i', { style: 'background:#b4541a' }), 'เรื่องที่ขอ'),
    h('span', {}, h('i', { style: 'background:#4a3f8f' }), 'สิ่งศักดิ์สิทธิ์'),
    h('span', {}, h('i', { style: 'background:#0f6e66' }), 'สถานที่'),
    h('span', {}, h('s', { style: 'border-color:#2f8f4b' }), 'เส้นมีแหล่งทางการ (SOURCE)'),
    h('span', {}, h('s', { style: 'border-color:#c58a12;border-top-style:dashed' }), 'ผู้สมัคร รอตรวจ (CANDIDATE)'),
    h('span', {}, h('s', { style: 'border-color:#a8a095;border-top-style:dotted' }), 'ความเชื่อ ยังไม่ยืนยัน (UNVERIFIED)'));
}
