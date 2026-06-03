// workbench/report/dashboard.mjs
// Self-contained dashboard: inline data + inline-SVG bars. No external assets.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function svgBars(data, { width = 480, barH = 22, gap = 8, pad = 120 } = {}) {
  // Coerce values defensively: a non-numeric datum would otherwise poison every
  // width via NaN. Real telemetry is numeric, but Plan 2 feeds live data here.
  const val = (d) => Number(d.value) || 0;
  const max = Math.max(1, ...data.map(val));
  const h = data.length * (barH + gap) + gap;
  const rows = data.map((d, i) => {
    const y = gap + i * (barH + gap);
    const v = val(d);
    const w = Math.round((width - pad - 60) * (v / max));
    return `<text x="0" y="${y + barH * 0.7}" font-size="12">${esc(d.label)}</text>` +
      `<rect x="${pad}" y="${y}" width="${w}" height="${barH}" fill="#4f46e5"></rect>` +
      `<text x="${pad + w + 6}" y="${y + barH * 0.7}" font-size="12">${v.toLocaleString('en-US')}</text>`;
  }).join('');
  return `<svg width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" xmlns="http://www.w3.org/2000/svg">${rows}</svg>`;
}

export function renderDashboard(r) {
  const tokenBars = svgBars(r.rollup.perAgent.map((a) => ({ label: a.agent, value: a.tokens.total })));
  const timeBars = svgBars(r.rollup.perAgent.map((a) => ({ label: a.agent, value: a.timeMs })));
  const data = esc(JSON.stringify(r));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Workbench — ${esc(r.trialId)}</title>
<style>body{font:14px system-ui,sans-serif;margin:2rem;max-width:900px}h1{margin-bottom:0}
section{margin:2rem 0}code{background:#f3f4f6;padding:.1em .3em;border-radius:3px}
.note{color:#6b7280;font-size:.85rem}</style></head>
<body>
<h1>Workbench Report — ${esc(r.trialId)}</h1>
<p class="note">Token-dominant: <b>${esc(r.rollup.dominance.tokens)}</b> · Time-dominant: <b>${esc(r.rollup.dominance.time)}</b> · OTEL↔costs.jsonl Δ ${esc(r.rollup.crossCheck.deltaPct)}%</p>
<section><h2>Tokens per agent (total)</h2>${tokenBars}
<p class="note">Thinking tokens are estimated (spec §3.3).</p></section>
<section><h2>Time per agent (sum duration ms)</h2>${timeBars}</section>
<section><h2>Raw results</h2>
<script type="application/json" id="results-data">${data}</script>
<details><summary>Show JSON</summary><pre>${data}</pre></details></section>
</body></html>`;
}

export function renderTrialsetDashboard(ts) {
  const accBars = svgBars(ts.accuracyByRung.map((r) => ({ label: r.rung, value: r.composite ?? 0 })));
  const tokenBars = svgBars(ts.rollup.perAgent.map((a) => ({ label: a.agent, value: a.tokens.total })));
  const data = esc(JSON.stringify(ts));
  const c = ts.comparisons || {};
  const cmp = [
    c.iconFanIn ? `Icon fan-in Δ ${c.iconFanIn.blockedMsDelta} ms` : null,
    c.coldWarm ? `Cold→warm ${c.coldWarm.tokenDeltaPct}%` : null,
    c.buildUpdate ? `Build→update ${c.buildUpdate.tokenDeltaPct}%` : null,
  ].filter(Boolean).map(esc).join(' · ');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Workbench Trial — ${esc(ts.trialId)}</title>
<style>body{font:14px system-ui,sans-serif;margin:2rem;max-width:900px}h1{margin-bottom:0}
section{margin:2rem 0}.note{color:#6b7280;font-size:.85rem}</style></head>
<body>
<h1>Workbench Trial Report — ${esc(ts.trialId)}</h1>
<p class="note">${cmp}</p>
<section><h2>Accuracy by rung (composite)</h2>${accBars}
<p class="note">Composite blends visual/style/structural/gates; build-fail caps the score.</p></section>
<section><h2>Tokens per agent (all rungs)</h2>${tokenBars}</section>
<section><h2>Raw trialset</h2>
<script type="application/json" id="trialset-data">${data}</script>
<details><summary>Show JSON</summary><pre>${data}</pre></details></section>
</body></html>`;
}
