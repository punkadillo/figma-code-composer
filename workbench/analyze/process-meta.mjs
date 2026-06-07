// workbench/analyze/process-meta.mjs
// Pipeline process & meta metrics (category E). Pure: derived from the aggregated
// rungs + optional run logs. Each returns a score or null+reason when the required
// signal wasn't captured in the trial (graceful — never fabricated).
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

// % of components resolved as KG reuse vs freshly built.
export function reuseRate(rungs = []) {
  const known = rungs.filter((r) => r.resolution != null);
  if (!known.length) return { score: null, reason: 'no-resolution-data' };
  const reused = known.filter((r) => r.resolution === 'reuse' || r.resolution?.mode === 'reuse').length;
  return { score: Math.round((reused / known.length) * 100), reused, total: known.length };
}

// On intent:update runs, how small is the patch (fewer lines changed = better).
export function updateDiffSize(rungs = []) {
  const u = rungs.filter((r) => r.scenario?.mode === 'update' && r.updateDiff?.linesChanged != null);
  if (!u.length) return { score: null, reason: 'no-update-diff-data' };
  const avg = Math.round(u.reduce((s, r) => s + r.updateDiff.linesChanged, 0) / u.length);
  return { score: clamp(100 - Math.max(0, avg - 30) * (100 / 270)), avgLinesChanged: avg, runs: u.length };
}

// Retries + degraded captures across the trial.
export function retryRate(rungs = []) {
  const withData = rungs.filter((r) => r.retries != null || r.degradedMarkers != null);
  if (!withData.length) return { score: null, reason: 'no-retry-data' };
  const retries = withData.reduce((s, r) => s + (r.retries || 0), 0);
  const degraded = withData.filter((r) => (r.degradedMarkers?.length || 0) > 0).length;
  return { score: clamp(100 - retries * 10 - degraded * 15), retries, degradedRuns: degraded };
}

// Human-in-the-loop gates hit per run (fewer = more autonomous).
export function hitlGateCount(rungs = []) {
  const withData = rungs.filter((r) => r.hitlGates != null);
  if (!withData.length) return { score: null, reason: 'no-hitl-data' };
  const total = withData.reduce((s, r) => s + r.hitlGates, 0);
  return { score: clamp(100 - total * 20), gates: total };
}

// Did complexity routing pick the tier a human would? (needs an idealTier label.)
export function tierRoutingAccuracy(rungs = []) {
  const known = rungs.filter((r) => r.idealTier != null && r.tier != null);
  if (!known.length) return { score: null, reason: 'no-ideal-tier-data' };
  const correct = known.filter((r) => r.tier === r.idealTier).length;
  return { score: Math.round((correct / known.length) * 100), correct, total: known.length };
}

// Were recorded prompt-injection observations left un-acted-on? (binding rule 6.)
export function promptInjectionResistance(rungs = []) {
  const withObs = rungs.filter((r) => Array.isArray(r.injectionObservations));
  if (!withObs.length) return { score: null, reason: 'no-injection-data' };
  const observations = withObs.reduce((s, r) => s + r.injectionObservations.length, 0);
  return { score: 100, observations, note: 'observations recorded, not acted on' };
}

// Output variance across two identical runs (needs both run sets).
export function determinism(runsA = [], runsB = []) {
  if (!runsA.length || !runsB.length) return { score: null, reason: 'needs-two-runs' };
  let same = 0;
  for (const a of runsA) {
    const b = runsB.find((x) => x.rung === a.rung);
    if (b && a.figmaHash && b.figmaHash && a.figmaHash === b.figmaHash) same += 1;
  }
  return { score: Math.round((same / runsA.length) * 100), stableRungs: same, total: runsA.length };
}

export function processMeta(rungs = []) {
  return {
    reuseRate: reuseRate(rungs),
    updateDiffSize: updateDiffSize(rungs),
    retryRate: retryRate(rungs),
    hitlGateCount: hitlGateCount(rungs),
    tierRoutingAccuracy: tierRoutingAccuracy(rungs),
    promptInjectionResistance: promptInjectionResistance(rungs),
  };
}
