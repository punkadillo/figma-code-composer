# Plan 2 — Accuracy Oracle + HeroUI Live Trial — Design Spec

- **Date:** 2026-06-02
- **Status:** Approved (brainstorming) — pending implementation plan
- **Builds on:** `docs/superpowers/specs/2026-06-02-figma-agent-workbench-design.md` (§8 accuracy, §11 live trial) and the completed Plan 1 telemetry harness (`docs/superpowers/plans/2026-06-02-workbench-telemetry-harness.md`).
- **Topic:** Build the accuracy-scoring oracle + multi-run aggregation that fills the `accuracy: null` reserved by Plan 1, then run a ~9-run live trial of the figma-pipeline agents against the HeroUI v3 design, and regenerate the report with real token/time/fan-in/accuracy numbers.

---

## 1. Goal

Complete the workbench by (a) building the accuracy subsystem and trialset aggregator the Plan 1 report reserved space for, and (b) executing a live trial that produces the first real measured report across a 7-rung complexity ladder.

Decisions locked during brainstorming:
- **Oracle = hybrid.** Component rungs (icon/atom/molecule/organism) are scored against HeroUI's own Storybook render; template/page rungs against the Figma node screenshot.
- **Run scope = ~9 live runs.** 7 ladder rungs cold + 1 rung re-built warm + 1 rung updated.
- **Generation mode = from scratch (atomic).** Agents synthesize React + Tailwind v4 with no `@heroui/react` imports, so accuracy is a real fidelity gradient.
- **Model tier = auto-routed by complexity** (realistic), annotated per run.

## 2. Target & workspace

| Role | Concretely | Access |
| --- | --- | --- |
| **Reference / oracle** | clone of `heroui-inc/heroui@v3` — its Storybook (`packages/storybook`, 90 components each with `*.stories.tsx`) and the HeroUI Figma Kit (fileKey `JoSiX3iGngB9rlOkHX7vRH`) | read-only |
| **Write-target** | fresh scratch React + Tailwind v4 app at `workbench/trials/<trialId>/target/` | pipeline writes generated components here |
| **Telemetry** | the Plan 1 harness, unchanged | one trial dir per run |

Config written by `/init-figma-compose`: `framework=react`, `cssSystem=tailwind-v4`, `designSystem=none`, `designMethodology=atomic`. (HeroUI may or may not be a wired design system; irrelevant because we chose atomic/from-scratch.) `workbench/**` must be in `config.writeScope.allowedDirs`.

The Figma file is a **single composed marketing cover** (hero scene: dot-grid art, ~50 decorative Chips, Buttons, an Input, a Tooltip, a Theme switch, Cards, a Logo) plus a separate **Icons** page — NOT a component gallery. The ladder therefore draws atoms/molecules/organisms from elements *within* the cover, template/page from cover sub-sections and the whole cover, and icons from the Icons page.

## 3. Ladder → Figma node mapping (discovery, not hardcoded)

A **discovery step** drills the cover frame tree (`get_metadata` on page `0:1`) and the Icons page (`10:1849`), and proposes one node per rung. The operator confirms node IDs before the runs. Seed mapping:

| # | Rung | Complexity tier | Seed source | Icon axis |
| --- | --- | --- | --- | --- |
| 1 | icon-only | trivial | a node on the **Icons** page (`10:1849`) | — |
| 2 | atom | trivial/moderate | Button within the cover | no-icon |
| 3 | molecule | moderate | Input (or Chip + label) | no-icon |
| 4 | organism | complex | Card / Tooltip / Theme-switch composite | no-icon control |
| 5 | template | complex | a composed cover sub-section (panel) | — |
| 6 | page | extreme | the whole **Cover** | — |
| 7 | all + icons | complex | rung 4 (or 5) rebuilt WITH icons | icon pair vs rung-4 control |

Rungs 4 and 7 form the **icon fan-in pair** (same composite, without vs with icons) that the Plan 1 `fanInBlocking` analyzer measures.

## 4. Oracle capture (hybrid)

`workbench/oracle/capture.mjs` produces, per rung, a reference bundle `{ screenshotPath, computedStyle, dom }`:

- **Component rungs (1–4):** start HeroUI's Storybook locally (`pnpm --filter @heroui/storybook ...`) or query the connected `storybook-sb-mcp`; Playwright loads the matching story iframe and captures screenshot + `getComputedStyle` of the root + `outerHTML`.
- **Template/page rungs (5–6):** `mcp__figma__get_screenshot` of the Figma node (visual oracle) + `mcp__figma__get_variable_defs` for the style-token reference (no Storybook equivalent exists).

`workbench/oracle/render-generated.mjs` does the same capture against the generated component in the scratch target (a minimal Storybook or Vite page Playwright drives). Capture is the only part that needs live services; it is thin and IO-only.

## 5. Four scorers → composite accuracy

Each is a pure-ish function over a `{ generated, oracle }` bundle (spec §8). Composite written into each run's `results.json` run row, replacing the Plan 1 `accuracy: null`.

| Module | Dimension | Method | Output |
| --- | --- | --- | --- |
| `oracle/score-visual.mjs` | visual | pixel/structural diff of the two screenshots (pixelmatch-style over decoded PNG buffers) | `diffPct` (0–100, lower better) → `score` |
| `oracle/score-style.mjs` | computed-style | compare resolved color/spacing/typography/radius properties | per-property `matchRate` |
| `oracle/score-structural.mjs` | structural | compare DOM tag/role/ARIA tree + exposed prop/variant surface | `structuralScore` |
| `oracle/score-gates.mjs` | gates | typecheck, build, generated unit tests, a11y scan — pass/fail each | `{ typecheck, build, tests, a11y }` |
| `oracle/score.mjs` | composite | weighted blend (default visual 0.35 / style 0.30 / structural 0.20 / gates 0.15); a failed `build` gate caps composite at a configurable ceiling (default 20) | `accuracy: { composite, visual, style, structural, gates, weights }` |

Weights live in a small `workbench/oracle/weights.json` so they are tunable without code edits.

Per-rung accuracy is expected to **degrade up the ladder** (atom near-perfect, page lowest) — that gradient is itself a headline result.

## 6. Trialset aggregation + report extension

The ~9 runs each emit a single-run `results.json` (Plan 1's `buildResults`, whose multi-run guard stays intact). `workbench/analyze/aggregate-trialset.mjs` merges them into one `trialset.json`:

- cross-rung **complexity-tier dominance** (which agent dominates tokens/time at each tier),
- **icon fan-in** comparison (rung 7 with-icons vs rung 4 control),
- **cold vs warm** delta (the warm re-run vs its cold build),
- **build vs update** delta (the update run vs its build),
- **accuracy scorecard** by rung (composite + per-dimension),
- the OTEL↔costs.jsonl cross-check rolled across runs.

Report renderers (`report/markdown.mjs`, `report/dashboard.mjs`) gain an **Accuracy** section (the Plan 1 placeholder goes live) and a **per-rung ladder** table/chart; `report/build-report.mjs` learns to take a `trialset.json`. The dashboard adds an accuracy-by-rung chart and a cold/warm + build/update comparison.

## 7. Live-trial execution flow (~9 runs)

1. Clone `heroui-inc/heroui@v3` into a read-only reference dir.
2. `/init-figma-compose` against `workbench/trials/<trialId>/target/` (react / tailwind-v4 / atomic); add `workbench/**` to `writeScope.allowedDirs`.
3. Discovery: drill the cover + Icons page; confirm the 7 ladder node IDs.
4. Capture the oracle bundles (Storybook for 1–4, Figma for 5–6).
5. Start the Plan 1 OTLP receiver; export the telemetry env.
6. Run the 9 invocations, **one trial dir each**: 7 cold `/figma-build <node>` across the ladder, 1 warm re-build of a chosen rung, 1 `/figma-update` of a chosen rung. Snapshot each run's `costs.jsonl`.
7. Per run: `buildResults` → single-run `results.json`.
8. Score each generated component against its oracle bundle → fill `accuracy`.
9. `aggregate-trialset` → `trialset.json` → `build-report` → `report.md` + `dashboard.html` under `workbench/reports/<trialId>/`.

Slash commands are operator-driven (a runbook drives steps 5–6), since Claude Code slash commands cannot be shell-spawned.

## 8. Components & boundaries

| Unit | Responsibility | Depends on | Fixture-testable now? |
| --- | --- | --- | --- |
| `oracle/capture.mjs` | reference bundle from Storybook / Figma | Playwright, storybook-sb-mcp, figma MCP | no (live) |
| `oracle/render-generated.mjs` | bundle from the scratch target | Playwright | no (live) |
| `oracle/score-visual.mjs` | screenshot diff | PNG decode | **yes** |
| `oracle/score-style.mjs` | computed-style match | — | **yes** |
| `oracle/score-structural.mjs` | DOM/ARIA/prop match | — | **yes** |
| `oracle/score-gates.mjs` | build/test/a11y gates | target toolchain | partial (mock cmd results) |
| `oracle/score.mjs` | composite + weights | the four scorers | **yes** |
| `analyze/aggregate-trialset.mjs` | merge N runs → trialset | Plan 1 result shape | **yes** |
| `report/*` extensions | accuracy + ladder views | trialset | **yes** |

The scorers, composite, aggregator, and report extensions are built TDD against recorded fixtures (no live services). Capture + the 9 live runs are the operator-driven phase.

## 9. New dependency

**Playwright** (dev-only) — the one exception to the harness's zero-runtime-deps rule. Required for screenshot + computed-style + DOM capture of both the generated target and HeroUI's Storybook. Added to `devDependencies`; not shipped (workbench is outside `package.json#files`).

## 10. Open questions for the plan

- PNG-diff approach: vendor a tiny pixelmatch implementation vs add a dep — prefer a minimal self-contained diff over decoded buffers to stay near zero-dep (Playwright already pulls in image handling).
- Exact storybook-sb-mcp capabilities for headless story enumeration/screenshot vs driving Storybook with Playwright directly — resolve at capture-build time.
- a11y gate tool (axe-core vs the pipeline's `a11y-audit` skill) — pick in the plan.
- Whether rung 7 reuses rung 4's node with an icon variant or a distinct cover element — confirm during discovery.
