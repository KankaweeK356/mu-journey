import { h, clear } from './util.js';
import { moon } from './icons.js';
import { renderDemo } from './demo.js';
import { renderAnalytics } from './analytics.js';

// Exactly two main tabs share one header and one design system.
const nav = document.getElementById('nav'), app = document.getElementById('app');
document.getElementById('logo-moon').append(moon(34));
clear(app);
const defs = [{ id: 'demo', ic: '🏠', label: 'Demo ผู้ใช้', render: renderDemo }, { id: 'analytics', ic: '🕸️', label: 'Network Analytics', render: renderAnalytics }];
const secs = [], btns = [], done = new Set();
const show = (i, focus) => {
  btns.forEach((b, j) => { b.setAttribute('aria-selected', String(i === j)); b.tabIndex = i === j ? 0 : -1; secs[j].hidden = i !== j; });
  if (!done.has(i)) { done.add(i); defs[i].render(secs[i]); }
  history.replaceState(null, '', '#' + defs[i].id);
  if (focus) btns[i].focus();
  window.scrollTo({ top: 0 });
};
defs.forEach((d, i) => {
  const b = h('button', { type: 'button', role: 'tab', id: 'main-t-' + d.id, 'aria-controls': 'main-p-' + d.id, 'aria-selected': 'false', tabindex: '-1', onclick: () => show(i),
    onkeydown: (e) => { const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (k) { e.preventDefault(); show((i + k + defs.length) % defs.length, true); } } }, h('span', { 'aria-hidden': 'true' }, d.ic), d.label);
  const sec = h('section', { role: 'tabpanel', id: 'main-p-' + d.id, 'aria-labelledby': 'main-t-' + d.id, hidden: true });
  nav.append(b); app.append(sec); btns.push(b); secs.push(sec);
});
show(location.hash === '#analytics' ? 1 : 0);
