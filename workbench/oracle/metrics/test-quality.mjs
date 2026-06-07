// workbench/oracle/metrics/test-quality.mjs
// Test-quality metrics (category F). storyVariantCoverage is static; coveragePct and
// mutationScore are CAPABILITY-GATED — they return null + reason unless the tool's
// output JSON is supplied (real line coverage / Stryker), never faked.
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

// Static: do the stories cover the component's variants?
export function storyVariantCoverage({ storyCount = 0, variantCount = null } = {}) {
  if (variantCount == null) return { score: null, reason: 'no-variant-data' };
  if (variantCount === 0) return { score: 100, storyCount, variantCount, ratio: 1 };
  const ratio = Math.min(1, storyCount / variantCount);
  return { score: clamp(ratio * 100), storyCount, variantCount, ratio: Math.round(ratio * 100) / 100 };
}

// Gated: real line/branch coverage from an istanbul/c8 coverage-summary.json.
export function coveragePct(summary = null) {
  if (!summary) return { score: null, reason: 'no-coverage-run' };
  const pct = summary.total?.lines?.pct ?? summary.total?.statements?.pct ?? null;
  return pct == null ? { score: null, reason: 'no-line-pct' } : { score: clamp(pct), linesPct: pct };
}

// Gated: mutation score from a Stryker mutation-report.json.
export function mutationScore(report = null) {
  if (!report) return { score: null, reason: 'no-mutation-run' };
  const s = report.mutationScore ?? report.metrics?.mutationScore ?? null;
  return s == null ? { score: null, reason: 'no-score-field' } : { score: clamp(s), mutationScore: s };
}
