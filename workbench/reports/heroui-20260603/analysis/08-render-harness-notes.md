# Render harness & computed accuracy — notes

This run computes the accuracy half of the scorecard for real (previously all-null). It supersedes the "accuracy can't be computed from disk" framing in [`01-accuracy-feasibility.md`](./01-accuracy-feasibility.md) for the four component rungs that have a HeroUI oracle story.

## What now runs

| sub-score | how it's computed | reference |
|---|---|---|
| **struct·src** | source-tree + prop-surface similarity (`oracle/extract-structural.mjs` → `score-structural`) | HeroUI `.tsx` source |
| **struct·dom** | rendered-DOM-tree similarity | HeroUI Storybook render |
| **visual** | pixel-diff of a fixed 360×240 clip (`score-visual`) | HeroUI Storybook render |
| **style** | `getComputedStyle` match over a fixed prop set (`score-style`) | HeroUI Storybook render |
| **gates** | deterministic `tsc` / `build` / `tests` (from the original trial's `results.json`) | — |

The harness (`oracle/render-harness.mjs`) builds both Storybooks statically (`target/` and `ref-heroui/packages/storybook`), serves them locally, and drives Playwright to each component's canonical `--default` story to capture `{ png, computed-style, dom-tree }`. The driver (`oracle/run-accuracy.mjs --render`) blends the sub-scores via the existing `composeAccuracy`, renormalising weights over whatever is available (`oracle/effective-weights.mjs`).

## Computed scores (this run)

| rung | composite | visual | style | struct·src | struct·dom | gate |
|---|---:|---:|---:|---:|---:|:--:|
| atom (Button) | 24 | 0 | 17 | 28 | 20 | ✓ |
| molecule (Input) | 42 | 2 | 50 | 29 | 54 | ✓ |
| organism (Card) | 48 | 27 | 58 | 11 | 30 | ✓ |
| template (Form) | 31 | — | — | 5 | — | ✗ |
| all-icons (Alert) | 43 | 48 | 33 | 20 | 7 | ✓ |

`template/Form` has no HeroUI **story** (only source), so visual/style/struct·dom are `—` and its weight renormalises onto struct·src + gates. `icon-only`/`page` are out of fidelity scope.

**Read these as divergence-from-HeroUI, not quality.** The target is `designSystem: none` (hand-rolled inline Tailwind) by deliberate choice, so visual/style score low *because the implementations look different by design* — not because the code is bad. `struct·dom` (both sides normalised to real HTML) and the cross-rung trend are the more meaningful fidelity signals; **quality** (the 3-vote judge panel) remains the better measure of code goodness.

## Build-fixes applied to the target to enable rendering (transparency)

The target Storybook would not build as generated; three minimal fixes were required. The two **target** fixes are themselves findings about the generated code. They are plumbing only — neither changes any component's rendered output — so the visual/style scores above are valid for the generated components. (The whole `trials/` tree is git-ignored, so these edits are not in tracked state; a re-run reapplies them.)

1. **`target/src/components/icons/index.ts`** — the barrel re-exported `CaretsExpandVertical` and `Check2` as `default` exports, but those icon modules use **named** exports → build error. Fixed to named re-exports. *Finding: inconsistent icon export style in the generated barrel.*
2. **`target/src/components/molecules/Alert/Alert.stories.tsx`** — imported test utilities from `@storybook/test` (Storybook 7/8) but the project is Storybook 10, which exposes them at `storybook/test` → build error. Fixed the import path. *Finding: stale Storybook import in generated stories.*
3. **`oracle/png.mjs`** (harness, not target) — extended the PNG decoder to accept colour-type 2 (RGB), which Playwright emits for opaque screenshots, in addition to colour-type 6 (RGBA). Committed.

## a11y gate

`@axe-core/playwright` is not installed in this environment, so the **a11y** gate is not evaluated; the gate term scores over the three available gates (`tsc`/`build`/`tests`) rather than counting a11y as a failure. Wiring axe is a fast-follow.
