# HeroUI Live Trial — Accuracy Oracle Implementation Plan (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the accuracy-scoring oracle + trialset aggregator that fills the `accuracy: null` reserved by Plan 1, extend the report with accuracy + per-rung ladder views, and provide the operator runbook to execute the ~9-run HeroUI live trial.

**Architecture:** Four pure scorers (visual / style / structural / gates) feed a weighted composite written into each run's `results.json.accuracy`. A trialset aggregator merges the ~9 single-run results into one `trialset.json` for cross-rung comparisons. Report renderers gain an accuracy section. Pure units are built TDD against fixtures now; capture (Playwright/Storybook/Figma) and the live runs are an operator-driven phase. The visual scorer is pure over decoded RGBA buffers; a separate, unit-tested PNG decoder (node:zlib) lives in the capture layer so the scorer never touches files.

**Tech Stack:** Node 24, ESM, built-in `node:test`. New dev dep: **Playwright** (capture only). PNG decode via built-in `node:zlib`. No other runtime deps.

---

## Spec reference

Implements `docs/superpowers/specs/2026-06-02-heroui-live-trial-design.md`. Builds on the completed Plan 1 harness (`docs/superpowers/plans/2026-06-02-workbench-telemetry-harness.md`); reuses its `results.json` shape and single-run `buildResults`.

## Prerequisite

`FP_ALLOW_RESTRICTED_WRITE=1` must be exported in the executing shell (writes under `workbench/**` are otherwise blocked by `check-frozen-paths`). Verify with `echo $FP_ALLOW_RESTRICTED_WRITE` → `1` before starting.

## File structure

```
workbench/oracle/
  weights.json              # tunable composite weights + build-fail ceiling
  score-visual.mjs          # pure: two RGBA buffers → diffPct + score
  score-style.mjs           # pure: computed-style maps → per-property matchRate
  score-structural.mjs      # pure: DOM/ARIA/prop trees → structuralScore
  score-gates.mjs           # gate booleans → {typecheck,build,tests,a11y}
  score.mjs                 # composite blend + build-fail cap
  png.mjs                   # PNG buffer → {width,height,data} via node:zlib (capture-side, unit-tested)
  capture.mjs               # LIVE: oracle bundle from Storybook/Figma (thin, IO-only)
  render-generated.mjs      # LIVE: bundle from the scratch target (thin, IO-only)
  ladder.mjs                # ladder rung definitions + node-map merge helper
  *.test.mjs                # per-module tests
workbench/analyze/
  aggregate-trialset.mjs    # merge N single-run results.json → trialset.json
  aggregate-trialset.test.mjs
workbench/fixtures/
  rgba-pairs/               # tiny decoded-image fixtures for score-visual
  trialset-mini/            # 2 single-run results.json for the aggregator/e2e
  png/                      # a known 2x2 PNG for png.mjs
workbench/RUNBOOK-live.md   # operator runbook for the 9-run trial
```
Modify: `package.json` (add Playwright dev dep + `workbench:trialset` script), `workbench/report/markdown.mjs` (accuracy + ladder section), `workbench/report/dashboard.mjs` (accuracy chart), `workbench/report/build-report.mjs` (accept trialset.json).

## Data contracts

**`accuracy`** (replaces Plan 1's `null` on each run row):
```jsonc
{ "composite": 0, "visual": { "diffPct": 0, "score": 0 },
  "style": { "matchRate": 0, "properties": {} },
  "structural": { "score": 0 },
  "gates": { "typecheck": true, "build": true, "tests": true, "a11y": true },
  "weights": { "visual": 0.35, "style": 0.30, "structural": 0.20, "gates": 0.15 } }
```

**`trialset.json`** (aggregator output, report input):
```jsonc
{
  "trialId": "string", "generatedAt": null,
  "rungs": [{ "rung": "atom", "tier": "trivial", "runId": "r2", "icon": false,
    "agents": [/* Plan 1 per-agent rows */], "fanIn": [/* */],
    "accuracy": { /* above */ } }],
  "comparisons": {
    "iconFanIn": { "withIconsRung": "all-icons", "controlRung": "organism", "blockedMsDelta": 0 },
    "coldWarm": { "coldRunId": "r-cold", "warmRunId": "r-warm", "tokenDeltaPct": 0 },
    "buildUpdate": { "buildRunId": "r-build", "updateRunId": "r-update", "tokenDeltaPct": 0 }
  },
  "rollup": { /* Plan 1 rollup shape, across all rungs */ },
  "accuracyByRung": [{ "rung": "atom", "composite": 0 }]
}
```

**RGBA buffer** (what `score-visual` consumes, what `png.mjs` produces): `{ width, height, data }` where `data` is a flat array of `r,g,b,a` bytes, length `width*height*4`.

---

## Task 0: Oracle scaffold + Playwright dev dep + weights

**Files:**
- Create: `workbench/oracle/weights.json`
- Modify: `package.json`

- [ ] **Step 1: Add Playwright as a dev dependency**

Run: `npm install --save-dev playwright@^1.50.0`
Expected: `package.json` gains `"playwright"` under `devDependencies`; `package-lock.json` updates. (Do NOT run `npx playwright install` browsers yet — only needed for the live phase.)

- [ ] **Step 2: Add the trialset script to `package.json`**

Add to the `"scripts"` object (leave others untouched):
```json
"workbench:trialset": "node workbench/analyze/aggregate-trialset.mjs"
```

- [ ] **Step 3: Write `workbench/oracle/weights.json`**

```json
{
  "visual": 0.35,
  "style": 0.30,
  "structural": 0.20,
  "gates": 0.15,
  "buildFailCeiling": 20
}
```

- [ ] **Step 4: Verify the suite is still green**

Run: `node --test 'workbench/**/*.test.mjs'`
Expected: 24 pass / 0 fail (no behavior changed yet).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json workbench/oracle/weights.json
git commit -m "chore(workbench): add Playwright dev dep + composite weights config"
```

---

## Task 1: Visual scorer (`oracle/score-visual.mjs`)

Pure function over two decoded RGBA buffers. Counts pixels whose per-channel difference exceeds a tolerance, normalizes to a percentage, and maps to a 0–100 score. Mismatched dimensions score 0 (max difference).

**Files:**
- Create: `workbench/oracle/score-visual.mjs`
- Test: `workbench/oracle/score-visual.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// workbench/oracle/score-visual.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreVisual } from './score-visual.mjs';

const solid = (w, h, [r, g, b, a]) => {
  const data = new Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { data[i*4]=r; data[i*4+1]=g; data[i*4+2]=b; data[i*4+3]=a; }
  return { width: w, height: h, data };
};

test('identical images score 100 / 0% diff', () => {
  const a = solid(2, 2, [10, 20, 30, 255]);
  const r = scoreVisual(a, solid(2, 2, [10, 20, 30, 255]));
  assert.equal(r.diffPct, 0);
  assert.equal(r.score, 100);
});

test('fully different images score 0 / 100% diff', () => {
  const r = scoreVisual(solid(2, 2, [0,0,0,255]), solid(2, 2, [255,255,255,255]));
  assert.equal(r.diffPct, 100);
  assert.equal(r.score, 0);
});

test('half-different images score 50', () => {
  // 2x1: one pixel identical, one fully different
  const a = { width: 2, height: 1, data: [0,0,0,255, 0,0,0,255] };
  const b = { width: 2, height: 1, data: [0,0,0,255, 255,255,255,255] };
  const r = scoreVisual(a, b);
  assert.equal(r.diffPct, 50);
  assert.equal(r.score, 50);
});

test('mismatched dimensions score 0', () => {
  const r = scoreVisual(solid(2,2,[0,0,0,255]), solid(3,3,[0,0,0,255]));
  assert.equal(r.diffPct, 100);
  assert.equal(r.score, 0);
});

test('sub-tolerance differences do not count', () => {
  const a = { width: 1, height: 1, data: [100,100,100,255] };
  const b = { width: 1, height: 1, data: [104,100,100,255] }; // delta 4 < tol 8
  assert.equal(scoreVisual(a, b, { tolerance: 8 }).diffPct, 0);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test workbench/oracle/score-visual.test.mjs`
Expected: FAIL — `Cannot find module './score-visual.mjs'`.

- [ ] **Step 3: Implement `workbench/oracle/score-visual.mjs`**

```js
// workbench/oracle/score-visual.mjs
// Pure pixel-diff over two decoded RGBA buffers {width,height,data}.
// A pixel "differs" if any channel's absolute delta exceeds `tolerance`.
// diffPct = differing pixels / total * 100; score = 100 - diffPct.

export function scoreVisual(a, b, { tolerance = 8 } = {}) {
  if (!a || !b || a.width !== b.width || a.height !== b.height) {
    return { diffPct: 100, score: 0 };
  }
  const total = a.width * a.height;
  if (total === 0) return { diffPct: 0, score: 100 };
  let differing = 0;
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    if (
      Math.abs(a.data[o]   - b.data[o])   > tolerance ||
      Math.abs(a.data[o+1] - b.data[o+1]) > tolerance ||
      Math.abs(a.data[o+2] - b.data[o+2]) > tolerance ||
      Math.abs(a.data[o+3] - b.data[o+3]) > tolerance
    ) differing++;
  }
  const diffPct = Math.round((differing / total) * 100);
  return { diffPct, score: 100 - diffPct };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `node --test workbench/oracle/score-visual.test.mjs`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add workbench/oracle/score-visual.mjs workbench/oracle/score-visual.test.mjs
git commit -m "feat(workbench): pure RGBA visual diff scorer"
```

---

## Task 2: Style scorer (`oracle/score-style.mjs`)

Compares two computed-style maps (property → value string) over a fixed property set, returning a per-property match flag and an overall match rate. Color values are normalized (lowercased, whitespace-stripped) so `rgb(0, 0, 0)` and `rgb(0,0,0)` match.

**Files:**
- Create: `workbench/oracle/score-style.mjs`
- Test: `workbench/oracle/score-style.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// workbench/oracle/score-style.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreStyle, STYLE_PROPS } from './score-style.mjs';

test('STYLE_PROPS covers color/spacing/typography/radius', () => {
  for (const p of ['color','background-color','padding','margin','font-size','font-weight','border-radius'])
    assert.ok(STYLE_PROPS.includes(p), `missing ${p}`);
});

test('identical styles match 100%', () => {
  const s = { color: 'rgb(0,0,0)', 'font-size': '16px', 'border-radius': '8px' };
  const r = scoreStyle(s, { ...s });
  assert.equal(r.matchRate, 100);
});

test('color match ignores whitespace differences', () => {
  const r = scoreStyle({ color: 'rgb(0, 0, 0)' }, { color: 'rgb(0,0,0)' });
  assert.equal(r.properties.color, true);
});

test('matchRate is the percentage of compared properties that match', () => {
  const gen = { color: 'rgb(0,0,0)', 'font-size': '16px' };
  const ref = { color: 'rgb(0,0,0)', 'font-size': '14px' }; // 1 of 2 match
  const r = scoreStyle(gen, ref);
  assert.equal(r.matchRate, 50);
  assert.equal(r.properties.color, true);
  assert.equal(r.properties['font-size'], false);
});

test('a property absent on both sides is skipped, not counted as mismatch', () => {
  const r = scoreStyle({ color: 'rgb(1,1,1)' }, { color: 'rgb(1,1,1)' });
  assert.equal(r.matchRate, 100); // only `color` compared
  assert.equal('padding' in r.properties, false);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test workbench/oracle/score-style.test.mjs`
Expected: FAIL — `Cannot find module './score-style.mjs'`.

- [ ] **Step 3: Implement `workbench/oracle/score-style.mjs`**

```js
// workbench/oracle/score-style.mjs
// Compare two computed-style maps over a fixed property set.
// A property is "compared" only if present on at least one side.

export const STYLE_PROPS = [
  'color', 'background-color',
  'padding', 'margin', 'gap',
  'font-size', 'font-weight', 'font-family', 'line-height',
  'border-radius', 'border-width', 'border-color',
];

const norm = (v) => (v ?? '').toString().toLowerCase().replace(/\s+/g, '');

export function scoreStyle(generated = {}, reference = {}, props = STYLE_PROPS) {
  const properties = {};
  let compared = 0, matched = 0;
  for (const p of props) {
    const g = generated[p], r = reference[p];
    if (g === undefined && r === undefined) continue;
    compared++;
    const ok = norm(g) === norm(r);
    properties[p] = ok;
    if (ok) matched++;
  }
  const matchRate = compared === 0 ? 0 : Math.round((matched / compared) * 100);
  return { matchRate, properties };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `node --test workbench/oracle/score-style.test.mjs`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add workbench/oracle/score-style.mjs workbench/oracle/score-style.test.mjs
git commit -m "feat(workbench): computed-style match scorer"
```

---

## Task 3: Structural scorer (`oracle/score-structural.mjs`)

Compares two normalized DOM trees (tag + role + aria + children) and the exposed prop/variant surface. Returns a 0–100 structural score blending tag/role-tree similarity with prop-surface overlap.

**Files:**
- Create: `workbench/oracle/score-structural.mjs`
- Test: `workbench/oracle/score-structural.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// workbench/oracle/score-structural.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flattenTree, scoreStructural } from './score-structural.mjs';

const node = (tag, role, children = []) => ({ tag, role, children });

test('flattenTree yields tag:role tokens depth-first', () => {
  const tree = node('button', 'button', [node('span', null)]);
  assert.deepEqual(flattenTree(tree), ['button:button', 'span:']);
});

test('identical trees + identical props score 100', () => {
  const g = { tree: node('button','button',[node('span',null)]), props: ['variant','size'] };
  const r = { tree: node('button','button',[node('span',null)]), props: ['variant','size'] };
  assert.equal(scoreStructural(g, r).score, 100);
});

test('missing a child node lowers the tree component', () => {
  const g = { tree: node('button','button',[]), props: ['variant'] };
  const r = { tree: node('button','button',[node('span',null)]), props: ['variant'] };
  const s = scoreStructural(g, r).score;
  assert.ok(s > 0 && s < 100, `expected partial, got ${s}`);
});

test('prop-surface overlap contributes (Jaccard)', () => {
  const g = { tree: node('div',null), props: ['a','b'] };
  const r = { tree: node('div',null), props: ['a','c'] }; // intersection 1 / union 3
  const s = scoreStructural(g, r, { treeWeight: 0, propWeight: 1 });
  assert.equal(s.score, 33);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test workbench/oracle/score-structural.test.mjs`
Expected: FAIL — `Cannot find module './score-structural.mjs'`.

- [ ] **Step 3: Implement `workbench/oracle/score-structural.mjs`**

```js
// workbench/oracle/score-structural.mjs
// Structural similarity: tag:role token-sequence overlap + prop-surface Jaccard.

export function flattenTree(node, out = []) {
  if (!node) return out;
  out.push(`${node.tag ?? ''}:${node.role ?? ''}`);
  for (const c of node.children || []) flattenTree(c, out);
  return out;
}

// Multiset overlap ratio: |intersection| / max(|a|,|b|).
function seqOverlap(a, b) {
  if (a.length === 0 && b.length === 0) return 1;
  const counts = new Map();
  for (const t of a) counts.set(t, (counts.get(t) || 0) + 1);
  let inter = 0;
  for (const t of b) { const c = counts.get(t) || 0; if (c > 0) { inter++; counts.set(t, c - 1); } }
  return inter / Math.max(a.length, b.length);
}

function jaccard(a, b) {
  const sa = new Set(a), sb = new Set(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 1 : inter / union;
}

export function scoreStructural(generated, reference, { treeWeight = 0.6, propWeight = 0.4 } = {}) {
  const tree = seqOverlap(flattenTree(generated.tree), flattenTree(reference.tree));
  const prop = jaccard(generated.props || [], reference.props || []);
  const score = Math.round((tree * treeWeight + prop * propWeight) * 100);
  return { score, tree: Math.round(tree * 100), prop: Math.round(prop * 100) };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `node --test workbench/oracle/score-structural.test.mjs`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add workbench/oracle/score-structural.mjs workbench/oracle/score-structural.test.mjs
git commit -m "feat(workbench): structural DOM/prop-surface scorer"
```

---

## Task 4: Gate scorer (`oracle/score-gates.mjs`)

Turns four command results into pass/fail gate booleans. Takes an injectable runner `(label) => { ok }` so it is unit-testable without a real toolchain; the live caller passes a runner that shells out in the target dir.

**Files:**
- Create: `workbench/oracle/score-gates.mjs`
- Test: `workbench/oracle/score-gates.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// workbench/oracle/score-gates.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreGates, GATES } from './score-gates.mjs';

test('GATES is the fixed four-gate list', () => {
  assert.deepEqual(GATES, ['typecheck', 'build', 'tests', 'a11y']);
});

test('all gates pass when the runner returns ok for each', async () => {
  const r = await scoreGates({ runGate: async () => ({ ok: true }) });
  assert.deepEqual(r, { typecheck: true, build: true, tests: true, a11y: true });
});

test('a failing runner marks that gate false', async () => {
  const r = await scoreGates({ runGate: async (g) => ({ ok: g !== 'build' }) });
  assert.equal(r.build, false);
  assert.equal(r.typecheck, true);
});

test('a thrown runner is treated as a failed gate, not a crash', async () => {
  const r = await scoreGates({ runGate: async (g) => { if (g === 'tests') throw new Error('boom'); return { ok: true }; } });
  assert.equal(r.tests, false);
  assert.equal(r.a11y, true);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test workbench/oracle/score-gates.test.mjs`
Expected: FAIL — `Cannot find module './score-gates.mjs'`.

- [ ] **Step 3: Implement `workbench/oracle/score-gates.mjs`**

```js
// workbench/oracle/score-gates.mjs
// Run the four quality gates via an injectable runner so this is unit-testable.
// runGate(gateName) must resolve to { ok: boolean }; a throw counts as failure.

export const GATES = ['typecheck', 'build', 'tests', 'a11y'];

export async function scoreGates({ runGate }) {
  const result = {};
  for (const g of GATES) {
    try {
      const { ok } = await runGate(g);
      result[g] = !!ok;
    } catch {
      result[g] = false;
    }
  }
  return result;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `node --test workbench/oracle/score-gates.test.mjs`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add workbench/oracle/score-gates.mjs workbench/oracle/score-gates.test.mjs
git commit -m "feat(workbench): injectable-runner quality-gate scorer"
```

---

## Task 5: Composite (`oracle/score.mjs`)

Blends the four dimensions by configured weights into a 0–100 composite. A failed `build` gate caps the composite at `buildFailCeiling`. Gates contribute the fraction of gates passed.

**Files:**
- Create: `workbench/oracle/score.mjs`
- Test: `workbench/oracle/score.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// workbench/oracle/score.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeAccuracy } from './score.mjs';

const weights = { visual: 0.35, style: 0.30, structural: 0.20, gates: 0.15, buildFailCeiling: 20 };

test('all-perfect composite is 100', () => {
  const acc = composeAccuracy({
    visual: { diffPct: 0, score: 100 },
    style: { matchRate: 100, properties: {} },
    structural: { score: 100 },
    gates: { typecheck: true, build: true, tests: true, a11y: true },
  }, weights);
  assert.equal(acc.composite, 100);
  assert.deepEqual(acc.weights, { visual: 0.35, style: 0.30, structural: 0.20, gates: 0.15 });
});

test('gates contribute the fraction passed', () => {
  // visual/style/structural all 100, 2/4 gates pass (build still true so no cap)
  const acc = composeAccuracy({
    visual: { diffPct: 0, score: 100 },
    style: { matchRate: 100, properties: {} },
    structural: { score: 100 },
    gates: { typecheck: true, build: true, tests: false, a11y: false },
  }, weights);
  // 0.35*100 + 0.30*100 + 0.20*100 + 0.15*50 = 92.5 -> 93
  assert.equal(acc.composite, 93);
});

test('a failed build gate caps the composite at the ceiling', () => {
  const acc = composeAccuracy({
    visual: { diffPct: 0, score: 100 },
    style: { matchRate: 100, properties: {} },
    structural: { score: 100 },
    gates: { typecheck: true, build: false, tests: true, a11y: true },
  }, weights);
  assert.equal(acc.composite, 20);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test workbench/oracle/score.test.mjs`
Expected: FAIL — `Cannot find module './score.mjs'`.

- [ ] **Step 3: Implement `workbench/oracle/score.mjs`**

```js
// workbench/oracle/score.mjs
// Weighted composite of the four dimensions. A failed build gate caps the score.
import { GATES } from './score-gates.mjs';

export function composeAccuracy({ visual, style, structural, gates }, weights) {
  const gatesPassed = GATES.filter((g) => gates[g]).length;
  const gateScore = (gatesPassed / GATES.length) * 100;
  const raw =
    weights.visual * visual.score +
    weights.style * style.matchRate +
    weights.structural * structural.score +
    weights.gates * gateScore;
  let composite = Math.round(raw);
  if (gates.build === false) composite = Math.min(composite, weights.buildFailCeiling);
  return {
    composite,
    visual, style, structural, gates,
    weights: { visual: weights.visual, style: weights.style, structural: weights.structural, gates: weights.gates },
  };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `node --test workbench/oracle/score.test.mjs`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add workbench/oracle/score.mjs workbench/oracle/score.test.mjs
git commit -m "feat(workbench): weighted composite accuracy with build-fail cap"
```

---

## Task 6: PNG decoder (`oracle/png.mjs`)

Decodes a PNG buffer to the `{width,height,data}` RGBA shape `score-visual` consumes, using only `node:zlib`. Supports the truecolour-alpha (color type 6, 8-bit) PNGs Playwright emits, with the standard per-scanline filters. Unit-tested against a known 2×2 fixture.

**Files:**
- Create: `workbench/oracle/png.mjs`
- Test: `workbench/oracle/png.test.mjs`
- Create (fixture): `workbench/fixtures/png/red2x2.png` (generated in Step 1)

- [ ] **Step 1: Generate the 2×2 fixture PNG (one-off, committed)**

Run this exact command (writes a 2×2 opaque-red type-6 PNG via Node + zlib):
```bash
node -e '
const zlib=require("node:zlib"),fs=require("node:fs");
const W=2,H=2;
const raw=Buffer.alloc(H*(1+W*4));
for(let y=0;y<H;y++){const o=y*(1+W*4);raw[o]=0;for(let x=0;x<W;x++){const p=o+1+x*4;raw[p]=255;raw[p+1]=0;raw[p+2]=0;raw[p+3]=255;}}
const idat=zlib.deflateSync(raw);
const crc=(buf)=>{let c=~0;for(const b of buf){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1));}return (~c)>>>0;}
const chunk=(type,data)=>{const t=Buffer.from(type);const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const cr=Buffer.alloc(4);cr.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([len,t,data,cr]);}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(W,0);ihdr.writeUInt32BE(H,4);ihdr[8]=8;ihdr[9]=6;ihdr[10]=0;ihdr[11]=0;ihdr[12]=0;
const sig=Buffer.from([137,80,78,71,13,10,26,10]);
fs.mkdirSync("workbench/fixtures/png",{recursive:true});
fs.writeFileSync("workbench/fixtures/png/red2x2.png",Buffer.concat([sig,chunk("IHDR",ihdr),chunk("IDAT",idat),chunk("IEND",Buffer.alloc(0))]));
console.log("wrote red2x2.png");
'
```
Expected: prints `wrote red2x2.png`.

- [ ] **Step 2: Write the failing test**

```js
// workbench/oracle/png.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { decodePng } from './png.mjs';

const here = dirname(fileURLToPath(import.meta.url));

test('decodePng returns RGBA for a 2x2 red PNG', () => {
  const buf = readFileSync(join(here, '..', 'fixtures', 'png', 'red2x2.png'));
  const img = decodePng(buf);
  assert.equal(img.width, 2);
  assert.equal(img.height, 2);
  assert.equal(img.data.length, 2 * 2 * 4);
  assert.deepEqual([img.data[0], img.data[1], img.data[2], img.data[3]], [255, 0, 0, 255]);
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `node --test workbench/oracle/png.test.mjs`
Expected: FAIL — `Cannot find module './png.mjs'`.

- [ ] **Step 4: Implement `workbench/oracle/png.mjs`**

```js
// workbench/oracle/png.mjs
// Minimal PNG decoder for 8-bit truecolour-alpha (color type 6) — the format
// Playwright screenshots use. Returns {width,height,data} RGBA. node:zlib only.
import { inflateSync } from 'node:zlib';

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];

export function decodePng(buf) {
  for (let i = 0; i < SIG.length; i++)
    if (buf[i] !== SIG[i]) throw new Error('not a PNG');
  let off = 8, width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') break;
    off += 12 + len; // len + type(4) + data + crc(4)
  }
  if (bitDepth !== 8 || colorType !== 6) throw new Error(`unsupported PNG (bitDepth=${bitDepth}, colorType=${colorType})`);
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;                       // RGBA
  const stride = width * bpp;
  const out = new Uint8ClampedArray(width * height * bpp);
  let prevRow = new Uint8ClampedArray(stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    const row = new Uint8ClampedArray(stride);
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[p++];
      const a = x >= bpp ? row[x - bpp] : 0;       // left
      const b = prevRow[x];                         // up
      const c = x >= bpp ? prevRow[x - bpp] : 0;    // up-left
      let val;
      switch (filter) {
        case 0: val = rawByte; break;                       // None
        case 1: val = rawByte + a; break;                   // Sub
        case 2: val = rawByte + b; break;                   // Up
        case 3: val = rawByte + ((a + b) >> 1); break;      // Average
        case 4: {                                           // Paeth
          const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
          val = rawByte + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break;
        }
        default: throw new Error(`bad filter ${filter}`);
      }
      row[x] = val & 0xff;
    }
    out.set(row, y * stride);
    prevRow = row;
  }
  return { width, height, data: Array.from(out) };
}
```

- [ ] **Step 5: Run tests to confirm they pass**

Run: `node --test workbench/oracle/png.test.mjs`
Expected: PASS — 1 test.

- [ ] **Step 6: Commit**

```bash
git add workbench/oracle/png.mjs workbench/oracle/png.test.mjs workbench/fixtures/png/red2x2.png
git commit -m "feat(workbench): minimal zlib PNG decoder for visual scoring"
```

---

## Task 7: Trialset aggregator (`analyze/aggregate-trialset.mjs`)

Merges N single-run `results.json` (each from Plan 1's `buildResults`, each carrying one run + a filled `accuracy` + a `rung`/`tier`) into one `trialset.json`: per-rung rows, the three scenario comparisons, a cross-run rollup, and an accuracy-by-rung list.

**Files:**
- Create: `workbench/analyze/aggregate-trialset.mjs`
- Test: `workbench/analyze/aggregate-trialset.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// workbench/analyze/aggregate-trialset.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateTrialset } from './aggregate-trialset.mjs';

// Each input is a Plan-1 single-run results.json with one run, plus rung/tier on the run.
const mk = (runId, rung, tier, icon, tokens, blockedMs, composite) => ({
  trialId: 'heroui', generatedAt: null,
  runs: [{ runId, rung, tier, scenario: { icon, tier }, command: `/figma-build ${rung}`,
    wallMs: 1000, agents: [{ agent: 'component-builder', model: 'opus',
      tokens: { input: tokens, output: 0, thinkingEst: 0, cacheRead: 0, cacheCreation: 0, total: tokens },
      timeMs: { sumDuration: 100, wallSpan: 100, ttftAvg: 10 }, toolUses: 1, costUsd: 0.1 }],
    fanIn: blockedMs == null ? [] : [{ iconEndNs: '0', componentEndNs: '0', blockedMs }],
    accuracy: { composite } }],
  rollup: { perAgent: [], dominance: { tokens: 'component-builder', time: 'component-builder', byTier: {} },
    crossCheck: { otelTotalTokens: tokens, costsJsonlTotalTokens: tokens, deltaPct: 0 } },
});

test('aggregateTrialset builds per-rung rows + accuracyByRung', () => {
  const ts = aggregateTrialset({
    trialId: 'heroui',
    runs: [ mk('r2','atom','trivial',false,100,null,95), mk('r6','page','extreme',false,900,null,40) ],
  });
  assert.equal(ts.trialId, 'heroui');
  assert.equal(ts.rungs.length, 2);
  assert.deepEqual(ts.accuracyByRung, [{ rung: 'atom', composite: 95 }, { rung: 'page', composite: 40 }]);
  assert.equal(ts.rollup.dominance.tokens, 'component-builder');
});

test('iconFanIn comparison subtracts control blockedMs from with-icons rung', () => {
  const ts = aggregateTrialset({
    trialId: 'heroui',
    runs: [ mk('r4','organism','complex',false,200,0,80), mk('r7','all-icons','complex',true,260,12,70) ],
    comparisons: { iconFanIn: { withIconsRung: 'all-icons', controlRung: 'organism' } },
  });
  assert.equal(ts.comparisons.iconFanIn.blockedMsDelta, 12);
});

test('coldWarm + buildUpdate token deltas computed from named runs', () => {
  const ts = aggregateTrialset({
    trialId: 'heroui',
    runs: [ mk('cold','molecule','moderate',false,200,null,80), mk('warm','molecule','moderate',false,150,null,80),
            mk('upd','molecule','moderate',false,90,null,80) ],
    comparisons: {
      coldWarm: { coldRunId: 'cold', warmRunId: 'warm' },
      buildUpdate: { buildRunId: 'cold', updateRunId: 'upd' },
    },
  });
  assert.equal(ts.comparisons.coldWarm.tokenDeltaPct, -25); // (150-200)/200
  assert.equal(ts.comparisons.buildUpdate.tokenDeltaPct, -55); // (90-200)/200
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test workbench/analyze/aggregate-trialset.test.mjs`
Expected: FAIL — `Cannot find module './aggregate-trialset.mjs'`.

- [ ] **Step 3: Implement `workbench/analyze/aggregate-trialset.mjs`**

```js
// workbench/analyze/aggregate-trialset.mjs
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { buildRollup } from './aggregate.mjs';

const runTokens = (run) => run.agents.reduce((s, a) => s + a.tokens.total, 0);
const blockedFor = (rungs, rungName) => {
  const r = rungs.find((x) => x.rung === rungName);
  const f = r && r.fanIn && r.fanIn[0];
  return f ? f.blockedMs : 0;
};
const tokensForRun = (rungs, runId) => {
  const r = rungs.find((x) => x.runId === runId);
  return r ? runTokens(r) : 0;
};
const pctDelta = (from, to) => (from ? Math.round(((to - from) / from) * 100) : 0);

// input: { trialId, runs: [singleRunResults...], comparisons?: {...} }
export function aggregateTrialset({ trialId, runs, comparisons = {} }) {
  const rungs = runs.map((res) => {
    const run = res.runs[0];
    return {
      rung: run.rung, tier: run.tier, runId: run.runId, icon: !!(run.scenario && run.scenario.icon),
      agents: run.agents, fanIn: run.fanIn, accuracy: run.accuracy,
    };
  });

  const out = { trialId, generatedAt: null, rungs, comparisons: {}, rollup: null, accuracyByRung: [] };

  out.accuracyByRung = rungs.map((r) => ({ rung: r.rung, composite: r.accuracy ? r.accuracy.composite : null }));

  // cross-run rollup reuses Plan 1 buildRollup over per-rung agent rows
  const rollupRuns = rungs.map((r) => ({ agents: r.agents, scenario: { tier: r.tier } }));
  const otelTotal = rungs.reduce((s, r) => s + runTokens(r), 0);
  out.rollup = buildRollup(rollupRuns, { otelTotalTokens: otelTotal, costsJsonlTotalTokens: otelTotal });

  if (comparisons.iconFanIn) {
    const { withIconsRung, controlRung } = comparisons.iconFanIn;
    out.comparisons.iconFanIn = {
      withIconsRung, controlRung,
      blockedMsDelta: blockedFor(rungs, withIconsRung) - blockedFor(rungs, controlRung),
    };
  }
  if (comparisons.coldWarm) {
    const { coldRunId, warmRunId } = comparisons.coldWarm;
    out.comparisons.coldWarm = { coldRunId, warmRunId,
      tokenDeltaPct: pctDelta(tokensForRun(rungs, coldRunId), tokensForRun(rungs, warmRunId)) };
  }
  if (comparisons.buildUpdate) {
    const { buildRunId, updateRunId } = comparisons.buildUpdate;
    out.comparisons.buildUpdate = { buildRunId, updateRunId,
      tokenDeltaPct: pctDelta(tokensForRun(rungs, buildRunId), tokensForRun(rungs, updateRunId)) };
  }
  return out;
}

// CLI: node aggregate-trialset.mjs <out.json> <run1.json> <run2.json> ... [--comparisons comparisons.json]
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const ci = args.indexOf('--comparisons');
  const comparisons = ci >= 0 ? JSON.parse(readFileSync(args[ci + 1], 'utf8')) : {};
  const positional = ci >= 0 ? args.slice(0, ci) : args;
  const [outFile, ...runFiles] = positional;
  if (!outFile || runFiles.length === 0) { console.error('usage: aggregate-trialset.mjs <out.json> <run...json> [--comparisons c.json]'); process.exit(1); }
  const runs = runFiles.filter(existsSync).map((f) => JSON.parse(readFileSync(f, 'utf8')));
  const ts = aggregateTrialset({ trialId: runs[0]?.trialId ?? 'trial', runs, comparisons });
  writeFileSync(outFile, JSON.stringify(ts, null, 2));
  console.error(`[trialset] wrote ${outFile} (${ts.rungs.length} rungs)`);
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `node --test workbench/analyze/aggregate-trialset.test.mjs`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add workbench/analyze/aggregate-trialset.mjs workbench/analyze/aggregate-trialset.test.mjs
git commit -m "feat(workbench): trialset aggregator merging N runs with comparisons"
```

---

## Task 8: Markdown report — accuracy + ladder section

Adds a `renderTrialsetMarkdown` function rendering the accuracy-by-rung ladder, the three comparisons, and reusing the Plan 1 rollup. Leaves the existing `renderMarkdown` (single-run) untouched.

**Files:**
- Modify: `workbench/report/markdown.mjs`
- Test: `workbench/report/markdown-trialset.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// workbench/report/markdown-trialset.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTrialsetMarkdown } from './markdown.mjs';

const ts = {
  trialId: 'heroui', generatedAt: '2026-06-03T00:00:00Z',
  rungs: [
    { rung: 'atom', tier: 'trivial', runId: 'r2', icon: false, agents: [], fanIn: [], accuracy: { composite: 95, visual: { score: 98 }, style: { matchRate: 96 }, structural: { score: 90 }, gates: { typecheck: true, build: true, tests: true, a11y: true } } },
    { rung: 'page', tier: 'extreme', runId: 'r6', icon: false, agents: [], fanIn: [], accuracy: { composite: 40, visual: { score: 50 }, style: { matchRate: 45 }, structural: { score: 30 }, gates: { typecheck: true, build: false, tests: false, a11y: true } } },
  ],
  comparisons: {
    iconFanIn: { withIconsRung: 'all-icons', controlRung: 'organism', blockedMsDelta: 12 },
    coldWarm: { coldRunId: 'cold', warmRunId: 'warm', tokenDeltaPct: -25 },
    buildUpdate: { buildRunId: 'b', updateRunId: 'u', tokenDeltaPct: -55 },
  },
  rollup: { perAgent: [], dominance: { tokens: 'component-builder', time: 'component-builder', byTier: {} }, crossCheck: { otelTotalTokens: 1, costsJsonlTotalTokens: 1, deltaPct: 0 } },
  accuracyByRung: [{ rung: 'atom', composite: 95 }, { rung: 'page', composite: 40 }],
};

test('renderTrialsetMarkdown shows ladder accuracy and comparisons', () => {
  const md = renderTrialsetMarkdown(ts);
  assert.match(md, /# Workbench Trial Report — heroui/);
  assert.match(md, /atom/);
  assert.match(md, /\| *95 *\|/);                 // composite cell
  assert.match(md, /icon fan-in.*12 ?ms/is);      // comparison
  assert.match(md, /cold.*warm.*-25%/is);
  assert.match(md, /build.*update.*-55%/is);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test workbench/report/markdown-trialset.test.mjs`
Expected: FAIL — `renderTrialsetMarkdown is not a function` (import resolves; function missing).

- [ ] **Step 3: Add `renderTrialsetMarkdown` to `workbench/report/markdown.mjs`**

Append this export to the existing file (do not touch `renderMarkdown` or the `n` helper, which it reuses):
```js
export function renderTrialsetMarkdown(ts) {
  const L = [];
  L.push(`# Workbench Trial Report — ${ts.trialId}`);
  L.push('');
  L.push(`> Generated: ${ts.generatedAt ?? '(unstamped)'} · Rungs: ${ts.rungs.length}`);
  L.push('');
  L.push('## Accuracy by ladder rung');
  L.push('');
  L.push('| rung | tier | composite | visual | style | structural | build gate |');
  L.push('| --- | --- | ---: | ---: | ---: | ---: | :--: |');
  for (const r of ts.rungs) {
    const a = r.accuracy || {};
    L.push(`| ${r.rung} | ${r.tier} | ${n(a.composite)} | ${n(a.visual?.score)} | ${n(a.style?.matchRate)} | ${n(a.structural?.score)} | ${a.gates?.build ? '✓' : '✗'} |`);
  }
  L.push('');
  L.push('> Composite blends visual/style/structural/gates; a failed build gate caps the score (see `weights.json`).');
  L.push('');
  L.push('## Scenario comparisons');
  L.push('');
  const c = ts.comparisons || {};
  if (c.iconFanIn) L.push(`- **Icon fan-in:** rung \`${c.iconFanIn.withIconsRung}\` blocked ${n(c.iconFanIn.blockedMsDelta)} ms longer than control \`${c.iconFanIn.controlRung}\`.`);
  if (c.coldWarm) L.push(`- **Cold → warm cache:** token change ${c.coldWarm.tokenDeltaPct}% (run \`${c.coldWarm.coldRunId}\` → \`${c.coldWarm.warmRunId}\`).`);
  if (c.buildUpdate) L.push(`- **Build → update:** token change ${c.buildUpdate.tokenDeltaPct}% (run \`${c.buildUpdate.buildRunId}\` → \`${c.buildUpdate.updateRunId}\`).`);
  L.push('');
  L.push('## Dominance (all rungs)');
  L.push('');
  L.push(`- **Token-dominant agent:** ${ts.rollup.dominance.tokens}`);
  L.push(`- **Time-dominant agent:** ${ts.rollup.dominance.time}`);
  L.push('');
  return L.join('\n');
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `node --test workbench/report/markdown-trialset.test.mjs`
Expected: PASS — 1 test. Also run `node --test workbench/report/markdown.test.mjs` → still PASS (single-run renderer untouched).

- [ ] **Step 5: Commit**

```bash
git add workbench/report/markdown.mjs workbench/report/markdown-trialset.test.mjs
git commit -m "feat(workbench): trialset markdown report with accuracy ladder"
```

---

## Task 9: Dashboard — accuracy-by-rung chart

Adds `renderTrialsetDashboard` reusing the Plan 1 `svgBars`/`esc` helpers (export `svgBars` is already public). Renders an accuracy-by-rung bar chart + the comparisons, self-contained, no external assets.

**Files:**
- Modify: `workbench/report/dashboard.mjs`
- Test: `workbench/report/dashboard-trialset.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// workbench/report/dashboard-trialset.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTrialsetDashboard } from './dashboard.mjs';

const ts = {
  trialId: 'heroui', generatedAt: null,
  rungs: [], comparisons: { coldWarm: { coldRunId: 'c', warmRunId: 'w', tokenDeltaPct: -25 } },
  rollup: { perAgent: [{ agent: 'component-builder', tokens: { total: 100 }, timeMs: 10, costUsd: 0 }],
    dominance: { tokens: 'component-builder', time: 'component-builder', byTier: {} },
    crossCheck: { otelTotalTokens: 100, costsJsonlTotalTokens: 100, deltaPct: 0 } },
  accuracyByRung: [{ rung: 'atom', composite: 95 }, { rung: 'page', composite: 40 }],
};

test('renderTrialsetDashboard is self-contained html with an accuracy chart', () => {
  const html = renderTrialsetDashboard(ts);
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /Accuracy by rung/i);
  assert.match(html, /atom/);
  assert.equal((html.match(/<rect/g) || []).length >= 2, true); // a bar per rung
  assert.doesNotMatch(html, /src=["']https?:/);
  assert.match(html, /id="trialset-data"/);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test workbench/report/dashboard-trialset.test.mjs`
Expected: FAIL — `renderTrialsetDashboard is not a function`.

- [ ] **Step 3: Add `renderTrialsetDashboard` to `workbench/report/dashboard.mjs`**

Append (reusing the module's existing `esc` and exported `svgBars`):
```js
export function renderTrialsetDashboard(ts) {
  const accBars = svgBars(ts.accuracyByRung.map((r) => ({ label: r.rung, value: r.composite ?? 0 })));
  const tokenBars = svgBars(ts.rollup.perAgent.map((a) => ({ label: a.agent, value: a.tokens.total })));
  const data = esc(JSON.stringify(ts));
  const c = ts.comparisons || {};
  const cmp = [
    c.iconFanIn ? `Icon fan-in Δ ${c.iconFanIn.blockedMsDelta} ms` : null,
    c.coldWarm ? `Cold→warm ${c.coldWarm.tokenDeltaPct}%` : null,
    c.buildUpdate ? `Build→update ${c.buildUpdate.tokenDeltaPct}%` : null,
  ].filter(Boolean).map(esc).join(' · ');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Workbench Trial — ${esc(ts.trialId)}</title>
<style>body{font:14px system-ui,sans-serif;margin:2rem;max-width:900px}h1{margin-bottom:0}
section{margin:2rem 0}.note{color:#6b7280;font-size:.85rem}</style></head>
<body>
<h1>Workbench Trial Report — ${esc(ts.trialId)}</h1>
<p class="note">${cmp}</p>
<section><h2>Accuracy by rung (composite)</h2>${accBars}
<p class="note">Composite blends visual/style/structural/gates; build-fail caps the score.</p></section>
<section><h2>Tokens per agent (all rungs)</h2>${tokenBars}</section>
<section><h2>Raw trialset</h2>
<script type="application/json" id="trialset-data">${data}</script>
<details><summary>Show JSON</summary><pre>${data}</pre></details></section>
</body></html>`;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `node --test workbench/report/dashboard-trialset.test.mjs`
Expected: PASS — 1 test. Run `node --test workbench/report/dashboard.test.mjs` → still PASS.

- [ ] **Step 5: Commit**

```bash
git add workbench/report/dashboard.mjs workbench/report/dashboard-trialset.test.mjs
git commit -m "feat(workbench): trialset dashboard with accuracy-by-rung chart"
```

---

## Task 10: build-report — trialset mode

Teaches `build-report.mjs` to detect a trialset (`accuracyByRung` present) and route to the trialset renderers; single-run inputs keep the Plan 1 path.

**Files:**
- Modify: `workbench/report/build-report.mjs`
- Test: `workbench/report/build-report-trialset.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// workbench/report/build-report-trialset.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildReport } from './build-report.mjs';

test('buildReport renders trialset inputs via the trialset renderers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wb-ts-'));
  const p = join(dir, 'trialset.json');
  writeFileSync(p, JSON.stringify({
    trialId: 'heroui', generatedAt: null, rungs: [], comparisons: {},
    rollup: { perAgent: [], dominance: { tokens: 'x', time: 'x', byTier: {} }, crossCheck: { otelTotalTokens: 0, costsJsonlTotalTokens: 0, deltaPct: 0 } },
    accuracyByRung: [{ rung: 'atom', composite: 95 }],
  }));
  buildReport(p, '2026-06-03T00:00:00Z');
  assert.ok(existsSync(join(dir, 'report.md')));
  assert.ok(existsSync(join(dir, 'dashboard.html')));
  assert.match(readFileSync(join(dir, 'report.md'), 'utf8'), /Workbench Trial Report — heroui/);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test workbench/report/build-report-trialset.test.mjs`
Expected: FAIL — report.md contains the single-run title, not "Trial Report" (assertion fails).

- [ ] **Step 3: Update `workbench/report/build-report.mjs`**

Replace the imports and `buildReport` body (keep the CLI block) with:
```js
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { renderMarkdown, renderTrialsetMarkdown } from './markdown.mjs';
import { renderDashboard, renderTrialsetDashboard } from './dashboard.mjs';

// generatedAt is passed in (Date.now is unavailable in some harness contexts).
export function buildReport(resultsPath, generatedAt) {
  const r = JSON.parse(readFileSync(resultsPath, 'utf8'));
  r.generatedAt = generatedAt ?? r.generatedAt ?? null;
  const isTrialset = Array.isArray(r.accuracyByRung);
  const dir = dirname(resultsPath);
  writeFileSync(join(dir, 'report.md'), isTrialset ? renderTrialsetMarkdown(r) : renderMarkdown(r));
  writeFileSync(join(dir, 'dashboard.html'), isTrialset ? renderTrialsetDashboard(r) : renderDashboard(r));
  return { md: join(dir, 'report.md'), html: join(dir, 'dashboard.html') };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `node --test workbench/report/build-report-trialset.test.mjs`
Expected: PASS — 1 test. Run `node --test workbench/report/build-report.test.mjs` → still PASS (single-run path intact).

- [ ] **Step 5: Commit**

```bash
git add workbench/report/build-report.mjs workbench/report/build-report-trialset.test.mjs
git commit -m "feat(workbench): build-report routes trialset vs single-run inputs"
```

---

## Task 11: Ladder definition + score-runner glue (`oracle/ladder.mjs`, `oracle/score.mjs` runner)

Provides the canonical 7-rung ladder (rung → tier → oracle source) and a `scoreComponent` glue that runs the four scorers against a `{ generated, oracle }` bundle and composes them. The scorers are already pure/tested; this wires them with the loaded `weights.json`.

**Files:**
- Create: `workbench/oracle/ladder.mjs`
- Create: `workbench/oracle/score-component.mjs`
- Test: `workbench/oracle/ladder.test.mjs`
- Test: `workbench/oracle/score-component.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
// workbench/oracle/ladder.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LADDER, oracleSourceFor } from './ladder.mjs';

test('LADDER has the 7 rungs with tiers and oracle sources', () => {
  assert.equal(LADDER.length, 7);
  assert.deepEqual(LADDER.map(r => r.rung), ['icon-only','atom','molecule','organism','template','page','all-icons']);
  assert.equal(oracleSourceFor('atom'), 'storybook');
  assert.equal(oracleSourceFor('page'), 'figma');
  assert.equal(oracleSourceFor('template'), 'figma');
  assert.equal(oracleSourceFor('icon-only'), 'storybook');
});
```

```js
// workbench/oracle/score-component.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreComponent } from './score-component.mjs';

test('scoreComponent runs four scorers and composes', async () => {
  const bundle = {
    generated: { image: { width: 1, height: 1, data: [0,0,0,255] }, style: { color: 'rgb(0,0,0)' }, dom: { tree: { tag: 'button', role: 'button' }, props: ['variant'] } },
    oracle:    { image: { width: 1, height: 1, data: [0,0,0,255] }, style: { color: 'rgb(0,0,0)' }, dom: { tree: { tag: 'button', role: 'button' }, props: ['variant'] } },
  };
  const acc = await scoreComponent(bundle, {
    weights: { visual: 0.35, style: 0.30, structural: 0.20, gates: 0.15, buildFailCeiling: 20 },
    runGate: async () => ({ ok: true }),
  });
  assert.equal(acc.composite, 100);
  assert.equal(acc.visual.score, 100);
  assert.equal(acc.gates.build, true);
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `node --test workbench/oracle/ladder.test.mjs workbench/oracle/score-component.test.mjs`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `workbench/oracle/ladder.mjs`**

```js
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
```

- [ ] **Step 4: Implement `workbench/oracle/score-component.mjs`**

```js
// workbench/oracle/score-component.mjs
import { scoreVisual } from './score-visual.mjs';
import { scoreStyle } from './score-style.mjs';
import { scoreStructural } from './score-structural.mjs';
import { scoreGates } from './score-gates.mjs';
import { composeAccuracy } from './score.mjs';

// bundle: { generated: { image, style, dom }, oracle: { image, style, dom } }
// opts: { weights, runGate }
export async function scoreComponent(bundle, { weights, runGate }) {
  const visual = scoreVisual(bundle.generated.image, bundle.oracle.image);
  const style = scoreStyle(bundle.generated.style, bundle.oracle.style);
  const structural = scoreStructural(bundle.generated.dom, bundle.oracle.dom);
  const gates = await scoreGates({ runGate });
  return composeAccuracy({ visual, style, structural, gates }, weights);
}
```

- [ ] **Step 5: Run tests to confirm they pass**

Run: `node --test workbench/oracle/ladder.test.mjs workbench/oracle/score-component.test.mjs`
Expected: PASS — 2 tests.

- [ ] **Step 6: Commit**

```bash
git add workbench/oracle/ladder.mjs workbench/oracle/score-component.mjs workbench/oracle/ladder.test.mjs workbench/oracle/score-component.test.mjs
git commit -m "feat(workbench): 7-rung ladder + score-component glue"
```

---

## Task 12: End-to-end trialset smoke + full suite

Builds a trialset from two fixture single-run results and renders the report, proving aggregate→report integrates. No live services.

**Files:**
- Create: `workbench/fixtures/trialset-mini/run-atom.json`
- Create: `workbench/fixtures/trialset-mini/run-page.json`
- Create: `workbench/e2e-trialset.test.mjs`

- [ ] **Step 1: Create the two fixture single-run results**

`workbench/fixtures/trialset-mini/run-atom.json`:
```json
{ "trialId": "heroui", "generatedAt": null,
  "runs": [{ "runId": "r2", "rung": "atom", "tier": "trivial", "scenario": { "icon": false, "tier": "trivial" }, "command": "/figma-build atom", "wallMs": 1000,
    "agents": [{ "agent": "component-builder", "model": "opus", "tokens": { "input": 100, "output": 0, "thinkingEst": 0, "cacheRead": 0, "cacheCreation": 0, "total": 100 }, "timeMs": { "sumDuration": 100, "wallSpan": 100, "ttftAvg": 10 }, "toolUses": 1, "costUsd": 0.1 }],
    "fanIn": [], "accuracy": { "composite": 95, "visual": { "diffPct": 2, "score": 98 }, "style": { "matchRate": 96, "properties": {} }, "structural": { "score": 90 }, "gates": { "typecheck": true, "build": true, "tests": true, "a11y": true }, "weights": { "visual": 0.35, "style": 0.3, "structural": 0.2, "gates": 0.15 } } }],
  "rollup": { "perAgent": [], "dominance": { "tokens": "component-builder", "time": "component-builder", "byTier": {} }, "crossCheck": { "otelTotalTokens": 100, "costsJsonlTotalTokens": 100, "deltaPct": 0 } } }
```

`workbench/fixtures/trialset-mini/run-page.json`:
```json
{ "trialId": "heroui", "generatedAt": null,
  "runs": [{ "runId": "r6", "rung": "page", "tier": "extreme", "scenario": { "icon": false, "tier": "extreme" }, "command": "/figma-build page", "wallMs": 5000,
    "agents": [{ "agent": "component-builder", "model": "opus", "tokens": { "input": 900, "output": 0, "thinkingEst": 0, "cacheRead": 0, "cacheCreation": 0, "total": 900 }, "timeMs": { "sumDuration": 500, "wallSpan": 500, "ttftAvg": 20 }, "toolUses": 9, "costUsd": 0.9 }],
    "fanIn": [], "accuracy": { "composite": 40, "visual": { "diffPct": 50, "score": 50 }, "style": { "matchRate": 45, "properties": {} }, "structural": { "score": 30 }, "gates": { "typecheck": true, "build": false, "tests": false, "a11y": true }, "weights": { "visual": 0.35, "style": 0.3, "structural": 0.2, "gates": 0.15 } } }],
  "rollup": { "perAgent": [], "dominance": { "tokens": "component-builder", "time": "component-builder", "byTier": {} }, "crossCheck": { "otelTotalTokens": 900, "costsJsonlTotalTokens": 900, "deltaPct": 0 } } }
```

- [ ] **Step 2: Write the e2e test**

```js
// workbench/e2e-trialset.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { aggregateTrialset } from './analyze/aggregate-trialset.mjs';
import { buildReport } from './report/build-report.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fx = join(here, 'fixtures', 'trialset-mini');

test('two fixture runs → trialset → trial report.md + dashboard.html', () => {
  const runs = ['run-atom.json', 'run-page.json'].map(f => JSON.parse(readFileSync(join(fx, f), 'utf8')));
  const ts = aggregateTrialset({ trialId: 'heroui', runs,
    comparisons: { coldWarm: { coldRunId: 'r6', warmRunId: 'r2' } } });
  assert.equal(ts.rungs.length, 2);
  assert.deepEqual(ts.accuracyByRung, [{ rung: 'atom', composite: 95 }, { rung: 'page', composite: 40 }]);
  assert.equal(ts.comparisons.coldWarm.tokenDeltaPct, -89); // (100-900)/900

  const out = mkdtempSync(join(tmpdir(), 'wb-ts-e2e-'));
  const p = join(out, 'trialset.json');
  writeFileSync(p, JSON.stringify(ts, null, 2));
  buildReport(p, '2026-06-03T00:00:00Z');
  assert.ok(existsSync(join(out, 'report.md')));
  assert.ok(existsSync(join(out, 'dashboard.html')));
  assert.match(readFileSync(join(out, 'report.md'), 'utf8'), /Accuracy by ladder rung/);
});
```

- [ ] **Step 3: Run it**

Run: `node --test workbench/e2e-trialset.test.mjs`
Expected: PASS — 1 test.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: all workbench tests pass (`fail 0`). Confirm the count increased by the Plan 2 additions.

- [ ] **Step 5: Commit**

```bash
git add workbench/fixtures/trialset-mini/ workbench/e2e-trialset.test.mjs
git commit -m "test(workbench): end-to-end trialset fixtures→trial report"
```

---

## Task 13: Live-trial runbook (`workbench/RUNBOOK-live.md`)

Documents the operator-driven 9-run HeroUI trial end to end. Documentation only.

**Files:**
- Create: `workbench/RUNBOOK-live.md`

- [ ] **Step 1: Write `workbench/RUNBOOK-live.md`**

````markdown
# HeroUI live trial runbook (Plan 2)

Prereq: `export FP_ALLOW_RESTRICTED_WRITE=1` in every shell that writes under `workbench/`.
Trial id below is `heroui-<date>`; create `workbench/trials/<trialId>/` and `workbench/reports/<trialId>/`.

## 1. Reference + target
- Clone the oracle (read-only): `git clone --depth 1 -b v3 https://github.com/heroui-inc/heroui workbench/trials/<trialId>/ref-heroui`
- Scaffold the write-target: a fresh React + Tailwind v4 app at `workbench/trials/<trialId>/target/`.
- `/init-figma-compose` against the target: framework=react, cssSystem=tailwind-v4, designSystem=none, methodology=atomic. Add `workbench/**` to `config.writeScope.allowedDirs`.

## 2. Confirm the ladder nodes (discovery)
- `mcp__figma__get_metadata` on pages `0:1` (cover) and `10:1849` (icons); pick one node per rung per `workbench/oracle/ladder.mjs` (LADDER). Record `{ rung → nodeId }`.

## 3. Capture the oracle bundles
- Component rungs (icon-only/atom/molecule/organism/all-icons): start HeroUI Storybook (`pnpm --filter @heroui/storybook dev`) or use `storybook-sb-mcp`; capture screenshot+style+DOM of the matching story.
- Template/page rungs: `mcp__figma__get_screenshot` of the node (visual) + `mcp__figma__get_variable_defs` (style reference).
- Decode screenshots with `workbench/oracle/png.mjs` `decodePng` into the RGBA shape the visual scorer expects.

## 4. Start telemetry (Plan 1 harness)
- `node workbench/collector/receiver.mjs workbench/trials/<trialId>/<runId> 4318` (one dir per run).
- Export the env from `workbench/runner/env.mjs` `telemetryEnv` (see `workbench/RUNBOOK.md` step 2).

## 5. Run the 9 invocations (one trial dir each)
Per `workbench/runner/matrix.mjs` `defaultMatrix()` mapped onto the ladder:
- 7 cold `/figma-build <nodeId>` (icon-only, atom, molecule, organism, template, page, all-icons).
- 1 warm: re-run a chosen rung's `/figma-build` (cache populated) → coldWarm pair.
- 1 update: `/figma-update <nodeId>` on a changed rung → buildUpdate pair.
Snapshot each run's `/tmp/figma-<runId>/costs.jsonl` into `<runId>/costs/`. Note start/end ISO per run; write each `<runId>/run-manifest.json` (single run, with `rung` + `tier` on the run row).

## 6. Per-run results + scoring
- `node workbench/analyze/build-results.mjs workbench/trials/<trialId>/<runId> workbench/trials/<trialId>/<runId>/results.json`
- Render the generated component (`workbench/oracle/render-generated.mjs`) and score it:
  `scoreComponent({ generated, oracle }, { weights: require weights.json, runGate })` → write the result into that run's `results.json` run row `accuracy` field (replacing null). The `runGate` runs typecheck/build/test/a11y in the target dir.

## 7. Aggregate + report
- `node workbench/analyze/aggregate-trialset.mjs workbench/reports/<trialId>/trialset.json workbench/trials/<trialId>/*/results.json --comparisons workbench/trials/<trialId>/comparisons.json`
  where `comparisons.json` names the iconFanIn / coldWarm / buildUpdate run ids.
- `npm run workbench:report -- workbench/reports/<trialId>/trialset.json`
- Open `workbench/reports/<trialId>/dashboard.html`; commit `report.md` + `trialset.json` (not the raw trial dumps or dashboard.html — already gitignored).
````

- [ ] **Step 2: Commit**

```bash
git add workbench/RUNBOOK-live.md
git commit -m "docs(workbench): operator runbook for the 9-run HeroUI live trial"
```

---

## Task 14: Capture stubs (`oracle/capture.mjs`, `oracle/render-generated.mjs`)

Thin IO-only modules the runbook calls. They are not unit-tested (live services); they exist so the runbook references real files and the scoring glue has a producer. Keep them minimal — orchestration only, all scoring logic stays in the tested pure modules.

**Files:**
- Create: `workbench/oracle/capture.mjs`
- Create: `workbench/oracle/render-generated.mjs`

- [ ] **Step 1: Implement `workbench/oracle/capture.mjs`**

```js
// workbench/oracle/capture.mjs
// LIVE oracle capture (operator phase). Component rungs → HeroUI Storybook;
// template/page rungs → Figma screenshot. Returns { image, style, dom }.
// IO-only orchestration: all scoring logic lives in the tested pure modules.
import { decodePng } from './png.mjs';
import { oracleSourceFor } from './ladder.mjs';

// deps is injected so this stays driver-agnostic and the operator can wire
// Playwright + the figma MCP without this file importing them directly:
//   deps.storybookShot(rung) -> { pngBuffer, style, dom }
//   deps.figmaShot(nodeId)   -> { pngBuffer, style, dom }
export async function captureOracle(rung, nodeId, deps) {
  const source = oracleSourceFor(rung);
  const raw = source === 'storybook'
    ? await deps.storybookShot(rung)
    : await deps.figmaShot(nodeId);
  return { image: decodePng(raw.pngBuffer), style: raw.style, dom: raw.dom, source };
}
```

- [ ] **Step 2: Implement `workbench/oracle/render-generated.mjs`**

```js
// workbench/oracle/render-generated.mjs
// LIVE capture of the generated component from the scratch target (operator
// phase). Mirrors captureOracle's output shape. IO-only; deps injected.
import { decodePng } from './png.mjs';

// deps.targetShot(componentName) -> { pngBuffer, style, dom }
export async function renderGenerated(componentName, deps) {
  const raw = await deps.targetShot(componentName);
  return { image: decodePng(raw.pngBuffer), style: raw.style, dom: raw.dom };
}
```

- [ ] **Step 3: Confirm the suite still passes (no tests added, no regressions)**

Run: `npm test`
Expected: `fail 0` (these modules are imported by no test; they parse cleanly as ESM).

- [ ] **Step 4: Verify the new modules at least import without error**

Run: `node -e "import('./workbench/oracle/capture.mjs').then(()=>import('./workbench/oracle/render-generated.mjs')).then(()=>console.log('import ok'))"`
Expected: prints `import ok`.

- [ ] **Step 5: Commit**

```bash
git add workbench/oracle/capture.mjs workbench/oracle/render-generated.mjs
git commit -m "feat(workbench): live capture stubs (storybook/figma oracle, target render)"
```

---

## Self-review (completed during planning)

**Spec coverage:**
- §2 target/workspace → Task 13 runbook (clone, init, allowlist). ✓
- §3 ladder discovery → Task 11 `ladder.mjs` + Task 13 step 2. ✓
- §4 hybrid capture → Task 14 `capture.mjs` (storybook/figma branch via `oracleSourceFor`) + Task 6 PNG decode. ✓
- §5 four scorers + composite → Tasks 1 (visual), 2 (style), 3 (structural), 4 (gates), 5 (composite), 11 (glue). ✓
- §6 trialset aggregation + report extension → Tasks 7 (aggregator), 8 (md), 9 (dashboard), 10 (build-report routing). ✓
- §7 live flow → Task 13 runbook. ✓
- §9 Playwright dep → Task 0. ✓
- §10 open questions: PNG diff (self-contained decoder, Task 6 — no pixelmatch dep); a11y gate (injectable runGate, Task 4 — operator picks axe/skill); storybook-sb-mcp specifics (deferred to capture wiring, Task 14 deps injection). ✓

**Placeholder scan:** No TBD/TODO; every code step has full code. The two capture stubs (Task 14) are intentionally thin orchestrators with injected deps, not placeholders — they contain complete logic for their one job (decode + delegate).

**Type consistency:** `accuracy` shape (`composite`, `visual.score`, `visual.diffPct`, `style.matchRate`, `structural.score`, `gates.{typecheck,build,tests,a11y}`, `weights`) is identical across Task 5 (producer), Task 8/9 (md/dashboard consumers), and Task 12 fixtures. `trialset.json` fields (`rungs[].{rung,tier,runId,icon,agents,fanIn,accuracy}`, `comparisons.{iconFanIn,coldWarm,buildUpdate}`, `rollup`, `accuracyByRung`) match across Task 7 (producer), Tasks 8–10 (consumers), Task 12 (e2e). Function names (`scoreVisual`, `scoreStyle`, `scoreStructural`, `scoreGates`, `composeAccuracy`, `decodePng`, `aggregateTrialset`, `renderTrialsetMarkdown`, `renderTrialsetDashboard`, `oracleSourceFor`, `scoreComponent`, `captureOracle`, `renderGenerated`) are consistent between definition and use. The Plan 1 `buildRollup` is reused unchanged by Task 7. `svgBars`/`esc` reused from Plan 1 dashboard (svgBars is exported; esc is module-private and only referenced inside dashboard.mjs). ✓

## Notes for the executor
- The visual scorer is pure over RGBA buffers; only `png.mjs` touches PNG bytes, and only the live capture decodes real screenshots. This keeps every scorer unit-testable without Playwright.
- Plan 1's single-run guard in `build-results.mjs` stays intact: each of the 9 runs is its own trial dir; the trialset is assembled afterward by `aggregate-trialset.mjs`, not by `buildResults`.
- `package.json` `test` script already globs `workbench/**/*.test.mjs`, so all new tests are auto-discovered.
- Model tier stays auto-routed by complexity during the live runs (realistic); the per-agent rows already carry `model`, so the report shows which tier each rung used.
- Do not commit raw trial dumps or `dashboard.html` (Plan 1 `.gitignore` already excludes `workbench/trials/` and `workbench/reports/*/dashboard.html`).
