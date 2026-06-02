import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from './markdown.mjs';

const results = {
  trialId: 'demo', generatedAt: '2026-06-02T12:00:00Z',
  runs: [{
    runId: 'r1', command: '/figma-build u', scenario: { icon: true, tier: 'moderate', cache: 'cold', mode: 'build' },
    wallMs: 12000,
    agents: [{ agent: 'component-builder', model: 'claude-opus-4-8', requests: 2,
      tokens: { input: 300, output: 120, thinkingEst: 24, cacheRead: 20, cacheCreation: 5, total: 445 },
      timeMs: { sumDuration: 2200, wallSpan: 7500, ttftAvg: 250 }, toolUses: 61, costUsd: 0.3 }],
    fanIn: [{ iconEndNs: '5000000', componentEndNs: '3000000', blockedMs: 2 }],
    accuracy: null,
  }],
  rollup: {
    perAgent: [{ agent: 'component-builder', tokens: { input: 300, output: 120, thinkingEst: 24, cacheRead: 20, cacheCreation: 5, total: 445 }, timeMs: 2200, costUsd: 0.3 }],
    dominance: { tokens: 'component-builder', time: 'component-builder', byTier: { moderate: { tokens: 'component-builder' } } },
    crossCheck: { otelTotalTokens: 445, costsJsonlTotalTokens: 430, deltaPct: 3 },
  },
};

test('renderMarkdown includes title, per-agent table, dominance, fan-in, thinking-est note', () => {
  const md = renderMarkdown(results);
  assert.match(md, /# Workbench Report — demo/);
  assert.match(md, /component-builder/);
  assert.match(md, /\| *445 *\|/);
  assert.match(md, /Token-dominant agent.*component-builder/s);
  assert.match(md, /blocked.*2 ?ms/i);
  assert.match(md, /thinkingEst|estimate/i);
  assert.match(md, /accuracy.*Plan 2|pending/i);
});
