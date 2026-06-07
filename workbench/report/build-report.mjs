// workbench/report/build-report.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { renderMarkdown, renderTrialsetMarkdown } from './markdown.mjs';
import { renderDashboard, renderTrialsetDashboard } from './dashboard.mjs';

// generatedAt is passed in (Date.now is unavailable in some harness contexts).
export function buildReport(resultsPath, generatedAt) {
  const r = JSON.parse(readFileSync(resultsPath, 'utf8'));
  r.generatedAt = generatedAt ?? r.generatedAt ?? null;
  const isTrialset = Array.isArray(r.accuracyByRung);
  const dir = dirname(resultsPath);
  writeFileSync(join(dir, 'report.md'), isTrialset ? renderTrialsetMarkdown(r) : renderMarkdown(r));
  writeFileSync(join(dir, 'dashboard.html'), isTrialset ? renderTrialsetDashboard(r) : renderDashboard(r));
  return { md: join(dir, 'report.md'), html: join(dir, 'dashboard.html') };
}

// CLI: node build-report.mjs <results.json> [generatedAtISO]
if (import.meta.url === `file://${process.argv[1]}`) {
  const [resultsPath, generatedAt] = process.argv.slice(2);
  if (!resultsPath) { console.error('usage: build-report.mjs <results.json> [generatedAtISO]'); process.exit(1); }
  const out = buildReport(resultsPath, generatedAt || new Date().toISOString());
  console.error(`[report] wrote ${out.md} and ${out.html}`);
}
