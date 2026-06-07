// workbench/report/build-site.mjs
// Assembles the GitHub Pages site from the tracked trial data under
// workbench/reports/<trial>/{trialset.json|results.json}. For each trial it
// regenerates the dashboard HTML (single source of truth = the JSON) into
// _site/<trial>/index.html, then writes a landing _site/index.html that lists
// every trial with headline numbers. No external deps; runs in CI on plain Node.
//
// Usage: node workbench/report/build-site.mjs [outDir]   (default outDir = _site)
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { renderDashboard, renderTrialsetDashboard } from './dashboard.mjs';

const REPORTS_DIR = 'workbench/reports';
const OUT = process.argv[2] || '_site';

function findTrials() {
  if (!existsSync(REPORTS_DIR)) return [];
  return readdirSync(REPORTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const dir = join(REPORTS_DIR, d.name);
      const ts = join(dir, 'trialset.json');
      const rs = join(dir, 'results.json');
      const dataPath = existsSync(ts) ? ts : existsSync(rs) ? rs : null;
      return dataPath ? { slug: d.name, dataPath } : null;
    })
    .filter(Boolean);
}

const num = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : null);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtUsd = (n) => (n == null ? '—' : '$' + n.toFixed(2));
const fmtTokens = (n) =>
  n == null ? '—' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n);

function headline(r) {
  const rungs = Array.isArray(r.rungs) ? r.rungs.length : null;
  const perAgent = (r.rollup && r.rollup.perAgent) || [];
  const cost = perAgent.length ? perAgent.reduce((s, a) => s + (num(a.costUsd) ?? 0), 0) : null;
  const tokens =
    num(r.rollup && r.rollup.crossCheck && r.rollup.crossCheck.otelTotalTokens) ??
    (perAgent.length ? perAgent.reduce((s, a) => s + (num(a.tokens && a.tokens.total) ?? 0), 0) : null);
  return { rungs, cost, tokens, generatedAt: r.generatedAt ?? null };
}

function landing(cards) {
  const rows = cards
    .map(
      (c) => `
      <a class="card" href="./${esc(c.slug)}/">
        <div class="card-head">
          <h2>${esc(c.trialId)}</h2>
          <span class="open">Open dashboard →</span>
        </div>
        <dl class="stats">
          <div><dt>Rungs</dt><dd>${c.rungs ?? '—'}</dd></div>
          <div><dt>Tokens</dt><dd>${fmtTokens(c.tokens)}</dd></div>
          <div><dt>Cost</dt><dd>${fmtUsd(c.cost)}</dd></div>
          <div><dt>Generated</dt><dd>${c.generatedAt ? esc(String(c.generatedAt).slice(0, 10)) : '—'}</dd></div>
        </dl>
      </a>`
    )
    .join('\n');

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>figma-code-composer — Workbench</title>
<style>
  :root { color-scheme: light dark; --bg:#0b0d12; --panel:#141821; --ink:#e7ebf3; --muted:#8b93a7; --line:#222838; --accent:#7c9cff; }
  * { box-sizing: border-box; }
  body { margin:0; font:15px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; background:var(--bg); color:var(--ink); }
  .wrap { max-width:1040px; margin:0 auto; padding:48px 24px 72px; }
  header h1 { margin:0 0 6px; font-size:28px; letter-spacing:-.02em; }
  header p { margin:0 0 36px; color:var(--muted); }
  .grid { display:grid; gap:18px; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); }
  .card { display:block; text-decoration:none; color:inherit; background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:20px 22px; transition:border-color .15s, transform .15s; }
  .card:hover { border-color:var(--accent); transform:translateY(-2px); }
  .card-head { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:16px; }
  .card-head h2 { margin:0; font-size:18px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
  .open { color:var(--accent); font-size:13px; white-space:nowrap; }
  .stats { display:grid; grid-template-columns:repeat(2,1fr); gap:10px 18px; margin:0; }
  .stats dt { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.04em; }
  .stats dd { margin:2px 0 0; font-size:18px; font-weight:600; font-variant-numeric:tabular-nums; }
  .empty { color:var(--muted); background:var(--panel); border:1px dashed var(--line); border-radius:14px; padding:32px; text-align:center; }
  footer { margin-top:48px; color:var(--muted); font-size:13px; }
  footer a { color:var(--accent); }
</style>
</head><body><div class="wrap">
  <header>
    <h1>Workbench</h1>
    <p>figma-code-composer benchmark trials — accuracy, quality, gates, and cost per run.</p>
  </header>
  ${cards.length ? `<div class="grid">${rows}\n  </div>` : `<div class="empty">No trials found under <code>workbench/reports/</code>.</div>`}
  <footer>Generated from <code>workbench/reports/*/trialset.json</code> · <a href="https://github.com/raveracker/figma-code-composer">source</a></footer>
</div></body></html>`;
}

const trials = findTrials();
mkdirSync(OUT, { recursive: true });

const cards = [];
for (const t of trials) {
  const r = JSON.parse(readFileSync(t.dataPath, 'utf8'));
  const isTrialset = Array.isArray(r.accuracyByRung);
  const html = isTrialset ? renderTrialsetDashboard(r) : renderDashboard(r);
  mkdirSync(join(OUT, t.slug), { recursive: true });
  writeFileSync(join(OUT, t.slug, 'index.html'), html);
  cards.push({ slug: t.slug, trialId: r.trialId ?? basename(t.slug), ...headline(r) });
}

cards.sort((a, b) => String(b.slug).localeCompare(String(a.slug)));
writeFileSync(join(OUT, 'index.html'), landing(cards));
console.error(`[site] wrote ${OUT}/index.html + ${cards.length} trial dashboard(s): ${cards.map((c) => c.slug).join(', ') || '(none)'}`);
