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
    L.push(`| ${r.rung} | ${r.tier} | ${cell(a.composite)}${capped} | ${cell(a.visual?.score)} | ${cell(a.style?.matchRate)} | ${cell(a.structuralSource?.score)} | ${cell(a.structuralDom?.score)} | ${gateCell} |`);
  }
  L.push('');
  L.push('> Accuracy sub-scores are computed live: **visual** = pixel-diff of the component rendered in the target Storybook vs the HeroUI oracle Storybook (fixed clip); **style** = `getComputedStyle` match over a fixed prop set; **struct·src** = source-tree similarity and **struct·dom** = rendered-DOM similarity (the composite uses dom when available, else src). A cell reads `—` when that sub-score was not computed (no HeroUI story for the rung, or rendering unavailable); its weight is then **renormalised** across the remaining sub-scores, so the composite reflects only what was measured (see `availability` in `results.json`). The target is `designSystem: none` (plain Tailwind) vs the HeroUI design system, so **visual/style read low by design** — they measure divergence from HeroUI\'s look, not code quality; `struct·dom` and the cross-rung trend are the meaningful signals. The **build gate** column is deterministic; a11y is not in the gate set (axe unavailable). "(capped)" marks a build-fail-capped composite.');
  L.push('');
  if (ts.rungs.some((r) => r.quality)) {
    L.push('## Quality by ladder rung');
    L.push('');
    L.push('| rung | composite | optimizedCode | dx | docs | testDepth | storybook |');
    L.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const r of ts.rungs) {
      const q = r.quality;
      if (!q || q.composite == null) { L.push(`| ${r.rung} | — | — | — | — | — | — |`); continue; }
      const d = q.dimensions;
      L.push(`| ${r.rung} | ${n(q.composite)} | ${n(d.optimizedCode.score)} | ${n(d.dx.score)} | ${n(d.docs.score)} | ${n(d.testDepth.score)} | ${n(d.storybook.score)} |`);
    }
    L.push('');
    L.push('> Quality = source-based judge, **3-vote median panel** per dimension (15 judge agents across the 5 scored rungs) over `target` + `ref-heroui` against `oracle/rubric.md`, weighted by `oracle/quality-weights.json`. `icon-only`/`page` are out of scope (no full component). Dimensions are the per-dimension median of the panel; the deterministic metric-blend layer is not yet applied.');
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
      if (!g) { L.push(`| ${r.rung} | — | — | — | — |`); continue; }
      const t = g.tests;
      const testsCell = t ? `${t.passed}/${t.total}` : '—';
      const pass = g.tsc !== false && g.build !== false && (!t || t.passed === t.total);
      L.push(`| ${r.rung} | ${mark(g.tsc)} | ${mark(g.build)} | ${testsCell} | ${pass ? '✓' : '✗'} |`);
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
    L.push(`| ${r.rung} | ${r.tier} | ${n(sumNum(a, 'requests'))} | ${n(total)} | ${n(sumTok(a, 'output'))} | ${n(sumTok(a, 'cacheRead'))} | ${n(sumTok(a, 'cacheCreation'))} | ${n(sumMs(a))} | ${cost.toFixed(4)} |`);
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
  return L.join('\n');
}
