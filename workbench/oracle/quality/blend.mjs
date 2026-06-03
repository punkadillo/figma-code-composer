// workbench/oracle/quality/blend.mjs
// Blend one dimension's metric sub-score with its judge median by ratio.
export function blendDimension(metric, judge, { metricWeight, judgeWeight }) {
  const score = Math.round(metricWeight * metric + judgeWeight * judge.score);
  return { score, metric, judge };
}
