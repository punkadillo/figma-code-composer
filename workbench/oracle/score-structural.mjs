// workbench/oracle/score-structural.mjs
// Structural similarity: tag:role token-sequence overlap + prop-surface Jaccard.

export function flattenTree(node, out = []) {
  if (!node) return out;
  out.push(`${node.tag ?? ''}:${node.role ?? ''}`);
  for (const c of node.children || []) flattenTree(c, out);
  return out;
}

// Multiset overlap ratio: |intersection| / max(|a|,|b|).
function seqOverlap(a, b) {
  if (a.length === 0 && b.length === 0) return 1;
  const counts = new Map();
  for (const t of a) counts.set(t, (counts.get(t) || 0) + 1);
  let inter = 0;
  for (const t of b) { const c = counts.get(t) || 0; if (c > 0) { inter++; counts.set(t, c - 1); } }
  return inter / Math.max(a.length, b.length);
}

function jaccard(a, b) {
  const sa = new Set(a), sb = new Set(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 1 : inter / union;
}

export function scoreStructural(generated, reference, { treeWeight = 0.6, propWeight = 0.4 } = {}) {
  const tree = seqOverlap(flattenTree(generated.tree), flattenTree(reference.tree));
  const prop = jaccard(generated.props || [], reference.props || []);
  const score = Math.round((tree * treeWeight + prop * propWeight) * 100);
  return { score, tree: Math.round(tree * 100), prop: Math.round(prop * 100) };
}
