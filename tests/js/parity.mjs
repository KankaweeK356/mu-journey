// Reads {cases:[{sched, today}]} on stdin and prints classify() + occurrences for each case. Used by tests/test_calendar.py.
import { classify, occurrencesBetween, addDays } from '../../public/js/calendar.js';
let raw = '';
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  const { cases } = JSON.parse(raw);
  console.log(JSON.stringify(cases.map((c) => ({ classify: classify(c.sched, c.today), occ: occurrencesBetween(c.sched, c.today, addDays(c.today, 90)) }))));
});
