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
  L.push(hasAccuracy ? '_See per-run accuracy below._' : '_Accuracy scoring is pending (Plan 2 — oracle + live trial)._');
  L.push('');
  return L.join('\n');
}
