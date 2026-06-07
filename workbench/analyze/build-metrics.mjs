// workbench/analyze/build-metrics.mjs
// Build-dependent metrics (category B). bundleSize + lintConformance are
// CAPABILITY-GATED (need a bundler / eslint run — null+reason otherwise).
// circularDeps is real: pure cycle detection over an import graph.
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const band = (v, good, poor) => (v <= good ? 100 : v >= poor ? 0 : Math.round(100 - 100 * ((v - good) / (poor - good))));

// Gated: gzipped component bytes (good ≤5KB, poor ≥50KB).
export function bundleSize(gzipBytes = null) {
  if (gzipBytes == null) return { score: null, reason: 'no-build' };
  const kb = gzipBytes / 1024;
  return { score: clamp(band(kb, 5, 50)), gzipKb: Math.round(kb * 10) / 10 };
}

// Gated: eslint/biome JSON report (counts errors/warnings).
export function lintConformance(report = null) {
  if (!Array.isArray(report)) return { score: null, reason: 'no-lint-run' };
  let errors = 0, warnings = 0;
  for (const f of report) { errors += f.errorCount || 0; warnings += f.warningCount || 0; }
  return { score: clamp(100 - errors * 10 - warnings * 3), errors, warnings };
}

// Real: detect import cycles. graph: { node: [dep, ...] }. Pure DFS.
export function circularDeps(graph = {}) {
  const nodes = Object.keys(graph);
  const cycles = [];
  const state = new Map(); // 0=unvisited 1=in-stack 2=done
  const stack = [];
  const dfs = (n) => {
    state.set(n, 1); stack.push(n);
    for (const dep of graph[n] || []) {
      if (!(dep in graph)) continue;
      if (state.get(dep) === 1) cycles.push([...stack.slice(stack.indexOf(dep)), dep].join(' → '));
      else if (!state.get(dep)) dfs(dep);
    }
    stack.pop(); state.set(n, 2);
  };
  for (const n of nodes) if (!state.get(n)) dfs(n);
  return { score: cycles.length ? clamp(100 - cycles.length * 25) : 100, cycleCount: cycles.length, cycles, nodes: nodes.length };
}
