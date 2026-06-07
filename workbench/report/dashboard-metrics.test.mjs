import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTrialsetDashboard } from './dashboard.mjs';

const ts = {
  trialId: 'heroui', generatedAt: null, comparisons: {},
  accuracyByRung: [{ rung: 'trivial-button', composite: 80 }], qualityByRung: [],
  rollup: { perAgent: [{ agent: 'component-builder', tokens: { total: 6000 }, timeMs: 10, costUsd: 0.12 }],
    dominance: { tokens: 'component-builder', time: 'component-builder', byTier: {} },
    crossCheck: { otelTotalTokens: 6000, costsJsonlTotalTokens: 6000, deltaPct: 0 } },
  tokensByRung: [{ rung: 'trivial-button', tier: 'trivial', total: 1000, output: 400, cacheRead: 500, cacheCreation: 100 }],
  costByRung: [{ rung: 'trivial-button', tier: 'trivial', usd: 0.02 }],
  otelReport: {
    perAgent: [{ agent: 'component-builder', requests: 8, tokens: { total: 6000, output: 2000 }, costUsd: 0.12, ttftAvgMs: 73 }],
    perRung: [{ rung: 'trivial-button', tier: 'trivial', costUsd: 0.02, tokens: 1000 }],
    totals: { tokens: 6000, costUsd: 0.12, requests: 8 }, costDominantAgent: 'component-builder',
    crossCheck: { otelTotalTokens: 6000, costsJsonlTotalTokens: 6000, deltaPct: 0 },
  },
  rungs: [{
    rung: 'trivial-button', tier: 'trivial', runId: 'r1', icon: false, agents: [], fanIn: [],
    a11y: { score: 90, violationCount: 1, nodeCount: 2, violations: [] },
    headless: { score: 75, signals: { controlledProps: true, statelessValue: true, hookExtraction: false, forwardRef: true, sideEffectDiscipline: true } },
    cwv: { score: 88, lcp: { ms: 1200 }, cls: { value: 0.01 }, tbt: { ms: 30 } },
  }],
};

test('dashboard renders all five new metric panels + OTEL report', () => {
  const html = renderTrialsetDashboard(ts);
  assert.match(html, /Token consumption by rung/);
  assert.match(html, /Cost to build by rung/);
  assert.match(html, /Accessibility by rung/);
  assert.match(html, /Stateless &amp; Headless by rung/);
  assert.match(html, /Core Web Vitals by rung/);
  assert.match(html, /OpenTelemetry report/);
});

test('dashboard shows the cost-dominant KPI', () => {
  const html = renderTrialsetDashboard(ts);
  assert.match(html, /Cost-dominant/);
  assert.match(html, /by OTEL costUsd/);
});

test('dashboard stays self-contained (no external assets)', () => {
  const html = renderTrialsetDashboard(ts);
  assert.match(html, /<!doctype html>/i);
  assert.doesNotMatch(html, /src=["']https?:/);
});

test('dashboard shows a pending note when a new metric is unscored', () => {
  const pendingTs = { ...ts, rungs: [{ rung: 'x', tier: 'trivial', agents: [], fanIn: [] }] };
  const html = renderTrialsetDashboard(pendingTs);
  assert.match(html, /Pending — re-score/);
});

test('dashboard renders Static code-health, Design tokens, DOM & render, Process meta panels', () => {
  const ext = {
    ...ts,
    processMeta: { reuseRate: { score: null, reason: 'no-resolution-data' }, updateDiffSize: { score: null }, retryRate: { score: null }, hitlGateCount: { score: null }, tierRoutingAccuracy: { score: null }, promptInjectionResistance: { score: null } },
    buildMetrics: { circularDeps: { score: 100, cycleCount: 0, nodes: 9 }, bundleSize: { score: null }, lintConformance: { score: null } },
    rungs: [{
      ...ts.rungs[0],
      codeHealth: { typeStrictness: { score: 100 }, complexity: { score: 90 }, cssHygiene: { score: 100 }, dangerousApi: { score: 100 }, serverClientBoundary: { score: 100 }, rtlReadiness: { score: 100 }, commentEconomy: { score: 100 }, composability: { score: 80 }, namingAdherence: { score: 100 }, propTypeCompleteness: { score: 100 } },
      tokenSystem: { semanticAliasRatio: 0.5, orphanRefs: 1, coverage: null },
      domShape: { score: 100, nodeCount: 5, maxDepth: 3 },
      renderSignals: { score: 100, focusVisible: true, keyboardReached: '2/2' },
      runtimePerf: { score: 100, mountMs: 30 },
    }],
  };
  const html = renderTrialsetDashboard(ext);
  assert.match(html, /Static code-health by rung/);
  assert.match(html, /Design tokens by rung/);
  assert.match(html, /DOM &amp; render by rung/);
  assert.match(html, /Process &amp; build meta/);
});

test('dashboard renders Token binding + Efficiency panels with data', () => {
  const ext = {
    ...ts,
    rungs: [{ ...ts.rungs[0], tokenBinding: { score: 92, literals: 1, boundRefs: 4, samples: ['#fff'] } }],
    efficiencyByRung: [{ rung: 'trivial-button', label: 'trivial-button', tier: 'trivial', latencyMs: 42000, cacheHitRatio: 0.7, toolUses: 12, ttftAvgMs: 40, costPerAccuracyPoint: 0.002, tokensPerAccuracyPoint: 100 }],
  };
  const html = renderTrialsetDashboard(ext);
  assert.match(html, /Token binding by rung/);
  assert.match(html, /Efficiency by rung/);
  assert.match(html, /70%/);          // cache-hit
});
