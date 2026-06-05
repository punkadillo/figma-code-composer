# 01 — Can the accuracy report be generated from the on-disk ref-heroui oracle?

**Trial:** `heroui-20260603`
**Question:** Can the accuracy scorecard be produced now by reviewing the generated `target/` against the `ref-heroui` oracle that is already on disk?

> **Update (2026-06-05):** this has since been **built** — visual + style + rendered-DOM structural are now computed live by standing up both Storybooks + Playwright (exactly the "render pass" this report said was missing). See [`08-render-harness-notes.md`](./08-render-harness-notes.md) for the harness, the computed scores, and the build-fixes required to render. The analysis below remains accurate as the *pre-render* feasibility assessment.

## TL;DR

**Partially — and it is worth doing.** Of the four *accuracy* dimensions and five *quality* dimensions, the ones that consume **source / artifacts** (structural surface, build-gates, and the entire 3-vote quality judge panel) **can be produced right now** from what is on disk. The two dimensions that consume **rendered pixels / `getComputedStyle`** (visual pixel-diff and computed-style match) **cannot** be produced without standing up live Playwright + a Storybook (oracle side) and a Vite/Storybook render of the `target` (generated side) — and no captured PNG/computed-style bundles exist on disk to substitute for that rendering.

The accuracy field is `null` for all 7 runs (verified — see "Current state"), because **the capture step never ran**: there are no oracle bundles and no per-run generated snapshots on disk. The pure scorers were never invoked.

The defensible path is to score what is source-derivable now (structural + gates + judge panel), produce a **source-fidelity scorecard** clearly labelled as such, and mark visual/style as "requires render" rather than reporting a fabricated composite.

---

## How the scorer graph is wired (so we can see what each input is)

`scoreComponent` (`workbench/oracle/score-component.mjs:10-16`) calls the four accuracy scorers over **one bundle** of the shape:

```js
// score-component.mjs:8
// bundle: { generated: { image, style, dom }, oracle: { image, style, dom } }
```

- `image` — a **decoded PNG RGBA buffer** (`{width,height,data}`), produced by `decodePng` in `png.mjs`.
- `style` — a **computed-style map** (`getComputedStyle` output keyed by CSS property).
- `dom` — a serialized **DOM tree** `{ tree, props }`.

Those three fields are produced **only** by the two live IO modules:

- `captureOracle` (`capture.mjs:12-18`) → calls injected `deps.storybookShot(rung)` or `deps.figmaShot(nodeId)`, both of which return `{ pngBuffer, style, dom }`. The comment is explicit: *"Capture is the only part that needs live services"* (spec §4, `capture.mjs:2`).
- `renderGenerated` (`render-generated.mjs:7-10`) → calls injected `deps.targetShot(componentName)` → `{ pngBuffer, style, dom }`.

So `image`/`style`/`dom` are **render artifacts**, not source. They do not exist on disk for this trial (verified below). That single fact is what gates three of the four accuracy dimensions.

The **quality** side (`scoreBoth`, `score-both.mjs:11-27`) is different: it reads `bundle.generated.artifacts = { component, stories, tests, docs }` — those are **source strings** — plus a judge panel that reads the same source. No rendering at all.

---

## Accuracy dimensions: input requirement, source-vs-render

| Dimension | Scorer | Exact input consumed | Source or render? | Producible now? |
| --- | --- | --- | --- | --- |
| **visual** | `score-visual.mjs:6` | two decoded **RGBA PNG buffers** `{width,height,data}`; per-pixel channel diff vs `tolerance` (`score-visual.mjs:13-21`). Returns `score:0` immediately if dimensions differ (`:7-8`) | **render** (Playwright screenshot of both oracle Storybook story and target render) | **No** — needs live Storybook + Vite render; no PNGs on disk |
| **style** | `score-style.mjs:14` | two **computed-style maps** over a fixed 13-prop set (`STYLE_PROPS`, `:5-10`: color, background-color, padding, margin, gap, font-size/weight/family, line-height, border-radius/width/color) | **render** (`getComputedStyle` of the live root node) | **No** — these are *resolved* values (hex, px); the target's Tailwind classes and the oracle's `@heroui/styles` CSS only resolve under a browser. Not statically derivable defensibly |
| **structural** | `score-structural.mjs:30` | two DOM trees `{ tree, props }`; `tree` flattened to `tag:role` token multiset (`flattenTree`, `:4-9`) → `seqOverlap`; `props` arrays → `jaccard` (`:30-34`) | **render-ish** as written (the `dom` field is captured live) **BUT** the inputs are structurally reconstructable from source | **Partial → Yes with an adapter** — see below |
| **gates** | `score-gates.mjs:7` | injected `runGate(name)` for `['typecheck','build','tests','a11y']` (`GATES`, `:5`); each resolves `{ok:boolean}`, a throw = fail (`:10-16`) | **source/toolchain** — runs commands in the `target` | **Yes** — `target` has the toolchain (see "Gates are runnable") |

Composite (`score.mjs:5-25`): `visual*0.35 + style*0.30 + structural*0.20 + gates*0.15` (`weights.json`), and **a failed `build` gate caps the composite at 20** (`score.mjs:15-18`). So a partial scorecard missing visual+style (0.65 of the weight) cannot honestly be folded into the published 0–100 composite — it must be reported as a separate, labelled sub-score.

### Why "structural" is the swing dimension

`scoreStructural` only needs a `{ tree, props }` object per side. As written, that object is captured from a *rendered* DOM (`capture.mjs`/`render-generated.mjs`). But it is **the one accuracy dimension whose inputs can be reconstructed from source without a browser**:

- **oracle tree/props** — `ref-heroui/packages/react/src/components/<name>/<name>.tsx` declares the JSX element tree, the `react-aria-components` primitives (which carry the ARIA roles), and the prop interface. The variant surface lives in `@heroui/styles` recipes (e.g. `buttonVariants`).
- **generated tree/props** — `target/.../<Name>.tsx` declares its JSX tree and `interface <Name>Props` directly (e.g. `Button.tsx:25-44` declares `ButtonProps` and the variant union `ButtonVariant`).

Building a `{tree,props}` from JSX is a parse, not a render. It is **doable now** but requires writing a small source→tree adapter (it does not exist; the only producers are the live capture modules). Treat it as *new work*, not *free*.

---

## Quality dimensions: all source/artifact-based → all producible now

`scoreBoth` (`score-both.mjs`) blends a **metric sub-score** (regex/heuristic over source) with a **3-vote judge median** per dimension. None of it renders.

| Quality dim | Metric input (pure, on-disk) | Judge input | Producible now? |
| --- | --- | --- | --- |
| **optimizedCode** | `codeMetrics(component)` — LOC, import count, branch-keyword complexity proxy, byte size → `metricScore` (`metrics/code.mjs:11-20`) | judge reads component + oracle ref (`rubric.md:7-10`) | **Yes** |
| **dx** | `surfaceMetrics`: `hasTypes`, `namedExports`, `propCount` (`quality/dimensions.mjs:10-14`, `metrics/surface.mjs:5-17`) | judge (`rubric.md:12-15`) | **Yes** |
| **docs** | `surface.docWords`, `hasPropTable` (`dimensions.mjs:15-18`) | judge (`rubric.md:17-20`) | **Yes** |
| **testDepth** | `surface.testCount` capped at 6 (`dimensions.mjs:19`) | judge (`rubric.md:22-25`) | **Yes** |
| **storybook** | `surface.storyCount` capped at 4 (`dimensions.mjs:20`) | judge (`rubric.md:27-30`) | **Yes** |

Blend ratios live in `quality-weights.json` (`blend` block, e.g. `dx` is 0.3 metric / 0.7 judge); dimension weights in the `dimensions` block. The judge panel (`judge.mjs:5-13`) just takes the **median of 3 votes**; the votes are produced by `makeJudgeFor` (`judge-live.mjs:8-19`) which calls an injected `runJudgeAgent({dimension, artifacts, oracleRef, rubric})`. The "agent" can be Claude reading the on-disk `target` artifacts and the on-disk `ref-heroui` oracle against `rubric.md` — **no services**. The metric inputs (`artifacts.component/stories/tests/docs`) are exactly the files we listed in `target/src/components/...`.

**The entire quality scorecard is computable now from source on disk.** This is the highest-value, lowest-effort deliverable.

---

## Gates are runnable (the one accuracy dimension besides structural)

`target/package.json` has a real toolchain:

- `typecheck` / `build` → `"build": "tsc -b && vite build"` (script present)
- `tests` → `vitest` in devDependencies; every component ships a `*.test.tsx`
- `a11y` → `@playwright/test` present; an axe pass or the pipeline `a11y-audit` skill can drive it (spec §10 leaves the exact tool open)

`runGate` is injectable (`score-gates.mjs`), so wiring it to `tsc`/`vitest`/`vite build` in `target/` produces real `{typecheck,build,tests,a11y}` booleans **now**. Note the cap rule: if `build:false`, composite is capped at 20 (`score.mjs:15`).

---

## Current state on disk (verified, not trusted)

- **Accuracy is `null` for all 7 runs.** `grep '"accuracy"'` across `icon-only/atom/molecule-cold/organism/template/page/all-icons` `results.json` → every one is `"accuracy": null` (e.g. `atom/results.json` last run field; `page/results.json`). `generatedAt` is also `null`.
- **No oracle bundles, no generated snapshots.** A find for `*.png`, `oracle*.json`, `*bundle*`, `*.computed.json` under the trial (excluding `node_modules` and `ref-heroui`) returns only `target/src/assets/hero.png` (an app asset). The run dirs contain only telemetry: `events.jsonl`, `metrics.jsonl`, `spans.jsonl`, `costs/`, `manifest.json`, `results.json`. **The capture phase (spec §4, steps 4 & 8) never ran.**
- **Oracle source is rich and present** — `ref-heroui/packages/react/src/components/` has 89 component dirs; `button/`, `input/`, `card/`, `alert/` each ship `*.stories.tsx`; `@heroui/styles/components/*.css` has per-component recipes (`button.css`, `input.css`, `card.css`, `alert.css`, etc.). See report 02 for the per-rung mapping.

---

## Conclusion: what CAN and CANNOT be generated now

**CAN (from on-disk ref source + target source, no services):**

1. **Quality scorecard (all 5 dimensions)** — metric sub-scores are pure regex over `target` artifacts; the 3-vote judge panel reads `target` + `ref-heroui` against `rubric.md`. *Fully producible now.*
2. **Build-gates (accuracy dim 4)** — run `tsc -b`, `vitest`, `vite build`, and an a11y pass inside `target/`. *Producible now.*
3. **Structural (accuracy dim 3)** — producible **after** writing a source→`{tree,props}` adapter (JSX/prop-interface parse for both sides). The scorer itself is ready (`score-structural.mjs`); only the input adapter is missing.

**CANNOT (without live rendering):**

4. **Visual pixel-diff** — needs a Playwright screenshot of the oracle Storybook story *and* of the rendered `target` component. No PNGs exist; `score-visual.mjs` returns 0 on any size mismatch, so guessing is meaningless.
5. **Computed-style match** — needs `getComputedStyle` of both rendered roots. The target's Tailwind utility classes and the oracle's `@heroui/styles` CSS resolve to concrete px/hex values only in a browser; statically "resolving" them would itself violate the spirit of dimension and be indefensible.

Because visual (0.35) + style (0.30) = **65% of the accuracy composite weight**, the honest published artifact is **not** a single 0–100 accuracy number. It is a scorecard with `visual`/`style` marked **"requires render — not captured this trial"**, and real numbers for `structural`, `gates`, and the full `quality` block.

---

## Recommended path to a real, defensible report

**Recommended (richest data points without standing up browsers): "Source-Fidelity + Quality" scorecard.**

| Step | Work | Effort |
| --- | --- | --- |
| A | **Quality scorecard, all 6 component rungs.** Feed each `target` component's `{component,stories,tests,docs}` to `metricSubScores`; run a 3-vote judge per dimension (Claude vs `rubric.md`, with the matching `ref-heroui` component as `oracleRef`). Emit `quality.composite` + per-dimension. *Uses existing pure modules verbatim.* | **Low** (wire a driver; no new scorer code) |
| B | **Build-gates per rung.** Run `tsc -b`, `vitest`, `vite build` once in `target/` (gates are repo-wide, then attribute per-component test files). Wire results into `runGate`. | **Low–Med** (one toolchain run + per-component test filter) |
| C | **Structural per component rung.** Write a small source→`{tree,props}` extractor: parse the `<Name>.tsx` JSX for the `tag:role` skeleton and the `interface <Name>Props` for the prop set, on both `target` and `ref-heroui` sides. Feed to `scoreStructural`. | **Med** (one new adapter, ~the only genuinely new code) |
| D | **Label visual/style "requires render".** Report them as N/A with the reason, not a number. Do **not** fold them into the 0–100 composite; publish `structural`+`gates` as a partial fidelity sub-score alongside the full quality composite. | **Trivial** |
| E (optional, full fidelity) | Stand up HeroUI Storybook + a Vite render of `target`, drive Playwright per spec §4, capture PNG + `getComputedStyle` + `outerHTML`, then run `score-visual`/`score-style` and the true composite. | **High** (live services, per-rung story wiring, the spec's deferred operator phase) |

### What a source-level judge / structural comparison would assert, per rung

| Rung | Oracle ref (source) | Source-level assertion the scorecard makes |
| --- | --- | --- |
| icon-only (check icon) | inline `<svg>` checkmark inside `checkbox.tsx` (no standalone Check export in `icons.tsx`) | viewBox / path-count / stroke parity of target `Check2.tsx` vs the oracle glyph; **structural only** (it's an SVG, judge dims mostly N/A) |
| atom (Button) | `button/button.tsx` + `button.stories.tsx` + `button.css` recipe | prop-surface Jaccard (target `ButtonProps` variants vs `buttonVariants` recipe keys); tag:role tree (`<button>`); full quality (stories/tests/docs present both sides) |
| molecule (Input) | `input/input.tsx` + `input.stories.tsx` + `input.css` | label/input/description tree parity; prop surface; quality |
| organism (Card) | `card/card.tsx` + `card.stories.tsx` (19.5K stories) + `card.css` | slot composition (header/body/footer) tree overlap; prop surface; quality (oracle is rich → calibrated, not generous) |
| template (Form) | `form/form.tsx` (810B) — **no stories, Figma-only oracle** | structural tree vs the thin `form.tsx`; visual/style strictly Figma-render (not on disk). Judge can still score quality of target's Form artifacts |
| page (mail 1440×1024) | **no ref source oracle at all** — Figma-only | quality dims only (judge against `rubric.md`, no oracle ref); structural/visual/style all "requires render"/"Figma-only" |
| all-icons (Alert) | `alert/alert.tsx` + `alert.stories.tsx` + `alert.css` + the 4 status icons in `icons.tsx` | structural tree + icon fan-in (status icons present); prop surface; full quality |

**Be explicit:** the **`page` rung has no source oracle** in `ref-heroui` (no `mail`/dashboard/inbox demo exists — see report 02). Its only oracle is the Figma screenshot, so for `page` *every* on-disk-derivable accuracy dimension except gates is unavailable; only the quality judge panel (which needs no oracle ref) and the build-gates apply.

**Rough total effort:** quality + gates is the bulk of the value and is **low effort** (a driver script over existing pure modules). Structural adds **medium effort** (one parser). Visual/style is the only **high-effort** piece and is the deferred live-capture phase the trial never executed. Recommendation: ship A+B+C+D now as the "source-fidelity + quality" scorecard; schedule E only if pixel-level fidelity is required.
