// workbench/oracle/quality-compose.mjs
// Compose the 3-vote quality scorecard per scored rung: median per dimension
// (judgePanel) blended with metric sub-scores (quality-weights.blend), then
// composeQuality. Writes run.quality into each <runId>/results.json. Mirrors
// scoreBoth's quality half (fidelity already written by run-accuracy.mjs).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { RUNG_MAP, RUNG_TO_RUNID } from './rung-map.mjs';
import { judgePanel } from './judge.mjs';
import { scoreDimensions, DIMS } from './quality/dimensions.mjs';
import { composeQuality } from './quality-score.mjs';

const TRIAL = process.env.TRIAL || 'workbench/trials/heroui-20260606';
const QW = JSON.parse(readFileSync(new URL('./quality-weights.json', import.meta.url), 'utf8'));
const PREP = '/tmp/judge-heroui';
const metrics = JSON.parse(readFileSync(join(PREP, 'metrics.json'), 'utf8'));

for (const rung of Object.keys(RUNG_MAP)) {
  const sub = metrics[rung].sub;
  // build judge panel per dimension from 3 votes
  const votes = [];
  for (const n of [1, 2, 3]) {
    const f = join(PREP, `${rung}.v${n}.json`);
    if (!existsSync(f)) throw new Error(`missing vote ${f}`);
    votes.push(JSON.parse(readFileSync(f, 'utf8')));
  }
  const judges = {};
  for (const d of DIMS) {
    judges[d] = judgePanel(votes.map((v) => ({ score: v[d].score, rationale: v[d].rationale })));
  }
  const dims = scoreDimensions(sub, judges, QW.blend);
  const quality = composeQuality(dims, QW.dimensions);

  const runId = RUNG_TO_RUNID[rung];
  const p = join(TRIAL, runId, 'results.json');
  const json = JSON.parse(readFileSync(p, 'utf8'));
  json.runs[0].quality = quality;
  writeFileSync(p, JSON.stringify(json, null, 2));
  console.log(rung.padEnd(18), 'quality', String(quality.composite).padStart(3),
    '| dims', DIMS.map((d) => `${d}:${dims[d].score}(m${dims[d].metric}/j${dims[d].judge.score})`).join(' '));
}
