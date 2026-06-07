// workbench/analyze/otel-report.mjs
// OpenTelemetry reporting: roll the per-rung agent telemetry (already extracted
// from events/spans) into cost- and token-centric views for the dashboard.
// Pure: takes the aggregated rungs[] (each with .agents), returns report objects.

const TOK_KEYS = ['input', 'output', 'thinkingEst', 'cacheRead', 'cacheCreation', 'total'];
const zeroTokens = () => Object.fromEntries(TOK_KEYS.map((k) => [k, 0]));
const msOf = (t) => (typeof t === 'number' ? t : t?.sumDuration ?? 0);
const ttftOf = (t) => (typeof t === 'number' ? 0 : t?.ttftAvg ?? 0);
const round4 = (n) => Math.round((n + Number.EPSILON) * 10000) / 10000;

// Per-rung token consumption — a measurable, not a 0..100 score (lower is better).
export function rungTokenConsumption(agents = []) {
  const tok = zeroTokens();
  const byAgent = [];
  for (const a of agents) {
    for (const k of TOK_KEYS) tok[k] += a.tokens?.[k] ?? 0;
    byAgent.push({ agent: a.agent, total: a.tokens?.total ?? 0 });
  }
  byAgent.sort((x, y) => y.total - x.total);
  return { ...tok, byAgent };
}

// Per-rung cost to build (USD), summed from OTEL costUsd.
export function rungCost(agents = []) {
  let usd = 0;
  const byAgent = [];
  for (const a of agents) {
    usd += a.costUsd ?? 0;
    byAgent.push({ agent: a.agent, usd: round4(a.costUsd ?? 0) });
  }
  byAgent.sort((x, y) => y.usd - x.usd);
  return { usd: round4(usd), byAgent };
}

export function tokensByRung(rungs = []) {
  return rungs.map((r) => ({ rung: r.rung, label: r.label ?? r.rung, tier: r.tier, ...rungTokenConsumption(r.agents) }));
}

export function costByRung(rungs = []) {
  return rungs.map((r) => ({ rung: r.rung, label: r.label ?? r.rung, tier: r.tier, ...rungCost(r.agents) }));
}

// Full OTEL report: per-agent (tokens + cost + request-weighted ttft + time),
// per-rung totals, grand totals, cost-dominant agent, and the costs.jsonl cross-check.
export function buildOtelReport(rungs = [], crossCheck = { otelTotalTokens: 0, costsJsonlTotalTokens: 0 }) {
  const byAgent = new Map();
  for (const r of rungs) {
    for (const a of r.agents || []) {
      let row = byAgent.get(a.agent);
      if (!row) { row = { agent: a.agent, requests: 0, tokens: zeroTokens(), costUsd: 0, timeMs: 0, _ttftSum: 0, _ttftN: 0 }; byAgent.set(a.agent, row); }
      row.requests += a.requests ?? 0;
      for (const k of TOK_KEYS) row.tokens[k] += a.tokens?.[k] ?? 0;
      row.costUsd += a.costUsd ?? 0;
      row.timeMs += msOf(a.timeMs);
      const reqs = a.requests ?? 0;
      row._ttftSum += ttftOf(a.timeMs) * reqs;
      row._ttftN += reqs;
    }
  }
  const perAgent = [...byAgent.values()].map((r) => ({
    agent: r.agent,
    requests: r.requests,
    tokens: r.tokens,
    costUsd: round4(r.costUsd),
    timeMs: r.timeMs,
    ttftAvgMs: r._ttftN ? Math.round(r._ttftSum / r._ttftN) : 0,
  })).sort((a, b) => b.costUsd - a.costUsd);

  const perRung = rungs.map((r) => {
    const t = rungTokenConsumption(r.agents);
    const c = rungCost(r.agents);
    return { rung: r.rung, label: r.label ?? r.rung, tier: r.tier, tokens: t.total, costUsd: c.usd, requests: (r.agents || []).reduce((s, a) => s + (a.requests ?? 0), 0) };
  });

  const totals = {
    tokens: perRung.reduce((s, r) => s + r.tokens, 0),
    costUsd: round4(perRung.reduce((s, r) => s + r.costUsd, 0)),
    requests: perRung.reduce((s, r) => s + r.requests, 0),
  };
  const costDominantAgent = perAgent.length ? perAgent[0].agent : null;

  const base = crossCheck.costsJsonlTotalTokens || 0;
  const deltaPct = base ? Math.round(((crossCheck.otelTotalTokens - base) / base) * 100) : 0;

  return { perAgent, perRung, totals, costDominantAgent, crossCheck: { ...crossCheck, deltaPct } };
}
