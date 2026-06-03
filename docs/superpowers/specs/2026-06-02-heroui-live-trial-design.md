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
| **Reference / oracle** | clone of `heroui-inc/heroui@v3` — its Storybook (`packages/storybook`, 87 components each with `*.stories.tsx`) and the **HeroUI Figma Kit V3 (Community)**, fileKey **`qGjFwr9ZWpLk8xsgskwEHe`** | read-only |
| **Write-target** | fresh scratch React + Tailwind v4 app at `workbench/trials/<trialId>/target/` | pipeline writes generated components here |
| **Telemetry** | the Plan 1 harness, unchanged | one trial dir per run |

Config written by `/init-figma-compose`: `framework=react`, `cssSystem=tailwind-v4`, `designSystem=none`, `designMethodology=atomic`. (HeroUI may or may not be a wired design system; irrelevant because we chose atomic/from-scratch.) `workbench/**` must be in `config.writeScope.allowedDirs`.

> **Figma file updated 2026-06-03.** The trial now uses the **HeroUI Figma Kit V3** file (`qGjFwr9ZWpLk8xsgskwEHe`), which supersedes the earlier community kit (`JoSiX3iGngB9rlOkHX7vRH`). Unlike the old single-cover kit, V3 is a **proper component library**: one top-level page per component (Button `5375:69211`, Card `5375:72791`, Input `17293:26222`, Alert `5375:72355`, Tooltip, Modal, Tabs, …), plus a **Cover** page (`2912:29668`), an **Icons** page (`2217:823`), and a **"Templates & Examples"** canvas (`4672:32615`) holding real composed screens (Form `14065:36430`, Calendar `14065:36403`, a full **mail** app page `18351:18784` at 1440×1024, a MacBook layout `18348:17007`). Component rungs draw from the per-component pages; **template/page rungs draw from the Templates & Examples canvas** per the user's direction.

## 3. Ladder → Figma node mapping (confirmed for V3, 2026-06-03)

Discovery drilled the V3 component pages, the Icons page (`2217:823`), and the Templates & Examples canvas (`4672:32615`). Locked node mapping for trial `heroui-20260603`:

| # | Rung | Complexity tier | V3 node | Source page | Icon axis |
| --- | --- | --- | --- | --- | --- |
| 1 | icon-only | trivial | `13354:830` (check icon) | Icons (`2217:823`) | — |
| 2 | atom | trivial | `5375:69211` (Button) | Button page | no-icon |
| 3 | molecule | moderate | `17293:26222` (Input) | Input page | no-icon |
| 4 | organism | complex | `5375:72791` (Card) | Card page | no-icon **control** |
| 5 | template | complex | `14065:36430` (Form) | Templates & Examples (`4672:32615`) | — |
| 6 | page | extreme | `18351:18784` (mail, 1440×1024) | Templates & Examples (`4672:32615`) | — |
| 7 | all + icons | complex | `5375:72355` (Alert) | Alert page | icon pair vs rung-4 control |

Rungs 4 and 7 form the **icon fan-in pair**: Card (rung 4, icon-free → `fanInBlocking` returns `[]` as the control) vs Alert (rung 7, status + close icons → icon-generator runs in parallel with component-builder). The Plan 1 `fanInBlocking` analyzer measures the gap on rung 7.

## 4. Oracle capture (hybrid)

`workbench/oracle/capture.mjs` produces, per rung, a reference bundle `{ screenshotPath, computedStyle, dom }`:

- **Component rungs (icon-only, atom, molecule, organism, all-icons):** start HeroUI's Storybook locally (`pnpm --filter @heroui/storybook ...`) or query the connected `storybook-sb-mcp`; Playwright loads the matching story iframe (Button, Input, Card, Alert, an icon) and captures screenshot + `getComputedStyle` of the root + `outerHTML`.
- **Template/page rungs (Form, mail page):** `mcp__figma__get_screenshot` of the Figma node from the Templates & Examples canvas (visual oracle) + `mcp__figma__get_variable_defs` for the style-token reference (no Storybook equivalent exists).

`workbench/oracle/render-generated.mjs` does the same capture against the generated component in the scratch target (a minimal Storybook or Vite page Playwright drives). Capture is the only part that needs live services; it is thin and IO-only.

## 5. Four scorers → composite accuracy

Each is a pure-ish function over a `{ generated, oracle }` bundle (spec §8). Composite written into each run's `results.json` run row, replacing the Plan 1 `accuracy: null`.

| Module | Dimension | Method | Output |
| --- | --- | --- | --- |
| `oracle/score-visual.mjs` | visual | pixel/structural diff of the two screenshots (pixelmatch-style over decoded PNG buffers) | `diffPct` (0–100, lower better) → `score` |
| `oracle/score-style.mjs` | computed-style | compare resolved color/spacing/typography/radius properties | per-property `matchRate` |
| `oracle/score-structural.mjs` | structural | compare DOM tag/role/ARIA tree + exposed prop/variant surface | `score` |
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
2. `/init-figma-compose` against `workbench/trials/<trialId>/target/` (react / tailwind-v4 / atomic); add `workbench/**` to `writeScope.allowedDirs`. Set `figma.defaultFileKeys = ["qGjFwr9ZWpLk8xsgskwEHe"]`.
3. Discovery: drill the V3 component pages, Icons page (`2217:823`), and Templates & Examples canvas (`4672:32615`); confirm the 7 ladder node IDs (see §3).
4. Capture the oracle bundles (Storybook for the component rungs, Figma for Form + mail-page rungs).
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
