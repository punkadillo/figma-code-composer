import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flattenTree, scoreStructural } from './score-structural.mjs';

const node = (tag, role, children = []) => ({ tag, role, children });

test('flattenTree yields tag:role tokens depth-first', () => {
  const tree = node('button', 'button', [node('span', null)]);
  assert.deepEqual(flattenTree(tree), ['button:button', 'span:']);
});

test('identical trees + identical props score 100', () => {
  const g = { tree: node('button','button',[node('span',null)]), props: ['variant','size'] };
  const r = { tree: node('button','button',[node('span',null)]), props: ['variant','size'] };
  assert.equal(scoreStructural(g, r).score, 100);
});

test('missing a child node lowers the tree component', () => {
  const g = { tree: node('button','button',[]), props: ['variant'] };
  const r = { tree: node('button','button',[node('span',null)]), props: ['variant'] };
  const s = scoreStructural(g, r).score;
  assert.ok(s > 0 && s < 100, `expected partial, got ${s}`);
});

test('prop-surface overlap contributes (Jaccard)', () => {
  const g = { tree: node('div',null), props: ['a','b'] };
  const r = { tree: node('div',null), props: ['a','c'] };
  const s = scoreStructural(g, r, { treeWeight: 0, propWeight: 1 });
  assert.equal(s.score, 33);
});
