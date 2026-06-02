import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { buildResults } from './build-results.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const trial = join(here, '..', 'fixtures', 'trial-mini');

test('buildResults assembles a results.json object from a trial dir', () => {
  const results = buildResults(trial);
  assert.equal(results.trialId, 'mini');
  assert.equal(results.runs.length, 1);
  const run = results.runs[0];
  assert.equal(run.runId, 'r1');
  assert.equal(run.wallMs, 12000);
  const cb = run.agents.find(a => a.agent === 'component-builder');
  assert.equal(cb.tokens.input, 200);
  assert.equal(cb.tokens.total, 305);
  assert.equal(run.fanIn[0].blockedMs, 2);
  assert.equal(run.accuracy, null);
  assert.equal(results.rollup.dominance.tokens, 'component-builder');
});

test('buildResults throws on a multi-run trial dir (Plan 1 single-run guard)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wb-multi-'));
  writeFileSync(join(dir, 'run-manifest.json'), JSON.stringify({ trialId: 'multi', runs: [
    { runId: 'a', startedAt: '2026-06-02T10:00:00Z', endedAt: '2026-06-02T10:00:01Z' },
    { runId: 'b', startedAt: '2026-06-02T10:00:01Z', endedAt: '2026-06-02T10:00:02Z' },
  ] }));
  assert.throws(() => buildResults(dir), /multi-run/);
});
