// workbench/oracle/quality-prep.mjs
// Deterministic prep for the 3-vote quality pass: assemble each scored rung's
// artifact bundle (component/stories/tests/docs), compute metric sub-scores, and
// emit a per-rung judge spec (artifact + oracle paths) the judge agents read.
// Writes /tmp/judge-heroui/{metrics.json, <rung>.spec.json}. No results mutation.
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { RUNG_MAP } from './rung-map.mjs';
import { codeMetrics } from './metrics/code.mjs';
import { surfaceMetrics } from './metrics/surface.mjs';
import { metricSubScores } from './quality/dimensions.mjs';

const TRIAL = process.env.TRIAL || 'workbench/trials/heroui-20260606';
const OUT = '/tmp/judge-heroui';
mkdirSync(OUT, { recursive: true });

// rung -> component dir under target/src/components, + main basename
const DIR = {
  'trivial-button': ['Button', 'Button'], 'trivial-chip': ['Chip', 'Chip'],
  'moderate-input': ['Input', 'Input'], 'moderate-switch': ['Switch', 'Switch'],
  'complex-card': ['Card', 'Card'], 'complex-alert': ['Alert', 'Alert'],
  'complex-tabs': ['Tabs', 'Tabs'], 'extreme-calendar': ['Calendar', 'Calendar'],
  'complex-dashboard': ['DashboardDemo', 'DashboardDemo'],
};
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

const metrics = {};
for (const [rung, r] of Object.entries(RUNG_MAP)) {
  const [dir, base] = DIR[rung];
  const compDir = join(TRIAL, 'target/src/components', dir);
  const component = read(join(compDir, `${base}.tsx`));
  const stories = read(join(compDir, `${base}.stories.tsx`));
  const tests = read(join(compDir, `${base}.test.tsx`));
  // docs: any .md/.mdx in the component dir (none expected -> '')
  const docFile = existsSync(compDir)
    ? readdirSync(compDir).find((f) => /\.(md|mdx)$/i.test(f)) : null;
  const docs = docFile ? read(join(compDir, docFile)) : '';

  const sub = metricSubScores({ code: codeMetrics(component), surface: surfaceMetrics({ component, stories, tests, docs }) });
  metrics[rung] = { sub, code: codeMetrics(component), files: { component: `${base}.tsx`, stories: `${base}.stories.tsx`, tests: `${base}.test.tsx`, docs: docFile || null } };

  // judge spec: absolute paths so agents read directly
  const allFiles = existsSync(compDir) ? readdirSync(compDir).filter((f) => /\.(tsx?|md|mdx)$/.test(f)).map((f) => join(compDir, f)) : [];
  writeFileSync(join(OUT, `${rung}.spec.json`), JSON.stringify({
    rung, component: r.component,
    generatedDir: compDir,
    generatedFiles: allFiles,
    oracleTsx: join(TRIAL, r.oracleTsx),
    rubric: 'workbench/oracle/rubric.md',
    hasDocs: !!docFile,
  }, null, 2));
}
writeFileSync(join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 2));
console.log('prep written to', OUT);
for (const [rung, m] of Object.entries(metrics)) {
  console.log(rung.padEnd(18), 'metricSub', JSON.stringify(m.sub), 'docs:', m.files.docs || 'NONE');
}
