// workbench/runner/run-manifest-builder.mjs
// Pure: resolve a runId against the trial's runs config + a captured window into
// the single-run run-manifest.json shape build-results consumes. The figma
// slash-command string is derived from the run's command + nodeId + fileKey.

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
