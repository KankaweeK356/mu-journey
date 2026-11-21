// Tab 1 — user demo: profile → recommendations → pick what to pray for → services → feedback.
import { h, clear, getJSON, postJSON, f, pct, statusChip, TRIP_TH, MONTHS_TH, bar, toast } from './util.js';

const WEEKDAY_NOTE = 'วันเกิดใช้เป็นสัญญาณรองเท่านั้น และเฉพาะความเชื่อที่เชื่อมกับ Master ID ที่มีอยู่จริง';
const REASONS = {
  INSUFFICIENT_USER_WISH_COVERAGE: 'ครอบคลุมเรื่องที่คุณเลือกไม่ถึง 30%',
  PLACE_EXCLUSION: 'มีสถานที่ที่คุณไม่ต้องการอยู่ในเส้นทาง',
};

export async function renderDemo(root) {
  let cat;
  try { cat = await getJSON('/api/catalog'); } catch (e) {
    root.append(h('div', { class: 'callout bad' }, 'โหลดข้อมูลจาก API ไม่สำเร็จ: ', String(e.message), ' — ถ้าเปิดไฟล์โดยตรงให้รันด้วย python scripts/dev_server.py หรือเปิดผ่านเว็บที่ deploy บน Vercel'));
    return;
  }
  const wishName = Object.fromEntries(cat.wishes.map((w) => [w.id, w.label]));
  const deityName = Object.fromEntries(cat.deities.map((d) => [d.id, d.name_th]));
  const S = { day: '', month: '', year: '', wishes: [], focus: [], groups: new Set(), deities: new Set(), places: new Set(), result: null, pick: new Set(), used: null, step: 1 };

  const stepsDef = ['กรอกโปรไฟล์', 'ระบบเสนอ', 'เลือกสิ่งที่อยากมู', 'บริการเสริม', 'ความคิดเห็น'];
  const stepper = h('ol', { class: 'stepper', 'aria-label': 'ขั้นตอน' });
  const secForm = h('section', { 'aria-labelledby': 'd-h1' });
  const secRes = h('section', { hidden: true, 'aria-labelledby': 'd-h2' });
  const secSvc = h('section', { hidden: true, 'aria-labelledby': 'd-h3' });
  const secFb = h('section', { hidden: true, 'aria-labelledby': 'd-h4' });
  const dlg = h('dialog', { 'aria-labelledby': 'dlg-title' });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  root.append(h('div', { class: 'lede' }, h('h2', {}, 'ทดลองใช้งานแบบผู้ใช้'),
    h('p', {}, 'กรอกวันเกิด เลือกเรื่องที่สนใจ 1–3 เรื่อง และสิ่งที่ไม่ต้องการให้เสนอ ระบบจะคำนวณจาก Knowledge Graph แล้วเสนอสถานที่ไม่เกิน 5 แห่ง พร้อมทริปบริษัท 1 ทริปที่เหมาะที่สุด (หรือบอกว่าไม่มี)')),
    stepper, secForm, secRes, secSvc, secFb, dlg);

  function setStep(n) {
    S.step = n;
    clear(stepper);
    stepsDef.forEach((t, i) => stepper.append(h('li', { class: i + 1 === n ? 'on' : i + 1 < n ? 'done' : '', 'aria-current': i + 1 === n ? 'step' : null }, h('b', {}, i + 1 < n ? '✓' : i + 1), t)));
  }
  setStep(1);

  /* ------------------------------------------------ 1. profile form */
  function buildForm() {
    clear(secForm);
    const years = [];
    for (let y = 2569; y >= 2470; y--) years.push(y);
    const sel = (key, opts, ph) => h('select', { 'aria-label': ph, onchange: (e) => { S[key] = e.target.value; } },
      h('option', { value: '' }, ph), opts.map(([v, t]) => h('option', { value: v, selected: String(S[key]) === String(v) }, t)));
    const errBox = h('div', { class: 'callout bad', role: 'alert', hidden: true });

    const wishBox = h('div', { class: 'chips', role: 'group', 'aria-label': 'เรื่องที่สนใจ' });
    const counter = h('span', { class: 'hint' });
    const drawWishes = () => {
      clear(wishBox);
      cat.wishes.forEach((w) => {
        const on = S.wishes.includes(w.id);
        wishBox.append(h('button', { type: 'button', class: 'pill', 'aria-pressed': String(on), disabled: !on && S.wishes.length >= 3,
          onclick: () => { S.wishes = on ? S.wishes.filter((x) => x !== w.id) : [...S.wishes, w.id]; drawWishes(); } }, w.label));
      });
      counter.textContent = `เลือกแล้ว ${S.wishes.length}/3`;
    };
    drawWishes();

    const grp = cat.tradition_groups.map((g) => h('label', {}, h('input', { type: 'checkbox', checked: S.groups.has(g), onchange: (e) => { e.target.checked ? S.groups.add(g) : S.groups.delete(g); } }), g));
    const deityList = h('div', { class: 'checklist' }, cat.deities.map((d) => h('label', {}, h('input', { type: 'checkbox', checked: S.deities.has(d.id), onchange: (e) => { e.target.checked ? S.deities.add(d.id) : S.deities.delete(d.id); } }), h('span', {}, d.name_th, ' ', h('small', {}, d.tradition)))));
    const placeList = h('div', { class: 'checklist' }, cat.places.map((p) => h('label', {}, h('input', { type: 'checkbox', checked: S.places.has(p.id), onchange: (e) => { e.target.checked ? S.places.add(p.id) : S.places.delete(p.id); } }), h('span', {}, p.name))));

    const go = h('button', { type: 'submit', class: 'btn primary' }, 'ให้ระบบเสนอ');
    const form = h('form', { class: 'card stack', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      errBox.hidden = true;
      if (!S.wishes.length) return showErr('เลือกเรื่องที่สนใจอย่างน้อย 1 เรื่อง');
      const dob = readDob();
      if (dob === false) return showErr('วันเกิดไม่ถูกต้อง ตรวจสอบวัน เดือน ปี (พ.ศ.) อีกครั้ง หรือเว้นว่างทั้งสามช่อง');
      S.dob = dob; S.focus = [...S.wishes]; S.pick.clear(); S.used = null;
      go.disabled = true;
      try { await run(); } catch (err) { showErr(err.message); } finally { go.disabled = false; }
    } },
      h('h3', { id: 'd-h1' }, '1 · โปรไฟล์ของคุณ'),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'วัน/เดือน/ปีเกิด ', h('span', { class: 'hint' }, '(ไม่บังคับ — คำนวณในหน่วยความจำ ไม่บันทึก)')),
        h('div', { class: 'row' },
          sel('day', Array.from({ length: 31 }, (_, i) => [i + 1, i + 1]), 'วัน'),
          sel('month', MONTHS_TH.map((m, i) => [i + 1, m]), 'เดือน'),
          sel('year', years.map((y) => [y, 'พ.ศ. ' + y]), 'ปี'))),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'สิ่งที่สนใจ ', h('span', { class: 'hint' }, '(เลือก 1–3 เรื่อง) '), counter), wishBox),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'สิ่งที่ไม่ต้องการให้เสนอ ', h('span', { class: 'hint' }, '(ไม่บังคับ — ระบบจะตัดออกก่อนคำนวณ)')),
        h('div', { class: 'stack' },
          h('div', { class: 'checklist' }, grp),
          h('details', {}, h('summary', {}, 'สิ่งศักดิ์สิทธิ์บางองค์ (39)'), h('div', { class: 'inner' }, deityList)),
          h('details', {}, h('summary', {}, 'สถานที่บางแห่ง (52)'), h('div', { class: 'inner' }, placeList)))),
      errBox, h('div', { class: 'row' }, go,
        h('button', { type: 'button', class: 'btn ghost', onclick: () => { Object.assign(S, { day: '', month: '', year: '', wishes: [], groups: new Set(), deities: new Set(), places: new Set() }); buildForm(); } }, 'ล้างข้อมูล')));
    secForm.append(form);
    function showErr(msg) { errBox.textContent = msg; errBox.hidden = false; }
  }
  function readDob() {
    const { day, month, year } = S;
    if (!day && !month && !year) return null;
    if (!day || !month || !year) return false;
    const y = Number(year) - 543, m = Number(month), d = Number(day);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || dt > new Date()) return false;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const payload = () => ({
    wish_ids: S.focus, birthdate: S.dob || null,
    exclusions: { tradition_groups: [...S.groups], deity_ids: [...S.deities], place_ids: [...S.places] },
  });

  async function run() {
    S.result = await postJSON('/api/recommendations', payload());
    setStep(3);
    drawResults();
    secRes.hidden = false;
    await drawServices();
    secSvc.hidden = false;
    setStep(4);
    secFb.hidden = !S.used;
    secRes.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ------------------------------------------------ 2-3. results + refine */
  function drawResults() {
    const R = S.result;
    clear(secRes);
    const refine = h('div', { class: 'card stack' },
      h('h3', {}, '3 · เลือกสิ่งที่อยากมูตอนนี้'),
      h('p', { class: 'sub' }, 'ติ๊กเลือกเรื่องที่อยากมูวันนี้ ระบบคำนวณใหม่ทันที จำนวนสถานที่อาจน้อยกว่า 5 ได้ถ้ามีเส้นทางที่ผ่านเงื่อนไขไม่พอ'),
      h('div', { class: 'chips', role: 'group', 'aria-label': 'เรื่องที่อยากมูตอนนี้' }, S.wishes.map((w) => {
        const on = S.focus.includes(w);
        return h('button', { type: 'button', class: 'pill', 'aria-pressed': String(on), disabled: on && S.focus.length === 1, title: on && S.focus.length === 1 ? 'ต้องเหลืออย่างน้อย 1 เรื่อง' : null,
          onclick: async () => { S.focus = on ? S.focus.filter((x) => x !== w) : [...S.focus, w]; await rerun(); } }, wishName[w]);
      })),
      h('div', { class: 'row' },
        h('span', { class: 'chip' }, `ผ่านเงื่อนไข ${R.candidate_places} แห่ง`),
        R.profile.weekday ? h('span', { class: 'chip', title: WEEKDAY_NOTE }, 'เกิด' + R.profile.weekday) : null,
        R.profile.applied_exclusions.deity_ids.length ? h('span', { class: 'chip' }, `ตัดสิ่งศักดิ์สิทธิ์ ${R.profile.applied_exclusions.deity_ids.length} องค์`) : null,
        R.profile.applied_exclusions.place_ids.length ? h('span', { class: 'chip' }, `ตัดสถานที่ ${R.profile.applied_exclusions.place_ids.length} แห่ง`) : null,
        h('button', { type: 'button', class: 'btn sm ghost', onclick: () => { setStep(1); secForm.scrollIntoView({ behavior: 'smooth' }); } }, 'แก้โปรไฟล์')));

    const head = h('h2', { id: 'd-h2', style: 'font-size:20px;margin:18px 0 10px' }, `2 · สถานที่ที่ระบบเสนอ (${R.top5.length}/5)`);
    const list = h('div', { class: 'stack' });
    if (!R.top5.length) {
      list.append(h('div', { class: 'callout warn' }, h('b', {}, 'ไม่มีสถานที่ที่ผ่านเงื่อนไข'), h('p', { class: 'small', style: 'margin:.3em 0 0' },
        'เรื่องที่เลือกกับสิ่งที่คุณไม่ต้องการทำให้ไม่เหลือเส้นทาง เรื่องที่ขอ → สิ่งศักดิ์สิทธิ์ → สถานที่ ที่ตรงตามข้อมูล ระบบจึงไม่แนะนำสิ่งที่ขัดกับที่คุณไม่ต้องการ ลองเอาตัวเลือกที่ไม่ต้องการออกบางข้อ หรือเลือกเรื่องอื่นเพิ่ม')));
    } else if (R.limited_results) {
      list.append(h('div', { class: 'callout' }, `แสดง ${R.top5.length} แห่ง (น้อยกว่า 5) — ${R.limited_reason || 'ไม่มีเส้นทางที่มีแหล่งอ้างอิงเพิ่ม'} ระบบไม่เติมรายการให้ครบ`));
    }
    R.top5.forEach((p) => list.append(placeCard(p)));
    secRes.append(refine, head, list, tripCard(R.trip), h('div', { class: 'callout', style: 'margin-top:14px' }, R.notes.join(' · ')));
  }
  async function rerun() {
    try { S.result = await postJSON('/api/recommendations', payload()); S.pick = new Set([...S.pick].filter((id) => S.result.top5.some((p) => p.place_id === id))); drawResults(); await drawServices(); }
    catch (e) { toast('คำนวณไม่สำเร็จ: ' + e.message); }
  }

  function placeCard(p) {
    const chosen = S.pick.has(p.place_id);
    return h('article', { class: 'card place' },
      h('div', { class: 'rank', 'aria-label': 'อันดับ ' + p.rank }, p.rank),
      h('div', { class: 'stack', style: 'min-width:0' },
        h('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-start' },
          h('div', {}, h('h3', {}, p.name), h('div', { class: 'small muted' }, p.district + ' · สถานีใกล้สุด ' + p.station_id + ' · เข้าถึงประมาณ ' + p.access_min + ' นาที (ประมาณการ)')),
          h('div', { style: 'min-width:150px' }, h('div', { class: 'small muted' }, 'คะแนนเครือข่าย ', h('b', { class: 'mono' }, f(p.score, 3))), bar(p.score, 1, 'alt'))),
        h('div', { class: 'row' }, p.matched_wishes.map((w) => h('span', { class: 'chip wish' }, w)),
          h('span', { class: 'chip', title: 'เวลาเปิดเป็นข้อมูลสาธิต' }, `เปิด ${p.hours.open}–${p.hours.close}`), statusChip(p.hours.status, 'เวลาเปิด')),
        h('div', {}, h('div', { class: 'small', style: 'font-weight:600' }, 'เหตุผลจากเครือข่าย'),
          p.paths.map((z) => h('div', { class: 'path' },
            h('b', {}, z.wish_name), h('span', { class: 'arrow' }, '→'), z.deity_name, h('span', { class: 'arrow' }, '→'), p.name,
            h('div', { class: 'row small muted', style: 'margin-top:3px' }, z.reason, statusChip(z.wish_link_status, 'เรื่อง–เทพ'), statusChip(z.place_link_status, 'เทพ–สถานที่'))))),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn sm', onclick: () => openPlace(p.place_id) }, 'ดูวิธีมูและรายละเอียด'),
          h('label', { class: 'row small', style: 'gap:6px' }, h('input', { type: 'checkbox', checked: chosen, onchange: async (e) => { e.target.checked ? S.pick.add(p.place_id) : S.pick.delete(p.place_id); await drawServices(); } }), 'เลือกไปมูที่นี่'),
          h('button', { type: 'button', class: 'btn sm ghost', onclick: async () => { S.places.add(p.place_id); toast('ตัด ' + p.name + ' ออกแล้ว คำนวณใหม่'); await rerun(); } }, 'ไม่เอาที่นี่'))));
  }

  function tripCard(T) {
    const wrap = h('section', { class: 'card stack', style: 'margin-top:16px', 'aria-label': 'ทริปบริษัทที่เหมาะที่สุด' });
    if (!T.matched) {
      wrap.append(h('h3', {}, 'ทริปบริษัท: ไม่มีทริปที่เหมาะกับโปรไฟล์นี้'),
        h('div', { class: 'callout warn' }, 'ผลคือ NO_ELIGIBLE_SIGNATURE_TRIP — ทริปทั้ง 3 รายการไม่ผ่านข้อจำกัดอย่างน้อยหนึ่งข้อ ระบบจึงไม่เลือกทริปที่ขัดกับที่คุณไม่ต้องการ และไม่สร้างทริปใหม่ให้'),
        tripScoreTable(T));
      return wrap;
    }
    const D = T.detail;
    wrap.append(h('div', { class: 'row', style: 'justify-content:space-between' },
      h('div', {}, h('span', { class: 'chip' }, 'ทริปที่เหมาะที่สุด 1 ใน 3'), h('h3', { style: 'margin-top:6px;font-size:19px' }, `${TRIP_TH[D.trip_id]} · ${D.title}`),
        h('div', { class: 'small muted' }, `เริ่ม 09:00 ที่สยาม · จบประมาณ ${D.finish_clock} · รวม ${Math.round(D.duration_min)} นาที · ${D.stops.length} จุดแวะ · BTS/MRT + เดิน/Skywalk`)),
      h('div', { class: 'small' }, h('div', {}, 'คะแนนจับคู่ ', h('b', { class: 'mono' }, f(T.matched.matching_score, 3))), h('div', { class: 'muted' }, 'ครอบคลุมเรื่องที่เลือก ' + pct(T.matched.coverage_fraction, 0)))),
      h('ol', { class: 'timeline' }, D.stops.map((s) => h('li', {},
        h('div', { class: 't' }, `${s.arrival}–${s.finish} · ${s.station_name} (${s.station_id}) · ${s.access_mode === 'skywalk' ? 'Skywalk' : 'เดิน'}`),
        h('div', {}, h('button', { type: 'button', class: 'btn sm ghost', style: 'padding:0;border:0;font-weight:600;text-decoration:underline', onclick: () => openPlace(s.place_id) }, s.name)),
        h('div', { class: 'small muted' }, 'พิธีเด่น: ' + s.featured_deity + ' · ', statusChip(s.hours_origin === 'SYNTHETIC_DEMO_HOURS' ? 'SYNTHETIC' : 'CANDIDATE', 'เวลาเปิด'))))),
      h('div', { class: 'callout' }, 'ทริปนี้เป็น "ทริปคงที่" ที่บริษัทออกแบบล่วงหน้า ระบบแค่เลือกจาก 3 ทริป ไม่ปรับหรือสร้างเส้นทางใหม่ตามผู้ใช้ และยังไม่ใช่การยืนยันที่นั่ง ราคา หรือวันเดินทาง'),
      h('details', {}, h('summary', {}, 'ดูคะแนนเทียบทั้ง 3 ทริป'), h('div', { class: 'inner' }, tripScoreTable(T))));
    return wrap;
  }
  function tripScoreTable(T) {
    return h('div', { class: 'scroll-x' }, h('table', {},
      h('thead', {}, h('tr', {}, ['ทริป', 'ผ่านเกณฑ์', 'ครอบคลุมเรื่องที่เลือก', 'ความเกี่ยวข้องในเครือข่าย', 'คะแนนรวม', 'เหตุผลที่ตก'].map((t, i) => h('th', { class: i > 0 && i < 5 ? 'n' : '' }, t)))),
      h('tbody', {}, T.all_scores.map((s) => h('tr', { class: s.eligible ? '' : 'out' },
        h('td', {}, TRIP_TH[s.trip_id], h('div', { class: 'small faint' }, s.trip_name)),
        h('td', { class: 'n' }, s.eligible ? 'ผ่าน' : 'ไม่ผ่าน'), h('td', { class: 'n' }, pct(s.coverage_fraction, 0)),
        h('td', { class: 'n' }, f(s.graph_relevance)), h('td', { class: 'n' }, f(s.matching_score)),
        h('td', { class: 'small' }, s.reason_codes.length ? s.reason_codes.map(reasonText).join(' · ') : '—'))))));
  }
  function reasonText(c) {
    if (c.startsWith('FEATURED_RITUAL_EXCLUSION:')) return 'มีพิธีเด่นของ ' + c.split(':')[1].split(',').map((d) => deityName[d] || d).join(', ') + ' ที่คุณไม่ต้องการ';
    return REASONS[c] || c;
  }

  /* ------------------------------------------------ place dialog */
  async function openPlace(id) {
    clear(dlg).append(h('div', { class: 'dlg-b' }, 'กำลังโหลด…'));
    dlg.showModal();
    try {
      const P = await getJSON('/api/places/' + id);
      clear(dlg).append(
        h('div', { class: 'dlg-h' }, h('div', {}, h('h3', { id: 'dlg-title' }, P.name), h('div', { class: 'small muted' }, P.district + ' · ' + P.address)),
          h('button', { type: 'button', class: 'btn sm', onclick: () => dlg.close(), 'aria-label': 'ปิด' }, 'ปิด')),
        h('div', { class: 'dlg-b stack' },
          h('div', { class: 'row' }, h('span', { class: 'chip' }, `เปิด ${P.hours.open}–${P.hours.close}`), statusChip(P.hours.status, 'เวลาเปิด'), h('span', { class: 'chip st-unv' }, 'พิกัด: สถานี ' + P.station.id + ' ไม่ใช่ตำแหน่งสถานที่จริง')),
          P.caution ? h('div', { class: 'callout warn small' }, P.caution) : null,
          h('div', {}, h('h4', {}, 'สิ่งศักดิ์สิทธิ์ที่เกี่ยวข้องกับสถานที่นี้'),
            h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'สิ่งศักดิ์สิทธิ์'), h('th', {}, 'ความเชื่อ'), h('th', {}, 'เรื่องที่ขอ'), h('th', {}, 'สถานะ'))),
              h('tbody', {}, P.sacred_entities.map((e) => h('tr', {}, h('td', {}, e.deity_name), h('td', {}, e.tradition), h('td', {}, e.wish_names.join(', ')), h('td', {}, statusChip(e.place_link_status, 'เทพ–สถานที่')))))))),
          ritualBlock('วิธีมู/ของไหว้ของสถานที่นี้', P.rituals.place),
          ...Object.entries(P.rituals.deity).map(([d, rows]) => ritualBlock('ของ' + (deityName[d] || d), rows)),
          !P.rituals.place.length && !Object.keys(P.rituals.deity).length ? h('div', { class: 'callout' }, 'ยังไม่มีข้อมูลวิธีมูที่มีแหล่งอ้างอิงสำหรับสถานที่นี้') : null,
          h('div', { class: 'callout small' }, P.disclaimer)));
    } catch (e) { clear(dlg).append(h('div', { class: 'dlg-b' }, h('div', { class: 'callout bad' }, 'โหลดรายละเอียดไม่สำเร็จ: ' + e.message), h('button', { class: 'btn', onclick: () => dlg.close() }, 'ปิด'))); }
  }
  function ritualBlock(title, rows) {
    if (!rows.length) return null;
    return h('div', {}, h('h4', {}, title), rows.map((r) => h('div', { class: 'ritual' },
      h('b', {}, r.category_th + ': '), r.detail,
      h('div', { class: 'src' }, 'แหล่ง: ' + r.source_name + ' · ', r.verification, ' · ', h('span', {}, r.quality_status === 'SOURCE_MISSING' ? 'ยังไม่มีแหล่งยืนยัน' : 'เป็นข้อมูลอ้างอิง ไม่ใช่การรับรองทางการ'),
        r.source_urls.filter((u) => /^https?:\/\//.test(u)).map((u, i) => [' · ', h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, 'แหล่ง ' + (i + 1))])))));
  }

  /* ------------------------------------------------ 4. services */
  async function drawServices() {
    const R = S.result;
    const ids = S.pick.size ? [...S.pick] : R.top5.map((p) => p.place_id);
    clear(secSvc);
    secSvc.append(h('h2', { id: 'd-h3', style: 'font-size:20px;margin:18px 0 10px' }, '4 · บริการเสริม (จำลอง)'));
    const trip = R.trip.matched ? h('div', { class: 'card stack' },
      h('h3', {}, 'ทริปบริษัท'), h('p', { class: 'sub' }, `${TRIP_TH[R.trip.matched.trip_id]} · 4 จุดแวะ · ราคาและที่นั่ง: ยังไม่กำหนด`),
      h('button', { type: 'button', class: 'btn primary', onclick: () => useService({ kind: 'trip', label: 'ทริป ' + TRIP_TH[R.trip.matched.trip_id], trip_id: R.trip.matched.trip_id }) }, 'สนใจทริปนี้ (จำลอง)')) :
      h('div', { class: 'card' }, h('h3', {}, 'ทริปบริษัท'), h('p', { class: 'sub' }, 'ไม่มีทริปที่เหมาะกับโปรไฟล์นี้ ระบบจึงไม่เสนอ'));
    const box = h('div', { class: 'card stack' }, h('h3', {}, 'ฝากมู'), h('p', { class: 'sub' }, S.pick.size ? 'สำหรับสถานที่ที่คุณเลือกไปมู' : 'สำหรับสถานที่ที่ระบบเสนอ (ติ๊ก "เลือกไปมูที่นี่" เพื่อกรอง)'), h('p', { class: 'small muted' }, 'กำลังโหลด…'));
    secSvc.append(h('div', { class: 'grid g2' }, trip, box));
    try {
      const O = await postJSON('/api/offers', { place_ids: ids, wish_ids: S.focus });
      const shown = O.offers.slice(0, 6);
      clear(box).append(h('h3', {}, 'ฝากมู'), h('p', { class: 'sub' }, S.pick.size ? 'สำหรับสถานที่ที่คุณเลือกไปมู' : 'สำหรับสถานที่ที่ระบบเสนอ'),
        ...(shown.length ? shown.map((o) => h('div', { class: 'path' }, h('div', { style: 'font-weight:600' }, o.title),
          h('div', { class: 'small muted' }, `${o.place_name} · ${o.wish_name} · ${o.price_thb} บาท · ล่วงหน้า ${o.lead_time_days} วัน`),
          h('div', { class: 'row', style: 'margin-top:4px' }, statusChip('SYNTHETIC', 'ผู้ให้บริการ'), h('button', { type: 'button', class: 'btn sm', onclick: () => useService({ kind: 'proxy', label: o.title, offer_id: o.offer_id }) }, 'ใช้บริการนี้ (จำลอง)')))) : [h('p', { class: 'muted' }, 'ไม่มีบริการฝากมูสำหรับสถานที่ที่เลือก')]),
        h('div', { class: 'callout small' }, O.disclaimer));
    } catch (e) { clear(box).append(h('div', { class: 'callout bad' }, 'โหลดบริการไม่สำเร็จ: ' + e.message)); }
  }

  /* ------------------------------------------------ 5. feedback */
  function useService(u) {
    S.used = u;
    toast('จำลองการใช้บริการ: ' + u.label + ' (ไม่มีการจองหรือชำระเงินจริง)');
    setStep(5);
    drawFeedback();
    secFb.hidden = false;
    secFb.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function drawFeedback() {
    const u = S.used;
    clear(secFb);
    const msg = h('div', { role: 'status' });
    let rating = 0;
    const stars = h('div', { class: 'stars', role: 'radiogroup', 'aria-label': 'คะแนน 1 ถึง 5' }, [1, 2, 3, 4, 5].map((n) => h('label', {}, h('input', { type: 'radio', name: 'rating', value: n, onchange: () => { rating = n; } }), h('span', {}, n + ' ★'))));
    const reason = h('select', { id: 'fb-reason' }, [['RELEVANT', 'ตรงกับที่ต้องการ'], ['NOT_RELEVANT', 'ไม่ตรงกับที่ต้องการ'], ['TOO_FAR', 'เดินทางไกล/ไม่สะดวก'], ['TOO_LONG', 'ใช้เวลานานไป'], ['PRICE', 'ราคา'], ['COMMUNICATION', 'การสื่อสาร'], ['OTHER', 'อื่น ๆ']].map(([v, t]) => h('option', { value: v }, t)));
    let again = '';
    const comment = h('textarea', { maxlength: '200', id: 'fb-comment', placeholder: 'เล่าสั้น ๆ ได้ (ไม่เกิน 200 ตัวอักษร) — อย่าใส่ชื่อ เบอร์โทร หรือข้อมูลส่วนตัว' });
    const btn = h('button', { type: 'submit', class: 'btn primary' }, 'ส่งความคิดเห็น');
    secFb.append(h('form', { class: 'card stack', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      if (!rating) { msg.replaceChildren(h('div', { class: 'callout bad', role: 'alert' }, 'เลือกคะแนน 1–5 ก่อนส่ง')); return; }
      btn.disabled = true;
      try {
        const r = await postJSON('/api/feedback', { kind: u.kind, rating, reason_tag: reason.value, would_use_again: again, comment: comment.value,
          wish_ids: S.focus, place_ids: S.result.top5.map((p) => p.place_id), trip_id: u.trip_id || (S.result.trip.matched || {}).trip_id || '', offer_id: u.offer_id || '' });
        msg.replaceChildren(h('div', { class: r.saved ? 'callout ok' : 'callout warn' }, r.message));
        setStep(6);
      } catch (err) { msg.replaceChildren(h('div', { class: 'callout bad', role: 'alert' }, err.message)); btn.disabled = false; }
    } },
      h('h3', { id: 'd-h4' }, '5 · ความคิดเห็นหลังใช้บริการ'),
      h('p', { class: 'sub' }, 'บริการที่ใช้: ' + u.label + ' — ให้คะแนนประสบการณ์ของบริการ ไม่ใช่ผลของการขอพร'),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'คะแนน'), stars),
      h('div', { class: 'field' }, h('label', { for: 'fb-reason' }, 'เหตุผลหลัก'), reason),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'จะใช้บริการนี้อีกไหม'), h('div', { class: 'row' }, [['YES', 'ใช้อีก'], ['MAYBE', 'ยังไม่แน่ใจ'], ['NO', 'ไม่ใช้อีก']].map(([v, t]) => h('label', { class: 'row small', style: 'gap:6px' }, h('input', { type: 'radio', name: 'again', onchange: () => { again = v; } }), t)))),
      h('div', { class: 'field' }, h('label', { for: 'fb-comment' }, 'ความเห็นเพิ่มเติม (ไม่บังคับ)'), comment),
      h('div', { class: 'row' }, btn), msg,
      h('p', { class: 'small faint' }, 'เก็บเฉพาะ: คะแนน เหตุผล เรื่องที่เลือก สถานที่/ทริป และข้อความของคุณ — ไม่เก็บวันเกิด ใน Phase 1 ยังไม่ใช้ feedback ฝึกโมเดล')));
  }

  buildForm();
}
