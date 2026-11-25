// Small DOM + fetch helpers. All dynamic text goes through textContent / text nodes (no innerHTML).

export function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}

export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
/** el.append() that skips null / undefined / false. The native append() prints them as the words "null" / "undefined" / "false". */
export const put = (el, ...kids) => { el.append(...kids.flat(Infinity).filter((k) => k != null && k !== false)); return el; };
export const f = (x, d = 3) => (x == null ? '–' : Number(x).toFixed(d));
export const pct = (x, d = 1) => (x == null ? '–' : (Number(x) * 100).toFixed(d) + '%');

const cache = new Map();
export async function getJSON(url) {
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then(async (r) => {
      if (!r.ok) throw new Error(url + ' → ' + r.status);
      return r.json();
    }));
  }
  return cache.get(url);
}

export async function postJSON(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.message || j.error || r.statusText), { status: r.status });
  return j;
}

export const STATUS = {
  SOURCE: { th: 'มีแหล่งอ้างอิง', cls: 'st-source', mark: '✓', explain: 'มีแหล่งอ้างอิงจากหน่วยงานรัฐบันทึกไว้ แต่ทีมยังตรวจทานไม่เสร็จ' },
  CANDIDATE: { th: 'รอตรวจสอบ', cls: 'st-cand', mark: '◐', explain: 'มาจากแหล่งอื่น เช่น บทความ เว็บไซต์ หรือชุดข้อมูลที่รวบรวมไว้ ยังรอตรวจสอบ' },
  SYNTHETIC: { th: 'ข้อมูลจำลอง', cls: 'st-syn', mark: '◇', explain: 'ข้อมูลที่สร้างขึ้นเพื่อสาธิต ไม่ใช่ข้อมูลจริง' },
  UNVERIFIED: { th: 'ยังไม่ยืนยัน', cls: 'st-unv', mark: '!', explain: 'เป็นความเชื่อที่บันทึกไว้ ยังไม่มีใครยืนยัน' },
};
/** Plain-language meaning of the status words, shown next to wherever the words appear. */
export const statusLegend = (codes = Object.keys(STATUS)) => h('details', { class: 'small', 'data-status-legend': 'true' }, h('summary', {}, 'สถานะข้อมูลหมายถึงอะไร'),
  h('div', { class: 'inner stack' }, codes.map((c) => h('div', {}, statusChip(c), ' ', STATUS[c].th, ' — ', STATUS[c].explain)),
    h('div', { class: 'faint' }, 'ไม่มีสถานะใดเป็นการรับรองความเชื่อหรือผลของการขอพร')));
export function statusChip(code, label) {
  const s = STATUS[code] || STATUS.UNVERIFIED;
  return h('span', { class: 'chip ' + s.cls, title: code + ' — ' + s.th }, s.mark + ' ', label ? label + ': ' : '', code);
}

export const TRIP_TH = {
  TRIP_LOVE: 'ความรักและเสริมมงคล',
  TRIP_CAREER: 'การงานและความสำเร็จ',
  TRIP_WEALTH: 'โชคลาภและการปกป้อง',
};
export const tripName = (t) => `${TRIP_TH[t.trip_id || t] || ''} (${(t.title || '')})`.replace(/ \(\)$/, '');

export const MONTHS_TH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

export function bar(value, max = 1, cls = '') {
  const w = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return h('div', { class: 'bar ' + cls, role: 'img', 'aria-label': `${f(value)} จาก ${f(max, 2)}` }, h('span', { style: `width:${w}%` }));
}

export function toast(msg, ms = 3200) {
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

// Accessible tab widget. items: [{id,label,n,render(panel)}]. Panels render lazily on first visit.
export function makeTabs(items, { sub = false, label = '', start = 0, onShow } = {}) {
  const list = h('div', { class: 'tablist' + (sub ? ' sub' : ''), role: 'tablist', 'aria-label': label });
  const panels = h('div', { class: 'panels' });
  const uid = 'tb' + Math.random().toString(36).slice(2, 7);
  const tabs = [];
  const done = new Set();
  const show = (i, focus) => {
    tabs.forEach((t, j) => {
      const on = i === j;
      t.btn.setAttribute('aria-selected', String(on));
      t.btn.tabIndex = on ? 0 : -1;
      t.panel.hidden = !on;
    });
    const it = tabs[i];
    if (!done.has(i)) { done.add(i); it.def.render(it.panel); }
    if (focus) it.btn.focus();
    if (onShow) onShow(it.def, i);
  };
  items.forEach((def, i) => {
    const btn = h('button', { role: 'tab', id: `${uid}-t${i}`, 'aria-controls': `${uid}-p${i}`, 'aria-selected': 'false', tabindex: '-1',
      onclick: () => show(i), onkeydown: (e) => {
        const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (k) { e.preventDefault(); show((i + k + items.length) % items.length, true); }
        if (e.key === 'Home') { e.preventDefault(); show(0, true); }
        if (e.key === 'End') { e.preventDefault(); show(items.length - 1, true); }
      } }, def.n ? h('span', { class: 'n' }, def.n) : null, def.label);
    const panel = h('section', { role: 'tabpanel', id: `${uid}-p${i}`, 'aria-labelledby': `${uid}-t${i}`, hidden: true });
    list.append(btn); panels.append(panel);
    tabs.push({ btn, panel, def });
  });
  const root = h('div', {}, list, panels);
  root.show = show;
  root.start = () => show(start);
  return { root, list, panels, show };
}

export function labelMap(graph) {
  const m = {};
  for (const n of graph.nodes) m[n.id] = n.label;
  return m;
}
