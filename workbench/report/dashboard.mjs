// workbench/report/dashboard.mjs
// Self-contained dashboard: inline CSS + inline-SVG charts. No external assets, no JS deps.
//
// Design — cinematic "observatory" dark theme (epic-design aesthetic, adapted to a data
// dashboard): layered radial-glow atmosphere (depth), gradient hero + KPI stat cards,
// gradient/rounded SVG bars, glass panels with hover-lift, color-coded gate marks, and
// GPU-safe entrance motion (transform/opacity only) gated behind prefers-reduced-motion.
// Techniques applied: depth atmosphere layers · bleed/gradient typography · staggered
// rise-in reveal · panel hover-lift · zebra/hover data tables · reduced-motion fallback.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Exact-match status glyphs get a colored span so gate columns read at a glance.
const markCell = (escaped) =>
  escaped === '✓' ? '<span class="ok">✓</span>'
  : escaped === '✗' ? '<span class="bad">✗</span>'
  : escaped === '—' ? '<span class="dash">—</span>'
  : escaped;

// Minimal HTML table from headers + rows. `align[i] === 'r'` right-aligns column i.
// Cells are escaped; standalone ✓/✗/— are wrapped in status spans for color.
export function htmlTable(headers, rows, { align = [] } = {}) {
  const a = (i) => (align[i] === 'r' ? ' style="text-align:right"' : '');
  const th = headers.map((h, i) => `<th${a(i)}>${esc(h)}</th>`).join('');
  const body = rows.map((row) =>
    '<tr>' + row.map((c, i) => `<td${a(i)}>${markCell(esc(c))}</td>`).join('') + '</tr>').join('');
  return `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`;
}

// Polished horizontal bar chart. Emits EXACTLY one <rect> per datum (contract: tests count
// rects); gridlines are <line>, the fill is a per-chart <linearGradient> (unique id avoids
// cross-SVG id bleed on the same page).
export function svgBars(data, { width = 520, barH = 26, gap = 12, pad = 150, gradId = 'barGrad' } = {}) {
  const val = (d) => Number(d.value) || 0;
  const max = Math.max(1, ...data.map(val));
  const chartW = width - pad - 70;       // space reserved for label (left) + value (right)
  const h = data.length * (barH + gap) + gap;
  // Faint vertical gridlines at 25/50/75/100% of the plotted area.
  const grid = [0.25, 0.5, 0.75, 1].map((f) => {
    const x = pad + chartW * f;
    return `<line x1="${x.toFixed(1)}" y1="${gap - 4}" x2="${x.toFixed(1)}" y2="${h - gap + 4}" stroke="rgba(255,255,255,0.06)" stroke-width="1"></line>`;
  }).join('');
  const rows = data.map((d, i) => {
    const y = gap + i * (barH + gap);
    const v = val(d);
    const w = v > 0 ? Math.max(4, Math.round(chartW * (v / max))) : 0;
    return `<text x="0" y="${y + barH * 0.68}" class="bar-label">${esc(d.label)}</text>` +
      `<rect x="${pad}" y="${y}" width="${w}" height="${barH}" rx="7" fill="url(#${gradId})"></rect>` +
      `<text x="${pad + w + 10}" y="${y + barH * 0.68}" class="bar-val">${v.toLocaleString('en-US')}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${width} ${h}" width="${width}" height="${h}" role="img" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="#6366f1"></stop><stop offset="0.55" stop-color="#a855f7"></stop><stop offset="1" stop-color="#22d3ee"></stop>` +
    `</linearGradient></defs>${grid}${rows}</svg>`;
}

// ── Shared shell pieces ──────────────────────────────────────────────────────

const THEME_CSS = `
:root{
  --bg:#080912; --bg2:#0c0e1a; --panel:rgba(255,255,255,.035); --panel-brd:rgba(255,255,255,.08);
  --text:#e7e9f3; --muted:#9298b0; --faint:#646a85;
  --accent:#8b8ff5; --accent2:#c084fc; --cyan:#5eead4;
  --green:#34d399; --red:#fb7185; --amber:#fbbf24;
  --mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{
  font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--text);margin:0;
  background:var(--bg);min-height:100vh;-webkit-font-smoothing:antialiased;overflow-x:hidden;
}
/* depth-0/1 — atmospheric glow + grid texture, fixed behind content */
.atmos{position:fixed;inset:0;z-index:-2;overflow:hidden;pointer-events:none}
.atmos::before{content:"";position:absolute;inset:0;
  background:
    radial-gradient(60% 50% at 18% 8%, rgba(99,102,241,.22), transparent 60%),
    radial-gradient(55% 45% at 88% 18%, rgba(168,85,247,.18), transparent 60%),
    radial-gradient(70% 60% at 50% 110%, rgba(34,211,238,.10), transparent 55%),
    linear-gradient(180deg,var(--bg),var(--bg2));}
.grid-tex{position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:.5;
  background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),
    linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);
  background-size:46px 46px;mask-image:radial-gradient(circle at 50% 30%,#000,transparent 80%);}
.wrap{max-width:1040px;margin:0 auto;padding:clamp(2rem,5vw,4.5rem) clamp(1.1rem,4vw,2.5rem) 5rem}
/* hero */
.eyebrow{font:600 12px/1 var(--mono);letter-spacing:.22em;text-transform:uppercase;color:var(--accent);
  display:inline-flex;align-items:center;gap:.6em;margin:0 0 1.1rem}
.eyebrow::before{content:"";width:26px;height:1px;background:linear-gradient(90deg,var(--accent),transparent)}
h1{font-size:clamp(2.1rem,6vw,3.6rem);line-height:1.02;letter-spacing:-.02em;margin:0 0 .7rem;font-weight:760;
  background:linear-gradient(120deg,#fff 18%,var(--accent) 55%,var(--accent2) 78%,var(--cyan));
  -webkit-background-clip:text;background-clip:text;color:transparent;}
.sub{color:var(--muted);font-size:1.02rem;margin:0;max-width:62ch}
.sub code{font:.85em var(--mono);color:var(--text);background:rgba(255,255,255,.06);padding:.12em .45em;border-radius:5px}
/* KPI stat row */
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin:2.4rem 0 .5rem}
.kpi{position:relative;padding:1.05rem 1.15rem;border:1px solid var(--panel-brd);border-radius:15px;
  background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.018));overflow:hidden}
.kpi::after{content:"";position:absolute;inset:0 0 auto 0;height:1px;background:linear-gradient(90deg,transparent,var(--accent),transparent);opacity:.6}
.kpi .k-label{font:600 11px/1 var(--mono);letter-spacing:.13em;text-transform:uppercase;color:var(--faint)}
.kpi .k-val{font:700 1.7rem/1.1 var(--mono);margin-top:.5rem;letter-spacing:-.01em;
  background:linear-gradient(120deg,#fff,var(--accent2));-webkit-background-clip:text;background-clip:text;color:transparent}
.kpi .k-sub{font-size:12px;color:var(--muted);margin-top:.3rem}
/* panels */
section{margin:2.3rem 0 0}
.panel{border:1px solid var(--panel-brd);border-radius:18px;background:var(--panel);
  padding:1.5rem 1.6rem 1.7rem;backdrop-filter:blur(6px);
  box-shadow:0 1px 0 rgba(255,255,255,.04) inset,0 24px 60px -40px rgba(0,0,0,.9);
  transition:transform .35s cubic-bezier(.2,.7,.2,1),border-color .35s}
.panel:hover{transform:translateY(-3px);border-color:rgba(139,143,245,.32)}
.panel h2{font-size:1.12rem;font-weight:680;letter-spacing:-.01em;margin:0 0 .25rem;display:flex;align-items:center;gap:.6rem}
.panel h2::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 12px var(--accent)}
.note{color:var(--muted);font-size:.85rem;margin:.15rem 0 1.1rem;max-width:74ch}
.note code{font:.86em var(--mono);color:var(--text);background:rgba(255,255,255,.06);padding:.1em .4em;border-radius:5px}
.chart{max-width:100%;height:auto;display:block;margin-top:.3rem}
.bar-label{fill:var(--muted);font:500 12.5px system-ui,sans-serif}
.bar-val{fill:var(--text);font:600 12.5px var(--mono)}
/* tables */
.table-wrap{margin-top:.3rem;border:1px solid var(--panel-brd);border-radius:13px;overflow:hidden}
table{border-collapse:collapse;width:100%;font-size:13.5px}
th,td{padding:.62em .9em;text-align:left}
thead th{font:600 11px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--faint);
  background:rgba(255,255,255,.035);border-bottom:1px solid var(--panel-brd)}
tbody td{border-top:1px solid rgba(255,255,255,.05);font-variant-numeric:tabular-nums}
tbody td[style*="right"]{font-family:var(--mono)}
tbody tr:first-child td{border-top:none}
tbody tr{transition:background .2s}
tbody tr:hover td{background:rgba(139,143,245,.07)}
tbody td:first-child{color:var(--text);font-weight:560}
.ok{color:var(--green);font-weight:700}.bad{color:var(--red);font-weight:700}.dash{color:var(--faint)}
/* raw json */
details{margin-top:1rem}
summary{cursor:pointer;color:var(--accent);font:600 13px var(--mono);letter-spacing:.04em}
pre{overflow:auto;max-height:320px;background:rgba(0,0,0,.35);border:1px solid var(--panel-brd);
  border-radius:12px;padding:1rem;font:12px/1.5 var(--mono);color:#c9cee6;margin-top:.7rem}
footer{margin-top:3rem;padding-top:1.4rem;border-top:1px solid var(--panel-brd);color:var(--faint);font-size:12.5px;font-family:var(--mono)}
/* entrance motion — GPU-safe transform/opacity, staggered */
.reveal{opacity:0;transform:translateY(14px);animation:rise .7s cubic-bezier(.2,.7,.2,1) forwards}
.kpis .kpi{opacity:0;transform:translateY(14px);animation:rise .6s cubic-bezier(.2,.7,.2,1) forwards}
.kpis .kpi:nth-child(2){animation-delay:.06s}.kpis .kpi:nth-child(3){animation-delay:.12s}
.kpis .kpi:nth-child(4){animation-delay:.18s}.kpis .kpi:nth-child(5){animation-delay:.24s}
section:nth-of-type(1) .panel{animation-delay:.1s}section:nth-of-type(2) .panel{animation-delay:.18s}
section:nth-of-type(3) .panel{animation-delay:.26s}section:nth-of-type(4) .panel{animation-delay:.34s}
section:nth-of-type(5) .panel{animation-delay:.42s}
@keyframes rise{to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;
    transition-duration:.01ms!important;scroll-behavior:auto!important}
  .reveal,.kpis .kpi{opacity:1;transform:none}
  html{scroll-behavior:auto}
}`;

const atmosphere = () =>
  '<div class="atmos" aria-hidden="true"></div><div class="grid-tex" aria-hidden="true"></div>';

const kpi = (label, value, sub) =>
  `<div class="kpi"><div class="k-label">${esc(label)}</div><div class="k-val">${esc(value)}</div>` +
  (sub ? `<div class="k-sub">${esc(sub)}</div>` : '') + '</div>';

const fmt = (n) => (n ?? 0).toLocaleString('en-US');

// ── Single-run dashboard ─────────────────────────────────────────────────────

export function renderDashboard(r) {
  const tokenBars = svgBars(r.rollup.perAgent.map((a) => ({ label: a.agent, value: a.tokens.total })), { gradId: 'gTok' });
  const timeBars = svgBars(r.rollup.perAgent.map((a) => ({ label: a.agent, value: a.timeMs })), { gradId: 'gTime' });
  const totalTokens = r.rollup.perAgent.reduce((s, a) => s + (a.tokens?.total ?? 0), 0);
  const totalCost = r.rollup.perAgent.reduce((s, a) => s + (a.costUsd ?? 0), 0);
  const cc = r.rollup.crossCheck || {};
  const data = esc(JSON.stringify(r));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Workbench — ${esc(r.trialId)}</title>
<style>${THEME_CSS}</style></head>
<body>${atmosphere()}
<div class="wrap">
  <header class="reveal">
    <p class="eyebrow">Workbench · Run report</p>
    <h1>${esc(r.trialId)}</h1>
    <p class="sub">Per-agent telemetry rollup across <code>${fmt(r.runs.length)}</code> run(s). Thinking tokens are estimated (spec §3.3).</p>
  </header>
  <div class="kpis">
    ${kpi('Total tokens', fmt(totalTokens))}
    ${kpi('Total cost', '$' + totalCost.toFixed(2))}
    ${kpi('Token-dominant', r.rollup.dominance.tokens)}
    ${kpi('OTEL ↔ costs Δ', (cc.deltaPct ?? 0) + '%')}
  </div>
  <section><div class="panel"><h2>Tokens per agent</h2>
    <p class="note">Total tokens attributed to each agent across all runs.</p>${tokenBars}</div></section>
  <section><div class="panel"><h2>Time per agent</h2>
    <p class="note">Summed request duration (ms), not wall-clock.</p>${timeBars}</div></section>
  <section><div class="panel"><h2>Raw results</h2>
    <p class="note">The full results object backing this view.</p>
    <script type="application/json" id="results-data">${data}</script>
    <details><summary>Show JSON</summary><pre>${data}</pre></details></div></section>
  <footer>Generated ${esc(r.generatedAt ?? '(unstamped)')} · self-contained · no external assets</footer>
</div>
</body></html>`;
}

// ── Trialset (ladder) dashboard ──────────────────────────────────────────────

export function renderTrialsetDashboard(ts) {
  const accBars = svgBars(ts.accuracyByRung.map((r) => ({ label: r.label ?? r.rung, value: r.composite ?? 0 })), { gradId: 'gAcc' });
  const qualBars = svgBars((ts.qualityByRung || []).map((r) => ({ label: r.label ?? r.rung, value: r.composite ?? 0 })), { gradId: 'gQual' });
  const tokenBars = svgBars(ts.rollup.perAgent.map((a) => ({ label: a.agent, value: a.tokens.total })), { gradId: 'gTok' });

  // Per-rung Quality table (mirrors report.md). Only rungs with a scored composite.
  const rungs = ts.rungs || [];
  const qRows = rungs.filter((r) => r.quality && r.quality.composite != null).map((r) => {
    const d = r.quality.dimensions;
    return [r.label ?? r.rung, r.quality.composite, d.optimizedCode.score, d.dx.score, d.docs.score, d.testDepth.score, d.storybook.score];
  });
  const qualityTable = qRows.length
    ? htmlTable(['rung', 'composite', 'optimizedCode', 'dx', 'docs', 'testDepth', 'storybook'], qRows,
        { align: ['l', 'r', 'r', 'r', 'r', 'r', 'r'] })
    : '';

  // Per-rung Build-gates table (deterministic half of accuracy). mark() maps null→— / true→✓ / false→✗.
  const mark = (b) => (b == null ? '—' : b ? '✓' : '✗');
  const gRows = rungs.filter((r) => r.gates).map((r) => {
    const g = r.gates; const t = g.tests;
    const pass = g.tsc !== false && g.build !== false && (!t || t.passed === t.total);
    return [r.label ?? r.rung, mark(g.tsc), mark(g.build), t ? `${t.passed}/${t.total}` : '—', pass ? '✓' : '✗'];
  });
  const gatesTable = gRows.length
    ? htmlTable(['rung', 'tsc', 'build', 'unit tests', 'gate'], gRows, { align: ['l', 'r', 'r', 'r', 'r'] })
    : '';

  // ── New per-rung tracks ──
  const usd = (n) => '$' + (n ?? 0).toFixed(4);
  const pending = (cmd) => `<p class="note">Pending — re-score: <code>${esc(cmd)}</code></p>`;

  // Token Consumption + Cost to Build — measurables (data present for every trial).
  const tokRungBars = svgBars((ts.tokensByRung || []).map((r) => ({ label: r.rung, value: r.total })), { gradId: 'gTokRung' });
  const costRungBars = svgBars((ts.costByRung || []).map((r) => ({ label: r.rung, value: Math.round((r.usd ?? 0) * 10000) })), { gradId: 'gCost' });
  const tokRungTable = (ts.tokensByRung || []).length
    ? htmlTable(['rung', 'tier', 'total', 'output', 'cacheRead', 'cacheCreate'],
        ts.tokensByRung.map((r) => [r.label ?? r.rung, r.tier, fmt(r.total), fmt(r.output), fmt(r.cacheRead), fmt(r.cacheCreation)]),
        { align: ['l', 'l', 'r', 'r', 'r', 'r'] })
    : '';
  const costRungTable = (ts.costByRung || []).length
    ? htmlTable(['rung', 'tier', 'cost', 'tokens'],
        ts.costByRung.map((r, i) => [r.label ?? r.rung, r.tier, usd(r.usd), fmt((ts.tokensByRung || [])[i]?.total)]),
        { align: ['l', 'l', 'r', 'r'] })
    : '';

  // Accessibility (axe), Stateless & Headless (static), Core Web Vitals (render).
  const yn = (b) => (b ? '✓' : '✗');
  const a11yRows = rungs.filter((r) => r.a11y && r.a11y.score != null)
    .map((r) => [r.label ?? r.rung, r.a11y.score, r.a11y.violationCount, r.a11y.nodeCount]);
  const a11yTable = a11yRows.length
    ? htmlTable(['rung', 'score', 'violations', 'nodes'], a11yRows, { align: ['l', 'r', 'r', 'r'] })
    : pending('TRIAL=trials/<id> node workbench/oracle/run-accuracy.mjs --render');
  const hRows = rungs.filter((r) => r.headless && r.headless.score != null).map((r) => {
    const s = r.headless.signals;
    return [r.label ?? r.rung, r.headless.score, yn(s.controlledProps), yn(s.statelessValue), yn(s.hookExtraction), yn(s.forwardRef), yn(s.sideEffectDiscipline)];
  });
  const headlessTable = hRows.length
    ? htmlTable(['rung', 'score', 'controlled', 'stateless', 'hook', 'forwardRef', 'effect-disc'], hRows, { align: ['l', 'r', 'r', 'r', 'r', 'r', 'r'] })
    : pending('TRIAL=trials/<id> node workbench/oracle/run-accuracy.mjs');
  const cwvRows = rungs.filter((r) => r.cwv && r.cwv.score != null)
    .map((r) => [r.label ?? r.rung, r.cwv.score, r.cwv.lcp?.ms ?? '—', r.cwv.cls?.value ?? '—', r.cwv.tbt?.ms ?? '—']);
  const cwvTable = cwvRows.length
    ? htmlTable(['rung', 'score', 'LCP (ms)', 'CLS', 'TBT (ms)'], cwvRows, { align: ['l', 'r', 'r', 'r', 'r'] })
    : pending('TRIAL=trials/<id> node workbench/oracle/run-accuracy.mjs --render');

  // Token binding (static) — literal-freedom per rung.
  const tbRows = rungs.filter((r) => r.tokenBinding && r.tokenBinding.score != null)
    .map((r) => [r.label ?? r.rung, r.tokenBinding.score, r.tokenBinding.literals, r.tokenBinding.boundRefs]);
  const tbTable = tbRows.length
    ? htmlTable(['rung', 'score', 'literals', 'var(--) refs'], tbRows, { align: ['l', 'r', 'r', 'r'] })
    : pending('TRIAL=trials/<id> node workbench/oracle/run-accuracy.mjs');

  // Efficiency (telemetry-derived) — latency / cache-hit / tool-calls / ttft / per-accuracy cost.
  const effRows = (ts.efficiencyByRung || []).map((e) => [
    e.label ?? e.rung, e.tier, fmt(e.latencyMs), `${Math.round((e.cacheHitRatio ?? 0) * 100)}%`,
    fmt(e.toolUses), fmt(e.ttftAvgMs),
    e.costPerAccuracyPoint == null ? '—' : usd(e.costPerAccuracyPoint),
    e.tokensPerAccuracyPoint == null ? '—' : fmt(e.tokensPerAccuracyPoint),
  ]);
  const effTable = effRows.length
    ? htmlTable(['rung', 'tier', 'latency (ms)', 'cache-hit', 'tool-calls', 'ttft (ms)', '$/acc-pt', 'tok/acc-pt'], effRows,
        { align: ['l', 'l', 'r', 'r', 'r', 'r', 'r', 'r'] })
    : '';

  // Static code health (B/C/G/H)
  const sc = (m) => (m && m.score != null ? m.score : '—');
  const chMean = (ch) => {
    const xs = Object.values(ch).map((m) => m && m.score).filter((s) => s != null);
    return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : '—';
  };
  const chRows = rungs.filter((r) => r.codeHealth).map((r) => {
    const c = r.codeHealth;
    return [r.label ?? r.rung, chMean(c), sc(c.typeStrictness), sc(c.complexity), sc(c.cssHygiene), sc(c.dangerousApi), sc(c.serverClientBoundary), sc(c.rtlReadiness), sc(c.commentEconomy), sc(c.composability), sc(c.namingAdherence), sc(c.propTypeCompleteness)];
  });
  const chTable = chRows.length
    ? htmlTable(['rung', 'health', 'types', 'complexity', 'css', 'dangerous', 'srv/client', 'rtl', 'comments', 'compose', 'naming', 'propTypes'], chRows,
        { align: ['l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'] })
    : pending('TRIAL=trials/<id> node workbench/oracle/run-accuracy.mjs');

  // Design tokens (A)
  const dtRows = rungs.filter((r) => r.tokenSystem).map((r) => {
    const t = r.tokenSystem;
    return [r.label ?? r.rung, `${Math.round((t.semanticAliasRatio ?? 0) * 100)}%`, t.orphanRefs, t.coverage == null ? '—' : t.coverage];
  });
  const dtTable = dtRows.length
    ? htmlTable(['rung', 'semantic-alias', 'orphan refs', 'coverage'], dtRows, { align: ['l', 'r', 'r', 'r'] })
    : pending('TRIAL=trials/<id> node workbench/oracle/run-accuracy.mjs');

  // DOM + render signals + runtime perf (B/C/D)
  const drRows = rungs.filter((r) => r.domShape || r.renderSignals || r.runtimePerf).map((r) => {
    const d = r.domShape, s = r.renderSignals, p = r.runtimePerf;
    const focus = s && s.focusVisible != null ? (s.focusVisible ? '✓' : '✗') : '—';
    return [r.label ?? r.rung, sc(d), d ? d.nodeCount : '—', d ? d.maxDepth : '—', sc(s), focus, s?.keyboardReached ?? '—', p?.mountMs ?? '—', sc(p)];
  });
  const drTable = drRows.length
    ? htmlTable(['rung', 'dom', 'nodes', 'depth', 'render', 'focus', 'keyboard', 'mount (ms)', 'perf'], drRows,
        { align: ['l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'] })
    : pending('TRIAL=trials/<id> node workbench/oracle/run-accuracy.mjs --render');

  // Process & build meta (E/F/G) — trial-level
  const g = (m) => (m == null ? '—' : m.score != null ? `${m.score}` : `— (${m.reason || 'n/a'})`);
  const pm = ts.processMeta || {}, bm = ts.buildMetrics || {};
  const pmRows = [
    ['KG reuse rate', g(pm.reuseRate)], ['Update diff-size', g(pm.updateDiffSize)], ['Retry/error rate', g(pm.retryRate)],
    ['HITL gate count', g(pm.hitlGateCount)], ['Tier-routing accuracy', g(pm.tierRoutingAccuracy)],
    ['Prompt-injection resistance', g(pm.promptInjectionResistance)],
    ['Import cycles', g(bm.circularDeps) + (bm.circularDeps ? ` (${bm.circularDeps.cycleCount}/${bm.circularDeps.nodes})` : '')],
    ['Bundle size (gated)', g(bm.bundleSize)], ['Lint (gated)', g(bm.lintConformance)],
  ];
  const pmTable = (ts.processMeta || ts.buildMetrics) ? htmlTable(['metric', 'value'], pmRows, { align: ['l', 'r'] }) : '';

  // OpenTelemetry report — per-agent cost/ttft + per-rung cost.
  const otel = ts.otelReport;
  const otelTable = otel
    ? htmlTable(['agent', 'requests', 'total tokens', 'output', 'cost', 'ttft (ms)'],
        otel.perAgent.map((a) => [a.agent, fmt(a.requests), fmt(a.tokens.total), fmt(a.tokens.output), usd(a.costUsd), fmt(a.ttftAvgMs)]),
        { align: ['l', 'r', 'r', 'r', 'r', 'r'] })
    : '';

  const data = esc(JSON.stringify(ts));
  const c = ts.comparisons || {};
  const cmp = [
    c.iconFanIn ? `Icon fan-in Δ ${c.iconFanIn.blockedMsDelta} ms` : null,
    c.coldWarm ? `Cold→warm ${c.coldWarm.tokenDeltaPct}%` : null,
    c.buildUpdate ? `Build→update ${c.buildUpdate.tokenDeltaPct}%` : null,
  ].filter(Boolean).map(esc).join(' &nbsp;·&nbsp; ');

  const totalTokens = ts.rollup.perAgent.reduce((s, a) => s + (a.tokens?.total ?? 0), 0);
  const totalCost = ts.rollup.perAgent.reduce((s, a) => s + (a.costUsd ?? 0), 0);
  const cc = ts.rollup.crossCheck || {};
  const scored = qRows.length;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Workbench Trial — ${esc(ts.trialId)}</title>
<style>${THEME_CSS}</style></head>
<body>${atmosphere()}
<div class="wrap">
  <header class="reveal">
    <p class="eyebrow">Workbench · Complexity-ladder benchmark</p>
    <h1>${esc(ts.trialId)}</h1>
    <p class="sub">${cmp || 'Per-rung accuracy, quality &amp; cost across the complexity ladder.'}</p>
  </header>
  <div class="kpis">
    ${kpi('Total tokens', fmt(totalTokens), `across ${rungs.length} rungs`)}
    ${kpi('Total cost', '$' + totalCost.toFixed(2), 'OTEL-metered')}
    ${kpi('Token-dominant', ts.rollup.dominance.tokens)}
    ${kpi('OTEL ↔ costs Δ', (cc.deltaPct ?? 0) + '%', 'cross-check')}
    ${kpi('Quality-scored', scored + ' rungs', '3-vote median panel')}
    ${kpi('Cost-dominant', otel?.costDominantAgent ?? '—', 'by OTEL costUsd')}
  </div>

  <section><div class="panel"><h2>Accuracy by rung (composite)</h2>
    <p class="note">Composite blends visual / style / structural / gates (a build failure caps it). Computed live: target vs HeroUI Storybook render (visual pixel-diff + style) and rendered-DOM + source structural; unavailable sub-scores renormalise away. <code>icon-only</code> / <code>page</code> are out of fidelity scope (shown as 0). Visual / style read low by design — target is <code>designSystem: none</code> vs HeroUI.</p>${accBars}</div></section>

  <section><div class="panel"><h2>Quality by rung (composite)</h2>
    <p class="note">Source judge, <strong>3-vote median panel</strong> per dimension (visual / style need live rendering, not included). <code>icon-only</code> / <code>page</code> are out of scope.</p>${qualBars}${qualityTable}</div></section>

  <section><div class="panel"><h2>Build gates by rung (deterministic)</h2>
    <p class="note">The source-derivable slice of accuracy: <code>tsc</code> + <code>vite build</code> (whole-target) and per-rung unit tests. Visual / style fidelity needs live rendering.</p>${gatesTable}</div></section>

  <section><div class="panel"><h2>Token consumption by rung</h2>
    <p class="note">OTEL-reported tokens per rung (lower is better). <code>cacheRead</code> typically dominates the total — prompt-cache hits are counted but billed cheap.</p>${tokRungBars}${tokRungTable}</div></section>

  <section><div class="panel"><h2>Cost to build by rung</h2>
    <p class="note">OTEL <code>costUsd</code> summed per rung (bars scaled ×10⁴ for visibility at sub-cent values). The cross-check KPI reconciles OTEL totals against the coordinator <code>costs.jsonl</code> ledger.</p>${costRungBars}${costRungTable}</div></section>

  <section><div class="panel"><h2>Accessibility by rung (axe-core)</h2>
    <p class="note">WCAG audit over the rendered story root. Score starts at 100; each violation subtracts a per-impact penalty × min(nodes, cap) (<code>oracle/a11y-weights.json</code>).</p>${a11yTable}</div></section>

  <section><div class="panel"><h2>Stateless &amp; Headless by rung</h2>
    <p class="note">Static source analysis: controlled (prop-driven) API, no internal value state, extracted/headless logic, <code>forwardRef</code>, side-effect discipline (<code>oracle/headless-weights.json</code>).</p>${headlessTable}</div></section>

  <section><div class="panel"><h2>Core Web Vitals by rung</h2>
    <p class="note">Captured via <code>PerformanceObserver</code> in the render harness, scored against Google good/needs-improvement/poor bands (LCP 0.4 · CLS 0.3 · TBT 0.3 — <code>oracle/cwv-weights.json</code>).</p>${cwvTable}</div></section>

  <section><div class="panel"><h2>Token binding by rung</h2>
    <p class="note">Literal-freedom: 100 when no hardcoded design values (hex / <code>rgb()</code> / arbitrary Tailwind values / raw px·rem) are inlined; each literal deducts (<code>oracle/score-token-binding.mjs</code>). Tracks binding rule 4 — styled values should bind to tokens, not inline.</p>${tbTable}</div></section>

  <section><div class="panel"><h2>Efficiency by rung</h2>
    <p class="note">Telemetry-derived, no new capture (<code>analyze/efficiency.mjs</code>): wall-clock latency, prompt-cache hit ratio (<code>cacheRead / total</code>), tool-calls, request-weighted TTFT, and cost/tokens per accuracy-point (— when the rung is unscored).</p>${effTable}</div></section>

  <section><div class="panel"><h2>OpenTelemetry report</h2>
    <p class="note">Per-agent cost, tokens and request-weighted TTFT from the OTEL stream (<code>events.jsonl</code> + <code>spans.jsonl</code>), metered by Claude Code. Cost-dominant agent: <code>${esc(otel?.costDominantAgent ?? '—')}</code>.</p>${otelTable}</div></section>

  <section><div class="panel"><h2>Static code-health by rung</h2>
    <p class="note">Source scan (<code>oracle/metrics/source-static.mjs</code>): type strictness · complexity · CSS hygiene · dangerous APIs · unnecessary <code>"use client"</code> · RTL logical-properties · comment economy (80-char rule) · composability · naming · prop-type/JSDoc. <code>health</code> = mean of sub-scores.</p>${chTable}</div></section>

  <section><div class="panel"><h2>Design tokens by rung</h2>
    <p class="note">Semantic-alias share (tokens aliasing via <code>var()</code>), orphan <code>var(--x)</code> refs, and coverage vs Figma (— when needed-count unavailable) — <code>oracle/metrics/design-tokens.mjs</code>.</p>${dtTable}</div></section>

  <section><div class="panel"><h2>DOM &amp; render by rung</h2>
    <p class="note">DOM nesting/bloat health, focus-visible + keyboard reachability + interaction-ok, and mount-time band. INP / re-renders / memory are capability-gated.</p>${drTable}</div></section>

  <section><div class="panel"><h2>Process &amp; build meta</h2>
    <p class="note">Trial-level. <code>—</code> with a reason = signal not captured in this trial (e.g. determinism needs two runs; reuse-rate needs KG <code>resolution</code> data); the scorers compute once that data exists. Bundle/lint need a build / eslint run.</p>${pmTable}</div></section>

  <section><div class="panel"><h2>Tokens per agent (all rungs)</h2>
    <p class="note">Total tokens attributed to each agent, summed across every rung.</p>${tokenBars}</div></section>

  <section><div class="panel"><h2>Raw trialset</h2>
    <p class="note">The full aggregated trialset object backing this view.</p>
    <script type="application/json" id="trialset-data">${data}</script>
    <details><summary>Show JSON</summary><pre>${data}</pre></details></div></section>

  <footer>Generated ${esc(ts.generatedAt ?? '(unstamped)')} · self-contained · no external assets · ${rungs.length} rungs</footer>
</div>
</body></html>`;
}
