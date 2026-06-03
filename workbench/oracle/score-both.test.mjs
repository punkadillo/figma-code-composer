import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreBoth } from './score-both.mjs';

const bundle = {
  generated: {
    image: { width: 1, height: 1, data: [0,0,0,255] }, style: { color: 'rgb(0,0,0)' },
    dom: { tree: { tag: 'button', role: 'button' }, props: ['variant'] },
    artifacts: {
      component: `interface Props { variant: string }\nexport function B(p: Props){ return null; }`,
      stories: `export const Default = {};\nexport const Disabled = {};`,
      tests: `test('a',()=>{}); test('b',()=>{});`,
      docs: `# B\nDocs here explaining usage of the button component thoroughly.\n| prop | type |\n|---|---|`,
    },
  },
  oracle: {
    image: { width: 1, height: 1, data: [0,0,0,255] }, style: { color: 'rgb(0,0,0)' },
    dom: { tree: { tag: 'button', role: 'button' }, props: ['variant'] },
  },
};

test('scoreBoth returns both fidelity and quality scorecards', async () => {
  const res = await scoreBoth(bundle, {
    fidelityWeights: { visual: 0.35, style: 0.30, structural: 0.20, gates: 0.15, buildFailCeiling: 20 },
    runGate: async () => ({ ok: true }),
    qualityWeights: {
      dimensions: { optimizedCode: 0.25, dx: 0.20, docs: 0.15, testDepth: 0.25, storybook: 0.15 },
      blend: { optimizedCode:{metricWeight:0.5,judgeWeight:0.5}, dx:{metricWeight:0.5,judgeWeight:0.5}, docs:{metricWeight:0.5,judgeWeight:0.5}, testDepth:{metricWeight:0.5,judgeWeight:0.5}, storybook:{metricWeight:0.5,judgeWeight:0.5} },
    },
    judgeFor: async () => ({ score: 70, rationale: 'ok' }),
    judgeVotes: 3,
  });
  assert.equal(res.fidelity.composite, 100);
  assert.ok(res.quality.composite > 0 && res.quality.composite <= 100);
  assert.equal(res.quality.dimensions.dx.judge.score, 70);
  assert.equal(res.quality.dimensions.dx.judge.rationales.length, 3);
});
