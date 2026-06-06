// workbench/oracle/ladder.mjs
// The complexity ladder for the heroui-20260606 trial. Rungs are named by
// COMPLEXITY tier (trivial/moderate/complex/extreme), not a design methodology.
// Component rungs score against HeroUI Storybook; the dashboard rung against the
// closest storybook demo; tokens against packages/styles; trivial-icon checks
// icon a11y.
export const LADDER = [
  { rung: 'trivial-icon',      tier: 'trivial',  oracle: 'storybook' },
  { rung: 'tokens',            tier: 'moderate', oracle: 'styles' },
  { rung: 'trivial-button',    tier: 'trivial',  oracle: 'storybook' },
  { rung: 'trivial-chip',      tier: 'trivial',  oracle: 'storybook' },
  { rung: 'moderate-input',    tier: 'moderate', oracle: 'storybook' },
  { rung: 'moderate-switch',   tier: 'moderate', oracle: 'storybook' },
  { rung: 'complex-card',      tier: 'complex',  oracle: 'storybook' },
  { rung: 'complex-alert',     tier: 'complex',  oracle: 'storybook' },
  { rung: 'complex-tabs',      tier: 'complex',  oracle: 'storybook' },
  { rung: 'complex-dashboard', tier: 'complex',  oracle: 'storybook-demo' },
  { rung: 'extreme-calendar',  tier: 'extreme',  oracle: 'storybook' },
];

export function oracleSourceFor(rung) {
  const r = LADDER.find((x) => x.rung === rung);
  return r ? r.oracle : 'figma';
}
