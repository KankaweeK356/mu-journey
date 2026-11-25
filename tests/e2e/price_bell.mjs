// Real-browser checks for trip price and rounds, the proactive bell and the Tab 2 reminder view (headless Edge, Node 22+).
//   node tests/e2e/price_bell.mjs <BASE_URL> [screenshot_dir]
// The clock is fixed inside the test page (25 Nov 2026, later 5 Jan 2027) so results do not depend on the day it runs.
// POST /api/feedback is blocked inside the page, so no test answer can reach the Google Sheet.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '') + '/';
const SHOTS = process.argv[3] || null;
const EDGE = process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9351;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'edge-pb-'))}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(250); } }
const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r) => { ws.onopen = r; });
let id = 0; const pend = new Map(); const events = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method) events.push(d); };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, (d) => (d.error ? rej(new Error(d.error.message)) : res(d.result))); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 700)); return r.result.value; };
for (const d of ['Runtime', 'Log', 'Page', 'Network']) await send(d + '.enable');
const clock = (iso) => `(()=>{const T=Date.parse('${iso}'),D0=Date,off=T-D0.now(); class FD extends D0{constructor(...a){a.length?super(...a):super(D0.now()+off);} static now(){return D0.now()+off;}} window.Date=FD;
  const f=window.fetch; window.__feedback=0; window.fetch=function(u,o){ if(/feedback/.test(String(u))){ window.__feedback++; return Promise.reject(new Error('blocked by test')); } return f.apply(this,arguments); }; })();`;
let script = null;
async function setClock(iso) { if (script) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: script }); script = (await send('Page.addScriptToEvaluateOnNewDocument', { source: clock(iso) })).identifier; }

const results = []; const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info: String(info).slice(0, 400) }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  ' + String(info).slice(0, 400))); };
const HELP = `const w=(m)=>new Promise(r=>setTimeout(r,m)); const until=async(fn,t=20000)=>{const s=Date.now(); while(Date.now()-s<t){ if(fn()) return true; await w(100);} return false;};
const txt=(b)=>b.textContent.trim(); const q=(s,r=document)=>r.querySelector(s); const qa=(s,r=document)=>[...r.querySelectorAll(s)]; const btn=(t,r=document)=>qa('button',r).find(b=>txt(b).includes(t));
const ready=async()=>{ await until(()=>!qa('.app1 .spinner').length); await w(300); };
const next=async(t)=>{ btn(t).click(); await w(300); await ready(); };
const badge=()=>{ const b=q('.hdr-tools .badge'); return b && !b.hidden ? Number(b.textContent) : 0; };`;
const W = (js) => ev(`(async()=>{${HELP} ${js} })()`);
const health = () => ev(`(()=>{ const bad=[]; const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT); let n; while((n=walk.nextNode())){ if(/(^|[\\s:(])(null|undefined|NaN)([\\s).]|$)/.test(n.textContent.trim()) && !n.parentElement.closest('script,style')) bad.push(n.textContent.slice(0,60)); }
  return { bad, overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth, unnamed: [...document.querySelectorAll('button')].filter(b=>b.getClientRects().length && !(b.textContent.trim()||b.getAttribute('aria-label'))).length }; })()`);
async function healthy(where) { const h = await health(); check(`${where}: no null text, no horizontal scroll, buttons named`, !h.bad.length && h.overflow <= 1 && !h.unnamed, JSON.stringify(h)); }
async function shot(name, selector) {
  if (!SHOTS) return;
  if (selector) await W(`q('${selector}')?.scrollIntoView({block:'center'}); await w(400); return 1;`);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(SHOTS, { recursive: true }); fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.data, 'base64'));
}
async function load(width, height) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
  await send('Page.navigate', { url: BASE }); await sleep(2200);
  await ev(`localStorage.clear()`); await send('Page.navigate', { url: BASE }); await sleep(2200);
}
const toStep4 = (wish, groups = []) => `btn('เริ่มมูของฉัน').click(); await w(300); qa('.wish-card').find(b=>txt(b).includes('${wish}')).click(); await w(100); btn('ถัดไป').click(); await w(300);
  for(const g of ${JSON.stringify(groups)}) qa('.tchip').find(b=>txt(b)===g).click(); btn('ถัดไป').click(); await w(300); await ready(); await w(700);`;
const toStep6 = `await next('ดูสถานที่ที่เหมาะกับคุณ'); await next('ดูทริปที่เหมาะกับฉัน'); await until(()=>q('[data-price]')||q('[data-no-trip]')); await w(300);`;

const TRIPS = [['ความรัก', 'TRIP_LOVE', '899', '899 บาท', '09:00–13:15'], ['การงาน', 'TRIP_CAREER', '1099', '1,099 บาท', '09:00–14:00'], ['การเงิน', 'TRIP_WEALTH', '999', '999 บาท', '09:00–13:15']];
const SIZES = [['desktop', 1366, 800], ['mobile', 375, 812]];

/** ① book (simulated) → ② used (simulated) → ③ feedback. The feedback answer is given by the page itself: nothing leaves the browser. */
async function bookingJourney(size, width, height) {
  const snap = `JSON.stringify(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]))+'|'+document.cookie`;
  const capture = `window.__bodies=[]; window.__net=0; const real=window.fetch; window.fetch=function(u,o){ if(String(u).includes('feedback')){ window.__bodies.push(JSON.parse(o.body)); return Promise.resolve(new Response(JSON.stringify({saved:false,mode:'not_configured',retryable:false,message:'x'}),{status:200,headers:{'content-type':'application/json'}})); } window.__net++; return real.apply(this,arguments); };`;
  await load(width, height);
  await W(`${toStep4('ความรัก')} ${toStep6} return 1;`);
  const s1 = await W(`const b=q('[data-book-trip]'); const a={disabled:b.disabled, label:b.textContent}; q('[data-round="2026-12-06"]').click(); await w(400); const chip=q('[data-round="2026-12-06"]');
    a.mark=getComputedStyle(chip,'::before').content; a.bg=getComputedStyle(chip).backgroundColor; a.enabled=!q('[data-book-trip]').disabled; return a;`);
  check(`${size} booking: needs a date first; the chosen date shows a tick, not a cross`, s1.disabled && s1.label.includes('เลือกวันก่อน') && s1.mark.includes('✓') && !s1.mark.includes('✕') && s1.enabled, JSON.stringify(s1));
  const before = await ev(snap);
  const s2 = await W(`${capture} q('[data-book-trip]').click(); await w(400); const d=q('dialog[open]'); return { head:d.querySelector('h3').textContent, text:d.textContent, used:!!d.querySelector('[data-mock-used]'), net:window.__net, sent:window.__bodies.length };`);
  check(`${size} booking: simulated success with date, time, meeting point, price and "no real booking"`, s2.head.includes('จองจำลองสำเร็จ') && ['6 ธ.ค. 2569', '09:00–13:15', 'BTS สยาม', '899 บาท', 'ไม่มีการจองจริง ไม่มีที่นั่งถูกสำรอง ไม่ต้องชำระเงิน'].every((t) => s2.text.includes(t)) && s2.used && s2.net === 0 && s2.sent === 0, JSON.stringify({ ...s2, text: s2.text.slice(0, 200) }));
  await shot(`${size}_booking_trip_success`);
  const s3 = await W(`q('[data-mock-used]').click(); await w(500); const d=q('dialog[open]'); const a={ note:q('[data-after-use]',d)?.textContent||'', service:qa('[aria-label="ประเภทบริการที่สนใจ"] button[aria-pressed=true]',d).map(txt), interest:qa('[data-interest][aria-pressed=true]',d).length, stars:qa('.stars .on',d).length, consent:q('#fb-consent',d).checked, sent:window.__bodies.length };
    return a;`);
  check(`${size} booking: feedback opens for the trip, says it rates the demo, nothing pre-answered or sent`, s3.note.includes('ไม่ใช่บริการจริง') && s3.service.join() === 'ทริปบริษัท' && s3.interest === 0 && s3.stars === 0 && !s3.consent && s3.sent === 0, JSON.stringify(s3));
  await shot(`${size}_booking_feedback`);
  await healthy(`${size} booking feedback`);
  const body = await W(`const d=q('dialog[open]'); q('[data-interest=YES]',d).click(); await w(100); q('[aria-label="5 ดาว"]',d).click(); await w(100); q('#fb-consent',d).click(); btn('ส่งความคิดเห็น',d).click(); await w(600); const b=window.__bodies[0]; q('dialog[open]')?.close(); return b;`);
  check(`${size} booking: only the usual feedback fields would be sent (no date, no booking data)`, body && body.kind === 'trip' && body.trip_id === 'TRIP_LOVE' && body.consent === true && !/2026-12|booking|date|name|คำขอ/.test(JSON.stringify(body)), JSON.stringify(body));
  check(`${size} booking: nothing written to browser storage`, before === await ev(snap));
  // proxy
  const p = await W(`await next('ดูรายละเอียดทริปและบริการ'); q('[data-svc="proxy"]').click(); await until(()=>q('[data-book-proxy]')); const id=q('[data-book-proxy]').dataset.bookProxy; window.__bodies.length=0; q('[data-book-proxy]').click(); await w(300); const d=q('dialog[open]'); d.querySelector('input').value='สมมติ ทดสอบ'; d.querySelector('textarea').value='คำขอตัวอย่าง'; window.__net=0; q('[data-confirm-proxy]',d).click(); await w(400);
    const s={head:q('dialog[open] h3').textContent, text:q('dialog[open]').textContent, net:window.__net}; await w(100); return {id, ...s};`);
  check(`${size} proxy booking: simulated success, no provider, no payment, nothing sent`, p.head.includes('จองจำลองสำเร็จ') && p.text.includes('สมมติ ทดสอบ') && p.text.includes('ไม่มีผู้ให้บริการรับคำขอจริง') && p.net === 0, JSON.stringify({ ...p, text: p.text.slice(0, 200) }));
  await shot(`${size}_booking_proxy_success`);
  const pb = await W(`q('[data-mock-used]').click(); await w(400); const d=q('dialog[open]'); const service=qa('[aria-label="ประเภทบริการที่สนใจ"] button[aria-pressed=true]',d).map(txt); const comment=d.querySelector('textarea').value; q('[data-interest=MAYBE]',d).click(); await w(100); q('[aria-label="3 ดาว"]',d).click(); await w(100); q('#fb-consent',d).click(); btn('ส่งความคิดเห็น',d).click(); await w(600); const b=window.__bodies[0]; q('dialog[open]')?.close(); return {service, comment, b};`);
  check(`${size} proxy booking: feedback for the offer, without the sample name or request`, pb.service.join() === 'ฝากมู' && pb.comment === '' && pb.b && pb.b.kind === 'proxy' && pb.b.offer_id === p.id && !/ทดสอบ|คำขอตัวอย่าง/.test(JSON.stringify(pb.b)), JSON.stringify(pb));
}

await setClock('2026-11-25T10:00:00+07:00');
for (const [size, width, height] of SIZES) {
  console.log(`\n== ${size} on ${BASE}`);
  for (const [wish, trip, price, priceShown, time] of TRIPS) {
    await load(width, height);
    await W(`${toStep4(wish)} ${toStep6} return 1;`);
    const c = await W(`const p=q('[data-product]'); return { trip:p?.dataset.product, price:q('[data-price]')?.dataset.price, shown:q('[data-price]')?.textContent, size:parseFloat(getComputedStyle(q('[data-price]')).fontSize), time:q('[data-time]')?.textContent, cap:q('[data-capacity]')?.textContent, meet:q('[data-meeting]')?.textContent,
      next:q('[data-next-round]')?.dataset.nextRound, rounds:qa('[data-round]').map(b=>b.dataset.round), chosen:qa('[data-round][aria-pressed=true]').length, mock:p?.textContent.includes('ราคาและรอบเดินทางเป็นข้อมูลจำลอง ยังไม่เปิดรับจองจริง'), old:document.body.textContent.includes('ยังไม่กำหนด') };`);
    check(`${size} AC01 ${trip}: price shown correctly and clearly`, c.trip === trip && c.price === price && c.shown.includes(priceShown) && c.size >= 24 && !c.old, JSON.stringify(c));
    check(`${size} AC02 ${trip}: next round and 8 weekend rounds from the schedule`, c.next === '2026-12-05' && c.rounds.join() === ['05', '06', '12', '13', '19', '20', '26', '27'].map((d) => '2026-12-' + d).join() && c.chosen === 0, JSON.stringify(c.rounds));
    check(`${size} AC04 ${trip}: time, capacity 10, meeting point, mock label`, c.time.includes(time) && c.cap.includes('รับสูงสุด 10 คน/รอบ') && c.meet.includes('BTS สยาม') && c.mock, JSON.stringify(c));
    await shot(`${size}_step06_${trip}`, '[data-product]');
    const pick = await W(`q('[data-round="2026-12-12"]').click(); await w(400); const a={pressed:qa('[data-round][aria-pressed=true]').map(b=>b.dataset.round), status:q('[data-product] [role=status]').textContent};
      await next('ดูรายละเอียดทริปและบริการ'); q('[data-svc="trip"]').click(); await w(900); a.s7=q('[data-chosen-date]')?.dataset.chosenDate; a.note=q('[data-trip-tbd]')?.textContent||''; a.interest=!!btn('แสดงความสนใจทริป (Demo)'); return a;`);
    check(`${size} AC03 ${trip}: date can be chosen and follows to step 07 with price; interest button kept`, pick.pressed.join() === '2026-12-12' && pick.status.includes('12 ธ.ค. 2569') && pick.s7 === '2026-12-12' && pick.note.includes(priceShown) && pick.note.includes('การจองล่วงหน้า: ยังไม่เปิดจอง') && pick.interest, JSON.stringify(pick));
    await shot(`${size}_step07_${trip}`, '[data-trip-tbd]');
    await healthy(`${size} ${trip} step 07`);
  }
  await bookingJourney(size, width, height);
  // AC06: no eligible trip keeps behaving as before and shows no price
  await load(width, height);
  await W(`${toStep4('บ้าน/ที่ดิน')} ${toStep6} return 1;`);
  const none = await W(`return { cause:q('[data-no-trip]')?.dataset.noTrip, price:!!q('[data-price]'), code:document.body.textContent.includes('NO_ELIGIBLE_SIGNATURE_TRIP') };`);
  check(`${size} AC06 no eligible trip: unchanged, no price or round`, none.cause === 'COVERAGE' && !none.price && none.code, JSON.stringify(none));
  await shot(`${size}_step06_no_trip`);

  // ---- proactive bell
  await load(width, height);
  const before = await W(`return badge();`);
  await W(`${toStep4('ความรัก')} return 1;`);
  const n = await W(`return badge();`);
  check(`${size} bell: empty before interests, counts by itself at step 04`, before === 0 && n >= 1 && n <= 5, `${before} -> ${n}`);
  const bell = await W(`q('.hdr-tools button').click(); await w(600); const d=q('dialog.nc[open]'); const items=qa('[data-inbox-item]',d); return { items:items.length, ids:items.map(x=>x.dataset.inboxItem), groups:qa('[data-inbox-group]',d).map(x=>x.dataset.inboxGroup), badge:badge(),
    dates:qa('[data-inbox-item="CAL_VALENTINE"] [data-remind-date]',d).map(x=>x.dataset.remindDate), unconfirmed:items.filter(x=>x.dataset.group==='EVENT').every(x=>x.querySelector('[data-no-reminder]') && x.textContent.includes('กำหนดการยังไม่ยืนยัน')),
    why:items.every(x=>x.textContent.includes('เกี่ยวข้องเพราะ')), go:items.every(x=>btn('มูเรื่องนี้ต่อ',x)), boxes:qa('input[type=checkbox]',d).length, bar:!!q('.nbar'), follow:!!btn('＋ ติดตาม') };`);
  check(`${size} bell: related items in two groups, badge cleared on open, no tick boxes / follow / bottom bar`, bell.items === n && bell.ids.includes('CAL_VALENTINE') && bell.groups[0] === 'DAY' && bell.badge === 0 && bell.boxes === 0 && !bell.bar && !bell.follow, JSON.stringify(bell));
  check(`${size} bell #6: confirmed day says when it will be marked near; unconfirmed activities say no reminder date`, bell.dates.join() === '2027-02-07' && bell.unconfirmed && bell.why && bell.go, JSON.stringify(bell));
  await shot(`${size}_bell`);
  await healthy(`${size} bell`);
  const gone = await W(`const d=q('dialog.nc[open]'); q('[data-dismiss="CAL_VALENTINE"]',d).click(); await w(300); const left=qa('[data-inbox-item]').map(x=>x.dataset.inboxItem); q('dialog.nc .dlg-h button').click(); return left;`);
  check(`${size} bell: a dismissed item leaves the list`, !gone.includes('CAL_VALENTINE') && gone.length === n - 1, gone.join());

  // ---- Tab 2 section I
  await W(`document.getElementById('main-t-analytics').click(); await w(2500); document.getElementById('a2-t-lab').click(); await w(800); qa('#a2-p-lab .persona')[0].click(); await w(300); document.getElementById('run-ppr').click(); await until(()=>q('#a2-p-lab [data-suggest]')); await w(1500); return 1;`);
  const t2 = await W(`const box=q('[data-proactive]'); const a={ suggest:qa('[data-suggest]',box).map(x=>x.dataset.suggest), folded:q('[data-technical]').open===false, timelines:qa('[data-timeline]',box).length };
    q('[data-remind-me="VALENTINE"]').click(); await w(400); a.rows=qa('[data-timeline="VALENTINE"] tbody tr').map(r=>r.textContent); return a;`);
  check(`${size} Tab 2 I: proposes from the interest, technical panel folded, one tap shows the schedule`, t2.suggest.join() === 'VALENTINE' && t2.folded && t2.timelines === 0 && t2.rows.length === 2 && /7 ก\.พ\. 2570/.test(t2.rows[0]) && /13 ก\.พ\. 2570/.test(t2.rows[1]), JSON.stringify(t2));
  await shot(`${size}_tab2_proactive`, '[data-proactive]');
  await healthy(`${size} Tab 2 I`);
  const t3 = await W(`qa('#a2-p-lab .persona')[2].click(); await w(300); q('#a2-p-lab details summary').click(); await w(200); qa('#a2-p-lab .chips button').find(b=>txt(b).includes('การเรียน/สอบ')).click(); await w(300); document.getElementById('run-ppr').click(); await until(()=>q('[data-suggest="EXAM_DATE"]')); await w(800);
    q('[data-remind-me="EXAM_DATE"]').click(); await w(300); q('[data-remind-me="TICKET"]').click(); await w(300); return { suggest:qa('[data-suggest]').map(x=>x.dataset.suggest).sort(), exam:qa('[data-timeline="EXAM_DATE"] tbody tr').length, ticket:qa('[data-timeline="TICKET"] tbody tr').length };`);
  check(`${size} Tab 2 I: exam and concert interests get their own schedule`, t3.suggest.join() === 'EXAM_DATE,TICKET' && t3.exam === 3 && t3.ticket >= 1, JSON.stringify(t3));
  const tech = await W(`q('[data-technical] > summary').click(); await w(300); return { open:q('[data-technical]').open, run:!!btn('Run Reminder Check') };`);
  check(`${size} Tab 2 I: the 11-item test panel is still there`, tech.open && tech.run, JSON.stringify(tech));
  check(`${size} AC08: no feedback request was made`, await ev(`window.__feedback===0`));
}

// after the last scheduled round: say so, never make a date up
await setClock('2027-01-05T10:00:00+07:00');
for (const [size, width, height] of SIZES) {
  await load(width, height);
  await W(`${toStep4('ความรัก')} ${toStep6} return 1;`);
  const over = await W(`return { msg:q('[data-no-round]')?.textContent||'', rounds:qa('[data-round]').length, next:!!q('[data-next-round]'), price:q('[data-price]')?.dataset.price };`);
  check(`${size} no future round: message shown, no date invented`, over.msg.includes('ยังไม่มีรอบเดินทางในอนาคต') && over.rounds === 0 && !over.next && over.price === '899', JSON.stringify(over));
  await shot(`${size}_step06_no_round`, '[data-product]');
}

const errs = events.filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error' && !String(e.params.entry.url || '').includes('favicon'))).map((e) => JSON.stringify(e.params).slice(0, 200));
check('no console errors', errs.length === 0, errs.slice(0, 4).join(' ; '));
check('no feedback request left the browser', events.filter((e) => e.method === 'Network.requestWillBeSent' && /feedback/.test(e.params.request.url)).length === 0);
const ok = results.filter((r) => r.ok).length;
const tag = new URL(BASE).host.replace(/:\d+$/, '').replace(/\W+/g, '_');
fs.writeFileSync(new URL(`./price_bell_${tag}.json`, import.meta.url), JSON.stringify({ base: BASE, passed: ok, total: results.length, results }, null, 1));
console.log(`\n${ok}/${results.length} checks passed  (${BASE})`);
ws.close(); proc.kill();
process.exit(ok === results.length ? 0 : 1);
