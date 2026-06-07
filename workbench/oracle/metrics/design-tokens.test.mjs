import { test } from 'node:test';
import assert from 'node:assert/strict';
import { designTokenMetrics } from './design-tokens.mjs';

const css = `
:root { --color-primary: #3b82f6; --space-2: 8px; }
.semantic { --surface-fg: var(--color-primary); --surface-bg: var(--color-bg); }
`;

test('counts emitted defs and computes semantic alias ratio', () => {
  const r = designTokenMetrics({ tokenCss: css });
  assert.equal(r.emittedCount, 4);
  // 2 alias via var(), 2 literal → ratio 0.5
  assert.equal(r.semanticAliasRatio, 0.5);
  assert.equal(r.semanticScore, 50);
});

test('coverage is null without a needed-count, computed with one', () => {
  assert.equal(designTokenMetrics({ tokenCss: css }).coverage, null);
  assert.equal(designTokenMetrics({ tokenCss: css, neededCount: 8 }).coverage, 50); // 4/8
});

test('flags orphan var() refs not defined in tokens', () => {
  const r = designTokenMetrics({ tokenCss: css, componentSrcs: ['color: var(--color-primary); gap: var(--nope)'] });
  assert.equal(r.orphanRefs, 1);
  assert.ok(r.orphanScore < 100);
});
