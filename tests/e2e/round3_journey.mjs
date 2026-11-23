// Real-browser checks (headless Edge, DevTools protocol, Node 22+).
//   node tests/e2e/round3_journey.mjs <BASE_URL> tab2|ui|all
//   tab2 : all 5 Network Analytics sections, and Input -> Network Processing -> Output for MU Recommendation Lab and Trip Matching
//          (safe against production: it only reads and calls the same endpoints the page calls)
//   ui   : demo-only proxy form (no network, no storage, cleared on close), rating question V2, station names (run against a local server:
//          it never submits feedback)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '') + '/';
const MODE = process.argv[3] || 'all';
const EDGE = process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(EDGE, ['--headless=new', '--remote-debugging-port=9338', `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'edge-r3-'))}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { await fetch('http://127.0.0.1:9338/json/version'); break; } catch { await sleep(250); } }
const tab = await (await fetch('http://127.0.0.1:9338/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r) => { ws.onopen = r; });
let id = 0; const pend = new Map(); const events = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method) events.push(d); };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, (d) => (d.error ? rej(new Error(d.error.message)) : res(d.result))); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; };
for (const d of ['Runtime', 'Log', 'Page']) await send(d + '.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{ window.__calls=[]; const f=window.fetch; window.fetch=async function(u,o){ const r=await f.apply(this,arguments); const url=String(u); let body=null; if(o&&o.body){ try{ body=JSON.parse(o.body);}catch{} } let json=null; if(/\\/api\\//.test(url)){ try{ json=await r.clone().json(); }catch{} } window.__calls.push({url, method:(o&&o.method)||'GET', status:r.status, body, json}); return r; }; })();` });

const results = []; const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); };
const W = (js) => ev(`(async()=>{const w=(m)=>new Promise(r=>setTimeout(r,m)); const until=async(fn,t=15000)=>{const s=Date.now(); while(Date.now()-s<t){ if(fn()) return true; await w(100);} return false;};
  const txt=(b)=>b.textContent.trim(); const btn=(t,root=document)=>[...root.querySelectorAll('button')].find(b=>txt(b).includes(t)); ${js} })()`);
const findKey = `const findKey=(o,k)=>{ if(o&&typeof o==='object'){ if(k in o) return o[k]; for(const v of Object.values(o)){ const r=findKey(v,k); if(r!==undefined) return r; } } return undefined; };`;

async function load(width = 1366, height = 768) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: BASE }); await sleep(3000);
}

async function tab2() {
  console.log(`\n== Tab 2 on ${BASE}`);
  await load();
  await W(`document.getElementById('main-t-analytics').click(); await w(3000); return 1;`);
  const ids = ['explorer', 'lab', 'designer', 'matching', 'evaluation'];
  for (const sec of ids) {
    const r = await W(`document.getElementById('a2-t-${sec}').click(); await w(${sec === 'evaluation' ? 6000 : 3000}); const p=document.getElementById('a2-p-${sec}'); return {visible:!p.hidden, len:p.innerText.length, spinners:p.querySelectorAll('.spinner').length, errors:[...p.querySelectorAll('.callout.bad')].filter(e=>e.offsetParent&&e.textContent.trim()).map(e=>e.textContent.slice(0,80))}`);
    check(`T2 ${sec}: opens, content loaded, no spinner/error`, r.visible && r.len > 300 && r.spinners === 0 && r.errors.length === 0, JSON.stringify(r));
  }
  const bad = await ev(`window.__calls.filter(c=>c.status>=400).map(c=>c.url+' '+c.status)`);
  check('T2 no request failed (404/401/5xx) while opening the 5 sections', bad.length === 0, bad.join(' ; '));

  // ---- MU Recommendation Lab: Input -> Network Processing -> Output
  await W(`document.getElementById('a2-t-lab').click(); await w(800); window.__calls.length=0; document.querySelector('#a2-p-lab .persona').click(); await w(500); document.getElementById('run-ppr').click(); await until(()=>window.__calls.some(c=>/\\/api\\/trace/.test(c.url)&&c.json)); await w(2500); return 1;`);
  const lab = await W(`const c=window.__calls.find(c=>/\\/api\\/trace/.test(c.url)&&c.json); const p=document.getElementById('a2-p-lab'); const s5=c.json.step5_result; const topIds=s5.top5.map(x=>typeof x==='string'?x:x.place_id); const top=topIds.map(i=>(s5.names&&s5.names[i])||i);
    return {input:c.body, status:c.status, matches:s5.matches_reference, top, pageText:p.innerText, topIds}`);
  check('Lab Input: profile sent to the engine has wishes', lab.input && lab.input.wish_ids && lab.input.wish_ids.length >= 1, JSON.stringify(lab.input));
  check('Lab Network Processing: engine answered 200 and matches the reference model', lab.status === 200 && lab.matches === true, `status=${lab.status} matches_reference=${lab.matches}`);
  check('Lab Output: every Top 5 place is shown on the page', lab.top.length > 0 && lab.top.every((n) => lab.pageText.includes(n)), lab.top.join(' | '));
  const ref = await ev(`fetch('/api/mumu/recommendations',{method:'POST',headers:{'content-type':'application/json'},body:${JSON.stringify(JSON.stringify(lab.input))}}).then(r=>r.json()).then(j=>j.top5.map(p=>p.place_id))`);
  check('Lab Output equals the production recommendation endpoint for the same input', JSON.stringify(ref) === JSON.stringify(lab.topIds), `${ref.join(',')} vs ${lab.topIds.join(',')}`);

  // Trip Matching is verified strictly (page values vs the unmodified model, personas A and C, no fallback) in tests/e2e/matching_strict.mjs
}

async function ui() {
  console.log(`\n== UI on ${BASE}`);
  for (const [w, h] of [[1366, 768], [1920, 1080]]) {
    await load(w, h);
    await W(`btn('เริ่มมูของฉัน').click(); await w(300); const g=[...document.querySelectorAll('.wish-grid .wish-card')]; g[1].click(); g[2].click(); btn('ถัดไป').click(); await w(300); btn('ถัดไป').click(); await until(()=>!document.querySelector('.spinner')); await w(300);
      btn('ดูสถานที่ที่เหมาะกับคุณ').click(); await until(()=>!document.querySelector('.spinner')); await w(300); btn('ดูทริปที่เหมาะกับฉัน').click(); await until(()=>!document.querySelector('.spinner')); await w(300); btn('ดูรายละเอียดทริปและบริการ').click(); await until(()=>!document.querySelector('.spinner')); await w(300); return 1;`);
    console.log(`-- ${w}x${h}`);
    // proxy demo form
    await W(`[...document.querySelectorAll('.svc')].find(b=>b.textContent.includes('ฝากมู')).click(); await w(1500); return 1;`);
    const hasBtn = await W(`return !!btn('ลองกรอกคำขอ (Demo)')`);
    check('UI proxy: "ลองกรอกคำขอ (Demo)" button exists', hasBtn);
    if (hasBtn) {
      const before = await ev(`JSON.stringify(Object.keys(localStorage).sort())+'|'+document.cookie`);
      await W(`window.__calls.length=0; btn('ลองกรอกคำขอ (Demo)').click(); await w(400); const d=document.querySelector('dialog[open]'); d.querySelector('input').value='สมชาย ทดสอบ'; d.querySelector('textarea').value='ขอให้สอบผ่าน'; btn('ดูตัวอย่างสรุป',d).click(); await w(300); return 1;`);
      const shown = await W(`const d=document.querySelector('dialog[open]'); return {preview:d.querySelector('[data-proxy-preview]')?.innerText||'', warn:d.innerText.includes('ไม่มีผู้ให้บริการรับคำขอจริง')}`);
      check('UI proxy: preview shows the sample name/request and says no real provider', shown.preview.includes('สมชาย ทดสอบ') && shown.preview.includes('ขอให้สอบผ่าน') && shown.warn, shown.preview.replace(/\s+/g, ' ').slice(0, 90));
      await W(`btn('ปิดและล้างค่า',document.querySelector('dialog[open]')).click(); await w(300); return 1;`);
      const after = await ev(`JSON.stringify(Object.keys(localStorage).sort())+'|'+document.cookie`);
      const calls = await ev(`window.__calls.map(c=>c.method+' '+c.url)`);
      check('UI proxy: no network request was made while using the form', calls.length === 0, calls.join(' ; '));
      check('UI proxy: nothing written to browser storage', before === after, before + ' -> ' + after);
      await W(`btn('ลองกรอกคำขอ (Demo)').click(); await w(300); return 1;`);
      const re = await W(`const d=document.querySelector('dialog[open]'); const r={name:d.querySelector('input').value, wish:d.querySelector('textarea').value, preview:!!d.querySelector('[data-proxy-preview]')}; btn('ปิดและล้างค่า',d).click(); return r;`);
      check('UI proxy: values are cleared after closing (reopen is empty)', re.name === '' && re.wish === '' && !re.preview, JSON.stringify(re));
    }
    // rating + interest questions per service (open the form, never submit)
    const q = await W(`btn('แสดงความสนใจบริการ (Demo)').click(); await w(400); const d=document.querySelector('dialog[open]'); const out={title:d.querySelector('.dlg-h h3').textContent}; for (const t of ['ไปมูเอง','ทริปบริษัท','ฝากมู']) { [...d.querySelectorAll('[aria-label="ประเภทบริการที่สนใจ"] button')].find(b=>b.textContent.includes(t)).click(); await w(100); out[t]={rating:d.querySelector('[data-rating-question]').textContent, interest:d.querySelector('[data-interest-question]').textContent, choices:[...d.querySelectorAll('[data-interest]')].map(b=>b.textContent.trim()).join('/')}; } out.old=/สมหวัง|ผิดหวัง/.test(d.innerText); d.querySelector('.dlg-h button').click(); return out;`);
    const svc = ['ไปมูเอง', 'ทริปบริษัท', 'ฝากมู'];
    check('UI form: title is "แสดงความสนใจและให้คะแนนคำแนะนำ (Demo)"', q.title === 'แสดงความสนใจและให้คะแนนคำแนะนำ (Demo)', q.title);
    check('UI rating: question asks how well the recommendation matches the interest, per service', svc.every((t) => q[t].rating.includes('นี้ตรงกับความสนใจของคุณมากน้อยแค่ไหน')) && q.old === false, JSON.stringify(q).slice(0, 200));
    check('UI interest: "คุณสนใจ{ทริป/บริการ/สถานที่}ที่แนะนำนี้หรือไม่" with สนใจ/ยังไม่แน่ใจ/ไม่สนใจ', q['ไปมูเอง'].interest === 'คุณสนใจสถานที่ที่แนะนำนี้หรือไม่' && q['ทริปบริษัท'].interest === 'คุณสนใจทริปที่แนะนำนี้หรือไม่' && q['ฝากมู'].interest === 'คุณสนใจบริการฝากมูที่แนะนำนี้หรือไม่' && svc.every((t) => q[t].choices === 'สนใจ/ยังไม่แน่ใจ/ไม่สนใจ'), JSON.stringify(svc.map((t) => q[t].interest)));

    // status after sending, for every outcome. The browser answers in place of the server: NOTHING is sent anywhere.
    const outcomes = [['saved', true], ['not_configured', false], ['bad_webhook_host', false], ['rejected', false], ['unreachable', false], ['request_failed', false]];
    for (const [mode] of outcomes) {
      const r = await W(`window.__fbBodies=[]; const real=window.__realFetch||(window.__realFetch=window.fetch); window.fetch=async function(u,o){ if(String(u).includes('demo-feedback')){ window.__fbBodies.push(JSON.parse(o.body)); const m=${JSON.stringify(mode)}; if(m==='request_failed') throw new TypeError('Failed to fetch'); return new Response(JSON.stringify({saved:m==='saved',mode:m,retryable:m==='unreachable',message:'x'}),{status:200,headers:{'content-type':'application/json'}}); } return real.apply(this,arguments); };
        btn('แสดงความสนใจบริการ (Demo)').click(); await w(300); const d=document.querySelector('dialog[open]');
        const sendBtn=()=>btn('ส่งความคิดเห็น',d); sendBtn().click(); await w(150); const noInterest=d.querySelector('[role=alert]')?.textContent||'';
        d.querySelector('[data-interest=MAYBE]').click(); await w(100); d.querySelector('[aria-label="4 ดาว"]').click(); await w(100); d.querySelector('textarea').value='ทดสอบ'; d.querySelector('#fb-consent').click(); sendBtn().click(); await w(700);
        const box=document.querySelector('dialog[open]'); const st=box.querySelector('[data-send-status]'); const r={noInterest, status:st?st.getAttribute('data-send-status'):null, head:box.querySelector('h3,.callout[role=alert]')?.textContent||'', text:box.innerText.replace(/\\s+/g,' '), icon:box.innerText.includes('💜'), warn:box.innerText.includes('⚠️'), retry:!!box.querySelector('[data-retry]'), body:window.__fbBodies[0]||null};
        if(r.retry){ box.querySelector('[data-retry]').click(); await w(300); const d2=document.querySelector('dialog[open]'); r.kept={interest:d2.querySelector('[data-interest][aria-pressed=true]')?.dataset.interest, stars:d2.querySelectorAll('.stars .on').length, comment:d2.querySelector('textarea').value}; }
        document.querySelector('dialog[open]')?.close(); window.fetch=real; return r;`);
      const label = `UI send status [${mode}]`;
      if (mode === 'saved') {
        check(`${label}: shown as saved, with thanks`, r.status === 'saved' && r.text.includes('บันทึกความคิดเห็นแล้ว') && r.text.includes('ขอบคุณสำหรับความคิดเห็น') && r.icon, r.text.slice(0, 80));
      } else {
        check(`${label}: NOT shown as saved (no thanks / no saved text)`, !r.text.includes('ขอบคุณสำหรับความคิดเห็น') && !r.text.includes('บันทึกความคิดเห็นแล้ว') && !r.icon, r.text.slice(0, 120));
      }
      if (mode === 'not_configured') check(`${label}: says the system is not connected (demo mode)`, r.text.includes('ระบบนี้ยังไม่ได้เชื่อมที่เก็บความคิดเห็น') && !r.retry, r.text.slice(0, 120));
      if (mode === 'bad_webhook_host') check(`${label}: says the configuration is wrong, no retry`, r.text.includes('การตั้งค่าที่เก็บความคิดเห็นของระบบไม่ถูกต้อง') && !r.retry, r.text.slice(0, 120));
      if (mode === 'rejected') check(`${label}: says the store rejected it, no retry`, r.text.includes('ปฏิเสธข้อมูลนี้') && !r.retry, r.text.slice(0, 120));
      if (mode === 'unreachable') check(`${label}: temporary problem, retry offered and the answers are kept`, r.text.includes('เชื่อมต่อที่เก็บความคิดเห็นไม่ได้ชั่วคราว') && r.retry && r.kept && r.kept.interest === 'MAYBE' && r.kept.stars === 4 && r.kept.comment === 'ทดสอบ', JSON.stringify(r.kept));
      if (mode === 'request_failed') check(`${label}: says nothing was saved, no thanks`, r.text.includes('ส่งไม่สำเร็จ ยังไม่ได้บันทึกความคิดเห็น') && !r.retry && r.status === 'request_failed', r.text.slice(0, 120));
      if (mode === 'saved') {
        check('UI interest: required before sending', r.noInterest.includes('กรุณาเลือกว่าสนใจหรือไม่'), r.noInterest);
        check('UI interest: request carries would_use_again=MAYBE and the interest question version, and the rating question version', r.body && r.body.would_use_again === 'MAYBE' && r.body.interest_question === 'V1_PREUSE_INTEREST' && r.body.rating_question === 'V2_RELEVANCE' && r.body.rating === 4 && r.body.consent === true, JSON.stringify(r.body));
        check('UI interest: no personal field is sent', r.body && !('birthdate' in r.body) && Object.keys(r.body).every((k) => ['kind', 'rating', 'rating_question', 'would_use_again', 'interest_question', 'comment', 'consent', 'wish_ids', 'place_ids', 'trip_id', 'offer_id'].includes(k)), Object.keys(r.body || {}).join(','));
      }
    }
  }
  // station names in Tab 1 step 07 and Tab 2 designer
  await load();
  const st = await W(`btn('เริ่มมูของฉัน').click(); await w(300); document.querySelectorAll('.wish-grid .wish-card')[1].click(); btn('ถัดไป').click(); await w(300); btn('ถัดไป').click(); await until(()=>!document.querySelector('.spinner')); btn('ดูสถานที่ที่เหมาะกับคุณ').click(); await until(()=>!document.querySelector('.spinner')); await w(300); btn('ดูทริปที่เหมาะกับฉัน').click(); await until(()=>!document.querySelector('.spinner')); await w(300); btn('ดูรายละเอียดทริปและบริการ').click(); await until(()=>!document.querySelector('.spinner')); await w(300);
    [...document.querySelectorAll('.svc')].find(b=>b.textContent.includes('ไปมูเอง')).click(); await w(500); const self=[...document.querySelectorAll('.path .small')].map(e=>e.textContent).filter(t=>t.includes('สถานีใกล้สุด'));
    document.getElementById('main-t-analytics').click(); await w(2500); document.getElementById('a2-t-designer').click(); await w(2500); btn('Reproduce Offline Design').click(); await until(()=>document.querySelectorAll('#a2-p-designer .timeline li').length>0); await w(300); const des=[...document.querySelectorAll('#a2-p-designer .timeline li .t')].map(e=>e.textContent.trim()); return {self, des};`);
  check('UI stations: Tab 1 shows names, not codes', st.self.length > 0 && st.self.every((t) => !/สถานีใกล้สุด [A-Z]{1,3}\d{0,2} ·/.test(t)), st.self.slice(0, 2).join(' | '));
  check('UI stations: Tab 2 designer shows "name (CODE)"', st.des.length > 0 && st.des.every((t) => /\(\w+\)/.test(t)), `${st.des.length} stops: ` + st.des.slice(0, 2).join(' | '));
  const errs = events.filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error' && !String(e.params.entry.url || '').includes('favicon'))).map((e) => JSON.stringify(e.params).slice(0, 160));
  check('UI no console errors', errs.length === 0, errs.join(' ; '));
}

if (MODE === 'tab2' || MODE === 'all') await tab2();
if (MODE === 'ui' || MODE === 'all') await ui();
await send('Browser.close').catch(() => {}); proc.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed  (${BASE}, ${MODE})`);
const outName = `round3_${MODE}_${new URL(BASE).hostname.replace(/\W+/g, '_')}.json`;
fs.writeFileSync(new URL('./' + outName, import.meta.url), JSON.stringify(results, null, 1));
process.exit(failed.length ? 1 : 0);
