import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reuseRate, updateDiffSize, retryRate, tierRoutingAccuracy, promptInjectionResistance, determinism, processMeta } from './process-meta.mjs';

test('reuseRate from resolution markers (null when absent)', () => {
  assert.equal(reuseRate([{ rung: 'a' }]).score, null);
  assert.equal(reuseRate([{ resolution: 'reuse' }, { resolution: 'build-main' }]).score, 50);
});

test('updateDiffSize rewards small patches; null without update runs', () => {
  assert.equal(updateDiffSize([{ scenario: { mode: 'build' } }]).score, null);
  const r = updateDiffSize([{ scenario: { mode: 'update' }, updateDiff: { linesChanged: 30 } }]);
  assert.equal(r.score, 100);
  assert.equal(r.avgLinesChanged, 30);
});

test('retryRate penalizes retries + degraded runs', () => {
  assert.equal(retryRate([]).score, null);
  const r = retryRate([{ retries: 1, degradedMarkers: [] }, { retries: 0, degradedMarkers: ['x'] }]);
  assert.ok(r.score < 100 && r.retries === 1 && r.degradedRuns === 1);
});

test('tierRoutingAccuracy compares tier vs idealTier', () => {
  assert.equal(tierRoutingAccuracy([{ tier: 'a' }]).score, null);
  assert.equal(tierRoutingAccuracy([{ tier: 'x', idealTier: 'x' }, { tier: 'y', idealTier: 'z' }]).score, 50);
});

test('promptInjectionResistance = 100 when observations recorded', () => {
  assert.equal(promptInjectionResistance([]).score, null);
  assert.equal(promptInjectionResistance([{ injectionObservations: ['rm -rf'] }]).score, 100);
});

test('determinism needs two run sets', () => {
  assert.equal(determinism([], []).score, null);
  const a = [{ rung: 'x', figmaHash: 'h' }];
  assert.equal(determinism(a, [{ rung: 'x', figmaHash: 'h' }]).score, 100);
});

test('processMeta bundles all sub-metrics (null on a data-less trial)', () => {
  const pm = processMeta([{ rung: 'x', tier: 'trivial' }]);
  for (const k of ['reuseRate', 'updateDiffSize', 'retryRate', 'hitlGateCount', 'tierRoutingAccuracy', 'promptInjectionResistance']) assert.ok(k in pm);
  assert.equal(pm.reuseRate.score, null);
});
