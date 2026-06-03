import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreComponent } from './score-component.mjs';

test('scoreComponent runs four scorers and composes', async () => {
  const bundle = {
    generated: { image: { width: 1, height: 1, data: [0,0,0,255] }, style: { color: 'rgb(0,0,0)' }, dom: { tree: { tag: 'button', role: 'button' }, props: ['variant'] } },
    oracle:    { image: { width: 1, height: 1, data: [0,0,0,255] }, style: { color: 'rgb(0,0,0)' }, dom: { tree: { tag: 'button', role: 'button' }, props: ['variant'] } },
  };
  const acc = await scoreComponent(bundle, {
    weights: { visual: 0.35, style: 0.30, structural: 0.20, gates: 0.15, buildFailCeiling: 20 },
    runGate: async () => ({ ok: true }),
  });
  assert.equal(acc.composite, 100);
  assert.equal(acc.visual.score, 100);
  assert.equal(acc.gates.build, true);
});
