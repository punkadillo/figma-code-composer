# Accuracy fidelity harness — design

- **Date:** 2026-06-05
- **Status:** Approved (design); pending implementation plan
- **Branch:** workbench-agent-benchmark
- **Owner:** Allan (procurement@theprocedure.in)

## 1. Context & problem

The HeroUI workbench trial (`workbench/trials/heroui-20260603`) reports **accuracy as `null` for every rung**. The dashboard renders that null as a `0`-height bar; the markdown renders `—`. The cause is not a bug — accuracy was simply never computed: `analyze/build-results.mjs` hardcodes `accuracy: null`, and the live render pass that the scorers need was never run.

The scoring layer already exists and is fully unit-tested as **pure functions with injected IO `deps`**:

| module | purpose | status |
|---|---|---|
| `oracle/score-visual.mjs` | pixel-diff two RGBA buffers → `{diffPct, score}` | done, tested |
| `oracle/score-style.mjs` | compare two computed-style maps over `STYLE_PROPS` → `{matchRate, properties}` | done, tested |
| `oracle/score-structural.mjs` | tree token-overlap + prop-surface Jaccard → `{score, tree, prop}` | done, tested |
| `oracle/score-gates.mjs` | run 4 gates via injected `runGate` → booleans | done, tested |
| `oracle/score.mjs` `composeAccuracy` | weighted composite; build-fail caps at `buildFailCeiling` | done, tested |
| `oracle/score-component.mjs` | orchestrates the four sub-scores into accuracy | done, tested |
| `oracle/png.mjs` `decodePng` | decode Playwright PNG (8-bit, colour-type 6) → RGBA | done, tested |
| `oracle/capture.mjs` / `render-generated.mjs` | IO shells that call injected `*Shot` deps | done |

**What is missing is only the driver/harness** that actually renders components in a browser and supplies `targetShot` / `oracleShot` / `runGate`.

## 2. Goal & non-goals

**Goal.** Compute real `visual`, `style`, and `structural` accuracy sub-scores for the HeroUI trial by comparing the **generated target component against the HeroUI oracle**, combine them with the deterministic build gates into the existing accuracy composite, write the result into each run's `results.json`, and re-render the report + dashboard so the accuracy column stops being all-null.

**Reference model (decided).** All fidelity sub-scores are **target ↔ HeroUI oracle**. The Figma design is **not** a reference. Rationale: a Figma node is a raster with no computed style and no DOM, so it can only feed `visual`; comparing the rendered component against the HeroUI implementation keeps a single coherent reference for all three sub-scores and stays fully local (both Storybooks are installed on disk — no Figma MCP).

**Non-goals.**
- No Figma-screenshot reference, no MCP dependency, no raster-vs-design pixel alignment.
- No new scoring math — reuse the tested pure scorers verbatim.
- `page` (no component produced) and `icon-only` (not a full component) stay out of fidelity scope.
- Quality (the 3-vote judge panel) is unchanged; this is the *accuracy* half only.

## 3. Reference & coverage matrix

| sub-score | reference | source of truth | rungs in scope |
|---|---|---|---|
| **visual** (pixel-diff) | HeroUI render | both Storybooks (Playwright screenshot) | Button, Input, Card, Alert |
| **style** (`getComputedStyle`) | HeroUI computed styles | both rendered DOMs over `STYLE_PROPS` | Button, Input, Card, Alert |
| **structural** (tree + props) | HeroUI source | both `.tsx` parsed (no render) | Button, Input, Card, Alert, **Form** |
| **gates** | — | deterministic `tsc` / `build` / `tests` already captured | all 5 |

`Form` has HeroUI **source** (`form.tsx`) but **no HeroUI story**, so it gets structural + gates but no visual/style. The rung→component→story mapping:

| rung | target component | target dir | oracle dir | oracle story? |
|---|---|---|---|---|
| atom | Button | `atoms/Button` | `react/src/components/button` | ✅ |
| molecule | Input | `atoms/Input` | `.../input` | ✅ |
| organism | Card | `molecules/Card` | `.../card` | ✅ |
| template | Form | `organisms/Form` | `.../form` | ❌ (source only) |
| all-icons | Alert | `molecules/Alert` | `.../alert` | ✅ |

## 4. Architecture

Extends the existing **pure-scorer + thin-IO-driver** split. Three new modules + a rung/story map.

### 4.1 `oracle/extract-structural.mjs` — pure, no render
Parses a `.tsx` file with the `typescript` compiler (already in `target/node_modules`) into the shape `scoreStructural` consumes:
```
extractStructural(tsxSource) -> { tree: { tag, role, children }, props: [propName, ...] }
```
- **tree:** walk the default-export component's returned JSX. Host elements (lowercase tags: `div`, `button`, `span`, `input`, …) become `{tag}` nodes; `role=` attributes (literal) become `role`. Component elements (capitalised) are recorded by tag too. Nesting follows JSX children.
- **props:** the names of the component's props interface/type (the public prop surface).
- Pure and deterministic → unit-tested with small `.tsx` fixtures. This is the highest-value, lowest-risk piece: it makes `structural` real for all 5 rungs with **no servers and no browser**.

### 4.2 `oracle/render-harness.mjs` — live IO
Boots both Storybooks and screenshots component roots.
- **Build once, serve static.** Run `storybook build` for the target (`target/`) and for HeroUI (`ref-heroui/packages/storybook`), producing `storybook-static/` each; serve over a local static file server (no network). Static build is chosen over `storybook dev` for determinism (no HMR flake). If a static build proves too slow/fragile, fall back to `storybook dev --ci -p <port>` started as a background process.
- For each rung, Playwright navigates to `iframe.html?id=<storyId>&viewMode=story`, waits for render, locates the **component root** (first meaningful child of `#storybook-root`), and:
  - **image:** `element.screenshot()` clipped to a **fixed `W×H` box** anchored at the root's top-left. Fixed dims are mandatory because `scoreVisual` returns `0` if the two buffers differ in size; a fixed clip box gives both sides identical dimensions and lets genuine layout differences show up as pixel diffs.
  - **style:** `getComputedStyle(root)` projected onto `STYLE_PROPS` → map.
  - Returns `{ pngBuffer, style }`.
- Exposes `targetShot(rung)` and `oracleShot(rung)`; both reuse one Playwright/browser instance.
- `decodePng` (existing) turns `pngBuffer` into the RGBA buffer `scoreVisual` needs.

### 4.3 `oracle/story-map.mjs` — pure config
A static table mapping each rung to `{ targetStoryId, oracleStoryId }` (e.g. `atom → { target: 'atoms-button--default', oracle: 'components-button--default' }`). Picks the **canonical "default" story** on each side so we compare like-for-like. Tiny, unit-testable, easy to amend if a story id changes.

### 4.4 `oracle/run-accuracy.mjs` — driver
Per in-scope rung:
1. `bundle.generated = { image, style }` from `targetShot(rung)`; `dom` from `extractStructural(targetSource)`.
2. `bundle.oracle = { image, style }` from `oracleShot(rung)` (skipped if no oracle story); `dom` from `extractStructural(oracleSource)`.
3. `runGate(g)` resolves `typecheck`/`build`/`tests` from the gates already in `results.json`; `a11y` per §6.
4. `scoreComponent(bundle, { weights, runGate })` → accuracy (with availability handling, §5).
5. Write `accuracy` into `trials/.../<dir>/results.json` `runs[0].accuracy`.

Then: re-run `analyze/aggregate-trialset.mjs` → `report/build-report.mjs` to refresh `report.md` + `dashboard.html` (no renderer change needed — the accuracy table/columns already exist; they simply populate).

## 5. Availability handling (composite never collapses to 0)

When a sub-score cannot be computed (no oracle story → no visual/style; Storybook boot fails → no visual/style), it must not be scored as `0` (which would unfairly tank the composite). Policy:

- The driver determines the **available** sub-score set per rung (`structural` and `gates` are always available; `visual`/`style` are conditional).
- It **renormalises the fidelity weights** (`weights.json`: visual .35 / style .30 / structural .20 / gates .15) over the available set so they sum to 1, and passes weight `0` for any unavailable sub-score into the existing `composeAccuracy` (a 0-weight term contributes nothing — no change to the tested function).
- The written `accuracy` object records per-sub-score **availability flags** and the **effective weights used**, so the report can show `—` for an unavailable sub-score and a one-line note explaining the renormalisation.
- Floor case (Form, or HeroUI Storybook down): composite is computed from `structural` + `gates` renormalised to 1 → still a real number, never null.

## 6. Gates wiring

`composeAccuracy`'s gate term = `gatesPassed / GATES.length` where `GATES = [typecheck, build, tests, a11y]`.
- `typecheck` ← `gates.tsc`, `build` ← `gates.build`, `tests` ← `gates.tests.passed === gates.tests.total` (all already in `results.json`).
- `a11y`: run `@axe-core/playwright` against the rendered target story if resolvable. If axe is **not** installable in this environment, treat a11y as **unavailable** rather than a silent fail. Mechanism is a plan-level choice: either wire axe, or have the gate term score over the available gate subset (a small, additive change to `score-gates`/`composeAccuracy` so the unavailable gate is excluded from the denominator rather than counted as failed). Counting an unrun a11y check as a hard failure is explicitly rejected.

## 7. Scope, failure modes, caveats

- **In scope:** visual+style for Button/Input/Card/Alert; structural for those + Form; gates for all 5.
- **Out of scope:** `icon-only`, `page`.
- **Graceful degradation:** any of {HeroUI Storybook won't build, a story id missing, axe unavailable} degrades *that* sub-score to `unavailable` and renormalises; the run still yields structural + gates. Accuracy stops being all-null regardless of how much of the render path succeeds.
- **Honest caveat (kept in the report):** the target is `designSystem: none` / inline-Tailwind **by deliberate choice**, so target-vs-HeroUI `visual` and `style` will read **low** — they measure divergence from HeroUI's specific look, not code quality. The meaningful signals are **structural** and the **relative trend across rungs**. This caveat is surfaced in `report.md` and `analysis/01-accuracy-feasibility.md`.

## 8. Testing strategy

- **`extract-structural.mjs`:** unit tests with hand-written `.tsx` fixtures asserting the `{tree, props}` shape (nested elements, role attrs, prop names). Pure → fast, deterministic.
- **`story-map.mjs`:** unit test asserting every in-scope rung has a mapping.
- **Pure scorers:** already tested; unchanged.
- **`render-harness.mjs` / `run-accuracy.mjs`:** IO — smoke-tested against the real target Storybook (render Button, assert a non-empty PNG buffer + a populated style map). Not unit-tested; validated by an end-to-end dry run on at least one rung before the full sweep.
- **Regression:** existing `report/*.test.mjs` and `analyze/*.test.mjs` must stay green (no renderer/aggregator API change).

## 9. Deliverables / definition of done

1. `oracle/extract-structural.mjs` + tests (structural real for 5 rungs).
2. `oracle/story-map.mjs` + test.
3. `oracle/render-harness.mjs` (target + oracle shots).
4. `oracle/run-accuracy.mjs` driver; `results.json` for the 5 rungs gains a real `accuracy`.
5. Regenerated `trialset.json` + `report.md` + `dashboard.html` with populated accuracy (visual/style/structural/gate columns + availability notes).
6. All `report/*` and `analyze/*` tests green; spec caveat reflected in the report.

## 10. Phased delivery

- **P1 — structural + gates (no browser).** `extract-structural` + driver path that writes structural+gates accuracy for all 5 rungs, renormalised. Ships real accuracy numbers immediately, zero infra risk.
- **P2 — render harness (visual + style vs HeroUI).** Stand up both Storybooks + Playwright; populate visual/style for the 4 rungs with an oracle story.
- **P3 — a11y gate + report polish.** Wire axe if available; add the availability/renormalisation note to the accuracy section.

Each phase leaves the report in a consistent, regenerated state.

## 10a. Revision A (2026-06-05) — dual structural + de-noise

During P1 review, structural-from-source proved artifact-heavy on the HeroUI side: HeroUI's compound/context + primitive architecture (`ButtonPrimitive`, `dom.div`, context providers) shares almost no source-tag vocabulary with a flat inline-Tailwind component, and its props are typed via `VariantProps<…> & …` intersections the regex can't enumerate — so the score was dominated by the `root` sentinel. **Decision: compute structural two ways and report both.**

- **`structuralSource`** — the P1 source-parse (all 5 rungs incl. Form). De-noised: normalise `dom.X` → `X`, drop single-letter noise tags (`E`), and union props from the props interface **and** the destructured component params.
- **`structuralDom`** — NEW (P2): compare the **rendered DOM** trees of both Storybooks (target vs HeroUI). Both normalise to real HTML elements, so the tree comparison is meaningful. Available only for the 4 rungs with a HeroUI story.
- Both use the same source prop-surface for the prop-Jaccard term; they differ only in the tree source.

**Schema change** to the written `accuracy` object: add `structuralSource` and `structuralDom`; the existing `structural` field becomes the **primary** used in the composite — `structural = structuralDom ?? structuralSource` (rendered DOM preferred when available, source as fallback). `availability.structural` stays always-true (source always available). The single structural weight (0.20) is unchanged — no weight splitting.

**Report change:** the markdown accuracy table's `structural` column splits into `struct·src` and `struct·dom`. The dashboard's accuracy bars (composite) are unchanged.

## 11. Open risk

The single real execution risk is **P2: whether HeroUI's pnpm-workspace Storybook builds/serves** in this environment (it needs `@heroui/styles` built). P1 and P3-gates are independent of it. If P2 fails after reasonable effort, the harness records visual/style as `unavailable` and we ship P1+P3 — accuracy is still real (structural + gates), just without the HeroUI pixel/style comparison.
