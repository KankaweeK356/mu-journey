// Final improvement round: Network Explorer numbers and the wish filter (Node).  node --test tests/js/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { degreeByType, degreeRankings, degreeLeaders, communityVerdict, randomGraphRows } from '../../public/js/netstats.js';
import { wishNetwork } from '../../public/js/graphview.js';
import { put } from '../../public/js/util.js';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf-8');
const graph = JSON.parse(read('public/data/graph.json'));
const A = JSON.parse(read('public/data/network_analysis.json'));
const csv = read('model/results/network_analysis/degree_by_type.csv').trim().split('\n').slice(1);

test('wish filter keeps only the chosen wish, its entities and their places (all 10 wishes)', () => {
  const wishes = graph.nodes.filter((n) => n.type === 'W');
  assert.equal(wishes.length, 10);
  for (const w of wishes) {
    const keep = wishNetwork(graph, w.id);
    assert.deepEqual([...keep].filter((id) => id.startsWith('W:')), [w.id], w.label);
    const deities = graph.edges.filter((e) => e.s === w.id).map((e) => e.t);
    assert.deepEqual([...keep].filter((id) => id.startsWith('D:')).sort(), [...deities].sort(), w.label);
    for (const p of [...keep].filter((id) => id.startsWith('P:'))) assert.ok(graph.edges.some((e) => e.t === p && deities.includes(e.s)), `${w.label} ${p}`);
  }
});

test('degree is counted per relation and matches the analysis CSV', () => {
  const by = Object.fromEntries(degreeByType(graph).map((d) => [d.id, d]));
  for (const line of csv) {
    const cells = line.split(','), id = cells[0], type = cells[1], [w, d, p] = cells.slice(-3), n = by[id];
    if (type === 'D') assert.deepEqual([n.wishes, n.places], [Number(w), Number(p)], id);
    else assert.equal(n.deities, Number(d), id);
  }
});

test('rankings never mix node types, and ties left out are reported', () => {
  const R = degreeRankings(degreeByType(graph));
  assert.equal(R.length, 4);
  for (const r of R) {
    assert.equal(r.rows.length, 5);
    assert.ok(r.rows.every((x) => x.id.startsWith(r.type + ':')), r.key);
    assert.ok(r.rows.every((x, i) => !i || r.rows[i - 1].value >= x.value));
  }
  assert.ok(R.some((r) => r.moreTied > 0));
  // the summary box names every node that shares first place
  const lines = degreeLeaders(degreeByType(graph));
  assert.equal(lines.length, 4);
  for (const name of ['คุณแม่บุญเรือน', 'พระพิฆเนศ', 'ท้าวมหาพรหม', 'ท้าวเวสสุวรรณ']) assert.ok(lines[2].includes(name), name);
  assert.ok(lines[2].endsWith('(องค์ละ 3 เรื่อง เสมอกัน 4 องค์)'), lines[2]);
  for (const i of [0, 1, 3]) assert.ok(!lines[i].includes('เสมอกัน') && /\(\d+\)$/.test(lines[i]), lines[i]);
});

test('community verdict says "cannot conclude" when the random-graph check fails and no group is named', () => {
  const v = communityVerdict(A);
  assert.equal(v.pass, A.null_model.modularity_above_chance);
  if (!v.pass) {
    assert.match(v.text, /ยังสรุปไม่ได้/);
    assert.ok(A.communities.every((c) => !c.named));
  }
  assert.equal(randomGraphRows(A).length, 4);
});

test('put() skips null, undefined and false instead of printing them', () => {
  const got = [];
  put({ append: (...x) => got.push(...x) }, 'a', null, undefined, false, [null, 'b'], 0);
  assert.deepEqual(got, ['a', 'b', 0]);
});
