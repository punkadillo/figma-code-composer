# Quality Scorecard Implementation Plan (Plan 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second "engineering quality" scorecard (optimized code, developer experience, docs, test edge-case coverage, storybook display) alongside the existing Plan 2 fidelity scorecard, scored by pure deterministic metrics blended with a dedicated 3-vote LLM-judge panel, and surface both scorecards in the trialset report.

**Architecture:** Pure metric extractors + a pure judge-panel median feed five dimension scorers; each dimension blends a metric sub-score with an injected judge sub-score. A Quality composite sits parallel to the existing Fidelity composite; `score-both` returns `{ fidelity, quality }`. The trialset aggregator and report renderers gain a Quality scorecard, append-only. The judge vote-producer is injected so all panel math is fixture-tested at zero token cost; real judge agents spawn only in the live phase.

**Tech Stack:** Node 24, ESM, built-in `node:test`. No new runtime deps (judge agents use the Agent tool live; metrics are pure heuristics). Builds on Plan 1 + Plan 2 modules.

---

## Spec reference

Implements `docs/superpowers/specs/2026-06-03-quality-scorecard-design.md`. Pure-addition over Plan 2 (`docs/superpowers/plans/2026-06-02-heroui-live-trial.md`); the 58 existing workbench tests must stay green. Reuses Plan 2's `accuracy` field (Fidelity) unchanged and adds a sibling `quality` field.

## Prerequisite

`FP_ALLOW_RESTRICTED_WRITE=1` exported in the executing shell (writes under `workbench/**` are otherwise blocked). Verify: `echo $FP_ALLOW_RESTRICTED_WRITE` → `1`.

## File structure

```
workbench/oracle/
  quality-weights.json        # 5 dimension weights + per-dimension metric/judge blend ratio
  metrics/code.mjs            # pure: source string → {loc, complexity, size, imports}
  metrics/surface.mjs         # pure: artifacts → {hasTypes, propCount, testCount, storyCount, docWords, ...}
  judge.mjs                   # pure: judgePanel(votes) → {score: median, rationales}
  quality/optimized-code.mjs  # dimension scorer (metric+judge blend)
  quality/dx.mjs
  quality/docs.mjs
  quality/test-depth.mjs
  quality/storybook.mjs
  quality-score.mjs           # composite over the 5 dimensions
  score-both.mjs              # { fidelity, quality } for a component (wraps Plan 2 score-component)
  rubric.md                   # per-dimension judge scoring criteria (live judge reads this)
  *.test.mjs
workbench/analyze/
  aggregate-trialset.mjs      # EXTEND: add qualityByRung
workbench/report/
  markdown.mjs                # EXTEND renderTrialsetMarkdown: Quality table
  dashboard.mjs               # EXTEND renderTrialsetDashboard: quality-by-rung chart
workbench/fixtures/
  quality/                    # code-string + artifact fixtures
workbench/RUNBOOK-live.md     # EXTEND: quality scoring + judge panel steps
```

## Data contracts

**Metric sub-scores** are normalized 0–100 (higher = better). Raw measures are also returned for the report.

**`judgePanel(votes)`** — `votes: [{ score, rationale }]` → `{ score, rationales }` where `score` = median of the vote scores (odd count → middle; even count → average of the two middle values), `rationales` = the vote rationale strings in input order.

**Dimension score** = `round(metricWeight * metricSubScore + judgeWeight * judgeMedian)` where the per-dimension `{metricWeight, judgeWeight}` come from `quality-weights.json` (`blend` block) and sum to 1.

**`quality` object** (sibling of Plan 2's `accuracy` on each run row):
```jsonc
{ "composite": 0,
  "dimensions": {
    "optimizedCode": { "score": 0, "metric": 0, "judge": { "score": 0, "rationales": [] } },
    "dx":            { "score": 0, "metric": 0, "judge": { "score": 0, "rationales": [] } },
    "docs":          { "score": 0, "metric": 0, "judge": { "score": 0, "rationales": [] } },
    "testDepth":     { "score": 0, "metric": 0, "judge": { "score": 0, "rationales": [] } },
    "storybook":     { "score": 0, "metric": 0, "judge": { "score": 0, "rationales": [] } } },
  "weights": { "optimizedCode": 0.25, "dx": 0.20, "docs": 0.15, "testDepth": 0.25, "storybook": 0.15 } }
```

---

## Task 0: Quality weights config

**Files:**
- Create: `workbench/oracle/quality-weights.json`

- [ ] **Step 1: Write `workbench/oracle/quality-weights.json`**

```json
{
  "dimensions": {
    "optimizedCode": 0.25,
    "dx": 0.20,
    "docs": 0.15,
    "testDepth": 0.25,
    "storybook": 0.15
  },
  "blend": {
    "optimizedCode": { "metricWeight": 0.5, "judgeWeight": 0.5 },
    "dx":            { "metricWeight": 0.3, "judgeWeight": 0.7 },
    "docs":          { "metricWeight": 0.4, "judgeWeight": 0.6 },
    "testDepth":     { "metricWeight": 0.5, "judgeWeight": 0.5 },
    "storybook":     { "metricWeight": 0.5, "judgeWeight": 0.5 }
  }
}
```

- [ ] **Step 2: Verify the suite is still green**

Run: `node --test 'workbench/**/*.test.mjs'`
Expected: 58 pass / 0 fail (no behavior changed).

- [ ] **Step 3: Commit**

```bash
git add workbench/oracle/quality-weights.json
git commit -m "chore(workbench): quality scorecard weights + metric/judge blend config"
```

---

## Task 1: Code metrics (`oracle/metrics/code.mjs`)

Pure functions over a component source string. Returns raw measures plus a 0–100 `metricScore` (smaller/simpler = better, mapped against documented soft caps).

**Files:**
- Create: `workbench/oracle/metrics/code.mjs`
- Test: `workbench/oracle/metrics/code.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// workbench/oracle/metrics/code.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeMetrics } from './code.mjs';

test('codeMetrics counts loc, imports, and branch-keyword complexity', () => {
  const src = `import x from 'a';
import y from 'b';
export function C(props) {
  if (props.a) return 1;
  return props.b && props.c ? 2 : 3;
}`;
  const m = codeMetrics(src);
  assert.equal(m.loc, 6);              // non-empty lines
  assert.equal(m.imports, 2);
  // branch keywords: if, &&, ? => 3
  assert.equal(m.complexity, 3);
  assert.ok(m.size > 0);
});

test('codeMetrics metricScore is 100 for tiny simple code and decreases with complexity', () => {
  const simple = codeMetrics(`export const C = () => null;`);
  const complex = codeMetrics(
    'export function C(p){' + 'if(p){};'.repeat(40) + '}'
  );
  assert.equal(simple.metricScore, 100);
  assert.ok(complex.metricScore < simple.metricScore, `expected complex < 100, got ${complex.metricScore}`);
  assert.ok(complex.metricScore >= 0);
});

test('codeMetrics handles empty input without throwing', () => {
  const m = codeMetrics('');
  assert.equal(m.loc, 0);
  assert.equal(m.complexity, 0);
  assert.equal(m.metricScore, 100);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test workbench/oracle/metrics/code.test.mjs`
Expected: FAIL — `Cannot find module './code.mjs'`.

- [ ] **Step 3: Implement `workbench/oracle/metrics/code.mjs`**

```js
// workbench/oracle/metrics/code.mjs
// Pure code metrics over a source string. complexity is a branch-keyword PROXY
// for cyclomatic complexity (not a real CC), documented as such. metricScore
// maps raw measures to 0-100 (higher = leaner) against soft caps.

// ternary `?` only — not `?.` (chaining), `??` (nullish), or `a?:` (optional prop)
const BRANCH = /\b(if|for|while|case|catch)\b|&&|\|\||(?<!\?)\?(?![.?:])/g;

export function codeMetrics(src = '') {
  const loc = src.split('\n').filter((l) => l.trim() !== '').length;
  const imports = (src.match(/^\s*import\b/gm) || []).length;
  const complexity = (src.match(BRANCH) || []).length;
  const size = src.length;
  // Soft caps: complexity penalized above 20, size above 4000 chars.
  const complexityPenalty = Math.min(1, complexity / 20);
  const sizePenalty = Math.min(1, size / 4000);
  const metricScore = Math.round(100 * (1 - 0.6 * complexityPenalty - 0.4 * sizePenalty));
  return { loc, imports, complexity, size, metricScore: Math.max(0, metricScore) };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `node --test workbench/oracle/metrics/code.test.mjs`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add workbench/oracle/metrics/code.mjs workbench/oracle/metrics/code.test.mjs
git commit -m "feat(workbench): pure code metrics (loc, complexity proxy, size)"
```

---

## Task 2: Surface metrics (`oracle/metrics/surface.mjs`)

Pure functions over an artifact bundle (component / stories / tests / docs strings). Counts the surface signals the DX / docs / testDepth / storybook dimensions need.

**Files:**
- Create: `workbench/oracle/metrics/surface.mjs`
- Test: `workbench/oracle/metrics/surface.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// workbench/oracle/metrics/surface.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { surfaceMetrics } from './surface.mjs';

const artifacts = {
  component: `interface Props { a: string; b?: number }
export function C(props: Props) { return null; }
export default C;`,
  stories: `export const Default = {};
export const Disabled = {};
export const Loading = {};`,
  tests: `test('a', () => {}); it('b', () => {}); test('c', () => {});`,
  docs: `# C\nThis is the docs. It explains usage.\n| prop | type |\n| --- | --- |`,
};

test('surfaceMetrics counts types, props, exports, stories, tests, docs words', () => {
  const m = surfaceMetrics(artifacts);
  assert.equal(m.hasTypes, true);          // interface present
  assert.equal(m.propCount, 2);            // a, b
  assert.equal(m.namedExports >= 1, true);
  assert.equal(m.storyCount, 3);
  assert.equal(m.testCount, 3);            // test( x2 + it( x1
  assert.equal(m.hasPropTable, true);      // markdown table in docs
  assert.ok(m.docWords > 5);
});

test('surfaceMetrics tolerates missing artifacts', () => {
  const m = surfaceMetrics({ component: 'export const C = () => null;' });
  assert.equal(m.storyCount, 0);
  assert.equal(m.testCount, 0);
  assert.equal(m.docWords, 0);
  assert.equal(m.hasPropTable, false);
  assert.equal(m.hasTypes, false);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test workbench/oracle/metrics/surface.test.mjs`
Expected: FAIL — `Cannot find module './surface.mjs'`.

- [ ] **Step 3: Implement `workbench/oracle/metrics/surface.mjs`**

```js
// workbench/oracle/metrics/surface.mjs
// Pure surface-signal counts over an artifact bundle. All heuristic/regex —
// documented proxies, not full parsing.

export function surfaceMetrics({ component = '', stories = '', tests = '', docs = '' } = {}) {
  const hasTypes = /\b(interface|type)\b/.test(component) || /:\s*\w+/.test(component);
  const propsMatch = component.match(/interface\s+\w*Props\s*\{([^}]*)\}/s)
    || component.match(/type\s+\w*Props\s*=\s*\{([^}]*)\}/s);
  const propCount = propsMatch
    ? propsMatch[1].split(/[\n;]/).map((l) => l.trim()).filter((l) => /^\w+\??\s*:/.test(l)).length
    : 0;
  const namedExports = (component.match(/export\s+(const|function|class)\s+\w+/g) || []).length;
  const storyCount = (stories.match(/export\s+const\s+\w+/g) || []).length;
  const testCount = (tests.match(/\b(test|it)\s*\(/g) || []).length;
  const docWords = docs.trim() ? docs.trim().split(/\s+/).length : 0;
  const hasPropTable = /\|\s*prop\s*\|/i.test(docs) || /\|[-\s|]+\|/.test(docs);
  return { hasTypes, propCount, namedExports, storyCount, testCount, docWords, hasPropTable };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `node --test workbench/oracle/metrics/surface.test.mjs`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add workbench/oracle/metrics/surface.mjs workbench/oracle/metrics/surface.test.mjs
git commit -m "feat(workbench): pure surface metrics (types, props, stories, tests, docs)"
```

---

## Task 3: Judge panel (`oracle/judge.mjs`)

Pure median aggregation over a vote array. Odd count → middle; even count → average of the two middle values. Rationales preserved.

**Files:**
- Create: `workbench/oracle/judge.mjs`
- Test: `workbench/oracle/judge.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// workbench/oracle/judge.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgePanel } from './judge.mjs';

test('judgePanel takes the median of an odd vote count', () => {
  const r = judgePanel([{ score: 90, rationale: 'a' }, { score: 60, rationale: 'b' }, { score: 80, rationale: 'c' }]);
  assert.equal(r.score, 80);
  assert.deepEqual(r.rationales, ['a', 'b', 'c']);
});

test('judgePanel averages the two middle values for an even count', () => {
  const r = judgePanel([{ score: 50, rationale: 'a' }, { score: 90, rationale: 'b' }]);
  assert.equal(r.score, 70);
});

test('judgePanel with a single vote returns that score', () => {
  assert.equal(judgePanel([{ score: 42, rationale: 'x' }]).score, 42);
});

test('judgePanel on empty votes returns score 0 and no rationales', () => {
  const r = judgePanel([]);
  assert.equal(r.score, 0);
  assert.deepEqual(r.rationales, []);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test workbench/oracle/judge.test.mjs`
Expected: FAIL — `Cannot find module './judge.mjs'`.

- [ ] **Step 3: Implement `workbench/oracle/judge.mjs`**

```js
// workbench/oracle/judge.mjs
// Pure judge-panel aggregation. The vote producer is injected by the caller
// (live phase spawns 3 judge agents); this only reduces votes to a median.

export function judgePanel(votes = []) {
  if (votes.length === 0) return { score: 0, rationales: [] };
  const scores = votes.map((v) => v.score).slice().sort((a, b) => a - b);
  const mid = Math.floor(scores.length / 2);
  const score = scores.length % 2
    ? scores[mid]
    : Math.round((scores[mid - 1] + scores[mid]) / 2);
  return { score, rationales: votes.map((v) => v.rationale) };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `node --test workbench/oracle/judge.test.mjs`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add workbench/oracle/judge.mjs workbench/oracle/judge.test.mjs
git commit -m "feat(workbench): pure judge-panel median aggregation"
```

---

## Task 4: Dimension scorers (`oracle/quality/*.mjs`)

Five small modules, each blending its metric sub-score with the judge median per the `blend` ratio. They share one blend helper to stay DRY. Each takes pre-computed metric values + a judge result so they remain pure and injectable.

**Files:**
- Create: `workbench/oracle/quality/blend.mjs`
- Create: `workbench/oracle/quality/dimensions.mjs`
- Test: `workbench/oracle/quality/dimensions.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// workbench/oracle/quality/dimensions.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blendDimension } from './blend.mjs';
import { scoreDimensions, metricSubScores } from './dimensions.mjs';

test('blendDimension blends metric and judge by the configured ratio', () => {
  const d = blendDimension(80, { score: 60, rationales: ['x'] }, { metricWeight: 0.5, judgeWeight: 0.5 });
  assert.equal(d.score, 70);     // 0.5*80 + 0.5*60
  assert.equal(d.metric, 80);
  assert.equal(d.judge.score, 60);
});

test('metricSubScores maps raw metrics into per-dimension 0-100 sub-scores', () => {
  const sub = metricSubScores({
    code: { metricScore: 90, complexity: 3, size: 200, loc: 10, imports: 2 },
    surface: { hasTypes: true, propCount: 3, namedExports: 1, storyCount: 4, testCount: 6, docWords: 80, hasPropTable: true },
  });
  // all five dimensions present, each 0..100
  for (const k of ['optimizedCode','dx','docs','testDepth','storybook'])
    assert.ok(sub[k] >= 0 && sub[k] <= 100, `${k}=${sub[k]}`);
  assert.equal(sub.optimizedCode, 90);          // mirrors code.metricScore
  assert.equal(sub.docs, 100);                  // hasPropTable + words>=50 -> full
  assert.equal(sub.storybook >= 80, true);      // 4 stories -> high
});

test('scoreDimensions blends metric subscores with judge results using weights', () => {
  const sub = { optimizedCode: 80, dx: 80, docs: 80, testDepth: 80, storybook: 80 };
  const judges = {
    optimizedCode: { score: 60, rationales: [] }, dx: { score: 60, rationales: [] },
    docs: { score: 60, rationales: [] }, testDepth: { score: 60, rationales: [] }, storybook: { score: 60, rationales: [] },
  };
  const blend = {
    optimizedCode: { metricWeight: 0.5, judgeWeight: 0.5 }, dx: { metricWeight: 0.5, judgeWeight: 0.5 },
    docs: { metricWeight: 0.5, judgeWeight: 0.5 }, testDepth: { metricWeight: 0.5, judgeWeight: 0.5 }, storybook: { metricWeight: 0.5, judgeWeight: 0.5 },
  };
  const dims = scoreDimensions(sub, judges, blend);
  assert.equal(dims.optimizedCode.score, 70);
  assert.equal(dims.storybook.judge.score, 60);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test workbench/oracle/quality/dimensions.test.mjs`
Expected: FAIL — `Cannot find module './blend.mjs'`.

- [ ] **Step 3: Implement `workbench/oracle/quality/blend.mjs`**

```js
// workbench/oracle/quality/blend.mjs
// Blend one dimension's metric sub-score with its judge median by ratio.
export function blendDimension(metric, judge, { metricWeight, judgeWeight }) {
  const score = Math.round(metricWeight * metric + judgeWeight * judge.score);
  return { score, metric, judge };
}
```

- [ ] **Step 4: Implement `workbench/oracle/quality/dimensions.mjs`**

```js
// workbench/oracle/quality/dimensions.mjs
// Map raw metrics → per-dimension metric sub-scores, then blend with judges.
import { blendDimension } from './blend.mjs';

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

// raw: { code: codeMetrics(...), surface: surfaceMetrics(...) }
export function metricSubScores({ code, surface }) {
  // optimizedCode mirrors the code metricScore directly.
  const optimizedCode = code.metricScore;
  // dx: types + a sane prop surface + named export.
  const dx = clamp(
    (surface.hasTypes ? 50 : 0) +
    (surface.namedExports > 0 ? 20 : 0) +
    Math.min(30, surface.propCount * 10)
  );
  // docs: presence (words) + prop table.
  const docs = clamp(
    Math.min(60, surface.docWords) +           // up to 60 from ~60 words
    (surface.hasPropTable ? 40 : 0)
  );
  // testDepth: scaled by test count (6+ tests -> full from metric side).
  const testDepth = clamp((Math.min(6, surface.testCount) / 6) * 100);
  // storybook: scaled by story variants (4+ -> full).
  const storybook = clamp((Math.min(4, surface.storyCount) / 4) * 100);
  return { optimizedCode, dx, docs, testDepth, storybook };
}

const DIMS = ['optimizedCode', 'dx', 'docs', 'testDepth', 'storybook'];

// sub: metricSubScores output; judges: { dim: {score,rationales} }; blend: weights.blend
export function scoreDimensions(sub, judges, blend) {
  const out = {};
  for (const d of DIMS) {
    out[d] = blendDimension(sub[d], judges[d] ?? { score: 0, rationales: [] }, blend[d]);
  }
  return out;
}

export { DIMS };
```

- [ ] **Step 5: Run tests to confirm they pass**

Run: `node --test workbench/oracle/quality/dimensions.test.mjs`
Expected: PASS — 3 tests. Verify the `docs=100` case (60 words capped at 60 + 40 prop-table = 100) and `optimizedCode=90` by running; do not alter the math to force values.

- [ ] **Step 6: Commit**

```bash
git add workbench/oracle/quality/blend.mjs workbench/oracle/quality/dimensions.mjs workbench/oracle/quality/dimensions.test.mjs
git commit -m "feat(workbench): quality dimension metric sub-scores + metric/judge blend"
```

---

## Task 5: Quality composite (`oracle/quality-score.mjs`)

Blends the five dimension scores into a Quality composite by the dimension weights, and assembles the full `quality` object (matching the data contract).

**Files:**
- Create: `workbench/oracle/quality-score.mjs`
- Test: `workbench/oracle/quality-score.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// workbench/oracle/quality-score.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeQuality } from './quality-score.mjs';

const dims = {
  optimizedCode: { score: 80, metric: 80, judge: { score: 80, rationales: [] } },
  dx:            { score: 60, metric: 60, judge: { score: 60, rationales: [] } },
  docs:          { score: 40, metric: 40, judge: { score: 40, rationales: [] } },
  testDepth:     { score: 100, metric: 100, judge: { score: 100, rationales: [] } },
  storybook:     { score: 20, metric: 20, judge: { score: 20, rationales: [] } },
};
const weights = { optimizedCode: 0.25, dx: 0.20, docs: 0.15, testDepth: 0.25, storybook: 0.15 };

test('composeQuality weights the five dimensions into a composite', () => {
  const q = composeQuality(dims, weights);
  // 0.25*80 + 0.20*60 + 0.15*40 + 0.25*100 + 0.15*20 = 20+12+6+25+3 = 66
  assert.equal(q.composite, 66);
  assert.equal(q.dimensions.testDepth.score, 100);
  assert.deepEqual(q.weights, weights);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test workbench/oracle/quality-score.test.mjs`
Expected: FAIL — `Cannot find module './quality-score.mjs'`.

- [ ] **Step 3: Implement `workbench/oracle/quality-score.mjs`**

```js
// workbench/oracle/quality-score.mjs
import { DIMS } from './quality/dimensions.mjs';

// dims: scoreDimensions output; weights: quality-weights.json `dimensions` block
export function composeQuality(dims, weights) {
  const composite = Math.round(DIMS.reduce((s, d) => s + weights[d] * dims[d].score, 0));
  return { composite, dimensions: dims, weights };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `node --test workbench/oracle/quality-score.test.mjs`
Expected: PASS — 1 test (composite 66).

- [ ] **Step 5: Commit**

```bash
git add workbench/oracle/quality-score.mjs workbench/oracle/quality-score.test.mjs
git commit -m "feat(workbench): quality composite over the five dimensions"
```

---

## Task 6: score-both glue (`oracle/score-both.mjs`)

Wraps Plan 2's `scoreComponent` (Fidelity) and the quality pipeline (metrics → dimensions → composite) into one `{ fidelity, quality }`. The judge vote producer is injected (`judgeFor(dimension) → {score,rationale}` called 3×) so this is fully testable without tokens. Reads `quality-weights.json`.

**Files:**
- Create: `workbench/oracle/score-both.mjs`
- Test: `workbench/oracle/score-both.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// workbench/oracle/score-both.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreBoth } from './score-both.mjs';

const bundle = {
  generated: {
    image: { width: 1, height: 1, data: [0,0,0,255] }, style: { color: 'rgb(0,0,0)' },
    dom: { tree: { tag: 'button', role: 'button' }, props: ['variant'] },
    artifacts: {
      component: `interface Props { variant: string }\nexport function B(p: Props){ return null; }`,
      stories: `export const Default = {};\nexport const Disabled = {};`,
      tests: `test('a',()=>{}); test('b',()=>{});`,
      docs: `# B\nDocs here explaining usage of the button component thoroughly.\n| prop | type |\n|---|---|`,
    },
  },
  oracle: {
    image: { width: 1, height: 1, data: [0,0,0,255] }, style: { color: 'rgb(0,0,0)' },
    dom: { tree: { tag: 'button', role: 'button' }, props: ['variant'] },
  },
};

test('scoreBoth returns both fidelity and quality scorecards', async () => {
  const res = await scoreBoth(bundle, {
    fidelityWeights: { visual: 0.35, style: 0.30, structural: 0.20, gates: 0.15, buildFailCeiling: 20 },
    runGate: async () => ({ ok: true }),
    qualityWeights: {
      dimensions: { optimizedCode: 0.25, dx: 0.20, docs: 0.15, testDepth: 0.25, storybook: 0.15 },
      blend: { optimizedCode:{metricWeight:0.5,judgeWeight:0.5}, dx:{metricWeight:0.5,judgeWeight:0.5}, docs:{metricWeight:0.5,judgeWeight:0.5}, testDepth:{metricWeight:0.5,judgeWeight:0.5}, storybook:{metricWeight:0.5,judgeWeight:0.5} },
    },
    judgeFor: async () => ({ score: 70, rationale: 'ok' }),  // called 3x per dimension
    judgeVotes: 3,
  });
  assert.equal(res.fidelity.composite, 100);
  assert.ok(res.quality.composite > 0 && res.quality.composite <= 100);
  assert.equal(res.quality.dimensions.dx.judge.score, 70);          // median of three 70s
  assert.equal(res.quality.dimensions.dx.judge.rationales.length, 3);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test workbench/oracle/score-both.test.mjs`
Expected: FAIL — `Cannot find module './score-both.mjs'`.

- [ ] **Step 3: Implement `workbench/oracle/score-both.mjs`**

```js
// workbench/oracle/score-both.mjs
import { scoreComponent } from './score-component.mjs';
import { codeMetrics } from './metrics/code.mjs';
import { surfaceMetrics } from './metrics/surface.mjs';
import { metricSubScores, scoreDimensions, DIMS } from './quality/dimensions.mjs';
import { judgePanel } from './judge.mjs';
import { composeQuality } from './quality-score.mjs';

// bundle.generated.artifacts: { component, stories, tests, docs }
// opts: { fidelityWeights, runGate, qualityWeights, judgeFor, judgeVotes=3 }
export async function scoreBoth(bundle, opts) {
  const fidelity = await scoreComponent(bundle, { weights: opts.fidelityWeights, runGate: opts.runGate });

  const artifacts = bundle.generated.artifacts || {};
  const sub = metricSubScores({ code: codeMetrics(artifacts.component || ''), surface: surfaceMetrics(artifacts) });

  const votes = opts.judgeVotes ?? 3;
  const judges = {};
  for (const d of DIMS) {
    const cast = [];
    for (let i = 0; i < votes; i++) cast.push(await opts.judgeFor(d, bundle));
    judges[d] = judgePanel(cast);
  }

  const dims = scoreDimensions(sub, judges, opts.qualityWeights.blend);
  const quality = composeQuality(dims, opts.qualityWeights.dimensions);
  return { fidelity, quality };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `node --test workbench/oracle/score-both.test.mjs`
Expected: PASS — 1 test.

- [ ] **Step 5: Commit**

```bash
git add workbench/oracle/score-both.mjs workbench/oracle/score-both.test.mjs
git commit -m "feat(workbench): score-both glue producing fidelity + quality scorecards"
```

---

## Task 7: Judge rubric (`oracle/rubric.md`)

The written per-dimension scoring criteria the live judge agents read. Documentation only — no test, but the suite must still pass.

**Files:**
- Create: `workbench/oracle/rubric.md`

- [ ] **Step 1: Write `workbench/oracle/rubric.md`**

```markdown
# Quality judge rubric

Each judge agent scores ONE dimension 0–100 for the generated component, given:
its source, stories, tests, docs, and the HeroUI reference (oracle). Return
`{ score, rationale }`. Score against these criteria; be calibrated, not generous.

## optimizedCode (0–100)
- 90–100: idiomatic React, no dead code, memoized where it matters, no needless re-renders, minimal/clean deps.
- 50–89: works and is readable but has redundancy, missed memoization, or awkward structure.
- 0–49: copy-paste bloat, dead code, obvious performance foot-guns, or non-idiomatic patterns.

## dx (developer experience) (0–100)
- 90–100: clear typed props, intuitive names, composable API, sensible defaults, matches React conventions.
- 50–89: usable but with unclear prop names, weak types, or awkward composition.
- 0–49: untyped/any-typed, confusing API, hard to consume.

## docs (0–100)
- 90–100: clear purpose, prop table, at least one usage example, accurate.
- 50–89: present but thin or missing a prop table / example.
- 0–49: absent, placeholder, or misleading.

## testDepth (edge-case coverage) (0–100)
- 90–100: covers default + disabled/loading/error + empty + boundary + a11y/role assertions.
- 50–89: covers the happy path and a couple of states.
- 0–49: trivial render-only test or none.

## storybook (0–100)
- 90–100: a story per meaningful state/variant, controls/args wired, renders cleanly.
- 50–89: a few stories, some states missing.
- 0–49: single default story or broken render.
```

- [ ] **Step 2: Verify the suite still passes**

Run: `node --test 'workbench/**/*.test.mjs'`
Expected: all pass (doc-only change).

- [ ] **Step 3: Commit**

```bash
git add workbench/oracle/rubric.md
git commit -m "docs(workbench): quality judge rubric (per-dimension criteria)"
```

---

## Task 8: Trialset aggregator — qualityByRung

Extend `aggregateTrialset` to also collect each rung's `quality.composite` into a `qualityByRung` list, parallel to `accuracyByRung`. Pure addition; existing behavior unchanged.

**Files:**
- Modify: `workbench/analyze/aggregate-trialset.mjs`
- Test: `workbench/analyze/aggregate-trialset-quality.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// workbench/analyze/aggregate-trialset-quality.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateTrialset } from './aggregate-trialset.mjs';

const mk = (runId, rung, composite, quality) => ({
  trialId: 'heroui', generatedAt: null,
  runs: [{ runId, rung, tier: 'trivial', scenario: { icon: false, tier: 'trivial' }, command: 'x', wallMs: 1,
    agents: [{ agent: 'component-builder', model: 'opus', tokens: { input:1,output:0,thinkingEst:0,cacheRead:0,cacheCreation:0,total:1 }, timeMs:{sumDuration:1,wallSpan:1,ttftAvg:1}, toolUses:1, costUsd:0 }],
    fanIn: [], accuracy: { composite }, quality }],
  rollup: { perAgent: [], dominance: { tokens:'component-builder', time:'component-builder', byTier:{} }, crossCheck:{otelTotalTokens:1,costsJsonlTotalTokens:1,deltaPct:0} },
});

test('aggregateTrialset collects qualityByRung alongside accuracyByRung', () => {
  const ts = aggregateTrialset({ trialId: 'heroui', runs: [
    mk('r2','atom',95,{ composite: 88 }),
    mk('r6','page',40,{ composite: 30 }),
  ] });
  assert.deepEqual(ts.accuracyByRung, [{ rung:'atom', composite:95 }, { rung:'page', composite:40 }]);
  assert.deepEqual(ts.qualityByRung, [{ rung:'atom', composite:88 }, { rung:'page', composite:30 }]);
});

test('qualityByRung tolerates a run with no quality (composite null)', () => {
  const ts = aggregateTrialset({ trialId: 'heroui', runs: [ mk('r2','atom',95,undefined) ] });
  assert.deepEqual(ts.qualityByRung, [{ rung:'atom', composite: null }]);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test workbench/analyze/aggregate-trialset-quality.test.mjs`
Expected: FAIL — `ts.qualityByRung` is `undefined`.

- [ ] **Step 3: Edit `workbench/analyze/aggregate-trialset.mjs`**

In the `rungs.map(...)`, add `quality: run.quality` to the per-rung object (alongside `accuracy: run.accuracy`):
```js
      agents: run.agents, fanIn: run.fanIn, accuracy: run.accuracy, quality: run.quality,
```
Then, right after the `out.accuracyByRung = ...` line, add:
```js
  out.qualityByRung = rungs.map((r) => ({ rung: r.rung, composite: r.quality ? r.quality.composite : null }));
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `node --test workbench/analyze/aggregate-trialset-quality.test.mjs`
Expected: PASS — 2 tests. Also run `node --test workbench/analyze/aggregate-trialset.test.mjs` → still PASS (Plan 2 tests untouched).

- [ ] **Step 5: Commit**

```bash
git add workbench/analyze/aggregate-trialset.mjs workbench/analyze/aggregate-trialset-quality.test.mjs
git commit -m "feat(workbench): trialset aggregator collects qualityByRung"
```

---

## Task 9: Markdown report — Quality scorecard table

Extend `renderTrialsetMarkdown` to add a Quality-by-rung table (composite + 5 dimensions) below the Fidelity ladder, when any rung has `quality`. Pure addition; existing assertions unaffected.

**Files:**
- Modify: `workbench/report/markdown.mjs`
- Test: `workbench/report/markdown-quality.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// workbench/report/markdown-quality.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTrialsetMarkdown } from './markdown.mjs';

const dim = (s) => ({ score: s, metric: s, judge: { score: s, rationales: [] } });
const ts = {
  trialId: 'heroui', generatedAt: null,
  rungs: [{ rung: 'atom', tier: 'trivial', runId: 'r2', icon: false, agents: [], fanIn: [],
    accuracy: { composite: 95, cappedAt: null, visual: { score: 98 }, style: { matchRate: 96 }, structural: { score: 90 }, gates: { build: true } },
    quality: { composite: 82, dimensions: { optimizedCode: dim(80), dx: dim(85), docs: dim(70), testDepth: dim(90), storybook: dim(80) }, weights: {} } }],
  comparisons: {}, accuracyByRung: [{ rung: 'atom', composite: 95 }], qualityByRung: [{ rung: 'atom', composite: 82 }],
  rollup: { perAgent: [], dominance: { tokens: 'component-builder', time: 'component-builder', byTier: {} }, crossCheck: { otelTotalTokens: 1, costsJsonlTotalTokens: 1, deltaPct: 0 } },
};

test('renderTrialsetMarkdown adds a Quality-by-rung table', () => {
  const md = renderTrialsetMarkdown(ts);
  assert.match(md, /Quality by ladder rung/i);
  assert.match(md, /optimized|optimizedCode/i);
  assert.match(md, /\| *82 *\|/);   // quality composite cell
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test workbench/report/markdown-quality.test.mjs`
Expected: FAIL — no "Quality by ladder rung" section.

- [ ] **Step 3: Edit `workbench/report/markdown.mjs`**

Inside `renderTrialsetMarkdown`, immediately before the `## Scenario comparisons` block is pushed, insert this Quality section (reuses the module's `n` helper):
```js
  if (ts.rungs.some((r) => r.quality)) {
    L.push('## Quality by ladder rung');
    L.push('');
    L.push('| rung | composite | optimizedCode | dx | docs | testDepth | storybook |');
    L.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const r of ts.rungs) {
      const q = r.quality;
      if (!q) { L.push(`| ${r.rung} | — | — | — | — | — | — |`); continue; }
      const d = q.dimensions;
      L.push(`| ${r.rung} | ${n(q.composite)} | ${n(d.optimizedCode.score)} | ${n(d.dx.score)} | ${n(d.docs.score)} | ${n(d.testDepth.score)} | ${n(d.storybook.score)} |`);
    }
    L.push('');
    L.push('> Quality blends deterministic metrics with a 3-vote judge panel (median) per dimension; see `oracle/rubric.md`.');
    L.push('');
  }
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `node --test workbench/report/markdown-quality.test.mjs`
Expected: PASS — 1 test. Also run `node --test workbench/report/markdown-trialset.test.mjs` and `node --test workbench/report/markdown.test.mjs` → still PASS.

- [ ] **Step 5: Commit**

```bash
git add workbench/report/markdown.mjs workbench/report/markdown-quality.test.mjs
git commit -m "feat(workbench): trialset markdown gains a Quality scorecard table"
```

---

## Task 10: Dashboard — quality-by-rung chart

Extend `renderTrialsetDashboard` to add a quality-by-rung bar chart next to the accuracy chart. Pure addition.

**Files:**
- Modify: `workbench/report/dashboard.mjs`
- Test: `workbench/report/dashboard-quality.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// workbench/report/dashboard-quality.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTrialsetDashboard } from './dashboard.mjs';

const ts = {
  trialId: 'heroui', generatedAt: null, rungs: [], comparisons: {},
  rollup: { perAgent: [{ agent: 'component-builder', tokens: { total: 100 }, timeMs: 10, costUsd: 0 }],
    dominance: { tokens: 'component-builder', time: 'component-builder', byTier: {} },
    crossCheck: { otelTotalTokens: 100, costsJsonlTotalTokens: 100, deltaPct: 0 } },
  accuracyByRung: [{ rung: 'atom', composite: 95 }],
  qualityByRung: [{ rung: 'atom', composite: 82 }, { rung: 'page', composite: 30 }],
};

test('renderTrialsetDashboard adds a quality-by-rung chart', () => {
  const html = renderTrialsetDashboard(ts);
  assert.match(html, /Quality by rung/i);
  assert.match(html, /atom/);
  assert.doesNotMatch(html, /src=["']https?:/);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test workbench/report/dashboard-quality.test.mjs`
Expected: FAIL — no "Quality by rung" section.

- [ ] **Step 3: Edit `workbench/report/dashboard.mjs`**

Inside `renderTrialsetDashboard`, add a quality chart. After the `const accBars = ...` line add:
```js
  const qualBars = svgBars((ts.qualityByRung || []).map((r) => ({ label: r.rung, value: r.composite ?? 0 })));
```
Then, in the returned HTML, immediately after the accuracy `<section>...accBars...</section>`, insert:
```js
<section><h2>Quality by rung (composite)</h2>${qualBars}
<p class="note">Quality = metrics + 3-vote judge panel (median) per dimension.</p></section>
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `node --test workbench/report/dashboard-quality.test.mjs`
Expected: PASS — 1 test. Also run `node --test workbench/report/dashboard-trialset.test.mjs` and `node --test workbench/report/dashboard.test.mjs` → still PASS.

- [ ] **Step 5: Commit**

```bash
git add workbench/report/dashboard.mjs workbench/report/dashboard-quality.test.mjs
git commit -m "feat(workbench): trialset dashboard gains a quality-by-rung chart"
```

---

## Task 11: End-to-end quality smoke + full suite

Builds a trialset whose runs carry both `accuracy` and `quality`, renders the report, and asserts both scorecards appear. No live services / no judge tokens (quality objects are fixtures).

**Files:**
- Create: `workbench/fixtures/trialset-quality/run-atom.json`
- Create: `workbench/fixtures/trialset-quality/run-page.json`
- Create: `workbench/e2e-quality.test.mjs`

- [ ] **Step 1: Create the two fixtures**

`workbench/fixtures/trialset-quality/run-atom.json`:
```json
{ "trialId": "heroui", "generatedAt": null,
  "runs": [{ "runId": "r2", "rung": "atom", "tier": "trivial", "scenario": { "icon": false, "tier": "trivial" }, "command": "/figma-build atom", "wallMs": 1000,
    "agents": [{ "agent": "component-builder", "model": "opus", "tokens": { "input": 100, "output": 0, "thinkingEst": 0, "cacheRead": 0, "cacheCreation": 0, "total": 100 }, "timeMs": { "sumDuration": 100, "wallSpan": 100, "ttftAvg": 10 }, "toolUses": 1, "costUsd": 0.1 }],
    "fanIn": [], "accuracy": { "composite": 95, "cappedAt": null, "visual": { "diffPct": 2, "score": 98 }, "style": { "matchRate": 96 }, "structural": { "score": 90 }, "gates": { "typecheck": true, "build": true, "tests": true, "a11y": true } },
    "quality": { "composite": 82, "dimensions": { "optimizedCode": { "score": 80, "metric": 80, "judge": { "score": 80, "rationales": ["clean"] } }, "dx": { "score": 85, "metric": 80, "judge": { "score": 90, "rationales": ["typed"] } }, "docs": { "score": 70, "metric": 60, "judge": { "score": 80, "rationales": ["ok"] } }, "testDepth": { "score": 90, "metric": 100, "judge": { "score": 80, "rationales": ["good"] } }, "storybook": { "score": 80, "metric": 75, "judge": { "score": 85, "rationales": ["states"] } } }, "weights": { "optimizedCode": 0.25, "dx": 0.2, "docs": 0.15, "testDepth": 0.25, "storybook": 0.15 } } }],
  "rollup": { "perAgent": [], "dominance": { "tokens": "component-builder", "time": "component-builder", "byTier": {} }, "crossCheck": { "otelTotalTokens": 100, "costsJsonlTotalTokens": 100, "deltaPct": 0 } } }
```

`workbench/fixtures/trialset-quality/run-page.json`:
```json
{ "trialId": "heroui", "generatedAt": null,
  "runs": [{ "runId": "r6", "rung": "page", "tier": "extreme", "scenario": { "icon": false, "tier": "extreme" }, "command": "/figma-build page", "wallMs": 5000,
    "agents": [{ "agent": "component-builder", "model": "opus", "tokens": { "input": 900, "output": 0, "thinkingEst": 0, "cacheRead": 0, "cacheCreation": 0, "total": 900 }, "timeMs": { "sumDuration": 500, "wallSpan": 500, "ttftAvg": 20 }, "toolUses": 9, "costUsd": 0.9 }],
    "fanIn": [], "accuracy": { "composite": 40, "cappedAt": null, "visual": { "diffPct": 50, "score": 50 }, "style": { "matchRate": 45 }, "structural": { "score": 30 }, "gates": { "typecheck": true, "build": false, "tests": false, "a11y": true } },
    "quality": { "composite": 35, "dimensions": { "optimizedCode": { "score": 40, "metric": 40, "judge": { "score": 40, "rationales": ["bloated"] } }, "dx": { "score": 35, "metric": 30, "judge": { "score": 40, "rationales": ["weak types"] } }, "docs": { "score": 20, "metric": 0, "judge": { "score": 40, "rationales": ["thin"] } }, "testDepth": { "score": 40, "metric": 33, "judge": { "score": 47, "rationales": ["happy path only"] } }, "storybook": { "score": 30, "metric": 25, "judge": { "score": 35, "rationales": ["one story"] } } }, "weights": { "optimizedCode": 0.25, "dx": 0.2, "docs": 0.15, "testDepth": 0.25, "storybook": 0.15 } } }],
  "rollup": { "perAgent": [], "dominance": { "tokens": "component-builder", "time": "component-builder", "byTier": {} }, "crossCheck": { "otelTotalTokens": 900, "costsJsonlTotalTokens": 900, "deltaPct": 0 } } }
```

- [ ] **Step 2: Write the e2e test** `workbench/e2e-quality.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { aggregateTrialset } from './analyze/aggregate-trialset.mjs';
import { buildReport } from './report/build-report.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fx = join(here, 'fixtures', 'trialset-quality');

test('runs with quality → trialset → report shows both scorecards', () => {
  const runs = ['run-atom.json', 'run-page.json'].map((f) => JSON.parse(readFileSync(join(fx, f), 'utf8')));
  const ts = aggregateTrialset({ trialId: 'heroui', runs });
  assert.deepEqual(ts.qualityByRung, [{ rung: 'atom', composite: 82 }, { rung: 'page', composite: 35 }]);

  const out = mkdtempSync(join(tmpdir(), 'wb-q-e2e-'));
  const p = join(out, 'trialset.json');
  writeFileSync(p, JSON.stringify(ts, null, 2));
  buildReport(p, '2026-06-03T00:00:00Z');
  const md = readFileSync(join(out, 'report.md'), 'utf8');
  assert.match(md, /Accuracy by ladder rung/);
  assert.match(md, /Quality by ladder rung/);
  assert.ok(existsSync(join(out, 'dashboard.html')));
});
```

- [ ] **Step 3: Run it** — `node --test workbench/e2e-quality.test.mjs` → PASS.

- [ ] **Step 4: Run the full suite** — `npm test` → all pass; report the count.

- [ ] **Step 5: Commit**

```bash
git add workbench/fixtures/trialset-quality/ workbench/e2e-quality.test.mjs
git commit -m "test(workbench): end-to-end quality scorecard fixtures→report"
```

---

## Task 12: Live judge wiring stub (`oracle/judge-live.mjs`) + runbook update

A thin IO-only producer the live phase uses to turn a judge agent's structured output into a `{score,rationale}` vote, plus the runbook steps for the 3-vote panel. Not unit-tested (live); must import cleanly. Then extend `RUNBOOK-live.md`.

**Files:**
- Create: `workbench/oracle/judge-live.mjs`
- Modify: `workbench/RUNBOOK-live.md`

- [ ] **Step 1: Implement `workbench/oracle/judge-live.mjs`**

```js
// workbench/oracle/judge-live.mjs
// LIVE judge vote producer (operator phase). Wraps a single judge-agent call
// into the { score, rationale } shape judgePanel consumes. The agent runner is
// injected so this file imports no agent SDK; the operator wires it to a real
// 3-vote spawn against oracle/rubric.md. IO-only orchestration.

// deps.runJudgeAgent({ dimension, artifacts, oracleRef, rubric }) -> { score, rationale }
export function makeJudgeFor(deps, rubric) {
  return async function judgeFor(dimension, bundle) {
    const out = await deps.runJudgeAgent({
      dimension,
      artifacts: bundle.generated.artifacts,
      oracleRef: bundle.oracle,
      rubric,
    });
    // clamp to 0-100 defensively; coerce a missing score to 0.
    const score = Math.max(0, Math.min(100, Number(out?.score) || 0));
    return { score, rationale: out?.rationale ?? '' };
  };
}
```

- [ ] **Step 2: Verify it imports + suite green**

Run:
```bash
node -e "import('./workbench/oracle/judge-live.mjs').then(()=>console.log('import ok'))"
node --test 'workbench/**/*.test.mjs'
```
Expected: prints `import ok`; full suite passes.

- [ ] **Step 3: Append a Quality-scoring section to `workbench/RUNBOOK-live.md`**

Add this section after the existing "## 6. Per-run results + scoring" section:
```markdown
## 6b. Quality scorecard (per run)
- Collect the generated artifacts for the rung: component source, `*.stories.tsx`, `*.test.tsx`, and the docs file.
- For each of the 5 dimensions (optimizedCode, dx, docs, testDepth, storybook), spawn a **3-vote judge panel**: 3 fresh judge agents, each given the artifacts + the HeroUI oracle reference + `workbench/oracle/rubric.md`, each returning `{ score, rationale }`. Wire them through `makeJudgeFor(deps, rubric)` from `workbench/oracle/judge-live.mjs`.
- Score the run with `scoreBoth(bundle, { fidelityWeights, runGate, qualityWeights: <oracle/quality-weights.json>, judgeFor, judgeVotes: 3 })`. Write the returned `{ fidelity, quality }` into the run row as `accuracy` (= fidelity) and `quality`.
- Deterministic metric overrides (optional): pass real tsc/coverage/bundler numbers into the metric layer instead of the heuristic defaults.
```

- [ ] **Step 4: Commit**

```bash
git add workbench/oracle/judge-live.mjs workbench/RUNBOOK-live.md
git commit -m "feat(workbench): live judge vote producer + runbook quality-scoring steps"
```

---

## Self-review (completed during planning)

**Spec coverage:**
- §2.1 Fidelity unchanged → no task needed (Plan 2 `accuracy` reused as-is). ✓
- §2.2 five Quality dimensions + metric/judge blend → Tasks 1, 2 (metrics), 4 (dimensions/blend). ✓
- §3 judge panel injected + median → Task 3 (`judgePanel`), Task 6 (3-vote loop via injected `judgeFor`), Task 12 (live producer). ✓
- §4 lightweight pure metrics w/ live override → Tasks 1–2 (heuristics), Task 12 step 3 note (override). ✓
- §5 data contract (`quality` sibling, `score-both` → `{fidelity,quality}`) → Tasks 5 (composite shape), 6 (score-both). ✓
- §6 aggregator + report extension → Tasks 8 (qualityByRung), 9 (md table), 10 (dashboard chart). ✓
- §2.2/rubric → Task 7 (`rubric.md`). ✓
- weights config → Task 0. ✓
- §9 live flow update → Task 12 runbook. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. `judge-live.mjs` is a thin injected orchestrator (deps.runJudgeAgent), not a placeholder.

**Type consistency:** The `quality` shape (`composite`, `dimensions.{optimizedCode,dx,docs,testDepth,storybook}.{score,metric,judge:{score,rationales}}`, `weights`) is identical across Task 5 (`composeQuality`), Task 6 (`scoreBoth`), Task 9/10 (report consumers reading `q.dimensions.<d>.score` and `q.composite`), and Task 11 fixtures. `DIMS` order (`optimizedCode,dx,docs,testDepth,storybook`) is defined once in Task 4 and reused by Tasks 5, 6. `metricSubScores`/`scoreDimensions`/`blendDimension`/`judgePanel`/`composeQuality`/`scoreBoth`/`codeMetrics`/`surfaceMetrics`/`makeJudgeFor` names are consistent between definition and use. `scoreBoth` wraps (does not modify) Plan 2's `scoreComponent`. The `quality-weights.json` shape (`dimensions` + `blend` blocks) matches what Task 6 reads. ✓

## Notes for the executor
- Pure-addition discipline: Tasks 8–10 only APPEND to existing files; verify with `git diff` that Plan 2 functions (`renderMarkdown`, `renderTrialsetMarkdown` existing lines, `renderDashboard`, `renderTrialsetDashboard` existing lines, `aggregateTrialset` existing fields) are unchanged except for the documented insertions.
- The judge vote producer is injected everywhere; **no judge tokens are spent in Tasks 0–12**. Real judge spawns happen only when the operator runs the live trial per the runbook.
- `package.json` `test` script already globs `workbench/**/*.test.mjs`; new tests auto-discover.
- Median rule for even vote counts (a judge agent failing → 2 votes) is implemented in `judge.mjs` (average of the two middle) and tested in Task 3.
