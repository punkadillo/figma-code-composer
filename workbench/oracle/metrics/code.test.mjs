import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeMetrics } from './code.mjs';

test('codeMetrics counts loc, imports, and branch-keyword complexity', () => {
  const src = `import x from 'a';
import y from 'b';
export function C(props) {
  if (props.a) return 1;
  return props.b && props.c ? 2 : 3;
}`;
  const m = codeMetrics(src);
  assert.equal(m.loc, 6);
  assert.equal(m.imports, 2);
  assert.equal(m.complexity, 3);
  assert.ok(m.size > 0);
});

test('codeMetrics metricScore is 100 for tiny simple code and decreases with complexity', () => {
  const simple = codeMetrics(`export const C = () => null;`);
  const complex = codeMetrics(
    'export function C(p){' + 'if(p){};'.repeat(40) + '}'
  );
  assert.equal(simple.metricScore, 100);
  assert.ok(complex.metricScore < simple.metricScore, `expected complex < 100, got ${complex.metricScore}`);
  assert.ok(complex.metricScore >= 0);
});

test('codeMetrics handles empty input without throwing', () => {
  const m = codeMetrics('');
  assert.equal(m.loc, 0);
  assert.equal(m.complexity, 0);
  assert.equal(m.metricScore, 100);
});

test('complexity proxy ignores optional chaining, nullish, and optional props', () => {
  const src = `interface P { a?: string }
export function C(p?: P) {
  const x = p?.a ?? 'd';
  return p ? x : '';
}`;
  // real branches: exactly one ternary `?`. p?.a (chaining), ?? (nullish),
  // a?: and p?: (optional props/params) must NOT count.
  assert.equal(codeMetrics(src).complexity, 1);
});
