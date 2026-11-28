// Tab 2 · 02 MU Recommendation Lab — runs the SAME engine as Tab 1 and shows every step with the values it computed.
import { h, clear, f, pct, bar, statusChip, MONTHS_TH } from './util.js';
import { API } from './api.js';
import { S, profile, keyOf, hasProfile } from './state.js';
import { mountGraph, graphLegend } from './graphview.js';
import { PERSONAS, compare } from './crosstab.js';
import { wishIcon } from './icons.js';
import { birthText, BIRTH_STATUS_TH } from './usertext.js';
import { eventTrace } from './eventlab.js';
import { reminderSimulation } from './calendarlab.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const SOURCE_TH = (src) => (src === 'demo' ? 'โปรไฟล์จาก Demo ผู้ใช้ (Session ปัจจุบัน)' : src.startsWith('persona:') ? 'ตัวอย่างข้อมูลจำลอง' : 'กรอกเอง');

/** Shared with the Trip Matching tab: make sure a profile is loaded and a trace exists. */
export async function ensureTrace() {
  if (!S.lab.profile) { loadDefault(); }
  const k = keyOf(S.lab.profile);
  if (S.lab.trace && S.lab.key === k) return S.lab.trace;
  S.lab.trace = await API.trace(S.lab.profile); S.lab.key = k;
  return S.lab.trace;
}
function loadDefault() {
  if (hasProfile()) { S.lab.profile = clone(profile()); S.lab.source = 'demo'; } else { S.lab.profile = clone(PERSONAS[0].profile); S.lab.source = 'persona:A'; }
  S.lab.trace = null; S.lab.key = null;
}
export const labListeners = new Set();

export function renderLab(p, ctx) {
  const { cat, names, graph } = ctx;
  const wishName = Object.fromEntries(cat.wishes.map((w) => [w.id, w.label]));
  const deityName = Object.fromEntries(cat.deities.map((d) => [d.id, d.name_th]));
  if (!S.lab.profile) loadDefault();

  const profCard = h('div', { class: 'card stack' }), out = h('div', { class: 'stack', style: 'margin-top:14px' });
  p.append(h('div', { class: 'page-h' }, h('div', { class: 'ic' }, '🧪'), h('div', {}, h('h2', {}, '02 MU Recommendation Lab'), h('p', {}, 'ทดลอง Personalized PageRank ด้วย Network Engine เดียวกับ Tab 1 แล้วดูการคำนวณทีละขั้นจากค่าที่ Backend คำนวณจริง'))), profCard, out);

  function setProfile(pr, source) { S.lab.profile = clone(pr); S.lab.source = source; S.lab.trace = null; S.lab.key = null; labListeners.forEach((fn) => fn()); drawProfile(); clear(out); }

  let drawnWithProfile = null;
  function drawProfile() {
    drawnWithProfile = hasProfile();
    const pr = S.lab.profile, src = S.lab.source;
    const exc = pr.exclusions;
    const editor = h('details', {}, h('summary', {}, 'แก้โปรไฟล์เอง'), h('div', { class: 'inner stack' },
      h('div', { class: 'chips row' }, cat.wishes.map((w) => { const on = pr.wish_ids.includes(w.id); return h('button', { type: 'button', class: 'tchip pick', 'aria-pressed': String(on), disabled: !on && pr.wish_ids.length >= 3,
        onclick: () => { const next = clone(pr); next.wish_ids = on ? next.wish_ids.filter((x) => x !== w.id) : [...next.wish_ids, w.id]; if (next.wish_ids.length) { setProfile(next, 'manual'); } } }, wishIcon(w.id).e + ' ' + w.label); })),
      h('div', { class: 'row' }, cat.tradition_groups.map((g) => { const on = exc.tradition_groups.includes(g); return h('button', { type: 'button', class: 'tchip', 'aria-pressed': String(on), onclick: () => { const next = clone(pr); next.exclusions.tradition_groups = on ? exc.tradition_groups.filter((x) => x !== g) : [...exc.tradition_groups, g]; setProfile(next, 'manual'); } }, g); })),
      h('label', { class: 'row small' }, 'วันเกิด (ค.ศ., ไม่บังคับ): ', h('input', { type: 'date', value: pr.birthdate || '', max: new Date().toISOString().slice(0, 10), onchange: (e) => { const next = clone(pr); next.birthdate = e.target.value || null; setProfile(next, 'manual'); } }))));
    clear(profCard).append(h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', {}, 'โปรไฟล์ที่ใช้ทดลอง'), h('span', { class: src.startsWith('persona') ? 'chip st-syn' : 'chip ok' }, (src.startsWith('persona') ? '◇ ' : '✓ ') + SOURCE_TH(src))),
      h('div', { class: 'row' }, pr.wish_ids.map((w) => h('span', { class: 'chip' }, wishIcon(w).e + ' ' + wishName[w])), pr.birthdate ? h('span', { class: 'chip gold' }, 'วันเกิด ' + pr.birthdate) : h('span', { class: 'chip' }, 'ไม่ระบุวันเกิด'),
        exc.tradition_groups.map((g) => h('span', { class: 'chip pink' }, 'ไม่เอา ' + g)), exc.deity_ids.map((d) => h('span', { class: 'chip pink' }, 'ไม่เอา ' + (deityName[d] || d))), exc.place_ids.map((x) => h('span', { class: 'chip pink' }, 'ไม่เอา ' + (names['P:' + x] || x)))),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn sm primary', disabled: !hasProfile(), title: hasProfile() ? '' : 'ยังไม่มีโปรไฟล์จาก Tab 1', onclick: () => setProfile(profile(), 'demo') }, 'ใช้โปรไฟล์จาก Demo ผู้ใช้'),
        !hasProfile() ? h('span', { class: 'small faint' }, 'ยังไม่มีโปรไฟล์จาก Tab 1 — ใช้ตัวอย่างจำลองด้านล่างได้') : null),
      h('div', { class: 'row' }, PERSONAS.map((x) => h('button', { type: 'button', class: 'persona', 'aria-pressed': String(src === 'persona:' + x.id), onclick: () => setProfile(x.profile, 'persona:' + x.id) }, h('b', {}, x.name), h('div', { class: 'small muted' }, x.note), h('span', { class: 'chip st-syn', style: 'margin-top:4px' }, '◇ ข้อมูลจำลอง')))),
      editor,
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary', id: 'run-ppr', onclick: run }, '▶ Run PPR'), h('span', { class: 'small faint' }, 'วันเกิดอยู่ในหน่วยความจำของหน้านี้เท่านั้น ไม่ถูกบันทึก')));
  }

  async function run() {
    const btn = document.getElementById('run-ppr'); if (btn) btn.disabled = true;
    clear(out).append(h('div', { class: 'card', style: 'text-align:center;padding:30px' }, h('div', { class: 'spinner' }), h('p', { class: 'muted' }, 'กำลังคำนวณบน Backend…')));
    try {
      S.lab.trace = await API.trace(S.lab.profile); S.lab.key = keyOf(S.lab.profile);
      labListeners.forEach((fn) => fn());
      await drawTrace(S.lab.trace);
    } catch (e) { clear(out).append(h('div', { class: 'callout bad', role: 'alert' }, 'คำนวณไม่สำเร็จ: ' + e.message)); }
    finally { if (btn) btn.disabled = false; }
  }

  async function drawTrace(T) {
    const pf = T.profile, par = T.parameters, nm = (id) => names[id] || id;
    const sel = T.step5_result.top5, pr = S.lab.profile;
    const rm = T.step1_prune, re = rm.removed_edges;
    const step = (tag, ttl, ...kids) => h('section', { class: 'card lab-step stack fade-in' }, h('h3', {}, h('span', { class: 'tag' }, tag), ttl), ...kids);
    const gone = new Set([...rm.removed_deities.map((d) => 'D:' + d.id), ...rm.removed_places.map((x) => 'P:' + x.id)]);
    const live = new Set();
    for (const pid of sel) for (const z of T.step5_result.paths[pid]) { live.add(`W:${z.wish_id}>D:${z.deity_id}`); live.add(`D:${z.deity_id}>P:${pid}`); }
    const ranks = Object.fromEntries(sel.map((pid, i) => ['P:' + pid, i + 1]));
    const holder = h('div');
    const cands = T.step3_pagerank.candidates;
    const chk = h('div', { class: 'card stack' }, h('h3', {}, 'ตรวจความสอดคล้องกับ Tab 1'), h('p', { class: 'small muted', style: 'margin:0' }, 'กำลังเรียก API ของ Tab 1 ด้วยโปรไฟล์เดียวกัน…'));

    const A = step('A', 'Input Profile', h('div', { class: 'row' }, pf.wish_names.map((w) => h('span', { class: 'chip' }, w)), pf.weekday ? h('span', { class: T.birth_signal.status === 'APPLIED' ? 'chip gold' : 'chip' }, 'เกิด' + pf.weekday + (T.birth_signal.status === 'APPLIED' ? ' (ใช้เป็นสัญญาณรอง)' : ' (ไม่ได้ใช้)')) : h('span', { class: 'chip' }, 'ไม่ระบุวันเกิด'),
      pf.blocked_deity_ids.length || pf.blocked_place_ids.length || pr.exclusions.tradition_groups.length ? h('span', { class: 'chip pink' }, `Exclusions: ${pr.exclusions.tradition_groups.length} กลุ่มความเชื่อ · ${pf.blocked_deity_ids.length} สิ่งศักดิ์สิทธิ์ · ${pf.blocked_place_ids.length} สถานที่`) : h('span', { class: 'chip' }, 'ไม่มีข้อจำกัด')),
      h('div', { class: 'small faint' }, 'Wish IDs: ' + pf.wish_ids.join(', ') + ' · ข้อมูลที่ส่งเข้าโมเดลมีแค่ wish_ids, birthdate และ exclusions (focus ไม่ใช่ข้อมูลของโมเดล)'));
    const B = step('B', 'Graph Filtering', h('p', { class: 'small muted', style: 'margin:0' }, `โหนดก่อนตัด ${rm.nodes_before} → หลังตัด ${rm.nodes_after} · ผู้สมัครที่มีเส้นทางครบ ${re.candidates_before} → ${re.candidates_after} แห่ง (ตัดออกจากกราฟจริงก่อนคำนวณ)`),
      rm.removed_deities.length || rm.removed_places.length ? h('div', {}, h('div', { class: 'small', style: 'font-weight:600' }, 'โหนดที่ถูกตัด'), h('div', { class: 'row' }, [...rm.removed_deities.map((d) => h('span', { class: 'chip bad' }, `${d.name} · ${d.tradition}`)), ...rm.removed_places.map((x) => h('span', { class: 'chip bad' }, x.name))])) : h('div', { class: 'small faint' }, 'ไม่มีโหนดถูกตัด'),
      h('div', { class: 'small' }, `ความสัมพันธ์ที่ใช้ไม่ได้: เรื่อง–เทพ ${re.wish_deity} เส้น · เทพ–สถานที่ ${re.deity_place} เส้น`),
      re.examples.length ? h('div', { class: 'small muted' }, 'ตัวอย่าง: ' + re.examples.join(' · ')) : null,
      re.places_losing_all_paths.length ? h('div', {}, h('div', { class: 'small', style: 'font-weight:600' }, `สถานที่ที่ไม่เหลือเส้นทางแนะนำ (${re.places_losing_all_paths.length})`), h('div', { class: 'row' }, re.places_losing_all_paths.slice(0, 8).map((x) => h('span', { class: 'chip' }, x.name)))) : null,
      re.places_with_fewer_paths.length ? h('div', { class: 'small muted' }, `สถานที่ที่ยังแนะนำได้แต่เหลือเส้นทางน้อยลง ${re.places_with_fewer_paths.length} แห่ง (เช่น ${re.places_with_fewer_paths.slice(0, 2).map((x) => `${x.name} ${x.before}→${x.after}`).join(', ')})`) : null);
    const bs = T.birth_signal, S2 = T.step2_seeds;
    const C = step('C', 'Personalization Seeds',
      h('div', { class: 'callout small', 'data-birth-status': bs.status }, h('b', {}, `birth_signal: ${bs.status}`), ` · ${BIRTH_STATUS_TH[bs.status]}`, h('div', {}, birthText(bs)),
        bs.claim_ids.length ? h('div', { class: 'faint' }, 'ข้อความอ้างอิง: ' + bs.claim_ids.join(', ')) : null),
      h('table', { 'data-seed-table': 'true' }, h('thead', {}, h('tr', {}, h('th', {}, 'โหนดเริ่ม'), h('th', {}, 'ชนิด'), h('th', { class: 'n' }, 'ก่อน Normalize'), h('th', { class: 'n' }, 'หลัง Normalize'))),
        h('tbody', {}, Object.entries(S2.seeds).map(([id, v]) => h('tr', {}, h('td', {}, nm(id)), h('td', {}, id.startsWith('W') ? 'Wish seed' : 'Birth seed'), h('td', { class: 'n' }, f(v, 4)), h('td', { class: 'n' }, f(S2.seeds_normalized[id], 4))))),
        h('tfoot', {}, h('tr', {}, h('td', { colspan: '2' }, 'รวม'), h('td', { class: 'n' }, f(S2.seeds_sum, 4)), h('td', { class: 'n' }, f(Object.values(S2.seeds_normalized).reduce((a, b) => a + b, 0), 4))))),
      h('div', { class: 'small faint' }, S2.note));
    const D = step('D', `Personalized PageRank (ผู้สมัคร ${T.step3_pagerank.candidate_count} แห่ง)`,
      h('div', { class: 'formula' }, 'PPR = ', h('b', {}, 'α'), '·M·PPR + (1−', h('b', {}, 'α'), ')·p , α = ', par.alpha, h('br'), 'คะแนน(p) = PPR(p) ÷ ', h('b', {}, '√(degree(p)+1)'), ' แล้วหารด้วยค่าสูงสุดของผู้สมัคร'),
      cands.length ? h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['สถานที่', 'เส้นทาง', 'PPR ดิบ', 'degree', 'หลังปรับ degree', 'คะแนน 0–1', ''].map((t, i) => h('th', { class: i > 1 && i < 6 ? 'n' : '' }, t)))),
        h('tbody', {}, cands.slice(0, 12).map((c) => h('tr', { class: sel.includes(c.place_id) ? 'pick' : '' }, h('td', {}, c.name), h('td', { class: 'small', title: c.paths.map((z) => `${z.wish_name} → ${z.deity_name}`).join('\n') }, `${c.paths.length} เส้นทาง`),
          h('td', { class: 'n' }, f(c.pagerank_raw, 5)), h('td', { class: 'n' }, c.degree), h('td', { class: 'n' }, f(c.degree_corrected, 5)), h('td', { class: 'n' }, f(c.ppr_normalized, 3)), h('td', { style: 'width:90px' }, bar(c.ppr_normalized, 1))))))) : h('div', { class: 'callout warn' }, 'ไม่มีสถานที่ผู้สมัครที่ผ่านข้อจำกัด'),
      h('div', { class: 'small faint' }, 'แถวที่ไฮไลต์คือสถานที่ที่ถูกเลือกใน Top 5'));
    const E = step('E', 'Coverage-aware Re-ranking', h('div', { class: 'formula' }, 'utility(p) = ', h('b', {}, '0.75'), ' × PPR(p) + ', h('b', {}, '0.25'), ' × (เรื่องใหม่ที่ p ครอบคลุม ÷ จำนวนเรื่องที่เลือก)', h('br'), 'เลือก utility สูงสุดทีละแห่ง ซ้ำสูงสุด 5 รอบ'),
      T.step4_coverage.steps.length ? T.step4_coverage.steps.map((st, i) => h('details', { open: i === 0 }, h('summary', {}, `รอบ ${st.step}: เลือก ${nm('P:' + st.choice)}`), h('div', { class: 'inner scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['สถานที่', 'PPR', 'เรื่องใหม่ที่เพิ่ม', 'utility'].map((t, j) => h('th', { class: j === 1 || j === 3 ? 'n' : '' }, t)))),
        h('tbody', {}, st.table.map((r) => h('tr', { class: r.chosen ? 'pick' : '' }, h('td', {}, (r.chosen ? '✓ ' : '') + r.name), h('td', { class: 'n' }, f(r.ppr_normalized, 3)), h('td', { class: 'small' }, r.new_wishes.length ? r.new_wishes.map((w) => nm('W:' + w)).join(', ') : 'ไม่เพิ่ม'), h('td', { class: 'n' }, f(r.utility, 3))))))))) : h('div', { class: 'small faint' }, 'ไม่มีผู้สมัคร จึงไม่มีรอบเลือก'));
    const F = step('F', `Top 5 Places (${sel.length}/5)`, sel.length ? h('ol', { style: 'margin:0;padding-left:20px' }, sel.map((pid) => h('li', { style: 'margin-bottom:8px' }, h('b', {}, T.step5_result.names[pid]), T.step5_result.paths[pid].map((z) => h('div', { class: 'small muted' }, `${z.wish_name} → ${z.deity_name} → ${T.step5_result.names[pid]}`))))) :
      h('div', { class: 'callout warn' }, 'ไม่มีสถานที่ที่มีเส้นทางผ่านข้อจำกัด — ระบบตอบว่า "ไม่มี" แทนการแนะนำสิ่งที่ขัดกับที่ไม่ต้องการ'),
      sel.length && sel.length < 5 ? h('div', { class: 'small faint' }, 'น้อยกว่า 5 เพราะไม่มีเส้นทางที่มีแหล่งอ้างอิงเพิ่ม ระบบไม่เติมรายการให้ครบ') : null,
      h('div', { class: 'grid g2' }, h('div', { class: 'small' }, h('b', {}, 'ถ้าเรียงตาม degree (ความนิยมในกราฟ): '), T.baselines.popularity_degree_top5.map(nm.bind(null)).map((x) => x).length ? T.baselines.popularity_degree_top5.map((x) => nm('P:' + x)).join(' · ') : '—'),
        h('div', { class: 'small' }, h('b', {}, 'ถ้ากรอง 2 hop ตรง ๆ: '), T.baselines.direct_two_hop_top5.map((x) => nm('P:' + x)).join(' · ') || '—')));
    const G = h('section', { class: 'card stack fade-in' }, h('h3', {}, 'ภาพบนกราฟ'), h('p', { class: 'small muted', style: 'margin:0' }, 'ขนาดโหนด = คะแนน PPR · เส้นหนา = เส้นทางของ Top 5 · โหนดขีดฆ่า = ถูกตัดด้วยข้อจำกัด'), holder, graphLegend());

    const head = h('div', { class: 'row' }, h('span', { class: T.step5_result.matches_reference ? 'chip ok' : 'chip bad' }, T.step5_result.matches_reference ? '✓ ตรงกับ Python Reference Model' : '✗ ไม่ตรงกับ Reference'),
      h('span', { class: 'chip' }, 'Model ' + T.versions.model), h('span', { class: 'chip' }, 'Snapshot ' + T.versions.snapshot_sha256), h('button', { type: 'button', class: 'btn sm', onclick: () => reveal([A, B, C, D, E, F, G, Hs, Is, chk]) }, '↻ เล่นซ้ำทีละขั้น'));
    const Hs = eventTrace(T), Is = reminderSimulation(T);
    clear(out).append(head, A, B, C, D, E, F, G, Hs, Is, chk);
    const view = mountGraph(holder, graph);
    view.setMode('score'); view.setScores(T.step3_pagerank.node_scores); view.setGone(gone); view.setLive(live); view.setRanks(ranks);

    // Cross-tab check: ask Tab 1's endpoint for the same profile and compare.
    try {
      const rec = await API.recommend(S.lab.profile);
      const checks = compare(rec, T);
      const allOk = checks.every((c) => c.ok);
      const same = S.lab.source === 'demo' && S.resultKey === keyOf(S.lab.profile);
      clear(chk).append(h('h3', {}, 'ตรวจความสอดคล้องกับ Tab 1 ', h('span', { class: allOk ? 'chip ok' : 'chip bad' }, allOk ? '✓ ผ่านทุกข้อ' : '✗ มีข้อที่ไม่ตรง')),
        h('p', { class: 'small muted', style: 'margin:0' }, same ? 'โปรไฟล์นี้คือโปรไฟล์เดียวกับที่ผู้ใช้ทดลองใน Tab 1 ตอนนี้' : 'เรียก API ของ Tab 1 ด้วยโปรไฟล์เดียวกันแล้วเทียบกับผลข้างบน'),
        h('table', {}, h('tbody', {}, checks.map((c) => h('tr', {}, h('td', {}, c.ok ? '✅' : '❌'), h('td', {}, c.label), h('td', { class: 'small muted' }, c.detail))))));
    } catch (e) { clear(chk).append(h('h3', {}, 'ตรวจความสอดคล้องกับ Tab 1'), h('div', { class: 'callout bad' }, e.message)); }
  }

  function reveal(els) {
    els.forEach((e) => { e.style.visibility = 'hidden'; e.style.opacity = '0'; });
    els.forEach((e, i) => setTimeout(() => { e.style.visibility = ''; e.style.transition = 'opacity .4s'; e.style.opacity = '1'; e.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 700 * i));
  }

  drawProfile();
  // Tabs are rendered once, but interests chosen in Tab 1 can appear (or be cleared) afterwards. When the card comes back
  // into view, redraw it only if that changed, so the "use my Demo profile" button is never stale.
  if (window.IntersectionObserver) new IntersectionObserver((seen) => {
    if (seen.some((x) => x.isIntersecting) && drawnWithProfile !== hasProfile()) drawProfile();
  }).observe(profCard);
}
