// oracle/assemble-accuracy.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleAccuracy } from './assemble-accuracy.mjs';

const BASE = { visual: 0.35, style: 0.30, structural: 0.20, gates: 0.15, buildFailCeiling: 20 };

test('source-only structural (dom null) → source is primary; both stored', () => {
  const acc = assembleAccuracy({
    visual: null, style: null,
    structuralSource: { score: 80 }, structuralDom: null,
    gates: { typecheck: true, build: true, tests: true },
  }, BASE);
  assert.equal(acc.composite, 89);                 // structural(80)@0.571 + gates(100)@0.429
  assert.equal(acc.structural.score, 80);          // primary = source (dom null)
  assert.equal(acc.structuralSource.score, 80);
  assert.equal(acc.structuralDom, null);
  assert.deepEqual(acc.availability, { visual: false, style: false, structural: true, gates: true });
  assert.equal(acc.visual, null);
  assert.equal(acc.style, null);
});

test('structuralDom present → dom is primary in the composite', () => {
  const acc = assembleAccuracy({
    visual: { diffPct: 0, score: 60 }, style: { matchRate: 50, properties: {} },
    structuralSource: { score: 10 }, structuralDom: { score: 70 },
    gates: { typecheck: true, build: true, tests: true, a11y: true },
  }, BASE);
  // 0.35*60 + 0.30*50 + 0.20*70(dom) + 0.15*100 = 21+15+14+15 = 65
  assert.equal(acc.composite, 65);
  assert.equal(acc.structural.score, 70);
  assert.equal(acc.structuralSource.score, 10);
  assert.equal(acc.structuralDom.score, 70);
});
