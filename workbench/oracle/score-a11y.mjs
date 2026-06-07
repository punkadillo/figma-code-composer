// workbench/oracle/score-a11y.mjs
// Accessibility score from an axe-core run captured in the render harness.
// Pure: takes the axe results object, returns a 0..100 score + violation summary.
// 100 = no violations; each violation subtracts penalty[impact] × min(nodes, perNodeCap).
import { readFileSync } from 'node:fs';

export const A11Y_WEIGHTS = JSON.parse(
  readFileSync(new URL('./a11y-weights.json', import.meta.url), 'utf8'),
);

const clamp = (n, floor = 0) => Math.max(floor, Math.min(100, Math.round(n)));

// axe: { violations: [{ id, impact, nodes: [...] }], passes?: [...] } | null
export function scoreA11y(axe, weights = A11Y_WEIGHTS) {
  if (axe == null) return { score: null, source: null, violations: [], violationCount: 0, nodeCount: 0 };
  const { penalty = {}, perNodeCap = 3, floor = 0 } = weights;
  const violations = (axe.violations || []).map((v) => ({
    id: v.id,
    impact: v.impact || 'minor',
    nodes: Array.isArray(v.nodes) ? v.nodes.length : (v.nodes ?? 0),
  }));
  let deduction = 0;
  let nodeCount = 0;
  for (const v of violations) {
    const base = penalty[v.impact] ?? penalty.minor ?? 0;
    deduction += base * Math.min(v.nodes || 1, perNodeCap);
    nodeCount += v.nodes || 0;
  }
  return {
    score: clamp(100 - deduction, floor),
    source: 'axe',
    violations,
    violationCount: violations.length,
    nodeCount,
    passCount: Array.isArray(axe.passes) ? axe.passes.length : (axe.passes ?? 0),
  };
}
