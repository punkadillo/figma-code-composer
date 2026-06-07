import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildReport } from './build-report.mjs';

test('buildReport renders trialset inputs via the trialset renderers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wb-ts-'));
  const p = join(dir, 'trialset.json');
  writeFileSync(p, JSON.stringify({
    trialId: 'reference', generatedAt: null, rungs: [], comparisons: {},
    rollup: { perAgent: [], dominance: { tokens: 'x', time: 'x', byTier: {} }, crossCheck: { otelTotalTokens: 0, costsJsonlTotalTokens: 0, deltaPct: 0 } },
    accuracyByRung: [{ rung: 'atom', composite: 95 }],
  }));
  buildReport(p, '2026-06-03T00:00:00Z');
  assert.ok(existsSync(join(dir, 'report.md')));
  assert.ok(existsSync(join(dir, 'dashboard.html')));
  assert.match(readFileSync(join(dir, 'report.md'), 'utf8'), /Workbench Trial Report — reference/);
});
