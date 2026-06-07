// oracle/effective-weights.mjs
// Renormalise the fidelity weights over the sub-scores that are actually
// available, so an unavailable sub-score contributes nothing (weight 0) and
// the remaining weights still sum to 1. buildFailCeiling passes through.
const KEYS = ['visual', 'style', 'structural', 'gates'];

export function effectiveWeights(base, available) {
  const sum = KEYS.reduce((s, k) => s + (available[k] ? base[k] : 0), 0) || 1;
  const out = { buildFailCeiling: base.buildFailCeiling };
  for (const k of KEYS) out[k] = available[k] ? base[k] / sum : 0;
  return out;
}
