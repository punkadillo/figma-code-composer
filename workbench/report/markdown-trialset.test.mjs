import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTrialsetMarkdown } from './markdown.mjs';

const ts = {
  trialId: 'heroui', generatedAt: '2026-06-03T00:00:00Z',
  rungs: [
    { rung: 'atom', tier: 'trivial', runId: 'r2', icon: false, agents: [], fanIn: [], accuracy: { composite: 95, cappedAt: null, visual: { score: 98 }, style: { matchRate: 96 }, structural: { score: 90 }, gates: { typecheck: true, build: true, tests: true, a11y: true } } },
    { rung: 'page', tier: 'extreme', runId: 'r6', icon: false, agents: [], fanIn: [], accuracy: { composite: 20, cappedAt: 20, visual: { score: 50 }, style: { matchRate: 45 }, structural: { score: 30 }, gates: { typecheck: true, build: false, tests: false, a11y: true } } },
  ],
  comparisons: {
    iconFanIn: { withIconsRung: 'all-icons', controlRung: 'organism', blockedMsDelta: 12 },
    coldWarm: { coldRunId: 'cold', warmRunId: 'warm', tokenDeltaPct: -25 },
    buildUpdate: { buildRunId: 'b', updateRunId: 'u', tokenDeltaPct: -55 },
  },
  rollup: { perAgent: [], dominance: { tokens: 'component-builder', time: 'component-builder', byTier: {} }, crossCheck: { otelTotalTokens: 1, costsJsonlTotalTokens: 1, deltaPct: 0 } },
  accuracyByRung: [{ rung: 'atom', composite: 95 }, { rung: 'page', composite: 20 }],
};

test('renderTrialsetMarkdown shows ladder accuracy and comparisons', () => {
  const md = renderTrialsetMarkdown(ts);
  assert.match(md, /# Workbench Trial Report — heroui/);
  assert.match(md, /atom/);
  assert.match(md, /\| *95 *\|/);
  assert.match(md, /icon fan-in.*12 ?ms/is);
  assert.match(md, /cold.*warm.*-25%/is);
  assert.match(md, /build.*update.*-55%/is);
});

test('renderTrialsetMarkdown flags a capped rung', () => {
  const md = renderTrialsetMarkdown(ts);
  assert.match(md, /capped/i);   // the page rung was build-capped at 20
});

test('renderTrialsetMarkdown emits a per-rung cost ladder and cross-check', () => {
  const tsCost = {
    ...ts,
    rungs: [
      { ...ts.rungs[0], agents: [{ requests: 10, tokens: { total: 1000, output: 200, cacheRead: 700, cacheCreation: 100 }, timeMs: 5000, costUsd: 1.25 }] },
      { ...ts.rungs[1], agents: [{ requests: 40, tokens: { total: 4000, output: 800, cacheRead: 2800, cacheCreation: 400 }, timeMs: 9000, costUsd: 4.5 }] },
    ],
    rollup: { ...ts.rollup, crossCheck: { otelTotalTokens: 5000, costsJsonlTotalTokens: 5000, deltaPct: 0 } },
  };
  const md = renderTrialsetMarkdown(tsCost);
  assert.match(md, /Cost & token ladder by rung/);
  assert.match(md, /1,000/);                 // atom total tokens
  assert.match(md, /\*\*5,000\*\*/);         // ladder total row
  assert.match(md, /1\.2500/);               // atom cost
  assert.match(md, /Cross-check \(OTEL vs costs\.jsonl\)/);
  assert.match(md, /delta: 0%/);
});

test('accuracy table splits structural into source and dom columns', () => {
  const tsS = { ...ts, rungs: [{ ...ts.rungs[0], accuracy: {
    composite: 70, cappedAt: null, visual: { score: 60 }, style: { matchRate: 50 },
    structuralSource: { score: 12 }, structuralDom: { score: 68 },
    gates: { typecheck: true, build: true, tests: true },
    availability: { visual: true, style: true, structural: true, gates: true } } }] };
  const md = renderTrialsetMarkdown(tsS);
  assert.match(md, /struct·src/);
  assert.match(md, /struct·dom/);
  assert.match(md, /\| *12 *\|/);
  assert.match(md, /\| *68 *\|/);
});

test('renderTrialsetMarkdown emits a build-gates table with per-rung pass/fail', () => {
  const tsGates = {
    ...ts,
    rungs: [
      { ...ts.rungs[0], gates: { tsc: true, build: true, tests: { passed: 17, total: 17 } } },
      { ...ts.rungs[1], gates: { tsc: true, build: true, tests: { passed: 12, total: 13 } } },
    ],
  };
  const md = renderTrialsetMarkdown(tsGates);
  assert.match(md, /Build gates by rung/);
  assert.match(md, /17\/17/);
  assert.match(md, /12\/13/);
  // atom all-pass → ✓; page rung (12/13) → ✗
  assert.match(md, /\| atom \| ✓ \| ✓ \| 17\/17 \| ✓ \|/);
  assert.match(md, /\| page \| ✓ \| ✓ \| 12\/13 \| ✗ \|/);
});
