// workbench/oracle/tokens-measurables.mjs
// Computes the reference-20260606 "NEW measurables" (STEPS.md §Review criteria) and
// writes <TRIAL>/measurables.json. Read-only over the target + results.json.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TRIAL = process.env.TRIAL || 'workbench/trials/example';
const tgt = join(TRIAL, 'target');
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
const countProps = (css) => (css.match(/^\s*--[a-zA-Z0-9-]+\s*:/gm) || []).length;
const countVars = (css) => (css.match(/var\(--[a-zA-Z0-9-]+/g) || []).length;
const hasDark = (css) => /prefers-color-scheme\s*:\s*dark|\.dark\b|\[data-theme|data-mode/.test(css);
const runTok = (runId) => {
  const f = join(TRIAL, runId, 'results.json');
  if (!existsSync(f)) return null;
  const run = JSON.parse(readFileSync(f, 'utf8')).runs[0];
  return (run.agents || []).reduce((s, a) => s + a.tokens.total, 0);
};

const prim = read(join(tgt, 'src/styles/tokens/primitives.css'));
const sem = read(join(tgt, 'src/styles/tokens/semantic.css'));
const comp = read(join(tgt, 'src/styles/tokens/components.css'));
const firstLine = (p) => read(join(tgt, p)).split('\n')[0] || '';

const m = {
  tokens: {
    primitivesCount: countProps(prim),
    semanticCount: countProps(sem),
    componentsCount: countProps(comp),
    totalCount: countProps(prim) + countProps(sem) + countProps(comp),
    oracleApprox: 87,
    semanticNonEmpty: countProps(sem) > 0,
    semanticAliasesPrimitives: countVars(sem) > 0,
    semanticAliasRatio: `${countVars(sem)}/${countProps(sem)}`,
    darkModeEmitted: hasDark(prim) || hasDark(sem) || hasDark(comp),
    modesEmitted: (hasDark(prim) || hasDark(sem) || hasDark(comp)) ? ['light', 'dark'] : ['light'],
  },
  clientDirective: {
    'moderate-switch': /['"]use client['"]/.test(firstLine('src/components/Switch/Switch.tsx')),
    'moderate-input': /['"]use client['"]/.test(firstLine('src/components/Input/Input.tsx')),
    note: 'target is Vite + React 19 (no RSC); directive not required but tracked',
  },
  compoundApi: {
    'complex-card': {
      compound: /export\s*\{\s*Card(Header|Footer)/.test(read(join(tgt, 'src/components/Card/index.ts'))),
      surface: 'Card + CardHeader + CardFooter (composable sub-components)',
    },
    'complex-tabs': {
      compound: /export\s*\{\s*Tab\b/.test(read(join(tgt, 'src/components/Tabs/index.ts'))),
      surface: 'Tabs + Tab (compound)',
    },
  },
  tokenCostPerRung: {},
  comparisons: {
    dashboardVsAlert: null,
    coldWarmInput: null,
    buildUpdateInput: null,
  },
};

const RUNS = ['trivial-icon', 'tokens', 'trivial-button', 'trivial-chip', 'moderate-input-cold',
  'moderate-switch', 'complex-card', 'complex-alert', 'complex-tabs', 'complex-dashboard',
  'extreme-calendar', 'moderate-input-warm', 'moderate-input-update'];
for (const r of RUNS) { const t = runTok(r); if (t != null) m.tokenCostPerRung[r] = t; }

const pct = (from, to) => (from ? Math.round(((to - from) / from) * 100) : null);
const dash = m.tokenCostPerRung['complex-dashboard'], alert = m.tokenCostPerRung['complex-alert'];
const cold = m.tokenCostPerRung['moderate-input-cold'], warm = m.tokenCostPerRung['moderate-input-warm'];
const upd = m.tokenCostPerRung['moderate-input-update'];
m.comparisons.dashboardVsAlert = { dashboard: dash, alertBaseline: alert, ratio: alert ? +(dash / alert).toFixed(2) : null, deltaPct: pct(alert, dash) };
m.comparisons.coldWarmInput = { cold, warm, deltaPct: pct(cold, warm) };
m.comparisons.buildUpdateInput = { build: cold, update: upd, deltaPct: pct(cold, upd) };

writeFileSync(join(TRIAL, 'measurables.json'), JSON.stringify(m, null, 2));
console.log(JSON.stringify(m, null, 2));
