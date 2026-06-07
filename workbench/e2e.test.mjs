import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildResults } from './analyze/build-results.mjs';
import { buildReport } from './report/build-report.mjs';

const here = dirname(fileURLToPath(import.meta.url));

test('fixtures → results.json → report.md + dashboard.html', () => {
  const trial = join(here, 'fixtures', 'trial-mini');
  const results = buildResults(trial);
  const out = mkdtempSync(join(tmpdir(), 'wb-e2e-'));
  const resultsPath = join(out, 'results.json');
  writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  buildReport(resultsPath, '2026-06-02T12:00:00Z');
  assert.ok(existsSync(join(out, 'report.md')));
  assert.ok(existsSync(join(out, 'dashboard.html')));
  assert.match(readFileSync(join(out, 'report.md'), 'utf8'), /component-builder/);
});
