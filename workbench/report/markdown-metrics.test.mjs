import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTrialsetMarkdown } from './markdown.mjs';

const base = {
  trialId: 'heroui', generatedAt: '2026-06-07T00:00:00Z',
  comparisons: {},
  rollup: { perAgent: [], dominance: { tokens: 'component-builder', time: 'component-builder', byTier: {} }, crossCheck: { otelTotalTokens: 6000, costsJsonlTotalTokens: 6000, deltaPct: 0 } },
  accuracyByRung: [], qualityByRung: [],
  otelReport: {
    perAgent: [{ agent: 'component-builder', requests: 8, tokens: { total: 6000, output: 2000 }, costUsd: 0.12, ttftAvgMs: 73 }],
    perRung: [{ rung: 'trivial-button', tier: 'trivial', costUsd: 0.02, tokens: 1000 }],
    totals: { tokens: 6000, costUsd: 0.12, requests: 8 }, costDominantAgent: 'component-builder',
    crossCheck: { otelTotalTokens: 6000, costsJsonlTotalTokens: 6000, deltaPct: 0 },
  },
  rungs: [{
    rung: 'trivial-button', tier: 'trivial', runId: 'r1', icon: false, agents: [], fanIn: [],
    a11y: { score: 90, violationCount: 1, nodeCount: 2, violations: [{ id: 'color-contrast', impact: 'serious', nodes: 2 }] },
    headless: { score: 75, signals: { controlledProps: true, statelessValue: true, hookExtraction: false, forwardRef: true, sideEffectDiscipline: true } },
    cwv: { score: 88, lcp: { ms: 1200 }, cls: { value: 0.01 }, tbt: { ms: 30 } },
  }],
};

test('markdown renders Accessibility table with score + top issue', () => {
  const md = renderTrialsetMarkdown(base);
  assert.match(md, /Accessibility by rung \(axe-core\)/);
  assert.match(md, /color-contrast \(serious\)/);
  assert.match(md, /\| trivial-button \| 90 \|/);
});

test('markdown renders Stateless & Headless table with signal marks', () => {
  const md = renderTrialsetMarkdown(base);
  assert.match(md, /Stateless & Headless by rung/);
  assert.match(md, /\| trivial-button \| 75 \| ✓ \| ✓ \| ✗ \| ✓ \| ✓ \|/);
});

test('markdown renders Core Web Vitals table', () => {
  const md = renderTrialsetMarkdown(base);
  assert.match(md, /Core Web Vitals by rung/);
  assert.match(md, /\| trivial-button \| 88 \| 1200 \| 0\.01 \| 30 \|/);
});

test('markdown renders the OpenTelemetry report section', () => {
  const md = renderTrialsetMarkdown(base);
  assert.match(md, /## OpenTelemetry report/);
  assert.match(md, /Cost-dominant agent:\*\* component-builder/);
  assert.match(md, /Cost to build by rung/);
  assert.match(md, /ttft avg \(ms\)/);
});

test('markdown omits the new sections when no data (legacy trialset)', () => {
  const legacy = { ...base, otelReport: undefined, efficiencyByRung: undefined, rungs: [{ rung: 'x', tier: 'trivial', agents: [], fanIn: [] }] };
  const md = renderTrialsetMarkdown(legacy);
  assert.doesNotMatch(md, /Accessibility by rung/);
  assert.doesNotMatch(md, /Core Web Vitals by rung/);
  assert.doesNotMatch(md, /## OpenTelemetry report/);
  assert.doesNotMatch(md, /Token binding by rung/);
  assert.doesNotMatch(md, /Efficiency by rung/);
});

test('markdown renders Token binding + Efficiency tables', () => {
  const ext = {
    ...base,
    rungs: [{ ...base.rungs[0], tokenBinding: { score: 92, literals: 1, boundRefs: 4, samples: ['#fff'] } }],
    efficiencyByRung: [{ rung: 'trivial-button', label: 'trivial-button', tier: 'trivial', latencyMs: 42000, cacheHitRatio: 0.7, toolUses: 12, ttftAvgMs: 40, costPerAccuracyPoint: 0.002, tokensPerAccuracyPoint: 100 }],
  };
  const md = renderTrialsetMarkdown(ext);
  assert.match(md, /## Token binding by rung/);
  assert.match(md, /\| trivial-button \| 92 \| 1 \| 4 \| #fff \|/);
  assert.match(md, /## Efficiency by rung/);
  assert.match(md, /70%/);            // cache-hit ratio rendered as %
  assert.match(md, /0\.0020/);        // $/acc-pt
});
