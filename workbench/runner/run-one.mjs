// workbench/runner/run-one.mjs
// Operator convenience: one command per trial run. Starts the OTLP receiver
// pointed at the run dir, prints the exact slash command to paste into the
// Claude session, waits for you to press Enter when the run completes, stamps
// the run window into run-manifest.json, waits for the final telemetry flush,
// then stops the receiver. Thin IO orchestration — the testable logic lives in
// run-manifest-builder.mjs (window→manifest) and collector/receiver.mjs.
//
// Usage: node workbench/runner/run-one.mjs <trialDir> <runId> [port]
//   e.g. node workbench/runner/run-one.mjs workbench/trials/heroui-20260603 atom

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { startReceiver } from '../collector/receiver.mjs';
import { buildRunManifest } from './run-manifest-builder.mjs';

const FLUSH_MS = 8000; // let the last OTEL batch (2-5s interval) land before closing

const [trialDir, runId, portArg] = process.argv.slice(2);
if (!trialDir || !runId) {
  console.error('usage: run-one.mjs <trialDir> <runId> [port]');
  process.exit(1);
}
const port = portArg ? Number(portArg) : 4318;
const cfg = JSON.parse(readFileSync(join(trialDir, 'ladder-nodes.json'), 'utf8'));
const runDir = join(trialDir, runId);
mkdirSync(runDir, { recursive: true });

// Preview the command (window stamped for real after Enter).
const preview = buildRunManifest(cfg, runId, '', '').runs[0];

const server = await startReceiver({ port, outDir: runDir });
const startedAt = new Date().toISOString();

console.error(`\n▶  receiver up on :${port}  →  ${runDir}`);
console.error(`   run "${runId}" (${preview.rung}/${preview.tier})`);
console.error(`\n   In the Claude session, run:\n     ${preview.command}\n`);
console.error('   When Claude prints ✅ for this run, press Enter here to stamp + stop.');

const rl = createInterface({ input: stdin, output: stdout });
await rl.question('');
rl.close();

const endedAt = new Date().toISOString();
const manifest = buildRunManifest(cfg, runId, startedAt, endedAt);
writeFileSync(join(runDir, 'run-manifest.json'), JSON.stringify(manifest, null, 2));
console.error(`\n   stamped run-manifest.json (${startedAt} → ${endedAt})`);
console.error(`   waiting ${FLUSH_MS / 1000}s for the final telemetry flush…`);

await new Promise((r) => setTimeout(r, FLUSH_MS));
await new Promise((r) => server.close(r));

for (const f of ['events.jsonl', 'metrics.jsonl', 'spans.jsonl']) {
  const p = join(runDir, f);
  const lines = existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean).length : 0;
  const kb = existsSync(p) ? (statSync(p).size / 1024).toFixed(1) : '0.0';
  console.error(`   ${f}: ${lines} records (${kb} KB)`);
}
console.error(`\n✔  "${runId}" captured. Start the next run with its runId.\n`);
