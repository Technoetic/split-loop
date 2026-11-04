// A deliberately finite numeric language. No source text, property paths,
// callbacks, network operations or JavaScript evaluation enter this interpreter.
const LIMITS = Object.freeze({ records: 16, fields: 8, ops: 8, perPurpose: 4, cases: 18, input: 10000 });
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
const COMMON_OP_KEYS = ['id', 'label', 'purpose', 'code', 'kind'];
const OP_KEYS = Object.freeze({
  sum: ['target', 'field'],
  count: ['target', 'field', 'compare', 'value'],
  map: ['field', 'source', 'factor', 'offset'],
  fold: ['target', 'field', 'factor'],
  stateAdd: ['target', 'source'],
  neighborSum: ['target', 'field', 'offset'],
});

function requireThat(condition, message) {
  if (!condition) throw new Error(`레벨 데이터 오류: ${message}`);
}
function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function text(value, max = 600) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}
function fieldName(value) {
  return typeof value === 'string' && IDENTIFIER.test(value) && !FORBIDDEN.has(value);
}
function boundedInteger(value, max = LIMITS.input) {
  return Number.isSafeInteger(value) && Math.abs(value) <= max;
}
function list(value, min, max) {
  return Array.isArray(value) && value.length >= min && value.length <= max;
}
function recordsValid(level, records) {
  requireThat(list(records, 0, LIMITS.records), `레코드는 최대 ${LIMITS.records}개입니다.`);
  for (const record of records) {
    requireThat(plain(record), '레코드는 평범한 숫자 객체여야 합니다.');
    const keys = Object.keys(record);
    requireThat(keys.length === level.recordFields.length && keys.every(key => level.recordFields.includes(key)), '레코드 필드가 누락되었거나 추가되었습니다.');
    for (const field of level.recordFields) requireThat(Object.hasOwn(record, field) && boundedInteger(record[field]), `${field} 값은 유한한 범위의 정수여야 합니다.`);
  }
}

/** Validate shape and bounded semantics, without trusting authored answers. */
export function validateLevel(level) {
  requireThat(plain(level), '레벨 객체가 필요합니다.');
  requireThat(typeof level.id === 'string' && ID.test(level.id), '올바른 ASCII 레벨 ID가 필요합니다.');
  for (const key of ['title', 'subtitle', 'hint', 'explanation']) requireThat(text(level[key]), `${key} 설명이 필요합니다.`);
  requireThat(plain(level.purposes) && text(level.purposes.a, 100) && text(level.purposes.b, 100), '두 목적이 필요합니다.');
  requireThat(list(level.recordFields, 1, LIMITS.fields) && level.recordFields.every(fieldName) && new Set(level.recordFields).size === level.recordFields.length, '안전한 고유 레코드 필드가 필요합니다.');
  requireThat(plain(level.initial), '초기 누적값이 필요합니다.');
  const stateFields = Object.keys(level.initial);
  requireThat(list(stateFields, 1, LIMITS.fields) && stateFields.every(key => fieldName(key) && boundedInteger(level.initial[key])), '안전한 정수 누적 필드가 필요합니다.');
  requireThat(list(level.outputs, 1, LIMITS.fields) && new Set(level.outputs).size === level.outputs.length && level.outputs.every(key => stateFields.includes(key)), '출력 필드는 초기 누적값에 있어야 합니다.');
  requireThat(list(level.ops, 2, LIMITS.ops), '명령 카드 수가 범위를 벗어났습니다.');
  const ids = new Set();
  const purposeCounts = { a: 0, b: 0 };
  for (const op of level.ops) {
    requireThat(plain(op) && typeof op.id === 'string' && ID.test(op.id) && !ids.has(op.id), '카드 ID는 안전하고 고유해야 합니다.');
    ids.add(op.id);
    requireThat(op.purpose === 'a' || op.purpose === 'b', '카드는 두 목적 중 하나여야 합니다.');
    purposeCounts[op.purpose]++;
    requireThat(text(op.label, 150) && text(op.code, 300), '카드의 이름과 표시 코드가 필요합니다.');
    requireThat(Object.hasOwn(OP_KEYS, op.kind), '지원하지 않는 명령 종류입니다.');
    const keys = [...COMMON_OP_KEYS, ...OP_KEYS[op.kind]];
    requireThat(Object.keys(op).length === keys.length && Object.keys(op).every(key => keys.includes(key)), '명령에 누락되거나 지원하지 않는 속성이 있습니다.');
    if (Object.hasOwn(op, 'target')) requireThat(stateFields.includes(op.target), '명령의 누적 필드가 없습니다.');
    if (Object.hasOwn(op, 'field')) requireThat(level.recordFields.includes(op.field), '명령의 레코드 필드가 없습니다.');
    if (op.kind === 'map') requireThat(level.recordFields.includes(op.source), '변환 원본 필드가 없습니다.');
    if (op.kind === 'stateAdd') requireThat(stateFields.includes(op.source), '누적 원본 필드가 없습니다.');
    if (Object.hasOwn(op, 'factor')) requireThat(boundedInteger(op.factor, 10), '배수는 -10부터 10까지의 정수입니다.');
    if (Object.hasOwn(op, 'offset')) requireThat(boundedInteger(op.offset, op.kind === 'neighborSum' ? LIMITS.records : LIMITS.input), '오프셋이 범위를 벗어났습니다.');
    if (op.kind === 'count') requireThat(['gte', 'gt', 'lte', 'lt', 'eq'].includes(op.compare) && boundedInteger(op.value), '유한한 비교 조건이 필요합니다.');
  }
  requireThat(Object.values(purposeCounts).every(count => count > 0 && count <= LIMITS.perPurpose), '각 목적에 카드가 1~4개 있어야 합니다.');
  requireThat(typeof level.splitPossible === 'boolean', '분리 가능 여부가 필요합니다.');
  requireThat(level.solution === null || planIssue(level, level.solution) === null, '예시 해법의 카드 구성이 잘못되었습니다.');
  recordsValid(level, level.records);
  requireThat(list(level.cases, LIMITS.cases, LIMITS.cases), '검증 입력은 정확히 18개여야 합니다.');
  for (const item of level.cases) {
    requireThat(plain(item) && text(item.name, 100), '검증 입력 이름이 필요합니다.');
    recordsValid(level, item.records);
    execute(level, item.records, null, false); // Reject overflow before any game begins.
  }
  requireThat(JSON.stringify(level.cases[0].records) === JSON.stringify(level.records), '첫 검증 입력은 표시된 레코드여야 합니다.');
  return level;
}

export function validateCatalog(body) {
  requireThat(plain(body) && body.schema === 1 && list(body.levels, 8, 8), '스키마 1의 8개 레벨이 필요합니다.');
  let safeCount = 0;
  body.levels.forEach((level, index) => {
    validateLevel(level);
    requireThat(level.id === String(index + 1).padStart(2, '0'), '레벨 ID는 01부터 08까지 순서대로여야 합니다.');
    const solution = search(level);
    requireThat(Boolean(solution) === level.splitPossible, '분리 가능 표기와 실제 검증 결과가 다릅니다.');
    if (solution) {
      safeCount++;
      requireThat(level.solution !== null && compareCases(level, level.solution).ok, '예시 해법이 검증 입력을 보존하지 못합니다.');
    } else requireThat(level.solution === null, '분리 불가 레벨에는 예시 해법이 없어야 합니다.');
  });
  requireThat(safeCount === 6, '분리 가능 6개, 분리 보류 2개가 필요합니다.');
  return body;
}

function safeInteger(value) {
  requireThat(Number.isSafeInteger(value), '연산 결과가 안전한 정수 범위를 벗어났습니다.');
  return value;
}
function compare(value, comparator, threshold) {
  switch (comparator) {
    case 'gte': return value >= threshold;
    case 'gt': return value > threshold;
    case 'lte': return value <= threshold;
    case 'lt': return value < threshold;
    case 'eq': return value === threshold;
    default: throw new Error('지원하지 않는 비교입니다.');
  }
}
function execute(level, input, plan, collectTrace = true) {
  const records = input.map(record => ({ ...record }));
  const state = { ...level.initial };
  const trace = [];
  const apply = (op, recordIndex, pass) => {
    const record = records[recordIndex];
    switch (op.kind) {
      case 'sum': state[op.target] = safeInteger(state[op.target] + record[op.field]); break;
      case 'count': if (compare(record[op.field], op.compare, op.value)) state[op.target] = safeInteger(state[op.target] + 1); break;
      case 'map': record[op.field] = safeInteger(record[op.source] * op.factor + op.offset); break;
      case 'fold': state[op.target] = safeInteger(state[op.target] * op.factor + record[op.field]); break;
      case 'stateAdd': state[op.target] = safeInteger(state[op.target] + state[op.source]); break;
      case 'neighborSum': {
        const next = ((recordIndex + op.offset) % records.length + records.length) % records.length;
        state[op.target] = safeInteger(state[op.target] + records[next][op.field]);
        break;
      }
      default: throw new Error('지원하지 않는 명령입니다.');
    }
    if (collectTrace) trace.push({ opId: op.id, recordIndex, pass, state: { ...state }, record: { ...record } });
  };
  if (plan === null) {
    for (let index = 0; index < records.length; index++) for (const op of level.ops) apply(op, index, 'original');
  } else {
    const byId = new Map(level.ops.map(op => [op.id, op]));
    // This is loop fission: every record completes loop1 before loop2 starts.
    for (const lane of ['loop1', 'loop2']) for (let index = 0; index < records.length; index++) for (const id of plan[lane]) apply(byId.get(id), index, lane);
  }
  const outputs = Object.fromEntries(level.outputs.map(key => [key, state[key]]));
  return { outputs, records, trace };
}

export function runOriginal(level, records = level.records) {
  validateLevel(level);
  recordsValid(level, records);
  return execute(level, records, null);
}
export function runSplit(level, plan, records = level.records) {
  validateLevel(level);
  const issue = planIssue(level, plan);
  if (issue) throw new Error(issue);
  recordsValid(level, records);
  return execute(level, records, plan);
}

function planIssue(level, plan) {
  if (!plain(plan) || !Array.isArray(plan.loop1) || !Array.isArray(plan.loop2)) return '두 반복문에 모든 카드를 배치하세요.';
  if (Object.keys(plan).some(key => !['loop1', 'loop2'].includes(key))) return '지원하지 않는 반복문 구성입니다.';
  if (!plan.loop1.length || !plan.loop2.length) return '두 반복문은 각각 한 개 이상의 카드가 필요합니다.';
  if (plan.loop1.length + plan.loop2.length !== level.ops.length) return '모든 카드를 정확히 한 번 배치하세요.';
  const byId = new Map(level.ops.map(op => [op.id, op]));
  const all = [...plan.loop1, ...plan.loop2];
  if (all.some(id => typeof id !== 'string' || !byId.has(id))) return '알 수 없는 카드가 있습니다.';
  if (new Set(all).size !== level.ops.length) return '같은 카드를 두 번 실행할 수 없습니다.';
  for (const lane of ['loop1', 'loop2']) if (new Set(plan[lane].map(id => byId.get(id).purpose)).size !== 1) return '각 반복문에는 하나의 목적만 담으세요.';
  if (byId.get(plan.loop1[0]).purpose === byId.get(plan.loop2[0]).purpose) return '두 목적을 서로 다른 반복문으로 나누세요.';
  return null;
}
function firstDifference(level, original, candidate) {
  for (const field of level.outputs) if (original.outputs[field] !== candidate.outputs[field]) return { kind: 'output', field, expected: original.outputs[field], actual: candidate.outputs[field] };
  for (let index = 0; index < original.records.length; index++) for (const field of level.recordFields) {
    if (original.records[index][field] !== candidate.records[index][field]) return { kind: 'record', recordIndex: index, field, expected: original.records[index][field], actual: candidate.records[index][field] };
  }
  return null;
}
function compareCases(level, plan) {
  let shownOriginal;
  let shownCandidate;
  for (let caseIndex = 0; caseIndex < level.cases.length; caseIndex++) {
    const item = level.cases[caseIndex];
    const original = execute(level, item.records, null, false);
    let candidate;
    try { candidate = execute(level, item.records, plan, false); }
    catch (error) {
      return { ok: false, reason: `${item.name}: 후보 실행이 정수 범위를 벗어났습니다.`, expected: original.outputs, actual: null, mismatch: { caseIndex, caseName: item.name, records: item.records.map(record => ({ ...record })), kind: 'overflow', original, candidate: null, expected: '안전한 정수', actual: error.message }, checkedCases: caseIndex + 1 };
    }
    if (caseIndex === 0) { shownOriginal = original.outputs; shownCandidate = candidate.outputs; }
    const difference = firstDifference(level, original, candidate);
    if (difference) {
      const location = difference.kind === 'record' ? `${difference.recordIndex + 1}번 레코드의 ${difference.field}` : difference.field;
      return {
        ok: false,
        reason: `${item.name}: ${location} — 원본 ${difference.expected}, 분리 후 ${difference.actual}. 실행 순서에 따른 의존성을 확인하세요.`,
        expected: original.outputs, actual: candidate.outputs,
        mismatch: { caseIndex, caseName: item.name, records: item.records.map(record => ({ ...record })), ...difference, original, candidate },
        checkedCases: caseIndex + 1,
      };
    }
  }
  return { ok: true, reason: '18개 유한 입력에서 출력과 레코드 변경을 모두 보존했습니다.', expected: shownOriginal, actual: shownCandidate, mismatch: null, checkedCases: level.cases.length };
}

export function checkPlan(level, plan) {
  validateLevel(level);
  const issue = planIssue(level, plan);
  if (issue) return { ok: false, reason: issue, expected: execute(level, level.records, null, false).outputs, actual: null, mismatch: null, checkedCases: 0 };
  return compareCases(level, plan);
}
function* permutations(items) {
  if (!items.length) { yield []; return; }
  for (let index = 0; index < items.length; index++) {
    const remaining = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const rest of permutations(remaining)) yield [items[index], ...rest];
  }
}
function search(level) {
  const a = level.ops.filter(op => op.purpose === 'a').map(op => op.id);
  const b = level.ops.filter(op => op.purpose === 'b').map(op => op.id);
  for (const first of permutations(a)) for (const second of permutations(b)) {
    for (const plan of [{ loop1: first, loop2: second }, { loop1: second, loop2: first }]) if (compareCases(level, plan).ok) return plan;
  }
  return null;
}
export function findSolution(level) {
  validateLevel(level);
  return search(level);
}
export function checkHold(level) {
  // Recompute the answer from operations/cases, never from splitPossible.
  const solution = findSolution(level);
  if (solution) return { ok: false, reason: '18개 검증 입력을 보존하는 분리 순서가 있습니다. 카드 순서와 두 반복문의 순서를 살펴보세요.', checkedCases: level.cases.length };
  return { ok: true, reason: '두 목적의 모든 카드 순서와 반복문 순서를 검사했습니다. 어떤 분리도 18개 입력을 모두 보존하지 못합니다. 이 유한 언어·입력 집합의 결과이며 임의 프로그램에 대한 증명은 아닙니다.', checkedCases: level.cases.length };
}
