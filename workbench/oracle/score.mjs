// workbench/oracle/score.mjs
// Weighted composite of the four dimensions. A failed build gate caps the score.
import { GATES } from './score-gates.mjs';

export function composeAccuracy({ visual, style, structural, gates }, weights) {
  const gatesPassed = GATES.filter((g) => gates[g]).length;
  const gateScore = (gatesPassed / GATES.length) * 100;
  const raw =
    weights.visual * visual.score +
    weights.style * style.matchRate +
    weights.structural * structural.score +
    weights.gates * gateScore;
  let composite = Math.round(raw);
  let cappedAt = null;
  if (gates.build === false && composite > weights.buildFailCeiling) {
    composite = weights.buildFailCeiling;
    cappedAt = weights.buildFailCeiling;
  }
  return {
    composite,
    cappedAt,
    visual, style, structural, gates,
    weights: { visual: weights.visual, style: weights.style, structural: weights.structural, gates: weights.gates },
  };
}
