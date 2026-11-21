// Tab 2 · 03 Signature Trip Designer — how the 3 company trips were built OFFLINE. Not a real-time planner.
import { h, clear, f, pct, TRIP_TH } from './util.js';
import { API } from './api.js';

const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`;

export function renderDesigner(p, { design, cat }) {
  const bc = design.business_constraints, ow = design.objective_weights, tg = design.transit_graph;
  const v = cat.versions;
  p.append(h('div', { class: 'page-h' }, h('div', { class: 'ic' }, '🧭'), h('div', {}, h('h2', {}, '03 Signature Trip Designer'), h('p', {}, 'บริษัทออกแบบ 3 ทริปมาตรฐานไว้ล่วงหน้า (Offline) ด้วยเครือข่าย 3 ชั้น แล้วล็อกเป็นสินค้า ผู้ใช้ไม่ได้ทำให้เส้นทางเปลี่ยน'))));
  p.append(h('div', { class: 'callout warn' }, h('b', {}, 'Offline Simulation: '), 'หน้านี้แสดงขั้นตอนที่ใช้สร้างทริปมาตรฐานครั้งเดียวล่วงหน้า ไม่ใช่การสร้างทริปตามความสนใจของผู้ใช้แบบ Real-time ' , 'เมื่อผู้ใช้เข้าแอป ระบบแค่จับคู่กับ 3 ทริปที่ล็อกไว้ (ดูแท็บ 04)'));
  p.append(h('div', { class: 'flow', style: 'margin-top:22px' },
    h('div', {}, h('h4', {}, 'ความเกี่ยวข้องในเครือข่าย'), h('p', {}, 'ให้น้ำหนักเรื่องที่ขอของแต่ละธีม แล้วรัน Personalized PageRank ได้ผู้สมัครสูงสุด 15 แห่งต่อธีม')),
    h('div', {}, h('h4', {}, 'เส้นทางสั้นที่สุดบนรถไฟฟ้า'), h('p', {}, `กราฟ BTS/MRT ${tg.eligible_BTS_MRT_stations} สถานี ${tg.rail_edges} เส้นทาง + เดิน/Skywalk ใช้ Dijkstra · เข้าถึงได้ ${tg.eligible_places_with_rail_walk_access} แห่ง ตัดออก ${tg.excluded_places.length} แห่ง`)),
    h('div', {}, h('h4', {}, 'ค้นหาเส้นทางที่ดีที่สุด'), h('p', {}, `ลองทุกลำดับของ ${bc.stops} จุดแวะในกลุ่มผู้สมัคร ภายใต้ข้อจำกัดเวลา แล้วให้คะแนนด้วย 4 ปัจจัย`)),
    h('div', {}, h('h4', {}, 'เลือก 3 ทริปที่ไม่ซ้ำกัน แล้วล็อก'), h('p', {}, `ประเมินชุดทริปที่ไม่ซ้ำสถานที่ ${design.portfolio_evaluated_combinations.toLocaleString('en-US')} ชุด เก็บผลไว้ในไฟล์ที่ล็อก`))));
  p.append(h('div', { class: 'grid g2', style: 'margin-top:14px' },
    h('div', { class: 'card' }, h('h3', {}, 'ข้อจำกัดของทริป'), h('table', { style: 'margin-top:8px' }, h('tbody', {}, [
      ['จุดนัดพบ/เวลาเริ่ม', `BTS สยาม ${hhmm(bc.start_min)} (สมมติ)`], ['จุดแวะ', bc.stops + ' จุด'], ['เวลารวมสูงสุด', bc.max_total_minutes + ' นาที'], ['เวลาในแต่ละจุด', `${bc.site_dwell_min} นาที + บัฟเฟอร์กลุ่ม ${bc.on_site_group_buffer_min} นาที`],
      ['บรีฟกลุ่ม / พักกลางวัน', `${bc.group_briefing_min} / ${bc.midday_break_min} นาที`], ['การเดินทาง', bc.allowed_station_systems.join(' + ') + ' + เดิน/Skywalk'], ['ห้ามใช้', 'รถเมล์ เรือ แท็กซี่ วินมอเตอร์ไซค์ SRT ARL']].map(([a, b]) => h('tr', {}, h('td', {}, a), h('td', {}, b)))))),
    h('div', { class: 'card' }, h('h3', {}, 'คะแนนของทริป (Objective)'), h('div', { class: 'sub' }, 'ใช้เลือกลำดับจุดแวะ'), [['PPR เฉลี่ยของจุดแวะ', ow.ppr_mean], ['ครอบคลุมเรื่องที่ขอของธีม', ow.theme_wish_coverage], ['ประสิทธิภาพการเดินทาง', ow.journey_efficiency], ['ความหลากหลายของสิ่งศักดิ์สิทธิ์', ow.deity_diversity]].map(([t, x]) =>
      h('div', { style: 'margin-bottom:8px' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('span', {}, t), h('b', { class: 'mono' }, x.toFixed(2))), h('div', { class: 'bar gold' }, h('span', { style: `width:${x * 200}%` })))))));

  const result = h('div', { class: 'stack', style: 'margin-top:14px' });
  const btn = h('button', { type: 'button', class: 'btn primary', onclick: reproduce }, '↻ Reproduce Offline Design');
  p.append(h('div', { class: 'card', style: 'margin-top:14px' }, h('h3', {}, 'ผลลัพธ์ที่ล็อกไว้'), h('p', { class: 'sub' }, `กดเพื่อโหลดผลจากไฟล์ที่ล็อกไว้ (${design.version}) และแสดงทีละขั้น — ไม่ได้รันการออกแบบใหม่ และไม่เปลี่ยนทริปที่ผู้ใช้เห็น`), h('div', { class: 'row' }, btn)), result);

  async function reproduce() {
    btn.disabled = true;
    clear(result).append(h('div', { class: 'card', style: 'text-align:center' }, h('div', { class: 'spinner' })));
    let trips;
    try { trips = await Promise.all(['TRIP_LOVE', 'TRIP_CAREER', 'TRIP_WEALTH'].map((id) => API.trip(id))); } catch (e) { clear(result).append(h('div', { class: 'callout bad' }, e.message)); btn.disabled = false; return; }
    const stages = [
      h('div', { class: 'card stack fade-in' }, h('h3', {}, 'ขั้น 1–3 · การค้นหาในแต่ละธีม'), h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['ธีม', 'น้ำหนักเรื่องที่ขอ', 'ผู้สมัคร', 'ลำดับที่ตรวจ', 'ผ่านเงื่อนไข', 'ชุดสถานที่ไม่ซ้ำ'].map((t, i) => h('th', { class: i > 1 ? 'n' : '' }, t)))),
        h('tbody', {}, design.per_theme_search.map((t) => h('tr', {}, h('td', {}, TRIP_TH[t.trip_id], h('div', { class: 'small faint' }, t.theme)), h('td', { class: 'small' }, Object.entries(t.wish_weights).map(([w, x]) => `${w} ${x}`).join(' · ')),
          h('td', { class: 'n' }, t.candidate_places), h('td', { class: 'n' }, t.permutations_checked.toLocaleString('en-US')), h('td', { class: 'n' }, t.feasible_permutations.toLocaleString('en-US')), h('td', { class: 'n' }, t.unique_feasible_sets))))))),
      h('div', { class: 'grid g3 fade-in' }, trips.map((T) => h('article', { class: 'card stack' }, h('div', {}, h('h3', {}, TRIP_TH[T.trip_id]), h('div', { class: 'small muted' }, T.title + ' · ' + Object.entries(T.theme_weight_names).map(([k, x]) => `${k} ${x}`).join(' + '))),
        h('ol', { class: 'timeline' }, T.stops.map((s) => h('li', {}, h('div', { class: 't' }, `${s.arrival}–${s.finish} · ${s.station_id}`), h('div', {}, s.name), h('div', { class: 'small muted' }, s.featured_deity)))),
        h('div', { class: 'small' }, `จบประมาณ ${T.finish_clock} · รวม ${Math.round(T.duration_min)} นาที (รถไฟ ${Math.round(T.rail_min)} + เดิน ${Math.round(T.walk_min)} + รอ ${Math.round(T.train_wait_min)})`),
        h('div', { class: 'row' }, h('span', { class: 'chip' }, 'คะแนน ' + f(T.metrics.objective_score, 1)), h('span', { class: 'chip' }, 'PPR เฉลี่ย ' + f(T.metrics.ppr_mean_norm, 2)), h('span', { class: 'chip' }, 'ครอบคลุม ' + pct(T.metrics.wish_coverage_weighted, 0))),
        h('div', { class: 'small faint' }, 'คุณภาพเวลาเปิด: ' + T.hours_quality)))),
      h('div', { class: 'grid g2 fade-in' }, h('div', { class: 'card' }, h('h3', {}, 'ระยะเวลาของทริป'), h('img', { src: '/figures/03_fixed_trip_duration.png', alt: 'กราฟระยะเวลาของ 3 ทริปคงที่ แยกเป็นรถไฟ เดิน รอ และเวลาที่จุดแวะ', style: 'width:100%;height:auto;border-radius:10px;margin-top:8px' })),
        h('div', { class: 'card stack' }, h('h3', {}, 'ข้อสมมติและข้อจำกัด'), h('ul', { class: 'small', style: 'margin:0;padding-left:18px' }, [
          'จุดนัดพบสยาม 09:00 เป็นข้อสมมติ ยังไม่ใช่การตัดสินใจทางธุรกิจ', 'เวลาเดินทางรถไฟเป็นค่าประมาณ ไม่ใช่ตารางเดินรถจริง', 'เวลาเดินจากสถานีถึงสถานที่เป็นค่าประมาณที่ยังไม่ยืนยัน',
          'เวลาเปิดสถานที่บางแห่งเป็นข้อมูลจำลองหรือรอตรวจ (ดูคุณภาพเวลาเปิดในแต่ละทริป)', ...design.limitations.slice(0, 4)].map((t) => h('li', {}, t))),
        h('div', { class: 'row small' }, h('span', { class: 'chip' }, 'ไฟล์ออกแบบ ' + design.version), h('span', { class: 'chip' }, 'Snapshot ' + cat.versions.snapshot_sha256)))),
    ];
    clear(result);
    stages.forEach((st, i) => { st.style.display = 'none'; result.append(st); setTimeout(() => { st.style.display = ''; }, 600 * i); });
    setTimeout(() => { btn.disabled = false; }, 600 * stages.length);
  }
}
