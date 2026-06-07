// oracle/run-accuracy.mjs
// IO driver: per scored rung, compute the accuracy sub-scores available and
// write results into trials/.../<runId>/results.json runs[0].accuracy.
// P1: structural (source parse) + gates (from results.json). P2 (--render)
// adds visual+style from the Storybook harness.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { extractStructural } from './extract-structural.mjs';
import { scoreStructural } from './score-structural.mjs';
import { scoreGates } from './score-gates.mjs';
import { assembleAccuracy } from './assemble-accuracy.mjs';
import { scoreVisual } from './score-visual.mjs';
import { scoreStyle } from './score-style.mjs';
import { decodePng } from './png.mjs';
import { RUNG_MAP, RUNG_TO_RUNID, scoredRungs } from './rung-map.mjs';
import { isScorableTrial } from '../runner/run-manifest-builder.mjs';

const TRIAL = process.env.TRIAL || 'trials/heroui-20260606';
const WEIGHTS = JSON.parse(readFileSync(new URL('./weights.json', import.meta.url), 'utf8'));

const readResults = (runId) => {
  const p = join(TRIAL, runId, 'results.json');
  return { p, json: JSON.parse(readFileSync(p, 'utf8')) };
};

// runGate sourced from the gates already captured in results.json.
function runGateFor(gates) {
  return async (g) => ({
    typecheck: { ok: gates?.tsc === true },
    build: { ok: gates?.build === true },
    tests: { ok: !!(gates?.tests && gates.tests.passed === gates.tests.total) },
  }[g] ?? { ok: false });
}

export async function runAccuracy({ render = false, shots = null } = {}) {
  if (!existsSync(TRIAL)) {
    throw new Error(`[accuracy] TRIAL dir "${TRIAL}" not found. Set TRIAL=trials/<id> before scoring.`);
  }
  for (const r of scoredRungs()) {
    const runId = RUNG_TO_RUNID[r.rung];
    const { p, json } = readResults(runId);
    const run = json.runs[0];

    // Scorability guard: never score a degraded / non-MCP-reachable run (workbench RCA 06).
    const scorable = isScorableTrial({
      manifest: { reachabilityStatus: run.reachabilityStatus },
      scratchFiles: run.degradedMarkers ?? [],
      zeroByteFetcherOutput: run.zeroByteFetcherOutput ?? false,
    });
    // Strict only when the producer actually recorded reachability data; legacy captures
    // (no reachabilityStatus field, no markers) are scored with a warning, not silently skipped.
    const hasReachabilityData = run.reachabilityStatus != null
      || (run.degradedMarkers?.length ?? 0) > 0
      || run.zeroByteFetcherOutput === true;
    if (!scorable && hasReachabilityData) {
      const reason = run.reachabilityStatus === 'fail' ? 'reachabilityStatus=fail'
        : (run.degradedMarkers?.length ? `degraded markers: ${run.degradedMarkers.join(',')}` : 'zero-byte fetcher output');
      run.accuracy = { composite: null, unscorable: reason };
      writeFileSync(p, JSON.stringify(json, null, 2));
      console.error(`[accuracy] ${r.rung}: SKIPPED — non-scorable trial (${reason})`);
      continue;
    }
    if (!scorable && !hasReachabilityData) {
      console.error(`[accuracy] ${r.rung}: reachability unknown (legacy capture, no figma-manifest.json) — scoring anyway`);
    }

    const gStruct = extractStructural(readFileSync(join(TRIAL, r.targetTsx), 'utf8'));
    const oStruct = extractStructural(readFileSync(join(TRIAL, r.oracleTsx), 'utf8'));
    const structuralSource = scoreStructural(gStruct, oStruct);
    let structuralDom = null;

    const gates = await scoreGates({ runGate: runGateFor(run.gates), gates: ['typecheck', 'build', 'tests'] });

    let visual = null, style = null;
    if (render && shots && r.hasOracleStory) {
      try {
        const t = await shots.targetShot(r);
        const o = await shots.oracleShot(r);
        visual = scoreVisual(decodePng(t.pngBuffer), decodePng(o.pngBuffer));
        style = scoreStyle(t.style, o.style);
        structuralDom = scoreStructural({ tree: t.dom, props: gStruct.props }, { tree: o.dom, props: oStruct.props });
      } catch (e) {
        console.error(`[accuracy] ${r.rung} render failed, marking visual/style unavailable: ${e.message}`);
      }
    }

    run.accuracy = assembleAccuracy({ visual, style, structuralSource, structuralDom, gates }, WEIGHTS);
    writeFileSync(p, JSON.stringify(json, null, 2));
    console.error(`[accuracy] ${r.rung}: composite ${run.accuracy.composite} (visual ${visual ? visual.score : '—'}, style ${style ? style.matchRate : '—'}, struct·src ${structuralSource.score}, struct·dom ${structuralDom ? structuralDom.score : '—'})`);
  }
}

// CLI: node run-accuracy.mjs [--render]
if (import.meta.url === `file://${process.argv[1]}`) {
  const render = process.argv.includes('--render');
  let shots = null;
  if (render) {
    const { openShots } = await import('./render-harness.mjs');
    shots = await openShots();
  }
  try {
    await runAccuracy({ render, shots });
  } finally {
    if (shots) await shots.close();
  }
}
