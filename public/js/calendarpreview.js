// Tab 2 simple view of the proactive reminder: pick the next upcoming item for an interest and ask the REAL engine when it would remind.
// Pure functions on top of notify.js / reminder.js (REMINDER_POLICY_V3). No DOM, no storage, synthetic data stays in a SIMULATION store.
import { createStore } from './notify.js';
import { buildParent } from './calendarparents.js';
import { parseBkk, dateBkk, reminderText } from './reminder.js';

export const SUGGEST = { W01: 'VALENTINE', W04: 'EXAM_DATE', W05: 'TICKET' };
export const SCENARIO_TH = { VALENTINE: 'วันวาเลนไทน์', EXAM_DATE: 'วันสอบ', TICKET: 'วันเปิดขายบัตรคอนเสิร์ต' };

const daysLeft = (target, from) => Math.round((parseBkk(dateBkk(target)) - parseBkk(dateBkk(from))) / 1440);

/** The earliest item whose first reminder is still ahead of `from` (so the whole schedule can be shown). null when there is none. */
export function suggestionFor(scenario, D, from) {
  const list = [];
  const add = (id, childId) => {
    const b = buildParent(scenario === 'VALENTINE' ? 'VALENTINE' : scenario === 'TICKET' ? 'TICKET' : 'EXAM_DATE', id, D);
    const child = b.parent.children.find((c) => c.source_entity_id === childId);
    const year = Number(dateBkk(from).slice(0, 4));
    const targets = child.occ.kind === 'yearly' ? [year, year + 1, year + 2].map((y) => parseBkk(`${y}-${child.occ.month_day}`)) : [parseBkk(child.occ.datetime)];
    const target = targets.find((t) => t != null && t - Math.max(...child.offsets_available) >= from);
    if (target != null) list.push({ scenario, parent: b.parent, child, title: b.title, synthetic: b.synthetic, target });
  };
  if (scenario === 'VALENTINE') add('CAL_VALENTINE', 'CAL_VALENTINE');
  else if (scenario === 'TICKET') D.demo.ticket_sales.forEach((s) => { if (parseBkk(s.sale_start_datetime) > from) add(s.concert_id, s.sale_id); });
  else D.demo.exam_milestones.forEach((m) => { if (m.milestone_type === 'EXAM_DATE' && parseBkk(m.milestone_datetime) > from) add(m.exam_id, m.milestone_id); });
  if (!list.length) return null;
  const x = list.sort((a, b) => a.target - b.target || (a.child.source_entity_id < b.child.source_entity_id ? -1 : 1))[0];
  return { ...x, daysLeft: daysLeft(x.target, from), eventLabel: scenario === 'EXAM_DATE' ? 'สอบวันที่' : scenario === 'TICKET' ? 'เปิดขายวันที่' : 'ตรงกับวันที่',
    eligibility: x.child.eligibility_rule && x.child.eligibility_rule !== 'PUBLIC' ? x.child.eligibility_rule : null };
}

/** What the engine really creates when the user allows every reminder for that item and the page is checked at each due time. */
export function reminderTimeline(x, from) {
  const store = createStore({ demo: true }), pid = x.parent.parent_id, sid = x.child.source_entity_id;
  store.follow(x.parent, from);
  store.setOffsets(pid, sid, x.child.offsets_available, from);
  const kind = x.child.source_type === 'EXAM_MILESTONE' ? x.child.milestone_type : x.child.source_type;
  const out = [];
  for (const offset of [...x.child.offsets_available].sort((a, b) => b - a)) {
    const at = x.target - offset;
    for (const n of store.runCheck(at).created) if (n.source_entity_id === sid) out.push({ at, offset: n.offset, code: n.code, text: reminderText(kind, { target_min: n.occurrence_min }, n.offset, at) });
  }
  return out;
}
