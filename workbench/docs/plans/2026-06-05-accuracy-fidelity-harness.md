# Accuracy Fidelity Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute real `visual` / `style` / `structural` accuracy sub-scores for the HeroUI trial by comparing the generated target component against the HeroUI oracle, combine with deterministic build gates, and surface populated accuracy in `report.md` + `dashboard.html`.

**Architecture:** Reuse the existing tested pure scorers (`score-visual`/`score-style`/`score-structural`/`score-gates`/`composeAccuracy`) untouched in their math. Add a dependency-free source parser (`extract-structural`), a weight-renormaliser (`effective-weights`), a pure assembler (`assemble-accuracy`), a rung→source/story map (`rung-map`), a Playwright dual-Storybook capture (`render-harness`), and an IO driver (`run-accuracy`). Sub-scores that can't be computed (no oracle story, Storybook down) are marked unavailable and their weight is renormalised away so the composite never collapses to 0.

**Tech Stack:** Node ESM (node:test), `playwright` (project root `node_modules`), Storybook 10 (target + HeroUI), Tailwind v4. No new runtime deps for the pure modules (node builtins only).

---

## Conventions

- All paths below are relative to `workbench/` unless absolute.
- Run tests with: `node --test 'oracle/*.test.mjs'` (from `workbench/`).
- File writes under `workbench/trials/**` require `FP_ALLOW_RESTRICTED_WRITE=1` on the shell (frozen-paths hook). The new `oracle/*.mjs` files are under `workbench/**` and write-allowed directly.
- Trial root constant used throughout: `TRIAL = workbench/trials/heroui-20260603`.
- Commit messages end with the Co-Authored-By trailer per repo policy. Commit only the files each task touches.

## File Structure

| File | Responsibility | Phase |
|---|---|---|
| `oracle/extract-structural.mjs` | Pure: `.tsx` source → `{tree, props}` for `scoreStructural` | P1 |
| `oracle/extract-structural.test.mjs` | Unit tests (fixtures) | P1 |
| `oracle/effective-weights.mjs` | Pure: renormalise fidelity weights over available sub-scores | P1 |
| `oracle/effective-weights.test.mjs` | Unit tests | P1 |
| `oracle/score-gates.mjs` | **Modify**: accept a `gates` subset param | P1 |
| `oracle/score-gates.test.mjs` | **Modify**: add subset test | P1 |
| `oracle/score.mjs` | **Modify**: `composeAccuracy` gate term over *evaluated* gates | P1 |
| `oracle/score.test.mjs` | **Modify**: add a11y-omitted test | P1 |
| `oracle/assemble-accuracy.mjs` | Pure: sub-scores + availability → accuracy object | P1 |
| `oracle/assemble-accuracy.test.mjs` | Unit tests | P1 |
| `oracle/rung-map.mjs` | Config: rung → component/source paths/story ids | P1 |
| `oracle/rung-map.test.mjs` | Unit test | P1 |
| `oracle/run-accuracy.mjs` | IO driver: assemble accuracy, write results.json, regen report | P1/P2 |
| `oracle/render-harness.mjs` | IO: build+serve both Storybooks, Playwright capture | P2 |
| `report/markdown.mjs` + `dashboard.mjs` | **Modify**: accuracy availability note | P3 |

---

## PHASE 1 — Structural + Gates (no browser)

### Task 1: `extract-structural.mjs` — source → `{tree, props}`

**Files:**
- Create: `oracle/extract-structural.mjs`
- Test: `oracle/extract-structural.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// oracle/extract-structural.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractStructural } from './extract-structural.mjs';

const SRC = `
import { forwardRef } from 'react';
interface FooProps {
  variant?: string;
  size?: number;
  onClick?: () => void;
}
export const Foo = forwardRef<HTMLButtonElement, FooProps>((p, ref) => (
  <div role="group" className="x">
    <button ref={ref}>{p.label}</button>
    <span />
  </div>
));
`;

test('extractStructural collects host tags, role attrs, and prop names', () => {
  const { tree, props } = extractStructural(SRC);
  assert.equal(tree.tag, 'root');
  const tags = tree.children.map((c) => c.tag);
  assert.deepEqual(tags, ['div', 'button', 'span']);   // generic <HTMLButtonElement,...> skipped
  assert.equal(tree.children[0].role, 'group');
  assert.deepEqual(props.sort(), ['onClick', 'size', 'variant']);
});

test('extractStructural is empty-safe', () => {
  assert.deepEqual(extractStructural(''), { tree: { tag: 'root', children: [] }, props: [] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test oracle/extract-structural.test.mjs`
Expected: FAIL — `Cannot find module './extract-structural.mjs'`.

- [ ] **Step 3: Write the implementation**

```js
// oracle/extract-structural.mjs
// Pure, dependency-free structural extraction from a .tsx source string.
// Produces the { tree, props } shape score-structural.mjs consumes. We do NOT
// build a perfectly-nested JSX tree (fragile against expressions/fragments).
// Instead we collect the JSX element vocabulary in document order as a FLAT
// tree (root -> [elements]); score-structural.flattenTree turns that into a
// `tag:role` multiset and seqOverlap compares vocabularies — a robust,
// comparative structural signal. Generic type args (forwardRef<...>) are
// skipped via a negative lookbehind: a JSX `<` is never preceded by an
// identifier char, whereas `forwardRef<` always is.

const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// <Tag ...> or <Tag ... />, not a closing tag, not a generic.
const TAG_RE = /(?<![A-Za-z0-9_])<([A-Za-z][A-Za-z0-9._]*)((?:[^>"']|"[^"]*"|'[^']*')*?)\/?>/g;
const ROLE_RE = /\brole\s*=\s*"([^"]*)"/;

function extractProps(source) {
  // First `interface XxxProps {...}` or `type XxxProps = {...}` block.
  const m = source.match(/(?:interface|type)\s+\w*Props\b[^{]*\{([\s\S]*?)\n\}/);
  if (!m) return [];
  const names = new Set();
  for (const line of m[1].split('\n')) {
    const k = line.match(/^\s*(?:readonly\s+)?([A-Za-z_]\w*)\s*\??\s*:/);
    if (k) names.add(k[1]);
  }
  return [...names];
}

export function extractStructural(source = '') {
  const code = stripComments(source);
  const children = [];
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(code))) {
    const node = { tag: m[1] };
    const role = (m[2] || '').match(ROLE_RE);
    if (role) node.role = role[1];
    children.push(node);
  }
  return { tree: { tag: 'root', children }, props: extractProps(source) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test oracle/extract-structural.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add oracle/extract-structural.mjs oracle/extract-structural.test.mjs
git commit -m "feat(workbench): pure .tsx structural extractor (tree + prop surface)"
```

---

### Task 2: `effective-weights.mjs` — renormalise over available sub-scores

**Files:**
- Create: `oracle/effective-weights.mjs`
- Test: `oracle/effective-weights.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// oracle/effective-weights.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveWeights } from './effective-weights.mjs';

const BASE = { visual: 0.35, style: 0.30, structural: 0.20, gates: 0.15, buildFailCeiling: 20 };

test('all available → unchanged (sum 1, ceiling preserved)', () => {
  const w = effectiveWeights(BASE, { visual: true, style: true, structural: true, gates: true });
  assert.equal(w.buildFailCeiling, 20);
  assert.ok(Math.abs(w.visual + w.style + w.structural + w.gates - 1) < 1e-9);
  assert.ok(Math.abs(w.visual - 0.35) < 1e-9);
});

test('visual+style unavailable → weight 0, structural/gates renormalised', () => {
  const w = effectiveWeights(BASE, { visual: false, style: false, structural: true, gates: true });
  assert.equal(w.visual, 0);
  assert.equal(w.style, 0);
  assert.ok(Math.abs(w.structural - 0.20 / 0.35) < 1e-9);
  assert.ok(Math.abs(w.gates - 0.15 / 0.35) < 1e-9);
  assert.ok(Math.abs(w.structural + w.gates - 1) < 1e-9);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test oracle/effective-weights.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// oracle/effective-weights.mjs
// Renormalise the fidelity weights over the sub-scores that are actually
// available, so an unavailable sub-score contributes nothing (weight 0) and
// the remaining weights still sum to 1. buildFailCeiling passes through.
const KEYS = ['visual', 'style', 'structural', 'gates'];

export function effectiveWeights(base, available) {
  const sum = KEYS.reduce((s, k) => s + (available[k] ? base[k] : 0), 0) || 1;
  const out = { buildFailCeiling: base.buildFailCeiling };
  for (const k of KEYS) out[k] = available[k] ? base[k] / sum : 0;
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test oracle/effective-weights.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add oracle/effective-weights.mjs oracle/effective-weights.test.mjs
git commit -m "feat(workbench): renormalise fidelity weights over available sub-scores"
```

---

### Task 3: `score-gates.mjs` — accept a gates subset

**Files:**
- Modify: `oracle/score-gates.mjs`
- Modify: `oracle/score-gates.test.mjs`

- [ ] **Step 1: Add the failing test**

Append to `oracle/score-gates.test.mjs`:

```js
test('scoreGates honours a gates subset (a11y omitted)', async () => {
  const runGate = async (g) => ({ ok: g !== 'tests' });   // tests fails
  const res = await scoreGates({ runGate, gates: ['typecheck', 'build', 'tests'] });
  assert.deepEqual(Object.keys(res).sort(), ['build', 'tests', 'typecheck']);
  assert.equal(res.a11y, undefined);
  assert.equal(res.tests, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test oracle/score-gates.test.mjs`
Expected: FAIL — `res.a11y` present (current code always iterates all 4) / subset ignored.

- [ ] **Step 3: Modify the implementation**

Replace the body of `scoreGates` in `oracle/score-gates.mjs`:

```js
export async function scoreGates({ runGate, gates = GATES }) {
  const result = {};
  for (const g of gates) {
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test oracle/score-gates.test.mjs`
Expected: PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
git add oracle/score-gates.mjs oracle/score-gates.test.mjs
git commit -m "feat(workbench): score-gates accepts a gates subset"
```

---

### Task 4: `score.mjs` — gate term over evaluated gates only

**Files:**
- Modify: `oracle/score.mjs`
- Modify: `oracle/score.test.mjs`

- [ ] **Step 1: Add the failing test**

Append to `oracle/score.test.mjs`:

```js
test('gate term uses only evaluated gates (a11y omitted → denom 3)', () => {
  const weights = { visual: 0.35, style: 0.30, structural: 0.20, gates: 0.15, buildFailCeiling: 20 };
  const acc = composeAccuracy({
    visual: { diffPct: 0, score: 100 },
    style: { matchRate: 100, properties: {} },
    structural: { score: 100 },
    gates: { typecheck: true, build: true, tests: true },   // a11y absent
  }, weights);
  // all 3 evaluated gates pass → gate term 100 → full composite 100
  assert.equal(acc.composite, 100);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test oracle/score.test.mjs`
Expected: FAIL — current code divides by `GATES.length` (4), so gate term = 75 and composite < 100.

- [ ] **Step 3: Modify the implementation**

In `oracle/score.mjs`, replace the two gate lines inside `composeAccuracy`:

```js
  const evaluated = GATES.filter((g) => gates[g] !== undefined);
  const denom = evaluated.length || 1;
  const gatesPassed = evaluated.filter((g) => gates[g]).length;
  const gateScore = (gatesPassed / denom) * 100;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test oracle/score.test.mjs`
Expected: PASS — new test passes AND existing all-4-gates tests still pass (4 keys present → denom 4, identical math).

- [ ] **Step 5: Commit**

```bash
git add oracle/score.mjs oracle/score.test.mjs
git commit -m "feat(workbench): composeAccuracy gate term over evaluated gates only"
```

---

### Task 5: `assemble-accuracy.mjs` — sub-scores + availability → accuracy

**Files:**
- Create: `oracle/assemble-accuracy.mjs`
- Test: `oracle/assemble-accuracy.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// oracle/assemble-accuracy.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleAccuracy } from './assemble-accuracy.mjs';

const BASE = { visual: 0.35, style: 0.30, structural: 0.20, gates: 0.15, buildFailCeiling: 20 };

test('structural+gates only → composite from renormalised weights, availability flagged', () => {
  const acc = assembleAccuracy({
    visual: null, style: null,
    structural: { score: 80 },
    gates: { typecheck: true, build: true, tests: true },
  }, BASE);
  // structural 80 @ 0.20/0.35 + gates 100 @ 0.15/0.35 = 45.71 + 42.86 = 88.57 -> 89
  assert.equal(acc.composite, 89);
  assert.deepEqual(acc.availability, { visual: false, style: false, structural: true, gates: true });
  assert.equal(acc.weights.visual, 0);
  // unavailable sub-scores are nulled so the report renders `—`, not a misleading 0
  assert.equal(acc.visual, null);
  assert.equal(acc.style, null);
});

test('all sub-scores available → standard weighting', () => {
  const acc = assembleAccuracy({
    visual: { diffPct: 0, score: 60 },
    style: { matchRate: 50, properties: {} },
    structural: { score: 70 },
    gates: { typecheck: true, build: true, tests: true, a11y: true },
  }, BASE);
  // 0.35*60 + 0.30*50 + 0.20*70 + 0.15*100 = 21+15+14+15 = 65
  assert.equal(acc.composite, 65);
  assert.equal(acc.availability.visual, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test oracle/assemble-accuracy.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// oracle/assemble-accuracy.mjs
// Pure assembler: takes the four sub-scores (visual/style may be null when
// unavailable) + base fidelity weights, renormalises the weights over what is
// available, runs the existing composeAccuracy, and annotates availability.
import { composeAccuracy } from './score.mjs';
import { effectiveWeights } from './effective-weights.mjs';

export function assembleAccuracy({ visual, style, structural, gates }, baseWeights) {
  const availability = {
    visual: visual != null,
    style: style != null,
    structural: structural != null,
    gates: gates != null,
  };
  const weights = effectiveWeights(baseWeights, availability);
  const acc = composeAccuracy({
    visual: visual ?? { diffPct: 100, score: 0 },        // weight 0 → contributes nothing
    style: style ?? { matchRate: 0, properties: {} },    // weight 0 → contributes nothing
    structural: structural ?? { score: 0 },
    gates: gates ?? {},
  }, weights);
  // Null out unavailable sub-scores so the report renders `—`, not a misleading 0.
  if (!availability.visual) acc.visual = null;
  if (!availability.style) acc.style = null;
  acc.availability = availability;
  return acc;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test oracle/assemble-accuracy.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add oracle/assemble-accuracy.mjs oracle/assemble-accuracy.test.mjs
git commit -m "feat(workbench): assemble accuracy from sub-scores with availability"
```

---

### Task 6: `rung-map.mjs` — rung → source paths + story ids

**Files:**
- Create: `oracle/rung-map.mjs`
- Test: `oracle/rung-map.test.mjs`

Paths are relative to the trial root. Story ids follow Storybook's `kebab(title)--kebab(name)`. Target story titles come from `target/src/components/**/*.stories.tsx` (`title:` field); oracle titles are `Components/<Name>` per HeroUI `CLAUDE.md`. The "Default"/"Primary" canonical story is chosen per side.

- [ ] **Step 1: Write the failing test**

```js
// oracle/rung-map.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUNG_MAP, scoredRungs } from './rung-map.mjs';

test('every scored rung has source paths and component name', () => {
  for (const r of scoredRungs()) {
    assert.ok(r.targetTsx && r.targetTsx.endsWith('.tsx'), `${r.rung} targetTsx`);
    assert.ok(r.oracleTsx && r.oracleTsx.endsWith('.tsx'), `${r.rung} oracleTsx`);
    assert.ok(r.component, `${r.rung} component`);
    assert.equal(typeof r.hasOracleStory, 'boolean');
  }
});

test('Form has source but no oracle story; Button has both', () => {
  assert.equal(RUNG_MAP.template.hasOracleStory, false);
  assert.equal(RUNG_MAP.atom.hasOracleStory, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test oracle/rung-map.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// oracle/rung-map.mjs
// Maps each fidelity-scored rung to its target/oracle source files and the
// canonical Storybook story id on each side. Paths are relative to the trial
// root (workbench/trials/heroui-20260603). icon-only and page are out of scope.
export const RUNG_MAP = {
  atom: {
    rung: 'atom', component: 'Button',
    targetTsx: 'target/src/components/atoms/Button/Button.tsx',
    oracleTsx: 'ref-heroui/packages/react/src/components/button/button.tsx',
    hasOracleStory: true,
    targetStoryId: 'atoms-button--default',
    oracleStoryId: 'components-button--default',
  },
  molecule: {
    rung: 'molecule', component: 'Input',
    targetTsx: 'target/src/components/atoms/Input/Input.tsx',
    oracleTsx: 'ref-heroui/packages/react/src/components/input/input.tsx',
    hasOracleStory: true,
    targetStoryId: 'atoms-input--default',
    oracleStoryId: 'components-input--default',
  },
  organism: {
    rung: 'organism', component: 'Card',
    targetTsx: 'target/src/components/molecules/Card/Card.tsx',
    oracleTsx: 'ref-heroui/packages/react/src/components/card/card.tsx',
    hasOracleStory: true,
    targetStoryId: 'molecules-card--default',
    oracleStoryId: 'components-card--default',
  },
  template: {
    rung: 'template', component: 'Form',
    targetTsx: 'target/src/components/organisms/Form/Form.tsx',
    oracleTsx: 'ref-heroui/packages/react/src/components/form/form.tsx',
    hasOracleStory: false,   // HeroUI Form has source but no story
    targetStoryId: 'organisms-form--default',
    oracleStoryId: null,
  },
  'all-icons': {
    rung: 'all-icons', component: 'Alert',
    targetTsx: 'target/src/components/molecules/Alert/Alert.tsx',
    oracleTsx: 'ref-heroui/packages/react/src/components/alert/alert.tsx',
    hasOracleStory: true,
    targetStoryId: 'molecules-alert--default',
    oracleStoryId: 'components-alert--default',
  },
};

// runId in results.json differs from rung for molecule (molecule-cold).
export const RUNG_TO_RUNID = {
  atom: 'atom', molecule: 'molecule-cold', organism: 'organism',
  template: 'template', 'all-icons': 'all-icons',
};

export const scoredRungs = () => Object.values(RUNG_MAP);
```

- [ ] **Step 4: Verify story ids against the built Storybook (manual check, recorded)**

Run (after Task 9 builds the target Storybook): `cat target/storybook-static/index.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(Object.keys(JSON.parse(s).entries).join('\n')))"`
Expected: the printed story ids include each `targetStoryId`. If a story id differs (e.g. `atoms-button--primary`), update `rung-map.mjs` and re-run its test. **This is the one place reality may diverge from the plan — reconcile here, don't guess.**

- [ ] **Step 5: Run test + commit**

Run: `node --test oracle/rung-map.test.mjs`
Expected: PASS (2 tests).

```bash
git add oracle/rung-map.mjs oracle/rung-map.test.mjs
git commit -m "feat(workbench): rung -> source/story map for fidelity scoring"
```

---

### Task 7: `run-accuracy.mjs` — P1 driver (structural + gates), write results.json

**Files:**
- Create: `oracle/run-accuracy.mjs`

This driver computes accuracy from structural + gates only (no render) and writes it into each rung's `results.json`. The render path is added in Phase 2 behind a `--render` flag (Task 10). It must be re-runnable.

- [ ] **Step 1: Write the implementation**

```js
// oracle/run-accuracy.mjs
// IO driver: per scored rung, compute the accuracy sub-scores available and
// write results into trials/.../<runId>/results.json runs[0].accuracy.
// P1: structural (source parse) + gates (from results.json). P2 (--render)
// adds visual+style from the Storybook harness.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractStructural } from './extract-structural.mjs';
import { scoreStructural } from './score-structural.mjs';
import { scoreGates } from './score-gates.mjs';
import { assembleAccuracy } from './assemble-accuracy.mjs';
import { scoreVisual } from './score-visual.mjs';
import { scoreStyle } from './score-style.mjs';
import { decodePng } from './png.mjs';
import { RUNG_MAP, RUNG_TO_RUNID, scoredRungs } from './rung-map.mjs';

const TRIAL = process.env.TRIAL || 'trials/heroui-20260603';
const WEIGHTS = JSON.parse(readFileSync(new URL('./weights.json', import.meta.url), 'utf8'));

const readResults = (runId) => {
  const p = join(TRIAL, runId, 'results.json');
  return { p, json: JSON.parse(readFileSync(p, 'utf8')) };
};

// runGate sourced from the gates already captured in results.json.
function runGateFor(gates) {
  return async (g) => ({
    typecheck: { ok: gates?.tsc === true },
    build: { ok: gates?.build === true },
    tests: { ok: !!(gates?.tests && gates.tests.passed === gates.tests.total) },
  }[g] ?? { ok: false });
}

export async function runAccuracy({ render = false, shots = null } = {}) {
  for (const r of scoredRungs()) {
    const runId = RUNG_TO_RUNID[r.rung];
    const { p, json } = readResults(runId);
    const run = json.runs[0];

    const gStruct = extractStructural(readFileSync(join(TRIAL, r.targetTsx), 'utf8'));
    const oStruct = extractStructural(readFileSync(join(TRIAL, r.oracleTsx), 'utf8'));
    const structural = scoreStructural(gStruct, oStruct);

    const gates = await scoreGates({ runGate: runGateFor(run.gates), gates: ['typecheck', 'build', 'tests'] });

    let visual = null, style = null;
    if (render && shots && r.hasOracleStory) {
      try {
        const t = await shots.targetShot(r);
        const o = await shots.oracleShot(r);
        visual = scoreVisual(decodePng(t.pngBuffer), decodePng(o.pngBuffer));
        style = scoreStyle(t.style, o.style);
      } catch (e) {
        console.error(`[accuracy] ${r.rung} render failed, marking visual/style unavailable: ${e.message}`);
      }
    }

    run.accuracy = assembleAccuracy({ visual, style, structural, gates }, WEIGHTS);
    writeFileSync(p, JSON.stringify(json, null, 2));
    console.error(`[accuracy] ${r.rung}: composite ${run.accuracy.composite} (visual ${visual ? visual.score : '—'}, style ${style ? style.matchRate : '—'}, structural ${structural.score})`);
  }
}

// CLI: node run-accuracy.mjs [--render]
if (import.meta.url === `file://${process.argv[1]}`) {
  const render = process.argv.includes('--render');
  let shots = null;
  if (render) {
    const { openShots } = await import('./render-harness.mjs');
    shots = await openShots();
  }
  await runAccuracy({ render, shots });
  if (shots) await shots.close();
}
```

- [ ] **Step 2: Run the P1 driver (writes structural+gates accuracy for 5 rungs)**

Run: `FP_ALLOW_RESTRICTED_WRITE=1 TRIAL=trials/heroui-20260603 node oracle/run-accuracy.mjs`
Expected: 5 lines like `[accuracy] atom: composite NN (visual —, style —, structural NN)`; every composite is a real integer, none null.

- [ ] **Step 3: Verify results.json got a real accuracy**

Run: `node -e "const r=require('./trials/heroui-20260603/atom/results.json'); console.log(JSON.stringify(r.runs[0].accuracy.availability), r.runs[0].accuracy.composite)"`
Expected: `{"visual":false,"style":false,"structural":true,"gates":true} <int>`

- [ ] **Step 4: Commit**

```bash
git add oracle/run-accuracy.mjs
git commit -m "feat(workbench): run-accuracy driver (P1 structural+gates)"
```

---

### Task 8: Re-aggregate + rebuild report with populated accuracy

**Files:**
- Run-only (no new files). Uses existing `analyze/aggregate-trialset.mjs` + `report/build-report.mjs`.

- [ ] **Step 1: Re-aggregate the trialset from the updated results.json**

Run:
```bash
T=trials/heroui-20260603
FP_ALLOW_RESTRICTED_WRITE=1 node analyze/aggregate-trialset.mjs reports/heroui-20260603/trialset.json \
  $T/icon-only/results.json $T/atom/results.json $T/molecule-cold/results.json $T/organism/results.json \
  $T/template/results.json $T/page/results.json $T/all-icons/results.json \
  --comparisons $T/comparisons.json
```
Expected: `[trialset] wrote reports/heroui-20260603/trialset.json (7 rungs)`.

- [ ] **Step 2: Verify accuracyByRung is now populated**

Run: `node -e "const t=require('./reports/heroui-20260603/trialset.json'); console.log(JSON.stringify(t.accuracyByRung))"`
Expected: composites are integers for atom/molecule/organism/template/all-icons (null only for icon-only/page).

- [ ] **Step 3: Rebuild report.md + dashboard.html**

Run: `FP_ALLOW_RESTRICTED_WRITE=1 node report/build-report.mjs reports/heroui-20260603/trialset.json 2026-06-05T00:00:00Z`
Expected: `[report] wrote ...report.md and ...dashboard.html`.

- [ ] **Step 4: Confirm the accuracy table shows real numbers**

Run: `grep -E '^\| (atom|template|all-icons) \|' reports/heroui-20260603/report.md | head`
Expected: the Accuracy-by-rung rows show a numeric composite and `—` for visual/style (P1), with a real build-gate mark.

- [ ] **Step 5: Run the full report + analyze suites (regression)**

Run: `node --test 'report/*.test.mjs' 'analyze/*.test.mjs' 'oracle/*.test.mjs'`
Expected: all PASS.

- [ ] **Step 6: Commit the regenerated artifacts**

```bash
git add reports/heroui-20260603/trialset.json reports/heroui-20260603/report.md reports/heroui-20260603/dashboard.html trials/heroui-20260603/*/results.json
git commit -m "feat(workbench): populate accuracy (P1 structural+gates) in trial report"
```

**End of Phase 1 — accuracy is real (structural + gates) for 5 rungs; visual/style still `—`.**

---

## PHASE 1.5 — Dual structural + de-noise (revision A)

Splits structural into `structuralSource` (de-noised P1 parse, 5 rungs) + `structuralDom` (rendered DOM, added in P2). Composite uses `structural = structuralDom ?? structuralSource`.

### Task 1.5a: De-noise `extract-structural.mjs`

**Files:**
- Modify: `oracle/extract-structural.mjs`
- Modify: `oracle/extract-structural.test.mjs`

- [ ] **Step 1: Add the failing test**

Append to `oracle/extract-structural.test.mjs`:

```js
test('de-noise: dom.X -> X, single-letter tags dropped, destructured props captured', () => {
  const NOISE = `
export const Thing = forwardRef<E, ThingProps>(({ alpha, beta, ...rest }, ref) => (
  <dom.div role="alert"><E/><span/></dom.div>
));`;
  const { tree, props } = extractStructural(NOISE);
  assert.deepEqual(tree.children.map((c) => c.tag), ['div', 'span']);  // dom.div->div, <E/> dropped
  assert.equal(tree.children[0].role, 'alert');
  assert.ok(props.includes('alpha') && props.includes('beta'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test oracle/extract-structural.test.mjs`
Expected: FAIL — tags include `dom.div`/`E`, props miss `alpha`/`beta`.

- [ ] **Step 3: Modify the implementation**

In `oracle/extract-structural.mjs`, add after the `ROLE_RE` constant:

```js
const normTag = (t) => (t.startsWith('dom.') ? t.slice(4) : t);

function extractDestructuredProps(source) {
  // First object-destructured function/arrow param: ({ a, b, ...rest })
  const m = source.match(/\(\s*\{([^{}]*)\}\s*(?::[^)]*)?[,)]/);
  if (!m) return [];
  return m[1].split(',')
    .map((s) => s.trim().split(':')[0].trim().replace(/^\.\.\./, ''))
    .filter((n) => /^[A-Za-z_]\w*$/.test(n) && n !== 'ref');
}
```

Replace the `while` loop body and the `return` in `extractStructural`:

```js
  while ((m = TAG_RE.exec(code))) {
    const tag = normTag(m[1]);
    if (/^[A-Z]$/.test(tag)) continue;            // drop single-letter noise (generic <E,...>)
    const node = { tag };
    const role = (m[2] || '').match(ROLE_RE);
    if (role) node.role = role[1];
    children.push(node);
  }
  const props = [...new Set([...extractProps(source), ...extractDestructuredProps(source)])];
  return { tree: { tag: 'root', children }, props };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test oracle/extract-structural.test.mjs`
Expected: PASS (existing + new). The Task-1 fixture still yields `['div','button','span']` (no `dom.`/single-letter there).

- [ ] **Step 5: Commit**

```bash
git add oracle/extract-structural.mjs oracle/extract-structural.test.mjs
git commit -m "feat(workbench): de-noise structural extractor (dom.X, single-letter, destructured props)"
```

### Task 1.5b: `assemble-accuracy.mjs` — dual structural

**Files:**
- Modify: `oracle/assemble-accuracy.mjs`
- Modify: `oracle/assemble-accuracy.test.mjs`

- [ ] **Step 1: Replace the tests**

Replace the two existing tests in `oracle/assemble-accuracy.test.mjs` with:

```js
test('source-only structural (dom null) → source is primary; both stored', () => {
  const acc = assembleAccuracy({
    visual: null, style: null,
    structuralSource: { score: 80 }, structuralDom: null,
    gates: { typecheck: true, build: true, tests: true },
  }, BASE);
  assert.equal(acc.composite, 89);                 // structural(80)@0.571 + gates(100)@0.429
  assert.equal(acc.structural.score, 80);          // primary = source (dom null)
  assert.equal(acc.structuralSource.score, 80);
  assert.equal(acc.structuralDom, null);
  assert.deepEqual(acc.availability, { visual: false, style: false, structural: true, gates: true });
  assert.equal(acc.visual, null);
  assert.equal(acc.style, null);
});

test('structuralDom present → dom is primary in the composite', () => {
  const acc = assembleAccuracy({
    visual: { diffPct: 0, score: 60 }, style: { matchRate: 50, properties: {} },
    structuralSource: { score: 10 }, structuralDom: { score: 70 },
    gates: { typecheck: true, build: true, tests: true, a11y: true },
  }, BASE);
  // 0.35*60 + 0.30*50 + 0.20*70(dom) + 0.15*100 = 21+15+14+15 = 65
  assert.equal(acc.composite, 65);
  assert.equal(acc.structural.score, 70);
  assert.equal(acc.structuralSource.score, 10);
  assert.equal(acc.structuralDom.score, 70);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test oracle/assemble-accuracy.test.mjs`
Expected: FAIL — current signature takes `structural`, not `structuralSource`/`structuralDom`.

- [ ] **Step 3: Replace the implementation**

Replace the body of `oracle/assemble-accuracy.mjs` `assembleAccuracy`:

```js
export function assembleAccuracy({ visual, style, structuralSource, structuralDom, gates }, baseWeights) {
  const structural = structuralDom ?? structuralSource;   // rendered DOM preferred, source fallback
  const availability = {
    visual: visual != null,
    style: style != null,
    structural: structural != null,
    gates: gates != null,
  };
  const weights = effectiveWeights(baseWeights, availability);
  const acc = composeAccuracy({
    visual: visual ?? { diffPct: 100, score: 0 },
    style: style ?? { matchRate: 0, properties: {} },
    structural: structural ?? { score: 0 },
    gates: gates ?? {},
  }, weights);
  if (!availability.visual) acc.visual = null;
  if (!availability.style) acc.style = null;
  acc.structuralSource = structuralSource ?? null;
  acc.structuralDom = structuralDom ?? null;
  acc.availability = availability;
  return acc;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test oracle/assemble-accuracy.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add oracle/assemble-accuracy.mjs oracle/assemble-accuracy.test.mjs
git commit -m "feat(workbench): assemble accuracy with dual structural (source + dom)"
```

### Task 1.5c: Update `run-accuracy.mjs` driver for dual structural

**Files:**
- Modify: `oracle/run-accuracy.mjs`

- [ ] **Step 1: Apply the changes**

In `oracle/run-accuracy.mjs`, replace the structural line and the assemble call. Find:

```js
    const structural = scoreStructural(gStruct, oStruct);
```
Replace with:
```js
    const structuralSource = scoreStructural(gStruct, oStruct);
    let structuralDom = null;
```

In the render block, after `style = scoreStyle(t.style, o.style);` add:
```js
        structuralDom = scoreStructural({ tree: t.dom, props: gStruct.props }, { tree: o.dom, props: oStruct.props });
```

Replace the assemble + log lines:
```js
    run.accuracy = assembleAccuracy({ visual, style, structuralSource, structuralDom, gates }, WEIGHTS);
    writeFileSync(p, JSON.stringify(json, null, 2));
    console.error(`[accuracy] ${r.rung}: composite ${run.accuracy.composite} (visual ${visual ? visual.score : '—'}, style ${style ? style.matchRate : '—'}, struct·src ${structuralSource.score}, struct·dom ${structuralDom ? structuralDom.score : '—'})`);
```

- [ ] **Step 2: Re-run the P1 driver (structuralDom stays null without --render)**

Run: `FP_ALLOW_RESTRICTED_WRITE=1 TRIAL=trials/heroui-20260603 node oracle/run-accuracy.mjs`
Expected: 5 lines with `struct·src NN, struct·dom —`; composites are real integers. (De-noise may shift the source scores slightly vs the first P1 run — that's expected.)

- [ ] **Step 3: Commit**

```bash
git add oracle/run-accuracy.mjs
git commit -m "feat(workbench): driver emits structuralSource + structuralDom"
```

### Task 1.5d: Split the structural column in the report

**Files:**
- Modify: `report/markdown.mjs`
- Modify: `report/markdown-trialset.test.mjs`

- [ ] **Step 1: Add the failing test**

Append to `report/markdown-trialset.test.mjs`:

```js
test('accuracy table splits structural into source and dom columns', () => {
  const tsS = { ...ts, rungs: [{ ...ts.rungs[0], accuracy: {
    composite: 70, cappedAt: null, visual: { score: 60 }, style: { matchRate: 50 },
    structuralSource: { score: 12 }, structuralDom: { score: 68 },
    gates: { typecheck: true, build: true, tests: true },
    availability: { visual: true, style: true, structural: true, gates: true } } }] };
  const md = renderTrialsetMarkdown(tsS);
  assert.match(md, /struct·src/);
  assert.match(md, /struct·dom/);
  assert.match(md, /\| *12 *\|/);
  assert.match(md, /\| *68 *\|/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test report/markdown-trialset.test.mjs`
Expected: FAIL — no `struct·src`/`struct·dom` headers yet.

- [ ] **Step 3: Modify `renderTrialsetMarkdown`**

In `report/markdown.mjs`, the accuracy table. Replace the header + separator lines:

```js
  L.push('| rung | tier | composite | visual | style | struct·src | struct·dom | build gate |');
  L.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | :--: |');
```

And in the row push, replace the single `${cell(a.structural?.score)}` cell with two:

```js
    L.push(`| ${r.rung} | ${r.tier} | ${cell(a.composite)}${capped} | ${cell(a.visual?.score)} | ${cell(a.style?.matchRate)} | ${cell(a.structuralSource?.score)} | ${cell(a.structuralDom?.score)} | ${gateCell} |`);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test report/markdown-trialset.test.mjs`
Expected: PASS (new + existing — the existing accuracy test only asserts the composite `95` cell and `capped`, still present).

- [ ] **Step 5: Commit**

```bash
git add report/markdown.mjs report/markdown-trialset.test.mjs
git commit -m "feat(workbench): split structural into src/dom columns in accuracy table"
```

### Task 1.5e: Re-aggregate, rebuild, verify

- [ ] **Step 1: Re-aggregate + rebuild** (same commands as Task 8 Steps 1 & 3).

- [ ] **Step 2: Confirm the split columns render**

Run: `grep -E 'struct·src' reports/heroui-20260603/report.md`
Expected: the accuracy table header shows both `struct·src` and `struct·dom`; rows show source numbers and `—` for dom (no render yet).

- [ ] **Step 3: Full suite green**

Run: `node --test 'oracle/*.test.mjs' 'report/*.test.mjs' 'analyze/*.test.mjs'`
Expected: all PASS.

- [ ] **Step 4: Commit regenerated artifacts**

```bash
git add reports/heroui-20260603/trialset.json reports/heroui-20260603/report.md
git commit -m "feat(workbench): regenerate report with dual-structural accuracy"
```

**End of Phase 1.5 — `structuralSource` real & de-noised for 5 rungs; `structuralDom` wired, awaiting P2 render.**

---

## PHASE 2 — Render harness (visual + style vs HeroUI)

> **P2 amendment (revision A):** the render harness `shoot()` must ALSO return a `dom` tree (used for `structuralDom`). Task 10's implementation below already includes the `dom` extraction. The driver's render block (Task 1.5c Step 1) already computes `structuralDom` from `t.dom`/`o.dom`.

> **Risk gate:** the target Storybook (Task 9) is low-risk (deps installed). The HeroUI Storybook (Task 9b) is the real risk. If 9b cannot build/serve after the steps below, STOP Phase 2, leave visual/style as `—`, and proceed to Phase 3 — the report is already consistent from Phase 1.

### Task 9: Build the target Storybook and confirm story ids

**Files:**
- Run-only.

- [ ] **Step 1: Build the target Storybook static**

Run: `cd trials/heroui-20260603/target && npx storybook build -o storybook-static --quiet; cd -`
Expected: `storybook-static/` created, exit 0. (`storybook-static/` is gitignored under target — confirm with `git status`.)

- [ ] **Step 2: List the real story ids and reconcile `rung-map.mjs`**

Run: `node -e "const s=require('./trials/heroui-20260603/target/storybook-static/index.json'); console.log(Object.keys(s.entries).join('\n'))"`
Expected: includes `atoms-button--default`, `atoms-input--default`, `molecules-card--default`, `molecules-alert--default`, `organisms-form--default`. If any differ, edit `oracle/rung-map.mjs` `targetStoryId` to match and re-run `node --test oracle/rung-map.test.mjs`.

- [ ] **Step 3: Commit any rung-map reconciliation**

```bash
git add oracle/rung-map.mjs
git commit -m "fix(workbench): reconcile target story ids with built Storybook"
```
(Skip the commit if no change was needed.)

---

### Task 9b: Build the HeroUI Storybook (risk gate)

**Files:**
- Run-only.

- [ ] **Step 1: Build HeroUI packages then its Storybook**

Run:
```bash
cd trials/heroui-20260603/ref-heroui
pnpm build --filter=@heroui/react || true
pnpm build --filter=@heroui/storybook --output-logs=new-only
cd -
```
Expected: a `storybook-static` (location printed by the build; commonly `packages/storybook/storybook-static`). If the build errors on missing `@heroui/styles`, run `pnpm build --filter=@heroui/styles` first, then retry the storybook build.

- [ ] **Step 2: Confirm oracle story ids**

Run: `node -e "const s=require('./trials/heroui-20260603/ref-heroui/packages/storybook/storybook-static/index.json'); console.log(Object.keys(s.entries).filter(k=>/button|input|card|alert/.test(k)).join('\n'))"`
Expected: includes `components-button--*`, `components-alert--*`, etc. Reconcile `oracle/rung-map.mjs` `oracleStoryId` to the real `--default`/first story id; re-run `node --test oracle/rung-map.test.mjs`.

- [ ] **Step 3: Decision checkpoint**

If Steps 1–2 fail after reasonable effort, set `hasOracleStory: false` for all rungs in `oracle/rung-map.mjs` (documented as "HeroUI Storybook unavailable in this env"), commit that, and SKIP to Phase 3. Otherwise continue.

```bash
git add oracle/rung-map.mjs
git commit -m "fix(workbench): reconcile/disable oracle story ids per HeroUI Storybook build"
```

---

### Task 10: `render-harness.mjs` — serve both Storybooks, Playwright capture

**Files:**
- Create: `oracle/render-harness.mjs`

- [ ] **Step 1: Write the implementation**

```js
// oracle/render-harness.mjs
// IO: serve the pre-built Storybook static dirs over local http and screenshot
// each story's component root at a FIXED clip (scoreVisual requires equal dims).
// Exposes openShots() -> { targetShot(r), oracleShot(r), close() }.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';            // resolved from project-root node_modules
import { STYLE_PROPS } from './score-style.mjs';

const TRIAL = process.env.TRIAL || 'trials/heroui-20260603';
export const CLIP = { x: 0, y: 0, width: 360, height: 240 };
const TARGET_SB = join(TRIAL, 'target/storybook-static');
const ORACLE_SB = join(TRIAL, 'ref-heroui/packages/storybook/storybook-static');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.map': 'application/json' };

function serve(root, port) {
  const server = createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/') p = '/index.html';
    let f = join(root, p);
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
    if (!existsSync(f)) { res.statusCode = 404; res.end('not found'); return; }
    res.setHeader('content-type', MIME[extname(f)] || 'application/octet-stream');
    res.end(readFileSync(f));
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ url: `http://localhost:${port}`, server })));
}

async function shoot(page, baseUrl, storyId) {
  await page.goto(`${baseUrl}/iframe.html?id=${storyId}&viewMode=story`, { waitUntil: 'networkidle' });
  const root = page.locator('#storybook-root > *, #root > *').first();
  await root.waitFor({ state: 'visible', timeout: 15000 });
  const pngBuffer = await page.screenshot({ clip: CLIP });
  const style = await root.evaluate((el, props) => {
    const cs = getComputedStyle(el); const out = {};
    for (const p of props) out[p] = cs.getPropertyValue(p);
    return out;
  }, STYLE_PROPS);
  // Rendered DOM tree for structuralDom (real HTML elements on both sides).
  const dom = await root.evaluate((el) => {
    const walk = (n) => ({
      tag: (n.tagName || 'node').toLowerCase(),
      role: n.getAttribute && n.getAttribute('role') ? n.getAttribute('role') : undefined,
      children: [...(n.children || [])].map(walk),
    });
    return walk(el);
  });
  return { pngBuffer, style, dom };
}

export async function openShots() {
  const target = await serve(TARGET_SB, 6111);
  const oracle = existsSync(ORACLE_SB) ? await serve(ORACLE_SB, 6112) : null;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  return {
    targetShot: (r) => shoot(page, target.url, r.targetStoryId),
    oracleShot: (r) => {
      if (!oracle || !r.oracleStoryId) throw new Error('oracle storybook/story unavailable');
      return shoot(page, oracle.url, r.oracleStoryId);
    },
    close: async () => { await browser.close(); target.server.close(); oracle?.server.close(); },
  };
}
```

- [ ] **Step 2: Smoke-test a single target shot**

Run:
```bash
TRIAL=trials/heroui-20260603 node -e "
import('./oracle/render-harness.mjs').then(async (m) => {
  const s = await m.openShots();
  const { RUNG_MAP } = await import('./oracle/rung-map.mjs');
  const shot = await s.targetShot(RUNG_MAP.atom);
  console.log('png bytes', shot.pngBuffer.length, 'style keys', Object.keys(shot.style).length);
  await s.close();
});"
```
Expected: `png bytes <large> style keys 12` (the 12 `STYLE_PROPS`). A non-empty PNG and populated style map prove the harness works.

- [ ] **Step 3: Commit**

```bash
git add oracle/render-harness.mjs
git commit -m "feat(workbench): dual-Storybook Playwright render harness"
```

---

### Task 11: Run the full accuracy pass with rendering and regenerate

**Files:**
- Run-only.

- [ ] **Step 1: Run with `--render`**

Run: `FP_ALLOW_RESTRICTED_WRITE=1 TRIAL=trials/heroui-20260603 node oracle/run-accuracy.mjs --render`
Expected: 5 lines; for the 4 rungs with an oracle story, `visual NN, style NN` are now numbers (not `—`); template stays `—` for visual/style. No crash; any per-rung render failure logs and degrades to `—` (not fatal).

- [ ] **Step 2: Re-aggregate + rebuild (same commands as Task 8 Steps 1 & 3)**

Run the Task 8 Step 1 aggregate command, then the Task 8 Step 3 build-report command.
Expected: both succeed.

- [ ] **Step 3: Verify visual/style populated in the report**

Run: `grep -E '^\| (atom|all-icons) \|' reports/heroui-20260603/report.md | head`
Expected: visual + style columns show integers for atom and all-icons.

- [ ] **Step 4: Run full suites**

Run: `node --test 'report/*.test.mjs' 'analyze/*.test.mjs' 'oracle/*.test.mjs'`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add reports/heroui-20260603/trialset.json reports/heroui-20260603/report.md reports/heroui-20260603/dashboard.html trials/heroui-20260603/*/results.json
git commit -m "feat(workbench): populate visual+style accuracy vs HeroUI (P2)"
```

**End of Phase 2 — visual+style real for rungs with a HeroUI story.**

---

## PHASE 3 — Availability note + a11y (polish)

### Task 12: Surface the availability/renormalisation note in the report

**Files:**
- Modify: `report/markdown.mjs`
- Modify: `report/markdown-trialset.test.mjs`

- [ ] **Step 1: Add the failing test**

Append to `report/markdown-trialset.test.mjs` (reuses the existing `ts` fixture; add accuracy with availability to one rung):

```js
test('accuracy section notes renormalised weights when sub-scores are unavailable', () => {
  const tsAvail = {
    ...ts,
    rungs: [
      { ...ts.rungs[0], accuracy: { composite: 89, cappedAt: null,
        visual: { score: 0 }, style: { matchRate: 0 }, structural: { score: 80 },
        gates: { typecheck: true, build: true, tests: true },
        availability: { visual: false, style: false, structural: true, gates: true } } },
    ],
  };
  const md = renderTrialsetMarkdown(tsAvail);
  assert.match(md, /renormal/i);   // explains weights renormalised over available sub-scores
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test report/markdown-trialset.test.mjs`
Expected: FAIL — no "renormal…" text yet.

- [ ] **Step 3: Modify `renderTrialsetMarkdown`**

In `report/markdown.mjs`, find the existing Accuracy note line (the one beginning `> Composite/visual/style/structural require live rendering`) and append a sentence. Replace that line with:

```js
    L.push('> Composite/visual/style/structural require live rendering (pixel-diff + computed-style); cells read `—` when a sub-score was not computed (no HeroUI story for that rung, or the Storybook render was unavailable). When a sub-score is unavailable its weight is **renormalised** away across the remaining sub-scores, so the composite reflects only what was measured (see `availability` in `results.json`). The **build gate** column is real. "(capped)" marks a build-fail-capped composite.');
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test report/markdown-trialset.test.mjs`
Expected: PASS (new + existing).

- [ ] **Step 5: Rebuild the report and commit**

Run: `FP_ALLOW_RESTRICTED_WRITE=1 node report/build-report.mjs reports/heroui-20260603/trialset.json 2026-06-05T00:00:00Z`

```bash
git add report/markdown.mjs report/markdown-trialset.test.mjs reports/heroui-20260603/report.md reports/heroui-20260603/dashboard.html
git commit -m "feat(workbench): report explains renormalised accuracy weights"
```

---

### Task 13: a11y gate (optional, if axe resolvable)

**Files:**
- Modify: `oracle/run-accuracy.mjs` (only if `@axe-core/playwright` resolves)

- [ ] **Step 1: Check axe availability**

Run: `node -e "import('@axe-core/playwright').then(()=>console.log('AXE_OK')).catch(()=>console.log('AXE_ABSENT'))"`
Expected: prints `AXE_OK` or `AXE_ABSENT`.

- [ ] **Step 2: If `AXE_OK`, wire a11y into the render path**

In `oracle/run-accuracy.mjs`, inside the `if (render && shots && r.hasOracleStory)` block, after capturing `t`, add an a11y check and pass a 4-gate set. Replace the `gates` line for rendered rungs:

```js
// when rendering, evaluate a11y via axe on the target page (shots exposes axeOn)
const a11yOk = shots.axeOn ? await shots.axeOn(r).catch(() => false) : undefined;
const gateList = a11yOk === undefined ? ['typecheck', 'build', 'tests'] : ['typecheck', 'build', 'tests', 'a11y'];
const runGate = runGateFor(run.gates);
const runGateA11y = async (g) => (g === 'a11y' ? { ok: a11yOk } : runGate(g));
// (use runGateA11y + gateList in scoreGates for this rung)
```

And add `axeOn(r)` to `render-harness.mjs` `openShots()` return (inject axe-core, run `new AxeBuilder({page})` against the story, return `violations.length === 0`). If `AXE_ABSENT`, SKIP this task — a11y stays out of the gate denominator (Phase 1 behaviour), which is already correct.

- [ ] **Step 3: Re-run the render pass + regenerate (Task 11 Steps 1–4), then commit**

```bash
git add oracle/run-accuracy.mjs oracle/render-harness.mjs reports/heroui-20260603/* trials/heroui-20260603/*/results.json
git commit -m "feat(workbench): a11y gate via axe in accuracy render pass"
```

---

## Final verification

- [ ] **Run every workbench suite:** `node --test 'oracle/*.test.mjs' 'report/*.test.mjs' 'analyze/*.test.mjs'` → all PASS.
- [ ] **Accuracy is real:** `node -e "const t=require('./reports/heroui-20260603/trialset.json'); console.log(t.accuracyByRung.map(r=>r.rung+':'+r.composite).join(' '))"` → integers for the 5 component rungs.
- [ ] **Dashboard renders:** screenshot `reports/heroui-20260603/dashboard.html` with Playwright; the Accuracy-by-rung bars are non-zero for scored rungs.
- [ ] **Caveat present:** `grep -i 'designSystem' reports/heroui-20260603/analysis/01-accuracy-feasibility.md` still documents the target-vs-HeroUI divergence; add a one-line pointer in `report.md` accuracy note if missing.

## Notes for the implementer

- **DRY/YAGNI:** do not touch the pure scorer math — only `score-gates`/`score.mjs` get the additive subset change, fully covered by tests.
- **The single reality-divergence point is story ids** (Tasks 6 Step 4, 9 Step 2, 9b Step 2). Always reconcile against the built `index.json`; never assume.
- **Honest caveat stays:** target is `designSystem: none`; visual/style vs HeroUI read low by design. Structural + the cross-rung trend are the meaningful signals. Do not "fix" low visual scores by loosening `tolerance` — that would hide the real divergence.
- **Graceful degradation is a feature, not a fallback to apologise for:** a rung with no oracle story or a downed Storybook still yields a real composite from structural + gates.
```
