// workbench/report/build-site.mjs
// Assembles the GitHub Pages site from the tracked trial data under
// workbench/reports/<trial>/{trialset.json|results.json}. The dashboard is
// shown DIRECTLY at the site root (no intermediate landing page); each trial is
// also written to _site/<slug>/index.html for direct linking. The dashboard is
// regenerated from the JSON (single source of truth = the tracked data). The
// trial data is design-system-agnostic — the oracle is referred to generically as
// "reference". No external deps; runs in CI on plain Node.
//
// Usage: node workbench/report/build-site.mjs [outDir]   (default outDir = _site)
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
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

const trials = findTrials();
mkdirSync(OUT, { recursive: true });

const built = [];
for (const t of trials) {
  const r = JSON.parse(readFileSync(t.dataPath, 'utf8'));
  const isTrialset = Array.isArray(r.accuracyByRung);
  const html = isTrialset ? renderTrialsetDashboard(r) : renderDashboard(r);
  const slug = t.slug;
  mkdirSync(join(OUT, slug), { recursive: true });
  writeFileSync(join(OUT, slug, 'index.html'), html);
  built.push({ srcSlug: t.slug, slug, html });
}

// Root shows the dashboard directly — the latest trial (by slug, newest first).
built.sort((a, b) => String(b.srcSlug).localeCompare(String(a.srcSlug)));
if (built.length) writeFileSync(join(OUT, 'index.html'), built[0].html);

console.error(
  `[site] root = ${built[0]?.slug ?? '(none)'} dashboard; ${built.length} trial page(s): ${built.map((b) => b.slug).join(', ') || '(none)'}`
);
