import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateTrialset } from './aggregate-trialset.mjs';

const agent = (name, total, costUsd, requests = 1) => ({
  agent: name, model: 'opus',
  tokens: { input: total, output: 0, thinkingEst: 0, cacheRead: 0, cacheCreation: 0, total },
  timeMs: { sumDuration: 100, wallSpan: 100, ttftAvg: 20 }, toolUses: 1, costUsd, requests,
});

const runRes = (runId, rung, tier, agents, extra = {}) => ({
  trialId: 'reference', runs: [{ runId, rung, tier, scenario: { tier }, agents, fanIn: [], accuracy: { composite: 80 }, ...extra }],
});

test('aggregateTrialset derives per-rung tokenConsumption + cost from agents', () => {
  const ts = aggregateTrialset({ trialId: 'reference', runs: [
    runRes('r1', 'trivial-button', 'trivial', [agent('component-builder', 1000, 0.02), agent('figma-fetcher', 200, 0.005)]),
  ] });
  const r = ts.rungs[0];
  assert.equal(r.tokenConsumption.total, 1200);
  assert.equal(r.tokenConsumption.byAgent[0].agent, 'component-builder');
  assert.equal(r.cost.usd, 0.025);
});

test('aggregateTrialset carries a11y / headless / cwv from the run (null when absent)', () => {
  const ts = aggregateTrialset({ trialId: 'reference', runs: [
    runRes('r1', 'trivial-button', 'trivial', [agent('component-builder', 1000, 0.02)], {
      a11y: { score: 90, violationCount: 1, nodeCount: 2, violations: [] },
      headless: { score: 75, signals: { controlledProps: true, statelessValue: true, hookExtraction: false, forwardRef: true, sideEffectDiscipline: true } },
      cwv: { score: 88, lcp: { ms: 1200 }, cls: { value: 0 }, tbt: { ms: 30 } },
    }),
    runRes('r2', 'complex-card', 'complex', [agent('component-builder', 5000, 0.1)]), // legacy: no new metrics
  ] });
  assert.equal(ts.rungs[0].a11y.score, 90);
  assert.equal(ts.rungs[0].headless.score, 75);
  assert.equal(ts.rungs[0].cwv.score, 88);
  assert.equal(ts.rungs[1].a11y, null);
  assert.equal(ts.rungs[1].headless, null);
  assert.equal(ts.rungs[1].cwv, null);
});

test('rungs sharing a base name get disambiguated labels (cold/warm/update)', () => {
  const inputRun = (runId, cache, mode) => ({
    trialId: 'reference',
    runs: [{ runId, rung: 'moderate-input', tier: 'moderate', scenario: { tier: 'moderate', cache, mode }, agents: [agent('component-builder', 100, 0.01)], fanIn: [], accuracy: { composite: 80 } }],
  });
  const ts = aggregateTrialset({ trialId: 'reference', runs: [
    inputRun('moderate-input-cold', 'cold', 'build'),
    inputRun('moderate-input-warm', 'warm', 'build'),
    inputRun('moderate-input-update', 'warm', 'update'),
  ] });
  assert.deepEqual(ts.rungs.map((r) => r.label), [
    'moderate-input (cold)', 'moderate-input (warm)', 'moderate-input (update)',
  ]);
  // derived display arrays carry the disambiguated label too
  assert.deepEqual(ts.accuracyByRung.map((r) => r.label), [
    'moderate-input (cold)', 'moderate-input (warm)', 'moderate-input (update)',
  ]);
  assert.equal(ts.tokensByRung[1].label, 'moderate-input (warm)');
  assert.equal(ts.otelReport.perRung[2].label, 'moderate-input (update)');
});

test('a unique rung name keeps its plain label (no variant suffix)', () => {
  const ts = aggregateTrialset({ trialId: 'reference', runs: [
    runRes('trivial-button', 'trivial-button', 'trivial', [agent('component-builder', 100, 0.01)]),
  ] });
  assert.equal(ts.rungs[0].label, 'trivial-button');
});

test('aggregateTrialset emits tokensByRung, costByRung and an otelReport', () => {
  const ts = aggregateTrialset({ trialId: 'reference', runs: [
    runRes('r1', 'trivial-button', 'trivial', [agent('component-builder', 1000, 0.02, 3)]),
    runRes('r2', 'complex-card', 'complex', [agent('component-builder', 5000, 0.1, 5)]),
  ] });
  assert.equal(ts.tokensByRung.length, 2);
  assert.equal(ts.tokensByRung[1].total, 5000);
  assert.equal(ts.costByRung[0].usd, 0.02);
  assert.equal(ts.otelReport.totals.tokens, 6000);
  assert.equal(ts.otelReport.totals.costUsd, 0.12);
  assert.equal(ts.otelReport.costDominantAgent, 'component-builder');
  assert.equal(ts.otelReport.perRung.length, 2);
});

test('aggregateTrialset carries tokenBinding + derives efficiency (latency/cache-hit/per-acc-pt)', () => {
  const withCache = (name, total, cacheRead, costUsd, requests) => ({
    agent: name, model: 'opus',
    tokens: { input: total - cacheRead, output: 0, thinkingEst: 0, cacheRead, cacheCreation: 0, total },
    timeMs: { sumDuration: 100, wallSpan: 100, ttftAvg: 40 }, toolUses: 12, costUsd, requests,
  });
  const ts = aggregateTrialset({ trialId: 'reference', runs: [{
    trialId: 'reference',
    runs: [{ runId: 'r1', rung: 'complex-card', tier: 'complex', scenario: { tier: 'complex' },
      wallMs: 42000, agents: [withCache('component-builder', 1000, 700, 0.10, 5)], fanIn: [],
      accuracy: { composite: 50 }, tokenBinding: { score: 92, literals: 1, boundRefs: 4, samples: ['#fff'] } }],
  }] });
  const r = ts.rungs[0];
  assert.equal(r.tokenBinding.score, 92);
  assert.equal(r.efficiency.latencyMs, 42000);
  assert.equal(r.efficiency.cacheHitRatio, 0.7);
  assert.equal(r.efficiency.toolUses, 12);
  assert.equal(r.efficiency.costPerAccuracyPoint, 0.002); // 0.10 / 50
  assert.equal(ts.efficiencyByRung[0].rung, 'complex-card');
});

test('aggregateTrialset carries codeHealth/tokenSystem/dom/render/perf + trial meta', () => {
  const ts = aggregateTrialset({ trialId: 'reference', runs: [{
    trialId: 'reference',
    runs: [{ runId: 'r1', rung: 'trivial-button', tier: 'trivial', scenario: { tier: 'trivial' },
      wallMs: 1000, agents: [agent('component-builder', 100, 0.01)], fanIn: [], accuracy: { composite: 80 },
      codeHealth: { typeStrictness: { score: 100 }, complexity: { score: 90 } },
      tokenSystem: { semanticAliasRatio: 0.5, orphanRefs: 0, coverage: null, semanticScore: 50, orphanScore: 100 },
      domShape: { score: 100, nodeCount: 5, maxDepth: 3 },
      renderSignals: { score: 100, focusVisible: true, keyboardReached: '2/2' },
      runtimePerf: { score: 100, mountMs: 30 },
      importEdges: ['Icon'] }],
  }] });
  const r = ts.rungs[0];
  assert.equal(r.codeHealth.typeStrictness.score, 100);
  assert.equal(r.tokenSystem.semanticAliasRatio, 0.5);
  assert.equal(r.domShape.nodeCount, 5);
  assert.equal(r.renderSignals.focusVisible, true);
  assert.equal(r.runtimePerf.mountMs, 30);
  // trial-level meta present (mostly null-with-reason for a data-less trial)
  assert.ok('reuseRate' in ts.processMeta);
  assert.equal(ts.processMeta.reuseRate.score, null);
  assert.equal(ts.buildMetrics.circularDeps.score, 100); // no cycle: Icon not a rung node
  assert.equal(ts.buildMetrics.bundleSize.score, null);  // gated
});

test('aggregateTrialset leaves tokenBinding null on a legacy run', () => {
  const ts = aggregateTrialset({ trialId: 'reference', runs: [
    runRes('r1', 'trivial-button', 'trivial', [agent('component-builder', 1000, 0.02)]),
  ] });
  assert.equal(ts.rungs[0].tokenBinding, null);
  assert.equal(ts.rungs[0].efficiency.cacheHitRatio, 0); // no cacheRead in fixture
});
