// workbench/analyze/efficiency.mjs
// Pipeline-efficiency metrics, derived entirely from telemetry already captured
// per rung (no new instrumentation): wall-clock latency, prompt-cache hit ratio,
// tool-call count, request-weighted TTFT, and cost/token-per-accuracy-point
// composites. Pure: takes the aggregated rung object(s).

const round4 = (n) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const msOf = (t) => (typeof t === 'number' ? 0 : t?.ttftAvg ?? 0); // ttft lives on rung-agent timeMs objects

export function rungEfficiency(r) {
  const agents = r.agents || [];
  const sum = (f) => agents.reduce((s, a) => s + (f(a) || 0), 0);
  const tokens = sum((a) => a.tokens?.total);
  const cacheRead = sum((a) => a.tokens?.cacheRead);
  const cost = sum((a) => a.costUsd);
  const toolUses = sum((a) => a.toolUses);
  const requests = sum((a) => a.requests);
  const ttftWeighted = agents.reduce((s, a) => s + msOf(a.timeMs) * (a.requests || 0), 0);

  const acc = r.accuracy?.composite ?? null; // null when unscored / unscorable
  return {
    latencyMs: r.wallMs ?? null,
    cacheHitRatio: tokens ? Math.round((cacheRead / tokens) * 1000) / 1000 : 0,
    toolUses,
    requests,
    ttftAvgMs: requests ? Math.round(ttftWeighted / requests) : 0,
    cost: round4(cost),
    tokens,
    costPerAccuracyPoint: acc ? round4(cost / acc) : null,
    tokensPerAccuracyPoint: acc ? Math.round(tokens / acc) : null,
  };
}

export function efficiencyByRung(rungs = []) {
  return rungs.map((r) => ({ rung: r.rung, label: r.label ?? r.rung, tier: r.tier, ...rungEfficiency(r) }));
}
