// oracle/run-accuracy.mjs
// IO driver: per scored rung, compute the accuracy sub-scores available and
// write results into trials/.../<runId>/results.json runs[0].accuracy.
// P1: structural (source parse) + gates (from results.json). P2 (--render)
// adds visual+style from the Storybook harness.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractStructural } from './extract-structural.mjs';
import { scoreStructural } from './score-structural.mjs';
import { scoreGates } from './score-gates.mjs';
import { assembleAccuracy } from './assemble-accuracy.mjs';
import { scoreVisual } from './score-visual.mjs';
import { scoreStyle } from './score-style.mjs';
import { decodePng } from './png.mjs';
import { RUNG_MAP, RUNG_TO_RUNID, scoredRungs } from './rung-map.mjs';

const TRIAL = process.env.TRIAL || 'trials/heroui-20260603';
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
  for (const r of scoredRungs()) {
    const runId = RUNG_TO_RUNID[r.rung];
    const { p, json } = readResults(runId);
    const run = json.runs[0];

    const gStruct = extractStructural(readFileSync(join(TRIAL, r.targetTsx), 'utf8'));
    const oStruct = extractStructural(readFileSync(join(TRIAL, r.oracleTsx), 'utf8'));
    const structural = scoreStructural(gStruct, oStruct);

    const gates = await scoreGates({ runGate: runGateFor(run.gates), gates: ['typecheck', 'build', 'tests'] });

    let visual = null, style = null;
    if (render && shots && r.hasOracleStory) {
      try {
        const t = await shots.targetShot(r);
        const o = await shots.oracleShot(r);
        visual = scoreVisual(decodePng(t.pngBuffer), decodePng(o.pngBuffer));
        style = scoreStyle(t.style, o.style);
      } catch (e) {
        console.error(`[accuracy] ${r.rung} render failed, marking visual/style unavailable: ${e.message}`);
      }
    }

    run.accuracy = assembleAccuracy({ visual, style, structural, gates }, WEIGHTS);
    writeFileSync(p, JSON.stringify(json, null, 2));
    console.error(`[accuracy] ${r.rung}: composite ${run.accuracy.composite} (visual ${visual ? visual.score : '—'}, style ${style ? style.matchRate : '—'}, structural ${structural.score})`);
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
  await runAccuracy({ render, shots });
  if (shots) await shots.close();
}
