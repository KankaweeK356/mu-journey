import { h, makeTabs, clear } from './util.js';
import { renderDemo } from './demo.js';
import { renderAnalytics } from './analytics.js';

const app = document.getElementById('app');
const topTabs = document.getElementById('top-tabs');
clear(app);

const tabs = makeTabs([
  { label: '1 · ทดลองใช้งาน (สำหรับผู้ใช้)', render: (p) => renderDemo(p) },
  { label: '2 · Network Analytics (สำหรับผู้ตรวจ)', render: (p) => renderAnalytics(p) },
], { label: 'ส่วนของเว็บ' });

topTabs.append(tabs.list);
app.append(tabs.panels);
const want = location.hash === '#analytics' ? 1 : 0;
tabs.show(want);
tabs.list.addEventListener('click', () => { history.replaceState(null, '', tabs.list.querySelector('[aria-selected="true"]').textContent.startsWith('2') ? '#analytics' : '#demo'); });
