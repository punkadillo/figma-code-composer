import { test } from 'node:test';
import assert from 'node:assert/strict';
import { surfaceMetrics } from './surface.mjs';

const artifacts = {
  component: `interface Props { a: string; b?: number }
export function C(props: Props) { return null; }
export default C;`,
  stories: `export const Default = {};
export const Disabled = {};
export const Loading = {};`,
  tests: `test('a', () => {}); it('b', () => {}); test('c', () => {});`,
  docs: `# C\nThis is the docs. It explains usage.\n| prop | type |\n| --- | --- |`,
};

test('surfaceMetrics counts types, props, exports, stories, tests, docs words', () => {
  const m = surfaceMetrics(artifacts);
  assert.equal(m.hasTypes, true);
  assert.equal(m.propCount, 2);
  assert.equal(m.namedExports >= 1, true);
  assert.equal(m.storyCount, 3);
  assert.equal(m.testCount, 3);
  assert.equal(m.hasPropTable, true);
  assert.ok(m.docWords > 5);
});

test('surfaceMetrics tolerates missing artifacts', () => {
  const m = surfaceMetrics({ component: 'export const C = () => null;' });
  assert.equal(m.storyCount, 0);
  assert.equal(m.testCount, 0);
  assert.equal(m.docWords, 0);
  assert.equal(m.hasPropTable, false);
  assert.equal(m.hasTypes, false);
});
