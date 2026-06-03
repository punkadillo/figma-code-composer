// workbench/oracle/ladder.mjs
// The 7-rung complexity ladder (spec §3). Oracle source per rung: component
// rungs score against HeroUI Storybook; template/page against the Figma node.
export const LADDER = [
  { rung: 'icon-only', tier: 'trivial', oracle: 'storybook' },
  { rung: 'atom',      tier: 'trivial', oracle: 'storybook' },
  { rung: 'molecule',  tier: 'moderate', oracle: 'storybook' },
  { rung: 'organism',  tier: 'complex',  oracle: 'storybook' },
  { rung: 'template',  tier: 'complex',  oracle: 'figma' },
  { rung: 'page',      tier: 'extreme',  oracle: 'figma' },
  { rung: 'all-icons', tier: 'complex',  oracle: 'storybook' },
];

export function oracleSourceFor(rung) {
  const r = LADDER.find((x) => x.rung === rung);
  return r ? r.oracle : 'figma';
}
