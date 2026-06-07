// workbench/oracle/metrics/dom-shape.mjs
// DOM-shape health (category B) from the rendered tree already captured by the
// render harness (run.* dom). Pure: penalizes over-nesting and node bloat ("divitis").
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

export function domShape(tree, { depthBudget = 8, nodeBudget = 40 } = {}) {
  if (!tree) return { score: null, nodeCount: 0, maxDepth: 0 };
  let nodeCount = 0, maxDepth = 0;
  const walk = (n, d) => {
    nodeCount += 1;
    if (d > maxDepth) maxDepth = d;
    for (const c of n.children || []) walk(c, d + 1);
  };
  walk(tree, 1);
  const depthPenalty = Math.max(0, maxDepth - depthBudget) * 6;
  const bloatPenalty = Math.max(0, nodeCount - nodeBudget) * 1.5;
  return { score: clamp(100 - depthPenalty - bloatPenalty), nodeCount, maxDepth };
}
