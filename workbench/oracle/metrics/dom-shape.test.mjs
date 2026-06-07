import { test } from 'node:test';
import assert from 'node:assert/strict';
import { domShape } from './dom-shape.mjs';

const node = (children = []) => ({ tag: 'div', children });

test('null tree → null score', () => {
  assert.equal(domShape(null).score, null);
});

test('counts nodes and max depth', () => {
  const tree = node([node(), node([node()])]);
  const r = domShape(tree);
  assert.equal(r.nodeCount, 4);
  assert.equal(r.maxDepth, 3);
  assert.equal(r.score, 100); // within budgets
});

test('deep nesting is penalized', () => {
  let t = node();
  for (let i = 0; i < 14; i++) t = node([t]);
  const r = domShape(t);
  assert.ok(r.maxDepth > 8);
  assert.ok(r.score < 100);
});
