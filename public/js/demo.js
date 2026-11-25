// Tab 1 — MUMU user demo: 7 steps. Every number and every place comes from the engine (via /api/mumu/*).
import { h, clear, put, f, pct, statusChip, statusLegend, TRIP_TH, MONTHS_TH, bar, toast } from './util.js';
import { userNote, userSourceName, userVerification, userCaution, userLimitedReason, stationText, accessText, legLines, birthText, noTripPlan } from './usertext.js';
import { osmCredit } from './osm.js';
import { API } from './api.js';
import { S, subscribe, invalidate, ensureResult, profile, birthdateISO, activeWishes, catalogNames, todayISO } from './state.js';
import { displayLayer } from './calendar.js';
import { discoverySection, resetDismissed } from './discovery.js';
import { fixedCalendarSection, resetFixedDismissed } from './fixedcal.js';
import { eventCard, snapNetwork, calendarCard, setHooks, mountChrome, refresh as refreshNotify, clearAllNotifyData } from './notifyui.js';
import { hero, moon, wishIcon } from './icons.js';

const STEPS = ['เริ่มต้น', 'ความสนใจ', 'ข้อจำกัด', 'เรื่องที่แนะนำ', 'สถานที่', 'ทริป', 'บริการ'];
const REASONS = { INSUFFICIENT_USER_WISH_COVERAGE: 'ครอบคลุมเรื่องที่คุณเลือกไม่ถึง 30%', PLACE_EXCLUSION: 'มีสถานที่ที่คุณไม่ต้องการอยู่ในเส้นทาง' };
const SERVICES = [['self', '📍', '#e3f6e8', 'ไปมูเอง', 'เลือกสถานที่ไปเอง'], ['trip', '🚆', '#ece4ff', 'ทริปบริษัท', '(Demo)'], ['proxy', '🙏', '#ffe7d3', 'ฝากมู', '(Demo)']];

export async function renderDemo(root) {
  const host = h('div', { class: 'app1' });
  const dlg = h('dialog');
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  root.append(host, dlg);

  let cat;
  host.append(h('div', { class: 'card' }, h('div', { class: 'spinner' }), h('p', { class: 'muted', style: 'text-align:center' }, 'กำลังโหลด…')));
  try { cat = await API.catalog(); } catch (e) {
    clear(host).append(h('div', { class: 'callout bad' }, 'โหลดข้อมูลไม่สำเร็จ: ' + e.message, ' — ถ้ารันในเครื่องให้ใช้ python scripts/dev_server.py'));
    return;
  }
  const wishName = Object.fromEntries(cat.wishes.map((w) => [w.id, w.label]));
  const deityItems = cat.deities.map((d) => ({ id: d.id, name: d.name_th, sub: d.tradition, en: d.name_en }));
  const placeItems = cat.places.map((p) => ({ id: p.id, name: p.name, sub: p.district }));
  const nameOf = (id) => (deityItems.find((x) => x.id === id) || placeItems.find((x) => x.id === id) || { name: id }).name;

  cat.wishes.forEach((w) => { catalogNames.wish[w.id] = w.label; });
  setHooks({
    showBar: () => S.step >= 4,
    // "มูเรื่องนี้ต่อ": straight to step 07, where the user picks self / company trip / proxy. Step 06 stays reachable from there.
    continueWith: (f) => {
      // The Step 02 interests (S.wishes) are never written here. A wish outside them becomes a TEMPORARY topic (S.topic) until the user goes back.
      const w = (f.wish_ids || []).find((x) => S.wishes.includes(x)) || (f.wish_ids || [])[0];
      S.topic = w && !S.wishes.includes(w) ? w : null;
      S.focus = 'ALL'; S.picked.clear(); S.service = null; invalidate();
      S.eventContext = { event_id: f.parent_id, name: f.name, place_id: f.place_id || null, place_name: f.place_name || null };
      S.maxStep = Math.max(S.maxStep, 7);
      go(S.topic || S.wishes.length ? 7 : 2);
    },
  });
  mountChrome();
  subscribe(() => { if (S.step >= 4 && host.isConnected) draw(); });

  /* ------------------------------------------------ frame */
  function go(n) {
    S.step = n; S.maxStep = Math.max(S.maxStep, n);
    if (n >= 4) ensureResult();
    draw();
    host.scrollIntoView({ block: 'start' });
  }
  function progress() {
    return h('ol', { class: 'progress', 'aria-label': 'ขั้นตอน' }, STEPS.map((t, i) => {
      const n = i + 1, cls = n === S.step ? 'on' : n < S.step ? 'done' : '';
      return h('li', { class: cls, 'aria-current': n === S.step ? 'step' : null },
        h('button', { type: 'button', disabled: n > S.maxStep, 'aria-label': `ขั้น ${n} ${t}`, onclick: () => go(n) }, h('div', { class: 'dot' }), h('span', { class: 'lab' }, `${n}. ${t}`)));
    }));
  }
  const title = (n, t, sub) => h('div', {}, h('div', { class: 'step-title' }, h('span', { class: 'step-no' }, String(n).padStart(2, '0')), t), sub ? h('div', { class: 'step-sub' }, sub) : null);
  const foot = (back, next) => h('div', { class: 'foot' }, back ? h('button', { type: 'button', class: 'btn', onclick: back.fn }, '← ' + (back.label || 'ย้อนกลับ')) : h('span'), next ? h('button', { type: 'button', class: 'btn primary', disabled: next.disabled, onclick: next.fn }, next.label + ' →') : null);

  function draw() {
    const hasData = S.step > 1 || S.wishes.length || S.d || S.m || S.y;
    put(clear(host), progress(), hasData ? h('div', { class: 'row', style: 'justify-content:flex-end;margin:-8px 0 8px' }, h('button', { type: 'button', class: 'btn sm ghost', title: 'ลบวันเกิดและตัวเลือกทั้งหมดออกจากหน้านี้', onclick: resetAll }, '🗑 ล้างข้อมูลของฉัน')) : null, ({ 1: step1, 2: step2, 3: step3, 4: step4, 5: step5, 6: step6, 7: step7 })[S.step]());
    refreshNotify();
  }

  /* ------------------------------------------------ 01 welcome + birthdate */
  function step1() {
    const cur = S.era === 'BE' ? 2569 : 2026;
    const years = Array.from({ length: 100 }, (_, i) => cur - i);
    const err = h('div', { class: 'callout bad', role: 'alert', hidden: true });
    const sel = (key, opts, ph) => h('select', { 'aria-label': ph, onchange: (e) => { S[key] = e.target.value; invalidate(); } },
      h('option', { value: '' }, ph), opts.map(([v, t]) => h('option', { value: v, selected: String(S[key]) === String(v) }, t)));
    const era = h('div', { class: 'seg', role: 'group', 'aria-label': 'ระบบปี' }, [['BE', 'พ.ศ.'], ['CE', 'ค.ศ.']].map(([v, t]) => h('button', { type: 'button', 'aria-pressed': String(S.era === v), onclick: () => {
      if (S.y) S.y = String(Number(S.y) + (v === 'BE' ? 543 : -543)); S.era = v; invalidate(); draw(); } }, t)));
    return h('div', { class: 'fade-in' }, h('div', { class: 'hero' }, h('div', { class: 'hero-art' }, hero()),
      h('div', { class: 'hero-body' }, h('div', { class: 'row hero-logo', style: 'justify-content:center;margin-bottom:6px' }, moon(30), h('b', { style: 'font-size:22px;letter-spacing:.08em;color:#512b86' }, 'MUMU')),
        h('h1', {}, 'มูให้ตรงใจ ไปให้ถูกที่'), h('p', { class: 'muted' }, 'ค้นหาสถานที่และทริปสายมูที่เหมาะกับคุณ ด้วยการวิเคราะห์เครือข่ายความสัมพันธ์'),
        h('div', { class: 'card flat stack', style: 'text-align:left;margin-top:14px' },
          h('div', { class: 'field' }, h('span', { class: 'lbl' }, '🎂 วันเกิดของคุณ ', h('span', { class: 'hint' }, '(ไม่บังคับ)')),
            h('div', { class: 'dp' }, era, sel('d', Array.from({ length: 31 }, (_, i) => [i + 1, i + 1]), 'วัน'), sel('m', MONTHS_TH.map((m, i) => [i + 1, m]), 'เดือน'), sel('y', years.map((y) => [y, y]), 'ปี'))),
          h('p', { class: 'small muted', style: 'margin:0' }, 'วันเกิดเป็นข้อมูลเสริมเท่านั้น ระบบใช้เฉพาะความเชื่อที่เชื่อมกับข้อมูลหลักได้ ไม่ต้องล็อกอิน และไม่บันทึกวันเกิดของคุณ (อยู่ในหน่วยความจำของหน้านี้เท่านั้น) ถ้ากด "ติดตาม" กิจกรรม เบราว์เซอร์นี้จะจำเฉพาะกิจกรรมที่ติดตามและการตั้งเตือน (ไม่มีวันเกิด) ลบได้ด้วยปุ่ม "ล้างข้อมูลของฉัน"'),
          err),
        h('div', { class: 'foot', style: 'justify-content:center' }, h('button', { type: 'button', class: 'btn primary', style: 'max-width:none;flex:0 1 320px;margin:0', onclick: () => {
          if (birthdateISO() === false) { err.textContent = 'วันเกิดไม่ถูกต้อง กรุณากรอกวัน เดือน ปี ให้ครบและเป็นวันที่ที่มีจริง หรือเว้นว่างทั้งหมด'; err.hidden = false; return; }
          go(2); } }, 'เริ่มมูของฉัน →')))));
  }

  /* ------------------------------------------------ 02 interests */
  function step2() {
    const grid = h('div', { class: 'wish-grid', role: 'group', 'aria-label': 'เรื่องที่สนใจ' });
    const counter = h('span', { class: 'counter' });
    const nextBtn = h('button', { type: 'button', class: 'btn primary', onclick: () => go(3) }, 'ถัดไป →');
    const paint = () => {
      clear(grid);
      cat.wishes.forEach((w) => {
        const on = S.wishes.includes(w.id), ic = wishIcon(w.id);
        grid.append(h('button', { type: 'button', class: 'wish-card', 'aria-pressed': String(on), disabled: !on && S.wishes.length >= 3, onclick: () => {
          S.wishes = on ? S.wishes.filter((x) => x !== w.id) : [...S.wishes, w.id]; S.focus = 'ALL'; S.topic = null; S.eventContext = null; invalidate(); paint(); } },
        h('span', { class: 'ic', style: `background:${ic.bg}` }, ic.e), w.label));
      });
      counter.textContent = `เลือกแล้ว ${S.wishes.length}/3`;
      nextBtn.disabled = !S.wishes.length;
    };
    paint();
    return h('div', { class: 'fade-in' }, title(2, 'วันนี้อยากมูเรื่องอะไร?', 'เลือกได้ 1–3 เรื่องที่คุณสนใจ'), h('p', {}, counter), grid,
      h('div', { class: 'foot' }, h('button', { type: 'button', class: 'btn', onclick: () => go(1) }, '← ย้อนกลับ'), nextBtn));
  }

  /* ------------------------------------------------ 03 exclusions */
  function multi(items, set, ph) {
    const wrap = h('div', { class: 'ms' }), chips = h('div', { class: 'row', style: 'margin-top:8px' });
    const input = h('input', { type: 'search', placeholder: ph, 'aria-label': ph, autocomplete: 'off' });
    const list = h('div', { class: 'ms-list', hidden: true, role: 'listbox' });
    const drawChips = () => { clear(chips); [...set].forEach((id) => chips.append(h('span', { class: 'chip pink' }, nameOf(id), h('button', { type: 'button', 'aria-label': 'ลบ ' + nameOf(id), onclick: () => { set.delete(id); invalidate(); drawChips(); } }, '×')))); };
    const drawList = () => {
      const q = input.value.trim().toLowerCase();
      const found = items.filter((i) => !set.has(i.id) && (!q || `${i.name} ${i.sub || ''} ${i.en || ''}`.toLowerCase().includes(q))).slice(0, 12);
      clear(list).append(...(found.length ? found.map((i) => h('button', { type: 'button', role: 'option', onclick: () => { set.add(i.id); invalidate(); input.value = ''; list.hidden = true; drawChips(); } }, i.name, ' ', h('small', {}, i.sub || ''))) : [h('div', { class: 'small faint', style: 'padding:8px 12px' }, 'ไม่พบรายการ')]));
      list.hidden = false;
    };
    input.addEventListener('input', drawList); input.addEventListener('focus', drawList);
    const away = (e) => { if (!wrap.isConnected) return document.removeEventListener('click', away); if (!wrap.contains(e.target)) list.hidden = true; };
    document.addEventListener('click', away);
    drawChips();
    wrap.append(input, list);
    return h('div', {}, wrap, chips);
  }
  function step3() {
    const tg = h('div', { class: 'tchips', role: 'group', 'aria-label': 'กลุ่มความเชื่อที่ไม่ต้องการ' }, cat.tradition_groups.map((g) => h('button', { type: 'button', class: 'tchip', 'aria-pressed': String(S.groups.has(g)),
      onclick: (e) => { S.groups.has(g) ? S.groups.delete(g) : S.groups.add(g); invalidate(); e.currentTarget.setAttribute('aria-pressed', String(S.groups.has(g))); } }, g)));
    return h('div', { class: 'fade-in stack' }, title(3, 'สิ่งที่ไม่ต้องการให้แนะนำ', 'เลือกสิ่งที่ไม่สะดวกหรือไม่ต้องการได้ (ไม่บังคับ)'),
      h('div', { class: 'card stack' }, h('h3', {}, 'A · กลุ่มความเชื่อ / ศาสนา'), tg),
      h('div', { class: 'card stack' }, h('h3', {}, 'B · สิ่งศักดิ์สิทธิ์'), multi(deityItems, S.deities, 'ค้นหาสิ่งศักดิ์สิทธิ์ เช่น พระพิฆเนศ')),
      h('div', { class: 'card stack' }, h('h3', {}, 'C · สถานที่'), multi(placeItems, S.places, 'ค้นหาสถานที่')),
      h('div', { class: 'callout info small' }, 'ข้อจำกัดเหล่านี้เป็นกฎเด็ดขาด ระบบจะตัดเส้นทางออกจากเครือข่ายก่อนคำนวณ ไม่ใช่แค่ซ่อนผลลัพธ์ สถานที่ที่มีหลายสิ่งศักดิ์สิทธิ์ยังถูกแนะนำได้ถ้ามีเส้นทางอื่นที่คุณไม่ได้ห้าม'),
      foot({ fn: () => go(2) }, { label: 'ถัดไป', fn: () => go(4) }));
  }

  /* ------------------------------------------------ states shared by steps 4-6 */
  function gate(n, ttl, sub, ok) {
    if (S.status === 'loading' || (S.status === 'idle' && !S.result)) return h('div', { class: 'fade-in' }, title(n, ttl, sub), h('div', { class: 'card', style: 'text-align:center;padding:40px 18px' }, h('div', { class: 'spinner' }), h('p', { class: 'muted', style: 'margin-top:14px' }, 'กำลังคำนวณจากเครือข่ายความสัมพันธ์…')));
    if (S.status === 'error') return h('div', { class: 'fade-in' }, title(n, ttl, sub), h('div', { class: 'callout bad', role: 'alert' }, 'คำนวณไม่สำเร็จ: ' + S.error), h('div', { class: 'foot' }, h('button', { class: 'btn', onclick: () => go(3) }, '← แก้ข้อมูล'), h('button', { class: 'btn primary', onclick: () => ensureResult(true) }, 'ลองอีกครั้ง')));
    return ok();
  }
  /* Temporary activity mode: shown on steps 04-07 whenever the recommendation comes from an activity, not from the Step 02 interests. */
  function backToInterests() {
    S.topic = null; S.eventContext = null; S.focus = 'ALL'; S.picked.clear(); S.service = null; invalidate();
    if (S.wishes.length) { go(S.step >= 4 ? S.step : 4); } else { S.maxStep = 2; go(2); }   // no main interests yet: choose them in step 02, nothing is saved for the user
  }
  const modeBanner = () => (!S.topic ? null : h('div', { class: 'callout warn', role: 'status', 'data-activity-mode': 'true' },
    h('b', {}, 'กำลังดูคำแนะนำตามกิจกรรม: ' + ((S.eventContext && S.eventContext.name) || wishName[S.topic])),
    h('div', { class: 'small' }, `คำนวณชั่วคราวจากเรื่อง "${wishName[S.topic]}" ของกิจกรรมนี้ ไม่ใช่จากความสนใจที่คุณเลือกไว้ในขั้น 02 (ความสนใจเดิมไม่ถูกแก้ไข)`),
    h('div', { class: 'row', style: 'margin-top:6px' }, h('button', { type: 'button', class: 'btn sm primary', onclick: backToInterests }, 'กลับไปความสนใจเดิม'),
      S.wishes.length ? null : h('span', { class: 'small' }, 'คุณยังไม่ได้เลือกความสนใจ ปุ่มนี้จะพาไปเลือกในขั้น 02'))));
  /* What the small labels mean (shown under the place cards and in step 04). The weekday note says honestly what the birth date is used for. */
  const legend = () => h('details', { class: 'small', 'data-legend': 'true' }, h('summary', {}, 'ป้ายต่าง ๆ หมายถึงอะไร'),
    h('div', { class: 'inner stack' },
      h('div', {}, h('span', { class: 'chip' }, 'ป้ายเทา'), ' เรื่องที่คุณเลือก (เช่น ความรัก การงาน) ที่สถานที่นี้เชื่อมถึง'),
      h('div', {}, h('span', { class: 'chip pink' }, 'ป้ายชมพู'), ' สิ่งศักดิ์สิทธิ์ที่เชื่อมกับสถานที่นี้ตามฐานข้อมูล'),
      h('div', {}, h('span', { class: 'chip gold' }, 'ป้ายทอง "เกิดวัน…"'), ' วันเกิดในสัปดาห์ที่ใช้เป็นสัญญาณรอง รอบนี้ระบบใช้เฉพาะวันเกิดในสัปดาห์ ยังไม่ใช้เดือนเกิด ราศี หรือปีนักษัตร'),
      h('div', {}, 'ลูกศร เรื่อง → สิ่งศักดิ์สิทธิ์ → สถานที่ คือเส้นทางในเครือข่ายที่ทำให้ระบบแนะนำสถานที่นั้น')));
  const summary = (R) => h('div', { class: 'row', style: 'margin-bottom:12px' }, activeWishes().map((w) => h('span', { class: 'chip' }, wishIcon(w).e + ' ' + wishName[w])),
    R.profile.weekday ? (R.birth_signal.status === 'APPLIED' ? h('span', { class: 'chip gold', title: 'วันเกิดใช้เป็นสัญญาณรอง' }, 'เกิด' + R.profile.weekday) : h('span', { class: 'chip', title: 'รอบนี้ไม่ได้ใช้สัญญาณวันเกิด' }, 'เกิด' + R.profile.weekday + ' (ไม่ได้ใช้)')) : null,
    R.profile.applied_exclusions.deity_ids.length || R.profile.applied_exclusions.place_ids.length ? h('span', { class: 'chip pink' }, `ตัดสิ่งศักดิ์สิทธิ์ ${R.profile.applied_exclusions.deity_ids.length} · สถานที่ ${R.profile.applied_exclusions.place_ids.length}`) : null);

  const birthNote = (R) => h('div', { class: 'callout small', 'data-birth-status': R.birth_signal.status }, '🎂 ', birthText(R.birth_signal));

  /* ------------------------------------------------ 04 focus + network preview */
  function step4() {
    return gate(4, 'สำรวจความเชื่อมโยงของเรื่องที่คุณสนใจ', 'เลือกการ์ดเพื่อดูคำแนะนำเบื้องต้นแต่ละเรื่อง', () => {
      const R = S.result;
      // The cards below are a PRESENTATION filter only: they set S.focus and redraw. They never touch wishes/topic, never invalidate and never call the engine.
      const mode = !!S.topic;
      if (mode || S.wishes.length === 1) S.focus = mode ? 'ALL' : S.wishes[0];
      else if (S.focus !== 'ALL' && !S.wishes.includes(S.focus)) S.focus = 'ALL';
      const focus = S.focus;
      const setFocus = (v) => { S.focus = v; draw(); };
      const list = focus === 'ALL' ? R.top5 : R.top5.filter((p) => p.matched_wish_ids.includes(focus));
      // "ดูทุกเรื่อง" with several interests: the best place of EACH interest (taken from the Top 5 already computed), so no chosen interest is left out.
      // One focused interest (or a single wish): the first 2 places of that interest. Presentation only, nothing is recomputed.
      const many = focus === 'ALL' && activeWishes().length > 1;
      const missing = [];
      const shown = [];
      if (many) {
        activeWishes().forEach((w) => {
          const p = R.top5.find((x) => x.matched_wish_ids.includes(w));
          if (!p) { missing.push(w); return; }
          const e = shown.find((x) => x.place === p);
          e ? e.wishes.push(w) : shown.push({ place: p, wishes: [w] });
        });
      } else list.slice(0, 2).forEach((p) => shown.push({ place: p, wishes: focus === 'ALL' ? activeWishes() : [focus] }));
      const cards = mode ? [] : S.wishes.map((w) => { const ic = wishIcon(w); return h('button', { type: 'button', class: 'wish-card sm', 'data-focus': w, 'aria-pressed': String(focus === w), onclick: () => setFocus(w) }, h('span', { class: 'ic', style: `background:${ic.bg}` }, ic.e), wishName[w]); });
      if (!mode && S.wishes.length > 1) cards.unshift(h('button', { type: 'button', class: 'wish-card sm', 'data-focus': 'ALL', 'aria-pressed': String(focus === 'ALL'), onclick: () => setFocus('ALL') }, h('span', { class: 'ic', style: 'background:#ede7f6' }, '🌐'), 'ดูทุกเรื่อง'));
      let preview;
      if (!R.top5.length) {
        preview = h('div', { class: 'callout warn' }, h('b', {}, 'ยังไม่พบสถานที่ที่ผ่านเงื่อนไข'), h('p', { class: 'small', style: 'margin:.3em 0 0' }, 'เรื่องที่เลือกกับสิ่งที่คุณไม่ต้องการทำให้ไม่เหลือเส้นทาง เรื่องที่ขอ → สิ่งศักดิ์สิทธิ์ → สถานที่ ที่มีในฐานข้อมูล ลองเอาข้อจำกัดบางข้อออก หรือเลือกเรื่องอื่นเพิ่ม'));
      } else if (!shown.length) {
        preview = h('div', { class: 'callout' }, focus === 'ALL' ? 'ใน Top 5 ที่คำนวณไว้ ยังไม่มีสถานที่ที่เชื่อมกับเรื่องที่เลือกโดยตรง (ไม่ได้แปลว่าเครือข่ายไม่มีเลย)'
          : `ใน Top 5 ที่คำนวณไว้ ยังไม่มีสถานที่ที่เชื่อมกับเรื่อง "${wishName[focus]}" โดยตรง (ไม่ได้แปลว่าเครือข่ายไม่มีเลย) ลองเลือก "ดูทุกเรื่อง" เพื่อดูภาพรวม`);
      } else {
        const names = (focus === 'ALL' ? activeWishes() : [focus]).map((w) => wishName[w]).join(' และ ');
        preview = h('div', { class: 'stack' },
          h('p', { style: 'margin:0' }, `จากความสนใจของคุณ MUMU พบสถานที่ที่เชื่อมโยงกับเรื่อง${names}ผ่านความสัมพันธ์ของสิ่งศักดิ์สิทธิ์และสถานที่ในฐานข้อมูล`),
          ...shown.map(({ place: p, wishes }) => h('div', { class: 'card flat', 'data-preview-place': p.place_id }, h('b', {}, p.name),
            (many ? wishes.flatMap((w) => p.paths.filter((z) => z.wish_id === w).slice(0, 1)) : (focus === 'ALL' ? p.paths : p.paths.filter((z) => z.wish_id === focus)).slice(0, 2))
              .map((z) => h('div', { class: 'path' }, z.wish_name, h('span', { class: 'ar' }, '→'), z.deity_name, h('span', { class: 'ar' }, '→'), p.name)))),
          missing.length ? h('p', { class: 'small faint', style: 'margin:0', 'data-missing-wishes': missing.join(',') }, `เรื่อง ${missing.map((w) => wishName[w]).join(', ')} ยังไม่มีสถานที่ใน Top 5 ที่คำนวณไว้ (ไม่ได้แปลว่าเครือข่ายไม่มีเลย)`) : null,
          focus !== 'ALL' && list.length === 1 ? h('p', { class: 'small faint', style: 'margin:0' }, 'นี่คือรายการที่เกี่ยวข้องกับเรื่องที่โฟกัส จากสถานที่ที่คำนวณไว้ ไม่ได้แปลว่าเครือข่ายพบได้เพียงแห่งเดียว') : null);
      }
      return h('div', { class: 'fade-in stack' }, title(4, 'สำรวจความเชื่อมโยงของเรื่องที่คุณสนใจ', 'เลือกการ์ดเพื่อดูคำแนะนำเบื้องต้นแต่ละเรื่อง โดยสถานที่ Top 5 ในขั้นตอนถัดไปจะพิจารณาจากทุกเรื่องที่คุณเลือกไว้'), modeBanner(), summary(R), birthNote(R),
        mode ? null : h('div', { class: 'card stack' }, h('h3', {}, 'ความสนใจของคุณ'),
          S.wishes.length > 1 ? h('p', { class: 'small muted', style: 'margin:0' }, 'เลือกการ์ดเพื่อดูคำแนะนำเบื้องต้นแต่ละเรื่อง โดยสถานที่ Top 5 ในขั้นตอนถัดไปจะพิจารณาจากทุกเรื่องที่คุณเลือกไว้') : h('p', { class: 'small muted', style: 'margin:0' }, 'คุณเลือกไว้เรื่องเดียว ระบบใช้เรื่องนี้เป็นโฟกัสให้อัตโนมัติ'),
          h('div', { class: 'wish-grid', style: 'grid-template-columns:repeat(auto-fill,minmax(180px,1fr))' }, cards)),
        h('div', { class: 'card stack' }, h('h3', {}, '✨ คำแนะนำเบื้องต้นสำหรับคุณ'), preview,
          h('div', { class: 'callout info small' }, 'การเลือกการ์ดเปลี่ยนแค่วิธีแสดงตัวอย่างนี้ ไม่เปลี่ยนคะแนนเครือข่าย อันดับ Top 5 หรือการจับคู่ทริป และไม่คำนวณใหม่')),
        legend(),
        discoverySection(R, { today: todayISO(), focus, onDetail: () => go(5), redraw: draw }),
        fixedCalendarSection({ wishes: activeWishes(), focus, redraw: draw }),
        h('div', { class: 'row small' }, h('button', { class: 'btn sm', onclick: () => go(2) }, 'เปลี่ยนความสนใจ'), h('button', { class: 'btn sm', onclick: () => go(3) }, 'แก้ข้อจำกัด')),
        foot({ fn: () => go(3) }, { label: 'ดูสถานที่ที่เหมาะกับคุณ', fn: () => go(5) }));
    });
  }

  /* Layer B on top of the Layer A order from the server: only events still to come, at most 2 network events, direct events apart. */
  function eventsBlock(R) {
    const E = R.events;
    if (!E) return null;
    const today = todayISO();
    const shown = displayLayer(E.eligible, today).displayable.slice(0, 2);
    if (!shown.length) return null;                       // nothing qualifies: hide the section, no sample data in the user pages
    // Real network events only (synthetic events live in Tab 2). Detailed view, collapsed so it does not crowd the Top 5.
    return h('details', { class: 'card stack ev-details' }, h('summary', {}, `🗓 กิจกรรมที่เกี่ยวข้อง (${shown.length}) · รายละเอียด`),
      h('div', { class: 'inner stack' }, shown.map((r) => eventCard(snapNetwork(r), { evidence: r.evidence_paths[0].text })),
        h('div', { class: 'small faint' }, 'จัดลำดับจากเครือข่าย เรื่อง → สิ่งศักดิ์สิทธิ์ → สถานที่ → กิจกรรม วันที่ใช้แค่คัดกิจกรรมที่ยังมาไม่ถึง ไม่เปลี่ยนคะแนน')));
  }

  /* ------------------------------------------------ 05 places */
  function step5() {
    return gate(5, 'สถานที่ที่เหมาะกับคุณ', 'คำแนะนำสูงสุด 5 แห่ง จากความสนใจของคุณ', () => {
      const R = S.result;
      const cardsOut = R.top5.map((p) => {
        const ic = wishIcon(p.matched_wish_ids[0]), on = S.picked.has(p.place_id);
        const deities = [...new Set(p.paths.map((z) => z.deity_name))];
        return h('article', { class: 'card place' },
          h('div', { class: 'tile', style: `background:${ic.bg}` }, ic.e, h('b', {}, p.rank)),
          h('div', { class: 'stack' },
            h('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-start;flex-wrap:nowrap' },
              h('div', { style: 'min-width:0' }, h('h3', {}, p.name), h('div', { class: 'small muted' }, p.district)),
              h('button', { type: 'button', class: 'heart', 'aria-pressed': String(on), 'aria-label': (on ? 'เลิกสนใจ ' : 'สนใจ ') + p.name, onclick: () => { on ? S.picked.delete(p.place_id) : S.picked.add(p.place_id); draw(); } }, on ? '♥' : '♡')),
            h('div', { class: 'row' }, p.matched_wishes.map((w, i) => h('span', { class: 'chip' }, wishIcon(p.matched_wish_ids[i]).e + ' ' + w)), deities.slice(0, 3).map((d) => h('span', { class: 'chip pink' }, d)), deities.length > 3 ? h('span', { class: 'chip' }, `+${deities.length - 3}`) : null),
            h('div', {}, p.paths.slice(0, 2).map((z) => h('div', { class: 'path' }, h('b', {}, z.wish_name), h('span', { class: 'ar' }, '→'), z.deity_name, h('span', { class: 'ar' }, '→'), p.name)),
            p.paths.length > 2 ? h('div', { class: 'small faint' }, `และอีก ${p.paths.length - 2} เส้นทาง — ดูในรายละเอียด`) : null),
            h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn sm', onclick: () => openPlace(p.place_id) }, 'ดูรายละเอียด'),
              h('button', { type: 'button', class: 'btn sm' + (on ? ' primary' : ''), onclick: () => { on ? S.picked.delete(p.place_id) : S.picked.add(p.place_id); draw(); } }, on ? '✓ สนใจสถานที่นี้' : 'สนใจสถานที่นี้'))));
      });
      return h('div', { class: 'fade-in stack' }, title(5, 'สถานที่ที่เหมาะกับคุณ', 'คำแนะนำสูงสุด 5 แห่ง จากความสนใจของคุณ'), modeBanner(), summary(R), birthNote(R),
        !R.top5.length ? h('div', { class: 'callout warn' }, h('b', {}, 'ไม่พบสถานที่ที่ผ่านเงื่อนไข'), h('p', { class: 'small', style: 'margin:.3em 0 0' }, 'ระบบไม่แนะนำสิ่งที่ขัดกับที่คุณไม่ต้องการ และไม่เติมรายการให้ครบ ลองแก้ข้อจำกัดหรือความสนใจ')) :
          R.limited_results ? h('div', { class: 'callout' }, `แสดง ${R.top5.length} แห่ง (น้อยกว่า 5) — ${userLimitedReason(R.limited_reason)} ระบบไม่เติมรายการให้ครบ`) : null,
        ...cardsOut, legend(), eventsBlock(R),
        h('div', { class: 'callout small' }, 'ผลลัพธ์มาจากความสัมพันธ์ในฐานข้อมูล ไม่ใช่การรับรองความศักดิ์สิทธิ์หรือผลของการขอพร การเลือก "สนใจ" ไม่เปลี่ยนอันดับ บางความสัมพันธ์ยังรอตรวจสอบ ดูสถานะรายเส้นทางได้ใน "ดูรายละเอียด"'),
        foot({ fn: () => go(4) }, { label: 'ดูทริปที่เหมาะกับฉัน', fn: () => go(6) }));
    });
  }

  /* ------------------------------------------------ 06 trip */
  const reasonText = (c) => c.startsWith('FEATURED_RITUAL_EXCLUSION:') ? 'มีพิธีเด่นของ ' + c.split(':')[1].split(',').map(nameOf).join(', ') + ' ที่คุณไม่ต้องการ' : (REASONS[c] || c);
  function scoreTable(T) {
    return h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['ทริป', 'สถานะ', 'ครอบคลุมเรื่องที่เลือก', 'ความเกี่ยวข้อง', 'คะแนน'].map((t, i) => h('th', { class: i > 1 ? 'n' : '' }, t)))),
      h('tbody', {}, T.all_scores.map((s) => h('tr', { class: s.eligible ? '' : 'out' }, h('td', {}, TRIP_TH[s.trip_id], h('div', { class: 'small faint' }, s.trip_name)),
        h('td', { class: 'small' }, s.eligible ? 'ผ่านเกณฑ์' : s.reason_codes.map(reasonText).join(' · ')), h('td', { class: 'n' }, pct(s.coverage_fraction, 0)), h('td', { class: 'n' }, f(s.graph_relevance)), h('td', { class: 'n' }, f(s.matching_score)))))));
  }
  /* Totals as stored with the fixed trip: travel, access, waiting and time at the stops are shown apart. */
  const tripTimes = (D) => h('div', { class: 'small', 'data-trip-times': 'true' },
    h('div', {}, `เดินทางด้วยรถไฟฟ้าประมาณ ${Math.round(D.rail_min)} นาที · เดินเข้าถึงสถานที่ประมาณ ${Math.round(D.walk_min)} นาที`),
    h('div', { class: 'faint' }, `ในเวลารวมประมาณ ${Math.round(D.duration_min)} นาที ยังมีเวลารอรถ ${Math.round(D.train_wait_min)} (สมมติ) รอสถานที่เปิด ${Math.round(D.opening_wait_min)} บรีฟกลุ่ม ${Math.round(D.group_briefing_min)} พัก ${Math.round(D.midday_break_min)} และเวลาที่จุดแวะ ${Math.round(D.dwell_min)} นาที ทุกค่าเป็นค่าประมาณ`));
  /* No matching trip: why, what to do next, and the technical reasons folded away. */
  function noTrip(R) {
    const T = R.trip, exc = R.profile.applied_exclusions;
    const plan = noTripPlan({ hasPlaces: R.top5.length > 0, hasExclusions: !!(exc.deity_ids.length || exc.place_ids.length),
      reasonCodes: T.all_scores.flatMap((s) => s.reason_codes), wishNames: activeWishes().map((w) => wishName[w]) });
    // choosing interests again ends the temporary activity mode, otherwise the activity's topic would still replace the new choice
    const to = (n) => () => { if (n === 2 && S.topic) { S.topic = null; S.eventContext = null; invalidate(); } go(n); };
    return h('div', { class: 'stack', 'data-no-trip': plan.cause },
      h('div', { class: 'callout warn' }, h('h3', {}, plan.title), h('p', { style: 'margin:.4em 0 0' }, plan.text)),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary', 'data-no-trip-primary': String(plan.primary.step), onclick: to(plan.primary.step) }, plan.primary.label + ' →'),
        plan.secondary ? h('button', { type: 'button', class: 'btn', 'data-no-trip-secondary': String(plan.secondary.step), onclick: to(plan.secondary.step) }, plan.secondary.label) : null),
      h('details', {}, h('summary', {}, 'ดูเหตุผลของแต่ละทริป'), h('div', { class: 'inner stack' },
        h('p', { class: 'small', style: 'margin:0' }, 'ทริปทั้ง 3 ของบริษัทไม่ผ่านเงื่อนไขอย่างน้อยหนึ่งข้อ ระบบจึงไม่เลือกทริปให้ และไม่สร้างทริปใหม่'),
        h('div', { class: 'small faint mono' }, 'NO_ELIGIBLE_SIGNATURE_TRIP'), scoreTable(T))));
  }
  function step6() {
    return gate(6, 'ทริปที่ใช่สำหรับคุณ', 'MUMU เลือกทริปที่เหมาะจาก 3 ทริปของบริษัท', () => {
      const R = S.result, T = R.trip;
      let body;
      if (!T.matched) {
        body = noTrip(R);
      } else {
        const D = T.detail, M = T.matched, covered = M.user_wishes_covered.map((w) => wishName[w]).join(', ');
        body = h('div', { class: 'stack' },
          h('div', { class: 'trip-hero' }, h('span', { class: 'tag' }, '✨ ทริปแนะนำสำหรับคุณ'), h('h3', {}, D.title), h('p', {}, `${TRIP_TH[D.trip_id]} · เหมาะกับ: ${covered || '—'}`),
            h('div', { class: 'stops' }, D.stops.map((s) => h('div', { class: 'stop' }, h('i', {}, s.order), h('div', {}, s.name)))),
            h('div', { class: 'row', style: 'margin-top:12px' }, h('span', { class: 'tag' }, '🚆 BTS/MRT + เดิน'), h('span', { class: 'tag' }, `⏱ ประมาณ ${Math.round(D.duration_min)} นาที · จบ ~${D.finish_clock}`), h('span', { class: 'tag' }, `คะแนนจับคู่ ${f(M.matching_score, 2)}`), h('span', { class: 'tag' }, 'Demo · ยังไม่เปิดจองจริง'), h('span', { class: 'tag' }, 'ราคา/วันเดินทาง: ยังไม่กำหนด'))),
          h('div', { class: 'card' }, h('h3', {}, 'จุดแวะตามลำดับ'), h('ol', { class: 'timeline', style: 'margin-top:10px' }, D.stops.map((s) => h('li', {},
            h('div', { class: 't' }, `${s.arrival}–${s.finish}`),
            h('div', {}, h('b', {}, s.name)), h('div', { class: 'small', 'data-leg': String(s.order) }, legLines(D.legs[s.order - 1], s.access_mode).map((t) => h('div', {}, t))), h('div', { class: 'small muted' }, 'พิธีเด่น: ' + s.featured_deity)))),
            tripTimes(D), osmCredit()),
          h('div', { class: 'callout small' }, 'เวลาเปิดของบางแห่งเป็นข้อมูลจำลองหรือรอตรวจ ควรตรวจกับสถานที่ก่อนเดินทาง'),
          h('div', { class: 'callout info small' }, 'นี่คือ "ทริปคงที่" ที่บริษัทออกแบบไว้ล่วงหน้า ระบบแค่เลือกจาก 3 ทริป ไม่ปรับหรือสร้างเส้นทางใหม่ตามผู้ใช้ และยังไม่ยืนยันที่นั่ง ราคา หรือวันเดินทาง'),
          h('details', {}, h('summary', {}, 'ดูเหตุผลและคะแนนเทียบทั้ง 3 ทริป'), h('div', { class: 'inner' }, scoreTable(T))),
          h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => go(7) }, 'ดูรายละเอียดทริปและบริการ →')));
      }
      return h('div', { class: 'fade-in stack' }, title(6, 'ทริปที่ใช่สำหรับคุณ', 'MUMU เลือกทริปที่เหมาะจาก 3 ทริปของบริษัท (เส้นทางคงที่)'), modeBanner(), summary(R), body, foot({ fn: () => go(5) }, null));
    });
  }

  /* ------------------------------------------------ 07 services + feedback */
  function step7() {
    return gate(7, 'อยากไปมูแบบไหนดี?', 'เลือกใช้บริการตามความสะดวก', () => {
      const R = S.result, ctx = S.eventContext, noMatch = !R.trip.matched;
      const svc = S.service === 'trip' && noMatch ? null : S.service;            // a trip chosen earlier cannot stay open when nothing matches now
      if (ctx && ctx.place_id && !S.picked.size && R.top5.some((p) => p.place_id === ctx.place_id)) S.picked.add(ctx.place_id);
      const panel = h('div', { class: 'card stack fade-in' });
      if (svc === 'self') {
        const ids = S.picked.size ? [...S.picked] : R.top5.map((p) => p.place_id);
        panel.append(h('h3', {}, 'ไปมูเอง'), h('p', { class: 'sub' }, S.picked.size ? 'สถานที่ที่คุณสนใจ' : 'คุณยังไม่ได้เลือกสถานที่ แสดงทั้งหมดที่ระบบเสนอ'),
          ...ids.map((id) => { const p = R.top5.find((x) => x.place_id === id); return h('div', { class: 'path' }, h('b', {}, p.name), h('div', { class: 'small muted' }, `${stationText(p.station_name, p.station_system, p.station_id, 'สถานีใกล้สุด')} · ${accessText(p.access_min)} · เปิด ${p.hours.open}–${p.hours.close}`), h('div', { class: 'row', style: 'margin-top:4px' }, h('button', { class: 'btn sm', onclick: () => openPlace(id) }, 'ข้อมูลสถานที่และวิธีมู'))); }),
          h('div', { class: 'callout small' }, 'ยังไม่มีการจองจริง เวลาเปิดบางแห่งเป็นข้อมูลจำลองหรือรอตรวจ ควรตรวจกับสถานที่ก่อนเดินทาง'),
          h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => openFeedback({ service: 'self' }) }, 'ให้ความคิดเห็นต่อ Demo')));
      } else if (svc === 'trip') {
        const T = R.trip;
        panel.append(h('h3', {}, 'ทริปบริษัท (Demo)'), T.matched ? h('div', { class: 'stack' }, h('p', { class: 'sub' }, `${TRIP_TH[T.matched.trip_id]} · ${T.detail.title}`),
          h('ol', { class: 'timeline' }, T.detail.stops.map((s) => h('li', {}, h('div', { class: 't' }, `${s.arrival}–${s.finish}`), h('div', {}, s.name), h('div', { class: 'small muted', 'data-leg': String(s.order) }, legLines(T.detail.legs[s.order - 1], s.access_mode).map((t) => h('div', {}, t)))))),
          tripTimes(T.detail), osmCredit(),
          h('div', { class: 'callout small', 'data-trip-tbd': 'true' }, h('b', {}, 'รายละเอียดการจอง (Demo)'),
            h('div', {}, 'ราคา: ยังไม่กำหนด · วันเดินทาง: ยังไม่กำหนด · การจองล่วงหน้า: ยังไม่เปิดจอง'),
            h('div', {}, 'ปุ่มด้านล่างเป็นการแสดงความสนใจเพื่อทดสอบระบบ ไม่ใช่การลงทะเบียนหรือการจอง ไม่รับชำระเงินจริง ไม่มีที่นั่งถูกสำรอง')),
          h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => openFeedback({ service: 'trip' }) }, 'แสดงความสนใจทริป (Demo)'), h('button', { class: 'btn', onclick: () => go(6) }, 'ดูเหตุผลที่แนะนำทริปนี้'))) : null);
      } else if (svc === 'proxy') {
        const box = h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'กำลังโหลดรายการ…'));
        panel.append(h('h3', {}, 'ฝากมู (Demo)'), box);
        API.offers(S.picked.size ? [...S.picked] : R.top5.map((p) => p.place_id), activeWishes()).then((O) => {
          clear(box).append(...(O.offers.length ? O.offers.slice(0, 6).map((o) => h('div', { class: 'path' }, h('b', {}, o.title), h('div', { class: 'small muted' }, `${o.place_name} · ${o.wish_name} · ${o.price_thb} บาท · ล่วงหน้า ${o.lead_time_days} วัน`),
            h('div', { class: 'row', style: 'margin-top:4px' }, h('button', { class: 'btn sm', onclick: () => openProxyDemo(o) }, 'ลองกรอกคำขอ (Demo)'), h('button', { class: 'btn sm primary', onclick: () => openFeedback({ service: 'proxy', offer_id: o.offer_id }) }, 'แสดงความสนใจบริการ (Demo)')))) : [h('div', { class: 'callout' }, 'ไม่มีบริการฝากมูสำหรับสถานที่ที่เลือก')]),
            h('div', { class: 'callout warn small' }, 'ข้อมูลจำลอง ไม่มีการยืนยันผู้ให้บริการหรือการอนุญาตจากสถานที่จริง ไม่สร้างรายการจองหรือคำสั่งซื้อ'));
        }).catch((e) => clear(box).append(h('div', { class: 'callout bad' }, 'โหลดไม่สำเร็จ: ' + e.message)));
      }
      return h('div', { class: 'fade-in stack' }, title(7, 'อยากไปมูแบบไหนดี?', 'เลือกใช้บริการตามความสะดวก'),
        modeBanner(),
        ctx && !S.topic ? h('div', { class: 'callout info' }, h('b', {}, 'มูต่อจากกิจกรรม: ' + ctx.name), ctx.place_name ? ` · ${ctx.place_name}` : '', h('div', { class: 'small' }, 'เลือกไปมูเอง ทริปบริษัท หรือฝากมู ด้านล่าง')) : null,
        h('div', { class: 'svc-grid', role: 'group', 'aria-label': 'รูปแบบบริการ' }, SERVICES.map(([id, e, bg, t, sub]) => { const off = id === 'trip' && noMatch; return h('button', { type: 'button', class: 'svc', 'data-svc': id, disabled: off, 'aria-pressed': String(svc === id), onclick: () => { S.service = svc === id ? null : id; draw(); } }, h('span', { class: 'ic', style: `background:${bg}` }, e), t, h('small', {}, off ? 'ยังไม่มีทริปที่ตรง' : sub)); })),
        svc ? panel : h('div', { class: 'callout info' }, 'เลือกรูปแบบด้านบนเพื่อดูรายละเอียด'),
        calendarCard(),
        h('div', { class: 'callout small' }, 'ทุกบริการในหน้านี้เป็น Demo ไม่มีการจอง ชำระเงิน หรือพิธีกรรมจริง'),
        h('div', { class: 'foot' }, h('button', { class: 'btn', onclick: () => go(6) }, '← ย้อนกลับ'), h('button', { class: 'btn', onclick: () => openFeedback({ service: svc || 'self' }) }, 'ให้ความคิดเห็น')));
    });
  }

  /* Steps 01-03 are the user's core profile; step 04 is "what to focus on this round". After feedback we go back to 04. */
  function startNewRound(toStep) {
    S.picked.clear(); S.service = null; S.focus = 'ALL';
    if (S.topic) { S.topic = null; invalidate(); }
    S.eventContext = null;
    dlg.close();
    go(toStep);
  }
  function resetAll() {
    Object.assign(S, { d: '', m: '', y: '', wishes: [], focus: 'ALL', topic: null, eventContext: null, maxStep: 1, step: 1 });
    S.groups.clear(); S.deities.clear(); S.places.clear();
    resetDismissed(); resetFixedDismissed();
    clearAllNotifyData();                 // also removes followed events and alerts kept in this browser
    invalidate();
    toast('ล้างข้อมูลของคุณแล้ว');
    draw();
    window.scrollTo({ top: 0 });
  }
  /* What the user is told after sending. Success is shown ONLY when the answer was really stored; every other outcome says what happened. */
  const SEND_STATUS = {
    saved: 'บันทึกความคิดเห็นแล้ว',
    not_configured: 'ไม่สามารถบันทึกได้ ระบบนี้ยังไม่ได้เชื่อมที่เก็บความคิดเห็น (โหมดสาธิต)',
    bad_webhook_host: 'ไม่สามารถบันทึกได้ การตั้งค่าที่เก็บความคิดเห็นของระบบไม่ถูกต้อง ผู้ดูแลระบบต้องแก้ไข',
    rejected: 'ไม่สามารถบันทึกได้ ที่เก็บความคิดเห็นปฏิเสธข้อมูลนี้ ผู้ดูแลระบบต้องตรวจสอบ',
    unreachable: 'ยังบันทึกไม่ได้ เชื่อมต่อที่เก็บความคิดเห็นไม่ได้ชั่วคราว ลองส่งใหม่อีกครั้งได้',
  };
  const statusText = (r) => (r && r.saved === true ? SEND_STATUS.saved : (r && SEND_STATUS[r.mode]) || 'ไม่สามารถบันทึกได้ ไม่ทราบสาเหตุ');
  const isSaved = (r) => !!r && r.saved === true && r.mode === 'saved';
  const canRetry = (r) => !!r && r.saved !== true && r.mode === 'unreachable';          // only a temporary connection problem is worth resending
  function thanks(r) {
    const ok = isSaved(r);
    clear(dlg).append(h('div', { class: 'dlg-b stack', 'data-send-status': ok ? 'saved' : (r && r.mode) || 'unknown', style: 'text-align:center;padding:26px 22px' },
      h('div', { style: 'font-size:46px' }, ok ? '💜' : '⚠️'), h('h3', {}, ok ? 'ขอบคุณสำหรับความคิดเห็น' : 'ยังไม่ได้บันทึกความคิดเห็น'),
      h('div', { class: ok ? 'callout ok' : 'callout warn', role: 'status' }, statusText(r)),
      h('p', { class: 'muted', style: 'margin:0' }, 'ข้อมูลโปรไฟล์ของคุณยังอยู่ ไปต่อได้เลย'),
      canRetry(r) ? h('button', { type: 'button', class: 'btn', 'data-retry': 'true', onclick: () => openFeedback(lastFeedback.pre, lastFeedback.draft) }, 'ลองส่งใหม่') : null,
      // step 04 lists all 10 wishes, so "another topic" is always step 04 (the profile in steps 01-03 stays)
      h('button', { type: 'button', class: 'btn primary', onclick: () => startNewRound(4) }, 'มูเรื่องอื่นต่อ'),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => { dlg.close(); resetAll(); } }, 'กลับหน้าแรก (ล้างข้อมูลของฉัน)')));
  }

  /* Demo-only sample request form for "ฝากมู". Values live only in these DOM nodes: nothing is sent (no API call), nothing is stored
     (no database, no Google Sheet, no localStorage), and everything is dropped when the dialog closes. There is no real provider behind it. */
  function openProxyDemo(offer) {
    const name = h('input', { type: 'text', maxlength: '40', autocomplete: 'off', 'aria-label': 'ชื่อผู้ฝาก (ชื่อสมมติ)', placeholder: 'ชื่อสมมติ เช่น "สมชาย ทดสอบ"' });
    const wish = h('textarea', { maxlength: '200', autocomplete: 'off', 'aria-label': 'คำขอพร (ตัวอย่าง)', placeholder: 'คำขอพรตัวอย่าง เช่น "ขอให้สอบผ่าน" (อย่าใส่เรื่องส่วนตัว)' });
    const out = h('div', { role: 'status' });
    const show = () => {
      const n = name.value.trim(), w = wish.value.trim();
      clear(out).append(h('div', { class: 'card flat stack', 'data-proxy-preview': 'true' }, h('b', {}, 'ตัวอย่างสรุปคำขอ (Demo)'),
        h('div', { class: 'small' }, 'บริการ: ' + offer.title + ' · ' + offer.place_name), h('div', { class: 'small' }, 'ชื่อผู้ฝาก: ' + (n || '—') + ' (ชื่อสมมติ)'), h('div', { class: 'small' }, 'คำขอพร: ' + (w || '—')),
        h('div', { class: 'small muted' }, 'ยังไม่มีผู้ให้บริการรับคำขอนี้จริง ข้อมูลไม่ถูกส่งหรือบันทึก และจะหายเมื่อปิดหน้าต่าง')));
    };
    const close = () => { name.value = ''; wish.value = ''; clear(out); dlg.close(); };
    clear(dlg).append(h('div', { class: 'dlg-h' }, h('h3', {}, 'ตัวอย่างขั้นตอนฝากมู (Demo)'), h('button', { class: 'btn sm', 'aria-label': 'ปิด', onclick: close }, '✕')),
      h('div', { class: 'dlg-b stack' }, h('div', { class: 'callout warn small' }, 'นี่คือแบบฟอร์มสาธิตเพื่อดูขั้นตอนเท่านั้น ไม่มีผู้ให้บริการรับคำขอจริง ไม่มีการจองหรือชำระเงิน ใช้ชื่อสมมติและอย่าใส่ข้อมูลส่วนตัว'),
        h('div', { class: 'small' }, offer.title + ' · ' + offer.place_name),
        h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'ชื่อผู้ฝาก (ชื่อสมมติ)'), name),
        h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'คำขอพร (ตัวอย่าง)'), wish), out,
        h('div', { class: 'row', style: 'justify-content:flex-end' }, h('button', { class: 'btn', onclick: close }, 'ปิดและล้างค่า'), h('button', { class: 'btn primary', onclick: show }, 'ดูตัวอย่างสรุป'))));
    dlg.addEventListener('close', () => { name.value = ''; wish.value = ''; }, { once: true });
    dlg.showModal();
  }

  const RATING_QUESTION = { self: 'สถานที่ที่แนะนำ', trip: 'ทริปที่แนะนำ', proxy: 'บริการฝากมูที่แนะนำ' };
  const INTEREST_TARGET = { self: 'สถานที่', trip: 'ทริป', proxy: 'บริการฝากมู' };
  const INTEREST_CHOICES = [['YES', 'สนใจ'], ['MAYBE', 'ยังไม่แน่ใจ'], ['NO', 'ไม่สนใจ']];        // sent as would_use_again = pre-use interest (INTEREST_Q=V1_PREUSE_INTEREST)
  let lastFeedback = null;                                                                       // kept only in memory so a temporary connection failure can be retried
  function openFeedback(pre = {}, draft = {}) {
    const R = S.result;
    let service = draft.service || pre.service || 'self', rating = draft.rating || 0, interest = draft.interest || '';
    const msg = h('div', { role: 'status' });
    const stars = h('div', { class: 'stars', role: 'radiogroup', 'aria-label': 'ให้คะแนน 1 ถึง 5 ดาว' });
    const drawStars = () => { clear(stars); for (let i = 1; i <= 5; i++) stars.append(h('button', { type: 'button', role: 'radio', 'aria-checked': String(rating === i), 'aria-label': i + ' ดาว', class: i <= rating ? 'on' : '', onclick: () => { rating = i; drawStars(); } }, '★')); };
    drawStars();
    const svcSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'ประเภทบริการที่สนใจ' });
    // Rating question V2 (from 2026-11-23): "how well does this recommendation match your interest?" (users have not travelled yet, so not "satisfied / disappointed")
    const question = h('div', { class: 'lbl', 'data-rating-question': 'V2_RELEVANCE' });
    const drawQuestion = () => { question.textContent = `${RATING_QUESTION[service]}นี้ตรงกับความสนใจของคุณมากน้อยแค่ไหน (1 = ไม่ตรงเลย, 5 = ตรงมาก)`; };
    // Interest question: "are you interested in what was recommended?" asked before any real use (not repeat usage)
    const interestQ = h('div', { class: 'lbl', 'data-interest-question': 'V1_PREUSE_INTEREST' });
    const interestSeg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'ความสนใจต่อสิ่งที่แนะนำ' });
    const drawInterest = () => {
      interestQ.textContent = `คุณสนใจ${INTEREST_TARGET[service]}ที่แนะนำนี้หรือไม่`;
      clear(interestSeg); INTEREST_CHOICES.forEach(([v, t]) => interestSeg.append(h('button', { type: 'button', role: 'radio', 'data-interest': v, 'aria-checked': String(interest === v), 'aria-pressed': String(interest === v), onclick: () => { interest = v; drawInterest(); } }, t)));
    };
    const drawSeg = () => { clear(svcSeg); SERVICES.forEach(([id, , , t]) => svcSeg.append(h('button', { type: 'button', 'aria-pressed': String(service === id), onclick: () => { service = id; drawSeg(); drawQuestion(); drawInterest(); } }, t))); };
    drawSeg(); drawQuestion(); drawInterest();
    const ta = h('textarea', { maxlength: '300', placeholder: 'แชร์ความรู้สึกหรือสิ่งที่คุณชอบ / อยากให้ปรับ (ไม่บังคับ) — อย่าใส่ข้อมูลส่วนตัว' });
    ta.value = draft.comment || '';
    const cnt = h('span', { class: 'small faint' }, '0/300');
    ta.addEventListener('input', () => { cnt.textContent = `${ta.value.length}/300`; });
    const consent = h('input', { type: 'checkbox', id: 'fb-consent' });
    const send = h('button', { type: 'button', class: 'btn primary', onclick: async () => {
      if (!interest) { msg.replaceChildren(h('div', { class: 'callout bad', role: 'alert' }, 'กรุณาเลือกว่าสนใจหรือไม่')); return; }
      if (!rating) { msg.replaceChildren(h('div', { class: 'callout bad', role: 'alert' }, 'กรุณาให้คะแนน 1–5 ดาว')); return; }
      if (!consent.checked) { msg.replaceChildren(h('div', { class: 'callout bad', role: 'alert' }, 'กรุณาติ๊กยินยอมให้เก็บความคิดเห็นก่อนส่ง')); return; }
      send.disabled = true;
      lastFeedback = { pre, draft: { service, rating, interest, comment: ta.value } };
      try {
        const r = await API.feedback({ kind: { self: 'places', trip: 'trip', proxy: 'proxy' }[service], rating, rating_question: 'V2_RELEVANCE', would_use_again: interest, interest_question: 'V1_PREUSE_INTEREST',
          comment: ta.value, consent: true, wish_ids: activeWishes(),
          place_ids: R ? R.top5.map((p) => p.place_id) : [], trip_id: (R && R.trip.matched ? R.trip.matched.trip_id : ''), offer_id: pre.offer_id || '' });
        thanks(r);
      } catch (e) { msg.replaceChildren(h('div', { class: 'callout bad', role: 'alert', 'data-send-status': 'request_failed' }, 'ส่งไม่สำเร็จ ยังไม่ได้บันทึกความคิดเห็น: ' + e.message)); send.disabled = false; }
    } }, '✈ ส่งความคิดเห็น');
    clear(dlg).append(h('div', { class: 'dlg-h' }, h('h3', {}, 'แสดงความสนใจและให้คะแนนคำแนะนำ (Demo)'), h('button', { class: 'btn sm', 'aria-label': 'ปิด', onclick: () => dlg.close() }, '✕')),
      h('div', { class: 'dlg-b stack' }, h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'ประเภทบริการที่สนใจ'), svcSeg), interestQ, interestSeg, question, stars, h('div', {}, ta, h('div', { style: 'text-align:right' }, cnt)),
        h('label', { class: 'row small', style: 'align-items:flex-start;flex-wrap:nowrap' }, consent, h('span', {}, 'ฉันยินยอมให้เก็บคะแนนและข้อความนี้ พร้อมเรื่องที่เลือกและสถานที่ที่ระบบเสนอ เพื่อประเมินความน่าใช้ของ Demo (ไม่เก็บวันเกิด และไม่ใช้ปรับโมเดลโดยอัตโนมัติ)')),
        h('div', { class: 'callout small' }, 'ปุ่ม "แสดงความสนใจ" คือการบอกว่าสนใจสิ่งที่แนะนำและให้ความคิดเห็นต่อ Demo ไม่ใช่การลงทะเบียน จอง หรือสั่งซื้อ ไม่ใช่การประเมินบริการจริง ไม่มีการจอง การชำระเงิน หรือพิธีกรรมเกิดขึ้น'), msg,
        h('div', { class: 'row', style: 'justify-content:flex-end' }, h('button', { class: 'btn', onclick: () => dlg.close() }, 'ยกเลิก'), send)));
    dlg.showModal();
  }

  /* ------------------------------------------------ place details modal */
  const ritualBlock = (ttl, rows) => !rows.length ? null : h('div', {}, h('h4', {}, ttl), rows.map((r) => h('div', { class: 'ritual' }, h('b', {}, r.category_th + ': '), userNote(r.detail),
    h('div', { class: 'src' }, 'แหล่ง: ' + userSourceName(r.source_name) + ' · ' + userVerification(r.verification) + ' · ', r.quality_status === 'SOURCE_MISSING' ? 'ยังไม่มีแหล่งยืนยัน' : 'ข้อมูลอ้างอิง ไม่ใช่การรับรองทางการ',
      r.source_urls.filter((u) => /^https?:\/\//.test(u)).map((u, i) => [' · ', h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, 'แหล่ง ' + (i + 1))])))));
  async function openPlace(id) {
    clear(dlg).append(h('div', { class: 'dlg-b' }, h('div', { class: 'spinner' })));
    dlg.showModal();
    try {
      const P = await API.place(id);
      clear(dlg).append(h('div', { class: 'dlg-h' }, h('div', {}, h('h3', {}, P.name), h('div', { class: 'small muted' }, P.district + ' · ' + P.address)), h('button', { class: 'btn sm', onclick: () => dlg.close() }, 'ปิด')),
        h('div', { class: 'dlg-b stack' },
          h('div', { class: 'row' }, h('span', { class: 'chip' }, `เปิด ${P.hours.open}–${P.hours.close}`), statusChip(P.hours.status, 'เวลาเปิด'), h('span', { class: 'chip st-unv' }, P.station.id ? `พิกัด: ${stationText(P.station.name_th, P.station.system, P.station.id)} ไม่ใช่ตำแหน่งสถานที่จริง` : 'ยังไม่มีข้อมูลสถานีรถไฟฟ้า'), h('span', { class: 'chip' }, accessText(P.station.access_min_candidate))),
          P.caution ? h('div', { class: 'callout warn small', 'data-caution': 'true' }, userCaution(P.caution)) : null,
          statusLegend(),
          h('div', {}, h('h4', {}, 'สิ่งศักดิ์สิทธิ์และเรื่องมูที่เชื่อมโยง'), h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['สิ่งศักดิ์สิทธิ์', 'ความเชื่อ', 'เรื่องที่ขอ', 'สถานะ'].map((t) => h('th', {}, t)))),
            h('tbody', {}, P.sacred_entities.map((e) => h('tr', {}, h('td', {}, e.deity_name), h('td', {}, e.tradition), h('td', {}, e.wish_names.join(', ')), h('td', {}, statusChip(e.place_link_status, 'เทพ–สถานที่')))))))),
          ritualBlock('วิธีมู/ของไหว้ของสถานที่นี้', P.rituals.place), ...Object.entries(P.rituals.deity).map(([d, rows]) => ritualBlock('ของ' + nameOf(d), rows)),
          !P.rituals.place.length && !Object.keys(P.rituals.deity).length ? h('div', { class: 'callout' }, 'ยังไม่มีข้อมูลวิธีมูที่มีแหล่งอ้างอิงสำหรับสถานที่นี้') : null,
          h('div', { class: 'callout small' }, P.disclaimer)));
    } catch (e) { clear(dlg).append(h('div', { class: 'dlg-b' }, h('div', { class: 'callout bad' }, 'โหลดไม่สำเร็จ: ' + e.message), h('button', { class: 'btn', onclick: () => dlg.close() }, 'ปิด'))); }
  }

  draw();
}
