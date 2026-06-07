// workbench/oracle/score-cwv.mjs
// Core Web Vitals score from runtime metrics captured in the render harness.
// Pure: takes { lcpMs, cls, tbtMs }, returns a 0..100 composite + per-metric ratings.
// Per metric: good→100, good..poor linear 100→50, beyond poor linear 50→0 (Google bands).
import { readFileSync } from 'node:fs';

export const CWV_WEIGHTS = JSON.parse(
  readFileSync(new URL('./cwv-weights.json', import.meta.url), 'utf8'),
);

const clamp = (n) => Math.max(0, Math.min(100, n));

// lower-is-better metric → subscore + rating against good/poor thresholds
function metricScore(value, { good, poor }) {
  let score;
  if (value <= good) score = 100;
  else if (value <= poor) score = 100 - 50 * ((value - good) / (poor - good));
  else score = Math.max(0, 50 - 50 * ((value - poor) / (poor - good || 1)));
  const rating = value <= good ? 'good' : value <= poor ? 'needs-improvement' : 'poor';
  return { score: Math.round(clamp(score)), rating };
}

// metrics: { lcpMs, cls, tbtMs } | null
export function scoreCwv(metrics, weights = CWV_WEIGHTS) {
  if (metrics == null) return { score: null, source: null, lcp: null, cls: null, tbt: null };
  const lcp = metricScore(metrics.lcpMs ?? 0, weights.lcp);
  const cls = metricScore(metrics.cls ?? 0, weights.cls);
  const tbt = metricScore(metrics.tbtMs ?? 0, weights.tbt);
  const composite = Math.round(
    weights.lcp.weight * lcp.score + weights.cls.weight * cls.score + weights.tbt.weight * tbt.score,
  );
  return {
    score: composite,
    source: 'playwright',
    lcp: { ms: metrics.lcpMs ?? null, ...lcp },
    cls: { value: metrics.cls ?? null, ...cls },
    tbt: { ms: metrics.tbtMs ?? null, ...tbt },
  };
}
