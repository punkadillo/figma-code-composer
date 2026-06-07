import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildResults } from './build-results.mjs';

test('buildResults passes rung + tier from the manifest onto the run row', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wb-rung-'));
  writeFileSync(join(dir, 'run-manifest.json'), JSON.stringify({
    trialId: 't', runs: [{
      runId: 'atom', rung: 'atom', tier: 'trivial', command: '/figma-build x',
      scenario: { icon: false, tier: 'trivial' },
      startedAt: '2026-06-03T10:00:00Z', endedAt: '2026-06-03T10:00:05Z',
    }],
  }));
  const r = buildResults(dir);
  assert.equal(r.runs[0].rung, 'atom');
  assert.equal(r.runs[0].tier, 'trivial');
  assert.equal(r.runs[0].wallMs, 5000);
});

test('buildResults defaults rung null and tier from scenario when not top-level', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wb-rung2-'));
  writeFileSync(join(dir, 'run-manifest.json'), JSON.stringify({
    trialId: 't', runs: [{ runId: 'x', command: 'c', scenario: { tier: 'moderate' } }],
  }));
  const r = buildResults(dir);
  assert.equal(r.runs[0].rung, null);
  assert.equal(r.runs[0].tier, 'moderate');
});
