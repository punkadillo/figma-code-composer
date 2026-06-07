import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildReport } from './build-report.mjs';

test('buildReport writes report.md and dashboard.html beside results.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wb-rep-'));
  const resultsPath = join(dir, 'results.json');
  writeFileSync(resultsPath, JSON.stringify({
    trialId: 'demo', generatedAt: null, runs: [],
    rollup: { perAgent: [{ agent: 'x', tokens: { total: 1, input: 1, output: 0, thinkingEst: 0, cacheRead: 0, cacheCreation: 0 }, timeMs: 0, costUsd: 0 }],
      dominance: { tokens: 'x', time: 'x', byTier: {} }, crossCheck: { otelTotalTokens: 1, costsJsonlTotalTokens: 1, deltaPct: 0 } },
  }));
  buildReport(resultsPath, '2026-06-02T12:00:00Z');
  assert.ok(existsSync(join(dir, 'report.md')));
  assert.ok(existsSync(join(dir, 'dashboard.html')));
  assert.match(readFileSync(join(dir, 'report.md'), 'utf8'), /Workbench Report — demo/);
});
