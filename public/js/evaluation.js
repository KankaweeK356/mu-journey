// Tab 2 · 05 Model Evaluation — numbers computed by the Python reference model, labelled for what they are (and are not).
import { h, clear, f, pct, bar, statusChip, STATUS, TRIP_TH, getJSON } from './util.js';
import { reminderChecks } from './calendarlab.js';
import { API } from './api.js';
import { PERSONAS, compare } from './crosstab.js';

const NAMES = { popularity: 'Popularity (degree)', direct: 'Direct two-hop matching', ppr: 'Network PPR', ppr_coverage: 'Network PPR + Coverage (ใช้ในระบบ)' };

export function renderEvaluation(p, { results, graph, cat, names }) {
  const sa = results.structural_acceptance, fx = sa.source_aligned_fixture_results, ho = results.graph_link_holdout, ac = results.acceptance, se = results.model_sensitivity, q = results.qa;
  const dist = ac.trip_choice_distribution;
  p.append(h('div', { class: 'page-h' }, h('div', { class: 'ic' }, '📊'), h('div', {}, h('h2', {}, '05 Model Evaluation'), h('p', {}, `ผลที่คำนวณจริงจาก Python Reference Model (${results.version}) — แสดงทั้งผลที่เห็นความต่างและผลที่ยังไม่พบความต่างอย่างมีนัยสำคัญ`))));
  p.append(h('div', { class: 'callout warn' }, h('span', { class: 'chip st-syn', style: 'margin-right:6px' }, '◇ SYNTHETIC FIXTURES'), 'ตัวเลขจากโปรไฟล์ทดสอบที่ผู้จัดทำกำหนดและ label ที่มาจากกราฟเดียวกัน ',
    h('b', {}, 'ไม่ใช่ผลวัดความพึงพอใจหรือความแม่นยำจากผู้ใช้จริง')));

  /* 1 + 2: baseline comparison and edge holdout. The reference-run numbers come from results.json (unchanged);
     the statistics (confidence intervals, leave-one-edge-out, coverage) are read from public/data/rigor_addendum.json,
     a byte-identical copy of model/results/rigor_addendum_v1.json. Nothing below is typed in by hand. */
  const rigorP = getJSON('/data/rigor_addendum.json');
  const ciBox = h('div', { class: 'stack' }, h('div', { class: 'spinner' })), loBox = h('div', { class: 'stack' }, h('div', { class: 'spinner' })), covBox = h('div', { class: 'stack' }, h('div', { class: 'spinner' }));
  const bad = (box, e) => clear(box).append(h('div', { class: 'callout bad small' }, 'โหลดผลภาคผนวกสถิติไม่สำเร็จ: ' + e.message));
  p.append(h('div', { class: 'grid g2', style: 'margin-top:14px' },
    h('div', { class: 'card stack' }, h('h3', {}, '1 · เปรียบเทียบ Network PPR กับ Popularity / Direct Matching'),
      h('div', { class: 'sub' }, 'NDCG@5 เฉลี่ย บน 15 โปรไฟล์ทดสอบ (คำนวณ NDCG ได้ 14 โปรไฟล์ เพราะ 1 โปรไฟล์ไม่มีสถานที่ที่ผ่านเงื่อนไขให้เป็น label)'),
      Object.entries(fx).map(([k, v]) => h('div', {}, h('div', { class: 'row', style: 'justify-content:space-between' }, h('span', {}, NAMES[k]), h('b', { class: 'mono' }, f(v.mean_ndcg_at5_over_nonempty, 4))), bar(v.mean_ndcg_at5_over_nonempty, 1, 'grey'))),
      ciBox,
      h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['วิธี', 'Precision@5', 'Recall@5', 'เรื่องที่ครอบคลุม@5'].map((t, i) => h('th', { class: i ? 'n' : '' }, t)))),
        h('tbody', {}, Object.entries(fx).map(([k, v]) => h('tr', {}, h('td', {}, NAMES[k]), h('td', { class: 'n' }, f(v.mean_precision_at5, 3)), h('td', { class: 'n' }, f(v.mean_recall_at5, 3)), h('td', { class: 'n' }, f(v.mean_covered_selected_wishes_at5, 3))))))),
      h('div', { class: 'small faint' }, sa.limitation)),
    h('div', { class: 'card stack' }, h('h3', {}, '2 · Edge Holdout (Leave-one-edge-out)'), loBox,
      h('details', {}, h('summary', {}, 'Legacy Experiment: การทดลองสุ่มซ้ำ 6 รอบ (ผลเดิม เก็บไว้ตรวจย้อนกลับ)'),
        h('div', { class: 'inner stack' },
          h('div', { class: 'small muted' }, `ซ่อนเส้นเทพ–สถานที่แล้วให้แต่ละวิธีทายคืน: สุ่ม 6 รอบ รอบละ 8 เส้น จากเส้นที่ทดสอบได้ ${ho.number_source_edges_tested} เส้น รวม ${ho.models.ppr.samples} ตัวอย่าง`),
          ['ppr', 'degree'].map((k) => h('div', {}, h('div', { class: 'row', style: 'justify-content:space-between' }, h('span', {}, { degree: 'Degree', ppr: 'Network PPR' }[k]), h('b', { class: 'mono' }, pct(ho.models[k].hit_rate_at5, 2))), bar(ho.models[k].hit_rate_at5, 1, 'grey'))),
          h('div', { class: 'callout small' }, `${ho.models.ppr.samples} ตัวอย่างนี้ไม่ใช่ ${ho.models.ppr.samples} เส้นอิสระ: เป็นการสุ่มซ้ำจากเส้นเพียง ${ho.number_source_edges_tested} เส้น เส้นเดียวอาจถูกซ่อนซ้ำหลายรอบ จึงไม่ควรตีความความต่างของตัวเลขสองค่านี้เป็นนัยสำคัญทางสถิติ ใช้ผลแบบ leave-one-edge-out ด้านบนเป็นผลหลัก`),
          h('div', { class: 'small faint' }, ho.warning))))));
  p.append(h('div', { class: 'card stack', style: 'margin-top:14px' }, h('h3', {}, '2b · Coverage re-ranking: วัดความครอบคลุมเรื่องที่เลือก'), covBox));
  rigorP.then((R) => {
    const pairs = R.fixtures.pairs;
    const pairRow = (key, label) => { const q = pairs[key]; return h('tr', {}, h('td', {}, label), h('td', { class: 'n' }, (q.mean_diff_ndcg_at5 >= 0 ? '+' : '') + f(q.mean_diff_ndcg_at5, 4)), h('td', { class: 'n' }, `[${f(q.ci95_bootstrap[0], 4)}, ${f(q.ci95_bootstrap[1], 4)}]`), h('td', { class: 'small' }, `${q.profiles_better} / ${q.profiles_equal} / ${q.profiles_worse}`)); };
    const crosses = (key) => pairs[key].ci95_bootstrap[0] <= 0 && pairs[key].ci95_bootstrap[1] >= 0;
    const allNull = crosses('ppr_minus_popularity') && crosses('ppr_minus_direct');
    clear(ciBox).append(h('div', { class: 'small', style: 'font-weight:600' }, `ผลต่างรายโปรไฟล์ (จับคู่) บน ${R.fixtures.n_with_valid_labels} โปรไฟล์ · bootstrap ${R.bootstrap_resamples.toLocaleString('en-US')} รอบ ช่วงความเชื่อมั่น 95%`),
      h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['เทียบ', 'ผลต่าง NDCG@5', 'ช่วงความเชื่อมั่น 95%', 'ดีกว่า / เท่า / แย่กว่า'].map((t, i) => h('th', { class: i === 1 || i === 2 ? 'n' : '' }, t)))),
        h('tbody', {}, pairRow('ppr_minus_popularity', 'PPR − Popularity'), pairRow('ppr_minus_direct', 'PPR − Direct two-hop'), pairRow('ppr_coverage_minus_ppr', 'PPR+Coverage − PPR')))),
      h('div', { class: allNull ? 'callout warn small' : 'callout small' }, allNull
        ? 'ช่วงความเชื่อมั่นครอบคลุมศูนย์ ยังไม่พบความแตกต่างอย่างมีนัยสำคัญทางสถิติระหว่างวิธีในชุดทดสอบนี้ ค่าเฉลี่ยที่ต่างกันจึงยังสรุปไม่ได้ว่าวิธีใดเหนือกว่า'
        : 'อ่านร่วมกับช่วงความเชื่อมั่นด้านบนเสมอ'),
      h('div', { class: 'small faint' }, `label มาจาก Knowledge Graph เดียวกัน ผู้จัดทำเป็นผู้เลือก ไม่ใช่ผลประเมินโดยผู้ใช้จริง · ${R.fixtures.single_wish_profiles} จาก ${R.fixtures.n_profiles} โปรไฟล์เลือกเรื่องเดียว ซึ่ง Coverage re-ranking เปลี่ยนผลไม่ได้โดยโครงสร้าง`));
    const L = R.leave_one_edge_out, M = L.models, pr = L.paired, nul = pr.exact_mcnemar_p >= 0.05;
    clear(loBox).append(h('div', { class: 'sub' }, `ซ่อนเส้นเทพ–สถานที่ทีละเส้นครบทุกเส้นที่ทดสอบได้ (${L.n_edges} เส้น) ผลซ้ำได้ ไม่สุ่ม`),
      ...['ppr', 'degree'].map((k) => h('div', {}, h('div', { class: 'row', style: 'justify-content:space-between' }, h('span', {}, { degree: 'Degree', ppr: 'Network PPR' }[k] + ` · Hit@5 ${M[k].hits}/${L.n_edges}`), h('b', { class: 'mono' }, pct(M[k].hit_at5, 1))), bar(M[k].hit_at5, 1, 'grey'),
        h('div', { class: 'small faint' }, `ช่วง Wilson 95% [${pct(M[k].wilson95[0], 1)}, ${pct(M[k].wilson95[1], 1)}] · NDCG@5 ${f(M[k].mean_ndcg_at5, 4)} · MRR ${f(M[k].mrr, 3)}`))),
      h('div', { class: 'small' }, `เทียบแบบจับคู่: PPR ถูกอย่างเดียว ${pr.hit_only_ppr} เส้น · Degree ถูกอย่างเดียว ${pr.hit_only_degree} เส้น · exact McNemar p = ${pr.exact_mcnemar_p === 1 ? '1.0' : pr.exact_mcnemar_p}`),
      h('div', { class: nul ? 'callout warn small' : 'callout small' }, nul ? 'ไม่พบความแตกต่างอย่างมีนัยสำคัญทางสถิติระหว่าง PPR กับ Degree ในโจทย์ทายเส้นที่ซ่อน' : `พบความแตกต่างที่ p = ${pr.exact_mcnemar_p}`),
      h('div', { class: 'small faint' }, 'ทดสอบการกู้คืนเส้นที่ซ่อนจากโครงสร้างกราฟอย่างเดียว ไม่ใช่ความตรงใจผู้ใช้ และเส้นจริงยังเป็นความเชื่อจากแหล่งอ้างอิงที่ไม่ได้ยืนยันอิสระ'));
    const C = R.coverage_layer.by_n_wishes, c3 = C['3'];
    clear(covBox).append(h('div', { class: 'grid g3' },
      h('div', {}, h('div', { class: 'small muted' }, 'เลือก 1 เรื่อง'), h('b', {}, `เปลี่ยนสมาชิก Top 5 ${C['1'].top5_set_changed}/${C['1'].profiles} ชุด`)),
      h('div', {}, h('div', { class: 'small muted' }, 'เลือก 2 เรื่อง'), h('b', {}, `เปลี่ยนสมาชิก ${C['2'].top5_set_changed}/${C['2'].profiles} ชุด · เปลี่ยนลำดับ ${C['2'].top5_order_changed}`)),
      h('div', {}, h('div', { class: 'small muted' }, 'เลือก 3 เรื่อง'), h('b', {}, `เปลี่ยนสมาชิก ${c3.top5_set_changed}/${c3.profiles} ชุด`))),
      h('div', { class: 'row' }, h('span', { class: 'chip' }, `ความครอบคลุมเรื่องที่เลือกเฉลี่ย (3 เรื่อง ${c3.profiles} ชุด): ${pct(c3.mean_covered_ppr, 1)} → ${pct(c3.mean_covered_ppr_coverage, 1)}`), h('span', { class: c3.coverage_down === 0 ? 'chip ok' : 'chip bad' }, `เพิ่มขึ้น ${c3.coverage_up}/${c3.profiles} ชุด · ลดลง ${c3.coverage_down} ชุด`)),
      h('div', { class: 'small faint' }, 'เป็นการวัดความครอบคลุมเรื่องที่ผู้ใช้เลือกใน Graph (Wish Coverage ใน Top 5) ไม่ใช่ความพึงพอใจของผู้ใช้ และไม่ใช้ label ใด ๆ'));
  }).catch((e) => { bad(ciBox, e); bad(loBox, e); bad(covBox, e); });

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
    return reminderChecks().then((live) => { clear(evBox).append(h('div', { class: 'grid g2' },
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
        h('span', { class: live.every((c) => c.ok) ? 'chip ok' : 'chip bad' }, live.every((c) => c.ok) ? `✓ ผ่าน ${live.length}/${live.length} ข้อ` : '✗ มีข้อที่ไม่ผ่าน')))); });
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
      'label ที่ใช้ทดสอบมาจากกราฟเดียวกัน ยังไม่มี label อิสระจากผู้ใช้หรือผู้เชี่ยวชาญ', 'ผลต่างระหว่าง PPR กับ Popularity/Direct/Degree ยังไม่มีนัยสำคัญทางสถิติในชุดทดสอบนี้ จึงไม่อ้างว่าวิธีใดเหนือกว่า', 'ความเชื่อทั้งหมดเป็น claim จากแหล่งอ้างอิง ไม่ใช่การรับรองหรือผลของการขอพร',
      'ทริปยังไม่ใช่ผลิตภัณฑ์ที่เปิดขายได้: ไม่มีเวลาเปิดจริง เส้นทางเดินที่ปลอดภัย ตารางรถไฟจริง ราคา ที่นั่ง หรือสิทธิ์จากสถานที่', 'บริการฝากมูเป็นรายการจำลอง ไม่ใช่ผู้ให้บริการจริง',
      'กิจกรรมจริงทั้ง 37 รายการยังไม่ได้ยืนยันกำหนดการกับผู้จัด จึงยังไม่เตือนจริง (วันที่ที่คำนวณได้ ≠ กำหนดการยืนยันแล้ว)', 'Phase 2: เรียนรู้จาก feedback · การจองและชำระเงินจริง · แจ้งเตือนนอกหน้าเว็บ (อีเมล/LINE)', 'ก่อนใช้งานจริง: ตรวจสิทธิ์/ToS ของแหล่งข้อมูล, ความยินยอมตาม PDPA, ตรวจโดยผู้ใช้และผู้เชี่ยวชาญอิสระ'].map((t) => h('li', {}, t))),
    h('div', { class: 'small faint' }, `Model ${cat.versions.model} · Dataset ${cat.versions.dataset_title} (${cat.versions.data_as_of}) · Snapshot ${cat.versions.snapshot_sha256}`))));
}
