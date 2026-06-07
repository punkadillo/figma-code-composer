import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundleSize, lintConformance, circularDeps } from './build-metrics.mjs';

test('bundleSize gated; scores gzipped bytes when given', () => {
  assert.equal(bundleSize(null).score, null);
  assert.equal(bundleSize(2 * 1024).score, 100);   // 2KB
  assert.equal(bundleSize(50 * 1024).score, 0);     // 50KB
});

test('lintConformance gated; penalizes errors/warnings', () => {
  assert.equal(lintConformance(null).score, null);
  assert.equal(lintConformance([{ errorCount: 0, warningCount: 0 }]).score, 100);
  assert.equal(lintConformance([{ errorCount: 2, warningCount: 1 }]).score, 100 - 23);
});

test('circularDeps = 100 for an acyclic graph', () => {
  const r = circularDeps({ Button: ['Icon'], Icon: [], Card: ['Button'] });
  assert.equal(r.score, 100);
  assert.equal(r.cycleCount, 0);
});

test('circularDeps detects a cycle', () => {
  const r = circularDeps({ A: ['B'], B: ['C'], C: ['A'] });
  assert.ok(r.cycleCount >= 1);
  assert.ok(r.score < 100);
});
