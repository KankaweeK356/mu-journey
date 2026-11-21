// Tab 2 shell — five sub-tabs with a sidebar, all fed by the same engine as Tab 1.
import { h, clear, getJSON, labelMap } from './util.js';
import { API } from './api.js';
import { renderExplorer } from './explorer.js';
import { renderLab } from './lab.js';
import { renderDesigner } from './designer.js';
import { renderMatching } from './matching.js';
import { renderEvaluation } from './evaluation.js';

const ITEMS = [
  { id: 'explorer', n: '01', ic: '🕸️', t: 'Network Explorer', sub: 'โครงสร้างเครือข่ายและ Insight', render: renderExplorer },
  { id: 'lab', n: '02', ic: '🧪', t: 'MU Recommendation Lab', sub: 'ทดลอง PPR แนะนำสถานที่', render: renderLab },
  { id: 'designer', n: '03', ic: '🧭', t: 'Signature Trip Designer', sub: 'การออกแบบ 3 ทริปมาตรฐาน (Offline)', render: renderDesigner },
  { id: 'matching', n: '04', ic: '🧩', t: 'Trip Matching', sub: 'จับคู่ผู้ใช้กับทริปบริษัท', render: renderMatching },
  { id: 'evaluation', n: '05', ic: '📊', t: 'Model Evaluation', sub: 'ผลทดสอบและข้อจำกัด', render: renderEvaluation },
];

export async function renderAnalytics(root) {
  let ctx;
  try {
    const [graph, results, design, cat] = await Promise.all([getJSON('/data/graph.json'), getJSON('/data/results.json'), getJSON('/data/trips_design.json'), API.catalog()]);
    ctx = { graph, results, design, cat, names: labelMap(graph), go: null };
  } catch (e) { root.append(h('div', { class: 'callout bad', style: 'margin-top:18px' }, 'โหลดข้อมูลวิเคราะห์ไม่สำเร็จ: ' + e.message)); return; }

  const v = ctx.cat.versions;
  const nav = h('nav', { class: 'side', 'aria-label': 'หัวข้อ Network Analytics', role: 'tablist' },
    h('h2', {}, 'Network Analytics'), h('div', { class: 'sub' }, 'สำหรับอาจารย์'));
  const panels = h('div', { class: 'panels' });
  const done = new Set(), btns = [], secs = [];
  const show = (i, focus) => {
    btns.forEach((b, j) => { b.setAttribute('aria-selected', String(i === j)); b.tabIndex = i === j ? 0 : -1; secs[j].hidden = i !== j; });
    if (!done.has(i)) { done.add(i); ITEMS[i].render(secs[i], ctx); }
    if (focus) btns[i].focus();
  };
  ctx.go = (id) => show(ITEMS.findIndex((x) => x.id === id));
  ITEMS.forEach((it, i) => {
    const b = h('button', { type: 'button', role: 'tab', 'aria-selected': 'false', tabindex: '-1', id: 'a2-t-' + it.id, 'aria-controls': 'a2-p-' + it.id, onclick: () => show(i),
      onkeydown: (e) => { const k = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key]; if (k) { e.preventDefault(); show((i + k + ITEMS.length) % ITEMS.length, true); } } },
    h('span', { class: 'ic' }, it.ic), h('span', {}, h('b', {}, `${it.n} ${it.t}`), h('small', {}, it.sub)));
    const sec = h('section', { role: 'tabpanel', id: 'a2-p-' + it.id, 'aria-labelledby': 'a2-t-' + it.id, hidden: true });
    nav.append(b); panels.append(sec); btns.push(b); secs.push(sec);
  });
  nav.append(h('div', { class: 'ver' }, 'Model ', v.model, h('br'), 'Dataset ', v.dataset_title || '—', ' · ', v.data_as_of || '', h('br'), 'Snapshot ', v.snapshot_sha256, h('br'), 'Trips ', v.trip_design));
  root.append(h('div', { class: 'shell' }, nav, panels));
  show(0);
}
