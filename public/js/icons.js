// Icons and illustrations. Wish icons are emoji on pastel tiles; illustrations are inline SVG (no external images).
const NS = 'http://www.w3.org/2000/svg';
export const s = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
};

export const WISH_ICON = {
  W01: { e: '💜', bg: '#fde2ef' }, W02: { e: '💼', bg: '#e3edff' }, W03: { e: '🪙', bg: '#fff1cc' }, W04: { e: '🎓', bg: '#e1f3ff' },
  W05: { e: '🎫', bg: '#ffe7d3' }, W06: { e: '🛡️', bg: '#e3f6e8' }, W07: { e: '🏠', bg: '#ece4ff' }, W08: { e: '🌸', bg: '#ffe0ee' },
  W09: { e: '🍀', bg: '#dff5e3' }, W10: { e: '💳', bg: '#ffefd6' },
};
export const wishIcon = (id) => WISH_ICON[id] || { e: '✨', bg: '#efe9ff' };

export function moon(size = 34) {
  return s('svg', { viewBox: '0 0 40 40', width: size, height: size, 'aria-hidden': 'true' },
    s('path', { d: 'M27 4a17 17 0 1 0 9 31 14 14 0 0 1-9-31z', fill: '#f6d77a' }),
    s('circle', { cx: 31, cy: 9, r: 1.6, fill: '#fff' }), s('circle', { cx: 36, cy: 17, r: 1.1, fill: '#fff' }));
}

/** Soft sky, temple skyline and a BTS train: decorative only. */
export function hero() {
  const clouds = [[60, 150, 46], [330, 140, 38], [200, 165, 30]].map(([x, y, r]) =>
    s('g', { opacity: '.85' }, s('ellipse', { cx: x, cy: y, rx: r, ry: r * .38, fill: '#fff' }), s('ellipse', { cx: x + r * .5, cy: y - 6, rx: r * .6, ry: r * .3, fill: '#fff' })));
  const stars = [[40, 34], [120, 20], [270, 40], [350, 24], [380, 70]].map(([x, y]) => s('path', { d: `M${x} ${y - 6}l1.6 4.4 4.4 1.6-4.4 1.6L${x} ${y + 6}l-1.6-4.4-4.4-1.6 4.4-1.6z`, fill: '#fff', opacity: '.9' }));
  return s('svg', { viewBox: '0 0 400 230', role: 'img', 'aria-label': 'ภาพประกอบวัด พระจันทร์ และรถไฟฟ้า' },
    s('defs', {}, s('linearGradient', { id: 'sky', x1: 0, y1: 0, x2: 0, y2: 1 }, s('stop', { offset: '0', 'stop-color': '#b49cf5' }), s('stop', { offset: '.65', 'stop-color': '#f3c6e6' }), s('stop', { offset: '1', 'stop-color': '#ffe7d2' }))),
    s('rect', { width: 400, height: 230, fill: 'url(#sky)' }),
    s('path', { d: 'M300 22a22 22 0 1 0 14 38 18 18 0 0 1-14-38z', fill: '#fff6cf' }),
    ...stars, ...clouds,
    // temple
    s('g', { transform: 'translate(150 38)' },
      s('path', { d: 'M50 0l5 26h-10z', fill: '#e8b23a' }), s('rect', { x: 46, y: 24, width: 8, height: 6, fill: '#c98f1f' }),
      s('path', { d: 'M18 52L50 28l32 24z', fill: '#f4c95d' }), s('path', { d: 'M10 74L50 48l40 26z', fill: '#e8a93a' }), s('path', { d: 'M2 96L50 66l48 30z', fill: '#d98e2a' }),
      s('rect', { x: 14, y: 96, width: 72, height: 46, fill: '#fff4dc' }), s('rect', { x: 42, y: 108, width: 16, height: 34, rx: 8, fill: '#a07ad8' }),
      s('rect', { x: 20, y: 106, width: 10, height: 16, rx: 5, fill: '#cdb8f3' }), s('rect', { x: 70, y: 106, width: 10, height: 16, rx: 5, fill: '#cdb8f3' })),
    // skyline
    s('path', { d: 'M0 196h60v-28h18v28h30v-44h22v44H0z M290 196v-36h20v-22h24v22h18v36z', fill: '#8e6fd0', opacity: '.55' }),
    // track + BTS
    s('rect', { x: 0, y: 190, width: 400, height: 8, fill: '#6d3fb0' }), s('rect', { x: 0, y: 198, width: 400, height: 32, fill: '#7a52bf' }),
    s('g', { transform: 'translate(215 160)' }, s('rect', { width: 150, height: 30, rx: 9, fill: '#fff' }), s('rect', { y: 20, width: 150, height: 6, fill: '#a78bfa' }),
      ...[8, 40, 72, 104].map((x) => s('rect', { x, y: 6, width: 26, height: 12, rx: 3, fill: '#8e6fd0' })), s('rect', { x: 136, y: 6, width: 10, height: 14, rx: 3, fill: '#6d3fb0' })));
}
