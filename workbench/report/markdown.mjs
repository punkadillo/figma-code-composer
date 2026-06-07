// workbench/report/markdown.mjs
const n = (x) => (x ?? 0).toLocaleString('en-US');

export function renderMarkdown(r) {
  const L = [];
  L.push(`# Workbench Report — ${r.trialId}`);
  L.push('');
  L.push(`> Generated: ${r.generatedAt ?? '(unstamped)'} · Runs: ${r.runs.length}`);
  L.push('');
  L.push('## Per-agent rollup (all runs)');
  L.push('');
  L.push('| agent | total | input | output | thinkingEst | cacheRead | cacheCreate | time (ms) | cost (USD) |');
  L.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const a of r.rollup.perAgent) {
    const t = a.tokens;
    L.push(`| ${a.agent} | ${n(t.total)} | ${n(t.input)} | ${n(t.output)} | ${n(t.thinkingEst)} | ${n(t.cacheRead)} | ${n(t.cacheCreation)} | ${n(a.timeMs)} | ${(a.costUsd ?? 0).toFixed(4)} |`);
  }
  L.push('');
  L.push('> `thinkingEst` is an **estimate** — OTEL folds thinking into `output`; we split it by character share of thinking blocks (spec §3.3).');
  L.push('');
  L.push('## Dominance');
  L.push('');
  L.push(`- **Token-dominant agent:** ${r.rollup.dominance.tokens}`);
  L.push(`- **Time-dominant agent:** ${r.rollup.dominance.time}`);
  for (const [tier, d] of Object.entries(r.rollup.dominance.byTier || {}))
    L.push(`  - tier \`${tier}\`: ${d.tokens}`);
  L.push('');
  L.push('## Icon fan-in blocking');
  L.push('');
  L.push('| run | scenario | blocked (ms) |');
  L.push('| --- | --- | ---: |');
  for (const run of r.runs)
    for (const f of run.fanIn)
      L.push(`| ${run.runId} | ${run.scenario.icon ? 'icon' : 'no-icon'}/${run.scenario.tier} | blocked: ${n(f.blockedMs)} ms |`);
  if (!r.runs.some(run => run.fanIn.length)) L.push('| — | no icon-bearing runs | 0 |');
  L.push('');
  L.push('## Cross-check (OTEL vs costs.jsonl)');
  L.push('');
  L.push(`- OTEL total tokens: ${n(r.rollup.crossCheck.otelTotalTokens)}`);
  L.push(`- costs.jsonl total tokens: ${n(r.rollup.crossCheck.costsJsonlTotalTokens)}`);
  L.push(`- delta: ${r.rollup.crossCheck.deltaPct}%`);
  L.push('');
  L.push('## Accuracy');
  L.push('');
  const hasAccuracy = r.runs.some(run => run.accuracy != null);
  L.push(hasAccuracy ? '_See per-run accuracy below._' : '_Accuracy pending — run `run-accuracy.mjs` for this trial._');
  L.push('');
  return L.join('\n');
}

export function renderTrialsetMarkdown(ts) {
  const L = [];
  const lbl = (r) => r.label ?? r.rung; // disambiguated rung name (cold/warm/update etc.)
  L.push(`# Workbench Trial Report — ${ts.trialId}`);
  L.push('');
  L.push(`> Generated: ${ts.generatedAt ?? '(unstamped)'} · Rungs: ${ts.rungs.length}`);
  L.push('');
  L.push('## Accuracy by ladder rung');
  L.push('');
  L.push('| rung | tier | composite | visual | style | struct·src | struct·dom | build gate |');
  L.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | :--: |');
  for (const r of ts.rungs) {
    const a = r.accuracy || {};
    const capped = a.cappedAt != null ? ' (capped)' : '';
    const cell = (v) => (v == null ? '—' : n(v));
    // Build-gate column reflects the deterministic gates (r.gates) when present, so it
    // agrees with the Build-gates table; falls back to any accuracy.gates.build.
    const g = r.gates;
    const gatePass = g ? (g.tsc !== false && g.build !== false && (!g.tests || g.tests.passed === g.tests.total))
                       : (a.gates ? !!a.gates.build : null);
    const gateCell = gatePass == null ? '—' : (gatePass ? '✓' : '✗');
    L.push(`| ${lbl(r)} | ${r.tier} | ${cell(a.composite)}${capped} | ${cell(a.visual?.score)} | ${cell(a.style?.matchRate)} | ${cell(a.structuralSource?.score)} | ${cell(a.structuralDom?.score)} | ${gateCell} |`);
  }
  L.push('');
  L.push('> Accuracy sub-scores are computed live: **visual** = pixel-diff of the component rendered in the target Storybook vs the reference oracle Storybook (fixed clip); **style** = `getComputedStyle` match over a fixed prop set; **struct·src** = source-tree similarity and **struct·dom** = rendered-DOM similarity (the composite uses dom when available, else src). A cell reads `—` when that sub-score was not computed (no reference story for the rung, or rendering unavailable); its weight is then **renormalised** across the remaining sub-scores, so the composite reflects only what was measured (see `availability` in `results.json`). The target is `designSystem: none` (plain Tailwind) vs the reference design system, so **visual/style read low by design** — they measure divergence from the reference look, not code quality; `struct·dom` and the cross-rung trend are the meaningful signals. The **build gate** column is deterministic; a11y is not in the gate set (axe unavailable). "(capped)" marks a build-fail-capped composite.');
  L.push('');
  if (ts.rungs.some((r) => r.quality)) {
    L.push('## Quality by ladder rung');
    L.push('');
    L.push('| rung | composite | optimizedCode | dx | docs | testDepth | storybook |');
    L.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const r of ts.rungs) {
      const q = r.quality;
      if (!q || q.composite == null) { L.push(`| ${lbl(r)} | — | — | — | — | — | — |`); continue; }
      const d = q.dimensions;
      L.push(`| ${lbl(r)} | ${n(q.composite)} | ${n(d.optimizedCode.score)} | ${n(d.dx.score)} | ${n(d.docs.score)} | ${n(d.testDepth.score)} | ${n(d.storybook.score)} |`);
    }
    L.push('');
    L.push('> Quality = source-based judge, **3-vote median panel** per dimension (15 judge agents across the 5 scored rungs) over `target` + the reference oracle against `oracle/rubric.md`, weighted by `oracle/quality-weights.json`. `icon-only`/`page` are out of scope (no full component). Dimensions are the per-dimension median of the panel; the deterministic metric-blend layer is not yet applied.');
    L.push('');
  }
  // Accessibility (axe), Stateless & Headless (static), Core Web Vitals (render):
  // additive per-rung tracks. A cell reads — when not yet scored (legacy capture / no render).
  if (ts.rungs.some((r) => r.a11y)) {
    L.push('## Accessibility by rung (axe-core)');
    L.push('');
    L.push('| rung | score | violations | nodes | top issues |');
    L.push('| --- | ---: | ---: | ---: | --- |');
    for (const r of ts.rungs) {
      const a = r.a11y;
      if (!a || a.score == null) { L.push(`| ${lbl(r)} | — | — | — | — |`); continue; }
      const top = (a.violations || []).slice(0, 3).map((v) => `${v.id} (${v.impact})`).join(', ') || '—';
      L.push(`| ${lbl(r)} | ${n(a.score)} | ${n(a.violationCount)} | ${n(a.nodeCount)} | ${top} |`);
    }
    L.push('');
    L.push('> axe-core WCAG audit over the rendered story root. Score starts at 100; each violation subtracts a per-impact penalty × min(nodes, cap) (`oracle/a11y-weights.json`). `—` = not rendered/scored.');
    L.push('');
  }
  if (ts.rungs.some((r) => r.headless)) {
    L.push('## Stateless & Headless by rung');
    L.push('');
    L.push('| rung | score | controlled | value-stateless | hook-extracted | forwardRef | effect-disc |');
    L.push('| --- | ---: | :--: | :--: | :--: | :--: | :--: |');
    const yn = (b) => (b ? '✓' : '✗');
    for (const r of ts.rungs) {
      const h = r.headless;
      if (!h || h.score == null) { L.push(`| ${lbl(r)} | — | — | — | — | — | — |`); continue; }
      const s = h.signals;
      L.push(`| ${lbl(r)} | ${n(h.score)} | ${yn(s.controlledProps)} | ${yn(s.statelessValue)} | ${yn(s.hookExtraction)} | ${yn(s.forwardRef)} | ${yn(s.sideEffectDiscipline)} |`);
    }
    L.push('');
    L.push('> Static source analysis (`oracle/metrics/architecture.mjs`): rewards controlled (prop-driven) APIs, no internal value state, extracted/headless logic, `forwardRef`, and side-effect discipline (`oracle/headless-weights.json`).');
    L.push('');
  }
  if (ts.rungs.some((r) => r.tokenBinding)) {
    L.push('## Token binding by rung');
    L.push('');
    L.push('| rung | score | literals | var(--) refs | sample literals |');
    L.push('| --- | ---: | ---: | ---: | --- |');
    for (const r of ts.rungs) {
      const t = r.tokenBinding;
      if (!t || t.score == null) { L.push(`| ${lbl(r)} | — | — | — | — |`); continue; }
      L.push(`| ${lbl(r)} | ${n(t.score)} | ${n(t.literals)} | ${n(t.boundRefs)} | ${(t.samples || []).join(', ') || '—'} |`);
    }
    L.push('');
    L.push('> Literal-freedom (`oracle/score-token-binding.mjs`): 100 when no hardcoded design values (hex / `rgb()`·`hsl()` / arbitrary Tailwind values / raw px·rem) are inlined; each literal deducts. Directly tracks binding rule 4 — styled values should bind to tokens, not inline.');
    L.push('');
  }
  if (ts.rungs.some((r) => r.cwv)) {
    L.push('## Core Web Vitals by rung');
    L.push('');
    L.push('| rung | score | LCP (ms) | CLS | TBT (ms) |');
    L.push('| --- | ---: | ---: | ---: | ---: |');
    for (const r of ts.rungs) {
      const c = r.cwv;
      if (!c || c.score == null) { L.push(`| ${lbl(r)} | — | — | — | — |`); continue; }
      L.push(`| ${lbl(r)} | ${n(c.score)} | ${c.lcp?.ms ?? '—'} | ${c.cls?.value ?? '—'} | ${c.tbt?.ms ?? '—'} |`);
    }
    L.push('');
    L.push('> Captured in the render harness via `PerformanceObserver`. Scored against Google good/needs-improvement/poor bands (`oracle/cwv-weights.json`): LCP 0.4, CLS 0.3, TBT 0.3.');
    L.push('');
  }
  // Build gates — the deterministic, source-derivable half of accuracy (visual/style
  // need live rendering and are omitted). tsc/build are whole-target; tests are per rung.
  if (ts.rungs.some((r) => r.gates)) {
    L.push('## Build gates by rung (deterministic)');
    L.push('');
    L.push('| rung | tsc | build | unit tests | gate |');
    L.push('| --- | :--: | :--: | ---: | :--: |');
    const mark = (b) => (b == null ? '—' : b ? '✓' : '✗');
    for (const r of ts.rungs) {
      const g = r.gates;
      if (!g) { L.push(`| ${lbl(r)} | — | — | — | — |`); continue; }
      const t = g.tests;
      const testsCell = t ? `${t.passed}/${t.total}` : '—';
      const pass = g.tsc !== false && g.build !== false && (!t || t.passed === t.total);
      L.push(`| ${lbl(r)} | ${mark(g.tsc)} | ${mark(g.build)} | ${testsCell} | ${pass ? '✓' : '✗'} |`);
    }
    L.push('');
    L.push('> The build-gate is the source-derivable slice of accuracy. Visual (pixel-diff) and style (computed-style) scoring require live rendering and are not included here — see `analysis/01-accuracy-feasibility.md`.');
    L.push('');
  }
  // Cost & token ladder — the per-rung deterministic data (spec §7: per-rung
  // token totals broken out, rolled from each run's OTEL agent aggregation).
  const sumTok = (agents, k) => (agents || []).reduce((s, a) => s + (a.tokens?.[k] ?? 0), 0);
  const sumNum = (agents, k) => (agents || []).reduce((s, a) => s + (a[k] ?? 0), 0);
  // timeMs is a number in the rollup but an object {sumDuration,...} on rung agents.
  const ms = (v) => (typeof v === 'number' ? v : (v?.sumDuration ?? 0));
  const sumMs = (agents) => (agents || []).reduce((s, a) => s + ms(a.timeMs), 0);
  L.push('## Cost & token ladder by rung');
  L.push('');
  L.push('| rung | tier | requests | total tokens | output | cacheRead | cacheCreate | model time (ms) | cost (USD) |');
  L.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  let tTot = 0, tCost = 0;
  for (const r of ts.rungs) {
    const a = r.agents;
    const total = sumTok(a, 'total'); const cost = sumNum(a, 'costUsd');
    tTot += total; tCost += cost;
    L.push(`| ${lbl(r)} | ${r.tier} | ${n(sumNum(a, 'requests'))} | ${n(total)} | ${n(sumTok(a, 'output'))} | ${n(sumTok(a, 'cacheRead'))} | ${n(sumTok(a, 'cacheCreation'))} | ${n(sumMs(a))} | ${cost.toFixed(4)} |`);
  }
  L.push(`| **total** | — | — | **${n(tTot)}** | — | — | — | — | **${tCost.toFixed(4)}** |`);
  L.push('');
  L.push('> Tokens are OTEL-reported per run, summed across that run\'s agents. `cacheRead` typically dominates `total` (prompt-cache hits are billed cheap but counted). `model time` is summed request duration, not wall-clock.');
  L.push('');
  L.push('## Scenario comparisons');
  L.push('');
  const c = ts.comparisons || {};
  if (c.iconFanIn) L.push(`- **Icon fan-in:** rung \`${c.iconFanIn.withIconsRung}\` blocked ${n(c.iconFanIn.blockedMsDelta)} ms longer than control \`${c.iconFanIn.controlRung}\`.`);
  if (c.coldWarm) L.push(`- **Cold → warm cache:** token change ${c.coldWarm.tokenDeltaPct}% (run \`${c.coldWarm.coldRunId}\` → \`${c.coldWarm.warmRunId}\`).`);
  if (c.buildUpdate) L.push(`- **Build → update:** token change ${c.buildUpdate.tokenDeltaPct}% (run \`${c.buildUpdate.buildRunId}\` → \`${c.buildUpdate.updateRunId}\`).`);
  L.push('');
  L.push('## Dominance (all rungs)');
  L.push('');
  L.push(`- **Token-dominant agent:** ${ts.rollup.dominance.tokens}`);
  L.push(`- **Time-dominant agent:** ${ts.rollup.dominance.time}`);
  for (const [tier, d] of Object.entries(ts.rollup.dominance.byTier || {}))
    L.push(`  - tier \`${tier}\`: ${d.tokens}`);
  L.push('');
  L.push('## Cross-check (OTEL vs costs.jsonl)');
  L.push('');
  const cc = ts.rollup.crossCheck || {};
  L.push(`- OTEL total tokens: ${n(cc.otelTotalTokens)}`);
  L.push(`- costs.jsonl total tokens: ${n(cc.costsJsonlTotalTokens)}`);
  L.push(`- delta: ${cc.deltaPct ?? 0}%`);
  L.push('');

  // OpenTelemetry report — cost/token/latency drill-down from the OTEL stream.
  const otel = ts.otelReport;
  if (otel) {
    L.push('## OpenTelemetry report');
    L.push('');
    L.push(`- **Total cost:** $${otel.totals.costUsd.toFixed(4)} · **Total tokens:** ${n(otel.totals.tokens)} · **Requests:** ${n(otel.totals.requests)}`);
    L.push(`- **Cost-dominant agent:** ${otel.costDominantAgent ?? '—'}`);
    L.push('');
    L.push('| agent | requests | total tokens | output | cost (USD) | ttft avg (ms) |');
    L.push('| --- | ---: | ---: | ---: | ---: | ---: |');
    for (const a of otel.perAgent)
      L.push(`| ${a.agent} | ${n(a.requests)} | ${n(a.tokens.total)} | ${n(a.tokens.output)} | ${a.costUsd.toFixed(4)} | ${n(a.ttftAvgMs)} |`);
    L.push('');
    L.push('### Cost to build by rung');
    L.push('');
    L.push('| rung | tier | cost (USD) | tokens |');
    L.push('| --- | --- | ---: | ---: |');
    for (const r of otel.perRung)
      L.push(`| ${lbl(r)} | ${r.tier} | ${r.costUsd.toFixed(4)} | ${n(r.tokens)} |`);
    L.push('');
    L.push('> OTEL `costUsd`/token usage rolled per agent and per rung from `events.jsonl` (metered by Claude Code). `ttft avg` is request-weighted from `spans.jsonl`. The cross-check above reconciles OTEL totals against the coordinator `costs.jsonl` ledger.');
    L.push('');
  }

  // Efficiency ladder — telemetry-derived, no new capture.
  if (ts.efficiencyByRung && ts.efficiencyByRung.length) {
    L.push('## Efficiency by rung');
    L.push('');
    L.push('| rung | tier | latency (ms) | cache-hit | tool-calls | ttft (ms) | $/acc-pt | tok/acc-pt |');
    L.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const e of ts.efficiencyByRung) {
      const pct = `${Math.round((e.cacheHitRatio ?? 0) * 100)}%`;
      L.push(`| ${e.label ?? e.rung} | ${e.tier} | ${n(e.latencyMs)} | ${pct} | ${n(e.toolUses)} | ${n(e.ttftAvgMs)} | ${e.costPerAccuracyPoint == null ? '—' : e.costPerAccuracyPoint.toFixed(4)} | ${e.tokensPerAccuracyPoint == null ? '—' : n(e.tokensPerAccuracyPoint)} |`);
    }
    L.push('');
    L.push('> All derived from telemetry already captured (`analyze/efficiency.mjs`). `cache-hit` = `cacheRead / total` tokens; `$/acc-pt` & `tok/acc-pt` normalise cost/tokens by the accuracy composite (— when the rung is unscored). `latency` is wall-clock; `ttft` is request-weighted.');
    L.push('');
  }

  const sc = (m) => (m && m.score != null ? n(m.score) : '—');
  const chMean = (ch) => {
    if (!ch) return null;
    const xs = Object.values(ch).map((m) => m && m.score).filter((s) => s != null);
    return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
  };

  // Static code health (category B/C/G/H)
  if (ts.rungs.some((r) => r.codeHealth)) {
    L.push('## Static code-health by rung');
    L.push('');
    L.push('| rung | health | types | complexity | css | dangerous | srv/client | rtl | comments | compose | naming | propTypes |');
    L.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const r of ts.rungs) {
      const c = r.codeHealth;
      if (!c) { L.push(`| ${lbl(r)} | — | — | — | — | — | — | — | — | — | — | — |`); continue; }
      L.push(`| ${lbl(r)} | ${chMean(c) ?? '—'} | ${sc(c.typeStrictness)} | ${sc(c.complexity)} | ${sc(c.cssHygiene)} | ${sc(c.dangerousApi)} | ${sc(c.serverClientBoundary)} | ${sc(c.rtlReadiness)} | ${sc(c.commentEconomy)} | ${sc(c.composability)} | ${sc(c.namingAdherence)} | ${sc(c.propTypeCompleteness)} |`);
    }
    L.push('');
    L.push('> Static source scan (`oracle/metrics/source-static.mjs`): type strictness · cyclomatic-ish complexity · CSS hygiene · dangerous APIs · unnecessary `"use client"` · RTL logical-properties · comment economy (the 80-char rule) · composability · naming · prop-type/JSDoc completeness. `health` is the mean of available sub-scores.');
    L.push('');
  }

  // Design tokens (category A)
  if (ts.rungs.some((r) => r.tokenSystem)) {
    L.push('## Design tokens by rung');
    L.push('');
    L.push('| rung | semantic-alias | orphan refs | coverage |');
    L.push('| --- | ---: | ---: | ---: |');
    for (const r of ts.rungs) {
      const t = r.tokenSystem;
      if (!t) { L.push(`| ${lbl(r)} | — | — | — |`); continue; }
      L.push(`| ${lbl(r)} | ${Math.round((t.semanticAliasRatio ?? 0) * 100)}% | ${n(t.orphanRefs)} | ${t.coverage == null ? '—' : n(t.coverage)} |`);
    }
    L.push('');
    L.push('> `oracle/metrics/design-tokens.mjs`: semantic-alias = share of tokens that alias another via `var()`; orphan refs = `var(--x)` used but not defined; coverage (emitted ÷ Figma-needed) is `—` when the manifest needed-count is unavailable.');
    L.push('');
  }

  // DOM shape + render signals + runtime perf (categories B/C/D)
  if (ts.rungs.some((r) => r.domShape || r.renderSignals || r.runtimePerf)) {
    L.push('## DOM & render by rung');
    L.push('');
    L.push('| rung | dom | nodes | depth | render | focus | keyboard | mount (ms) | perf |');
    L.push('| --- | ---: | ---: | ---: | ---: | :--: | ---: | ---: | ---: |');
    for (const r of ts.rungs) {
      const d = r.domShape, s = r.renderSignals, p = r.runtimePerf;
      if (!d && !s && !p) { L.push(`| ${lbl(r)} | — | — | — | — | — | — | — | — |`); continue; }
      const focus = s && s.focusVisible != null ? (s.focusVisible ? '✓' : '✗') : '—';
      L.push(`| ${lbl(r)} | ${sc(d)} | ${d ? n(d.nodeCount) : '—'} | ${d ? n(d.maxDepth) : '—'} | ${sc(s)} | ${focus} | ${s?.keyboardReached ?? '—'} | ${p?.mountMs ?? '—'} | ${sc(p)} |`);
    }
    L.push('');
    L.push('> DOM = nesting/bloat health (`metrics/dom-shape.mjs`). render = focus-visible + keyboard reachability + interaction-ok (`score-render-signals.mjs`). perf = mount-time band (`score-runtime-perf.mjs`); INP / re-renders / memory are capability-gated.');
    L.push('');
  }

  // Process & build meta (categories E/F/G) — trial-level
  if (ts.processMeta || ts.buildMetrics) {
    L.push('## Process & build meta');
    L.push('');
    const g = (m) => (m == null ? '—' : m.score != null ? `${m.score}` : `— (${m.reason || 'n/a'})`);
    const pm = ts.processMeta || {}, bm = ts.buildMetrics || {};
    L.push(`- **KG reuse rate:** ${g(pm.reuseRate)}`);
    L.push(`- **Update diff-size:** ${g(pm.updateDiffSize)}`);
    L.push(`- **Retry/error rate:** ${g(pm.retryRate)}`);
    L.push(`- **HITL gate count:** ${g(pm.hitlGateCount)}`);
    L.push(`- **Tier-routing accuracy:** ${g(pm.tierRoutingAccuracy)}`);
    L.push(`- **Prompt-injection resistance:** ${g(pm.promptInjectionResistance)}`);
    L.push(`- **Import cycles:** ${g(bm.circularDeps)}${bm.circularDeps ? ` (${bm.circularDeps.cycleCount} cycles / ${bm.circularDeps.nodes} nodes)` : ''}`);
    L.push(`- **Bundle size:** ${g(bm.bundleSize)} · **Lint:** ${g(bm.lintConformance)} _(capability-gated — need a build / eslint run)_`);
    L.push('');
    L.push('> `—` with a reason = the signal was not captured in this trial (e.g. determinism needs two runs; reuse-rate needs KG `resolution` data). The scorers compute as soon as that data is present.');
    L.push('');
  }
  return L.join('\n');
}
