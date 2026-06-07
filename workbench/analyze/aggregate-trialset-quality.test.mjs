import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateTrialset } from './aggregate-trialset.mjs';

const mk = (runId, rung, composite, quality) => ({
  trialId: 'heroui', generatedAt: null,
  runs: [{ runId, rung, tier: 'trivial', scenario: { icon: false, tier: 'trivial' }, command: 'x', wallMs: 1,
    agents: [{ agent: 'component-builder', model: 'opus', tokens: { input:1,output:0,thinkingEst:0,cacheRead:0,cacheCreation:0,total:1 }, timeMs:{sumDuration:1,wallSpan:1,ttftAvg:1}, toolUses:1, costUsd:0 }],
    fanIn: [], accuracy: { composite }, quality }],
  rollup: { perAgent: [], dominance: { tokens:'component-builder', time:'component-builder', byTier:{} }, crossCheck:{otelTotalTokens:1,costsJsonlTotalTokens:1,deltaPct:0} },
});

test('aggregateTrialset collects qualityByRung alongside accuracyByRung', () => {
  const ts = aggregateTrialset({ trialId: 'heroui', runs: [
    mk('r2','atom',95,{ composite: 88 }),
    mk('r6','page',40,{ composite: 30 }),
  ] });
  assert.deepEqual(ts.accuracyByRung, [{ rung:'atom', label:'atom', composite:95 }, { rung:'page', label:'page', composite:40 }]);
  assert.deepEqual(ts.qualityByRung, [{ rung:'atom', label:'atom', composite:88 }, { rung:'page', label:'page', composite:30 }]);
});

test('qualityByRung tolerates a run with no quality (composite null)', () => {
  const ts = aggregateTrialset({ trialId: 'heroui', runs: [ mk('r2','atom',95,undefined) ] });
  assert.deepEqual(ts.qualityByRung, [{ rung:'atom', label:'atom', composite: null }]);
});
