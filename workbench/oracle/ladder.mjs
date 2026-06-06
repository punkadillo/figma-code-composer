// workbench/oracle/ladder.mjs
// The complexity ladder for the heroui-20260606 trial. Component rungs score
// against HeroUI Storybook; the template (dashboard) rung against the closest
// storybook demo; tokens against packages/styles. icon-only checks icon a11y.
export const LADDER = [
  { rung: 'icon-only', tier: 'trivial',  oracle: 'storybook' },
  { rung: 'tokens',    tier: 'moderate', oracle: 'styles' },
  { rung: 'atom',      tier: 'trivial',  oracle: 'storybook' },
  { rung: 'chip',      tier: 'trivial',  oracle: 'storybook' },
  { rung: 'molecule',  tier: 'moderate', oracle: 'storybook' },
  { rung: 'switch',    tier: 'moderate', oracle: 'storybook' },
  { rung: 'organism',  tier: 'complex',  oracle: 'storybook' },
  { rung: 'all-icons', tier: 'complex',  oracle: 'storybook' },
  { rung: 'tabs',      tier: 'complex',  oracle: 'storybook' },
  { rung: 'template',  tier: 'complex',  oracle: 'storybook-demo' },
  { rung: 'extreme',   tier: 'extreme',  oracle: 'storybook' },
];

export function oracleSourceFor(rung) {
  const r = LADDER.find((x) => x.rung === rung);
  return r ? r.oracle : 'figma';
}
