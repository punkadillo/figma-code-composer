// workbench/runner/run-manifest-builder.mjs
// Pure: resolve a runId against the trial's runs config + a captured window into
// the single-run run-manifest.json shape build-results consumes. The figma
// slash-command string is derived from the run's command + nodeId + fileKey.

const DEGRADED_SCRATCH_MARKERS = ['contract.json', 'mcp-probe.sh', 'mcp-call.sh'];

/**
 * A trial is scorable only if the fetch genuinely reached MCP and left no
 * degraded-fallback markers. Guards against scoring fabricated manifests from
 * a subprocess that never had MCP scope (workbench RCA 06).
 */
export function isScorableTrial({ manifest, scratchFiles = [], zeroByteFetcherOutput = false } = {}) {
  if (!manifest || manifest.reachabilityStatus !== 'ok') return false;
  if (zeroByteFetcherOutput) return false;
  if (scratchFiles.some((f) => DEGRADED_SCRATCH_MARKERS.includes(f))) return false;
  return true;
}

// cfg: parsed ladder-nodes.json ({ trialId, runs: [...] }); runId: which run;
// startedAt/endedAt: ISO strings; fileKey: optional, for the command string.
export function buildRunManifest(cfg, runId, startedAt, endedAt, fileKey = cfg.fileKey) {
  const run = (cfg.runs || []).find((r) => r.runId === runId);
  if (!run) throw new Error(`buildRunManifest: unknown runId "${runId}" (not in ladder-nodes.json runs)`);
  const node = String(run.nodeId || '').replace(':', '-');
  const url = fileKey
    ? `https://www.figma.com/design/${fileKey}/?node-id=${node}`
    : run.nodeId;
  return {
    trialId: cfg.trialId,
    runs: [{
      runId: run.runId,
      rung: run.rung,
      tier: run.tier,
      nodeId: run.nodeId,
      command: `/${run.command} ${url}`,
      scenario: { icon: !!run.icon, tier: run.tier, cache: run.cache, mode: run.mode },
      startedAt,
      endedAt,
    }],
  };
}
