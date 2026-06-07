import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateTrialset } from './aggregate-trialset.mjs';

const mk = (runId, rung, tier, icon, tokens, blockedMs, composite) => ({
  trialId: 'heroui', generatedAt: null,
  runs: [{ runId, rung, tier, scenario: { icon, tier }, command: `/figma-build ${rung}`,
    wallMs: 1000, agents: [{ agent: 'component-builder', model: 'opus',
      tokens: { input: tokens, output: 0, thinkingEst: 0, cacheRead: 0, cacheCreation: 0, total: tokens },
      timeMs: { sumDuration: 100, wallSpan: 100, ttftAvg: 10 }, toolUses: 1, costUsd: 0.1 }],
    fanIn: blockedMs == null ? [] : [{ iconEndNs: '0', componentEndNs: '0', blockedMs }],
    accuracy: { composite } }],
  rollup: { perAgent: [], dominance: { tokens: 'component-builder', time: 'component-builder', byTier: {} },
    crossCheck: { otelTotalTokens: tokens, costsJsonlTotalTokens: tokens, deltaPct: 0 } },
});

test('aggregateTrialset builds per-rung rows + accuracyByRung', () => {
  const ts = aggregateTrialset({
    trialId: 'heroui',
    runs: [ mk('r2','atom','trivial',false,100,null,95), mk('r6','page','extreme',false,900,null,40) ],
  });
  assert.equal(ts.trialId, 'heroui');
  assert.equal(ts.rungs.length, 2);
  assert.deepEqual(ts.accuracyByRung, [{ rung: 'atom', label: 'atom', composite: 95 }, { rung: 'page', label: 'page', composite: 40 }]);
  assert.equal(ts.rollup.dominance.tokens, 'component-builder');
});

test('iconFanIn comparison subtracts control blockedMs from with-icons rung', () => {
  const ts = aggregateTrialset({
    trialId: 'heroui',
    runs: [ mk('r4','organism','complex',false,200,0,80), mk('r7','all-icons','complex',true,260,12,70) ],
    comparisons: { iconFanIn: { withIconsRung: 'all-icons', controlRung: 'organism' } },
  });
  assert.equal(ts.comparisons.iconFanIn.blockedMsDelta, 12);
});

test('coldWarm + buildUpdate token deltas computed from named runs', () => {
  const ts = aggregateTrialset({
    trialId: 'heroui',
    runs: [ mk('cold','molecule','moderate',false,200,null,80), mk('warm','molecule','moderate',false,150,null,80),
            mk('upd','molecule','moderate',false,90,null,80) ],
    comparisons: {
      coldWarm: { coldRunId: 'cold', warmRunId: 'warm' },
      buildUpdate: { buildRunId: 'cold', updateRunId: 'upd' },
    },
  });
  assert.equal(ts.comparisons.coldWarm.tokenDeltaPct, -25);
  assert.equal(ts.comparisons.buildUpdate.tokenDeltaPct, -55);
});
