// workbench/runner/check-env.mjs
// Preflight: assert the live session was launched with the full OTEL telemetry
// env (telemetryEnv from env.mjs). Telemetry can only be configured BEFORE
// Claude Code launches, and a partially-set env fails silently — runs complete
// but capture nothing. This turns that into a hard, immediate failure.
//
// Usage: node workbench/runner/check-env.mjs <trialDir>
// Exits 0 if every expected var matches process.env; 1 (with a diff) otherwise.

import { resolve, join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { telemetryEnv } from './env.mjs';

// OTEL_LOG_RAW_API_BODIES is a `file:<path>` pointer; compare by resolved path
// so an absolute export and a relative trialDir don't spuriously mismatch.
function normalize(key, val) {
  if (val == null) return val;
  if (key === 'OTEL_LOG_RAW_API_BODIES') return resolve(val.replace(/^file:/, ''));
  return val;
}

export function checkEnv(env, trialDir) {
  const expected = telemetryEnv({ trialDir });
  const missing = [];
  const mismatched = [];
  for (const [k, want] of Object.entries(expected)) {
    const got = env[k];
    if (got == null || got === '') { missing.push(k); continue; }
    if (normalize(k, got) !== normalize(k, want)) mismatched.push({ key: k, want, got });
  }
  return { ok: missing.length === 0 && mismatched.length === 0, missing, mismatched, expected };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const trialDir = process.argv[2];
  if (!trialDir) { console.error('usage: check-env.mjs <trialDir>'); process.exit(1); }
  const { ok, missing, mismatched, expected } = checkEnv(process.env, trialDir);

  // Leave a proof artifact recording that verification happened. Claude Code's
  // Bash tool strips OTEL_*-prefixed vars from its subprocess env, so a plain
  // `echo $OTEL_*` in a tool call is blind. Two ways to see the truth anyway:
  //   1. This file — written by the node process the sourced shell launches
  //      directly, which sees the real values (records var NAMES only, no values).
  //   2. workbench/runner/show-otel-env.sh — recovers the live VALUES on demand
  //      from the parent `claude` process via `ps eww` (verified working on darwin;
  //      the OTEL_* vars are inherited by claude, just not by its bash children).
  const proof = {
    verifiedAt: new Date().toISOString(),
    ok,
    varsExpected: Object.keys(expected).length,
    varsSet: Object.keys(expected).length - missing.length,
    missing,
    mismatched: mismatched.map((m) => m.key),
    pid: process.pid,
    ppid: process.ppid,
  };
  try {
    writeFileSync(join(trialDir, '.env-proof.json'), JSON.stringify(proof, null, 2) + '\n');
  } catch (e) {
    console.error(`   (could not write .env-proof.json: ${e.message})`);
  }

  if (ok) {
    console.error(`✔  OTEL telemetry env complete (${Object.keys(expected).length} vars set).`);
    process.exit(0);
  }
  console.error('✖  OTEL telemetry env incomplete — runs would capture NOTHING.\n');
  for (const k of missing) console.error(`   missing:    ${k}=${expected[k]}`);
  for (const m of mismatched) console.error(`   mismatched: ${m.key} → want "${m.want}", got "${m.got}"`);
  console.error('\n   This env must be exported BEFORE launching Claude Code (see RUNBOOK-live §4).');
  console.error('   It cannot be set mid-session. Exit, export the full block, relaunch.');
  process.exit(1);
}
