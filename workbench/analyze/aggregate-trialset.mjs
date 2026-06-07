// workbench/analyze/aggregate-trialset.mjs
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { buildRollup } from './aggregate.mjs';
import { rungTokenConsumption, rungCost, tokensByRung, costByRung, buildOtelReport } from './otel-report.mjs';
import { rungEfficiency, efficiencyByRung } from './efficiency.mjs';

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
      scenario: run.scenario ?? null, wallMs: run.wallMs ?? null,
      agents: run.agents, fanIn: run.fanIn, accuracy: run.accuracy, quality: run.quality, gates: run.gates ?? null,
      // New per-rung tracks. token/cost/efficiency are derived from OTEL agents (present
      // for every trial); a11y/headless/cwv/tokenBinding come from the oracle re-score.
      tokenConsumption: rungTokenConsumption(run.agents),
      cost: rungCost(run.agents),
      a11y: run.a11y ?? null,
      headless: run.headless ?? null,
      cwv: run.cwv ?? null,
      tokenBinding: run.tokenBinding ?? null,
    };
  });

  // Disambiguate rungs that share a base name (e.g. the moderate-input cold / warm /
  // update scenarios) so the dashboard shows distinct rows. Unique rungs keep their
  // plain name; the variant comes from scenario (mode=update → "update", else cache),
  // falling back to the runId suffix.
  const nameCounts = {};
  for (const r of rungs) nameCounts[r.rung] = (nameCounts[r.rung] || 0) + 1;
  const variantOf = (r) => {
    if (r.scenario?.mode === 'update') return 'update';
    if (r.scenario?.cache) return r.scenario.cache; // cold | warm
    if (r.runId && r.runId.startsWith(`${r.rung}-`)) return r.runId.slice(r.rung.length + 1);
    return null;
  };
  for (const r of rungs) {
    const v = nameCounts[r.rung] > 1 ? variantOf(r) : null;
    r.label = v ? `${r.rung} (${v})` : r.rung;
  }

  const out = { trialId, generatedAt: null, rungs, comparisons: {}, rollup: null, accuracyByRung: [] };

  out.accuracyByRung = rungs.map((r) => ({ rung: r.rung, label: r.label, composite: r.accuracy ? r.accuracy.composite : null }));
  out.qualityByRung = rungs.map((r) => ({ rung: r.rung, label: r.label, composite: r.quality ? r.quality.composite : null }));

  const rollupRuns = rungs.map((r) => ({ agents: r.agents, scenario: { tier: r.tier } }));
  const otelTotal = rungs.reduce((s, r) => s + runTokens(r), 0);
  out.rollup = buildRollup(rollupRuns, { otelTotalTokens: otelTotal, costsJsonlTotalTokens: otelTotal });

  // OTEL report (cost/token/latency views) + per-rung token & cost ladders.
  out.tokensByRung = tokensByRung(rungs);
  out.costByRung = costByRung(rungs);
  out.otelReport = buildOtelReport(rungs, { otelTotalTokens: otelTotal, costsJsonlTotalTokens: otelTotal });

  // Efficiency — telemetry-derived (latency, cache-hit, tool-calls, ttft, cost/token
  // per accuracy point). Attached per rung and surfaced as a ladder.
  for (const r of rungs) r.efficiency = rungEfficiency(r);
  out.efficiencyByRung = efficiencyByRung(rungs);

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
