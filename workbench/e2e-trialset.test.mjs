import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { aggregateTrialset } from './analyze/aggregate-trialset.mjs';
import { buildReport } from './report/build-report.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fx = join(here, 'fixtures', 'trialset-mini');

test('two fixture runs → trialset → trial report.md + dashboard.html', () => {
  const runs = ['run-atom.json', 'run-page.json'].map(f => JSON.parse(readFileSync(join(fx, f), 'utf8')));
  const ts = aggregateTrialset({ trialId: 'heroui', runs,
    comparisons: { coldWarm: { coldRunId: 'r6', warmRunId: 'r2' } } });
  assert.equal(ts.rungs.length, 2);
  assert.deepEqual(ts.accuracyByRung, [{ rung: 'atom', composite: 95 }, { rung: 'page', composite: 40 }]);
  assert.equal(ts.comparisons.coldWarm.tokenDeltaPct, -89); // (100-900)/900

  const out = mkdtempSync(join(tmpdir(), 'wb-ts-e2e-'));
  const p = join(out, 'trialset.json');
  writeFileSync(p, JSON.stringify(ts, null, 2));
  buildReport(p, '2026-06-03T00:00:00Z');
  assert.ok(existsSync(join(out, 'report.md')));
  assert.ok(existsSync(join(out, 'dashboard.html')));
  assert.match(readFileSync(join(out, 'report.md'), 'utf8'), /Accuracy by ladder rung/);
});
