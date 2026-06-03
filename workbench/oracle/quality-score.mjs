// workbench/oracle/quality-score.mjs
import { DIMS } from './quality/dimensions.mjs';

// dims: scoreDimensions output; weights: quality-weights.json `dimensions` block
export function composeQuality(dims, weights) {
  const composite = Math.round(DIMS.reduce((s, d) => s + weights[d] * dims[d].score, 0));
  return { composite, dimensions: dims, weights };
}
