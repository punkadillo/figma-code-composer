import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
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
