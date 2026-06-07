// workbench/oracle/metrics/design-tokens.mjs
// Design-system token metrics (category A). Pure: takes concatenated token-file CSS
// (+ optional needed-count + component sources), returns coverage / semantic-layer /
// orphan-ref scores. Coverage is null when the needed (manifest) count is unknown.

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

// Parse `--name: value;` definitions from token CSS.
function parseDefs(css = '') {
  const defs = new Map();
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) defs.set(m[1].trim(), m[2].trim());
  return defs;
}

export function designTokenMetrics({ tokenCss = '', neededCount = null, componentSrcs = [] } = {}) {
  const defs = parseDefs(tokenCss);
  const emitted = [...defs.keys()];
  const emittedCount = emitted.length;

  // Semantic-layer correctness: of the tokens whose value references another token
  // (aliases), what share alias via var() rather than inlining a literal.
  let aliasing = 0, literalSemantic = 0;
  for (const v of defs.values()) {
    if (/var\(\s*--/.test(v)) aliasing += 1;
    else if (/#|rgb|hsl|\d/.test(v)) literalSemantic += 1;
  }
  const semanticAliasRatio = (aliasing + literalSemantic) ? Math.round((aliasing / (aliasing + literalSemantic)) * 100) / 100 : 0;

  // Orphan refs: var(--x) used in components but not defined in the token files.
  const emittedSet = new Set(emitted);
  const orphans = new Set();
  for (const src of componentSrcs)
    for (const m of (src.match(/var\(\s*(--[\w-]+)/g) || []))
      { const name = m.replace(/var\(\s*/, ''); if (!emittedSet.has(name)) orphans.add(name); }

  const coverage = neededCount ? clamp((emittedCount / neededCount) * 100) : null;

  return {
    emittedCount,
    neededCount,
    coverage,                         // null when needed-count unknown
    semanticAliasRatio,               // 0..1
    semanticScore: clamp(semanticAliasRatio * 100),
    orphanRefs: orphans.size,
    orphanScore: orphans.size === 0 ? 100 : clamp(100 - orphans.size * 15),
  };
}
