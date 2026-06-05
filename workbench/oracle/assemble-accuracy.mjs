// oracle/assemble-accuracy.mjs
// Pure assembler: takes the four sub-scores (visual/style may be null when
// unavailable) + base fidelity weights, renormalises the weights over what is
// available, runs the existing composeAccuracy, and annotates availability.
import { composeAccuracy } from './score.mjs';
import { effectiveWeights } from './effective-weights.mjs';

export function assembleAccuracy({ visual, style, structural, gates }, baseWeights) {
  const availability = {
    visual: visual != null,
    style: style != null,
    structural: structural != null,
    gates: gates != null,
  };
  const weights = effectiveWeights(baseWeights, availability);
  const acc = composeAccuracy({
    visual: visual ?? { diffPct: 100, score: 0 },        // weight 0 → contributes nothing
    style: style ?? { matchRate: 0, properties: {} },    // weight 0 → contributes nothing
    structural: structural ?? { score: 0 },
    gates: gates ?? {},
  }, weights);
  // Null out unavailable sub-scores so the report renders `—`, not a misleading 0.
  if (!availability.visual) acc.visual = null;
  if (!availability.style) acc.style = null;
  acc.availability = availability;
  return acc;
}
