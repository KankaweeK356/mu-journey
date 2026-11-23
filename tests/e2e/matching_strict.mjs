// Strict Trip Matching check: what the USER SEES on Tab 2 -> 04 Trip Matching versus the unmodified model.
//   node tests/e2e/matching_strict.mjs <BASE_URL>
// No fallback anywhere: a value that is missing on the page, or different from the model, is a failure.
//  Input   : the profile the page used (S.lab.profile) == the acceptance persona == the request the Lab sent; the wish chips on the page == the model's wish names
//  Output  : result chip, the starred card, and for ALL 3 trips Graph Relevance / Wish Coverage / score as displayed
//  Reference: scripts/reference_match.py = network_phase1.match_trip called directly with the profile the page used (not the API)
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '') + '/';
const EDGE = process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PY = process.env.PYTHON || 'python';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(EDGE, ['--headless=new', '--remote-debugging-port=9339', `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'edge-ms-'))}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { await fetch('http://127.0.0.1:9339/json/version'); break; } catch { await sleep(250); } }
const tab = await (await fetch('http://127.0.0.1:9339/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r) => { ws.onopen = r; });
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, (d) => (d.error ? rej(new Error(d.error.message)) : res(d.result))); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; };
for (const d of ['Runtime', 'Page']) await send(d + '.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{ window.__calls=[]; const f=window.fetch; window.fetch=async function(u,o){ const r=await f.apply(this,arguments); let body=null; if(o&&o.body){ try{ body=JSON.parse(o.body);}catch{} } window.__calls.push({url:String(u), method:(o&&o.method)||'GET', status:r.status, body}); return r; }; })();` });

const results = []; const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); };
const W = (js) => ev(`(async()=>{const w=(m)=>new Promise(r=>setTimeout(r,m)); const until=async(fn,t=20000)=>{const s=Date.now(); while(Date.now()-s<t){ if(fn()) return true; await w(100);} return false;}; ${js} })()`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const f = (x, d) => Number(x).toFixed(d);                              // the page's own formatting (util.js f)
const pct0 = (x) => (Number(x) * 100).toFixed(0) + '%';                  // the page's own formatting (util.js pct(x, 0))

// ---- read everything the page shows on the Matching tab (null where it shows nothing)
const READ = `
const p=document.getElementById('a2-p-matching'); const util=await import('/js/util.js'); const state=await import('/js/state.js'); const cross=await import('/js/crosstab.js');
const chipRow=[...p.querySelectorAll('.row')].find(r=>r.querySelector('.chip.ok, .chip.bad'));
const chips=chipRow?[...chipRow.querySelectorAll('.chip')].map(c=>c.textContent.trim()):null;
const cards=[...p.querySelectorAll('.grid.g3 > article')].map(a=>{ const t=a.innerText; const h3=a.querySelector('h3')?.textContent.trim();
  const gr=(t.match(/Graph Relevance\\s+([\\d.]+)/)||[])[1]; const wc=(t.match(/Wish Coverage\\s+(\\d+%)/)||[])[1]; const eq=t.match(/คะแนน = 0\\.75 × ([\\d.]+) \\+ 0\\.25 × ([\\d.]+) = ([\\d.]+)/);
  return {title:h3, graph:gr||null, cover:wc||null, eqGraph:eq?eq[1]:null, eqCover:eq?eq[2]:null, score:eq?eq[3]:null, badge:[...a.querySelectorAll('.chip')].map(c=>c.textContent.trim()).find(x=>/ได้รับเลือก|ผ่านเกณฑ์|ไม่ผ่าน/.test(x))||null, ok:!!a.querySelector('.callout.ok'), bad:!!a.querySelector('.callout.bad')}; });
return {profile:state.S.lab.profile, source:state.S.lab.source, personas:cross.PERSONAS.map(x=>({id:x.id,profile:x.profile})), tripNames:util.TRIP_TH, chips, cards, text:p.innerText, errors:[...p.querySelectorAll('.callout.bad')].filter(e=>!e.closest('article')).length};`;   // red boxes INSIDE a trip card are legitimate "why it failed" reasons

function reference(profile) {
  return JSON.parse(execFileSync(PY, ['-X', 'utf8', path.join(ROOT, 'scripts', 'reference_match.py')], { input: JSON.stringify(profile), encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }));
}

function verify(label, page, labRequest, personaId, expectTrip) {
  const persona = page.personas.find((x) => x.id === personaId);
  // ---- Input
  check(`${label} Input: page profile equals acceptance persona ${personaId}`, persona && same(page.profile, persona.profile), JSON.stringify(page.profile));
  if (labRequest) check(`${label} Input: the request the Lab sent equals the profile the page uses`, same(labRequest, page.profile));
  const ref = reference(page.profile);                                      // model called directly with the profile the page used
  check(`${label} Reference: model decision is ${expectTrip ? 'a matched trip' : 'NO_ELIGIBLE_SIGNATURE_TRIP'}`, expectTrip ? ref.matched_trip_id !== null : ref.decision === 'NO_ELIGIBLE_SIGNATURE_TRIP', `${ref.decision} ${ref.matched_trip_id}`);
  check(`${label} Input: wish chips on the page equal the model's wish names`, page.chips !== null && ref.wish_names.every((n) => page.chips.includes(n)), `page=${JSON.stringify(page.chips)} model=${JSON.stringify(ref.wish_names)}`);
  // ---- chosen trip
  const wantChip = ref.matched_trip_id ? 'ผลลัพธ์: ' + page.tripNames[ref.matched_trip_id] : 'ผลลัพธ์: NO_ELIGIBLE_SIGNATURE_TRIP';
  check(`${label} Output: result chip shows the model's choice`, page.chips !== null && page.chips.includes(wantChip), `want "${wantChip}" got ${JSON.stringify(page.chips)}`);
  const starred = page.cards.filter((c) => c.badge && c.badge.includes('ได้รับเลือก')).map((c) => c.title);
  check(`${label} Output: exactly the model's trip is starred`, same(starred, ref.matched_trip_id ? [page.tripNames[ref.matched_trip_id]] : []), JSON.stringify(starred));
  if (!ref.matched_trip_id) check(`${label} Output: the page says NO_ELIGIBLE_SIGNATURE_TRIP explanation`, page.text.includes('NO_ELIGIBLE_SIGNATURE_TRIP:'));
  // ---- all 3 trips: displayed numbers vs the model, with the page's own rounding
  check(`${label} Output: 3 trip cards are displayed`, page.cards.length === 3, `cards=${page.cards.length}`);
  for (const s of ref.scores) {
    const card = page.cards.find((c) => c.title === page.tripNames[s.trip_id]);
    if (!card) { check(`${label} Output ${s.trip_id}: card is displayed`, false, 'missing'); continue; }
    const want = { graph: f(s.graph_relevance, 3), cover: pct0(s.coverage_fraction), eqGraph: f(s.graph_relevance, 3), eqCover: f(s.coverage_fraction, 2), score: f(s.matching_score, 3) };
    const got = { graph: card.graph, cover: card.cover, eqGraph: card.eqGraph, eqCover: card.eqCover, score: card.score };
    const missing = Object.entries(got).filter(([, v]) => v == null).map(([k]) => k);
    check(`${label} Output ${s.trip_id}: every displayed number is present`, missing.length === 0, missing.join(','));
    check(`${label} Output ${s.trip_id}: Graph Relevance / Wish Coverage / score on the page equal the model (page rounding)`, same(got, want), `page=${JSON.stringify(got)} model=${JSON.stringify(want)}`);
    const tol = ['graph', 'score'].every((k) => Math.abs(Number(got[k]) - Number(k === 'graph' ? s.graph_relevance : s.matching_score)) <= 0.0005 + 1e-12);
    check(`${label} Output ${s.trip_id}: displayed values are within the rounding step of the unrounded model value`, tol);
    const wantBadge = s.trip_id === ref.matched_trip_id ? 'ได้รับเลือก' : s.eligible ? 'ผ่านเกณฑ์' : 'ไม่ผ่าน';
    check(`${label} Output ${s.trip_id}: eligibility badge`, card.badge && card.badge.includes(wantBadge), `${card.badge} want ${wantBadge}`);
    check(`${label} Output ${s.trip_id}: ${s.eligible ? 'passes all conditions' : 'shows the reason it failed'}`, s.eligible ? card.ok : card.bad);
  }
  check(`${label} Output: no error box on the page`, page.errors === 0, `errors=${page.errors}`);
}

async function open(url) { await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false }); await send('Page.navigate', { url }); await sleep(3000); }
const goMatching = `document.getElementById('main-t-analytics').click(); await w(2500);`;

console.log(`== Strict Trip Matching on ${BASE}`);
// Path 1: Lab persona -> run -> Matching (acceptance personas A_general and C_no_trip)
for (const [pid, idx, expectTrip] of [['A', 0, true], ['C', 2, false]]) {
  await open(BASE);
  await W(`${goMatching} document.getElementById('a2-t-lab').click(); await w(1000); window.__calls.length=0; document.querySelectorAll('#a2-p-lab .persona')[${idx}].click(); await w(500); document.getElementById('run-ppr').click(); await until(()=>window.__calls.some(c=>/\\/api\\/trace/.test(c.url)&&c.status===200)); await w(2500); return 1;`);
  const labReq = await ev(`(window.__calls.find(c=>/\\/api\\/trace/.test(c.url))||{}).body||null`);
  await W(`document.getElementById('a2-t-matching').click(); await w(2500); return 1;`);
  const page = await W(READ);
  verify(`Persona ${pid} (Lab -> Matching)`, page, labReq, pid, expectTrip);
}
// Path 2: open Matching directly and press its own run button: the request the Matching page itself sends
await open(BASE);
const run = await W(`${goMatching} document.getElementById('a2-t-matching').click(); await w(1200); const b=document.getElementById('mt-run'); if(!b) return {noButton:true}; window.__calls.length=0; b.click(); await until(()=>window.__calls.some(c=>/\\/api\\/trace/.test(c.url)&&c.status===200)); await w(3000); return {req:(window.__calls.find(c=>/\\/api\\/trace/.test(c.url))||{}).body||null};`);
check('Matching run button exists on a fresh page and sends its own request', !run.noButton && run.req !== null, JSON.stringify(run).slice(0, 160));
if (!run.noButton) verify('Persona A (Matching button)', await W(READ), run.req, 'A', true);

await send('Browser.close').catch(() => {}); proc.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed  (${BASE})`);
fs.writeFileSync(new URL(`./matching_strict_${new URL(BASE).hostname.replace(/\W+/g, '_')}.json`, import.meta.url), JSON.stringify(results, null, 1));
process.exit(failed.length ? 1 : 0);
