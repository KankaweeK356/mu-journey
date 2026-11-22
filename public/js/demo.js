// Tab 1 — MUMU user demo: 7 steps. Every number and every place comes from the engine (via /api/mumu/*).
import { h, clear, f, pct, statusChip, TRIP_TH, MONTHS_TH, bar, toast } from './util.js';
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
      const w = (f.wish_ids || []).find((x) => S.wishes.includes(x)) || (f.wish_ids || [])[0];
      if (!S.wishes.length && w) S.wishes = [w];
      S.topic = w && !S.wishes.includes(w) ? w : null;
      S.focus = 'ALL'; S.maxStep = 7; invalidate(); S.eventContext = { event_id: f.parent_id, name: f.name, place_id: f.place_id || null, place_name: f.place_name || null };
      go(7);
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
    clear(host).append(progress(), hasData ? h('div', { class: 'row', style: 'justify-content:flex-end;margin:-8px 0 8px' }, h('button', { type: 'button', class: 'btn sm ghost', title: 'ลบวันเกิดและตัวเลือกทั้งหมดออกจากหน้านี้', onclick: resetAll }, '🗑 ล้างข้อมูลของฉัน')) : null, ({ 1: step1, 2: step2, 3: step3, 4: step4, 5: step5, 6: step6, 7: step7 })[S.step]());
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
  const summary = (R) => h('div', { class: 'row', style: 'margin-bottom:12px' }, activeWishes().map((w) => h('span', { class: 'chip' }, wishIcon(w).e + ' ' + wishName[w])),
    R.profile.weekday ? h('span', { class: 'chip gold', title: 'วันเกิดใช้เป็นสัญญาณรอง' }, 'เกิด' + R.profile.weekday) : null,
    R.profile.applied_exclusions.deity_ids.length || R.profile.applied_exclusions.place_ids.length ? h('span', { class: 'chip pink' }, `ตัดสิ่งศักดิ์สิทธิ์ ${R.profile.applied_exclusions.deity_ids.length} · สถานที่ ${R.profile.applied_exclusions.place_ids.length}`) : null);

  /* ------------------------------------------------ 04 focus + network preview */
  function step4() {
    return gate(4, 'เรื่องมูที่แนะนำสำหรับคุณ', 'จากข้อมูลที่คุณเลือก MUMU พบความเกี่ยวข้องเหล่านี้', () => {
      const R = S.result;
      if (S.wishes.length === 1 && !S.topic) S.focus = S.wishes[0];
      const focus = S.focus;
      // One topic at a time. A chosen wish only changes what is shown; a wish outside the chosen ones recomputes with that single wish.
      const pick = (v) => {
        const had = S.topic;
        if (v === 'ALL' || S.wishes.includes(v)) { S.topic = null; S.focus = v; if (had) invalidate(); } else { S.topic = v; S.focus = 'ALL'; invalidate(); }
        S.eventContext = null; ensureResult(); draw();
      };
      const current = S.topic || focus;
      const topicSelect = h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'เลือกเรื่องที่ต้องการมู'),
        h('select', { 'aria-label': 'อยากมูเรื่องอะไร', onchange: (e) => pick(e.target.value) },
          current === 'ALL' ? h('option', { value: 'ALL', selected: true, disabled: true }, '— เลือกเรื่อง —') : null,
          S.wishes.length ? h('optgroup', { label: 'เรื่องที่คุณเลือกไว้' }, S.wishes.map((w) => h('option', { value: w, selected: current === w }, wishName[w]))) : null,
          h('optgroup', { label: 'เรื่องอื่น ๆ (คำนวณใหม่เฉพาะเรื่องนั้น)' }, cat.wishes.filter((w) => !S.wishes.includes(w.id)).map((w) => h('option', { value: w.id, selected: current === w.id }, w.label)))));
      const list = focus === 'ALL' ? R.top5 : R.top5.filter((p) => p.matched_wish_ids.includes(focus));
      const shown = list.slice(0, 2);
      const cards = S.wishes.map((w) => { const ic = wishIcon(w); return h('button', { type: 'button', class: 'wish-card sm', 'aria-pressed': String(focus === w), onclick: () => pick(focus === w && !S.topic ? 'ALL' : w) }, h('span', { class: 'ic', style: `background:${ic.bg}` }, ic.e), wishName[w]); });
      let preview;
      if (!R.top5.length) {
        preview = h('div', { class: 'callout warn' }, h('b', {}, 'ยังไม่พบสถานที่ที่ผ่านเงื่อนไข'), h('p', { class: 'small', style: 'margin:.3em 0 0' }, 'เรื่องที่เลือกกับสิ่งที่คุณไม่ต้องการทำให้ไม่เหลือเส้นทาง เรื่องที่ขอ → สิ่งศักดิ์สิทธิ์ → สถานที่ ที่มีในฐานข้อมูล ลองเอาข้อจำกัดบางข้อออก หรือเลือกเรื่องอื่นเพิ่ม'));
      } else if (!shown.length) {
        preview = h('div', { class: 'callout' }, `ใน Top 5 ที่คำนวณไว้ ยังไม่มีสถานที่ที่เชื่อมกับเรื่อง "${wishName[focus]}" โดยตรง (ไม่ได้แปลว่าเครือข่ายไม่มีเลย) ลองเลือก "ดูทุกเรื่อง" เพื่อดูภาพรวม`);
      } else {
        const names = (focus === 'ALL' ? activeWishes() : [focus]).map((w) => wishName[w]).join(' และ ');
        preview = h('div', { class: 'stack' },
          h('p', { style: 'margin:0' }, `จากความสนใจของคุณ MUMU พบสถานที่ที่เชื่อมโยงกับเรื่อง${names}ผ่านความสัมพันธ์ของสิ่งศักดิ์สิทธิ์และสถานที่ในฐานข้อมูล`),
          ...shown.map((p) => h('div', { class: 'card flat' }, h('b', {}, p.name), (focus === 'ALL' ? p.paths : p.paths.filter((z) => z.wish_id === focus)).slice(0, 2).map((z) => h('div', { class: 'path' }, z.wish_name, h('span', { class: 'ar' }, '→'), z.deity_name, h('span', { class: 'ar' }, '→'), p.name)))),
          focus !== 'ALL' && list.length === 1 ? h('p', { class: 'small faint', style: 'margin:0' }, 'นี่คือรายการที่เกี่ยวข้องกับเรื่องที่โฟกัส จากสถานที่ที่คำนวณไว้ ไม่ได้แปลว่าเครือข่ายพบได้เพียงแห่งเดียว') : null);
      }
      return h('div', { class: 'fade-in stack' }, title(4, 'เรื่องมูที่แนะนำสำหรับคุณ', 'จากข้อมูลที่คุณเลือก MUMU พบความเกี่ยวข้องเหล่านี้'), summary(R),
        h('div', { class: 'card stack' }, h('h3', {}, 'ความสนใจของคุณ'),
          S.wishes.length > 1 ? h('p', { class: 'small muted', style: 'margin:0' }, 'เลือกได้ครั้งละ 1 เรื่อง แตะการ์ดหรือเลือกจากรายการ ยังไม่เลือกจะแสดงภาพรวมจากเรื่องที่คุณเลือกไว้') : h('p', { class: 'small muted', style: 'margin:0' }, 'คุณเลือกไว้เรื่องเดียว ระบบใช้เรื่องนี้เป็นโฟกัสให้อัตโนมัติ'),
          topicSelect, S.topic ? h('div', { class: 'callout info small' }, `กำลังดูเฉพาะเรื่อง "${wishName[S.topic]}" (คำนวณใหม่เฉพาะเรื่องนี้) การ์ดความสนใจเดิมของคุณยังอยู่ แตะการ์ดเพื่อกลับ`) : null,
          h('div', { class: 'wish-grid', style: 'grid-template-columns:repeat(auto-fill,minmax(180px,1fr))' }, cards)),
        h('div', { class: 'card stack' }, h('h3', {}, '✨ คำแนะนำเบื้องต้นสำหรับคุณ'), preview,
          h('div', { class: 'callout info small' }, 'การเลือกโฟกัสเปลี่ยนแค่วิธีแสดงตัวอย่างนี้ ไม่เปลี่ยนคะแนนเครือข่าย อันดับ Top 5 หรือการจับคู่ทริป')),
        discoverySection(R, { today: todayISO(), focus, onDetail: () => go(5), redraw: draw }),
        fixedCalendarSection({ wishes: activeWishes(), focus, redraw: draw }),
        h('div', { class: 'row small' }, h('button', { class: 'btn sm', onclick: () => go(2) }, 'แก้ความสนใจ'), h('button', { class: 'btn sm', onclick: () => go(3) }, 'แก้ข้อจำกัด')),
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
            h('div', {}, p.paths.slice(0, 2).map((z) => h('div', { class: 'path' }, h('b', {}, z.wish_name), h('span', { class: 'ar' }, '→'), z.deity_name, h('span', { class: 'ar' }, '→'), p.name,
              h('div', { class: 'row small', style: 'margin-top:3px' }, statusChip(z.wish_link_status, 'เรื่อง–เทพ'), statusChip(z.place_link_status, 'เทพ–สถานที่')))),
            p.paths.length > 2 ? h('div', { class: 'small faint' }, `และอีก ${p.paths.length - 2} เส้นทาง — ดูในรายละเอียด`) : null),
            h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn sm', onclick: () => openPlace(p.place_id) }, 'ดูรายละเอียด'),
              h('button', { type: 'button', class: 'btn sm' + (on ? ' primary' : ''), onclick: () => { on ? S.picked.delete(p.place_id) : S.picked.add(p.place_id); draw(); } }, on ? '✓ สนใจสถานที่นี้' : 'สนใจสถานที่นี้'))));
      });
      return h('div', { class: 'fade-in stack' }, title(5, 'สถานที่ที่เหมาะกับคุณ', 'คำแนะนำสูงสุด 5 แห่ง จากความสนใจของคุณ'), summary(R),
        !R.top5.length ? h('div', { class: 'callout warn' }, h('b', {}, 'ไม่พบสถานที่ที่ผ่านเงื่อนไข'), h('p', { class: 'small', style: 'margin:.3em 0 0' }, 'ระบบไม่แนะนำสิ่งที่ขัดกับที่คุณไม่ต้องการ และไม่เติมรายการให้ครบ ลองแก้ข้อจำกัดหรือความสนใจ')) :
          R.limited_results ? h('div', { class: 'callout' }, `แสดง ${R.top5.length} แห่ง (น้อยกว่า 5) — ${R.limited_reason || 'ไม่มีเส้นทางที่มีแหล่งอ้างอิงเพิ่ม'} ระบบไม่เติมรายการให้ครบ`) : null,
        ...cardsOut, eventsBlock(R),
        h('div', { class: 'callout small' }, 'ผลลัพธ์มาจากความสัมพันธ์ในฐานข้อมูล ไม่ใช่การรับรองความศักดิ์สิทธิ์หรือผลของการขอพร การเลือก "สนใจ" ไม่เปลี่ยนอันดับ'),
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
  function step6() {
    return gate(6, 'ทริปที่ใช่สำหรับคุณ', 'MUMU เลือกทริปที่เหมาะจาก 3 ทริปของบริษัท', () => {
      const R = S.result, T = R.trip;
      let body;
      if (!T.matched) {
        body = h('div', { class: 'stack' }, h('div', { class: 'callout warn' }, h('b', {}, 'ไม่มีทริปที่ตรงกับเงื่อนไขที่เลือก'), h('div', { class: 'mono', style: 'margin:4px 0' }, 'NO_ELIGIBLE_SIGNATURE_TRIP'),
          h('p', { class: 'small', style: 'margin:0' }, 'ทริปทั้ง 3 ของบริษัทไม่ผ่านเงื่อนไขอย่างน้อยหนึ่งข้อ ระบบจึงไม่เลือกทริปที่ขัดกับที่คุณไม่ต้องการ และไม่สร้างทริปใหม่ให้ แต่คุณยังเลือกสถานที่เพื่อไปมูเองได้')),
        h('div', { class: 'card' }, h('h3', {}, 'เหตุผลของแต่ละทริป'), scoreTable(T)),
        h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => go(5) }, '← กลับไปดูสถานที่'), h('button', { class: 'btn primary', onclick: () => go(7) }, 'ไปมูเอง / บริการอื่น →')));
      } else {
        const D = T.detail, M = T.matched, covered = M.user_wishes_covered.map((w) => wishName[w]).join(', ');
        body = h('div', { class: 'stack' },
          h('div', { class: 'trip-hero' }, h('span', { class: 'tag' }, '✨ ทริปแนะนำสำหรับคุณ'), h('h3', {}, D.title), h('p', {}, `${TRIP_TH[D.trip_id]} · เหมาะกับ: ${covered || '—'}`),
            h('div', { class: 'stops' }, D.stops.map((s) => h('div', { class: 'stop' }, h('i', {}, s.order), h('div', {}, s.name)))),
            h('div', { class: 'row', style: 'margin-top:12px' }, h('span', { class: 'tag' }, '🚆 BTS/MRT + เดิน'), h('span', { class: 'tag' }, `⏱ ประมาณ ${Math.round(D.duration_min)} นาที · จบ ~${D.finish_clock}`), h('span', { class: 'tag' }, `คะแนนจับคู่ ${f(M.matching_score, 2)}`), h('span', { class: 'tag' }, 'Demo · ยังไม่เปิดจองจริง'))),
          h('div', { class: 'card' }, h('h3', {}, 'จุดแวะตามลำดับ'), h('ol', { class: 'timeline', style: 'margin-top:10px' }, D.stops.map((s) => h('li', {},
            h('div', { class: 't' }, `${s.arrival}–${s.finish} · ${s.station_name} (${s.station_id}) · ${s.access_mode === 'skywalk' ? 'Skywalk' : 'เดิน'}`),
            h('div', {}, h('b', {}, s.name)), h('div', { class: 'small muted' }, 'พิธีเด่น: ' + s.featured_deity + ' · ', statusChip(s.hours_origin === 'SYNTHETIC_DEMO_HOURS' ? 'SYNTHETIC' : 'CANDIDATE', 'เวลาเปิด')))))),
          h('div', { class: 'callout info small' }, 'นี่คือ "ทริปคงที่" ที่บริษัทออกแบบไว้ล่วงหน้า ระบบแค่เลือกจาก 3 ทริป ไม่ปรับหรือสร้างเส้นทางใหม่ตามผู้ใช้ และยังไม่ยืนยันที่นั่ง ราคา หรือวันเดินทาง'),
          h('details', {}, h('summary', {}, 'ดูเหตุผลและคะแนนเทียบทั้ง 3 ทริป'), h('div', { class: 'inner' }, scoreTable(T))),
          h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => go(7) }, 'ดูรายละเอียดทริปและบริการ →')));
      }
      return h('div', { class: 'fade-in stack' }, title(6, 'ทริปที่ใช่สำหรับคุณ', 'MUMU เลือกทริปที่เหมาะจาก 3 ทริปของบริษัท (เส้นทางคงที่)'), summary(R), body, foot({ fn: () => go(5) }, null));
    });
  }

  /* ------------------------------------------------ 07 services + feedback */
  function step7() {
    return gate(7, 'อยากไปมูแบบไหนดี?', 'เลือกใช้บริการตามความสะดวก', () => {
      const R = S.result, svc = S.service, ctx = S.eventContext;
      if (ctx && ctx.place_id && !S.picked.size && R.top5.some((p) => p.place_id === ctx.place_id)) S.picked.add(ctx.place_id);
      const panel = h('div', { class: 'card stack fade-in' });
      if (svc === 'self') {
        const ids = S.picked.size ? [...S.picked] : R.top5.map((p) => p.place_id);
        panel.append(h('h3', {}, 'ไปมูเอง'), h('p', { class: 'sub' }, S.picked.size ? 'สถานที่ที่คุณสนใจ' : 'คุณยังไม่ได้เลือกสถานที่ แสดงทั้งหมดที่ระบบเสนอ'),
          ...ids.map((id) => { const p = R.top5.find((x) => x.place_id === id); return h('div', { class: 'path' }, h('b', {}, p.name), h('div', { class: 'small muted' }, `สถานีใกล้สุด ${p.station_id} · เข้าถึงประมาณ ${p.access_min} นาที (ประมาณการ) · เปิด ${p.hours.open}–${p.hours.close}`), h('div', { class: 'row', style: 'margin-top:4px' }, statusChip(p.hours.status, 'เวลาเปิด'), h('button', { class: 'btn sm', onclick: () => openPlace(id) }, 'ข้อมูลสถานที่และวิธีมู'))); }),
          h('div', { class: 'callout small' }, 'ยังไม่มีการจองจริง เวลาเปิดบางแห่งเป็นข้อมูลจำลองหรือรอตรวจ ควรตรวจกับสถานที่ก่อนเดินทาง'),
          h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => openFeedback({ service: 'self' }) }, 'ให้ความคิดเห็นต่อ Demo')));
      } else if (svc === 'trip') {
        const T = R.trip;
        panel.append(h('h3', {}, 'ทริปบริษัท (Demo)'), T.matched ? h('div', { class: 'stack' }, h('p', { class: 'sub' }, `${TRIP_TH[T.matched.trip_id]} · ${T.detail.title}`),
          h('ol', { class: 'timeline' }, T.detail.stops.map((s) => h('li', {}, h('div', { class: 't' }, `${s.arrival}–${s.finish} · ${s.station_name}`), h('div', {}, s.name)))),
          h('div', { class: 'callout small' }, 'ไม่รับจองและไม่รับชำระเงินจริง ราคา ที่นั่ง และวันเดินทางยังไม่กำหนด'),
          h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => openFeedback({ service: 'trip' }) }, 'ทดลองสนใจทริป'), h('button', { class: 'btn', onclick: () => go(6) }, 'ดูเหตุผลที่แนะนำทริปนี้'))) : h('div', { class: 'callout warn' }, 'ไม่มีทริปที่ผ่านเงื่อนไขสำหรับโปรไฟล์นี้ ลองเลือก "ไปมูเอง"'));
      } else if (svc === 'proxy') {
        const box = h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'กำลังโหลดรายการ…'));
        panel.append(h('h3', {}, 'ฝากมู (Demo)'), box);
        API.offers(S.picked.size ? [...S.picked] : R.top5.map((p) => p.place_id), S.wishes).then((O) => {
          clear(box).append(...(O.offers.length ? O.offers.slice(0, 6).map((o) => h('div', { class: 'path' }, h('b', {}, o.title), h('div', { class: 'small muted' }, `${o.place_name} · ${o.wish_name} · ${o.price_thb} บาท · ล่วงหน้า ${o.lead_time_days} วัน`),
            h('div', { class: 'row', style: 'margin-top:4px' }, statusChip('SYNTHETIC', 'ผู้ให้บริการ'), h('button', { class: 'btn sm primary', onclick: () => openFeedback({ service: 'proxy', offer_id: o.offer_id }) }, 'ทดลองสนใจบริการ')))) : [h('div', { class: 'callout' }, 'ไม่มีบริการฝากมูสำหรับสถานที่ที่เลือก')]),
            h('div', { class: 'callout warn small' }, 'ข้อมูลจำลอง ไม่มีการยืนยันผู้ให้บริการหรือการอนุญาตจากสถานที่จริง ไม่สร้างรายการจองหรือคำสั่งซื้อ'));
        }).catch((e) => clear(box).append(h('div', { class: 'callout bad' }, 'โหลดไม่สำเร็จ: ' + e.message)));
      }
      return h('div', { class: 'fade-in stack' }, title(7, 'อยากไปมูแบบไหนดี?', 'เลือกใช้บริการตามความสะดวก'),
        ctx ? h('div', { class: 'callout info' }, h('b', {}, 'มูต่อจากกิจกรรม: ' + ctx.name), ctx.place_name ? ` · ${ctx.place_name}` : '', h('div', { class: 'small' }, 'เลือกไปมูเอง ทริปบริษัท หรือฝากมู ด้านล่าง')) : null,
        h('div', { class: 'svc-grid', role: 'group', 'aria-label': 'รูปแบบบริการ' }, SERVICES.map(([id, e, bg, t, sub]) => h('button', { type: 'button', class: 'svc', 'aria-pressed': String(svc === id), onclick: () => { S.service = svc === id ? null : id; draw(); } }, h('span', { class: 'ic', style: `background:${bg}` }, e), t, h('small', {}, sub)))),
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
  function thanks(r) {
    clear(dlg).append(h('div', { class: 'dlg-b stack', style: 'text-align:center;padding:26px 22px' },
      h('div', { style: 'font-size:46px' }, '💜'), h('h3', {}, 'ขอบคุณสำหรับความคิดเห็น'),
      h('div', { class: r.saved ? 'callout ok' : 'callout warn' }, r.saved ? 'บันทึกความคิดเห็นแล้ว' : r.message),
      h('p', { class: 'muted', style: 'margin:0' }, 'ข้อมูลโปรไฟล์ของคุณยังอยู่ ไปต่อได้เลย'),
      // step 04 lists all 10 wishes, so "another topic" is always step 04 (the profile in steps 01-03 stays)
      h('button', { type: 'button', class: 'btn primary', onclick: () => startNewRound(4) }, 'มูเรื่องอื่นต่อ'),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => { dlg.close(); resetAll(); } }, 'กลับหน้าแรก (ล้างข้อมูลของฉัน)')));
  }

  function openFeedback(pre = {}) {
    const R = S.result;
    let service = pre.service || 'self', rating = 0;
    const msg = h('div', { role: 'status' });
    const stars = h('div', { class: 'stars', role: 'radiogroup', 'aria-label': 'ให้คะแนน 1 ถึง 5 ดาว' });
    const drawStars = () => { clear(stars); for (let i = 1; i <= 5; i++) stars.append(h('button', { type: 'button', role: 'radio', 'aria-checked': String(rating === i), 'aria-label': i + ' ดาว', class: i <= rating ? 'on' : '', onclick: () => { rating = i; drawStars(); } }, '★')); };
    drawStars();
    const svcSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'ประเภทบริการที่สนใจ' });
    const drawSeg = () => { clear(svcSeg); SERVICES.forEach(([id, , , t]) => svcSeg.append(h('button', { type: 'button', 'aria-pressed': String(service === id), onclick: () => { service = id; drawSeg(); } }, t))); };
    drawSeg();
    const ta = h('textarea', { maxlength: '300', placeholder: 'แชร์ความรู้สึกหรือสิ่งที่คุณชอบ / อยากให้ปรับ (ไม่บังคับ) — อย่าใส่ข้อมูลส่วนตัว' });
    const cnt = h('span', { class: 'small faint' }, '0/300');
    ta.addEventListener('input', () => { cnt.textContent = `${ta.value.length}/300`; });
    const consent = h('input', { type: 'checkbox', id: 'fb-consent' });
    const send = h('button', { type: 'button', class: 'btn primary', onclick: async () => {
      if (!rating) { msg.replaceChildren(h('div', { class: 'callout bad', role: 'alert' }, 'กรุณาให้คะแนน 1–5 ดาว')); return; }
      if (!consent.checked) { msg.replaceChildren(h('div', { class: 'callout bad', role: 'alert' }, 'กรุณาติ๊กยินยอมให้เก็บความคิดเห็นก่อนส่ง')); return; }
      send.disabled = true;
      try {
        const r = await API.feedback({ kind: { self: 'places', trip: 'trip', proxy: 'proxy' }[service], rating, comment: ta.value, consent: true, wish_ids: activeWishes(),
          place_ids: R ? R.top5.map((p) => p.place_id) : [], trip_id: (R && R.trip.matched ? R.trip.matched.trip_id : ''), offer_id: pre.offer_id || '' });
        thanks(r);
      } catch (e) { msg.replaceChildren(h('div', { class: 'callout bad', role: 'alert' }, e.message)); send.disabled = false; }
    } }, '✈ ส่งความคิดเห็น');
    clear(dlg).append(h('div', { class: 'dlg-h' }, h('h3', {}, 'เล่าประสบการณ์ให้ MUMU ฟัง'), h('button', { class: 'btn sm', 'aria-label': 'ปิด', onclick: () => dlg.close() }, '✕')),
      h('div', { class: 'dlg-b stack' }, h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'ประเภทบริการที่สนใจ'), svcSeg), stars, h('div', {}, ta, h('div', { style: 'text-align:right' }, cnt)),
        h('label', { class: 'row small', style: 'align-items:flex-start;flex-wrap:nowrap' }, consent, h('span', {}, 'ฉันยินยอมให้เก็บคะแนนและข้อความนี้ พร้อมเรื่องที่เลือกและสถานที่ที่ระบบเสนอ เพื่อประเมินความน่าใช้ของ Demo (ไม่เก็บวันเกิด และไม่ใช้ปรับโมเดลโดยอัตโนมัติ)')),
        h('div', { class: 'callout small' }, 'เป็นความคิดเห็นต่อ Demo ไม่ใช่การประเมินบริการจริง ไม่มีการจอง การชำระเงิน หรือพิธีกรรมเกิดขึ้น'), msg,
        h('div', { class: 'row', style: 'justify-content:flex-end' }, h('button', { class: 'btn', onclick: () => dlg.close() }, 'ยกเลิก'), send)));
    dlg.showModal();
  }

  /* ------------------------------------------------ place details modal */
  const ritualBlock = (ttl, rows) => !rows.length ? null : h('div', {}, h('h4', {}, ttl), rows.map((r) => h('div', { class: 'ritual' }, h('b', {}, r.category_th + ': '), r.detail,
    h('div', { class: 'src' }, 'แหล่ง: ' + r.source_name + ' · ' + r.verification + ' · ', r.quality_status === 'SOURCE_MISSING' ? 'ยังไม่มีแหล่งยืนยัน' : 'ข้อมูลอ้างอิง ไม่ใช่การรับรองทางการ',
      r.source_urls.filter((u) => /^https?:\/\//.test(u)).map((u, i) => [' · ', h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, 'แหล่ง ' + (i + 1))])))));
  async function openPlace(id) {
    clear(dlg).append(h('div', { class: 'dlg-b' }, h('div', { class: 'spinner' })));
    dlg.showModal();
    try {
      const P = await API.place(id);
      clear(dlg).append(h('div', { class: 'dlg-h' }, h('div', {}, h('h3', {}, P.name), h('div', { class: 'small muted' }, P.district + ' · ' + P.address)), h('button', { class: 'btn sm', onclick: () => dlg.close() }, 'ปิด')),
        h('div', { class: 'dlg-b stack' },
          h('div', { class: 'row' }, h('span', { class: 'chip' }, `เปิด ${P.hours.open}–${P.hours.close}`), statusChip(P.hours.status, 'เวลาเปิด'), h('span', { class: 'chip st-unv' }, 'พิกัด: สถานี ' + P.station.id + ' ไม่ใช่ตำแหน่งสถานที่จริง'), h('span', { class: 'chip' }, `เดินทางประมาณ ${P.station.access_min_candidate} นาทีจากสถานี (ประมาณการ)`)),
          P.caution ? h('div', { class: 'callout warn small' }, P.caution) : null,
          h('div', {}, h('h4', {}, 'สิ่งศักดิ์สิทธิ์และเรื่องมูที่เชื่อมโยง'), h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['สิ่งศักดิ์สิทธิ์', 'ความเชื่อ', 'เรื่องที่ขอ', 'สถานะ'].map((t) => h('th', {}, t)))),
            h('tbody', {}, P.sacred_entities.map((e) => h('tr', {}, h('td', {}, e.deity_name), h('td', {}, e.tradition), h('td', {}, e.wish_names.join(', ')), h('td', {}, statusChip(e.place_link_status, 'เทพ–สถานที่')))))))),
          ritualBlock('วิธีมู/ของไหว้ของสถานที่นี้', P.rituals.place), ...Object.entries(P.rituals.deity).map(([d, rows]) => ritualBlock('ของ' + nameOf(d), rows)),
          !P.rituals.place.length && !Object.keys(P.rituals.deity).length ? h('div', { class: 'callout' }, 'ยังไม่มีข้อมูลวิธีมูที่มีแหล่งอ้างอิงสำหรับสถานที่นี้') : null,
          h('div', { class: 'callout small' }, P.disclaimer)));
    } catch (e) { clear(dlg).append(h('div', { class: 'dlg-b' }, h('div', { class: 'callout bad' }, 'โหลดไม่สำเร็จ: ' + e.message), h('button', { class: 'btn', onclick: () => dlg.close() }, 'ปิด'))); }
  }

  draw();
}
