// Real-browser User Journey for Tab 1 step 04 and the temporary activity mode (headless Edge via DevTools, Node 22+).
//   python scripts/dev_server.py   (port 3000)   then   node tests/e2e/step04_journey.mjs
// Counts real /recommendations requests. A virtual clock (Date shim) near Valentine's Day makes the reminder appear; it only exists in this test page.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EDGE = process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.BASE || 'http://localhost:3000/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(EDGE, ['--headless=new', '--remote-debugging-port=9337', `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'edge-j-'))}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { await fetch('http://127.0.0.1:9337/json/version'); break; } catch { await sleep(250); } }
const tab = await (await fetch('http://127.0.0.1:9337/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r) => { ws.onopen = r; });
let id = 0; const pend = new Map(); const events = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method) events.push(d); };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, (d) => (d.error ? rej(new Error(d.error.message)) : res(d.result))); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };
for (const d of ['Runtime', 'Log', 'Page']) await send(d + '.enable');

// virtual clock: 2027-02-13 10:00 Bangkok, installed before any page script runs; counts recommendation calls
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{const T=Date.parse('2027-02-13T10:00:00+07:00'),D0=Date,off=T-D0.now();
  class FD extends D0{constructor(...a){a.length?super(...a):super(D0.now()+off);} static now(){return D0.now()+off;}} window.Date=FD;
  window.__rec=0; const f=window.fetch; window.fetch=function(u,o){ if(String(u).includes('/recommendations')) window.__rec++; return f.apply(this,arguments); }; })();` });

const results = []; const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); };
const W = (js) => ev(`(async()=>{const w=(m)=>new Promise(r=>setTimeout(r,m)); const until=async(fn,t=8000)=>{const s=Date.now(); while(Date.now()-s<t){ if(fn()) return true; await w(80);} return false;};
  const txt=(b)=>b.textContent.trim(); const btn=(t,root=document)=>[...root.querySelectorAll('button')].find(b=>txt(b).includes(t));
  const ready=async()=>{ await w(150); await until(()=>!document.querySelector('.spinner')); await w(100); }; ${js} })()`);

const HELP = `
const wishBtns=()=>[...document.querySelectorAll('.wish-grid .wish-card')];
const top5=()=>[...document.querySelectorAll('article.card.place h3')].map(e=>e.textContent.trim());
const step=()=>document.querySelector('.progress li.on .lab')?.textContent.trim();
const sel=()=>wishBtns().filter(b=>b.getAttribute('aria-pressed')==='true').map(b=>b.textContent.trim());
const goStep=async(n)=>{ document.querySelectorAll('.progress li button')[n-1].click(); await w(300); await ready(); };
`;

async function run(W_, H_) {
  console.log(`\n== ${W_}x${H_}`);
  await send('Emulation.setDeviceMetricsOverride', { width: W_, height: H_, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: BASE }); await sleep(2500);
  await ev(`localStorage.clear()`); await send('Page.navigate', { url: BASE }); await sleep(2500);
  const labels = await ev(`fetch('/api/mumu/catalog').then(r=>r.json()).then(c=>c.wishes.map(w=>[w.id,w.label]))`);
  const L = Object.fromEntries(labels);
  const lab = (i) => L[i];
  // ---- A: 3 interests incl. W01, follow Valentine with a reminder
  await W(`${HELP} btn('เริ่มมูของฉัน').click(); await w(300);
    for (const t of ${JSON.stringify([lab('W01'), lab('W02'), lab('W03')])}) { wishBtns().find(b=>txt(b).includes(t)).click(); await w(80);}
    btn('ถัดไป').click(); await w(300); btn('ถัดไป').click(); await w(300); await ready(); return step();`);
  const hasValentine = await W(`const c=document.querySelector('.fixed-card'); return !!c;`);
  check('A0 Valentine card shows in step 04 when W01 chosen', hasValentine);
  const unread = await W(`return document.querySelector('.hdr-tools .badge')?.textContent || '0'`);
  check('A1 the bell counts related items by itself (nothing followed or ticked)', Number(unread) >= 1, 'badge=' + unread);
  await W(`document.querySelector('.fixed-card [data-save]').click(); await w(400); return 1;`);   // saved, so it stays listed when the interests change

  // ---- B: change interests to W02,W03,W04 (W01 off) and read the baseline Top 5
  await W(`${HELP} await goStep(2); wishBtns().find(b=>txt(b).includes(${JSON.stringify(lab('W01'))})).click(); await w(100);
    wishBtns().find(b=>txt(b).includes(${JSON.stringify(lab('W04'))})).click(); await w(100); btn('ถัดไป').click(); await w(300); btn('ถัดไป').click(); await w(300); await ready(); return 1;`);
  const interestsBefore = await W(`${HELP} await goStep(2); return sel();`);
  await W(`${HELP} await goStep(4); await ready(); return 1;`);
  const hasChoose = await W(`${HELP} return {select:document.querySelectorAll('select').length, all:!!document.querySelector('[data-focus=ALL]'), title:document.querySelector('.step-title')?.textContent, backTxt: !!btn('เปลี่ยนความสนใจ')}`);
  check('T1a no dropdown in step 04', hasChoose.select === 0, JSON.stringify(hasChoose));
  check('T1b "ดูทุกเรื่อง" exists (3 interests) and new heading + back label', hasChoose.all && hasChoose.title.includes('สำรวจความเชื่อมโยงของเรื่องที่คุณสนใจ') && hasChoose.backTxt);
  await W(`${HELP} btn('ดูสถานที่ที่เหมาะกับคุณ').click(); await w(300); await ready(); return 1;`);   // the real next button: step 05 is not reachable from the dots before it
  const base = await W(`${HELP} await ready(); return top5()`);
  check('B0 baseline Top 5 has items', base.length > 0, base.join(' | ') + ' ' + (base.length ? '' : await W("return document.body.innerText.slice(0,500).replace(/\\s+/g,' ')")));

  // ---- friend feedback 3-4: chips only in the detail modal; events that cannot remind say "บันทึกไว้" and show no checkboxes
  const modal = await W(`${HELP} btn('ดูรายละเอียด').click(); await w(800); await ready(); const d=document.querySelector('dialog[open]'); const r={chips:d?[...d.querySelectorAll('.chip')].map(c=>c.className).filter(c=>/st-/.test(c)).length:-1}; d?.close(); return r;`);
  check('T3b status chips still shown in the place detail modal', modal.chips > 0, JSON.stringify(modal));
  const evc = await W(`const m=await import('/js/notifyui.js'); let e=null; for (const wid of ['W02','W03','W04','W05','W06','W07','W08','W09','W10']) { const R=await fetch('/api/mumu/recommendations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({wish_ids:[wid],birthdate:null,exclusions:{tradition_groups:[],deity_ids:[],place_ids:[]}})}).then(r=>r.json()); window.__rec--; e=(R.events&&R.events.eligible||[])[0]; if(e) break; }
    if(!e) return {none:true}; const card=m.eventCard(m.snapNetwork(e),{}); document.body.append(card); const b=card.querySelector('button'); const t0=b.textContent; b.click(); await w(300); card.remove();
    const card2=m.eventCard(m.snapNetwork(e),{}); document.body.append(card2);   // the page redraws after a follow; draw the same card again
    const out={before:t0, after:card2.querySelector('button').textContent, boxes:card2.querySelectorAll('input[type=checkbox]').length, reason:card2.textContent.includes('ไม่มีวันเตือนล่วงหน้า เพราะ')}; card2.remove(); (await import('/js/state.js')).store().unfollow(e.event_id); return out;`);
  check('T4 network event: "บันทึกไว้" wording, no checkboxes, reason shown', evc.none ? true : (evc.before.includes('บันทึกไว้') && evc.after.includes('บันทึกไว้แล้ว') && evc.boxes === 0 && evc.reason), JSON.stringify(evc));

  // ---- Acceptance 1: switching cards = 0 recompute, Top 5 unchanged
  await W(`${HELP} await goStep(4); await ready(); return 1;`);
  const rec0 = await ev(`window.__rec`);
  await W(`${HELP} const names=[...document.querySelectorAll('[data-focus]')].map(b=>b.dataset.focus); for (const f of names.concat(names.slice().reverse(), ['ALL'])) { document.querySelector('[data-focus="'+f+'"]').click(); await w(150);} return 1;`);
  const rec1 = await ev(`window.__rec`);
  // "ดูทุกเรื่อง": every chosen interest that has a place in the computed Top 5 is represented in the preview
  await W(`document.querySelector('[data-focus=ALL]').click(); await w(200); return 1;`);
  const rep = await W(`${HELP} const top=await fetch('/api/mumu/recommendations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({wish_ids:${JSON.stringify(['W02', 'W03', 'W04'])},birthdate:null,exclusions:{tradition_groups:[],deity_ids:[],place_ids:[]}})}).then(r=>r.json()); window.__rec--;
    const want=['W02','W03','W04'].filter(x=>top.top5.some(p=>p.matched_wish_ids.includes(x))); const got=[...document.querySelectorAll('[data-preview-place]')].map(e=>e.dataset.previewPlace);
    const miss=(document.querySelector('[data-missing-wishes]')?.dataset.missingWishes||'').split(',').filter(Boolean);
    const covered=want.every(x=>{ const p=top.top5.find(p=>p.matched_wish_ids.includes(x)); return got.includes(p.place_id); });
    return {covered, got:got.length, want:want.length, miss};`);
  check('T1f "ดูทุกเรื่อง" preview represents every interest that has a Top 5 place', rep.covered && rep.got >= 1 && rep.got <= 3 && rep.miss.length === ([...['W02', 'W03', 'W04']].length - rep.want), JSON.stringify(rep));
  const defaultAll = await W(`return document.querySelector('[data-focus=ALL]').getAttribute('aria-pressed')`);
  check('T1c switching cards made 0 recommendation calls', rec1 === rec0, `calls ${rec0}->${rec1}`);
  check('T1d "ดูทุกเรื่อง" selected after cycling back', defaultAll === 'true');
  await W(`${HELP} await goStep(5); return 1;`);
  const afterCards = await W(`${HELP} return top5()`);
  check('Acc1 Top 5 unchanged after card switching', JSON.stringify(afterCards) === JSON.stringify(base));
  const noChips = await W(`return {chips:[...document.querySelectorAll('article.card.place .chip')].filter(c=>/CANDIDATE|UNVERIFIED|SOURCE|SYNTHETIC/.test(c.className+c.textContent)).length}`);
  check('T3a no technical status chips on step 05 cards', noChips.chips === 0);

  // ---- Acceptance 2: "มูเรื่องนี้ต่อ" from an activity outside the interests
  const R0 = await ev(`window.__rec`);
  await W(`document.querySelector('.hdr-tools button').click(); await w(400); const b=[...document.querySelectorAll('[data-inbox-item="CAL_VALENTINE"] button')].find(b=>b.textContent.includes('มูเรื่องนี้ต่อ')); b.click(); await w(300); await ready(); return 1;`);
  const inMode = await W(`${HELP} return {step:step(), banner: document.querySelector('[data-activity-mode]')?.textContent||''}`);
  const R1 = await ev(`window.__rec`);
  check('Acc2a exactly 1 recompute after "มูเรื่องนี้ต่อ"', R1 - R0 === 1, `calls ${R0}->${R1}`);
  check('Acc2b banner shown in step 07 with activity name', inMode.banner.includes('กำลังดูคำแนะนำตามกิจกรรม') && inMode.banner.includes('วาเลนไทน์'), inMode.banner.slice(0, 80));
  const bannerSteps = {};
  for (const n of [4, 5, 6, 7]) { bannerSteps[n] = await W(`${HELP} await goStep(${n}); return !!document.querySelector('[data-activity-mode]') && !!btn('กลับไปความสนใจเดิม')`); }
  check('Acc2c banner + back button present in steps 04-07', Object.values(bannerSteps).every(Boolean), JSON.stringify(bannerSteps));
  const interestsInMode = await W(`${HELP} await goStep(2); const s=sel(); await goStep(4); return s;`);
  check('Acc2d Step 02 interests unchanged while in activity mode', JSON.stringify(interestsInMode) === JSON.stringify(interestsBefore), interestsInMode.join(','));
  await W(`${HELP} await goStep(4); return 1;`);
  const noCardsInMode = await W(`return document.querySelectorAll('[data-focus]').length`);
  check('Acc2e no interest cards (filter) offered in activity mode', noCardsInMode === 0);

  // ---- Acceptance 3: back to the original interests
  await W(`${HELP} await goStep(5); await ready(); btn('กลับไปความสนใจเดิม').click(); await w(300); await ready(); return 1;`);
  const restored = await W(`${HELP} const b=!!document.querySelector('[data-activity-mode]'); await goStep(5); await ready(); return {banner:b, top:top5()}`);
  check('Acc3 Top 5 back to the 3-interest result, no banner', !restored.banner && JSON.stringify(restored.top) === JSON.stringify(base));

  // ---- Acceptance 5: enter/leave several times
  let stable = true, last = null;
  for (let i = 0; i < 3; i++) {
    await W(`document.querySelector('.hdr-tools button').click(); await w(300); [...document.querySelectorAll('[data-inbox-item="CAL_VALENTINE"] button')].find(b=>b.textContent.includes('มูเรื่องนี้ต่อ')).click(); await w(300); await ready(); return 1;`);
    const inTop = await W(`${HELP} await goStep(5); await ready(); return {top:top5(), mode:!!document.querySelector('[data-activity-mode]')}`);
    if (!inTop.mode || (last && JSON.stringify(inTop.top) !== JSON.stringify(last))) stable = false;
    last = inTop.top;
    await W(`${HELP} btn('กลับไปความสนใจเดิม').click(); await w(300); await ready(); return 1;`);
    const out = await W(`${HELP} await goStep(5); await ready(); const r={top:top5(), mode:!!document.querySelector('[data-activity-mode]')}; await goStep(2); r.s2=sel(); return r;`);
    if (JSON.stringify(out.top) !== JSON.stringify(base) || out.mode || JSON.stringify(out.s2) !== JSON.stringify(interestsBefore)) stable = false;
  }
  check('Acc5 3 enter/leave cycles: activity Top 5 stable, original Top 5 restored, Step 02 untouched', stable);

  // ---- Acceptance 4: no interests at all (page reload keeps the saved Valentine in the bell)
  await send('Page.navigate', { url: BASE }); await sleep(2500);
  await W(`${HELP} btn('เริ่มมูของฉัน').click(); await w(300); return 1;`);
  await W(`document.querySelector('.hdr-tools button').click(); await w(400); const b=[...document.querySelectorAll('[data-inbox-item="CAL_VALENTINE"] button')].find(b=>b.textContent.includes('มูเรื่องนี้ต่อ')); if(!b) return 'nobtn'; b.click(); await w(300); await ready(); return 1;`);
  const st4 = await W(`${HELP} const r={step:step(), banner:!!document.querySelector('[data-activity-mode]')}; await goStep(2); r.s2=sel(); return r;`);
  check('Acc4a no interests + "มูเรื่องนี้ต่อ": temporary mode on, Step 02 still empty', st4.banner === true && st4.s2.length === 0, JSON.stringify(st4));
  await W(`${HELP} await goStep(5); await ready(); btn('กลับไปความสนใจเดิม').click(); await w(300); return 1;`);
  const st4b = await W(`${HELP} return {step:step(), sel:sel(), banner:!!document.querySelector('[data-activity-mode]')}`);
  check('Acc4b back button with no interests goes to Step 02, nothing saved', /2/.test(st4b.step) && st4b.sel.length === 0 && !st4b.banner, JSON.stringify(st4b));

  // single interest: "ดูทุกเรื่อง" is hidden
  await W(`${HELP} btn('เริ่มมูของฉัน')?.click(); await w(200); await goStep(2); wishBtns()[0].click(); await w(100); btn('ถัดไป').click(); await w(300); btn('ถัดไป').click(); await w(300); await ready(); return 1;`);
  const single = await W(`return {all:!!document.querySelector('[data-focus=ALL]'), cards:document.querySelectorAll('[data-focus]').length}`);
  check('T1e "ดูทุกเรื่อง" hidden when only one interest is chosen', !single.all && single.cards === 1, JSON.stringify(single));

  const errs = events.filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error' && !String(e.params.entry.url || '').includes('favicon'))).map((e) => JSON.stringify(e.params).slice(0, 200));
  check('no console errors', errs.length === 0, errs.join(' ; '));
  events.length = 0;
}
for (const [w, h] of [[1366, 768], [1920, 1080]]) await run(w, h);
await send('Browser.close').catch(() => {}); proc.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
fs.writeFileSync(new URL('./step04_journey_result.json', import.meta.url), JSON.stringify(results, null, 1));
process.exit(failed.length ? 1 : 0);
