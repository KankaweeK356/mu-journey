// Final improvement round, real-browser checks (headless Edge, DevTools protocol, Node 22+).
//   node tests/e2e/final_round.mjs <BASE_URL> [full|readonly]
//   full     : every item of this round, on desktop and phone width (local server of the new code)
//   readonly : generic health checks only (null text, console errors, failed requests, overflow, basic accessibility) — safe for production
// POST /api/feedback is blocked inside the page in BOTH modes, so no test answer can ever reach the Google Sheet.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '') + '/';
const FULL = (process.argv[3] || 'full') === 'full';
const EDGE = process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9346;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'edge-final-'))}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(250); } }
const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r) => { ws.onopen = r; });
let id = 0; const pend = new Map(); const events = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method) events.push(d); };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, (d) => (d.error ? rej(new Error(d.error.message)) : res(d.result))); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 700)); return r.result.value; };
for (const d of ['Runtime', 'Log', 'Page', 'Network']) await send(d + '.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{ const f=window.fetch; window.__blocked=0; window.fetch=function(u,o){ if(/feedback/.test(String(u))){ window.__blocked++; return Promise.reject(new Error('blocked by test')); } return f.apply(this,arguments); }; })();` });

const results = []; const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info: String(info).slice(0, 400) }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  ' + String(info).slice(0, 400))); };
const HELP = `const w=(m)=>new Promise(r=>setTimeout(r,m)); const until=async(fn,t=20000)=>{const s=Date.now(); while(Date.now()-s<t){ if(fn()) return true; await w(100);} return false;};
const txt=(b)=>b.textContent.trim(); const q=(s,r=document)=>r.querySelector(s); const qa=(s,r=document)=>[...r.querySelectorAll(s)]; const btn=(t,r=document)=>qa('button',r).find(b=>txt(b).includes(t));
const ready=async()=>{ await until(()=>!qa('.app1 .spinner').length); await w(250); };
const next=async(t)=>{ btn(t).click(); await w(300); await ready(); };`;
const W = (js) => ev(`(async()=>{${HELP} ${js} })()`);

/** Health scan of whatever is on screen now. */
const SCAN = `(()=>{ const out={bad:[],overflow:0,unnamed:[],unlabeled:[],noalt:0,dupIds:[]};
  const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT); let n; while((n=walk.nextNode())){ const t=n.textContent.trim(); if(/^(null|undefined|NaN|false)$/.test(t)||/(^|[\\s:(])(null|undefined|NaN)([\\s).]|$)/.test(t)) { if(!n.parentElement.closest('script,style')) out.bad.push(t.slice(0,80)); } }
  out.overflow=document.documentElement.scrollWidth-document.documentElement.clientWidth;
  const shown=(e)=>e.offsetParent!==null||e.getClientRects().length>0;
  for(const b of document.querySelectorAll('button,a[href],[role=button]')){ if(shown(b)&&!(b.textContent.trim()||b.getAttribute('aria-label')||b.getAttribute('title'))) out.unnamed.push(b.outerHTML.slice(0,80)); }
  for(const f of document.querySelectorAll('input,select,textarea')){ if(shown(f)&&!(f.closest('label')||f.getAttribute('aria-label')||f.getAttribute('aria-labelledby')||(f.id&&document.querySelector('label[for="'+f.id+'"]')))) out.unlabeled.push(f.outerHTML.slice(0,80)); }
  out.noalt=[...document.querySelectorAll('img')].filter(i=>!i.hasAttribute('alt')).length;
  const seen={}; for(const e of document.querySelectorAll('[id]')) seen[e.id]=(seen[e.id]||0)+1; out.dupIds=Object.keys(seen).filter(k=>seen[k]>1);
  return out; })()`;
const scans = [];
async function scan(where) {
  const s = await ev(SCAN);
  scans.push({ where, ...s });
  check(`${where}: no null / undefined text`, s.bad.length === 0, s.bad.join(' | '));
  check(`${where}: no horizontal page scroll`, s.overflow <= 1, s.overflow + 'px');
  check(`${where}: buttons, fields and images are named; ids unique`, !s.unnamed.length && !s.unlabeled.length && !s.noalt && !s.dupIds.length, JSON.stringify({ u: s.unnamed.slice(0, 3), f: s.unlabeled.slice(0, 3), alt: s.noalt, d: s.dupIds.slice(0, 5) }));
}
async function load(width, height) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
  await send('Page.navigate', { url: BASE }); await sleep(2500);
  await ev(`localStorage.clear()`); await send('Page.navigate', { url: BASE }); await sleep(2500);
}
const setDate = (d, m, y) => `{ const s=qa('.dp select'); for(const [i,v] of [[0,'${d}'],[1,'${m}'],[2,'${y}']]){ s[i].value=v; s[i].dispatchEvent(new Event('change')); } }`;

async function tab1(label) {
  await scan(`${label} step 01`);
  // Monday birth date, two interests
  await W(`${setDate(3, 1, 2543)} btn('เริ่มมูของฉัน').click(); await w(300); return 1;`);
  await scan(`${label} step 02`);
  await W(`for(const t of ['ความรัก','การงาน']) { qa('.wish-card').find(b=>txt(b).includes(t)).click(); await w(100);} btn('ถัดไป').click(); await w(300); return 1;`);
  await scan(`${label} step 03`);
  await W(`btn('ถัดไป').click(); await w(300); await ready(); await w(800); return 1;`);
  await scan(`${label} step 04`);
  if (FULL) {
    const s4 = await W(`return { status:q('[data-birth-status]')?.dataset.birthStatus, text:q('[data-birth-status]')?.textContent||'' };`);
    check(`${label} #13 step 04 says the birth signal was applied`, s4.status === 'APPLIED' && s4.text.includes('เกิดวันจันทร์'), JSON.stringify(s4));
    const rem = await W(`const b=qa('.fixed-card button').find(x=>txt(x).includes('ติดตาม')); if(!b) return {card:false}; b.click(); await w(600); return { card:true, dates:qa('.fixed-card [data-remind-date]').map(e=>e.dataset.remindDate+' '+e.textContent) };`);
    check(`${label} #6 reminder choices show the date they fall due`, rem.card && rem.dates.length >= 2 && rem.dates.every((d) => /^\d{4}-\d{2}-\d{2} .*(เตือนวันที่|ครบกำหนดแล้ว)/.test(d)), JSON.stringify(rem));
  }
  await W(`await next('ดูสถานที่ที่เหมาะกับคุณ'); return 1;`);
  await scan(`${label} step 05`);
  if (FULL) {
    const s5 = await W(`return { status:q('[data-birth-status]')?.dataset.birthStatus };`);
    check(`${label} #13 step 05 shows the same birth status`, s5.status === 'APPLIED', JSON.stringify(s5));
    // every place card of the Top 5: open the detail dialog and check the wording
    const bad = []; const count = await W(`return qa('article.place').length;`);
    for (let i = 0; i < count; i++) {
      const d = await W(`btn('ดูรายละเอียด', qa('article.place')[${i}]).click(); await until(()=>q('dialog[open] [data-status-legend]')); const t=q('dialog[open]'); const out={text:t.textContent, legend:!!q('[data-status-legend]',t)}; return out;`);
      if (!d.legend || /Top_Deities|ในไฟล์|แหล่งที่ค้น|search gap|needs_verification|single_source|multi_source|Candidate;|Synthetic assumed|CONFLICT in/.test(d.text)) bad.push(i);
      await scan(`${label} place dialog ${i + 1}`);
      await W(`q('dialog[open] .dlg-h button').click(); await w(200); return 1;`);
    }
    check(`${label} #3 #4 place dialogs: status explanation present, no internal wording`, count > 0 && bad.length === 0, `cards=${count} bad=${bad.join(',')}`);
  }
  await W(`await next('ดูทริปที่เหมาะกับฉัน'); return 1;`);
  await scan(`${label} step 06`);
  if (FULL) {
    const s6 = await W(`return { legs:qa('[data-leg]').map(e=>e.textContent), times:q('[data-trip-times]')?.textContent||'', osm:q('[data-osm-credit] a')?.href||'', none:document.body.textContent.includes('NO_ELIGIBLE_SIGNATURE_TRIP') };`);
    check(`${label} #5 step 06 shows 4 legs with BTS/MRT, travel and access time apart`, !s6.none && s6.legs.length === 4 && s6.legs.every((t) => /(BTS|MRT)/.test(t) && /เข้าถึงสถานที่/.test(t)) && /เดินทางด้วยรถไฟฟ้าประมาณ \d+ นาที · เดินเข้าถึงสถานที่ประมาณ \d+ นาที/.test(s6.times), JSON.stringify(s6).slice(0, 400));
    check(`${label} #7 step 06 credits OpenStreetMap`, s6.osm.startsWith('https://www.openstreetmap.org/copyright'), s6.osm);
  }
  await W(`await next(btn('ดูรายละเอียดทริปและบริการ')?'ดูรายละเอียดทริปและบริการ':'ไปมูเอง / บริการอื่น'); return 1;`);
  for (const [name, key] of [['ไปมูเอง', 'self'], ['ทริปบริษัท', 'trip'], ['ฝากมู', 'proxy']]) {
    await W(`qa('.svc').find(b=>txt(b).includes('${name}')).click(); await w(1200); return 1;`);
    await scan(`${label} step 07 ${key}`);
    if (FULL && key === 'trip') {
      const s7 = await W(`return { legs:qa('[data-leg]').length, osm:!!q('[data-osm-credit]') };`);
      check(`${label} #5 #7 step 07 trip: legs and OSM credit`, s7.legs === 4 && s7.osm, JSON.stringify(s7));
    }
  }
}

async function birthStatuses() {
  // Wednesday = no eligible data; Monday + Hindu group excluded = excluded, and there is no eligible trip check below
  const cases = [['5 1 2543', [], 'NO_ELIGIBLE_DATA'], ['3 1 2543', ['ฮินดู'], 'EXCLUDED'], ['', [], 'NOT_PROVIDED']];
  for (const [date, groups, want] of cases) {
    await load(1366, 800);
    const [d, m, y] = date.split(' ');
    const got = await W(`${date ? setDate(d, m, y) : ''} btn('เริ่มมูของฉัน').click(); await w(300); qa('.wish-card').find(b=>txt(b).includes('ความรัก')).click(); await w(100); btn('ถัดไป').click(); await w(300);
      for(const g of ${JSON.stringify(groups)}) qa('.tchip').find(b=>txt(b)===g).click(); btn('ถัดไป').click(); await w(300); await ready();
      const a={s:q('[data-birth-status]')?.dataset.birthStatus,t:q('[data-birth-status]')?.textContent, gold:qa('.chip.gold').filter(c=>!c.closest('[data-legend]') && txt(c).startsWith('เกิด')).length}; await next('ดูสถานที่ที่เหมาะกับคุณ'); a.s5=q('[data-birth-status]')?.dataset.birthStatus; return a;`);
    check(`#13 Tab 1 status ${want} in steps 04 and 05, no "used" badge`, got.s === want && got.s5 === want && got.gold === 0, JSON.stringify(got));
  }
  // a profile with no eligible company trip
  await load(1366, 800);
  const none = await W(`btn('เริ่มมูของฉัน').click(); await w(300); qa('.wish-card').find(b=>txt(b).includes('บัตรคอน')).click(); await w(100); btn('ถัดไป').click(); await w(300);
    qa('.tchip').find(b=>txt(b)==='ฮินดู').click(); btn('ถัดไป').click(); await w(300); await ready(); await next('ดูสถานที่ที่เหมาะกับคุณ'); await next('ดูทริปที่เหมาะกับฉัน');
    return { code:document.body.textContent.includes('NO_ELIGIBLE_SIGNATURE_TRIP'), legs:qa('[data-leg]').length };`);
  check('E no eligible trip: says NO_ELIGIBLE_SIGNATURE_TRIP and shows no route', none.code && none.legs === 0, JSON.stringify(none));
  await scan('no-trip profile step 06');
}

async function tab2(label) {
  await W(`document.getElementById('main-t-analytics').click(); await until(()=>q('#a2-p-explorer svg')); await w(2500); return 1;`);
  await scan(`${label} Tab2 explorer`);
  if (FULL) {
    const graph = await ev(`fetch('/data/graph.json').then(r=>r.json())`);
    // #1: every node's detail panel
    const bad = await W(`const bad=[]; const nodes=qa('#a2-p-explorer .graph .node'); for(const g of nodes){ g.dispatchEvent(new MouseEvent('click',{bubbles:true})); const t=q('#a2-p-explorer .explorer > :nth-child(3)').textContent; if(/null|undefined|Data QA/.test(t)) bad.push(g.getAttribute('aria-label')); g.dispatchEvent(new MouseEvent('click',{bubbles:true})); } return {n:nodes.length,bad};`);
    check(`${label} #1 details of all 101 nodes have no null / internal wording`, bad.n === 101 && bad.bad.length === 0, JSON.stringify(bad).slice(0, 300));
    // #2: wish filter for every wish
    const wrong = [];
    for (const wish of graph.nodes.filter((n) => n.type === 'W')) {
      const deities = graph.edges.filter((e) => e.s === wish.id).map((e) => e.t);
      const places = new Set(graph.edges.filter((e) => deities.includes(e.s)).map((e) => e.t));
      const got = await W(`const s=q('#a2-p-explorer select[aria-label="เลือกเรื่องที่สนใจ"]'); s.value='${wish.id}'; s.dispatchEvent(new Event('change')); await w(100); const c={W:0,D:0,P:0}; qa('#a2-p-explorer .graph .node').forEach(g=>{const a=g.getAttribute('aria-label'); c[a.startsWith('เรื่อง')?'W':a.startsWith('สิ่ง')?'D':'P']++;}); return c;`);
      if (got.W !== 1 || got.D !== deities.length || got.P !== places.size) wrong.push(`${wish.label} ${JSON.stringify(got)} want 1/${deities.length}/${places.size}`);
    }
    check(`${label} #2 wish filter shows only that wish's network (10 wishes)`, wrong.length === 0, wrong.join(' ; '));
    await W(`btn('รีเซ็ตกราฟ').click(); await w(300); return 1;`);
    const ex = await W(`return { legend:!!q('#a2-p-explorer [data-status-legend]'), degree:qa('#a2-p-explorer [data-degree]').length, comm:qa('#a2-p-explorer [data-community]').length, names:qa('#a2-p-explorer [data-community] td:last-child').map(e=>txt(e)), verdict:q('#a2-p-explorer [data-verdict]')?.dataset.verdict, rows:qa('#a2-p-explorer [data-null-table] tbody tr').length };`);
    check(`${label} #3 explorer explains SOURCE / CANDIDATE / UNVERIFIED`, ex.legend, JSON.stringify(ex));
    check(`${label} #8 #9 #10 four degree tables, 9 communities by number, random-graph table`, ex.degree === 4 && ex.comm === 9 && ex.verdict === 'fail' && ex.rows === 4 && ex.names.every((n) => n === 'ใช้หมายเลขกลุ่ม'), JSON.stringify(ex));
  }
  await W(`document.getElementById('a2-t-lab').click(); await w(800); qa('#a2-p-lab .persona')[0].click(); await w(400); document.getElementById('run-ppr').click(); await until(()=>q('#a2-p-lab .lab-step') && !q('#a2-p-lab .spinner')); await w(2500); return 1;`);
  await scan(`${label} Tab2 lab`);
  if (FULL) {
    const sunday = await W(`return q('#a2-p-lab [data-birth-status]')?.dataset.birthStatus;`);
    check(`${label} #13 Lab: persona A (born on a Sunday) has no eligible data`, sunday === 'NO_ELIGIBLE_DATA', sunday);
    await W(`const i=q('#a2-p-lab input[type=date]'); i.value='2000-01-03'; i.dispatchEvent(new Event('change')); await w(400); document.getElementById('run-ppr').click(); await until(()=>q('#a2-p-lab .lab-step') && !q('#a2-p-lab .spinner')); await w(2500); return 1;`);
    const lab = await W(`return { s:q('#a2-p-lab [data-birth-status]')?.dataset.birthStatus, head:qa('#a2-p-lab [data-seed-table] thead th').map(txt), foot:qa('#a2-p-lab [data-seed-table] tfoot td').map(txt) };`);
    check(`${label} #13 Lab shows status and seeds before and after normalising`, lab.s === 'APPLIED' && lab.head.includes('ก่อน Normalize') && lab.head.includes('หลัง Normalize') && lab.foot.join(',') === 'รวม,1.0500,1.0000', JSON.stringify(lab));
  }
  for (const sec of ['designer', 'matching', 'evaluation']) {
    await W(`document.getElementById('a2-t-${sec}').click(); await w(1500); ${sec === 'designer' ? `btn('Reproduce Offline Design').click(); await w(4000);` : ''} ${sec === 'matching' ? `if(document.getElementById('mt-run')){document.getElementById('mt-run').click();} await w(3000);` : ''} ${sec === 'evaluation' ? 'await w(5000);' : ''} return 1;`);
    await scan(`${label} Tab2 ${sec}`);
    if (FULL && sec === 'designer') check(`${label} #7 designer credits OpenStreetMap`, await W(`return qa('#a2-p-designer [data-osm-credit]').length>=1;`));
  }
}

for (const [label, wd, ht] of [['desktop 1366', 1366, 800], ['phone 375', 375, 812]]) {
  console.log(`\n== ${label} on ${BASE}`);
  await load(wd, ht); await tab1(label); await tab2(label);
}
if (FULL) await birthStatuses();
const lang = await ev(`document.documentElement.lang`);
check('page declares its language', !!lang, lang);
const errs = events.filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error' && !String(e.params.entry.url || '').includes('favicon'))).map((e) => JSON.stringify(e.params).slice(0, 200));
check('no console errors', errs.length === 0, errs.slice(0, 4).join(' ; '));
const failed = events.filter((e) => e.method === 'Network.responseReceived' && e.params.response.status >= 400 && !e.params.response.url.includes('favicon')).map((e) => e.params.response.status + ' ' + e.params.response.url);
check('no failed requests', failed.length === 0, failed.slice(0, 5).join(' ; '));
const posted = events.filter((e) => e.method === 'Network.requestWillBeSent' && /feedback/.test(e.params.request.url)).length;
check('no feedback request left the browser', posted === 0, posted);

const ok = results.filter((r) => r.ok).length;
const tag = new URL(BASE).host.replace(/:\d+$/, '').replace(/\W+/g, '_');
fs.writeFileSync(new URL(`./final_round_${FULL ? 'full' : 'readonly'}_${tag}.json`, import.meta.url), JSON.stringify({ base: BASE, passed: ok, total: results.length, results }, null, 1));
console.log(`\n${ok}/${results.length} checks passed  (${BASE})`);
ws.close(); proc.kill();
process.exit(ok === results.length ? 0 : 1);
