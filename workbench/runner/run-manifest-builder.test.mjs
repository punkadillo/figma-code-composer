import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRunManifest } from './run-manifest-builder.mjs';

const cfg = {
  trialId: 'heroui-20260603',
  runs: [
    { runId: 'atom', rung: 'atom', tier: 'trivial', nodeId: '5375:69211', name: 'Button', command: 'figma-build', cache: 'cold', mode: 'build', icon: false },
    { runId: 'all-icons', rung: 'all-icons', tier: 'complex', nodeId: '5375:72355', name: 'Alert', command: 'figma-build', cache: 'cold', mode: 'build', icon: true },
    { runId: 'molecule-update', rung: 'molecule', tier: 'moderate', nodeId: '17293:26222', name: 'Input (update)', command: 'figma-update', cache: 'warm', mode: 'update', icon: false },
  ],
};

test('buildRunManifest produces a single-run manifest for the matched runId', () => {
  const m = buildRunManifest(cfg, 'atom', '2026-06-03T10:00:00Z', '2026-06-03T10:02:30Z');
  assert.equal(m.trialId, 'heroui-20260603');
  assert.equal(m.runs.length, 1);
  const r = m.runs[0];
  assert.equal(r.runId, 'atom');
  assert.equal(r.rung, 'atom');
  assert.equal(r.tier, 'trivial');
  assert.equal(r.nodeId, '5375:69211');
  assert.equal(r.startedAt, '2026-06-03T10:00:00Z');
  assert.equal(r.endedAt, '2026-06-03T10:02:30Z');
  assert.deepEqual(r.scenario, { icon: false, tier: 'trivial', cache: 'cold', mode: 'build' });
});

test('buildRunManifest derives the figma command string per run', () => {
  const fileKey = 'qGjFwr9ZWpLk8xsgskwEHe';
  const build = buildRunManifest(cfg, 'atom', 'a', 'b', fileKey).runs[0];
  assert.match(build.command, /^\/figma-build /);
  assert.match(build.command, /5375[:-]69211/);
  const upd = buildRunManifest(cfg, 'molecule-update', 'a', 'b', fileKey).runs[0];
  assert.match(upd.command, /^\/figma-update /);
});

test('buildRunManifest carries the icon flag for the icon-bearing rung', () => {
  const r = buildRunManifest(cfg, 'all-icons', 'a', 'b').runs[0];
  assert.equal(r.scenario.icon, true);
});

test('buildRunManifest throws on an unknown runId', () => {
  assert.throws(() => buildRunManifest(cfg, 'nope', 'a', 'b'), /unknown runId/i);
});
