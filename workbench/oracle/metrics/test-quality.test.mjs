import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storyVariantCoverage, coveragePct, mutationScore } from './test-quality.mjs';

test('storyVariantCoverage = stories/variants, null without variant data', () => {
  assert.equal(storyVariantCoverage({ storyCount: 2 }).score, null);
  assert.equal(storyVariantCoverage({ storyCount: 3, variantCount: 4 }).score, 75);
  assert.equal(storyVariantCoverage({ storyCount: 0, variantCount: 0 }).score, 100);
  assert.equal(storyVariantCoverage({ storyCount: 9, variantCount: 4 }).score, 100); // capped at 1
});

test('coveragePct is gated — null without a coverage summary', () => {
  assert.equal(coveragePct(null).score, null);
  assert.equal(coveragePct({ total: { lines: { pct: 87.4 } } }).score, 87);
});

test('mutationScore is gated — null without a Stryker report', () => {
  assert.equal(mutationScore(null).score, null);
  assert.equal(mutationScore({ mutationScore: 62.5 }).score, 63);
});
