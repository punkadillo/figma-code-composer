// workbench/oracle/metrics/code.mjs
// Pure code metrics over a source string. complexity is a branch-keyword PROXY
// for cyclomatic complexity (not a real CC), documented as such. metricScore
// maps raw measures to 0-100 (higher = leaner) against soft caps.

// Branch-keyword proxy for cyclomatic complexity (not real CC). The ternary `?`
// is matched only when it is NOT `?.` (optional chaining), `??` (nullish), or
// `a?:` (TS optional prop) — those are not branches.
const BRANCH = /\b(if|for|while|case|catch)\b|&&|\|\||(?<!\?)\?(?![.?:])/g;

export function codeMetrics(src = '') {
  const loc = src.split('\n').filter((l) => l.trim() !== '').length;
  const imports = (src.match(/^\s*import\b/gm) || []).length;
  const complexity = (src.match(BRANCH) || []).length;
  const size = src.length;
  const complexityPenalty = Math.min(1, complexity / 20);
  const sizePenalty = Math.min(1, size / 4000);
  const metricScore = Math.round(100 * (1 - 0.6 * complexityPenalty - 0.4 * sizePenalty));
  return { loc, imports, complexity, size, metricScore: Math.max(0, metricScore) };
}
