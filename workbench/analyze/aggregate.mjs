// workbench/analyze/aggregate.mjs
// Join events + spans + thinking estimate into per-agent rows, fan-in gaps,
// and a cross-run rollup. nanos are BigInt; we convert ns→ms as Number.

const nsToMs = (ns) => Number(ns / 1000000n);

// events: see otlp.extractApiRequestEvents; spans: otlp.extractLlmSpans
// thinkingByAgent: Map<agent, est>; toolUsesByAgent: optional Map<agent, n>
export function aggregateRun(events, spans, thinkingByAgent = new Map(), toolUsesByAgent = new Map()) {
  const byAgent = new Map();
  for (const e of events) {
    if (!e.agent) continue;
    let r = byAgent.get(e.agent);
    if (!r) {
      r = { agent: e.agent, model: e.model, requests: 0,
        tokens: { input: 0, output: 0, thinkingEst: 0, cacheRead: 0, cacheCreation: 0, total: 0 },
        timeMs: { sumDuration: 0, wallSpan: 0, ttftAvg: 0 }, toolUses: 0, costUsd: 0 };
      byAgent.set(e.agent, r);
    }
    r.requests += 1;
    r.tokens.input += e.inputTokens;
    r.tokens.output += e.outputTokens;
    r.tokens.cacheRead += e.cacheReadTokens;
    r.tokens.cacheCreation += e.cacheCreationTokens;
    r.timeMs.sumDuration += e.durationMs;
    r.costUsd += e.costUsd;
  }
  // span-derived wall-span + ttft average, grouped by querySource
  const spanByAgent = new Map();
  for (const s of spans) {
    if (!s.querySource) continue;
    let g = spanByAgent.get(s.querySource);
    if (!g) { g = { minStart: s.startNs, maxEnd: s.endNs, ttftSum: 0, n: 0 }; spanByAgent.set(s.querySource, g); }
    if (s.startNs !== null && (g.minStart === null || s.startNs < g.minStart)) g.minStart = s.startNs;
    if (s.endNs !== null && (g.maxEnd === null || s.endNs > g.maxEnd)) g.maxEnd = s.endNs;
    g.ttftSum += s.ttftMs; g.n += 1;
  }
  for (const r of byAgent.values()) {
    r.tokens.thinkingEst = thinkingByAgent.get(r.agent) || 0;
    r.tokens.total = r.tokens.input + r.tokens.output + r.tokens.cacheRead + r.tokens.cacheCreation;
    r.toolUses = toolUsesByAgent.get(r.agent) || 0;
    const g = spanByAgent.get(r.agent);
    if (g && g.minStart !== null && g.maxEnd !== null) {
      r.timeMs.wallSpan = nsToMs(g.maxEnd - g.minStart);
      r.timeMs.ttftAvg = g.n ? Math.round(g.ttftSum / g.n) : 0;
    }
  }
  return [...byAgent.values()];
}

// Blocking = max(0, iconGeneratorEnd - componentBuilderEnd). [] if no icon span.
export function fanInBlocking(spans) {
  const iconEnds = spans.filter(s => s.querySource === 'icon-generator' && s.endNs !== null).map(s => s.endNs);
  const compEnds = spans.filter(s => s.querySource === 'component-builder' && s.endNs !== null).map(s => s.endNs);
  if (iconEnds.length === 0) return [];
  const iconEnd = iconEnds.reduce((m, v) => (v > m ? v : m));
  const compEnd = compEnds.length ? compEnds.reduce((m, v) => (v > m ? v : m)) : 0n;
  const diff = iconEnd - compEnd;
  return [{ iconEndNs: iconEnd.toString(), componentEndNs: compEnd.toString(), blockedMs: diff > 0n ? nsToMs(diff) : 0 }];
}

function sumAgentTokens(a) { return a.tokens.total; }

export function buildRollup(runs, crossCheckTotals = { otelTotalTokens: 0, costsJsonlTotalTokens: 0 }) {
  const perAgent = new Map();
  for (const run of runs)
    for (const a of run.agents) {
      let r = perAgent.get(a.agent);
      if (!r) { r = { agent: a.agent, tokens: { input: 0, output: 0, thinkingEst: 0, cacheRead: 0, cacheCreation: 0, total: 0 }, timeMs: 0, costUsd: 0 }; perAgent.set(a.agent, r); }
      for (const k of Object.keys(r.tokens)) r.tokens[k] += a.tokens[k];
      r.timeMs += a.timeMs.sumDuration;
      r.costUsd += a.costUsd;
    }
  const perAgentArr = [...perAgent.values()];
  const dominantBy = (arr, metric) => arr.length ? arr.reduce((m, x) => (metric(x) > metric(m) ? x : m)).agent : null;
  const byTier = {};
  const tiers = [...new Set(runs.map(r => r.scenario && r.scenario.tier).filter(Boolean))];
  for (const tier of tiers) {
    const tierAgents = new Map();
    for (const run of runs.filter(r => r.scenario && r.scenario.tier === tier))
      for (const a of run.agents) tierAgents.set(a.agent, (tierAgents.get(a.agent) || 0) + a.tokens.total);
    let top = null, max = -1;
    for (const [agent, tot] of tierAgents) if (tot > max) { max = tot; top = agent; }
    byTier[tier] = { tokens: top };
  }
  const base = crossCheckTotals.costsJsonlTotalTokens || 0;
  const deltaPct = base ? Math.round(((crossCheckTotals.otelTotalTokens - base) / base) * 100) : 0;
  return {
    perAgent: perAgentArr,
    dominance: {
      tokens: dominantBy(perAgentArr, sumAgentTokens),
      time: dominantBy(perAgentArr, a => a.timeMs),
      byTier,
    },
    crossCheck: { ...crossCheckTotals, deltaPct },
  };
}
