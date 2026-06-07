// workbench/runner/matrix.mjs
// Scenario matrix (spec §9). Each entry is a tag-set the operator runs once.
export function defaultMatrix() {
  return [
    // icon fan-in pair (held at moderate tier, cold cache, build mode)
    { id: 'icon-yes', icon: true,  tier: 'moderate', cache: 'cold', mode: 'build' },
    { id: 'icon-no',  icon: false, tier: 'moderate', cache: 'cold', mode: 'build' },
    // complexity tiers (icon-free, cold, build)
    { id: 'tier-trivial', icon: false, tier: 'trivial', cache: 'cold', mode: 'build' },
    { id: 'tier-complex', icon: false, tier: 'complex', cache: 'cold', mode: 'build' },
    { id: 'tier-extreme', icon: false, tier: 'extreme', cache: 'cold', mode: 'build' },
    // cold vs warm cache (same component, second build is warm)
    { id: 'cache-warm', icon: false, tier: 'moderate', cache: 'warm', mode: 'build' },
    // build vs update (update a changed node)
    { id: 'mode-update', icon: false, tier: 'moderate', cache: 'warm', mode: 'update' },
  ];
}

export function makeRunRow({ runId, command, scenario, startedAt, endedAt }) {
  return { runId, command, scenario, startedAt, endedAt };
}
