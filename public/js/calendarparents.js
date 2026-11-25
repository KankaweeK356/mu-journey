// Calendar v3 scenario objects for the Tab 2 simulation (moved unchanged from calendarlab.js so Node can test them). Pure: no DOM, no storage.
import { parseBkk } from './reminder.js';

/* ------------------------------------------------------------------ build a parent + children for a scenario */
export function buildParent(kind, id, D) {
  if (kind === 'VALENTINE') {
    const day = D.fixed.fixed_days[0];
    return { parent: { parent_id: day.calendar_item_id, kind: 'FIXED', name: day.event_name, origin: 'FIXED', wish_ids: [day.wish_id], children: [{ source_entity_id: day.calendar_item_id, source_type: 'FIXED_CALENDAR_DAY', label: day.event_name,
      occ: { kind: 'yearly', month_day: day.month_day }, calendar_date_status: day.calendar_date_status, schedule_status: day.event_schedule_status, synthetic: false, offsets_available: [...day.reminder_offsets_minutes], matching_method: day.matching_method, data_origin: day.data_origin, visibility_scope: day.visibility_scope }] },
      row: day, synthetic: false, title: day.event_name, wish: day.wish_id, note: day.disclaimer };
  }
  if (kind === 'TICKET') {
    const c = D.demo.concerts.find((x) => x.concert_id === id), sales = D.demo.ticket_sales.filter((s) => s.concert_id === id);
    return { parent: { parent_id: c.concert_id, kind: 'CONCERT', name: c.concert_name, origin: 'DEMO', wish_ids: [c.wish_id], children: sales.map((s) => ({ source_entity_id: s.sale_id, source_type: 'TICKET_SALE', sale_phase: s.sale_phase, label: s.sale_phase,
      eligibility_rule: s.eligibility_rule, sale_end: s.sale_end_datetime, occ: { kind: 'single', datetime: s.sale_start_datetime }, calendar_date_status: 'SYNTHETIC_DATE', schedule_status: 'SYNTHETIC_DEMO', synthetic: true,
      offsets_available: [...s.reminder_offsets_minutes], matching_method: s.matching_method, data_origin: s.data_origin, visibility_scope: s.visibility_scope })) },
      row: c, synthetic: true, title: c.concert_name, wish: c.wish_id, note: `คอนเสิร์ตจริงไม่มี: ${c.ticket_url_status} · ศิลปินสมมติ ${c.artist_id}` };
  }
  const p = D.demo.exam_programs.find((x) => x.exam_id === id), ms = D.demo.exam_milestones.filter((m) => m.exam_id === id);
  const close = parseBkk(ms.find((m) => m.milestone_type === 'APPLICATION_CLOSE').milestone_datetime);
  return { parent: { parent_id: p.exam_id, kind: 'EXAM', name: p.exam_name, origin: 'DEMO', wish_ids: [p.wish_id], children: ms.map((m) => ({ source_entity_id: m.milestone_id, source_type: 'EXAM_MILESTONE', milestone_type: m.milestone_type, exam_id: m.exam_id,
    exam_close_min: close, label: m.milestone_type, occ: { kind: 'single', datetime: m.milestone_datetime }, calendar_date_status: 'SYNTHETIC_DATE', schedule_status: 'SYNTHETIC_DEMO', synthetic: true,
    offsets_available: [...m.reminder_offsets_minutes], matching_method: m.matching_method, data_origin: m.data_origin, visibility_scope: m.visibility_scope })) },
    row: p, synthetic: true, title: p.exam_name, wish: p.wish_id, note: `${p.official_source_status} · ผู้จัดสมมติ` };
}
