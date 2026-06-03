# Plan 3 — Quality Scorecard + Empty-Example Live Trial — Design Spec

- **Date:** 2026-06-03
- **Status:** Approved (brainstorming) — pending implementation plan
- **Builds on:** Plan 1 (`docs/superpowers/plans/2026-06-02-workbench-telemetry-harness.md`) and Plan 2 (`docs/superpowers/plans/2026-06-02-heroui-live-trial.md`). This is a **pure-addition extension** — the 58 existing workbench tests stay green; all new work is appended.
- **Topic:** Add a second "engineering quality" scorecard (optimized code, developer experience, docs, test edge-case coverage, storybook display) alongside the existing fidelity scorecard, and reframe the live trial to generate into a freshly-scaffolded empty example while grading against the HeroUI v3 repo as the reference oracle.

---

## 1. What changed from Plan 2

The earlier framing cloned HeroUI v3 and treated it as both stack reference and oracle. The revised approach:

1. **Write-target = a freshly scaffolded empty example** (React + Tailwind v4, to stay comparable to HeroUI's stack), linked to this pipeline via `/init-figma-compose`. (Plan 2 already scaffolded a scratch target — this only sharpens that it is a clean new project, not a HeroUI clone.)
2. **HeroUI v3 = read-only reference oracle (decision A).** Generated-from-Figma components are graded *against* HeroUI's shipped equivalents (Storybook render for component rungs, Figma node for template/page). Nothing is ever written into HeroUI.
3. **Evaluation rubric broadened to two scorecards.** Plan 2's four scorers (visual / computed-style / structural / build-test-a11y gates) remain as the **Fidelity** scorecard. A new **Quality** scorecard adds five dimensions: optimized code, developer experience, docs quality, test edge-case coverage, storybook display.

Locked brainstorming decisions:
- Oracle interpretation: **A** (HeroUI v3 is the reference we compare against; generated code stays in the empty example).
- Qualitative scoring: **hybrid** — deterministic metrics + LLM-judge.
- Composite shape: **two separate scorecards** (Fidelity, Quality), not one blended number.
- Judge: **dedicated workbench judge, 3-vote panel, median** per dimension.

## 2. Two scorecards per component

### 2.1 Fidelity (unchanged — already built in Plan 2)
`visual` / `style` / `structural` / `gates` → existing `accuracy` composite with build-fail cap. No changes; the `accuracy` field on each run row is the Fidelity scorecard.

### 2.2 Quality (new)
Five dimensions. Each dimension score = `metricWeight · metricSubScore + judgeWeight · judgeMedian` (both 0–100). The Quality composite = weighted blend of the five dimensions. All weights + the per-dimension metric/judge blend ratio live in `workbench/oracle/quality-weights.json`.

| Dimension | Deterministic metric sub-score | Judge sub-score (rubric, 0–100) |
| --- | --- | --- |
| **optimizedCode** | LOC, branch-keyword complexity proxy, transpiled char-size, import count | idiomatic? dead code? unnecessary re-renders / wasted work? |
| **dx** (developer experience) | TS types present, prop count, named-export present | API ergonomics, prop naming, composability, type quality |
| **docs** | docs file present, word count, prop-table present | clarity, completeness, presence of usage examples |
| **testDepth** (edge-case coverage) | test count, coverage %, assertion count | are empty / error / boundary / a11y states actually exercised? |
| **storybook** | story-variant count, args/states count | do stories cover the component's real states and render cleanly? |

Per-rung Quality is expected to vary independently of Fidelity (a pixel-perfect component can still have poor DX or thin tests) — keeping the two scorecards separate is the point.

## 3. Judge panel — injected, unit-testable, live-wired

The panel is split into a **pure aggregation function** and an **injected vote producer**, mirroring Plan 2's gate-runner and capture-deps pattern:

- `workbench/oracle/judge.mjs` exports `judgePanel(votes)` → `{ score, rationales }` where `score` is the **median** of the vote scores (3 votes → middle value) and `rationales` is the array of written justifications. Pure; unit-tested with fixture votes (zero tokens).
- The **vote producer is injected**: `judgeDimension(dimension, artifacts) → { score, rationale }`. The live phase wires this to **3 real judge-agent invocations** per dimension, each reading the generated artifacts (component source, stories, docs, tests) and the oracle reference, scoring against a shared written rubric. Median of 3 dampens run-to-run variance.
- `workbench/oracle/rubric.md` holds the per-dimension scoring criteria so every judge invocation is consistent and the scores are interpretable.

The judge agents are spawned with the Agent tool during the operator-driven live phase; **no judge tokens are spent in the fixture-tested build phase**.

## 4. Metrics — lightweight, pure, zero-dep (with live override)

`workbench/oracle/metrics/*.mjs` are pure functions over artifact strings/contents:
- **size/LOC** — line and non-blank-line counts; transpiled char-length as a size proxy.
- **complexity proxy** — count of branch keywords (`if`, `for`, `while`, `case`, `&&`, `||`, `?`, `catch`) as a cyclomatic stand-in (documented as a proxy, not real CC).
- **type/prop/export presence** — regex/heuristic counts.
- **test/story counts** — count of `test(`/`it(`/`describe(` and `export const`/`Story` patterns.
- **docs presence** — file existence + word count + prop-table heuristic.

These are the fixture-testable default. Where the live phase wants *real* numbers (tsc pass, coverage %, bundler size), those are **injected** from the target's own toolchain, overriding the heuristic — same injection seam as the gate runner.

## 5. Data contract (pure addition)

Each run row keeps `accuracy` (Fidelity) and gains a sibling `quality`:
```jsonc
"quality": {
  "composite": 0,
  "dimensions": {
    "optimizedCode": { "score": 0, "metric": 0, "judge": { "score": 0, "rationales": [] } },
    "dx":            { "score": 0, "metric": 0, "judge": { "score": 0, "rationales": [] } },
    "docs":          { "score": 0, "metric": 0, "judge": { "score": 0, "rationales": [] } },
    "testDepth":     { "score": 0, "metric": 0, "judge": { "score": 0, "rationales": [] } },
    "storybook":     { "score": 0, "metric": 0, "judge": { "score": 0, "rationales": [] } }
  },
  "weights": { "optimizedCode": 0.25, "dx": 0.20, "docs": 0.15, "testDepth": 0.25, "storybook": 0.15 }
}
```
`score-component.mjs` is extended (or wrapped by a `score-both.mjs`) to return `{ fidelity, quality }`. The trialset gains `qualityByRung` alongside `accuracyByRung`.

## 6. Report + aggregator extension

- `analyze/aggregate-trialset.mjs` — also collect each rung's `quality.composite` into `qualityByRung`, and (optionally) per-dimension medians across rungs.
- `report/markdown.mjs` `renderTrialsetMarkdown` — add a **Quality by rung** table (composite + 5 dimensions) below the Fidelity ladder; surface judge rationales in a collapsible/footnote form.
- `report/dashboard.mjs` `renderTrialsetDashboard` — add a quality-by-rung bar chart next to the accuracy chart.
- All additions are append-only; single-run renderers and Plan 2 tests are untouched.

## 7. Components & boundaries

| Unit | Responsibility | Depends on | Fixture-testable now? |
| --- | --- | --- | --- |
| `oracle/metrics/code.mjs` | size/LOC/complexity/import metrics | — | **yes** |
| `oracle/metrics/surface.mjs` | type/prop/export/test/story/docs counts | — | **yes** |
| `oracle/judge.mjs` | `judgePanel` median + rationales | — | **yes** |
| `oracle/quality/*.mjs` | 5 dimension scorers (metric+judge blend) | metrics, judge | **yes** |
| `oracle/quality-score.mjs` | Quality composite from 5 dims | quality dims | **yes** |
| `oracle/score-both.mjs` | `{ fidelity, quality }` for a component | Plan 2 score-component + quality-score | **yes** (injected judge/metrics) |
| `analyze/aggregate-trialset.mjs` (extend) | add `qualityByRung` | run rows | **yes** |
| `report/*` (extend) | Quality scorecard table + chart | trialset | **yes** |
| live judge wiring | spawn 3 judge agents per dimension | Agent tool, rubric.md | no (live) |

Everything except the live judge wiring is built TDD against fixtures with no token spend.

## 8. New dependency

**None.** Metrics are pure; judge agents use the Agent tool during the live phase; Playwright (dev-only, Plan 2) is still the only added dep and remains deferred to the live phase.

## 9. Live-trial flow (updated)

1. Scaffold a fresh empty React + Tailwind v4 example at `workbench/trials/<trialId>/target/`; `/init-figma-compose` against it (designSystem=none, methodology=atomic); add `workbench/**` to `writeScope.allowedDirs`.
2. Clone `heroui-inc/heroui@v3` read-only as the oracle reference.
3. Discovery: confirm the 7 ladder node IDs from the HeroUI Figma (`0:1` cover, `10:1849` icons).
4. Capture the Fidelity oracle bundles (Storybook for component rungs, Figma for template/page).
5. Start the Plan 1 receiver; export telemetry env; run the 9 invocations (one trial dir each).
6. Per run: `buildResults` → single-run `results.json`; score **Fidelity** (`score-component`) and **Quality** (`score-both`, spawning the 3-vote judge panel per dimension against `rubric.md`); write both into the run row.
7. `aggregate-trialset` → `trialset.json` (now with `qualityByRung`) → `build-report` → `report.md` + `dashboard.html` with both scorecards.

Operator-driven; `RUNBOOK-live.md` is updated with the Quality-scoring + judge-panel steps.

## 10. Open questions for the plan

- Judge artifact bundle: exactly which files go to the judge per dimension (component + stories + tests + docs) and how the oracle reference is presented to it (HeroUI source snippet vs just screenshot) — resolve in the plan.
- Coverage % source for `testDepth` metric: target's own coverage run (injected) vs assertion-count heuristic default — plan picks the default.
- Whether `score-both.mjs` replaces or wraps Plan 2's `score-component.mjs` (lean: wrap, to keep Plan 2 tests untouched).
- Median of an even vote count (if a judge agent fails and only 2 votes return) — define the tie/median rule in `judge.mjs` (e.g. average of the two middle values).
