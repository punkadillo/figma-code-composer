// workbench/oracle/score-runtime-perf.mjs
// Runtime performance (category D) from render-harness capture. mountMs is scored
// against a budget; inpMs / reRenders / memoryMB are CAPABILITY-GATED — included in
// the shape and scored only when captured (React profiler / CDP), else null.
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const band = (v, good, poor) => (v <= good ? 100 : v >= poor ? 0 : Math.round(100 - 100 * ((v - good) / (poor - good))));

// perf: { mountMs, inpMs?, reRenders?, memoryMB? } | null
export function scoreRuntimePerf(perf) {
  if (perf == null) return { score: null, source: null };
  const mount = perf.mountMs == null ? null : band(perf.mountMs, 50, 400);
  const inp = perf.inpMs == null ? null : band(perf.inpMs, 200, 500);
  const parts = [mount, inp].filter((x) => x != null);
  return {
    score: parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null,
    source: 'playwright',
    mountMs: perf.mountMs ?? null, mount,
    inpMs: perf.inpMs ?? null, inp,
    reRenders: perf.reRenders ?? null,             // gated (needs React profiler)
    memoryMB: perf.memoryMB ?? null,               // gated (needs CDP heap snapshot)
  };
}
