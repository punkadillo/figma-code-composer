// oracle/assemble-accuracy.mjs
// Pure assembler: takes the four sub-scores (visual/style may be null when
// unavailable) + base fidelity weights, renormalises the weights over what is
// available, runs the existing composeAccuracy, and annotates availability.
import { composeAccuracy } from './score.mjs';
import { effectiveWeights } from './effective-weights.mjs';

export function assembleAccuracy({ visual, style, structuralSource, structuralDom, gates }, baseWeights) {
  const structural = structuralDom ?? structuralSource;   // rendered DOM preferred, source fallback
  const availability = {
    visual: visual != null,
    style: style != null,
    structural: structural != null,
    gates: gates != null,
  };
  const weights = effectiveWeights(baseWeights, availability);
  const acc = composeAccuracy({
    visual: visual ?? { diffPct: 100, score: 0 },
    style: style ?? { matchRate: 0, properties: {} },
    structural: structural ?? { score: 0 },
    gates: gates ?? {},
  }, weights);
  if (!availability.visual) acc.visual = null;
  if (!availability.style) acc.style = null;
  acc.structuralSource = structuralSource ?? null;
  acc.structuralDom = structuralDom ?? null;
  acc.availability = availability;
  return acc;
}
