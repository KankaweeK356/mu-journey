// Tab 2 · 05 Model Evaluation — numbers computed by the Python reference model, labelled for what they are (and are not).
import { h, clear, f, pct, bar, statusChip, STATUS, TRIP_TH, getJSON } from './util.js';
import { reminderChecks } from './eventlab.js';
import { API } from './api.js';
import { PERSONAS, compare } from './crosstab.js';

const NAMES = { popularity: 'Popularity (degree)', direct: 'Direct two-hop matching', ppr: 'Network PPR', ppr_coverage: 'Network PPR + Coverage (ใช้ในระบบ)' };

export function renderEvaluation(p, { results, graph, cat, names }) {
  const sa = results.structural_acceptance, fx = sa.source_aligned_fixture_results, ho = results.graph_link_holdout, ac = results.acceptance, se = results.model_sensitivity, q = results.qa;
  const dist = ac.trip_choice_distribution;
  p.append(h('div', { class: 'page-h' }, h('div', { class: 'ic' }, '📊'), h('div', {}, h('h2', {}, '05 Model Evaluation'), h('p', {}, `ผลที่คำนวณจริงจาก Python Reference Model (${results.version}) — แสดงทั้งที่ชนะและที่แพ้`))));
  p.append(h('div', { class: 'callout warn' }, h('span', { class: 'chip st-syn', style: 'margin-right:6px' }, '◇ SYNTHETIC FIXTURES'), 'ตัวเลขจากโปรไฟล์ทดสอบที่ผู้จัดทำกำหนดและ label ที่มาจากกราฟเดียวกัน ',
    h('b', {}, 'ไม่ใช่ผลวัดความพึงพอใจหรือความแม่นยำจากผู้ใช้จริง')));

  /* 1 network vs baselines */
  p.append(h('div', { class: 'grid g2', style: 'margin-top:14px' },
    h('div', { class: 'card stack' }, h('h3', {}, '1 · Network vs Popularity / Direct Matching'), h('div', { class: 'sub' }, 'NDCG@5 เฉลี่ย บน 15 โปรไฟล์ (เฉพาะที่มี label ผ่านเงื่อนไข)'),
      Object.entries(fx).map(([k, v]) => h('div', {}, h('div', { class: 'row', style: 'justify-content:space-between' }, h('span', { style: k === 'ppr_coverage' ? 'font-weight:600' : '' }, NAMES[k]), h('b', { class: 'mono' }, f(v.mean_ndcg_at5_over_nonempty, 4))), bar(v.mean_ndcg_at5_over_nonempty, 1, k === 'ppr_coverage' ? '' : 'grey'))),
      h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['วิธี', 'Precision@5', 'Recall@5', 'เรื่องที่ครอบคลุม@5'].map((t, i) => h('th', { class: i ? 'n' : '' }, t)))),
        h('tbody', {}, Object.entries(fx).map(([k, v]) => h('tr', {}, h('td', {}, NAMES[k]), h('td', { class: 'n' }, f(v.mean_precision_at5, 3)), h('td', { class: 'n' }, f(v.mean_recall_at5, 3)), h('td', { class: 'n' }, f(v.mean_covered_selected_wishes_at5, 3))))))),
      h('div', { class: 'small faint' }, sa.limitation)),
    h('div', { class: 'card stack' }, h('h3', {}, '2 · Edge Holdout Experiment'), h('div', { class: 'sub' }, 'ซ่อนเส้นเทพ–สถานที่แล้วให้แต่ละวิธีทายคืน (48 ตัวอย่าง) — Hit@5'),
      ['degree', 'ppr'].map((k) => h('div', {}, h('div', { class: 'row', style: 'justify-content:space-between' }, h('span', { style: k === 'degree' ? 'font-weight:600' : '' }, { degree: 'Degree (ชนะ)', ppr: 'Network PPR' }[k]), h('b', { class: 'mono' }, pct(ho.models[k].hit_rate_at5, 2))), bar(ho.models[k].hit_rate_at5, 1, k === 'degree' ? 'gold' : 'grey'))),
      h('div', { class: 'callout bad small' }, h('b', {}, 'Degree ชนะ PPR ในโจทย์นี้ '), `(${pct(ho.models.degree.hit_rate_at5, 2)} เทียบ ${pct(ho.models.ppr.hit_rate_at5, 2)}) จึงไม่อ้างว่า PPR ดีกว่าทุกกรณี โจทย์นี้ทายเส้นที่ซ่อน ไม่ใช่ความตรงใจผู้ใช้`),
      h('div', { class: 'small faint' }, ho.warning))));

  /* 3 exclusions 4 trip feasibility 5 sensitivity */
  p.append(h('div', { class: 'grid g3', style: 'margin-top:14px' },
    h('div', { class: 'card stack' }, h('h3', {}, '3 · Exclusion Violations'), h('div', { class: 'sub' }, `${ac.n_profiles} โปรไฟล์ทดสอบ (จำลอง)`),
      h('div', { class: 'row' }, h('span', { class: ac.zero_exclusion_violations ? 'chip ok' : 'chip bad' }, 'ละเมิด 0 ครั้ง'), h('span', { class: ac.valid_explanation_paths ? 'chip ok' : 'chip bad' }, 'ทุกผลมีเส้นทางอธิบาย'), h('span', { class: 'chip ok' }, 'เส้นทางทริปไม่เปลี่ยน')),
      h('table', {}, h('tbody', {}, [['ทริปความรัก', dist.TRIP_LOVE], ['ทริปการงาน', dist.TRIP_CAREER], ['ทริปโชคลาภ', dist.TRIP_WEALTH], ['ไม่มีทริปที่เหมาะ', dist.ABSTAIN], ['ผลน้อยกว่า 5 แห่ง', ac.limited_results]].map(([a, b]) => h('tr', {}, h('td', {}, a), h('td', { class: 'n' }, b)))))),
    h('div', { class: 'card stack' }, h('h3', {}, '4 · Trip Feasibility'), h('div', { class: 'sub' }, 'เวลารวมโดยประมาณ (นาที) เมื่อเวลาเดินทางเพิ่ม — ไม่เปลี่ยนเส้นทาง'),
      h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'ทริป'), [0, 15, 30, 50].map((x) => h('th', { class: 'n' }, '+' + x + '%')))),
        h('tbody', {}, ['TRIP_LOVE', 'TRIP_CAREER', 'TRIP_WEALTH'].map((id) => h('tr', {}, h('td', {}, TRIP_TH[id]), ...se.travel_delay_scenarios.filter((x) => x.trip_id === id).map((x) => h('td', { class: 'n', style: x.under_360min ? '' : 'color:var(--bad);font-weight:700' }, Math.round(x.duration_min_approx))))))),
      h('div', { class: 'small faint' }, 'สีแดง = เกิน 360 นาที · ' + se.caveat)),
    h('div', { class: 'card stack' }, h('h3', {}, '5 · Sensitivity Analysis'), h('div', { class: 'sub' }, 'ปรับสัดส่วน PPR เป็น 0.50 / 0.75 / 0.90 กับ 15 โปรไฟล์'),
      h('div', { class: 'kpi', style: 'padding:0' }, h('div', {}, h('div', { class: 'val' }, se.changed_trip_choice_count), h('div', { class: 'lab' }, 'ทริปที่ถูกเลือกเปลี่ยน (ราย)'))),
      h('div', { class: 'small faint' }, 'ผลคงที่ในชุดทดสอบเล็กนี้ ไม่สามารถอ้าง robustness ทั่วไปได้'))));

  /* 6 live cross-tab acceptance */
  const out = h('div', { class: 'stack' }), runBtn = h('button', { type: 'button', class: 'btn primary', onclick: runAccept }, '▶ รัน Cross-tab Acceptance Test');
  p.append(h('div', { class: 'card stack', style: 'margin-top:14px' }, h('h3', {}, '6 · Cross-tab Acceptance Test (Case A / B / C)'),
    h('div', { class: 'sub' }, 'เรียก API ของ Tab 1 และ Tab 2 ด้วยโปรไฟล์เดียวกัน แล้วตรวจว่า Top 5, Top 1 Trip, Evidence Paths, Exclusions และ Version ตรงกัน'), h('div', { class: 'row' }, runBtn), out));
  async function runAccept() {
    runBtn.disabled = true; clear(out).append(h('div', { class: 'spinner' }));
    try {
      const rows = [];
      for (const c of PERSONAS) {
        const [rec, tr] = await Promise.all([API.recommend(c.profile), API.trace(c.profile)]);
        rows.push({ c, rec, checks: compare(rec, tr) });
      }
      const all = rows.every((r) => r.checks.every((k) => k.ok));
      clear(out).append(h('div', { class: all ? 'callout ok' : 'callout bad' }, all ? '✓ ผ่านทุกกรณีและทุกข้อตรวจ' : '✗ มีข้อที่ไม่ตรง'),
        h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'ข้อตรวจ'), rows.map((r) => h('th', {}, r.c.name, h('div', { class: 'chip st-syn' }, '◇ จำลอง'))))),
          h('tbody', {}, rows[0].checks.map((_, i) => h('tr', {}, h('td', {}, rows[0].checks[i].label), rows.map((r) => h('td', { class: 'small' }, (r.checks[i].ok ? '✅ ' : '❌ ') + r.checks[i].detail))))),
          h('tfoot', {}, h('tr', {}, h('td', {}, h('b', {}, 'ผลลัพธ์ที่ผู้ใช้เห็น')), rows.map((r) => h('td', { class: 'small' }, `${r.rec.top5.length} สถานที่ · ${(r.rec.trip.matched || {}).trip_id ? TRIP_TH[r.rec.trip.matched.trip_id] : 'ไม่มีทริปที่เหมาะ'}`)))))));
    } catch (e) { clear(out).append(h('div', { class: 'callout bad' }, e.message)); } finally { runBtn.disabled = false; }
  }

  /* 6b event recommendation + reminder checks (synthetic, structural: no accuracy or NDCG claims) */
  const evBox = h('div', { class: 'stack' }, h('div', { class: 'spinner' }));
  p.append(h('div', { class: 'card stack', style: 'margin-top:14px' }, h('h3', {}, '6b · Event Recommendation & Reminder Checks'),
    h('div', { class: 'callout warn small' }, h('span', { class: 'chip st-syn', style: 'margin-right:6px' }, '◇ SYNTHETIC'), 'ตรวจโครงสร้างของชั้นกิจกรรมและตรรกะเตือนบนโปรไฟล์ทดสอบ ', h('b', {}, 'ไม่ใช่ความแม่นยำ NDCG หรือผลจากผู้ใช้จริง')), evBox));
  getJSON('/data/event_eval.json').then((E) => {
    const row = (a, b, ok) => h('tr', {}, h('td', {}, a), h('td', { class: 'n' }, b), h('td', {}, ok == null ? '' : ok ? '✅' : '❌'));
    const vp = E.valid_path_rate, st = E.rank_stability, ev = E.coverage;
    const live = reminderChecks();
    clear(evBox).append(h('div', { class: 'grid g2' },
      h('div', { class: 'stack' }, h('b', {}, `ชั้นเครือข่าย (${E.n_profiles} โปรไฟล์ทดสอบ · ${E.n_source_events} กิจกรรม)`), h('table', {}, h('tbody', {},
        row('เส้นทางเรื่อง→เทพ→สถานที่ใช้ได้จริง', `${vp.valid}/${vp.total}`, vp.valid === vp.total),
        row('กิจกรรมที่ละเมิดข้อจำกัด', E.exclusion_violations, E.exclusion_violations === 0),
        row('โปรไฟล์ที่มีกิจกรรมจากเครือข่าย', `${ev.profiles_with_events}/${E.n_profiles}`), row('เฉลี่ยกิจกรรมต่อโปรไฟล์', ev.mean_eligible_per_profile),
        row('กิจกรรมที่เคยเข้าอันดับอย่างน้อย 1 ครั้ง', `${ev.distinct_events_ever_eligible}/${E.n_source_events}`), row('โปรไฟล์ที่มีกิจกรรมจับคู่ตรง (จำลอง)', E.network_vs_direct.profiles_with_direct_events),
        row('อันดับ 1 เสมอกัน (tie)', `${E.ties.profiles_with_tie_at_rank1}/${E.n_profiles}`), row('Tie คาบเกี่ยวอันดับ 5 (ตรวจแยก)', E.ties.profiles_tie_boundary_review))),
        h('div', { class: 'small' }, 'เสถียรภาพอันดับ: ', Object.entries(st.interpretation).map(([k, v]) => `${k} ${v}`).join(' · ')),
        h('div', { class: 'small faint' }, 'คะแนนเสมอกันมาก เพราะหลายกิจกรรมใช้คู่เทพ–สถานที่เดียวกัน อันดับภายในกลุ่มเสมอจึงเรียงตาม event_id ไม่ใช่ความต่างของคะแนน · ' + E.disclaimer),
        h('div', { class: 'small faint' }, `ไม่เคยเข้าอันดับ: ${ev.never_eligible.join(', ') || '—'} · วันที่ ${Object.entries(E.calendar_status).map(([k, v]) => `${k} ${v}`).join(', ')} · กำหนดการ ${Object.entries(E.schedule_status).map(([k, v]) => `${k} ${v}`).join(', ')}`)),
      h('div', { class: 'stack' }, h('b', {}, 'ตรรกะแจ้งเตือน (รันสดในเบราว์เซอร์)'), h('table', {}, h('tbody', {}, live.map((c) => h('tr', {}, h('td', {}, c.ok ? '✅' : '❌'), h('td', { class: 'small' }, c.label, h('div', { class: 'faint' }, c.detail)))))),
        h('span', { class: live.every((c) => c.ok) ? 'chip ok' : 'chip bad' }, live.every((c) => c.ok) ? `✓ ผ่าน ${live.length}/${live.length} ข้อ` : '✗ มีข้อที่ไม่ผ่าน'))));
  }).catch((e) => clear(evBox).append(h('div', { class: 'callout bad' }, 'โหลดผลตรวจกิจกรรมไม่สำเร็จ: ' + e.message)));

  /* 7 data gaps + limitations */
  const cnt = (arr, fn) => arr.reduce((a, x) => { const k = fn(x); a[k] = (a[k] || 0) + 1; return a; }, {});
  const edges = cnt(graph.edges, (e) => e.kind + ':' + e.status), hours = cnt(graph.nodes.filter((n) => n.type === 'P'), (n) => n.hours_status);
  p.append(h('div', { class: 'grid g2', style: 'margin-top:14px' },
    h('div', { class: 'card stack' }, h('h3', {}, '7 · Data Gaps'), h('table', {}, h('tbody', {}, Object.entries(STATUS).map(([k, v]) => h('tr', {}, h('td', {}, statusChip(k)), h('td', { class: 'small' }, { SOURCE: 'อ้างอิงแหล่งทางการหรือเว็บไซต์ทางการ', CANDIDATE: 'จากเว็บ/บทความ รอตรวจ', SYNTHETIC: 'สร้างขึ้นเพื่อสาธิต (เวลาเปิดบางแห่ง ผู้ให้บริการ ข้อเสนอ ผู้ใช้)', UNVERIFIED: 'ความเชื่อหรือค่าที่ยังไม่มีใครยืนยัน' }[k]))))),
      h('div', { class: 'small' }, `เรื่อง–เทพ ${edges['wish_deity:UNVERIFIED'] || 0} เส้น = UNVERIFIED ทั้งหมด · เทพ–สถานที่ SOURCE ${edges['deity_place:SOURCE'] || 0} / CANDIDATE ${edges['deity_place:CANDIDATE'] || 0}`),
      h('div', { class: 'small' }, `เวลาเปิดสถานที่: SYNTHETIC ${hours.SYNTHETIC || 0} · CANDIDATE ${hours.CANDIDATE || 0} · พิกัดจริงไม่มี ${q.unverified_place_coordinates} แห่ง (ใช้พิกัดสถานี)`),
      h('div', { class: 'small', style: 'font-weight:600' }, `สถานที่ ${graph.isolated_places.length} แห่งไม่มีเส้นเชื่อม (Coverage gap)`), h('div', { class: 'row' }, graph.isolated_places.map((id) => h('span', { class: 'chip' }, names[id])))),
    h('div', { class: 'card stack' }, h('h3', {}, '8 · Model Limitations'), h('ul', { class: 'small', style: 'margin:0;padding-left:18px' }, [
      'label ที่ใช้ทดสอบมาจากกราฟเดียวกัน ยังไม่มี label อิสระจากผู้ใช้หรือผู้เชี่ยวชาญ', 'PPR แพ้ Degree ใน edge holdout จึงไม่อ้างว่าดีกว่าวิธีทั่วไปทุกกรณี', 'ความเชื่อทั้งหมดเป็น claim จากแหล่งอ้างอิง ไม่ใช่การรับรองหรือผลของการขอพร',
      'ทริปยังไม่ใช่ผลิตภัณฑ์ที่เปิดขายได้: ไม่มีเวลาเปิดจริง เส้นทางเดินที่ปลอดภัย ตารางรถไฟจริง ราคา ที่นั่ง หรือสิทธิ์จากสถานที่', 'บริการฝากมูเป็นรายการจำลอง ไม่ใช่ผู้ให้บริการจริง',
      'กิจกรรมจริงทั้ง 37 รายการยังไม่ได้ยืนยันกำหนดการกับผู้จัด จึงยังไม่เตือนจริง (วันที่ที่คำนวณได้ ≠ กำหนดการยืนยันแล้ว)', 'Phase 2: เรียนรู้จาก feedback · การจองและชำระเงินจริง · แจ้งเตือนนอกหน้าเว็บ (อีเมล/LINE)', 'ก่อนใช้งานจริง: ตรวจสิทธิ์/ToS ของแหล่งข้อมูล, ความยินยอมตาม PDPA, ตรวจโดยผู้ใช้และผู้เชี่ยวชาญอิสระ'].map((t) => h('li', {}, t))),
    h('div', { class: 'small faint' }, `Model ${cat.versions.model} · Dataset ${cat.versions.dataset_title} (${cat.versions.data_as_of}) · Snapshot ${cat.versions.snapshot_sha256}`))));
}
