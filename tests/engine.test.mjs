import test from 'node:test';
import assert from 'node:assert/strict';

import { validateLevel, validateCatalog, runOriginal, runSplit, checkPlan, findSolution, checkHold } from '../src/game/engine.js';

const op = (id, purpose, body) => ({ id, label: id, purpose, code: id, ...body });
const clone = value => structuredClone(value);
function fixture(overrides = {}) {
  const records = [{ value: 2, other: 7 }, { value: 3, other: 11 }];
  return {
    id: 'fixture', title: '테스트', subtitle: '테스트', purposes: { a: '합산', b: '검사' },
    recordFields: ['value', 'other'], initial: { total: 0, otherTotal: 0 }, records,
    ops: [op('a', 'a', { kind: 'sum', target: 'total', field: 'value' }), op('b', 'b', { kind: 'sum', target: 'otherTotal', field: 'other' })],
    outputs: ['total', 'otherTotal'], hint: '힌트', explanation: '설명', splitPossible: true,
    solution: { loop1: ['a'], loop2: ['b'] },
    cases: Array.from({ length: 18 }, (_, i) => ({ name: `case ${i}`, records: i === 0 ? clone(records) : [{ value: i - 5, other: i + 1 }, { value: 2, other: 3 }] })),
    ...overrides,
  };
}

// Independent search deliberately uses only public execution results. It does not
// call findSolution/checkPlan or inspect authored splitPossible/solution fields.
function permutations(items) {
  if (!items.length) return [[]];
  return items.flatMap((item, index) => permutations(items.filter((_, i) => i !== index)).map(rest => [item, ...rest]));
}
function independentSolutions(level) {
  const a = level.ops.filter(item => item.purpose === 'a').map(item => item.id);
  const b = level.ops.filter(item => item.purpose === 'b').map(item => item.id);
  const observations = result => ({ outputs: result.outputs, records: result.records });
  const found = [];
  for (const first of permutations(a)) for (const second of permutations(b)) {
    for (const plan of [{ loop1: first, loop2: second }, { loop1: second, loop2: first }]) {
      if (level.cases.every(item => JSON.stringify(observations(runOriginal(level, item.records))) === JSON.stringify(observations(runSplit(level, plan, item.records))))) found.push(plan);
    }
  }
  return found;
}

test('engine provides the original-loop interpreter before a split can be verified', () => {
  assert.equal(typeof runOriginal, 'function', 'runOriginal must be exported');
});

test('independent sums preserve observations in either purpose order', () => {
  const level = fixture();
  assert.deepEqual(runOriginal(level).outputs, { total: 5, otherTotal: 18 });
  assert.equal(checkPlan(level, { loop1: ['a'], loop2: ['b'] }).ok, true);
  assert.equal(checkPlan(level, { loop1: ['b'], loop2: ['a'] }).ok, true);
  assert.equal(checkPlan(level, level.solution).checkedCases, 18);
});

test('split executes one complete pass before the next and preserves full trace order', () => {
  const level = fixture({ ops: [op('a', 'a', { kind: 'sum', target: 'total', field: 'value' }), op('b', 'b', { kind: 'stateAdd', target: 'otherTotal', source: 'total' })], splitPossible: false, solution: null });
  const original = runOriginal(level);
  const split = runSplit(level, { loop1: ['a'], loop2: ['b'] });
  assert.deepEqual(original.outputs, { total: 5, otherTotal: 7 });
  assert.deepEqual(split.outputs, { total: 5, otherTotal: 10 });
  assert.deepEqual(original.trace.map(step => [step.opId, step.recordIndex]), [['a', 0], ['b', 0], ['a', 1], ['b', 1]]);
  assert.deepEqual(split.trace.map(step => [step.opId, step.recordIndex]), [['a', 0], ['a', 1], ['b', 0], ['b', 1]]);
  assert.equal(checkPlan(level, { loop1: ['a'], loop2: ['b'] }).ok, false);
});

test('normalization before aggregation is safe and the opposite pass order is not', () => {
  const level = fixture({ ops: [op('a', 'a', { kind: 'map', field: 'value', source: 'value', factor: 2, offset: 1 }), op('b', 'b', { kind: 'sum', target: 'total', field: 'value' })] });
  assert.deepEqual(runOriginal(level).outputs, { total: 12, otherTotal: 0 });
  assert.equal(checkPlan(level, { loop1: ['a'], loop2: ['b'] }).ok, true);
  assert.equal(checkPlan(level, { loop1: ['b'], loop2: ['a'] }).ok, false);
});

test('statement reordering inside a purpose is checked against observable mutations', () => {
  const level = fixture({ ops: [op('a1', 'a', { kind: 'map', field: 'value', source: 'value', factor: 2, offset: 0 }), op('a2', 'a', { kind: 'map', field: 'value', source: 'value', factor: 1, offset: 3 }), op('b', 'b', { kind: 'sum', target: 'total', field: 'other' })], solution: { loop1: ['a1', 'a2'], loop2: ['b'] } });
  const result = checkPlan(level, { loop1: ['a2', 'a1'], loop2: ['b'] });
  assert.equal(result.ok, false);
  assert.equal(result.mismatch.kind, 'record');
  assert.equal(result.mismatch.field, 'value');
  assert.deepEqual(result.expected, result.actual, 'equal totals alone must not hide different records');
});

test('cross-record mutation and neighbor reads cannot be repaired by swapping loops', () => {
  const level = fixture({ ops: [op('a', 'a', { kind: 'map', field: 'value', source: 'value', factor: 2, offset: 0 }), op('b', 'b', { kind: 'neighborSum', target: 'total', field: 'value', offset: 1 })], splitPossible: false, solution: null });
  assert.equal(runOriginal(level).outputs.total, 7);
  assert.equal(runSplit(level, { loop1: ['a'], loop2: ['b'] }).outputs.total, 10);
  assert.equal(runSplit(level, { loop1: ['b'], loop2: ['a'] }).outputs.total, 5);
  assert.equal(findSolution(level), null);
  assert.equal(checkHold(level).ok, true);
});

test('missing, duplicate, unknown, empty and mixed-purpose plans cannot execute', () => {
  const level = fixture({ ops: [...fixture().ops, op('a2', 'a', { kind: 'sum', target: 'total', field: 'other' })], solution: { loop1: ['a', 'a2'], loop2: ['b'] } });
  for (const plan of [null, {}, { loop1: ['a'], loop2: ['b'] }, { loop1: ['a', 'a'], loop2: ['b'] }, { loop1: ['a', 'a2'], loop2: ['unknown'] }, { loop1: ['a', 'b', 'a2'], loop2: [] }, { loop1: ['a', 'b'], loop2: ['a2'] }]) {
    assert.equal(checkPlan(level, plan).ok, false, JSON.stringify(plan));
    assert.equal(checkPlan(level, plan).actual, null);
    assert.throws(() => runSplit(level, plan));
  }
});

test('hold decisions derive from legal search, regardless of the author flag', () => {
  const safe = fixture({ splitPossible: false, solution: null });
  assert.equal(checkHold(safe).ok, false);
  assert.ok(findSolution(safe));
  const unsafe = fixture({ ops: [op('a', 'a', { kind: 'sum', target: 'total', field: 'value' }), op('b', 'b', { kind: 'stateAdd', target: 'otherTotal', source: 'total' })], splitPossible: true });
  assert.equal(checkHold(unsafe).ok, true);
});

test('first counterexample exposes original/candidate values and concrete reason', () => {
  const level = fixture({ ops: [op('a', 'a', { kind: 'sum', target: 'total', field: 'value' }), op('b', 'b', { kind: 'stateAdd', target: 'otherTotal', source: 'total' })] });
  const result = checkPlan(level, level.solution);
  assert.equal(result.mismatch.caseIndex, 0);
  assert.equal(result.mismatch.field, 'otherTotal');
  assert.equal(result.mismatch.original.outputs.otherTotal, 7);
  assert.equal(result.mismatch.candidate.outputs.otherTotal, 10);
  assert.match(result.reason, /otherTotal/);
  assert.match(result.reason, /7/);
  assert.match(result.reason, /10/);
});

test('all execution, validation and search leave supplied levels and records unchanged', () => {
  const level = fixture();
  const before = JSON.stringify(level);
  validateLevel(level);
  runOriginal(level);
  runSplit(level, level.solution);
  checkPlan(level, level.solution);
  findSolution(level);
  checkHold(level);
  assert.equal(JSON.stringify(level), before);
});

test('validation rejects missing/non-numeric records and unsafe finite DSL input', () => {
  const invalid = [];
  let item = fixture(); delete item.records[0].value; invalid.push(item);
  item = fixture(); item.records[0].value = Infinity; invalid.push(item);
  item = fixture(); item.records[0].value = '2'; invalid.push(item);
  item = fixture(); item.records[0].value = 1.5; invalid.push(item);
  item = fixture(); item.records[0].value = 10001; invalid.push(item);
  item = fixture(); item.recordFields[0] = '__proto__'; invalid.push(item);
  item = fixture(); item.ops[0].kind = 'eval'; invalid.push(item);
  item = fixture(); item.ops[0].field = 'missing'; invalid.push(item);
  item = fixture(); item.ops[0].target = 'constructor'; invalid.push(item);
  item = fixture(); item.ops[0].script = 'fetch("https://example.org")'; invalid.push(item);
  item = fixture(); item.records = Array.from({ length: 17 }, () => ({ value: 1, other: 2 })); invalid.push(item);
  item = fixture(); item.ops = Array.from({ length: 9 }, (_, i) => op(`op${i}`, i % 2 ? 'a' : 'b', { kind: 'sum', target: 'total', field: 'value' })); invalid.push(item);
  item = fixture(); item.cases.pop(); invalid.push(item);
  item = fixture(); item.cases[1].records[0].extra = 1; invalid.push(item);
  for (const level of invalid) assert.throws(() => validateLevel(level));
  assert.throws(() => runOriginal(fixture(), [{ other: 1 }]));
});

test('execution supports deterministic fold, threshold count, map and negative values', () => {
  const level = fixture({
    ops: [op('a', 'a', { kind: 'fold', target: 'total', field: 'value', factor: 10 }), op('b', 'b', { kind: 'count', target: 'otherTotal', field: 'other', compare: 'gte', value: 10 })],
  });
  assert.deepEqual(runOriginal(level).outputs, { total: 23, otherTotal: 1 });
  assert.deepEqual(runOriginal(level, [{ value: -2, other: -1 }]).outputs, { total: -2, otherTotal: 0 });
});

test('catalog has eight original levels, eighteen distinct deterministic cases and a real 6/2 split', async () => {
  const { readFile } = await import('node:fs/promises');
  const catalog = JSON.parse(await readFile(new URL('../data/levels.json', import.meta.url), 'utf8'));
  assert.equal(validateCatalog(catalog), catalog, 'validator returns original body');
  assert.equal(catalog.levels.length, 8);
  assert.deepEqual(catalog.levels.map(level => level.id), ['01', '02', '03', '04', '05', '06', '07', '08']);
  let safe = 0;
  for (const level of catalog.levels) {
    assert.equal(validateLevel(level), level);
    assert.equal(level.cases.length, 18);
    assert.deepEqual(level.cases[0].records, level.records);
    assert.equal(new Set(level.cases.map(item => JSON.stringify(item.records))).size, 18, level.id);
    assert.ok(level.cases.some(item => item.records.length === 0), 'empty case');
    assert.ok(level.cases.some(item => item.records.length === 1), 'single-record case');
    const solutions = independentSolutions(level);
    const solution = findSolution(level);
    assert.equal(Boolean(solution), solutions.length > 0, level.id);
    assert.equal(Boolean(solution), level.splitPossible, `authored flag for ${level.id}`);
    assert.equal(checkHold(level).ok, !solution, level.id);
    if (solution) {
      safe++;
      assert.equal(checkPlan(level, solution).ok, true);
      assert.equal(checkPlan(level, level.solution).ok, true);
    } else assert.equal(level.solution, null);
    assert.deepEqual(findSolution(level), solution, 'deterministic legal search');
  }
  assert.equal(safe, 6);
});

test('catalog validator rejects duplicate IDs, wrong totals and wrong schema', () => {
  assert.throws(() => validateCatalog({ schema: 2, levels: [] }));
  assert.throws(() => validateCatalog({ schema: 1, levels: [fixture()] }));
  assert.throws(() => validateCatalog({ schema: 1, levels: Array.from({ length: 8 }, () => fixture()) }));
});

test('every authored Korean level label survives UTF-8 serialization', async () => {
  const { readFile } = await import('node:fs/promises');
  const catalog = JSON.parse(await readFile(new URL('../data/levels.json', import.meta.url), 'utf8'));
  for (const level of catalog.levels) {
    const labels = [
      ['title', level.title], ['subtitle', level.subtitle], ['hint', level.hint],
      ['explanation', level.explanation], ['purposes.a', level.purposes.a],
      ['purposes.b', level.purposes.b],
      ...level.ops.map(op => [`ops.${op.id}.label`, op.label]),
      ...level.cases.map((item, index) => [`cases.${index}.name`, item.name]),
    ];
    for (const [field, value] of labels) {
      assert.match(value, /[\uAC00-\uD7A3]/u, `${level.id}.${field} must contain Korean text`);
      assert.doesNotMatch(value, /\?{2,}|\uFFFD/u, `${level.id}.${field} must not contain replacement characters`);
    }
  }
});
