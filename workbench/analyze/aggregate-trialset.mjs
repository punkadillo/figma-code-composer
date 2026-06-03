// workbench/analyze/aggregate-trialset.mjs
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { buildRollup } from './aggregate.mjs';

const runTokens = (run) => run.agents.reduce((s, a) => s + a.tokens.total, 0);
const blockedFor = (rungs, rungName) => {
  const r = rungs.find((x) => x.rung === rungName);
  const f = r && r.fanIn && r.fanIn[0];
  return f ? f.blockedMs : 0;
};
const tokensForRun = (rungs, runId) => {
  const r = rungs.find((x) => x.runId === runId);
  return r ? runTokens(r) : 0;
};
const pctDelta = (from, to) => (from ? Math.round(((to - from) / from) * 100) : 0);

// input: { trialId, runs: [singleRunResults...], comparisons?: {...} }
export function aggregateTrialset({ trialId, runs, comparisons = {} }) {
  const rungs = runs.map((res, i) => {
    const run = res.runs && res.runs[0];
    if (!run) throw new Error(`aggregateTrialset: input ${i} (trialId=${res.trialId ?? '?'}) has no runs[0] — expected one single-run results.json per file`);
    return {
      rung: run.rung, tier: run.tier, runId: run.runId, icon: !!(run.scenario && run.scenario.icon),
      agents: run.agents, fanIn: run.fanIn, accuracy: run.accuracy, quality: run.quality,
    };
  });

  const out = { trialId, generatedAt: null, rungs, comparisons: {}, rollup: null, accuracyByRung: [] };

  out.accuracyByRung = rungs.map((r) => ({ rung: r.rung, composite: r.accuracy ? r.accuracy.composite : null }));
  out.qualityByRung = rungs.map((r) => ({ rung: r.rung, composite: r.quality ? r.quality.composite : null }));

  const rollupRuns = rungs.map((r) => ({ agents: r.agents, scenario: { tier: r.tier } }));
  const otelTotal = rungs.reduce((s, r) => s + runTokens(r), 0);
  out.rollup = buildRollup(rollupRuns, { otelTotalTokens: otelTotal, costsJsonlTotalTokens: otelTotal });

  if (comparisons.iconFanIn) {
    const { withIconsRung, controlRung } = comparisons.iconFanIn;
    out.comparisons.iconFanIn = {
      withIconsRung, controlRung,
      blockedMsDelta: blockedFor(rungs, withIconsRung) - blockedFor(rungs, controlRung),
    };
  }
  if (comparisons.coldWarm) {
    const { coldRunId, warmRunId } = comparisons.coldWarm;
    out.comparisons.coldWarm = { coldRunId, warmRunId,
      tokenDeltaPct: pctDelta(tokensForRun(rungs, coldRunId), tokensForRun(rungs, warmRunId)) };
  }
  if (comparisons.buildUpdate) {
    const { buildRunId, updateRunId } = comparisons.buildUpdate;
    out.comparisons.buildUpdate = { buildRunId, updateRunId,
      tokenDeltaPct: pctDelta(tokensForRun(rungs, buildRunId), tokensForRun(rungs, updateRunId)) };
  }
  return out;
}

// CLI: node aggregate-trialset.mjs <out.json> <run1.json> <run2.json> ... [--comparisons comparisons.json]
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const ci = args.indexOf('--comparisons');
  const comparisons = ci >= 0 ? JSON.parse(readFileSync(args[ci + 1], 'utf8')) : {};
  const positional = ci >= 0 ? args.slice(0, ci) : args;
  const [outFile, ...runFiles] = positional;
  if (!outFile || runFiles.length === 0) { console.error('usage: aggregate-trialset.mjs <out.json> <run...json> [--comparisons c.json]'); process.exit(1); }
  const runs = runFiles.filter(existsSync).map((f) => JSON.parse(readFileSync(f, 'utf8')));
  const ts = aggregateTrialset({ trialId: runs[0]?.trialId ?? 'trial', runs, comparisons });
  writeFileSync(outFile, JSON.stringify(ts, null, 2));
  console.error(`[trialset] wrote ${outFile} (${ts.rungs.length} rungs)`);
}
