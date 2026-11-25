// Tab 2 · 04 Personalized Trip Matching — picks ONE of the 3 fixed trips (or none) for the Lab profile. Never re-routes.
import { h, clear, put, f, pct, TRIP_TH } from './util.js';
import { API } from './api.js';
import { S } from './state.js';
import { ensureTrace, labListeners } from './lab.js';
import { wishIcon } from './icons.js';

export function renderMatching(p, ctx) {
  const { cat, names } = ctx;
  const wishName = Object.fromEntries(cat.wishes.map((w) => [w.id, w.label]));
  const box = h('div', { class: 'stack', style: 'margin-top:14px' });
  p.append(h('div', { class: 'page-h' }, h('div', { class: 'ic' }, '🧩'), h('div', {}, h('h2', {}, '04 Personalized Trip Matching'), h('p', {}, 'ใช้โปรไฟล์และคะแนน PPR เดียวกับ MU Recommendation Lab เพื่อเลือก Top 1 จาก 3 ทริปที่ล็อกไว้ หรือ NO_ELIGIBLE_SIGNATURE_TRIP — ไม่มีการสร้างหรือปรับเส้นทางใหม่'))), box);
  labListeners.add(() => { if (p.isConnected) draw(); });

  async function draw() {
    clear(box);
    if (!S.lab.trace) {
      box.append(h('div', { class: 'card stack' }, h('p', { style: 'margin:0' }, 'ยังไม่ได้คำนวณโปรไฟล์ใน MU Recommendation Lab'),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary', id: 'mt-run', onclick: async (e) => { e.currentTarget.disabled = true; try { await ensureTrace(); } catch (err) { clear(box).append(h('div', { class: 'callout bad' }, err.message)); return; } draw(); } }, '▶ คำนวณด้วยโปรไฟล์ปัจจุบัน'),
          h('button', { type: 'button', class: 'btn', onclick: () => ctx.go('lab') }, 'ไปที่ MU Recommendation Lab')),
        h('p', { class: 'small faint', style: 'margin:0' }, S.lab.profile ? 'โปรไฟล์: ' + S.lab.profile.wish_ids.map((w) => wishName[w]).join(' + ') + (S.lab.source.startsWith('persona') ? ' (ตัวอย่างข้อมูลจำลอง)' : '') : 'ใช้โปรไฟล์จาก Demo ผู้ใช้หรือตัวอย่างจำลองถ้ายังไม่มี')));
      return;
    }
    const T = S.lab.trace, M = T.trip_matching, res = M.result;
    let tripInfo;
    try { tripInfo = Object.fromEntries((await Promise.all(M.trips.map((t) => API.trip(t.trip_id)))).map((t) => [t.trip_id, t])); } catch (e) { box.append(h('div', { class: 'callout bad' }, e.message)); return; }
    const blocked = new Set(T.profile.blocked_deity_ids), blockedP = new Set(T.profile.blocked_place_ids);
    const reasonText = (c) => c.startsWith('FEATURED_RITUAL_EXCLUSION:') ? 'พิธีเด่นเกี่ยวกับสิ่งที่ไม่ต้องการ: ' + c.split(':')[1].split(',').map((d) => names['D:' + d] || d).join(', ') : c === 'PLACE_EXCLUSION' ? 'มีสถานที่ที่ไม่ต้องการอยู่ในเส้นทาง' : c === 'INSUFFICIENT_USER_WISH_COVERAGE' ? 'ครอบคลุมเรื่องที่เลือกน้อยกว่า 30%' : c;
    put(box,
      h('div', { class: 'row' }, T.profile.wish_names.map((w) => h('span', { class: 'chip' }, w)), h('span', { class: S.lab.source.startsWith('persona') ? 'chip st-syn' : 'chip ok' }, S.lab.source === 'demo' ? '✓ โปรไฟล์จาก Demo ผู้ใช้' : S.lab.source.startsWith('persona') ? '◇ ตัวอย่างข้อมูลจำลอง' : 'กรอกเอง'),
        h('span', { class: res.matched_trip ? 'chip ok' : 'chip bad' }, res.matched_trip ? 'ผลลัพธ์: ' + TRIP_TH[res.matched_trip.trip_id] : 'ผลลัพธ์: NO_ELIGIBLE_SIGNATURE_TRIP')),
      h('div', { class: 'card stack' }, h('h3', {}, 'ลำดับการตัดสินใจ'), h('ol', { class: 'small', style: 'margin:0;padding-left:18px' },
        h('li', {}, 'ตรวจ Hard Exclusions: พิธีเด่นของทริปเกี่ยวกับสิ่งศักดิ์สิทธิ์ที่ไม่ต้องการ หรือมีสถานที่ต้องห้าม'), h('li', {}, 'คำนวณ Wish Coverage = เรื่องที่ทริปครอบคลุม ÷ เรื่องที่ผู้ใช้เลือก (ต้อง ≥ 30%)'),
        h('li', {}, 'คำนวณ Graph Relevance = ค่าเฉลี่ย PPR ของ 4 จุดแวะ (ใช้ PPR จากโปรไฟล์เดียวกับ Lab)'), h('li', {}, 'คำนวณคะแนน แล้วเลือกทริปที่ผ่านและคะแนนสูงสุด')),
        h('div', { class: 'formula' }, 'Trip Match Score = ', h('b', {}, '0.75'), ' × Graph Relevance + ', h('b', {}, '0.25'), ' × Wish Coverage')),
      h('div', { class: 'grid g3' }, res.all_trip_scores.map((s) => {
        const t = M.trips.find((x) => x.trip_id === s.trip_id), info = tripInfo[s.trip_id], win = res.matched_trip && res.matched_trip.trip_id === s.trip_id;
        return h('article', { class: 'card stack', style: win ? 'border:2px solid var(--purple-2)' : '' },
          h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', {}, TRIP_TH[s.trip_id]), h('span', { class: s.eligible ? 'chip ok' : 'chip bad' }, win ? '★ ได้รับเลือก' : s.eligible ? 'ผ่านเกณฑ์' : 'ไม่ผ่าน')),
          h('div', { class: 'small muted' }, info.title + ' · เส้นทางคงที่ ' + info.stops.length + ' จุด'),
          h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'จุดแวะ (ลำดับคงที่)'), h('th', {}, 'พิธีเด่น'), h('th', { class: 'n' }, 'PPR'))), h('tbody', {}, t.stops.map((x, i) => {
            const st = info.stops[i], bad = blocked.has(st.featured_deity_id) || blockedP.has(x.place_id);
            return h('tr', { class: bad ? 'out' : '' }, h('td', { class: 'small' }, `${i + 1}. ${x.name}`), h('td', { class: 'small' }, st.featured_deity, bad ? h('span', { class: 'chip bad', style: 'margin-left:4px' }, 'ขัดข้อจำกัด') : null), h('td', { class: 'n' }, f(x.ppr_normalized, 3)));
          }))),
          h('div', { class: 'small' }, 'Graph Relevance ', h('b', { class: 'mono' }, f(s.graph_relevance, 3))),
          h('div', { class: 'small' }, 'Wish Coverage ', h('b', { class: 'mono' }, pct(s.coverage_fraction, 0)), s.user_wishes_covered.length ? ` (${s.user_wishes_covered.map((w) => wishName[w]).join(', ')})` : ' (ไม่ครอบคลุมเรื่องที่เลือก)'),
          h('div', { class: 'small' }, 'คะแนน = 0.75 × ', f(s.graph_relevance, 3), ' + 0.25 × ', f(s.coverage_fraction, 2), ' = ', h('b', { class: 'mono' }, f(s.matching_score, 3))),
          s.reason_codes.length ? h('div', { class: 'callout bad small' }, s.reason_codes.map(reasonText).join(' · ')) : h('div', { class: 'callout ok small' }, 'ผ่านทุกเงื่อนไข'));
      })),
      !res.matched_trip ? h('div', { class: 'callout warn' }, h('b', {}, 'NO_ELIGIBLE_SIGNATURE_TRIP: '), 'ทริปทั้ง 3 ไม่ผ่านเงื่อนไขอย่างน้อยหนึ่งข้อ ระบบไม่สร้างทริปใหม่ และผู้ใช้ยังเลือกไปมูเองได้ (ดูเหตุผลของแต่ละทริปด้านบน)') : null,
      h('div', { class: 'callout info small' }, `เส้นทางทั้ง 3 ทริปล็อกไว้ (route_reoptimized_per_user = ${String(res.route_reoptimized_per_user)}) คำแนะนำนี้เป็นเชิงความสนใจ ยังไม่ตรวจที่นั่ง ราคา หรือวันเดินทาง · Model ${T.versions.model}`));
  }
  draw();
}
