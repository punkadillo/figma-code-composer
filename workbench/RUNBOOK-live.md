# HeroUI live trial runbook (Plans 2 + 3)

Prereq: `export FP_ALLOW_RESTRICTED_WRITE=1` in every shell that writes under `workbench/`.
Trial id below is `heroui-<date>`; create `workbench/trials/<trialId>/` and `workbench/reports/<trialId>/`.

## 1. Reference + target
- Clone the oracle (read-only): `git clone --depth 1 -b v3 https://github.com/heroui-inc/heroui workbench/trials/<trialId>/ref-heroui`
- Scaffold the write-target: a fresh React + Tailwind v4 app at `workbench/trials/<trialId>/target/`.
- `/init-figma-compose` against the target: framework=react, cssSystem=tailwind-v4, designSystem=none, methodology=atomic. Add `workbench/**` to `config.writeScope.allowedDirs`.

## 2. Confirm the ladder nodes (discovery)
- `mcp__figma__get_metadata` on pages `0:1` (cover) and `10:1849` (icons); pick one node per rung per `workbench/oracle/ladder.mjs` (LADDER). Record `{ rung -> nodeId }`.

## 3. Capture the oracle bundles
- Component rungs (icon-only/atom/molecule/organism/all-icons): start HeroUI Storybook (`pnpm --filter @heroui/storybook dev`) or use `storybook-sb-mcp`; capture screenshot+style+DOM of the matching story.
- Template/page rungs: `mcp__figma__get_screenshot` of the node (visual) + `mcp__figma__get_variable_defs` (style reference).
- Decode screenshots with `workbench/oracle/png.mjs` `decodePng` into the RGBA shape the visual scorer expects.

## 4. Start telemetry (Plan 1 harness)
- Export the OTEL env from `workbench/runner/env.mjs` `telemetryEnv` **before launching Claude Code** (see `workbench/RUNBOOK.md` step 2). It can't be set mid-session.

## 5. Run the 9 invocations — use the `run-one` wrapper (one command per run)
The 9 runIds + their nodes/scenario live in `workbench/trials/<trialId>/ladder-nodes.json`.
For each runId, in a separate terminal (Terminal B) run:

    node workbench/runner/run-one.mjs workbench/trials/<trialId> <runId>

It starts the receiver for that run dir, prints the exact `/figma-build`|`/figma-update`
slash command to paste into the Claude session, waits for you to press **Enter** when the
run completes (Claude prints ✅), then stamps `run-manifest.json`, waits ~8s for the OTEL
flush, stops the receiver, and prints capture counts. Then run it again with the next runId.

runIds in order: `icon-only atom molecule-cold organism template page all-icons molecule-warm molecule-update`
(`molecule-cold/warm/update` = the cold/warm + build/update comparison pair).

Manual fallback (no wrapper): `node workbench/collector/receiver.mjs workbench/trials/<trialId>/<runId> 4318`, run the slash command, Ctrl+C after ~8s, hand-write `run-manifest.json`.

Legacy notes — `workbench/runner/matrix.mjs` `defaultMatrix()` is the generic axis source:
- 7 cold `/figma-build <nodeId>` (icon-only, atom, molecule, organism, template, page, all-icons).
- 1 warm: re-run a chosen rung's `/figma-build` (cache populated) -> coldWarm pair.
- 1 update: `/figma-update <nodeId>` on a changed rung -> buildUpdate pair.
Snapshot each run's `/tmp/figma-<runId>/costs.jsonl` into `<runId>/costs/`. Note start/end ISO per run; write each `<runId>/run-manifest.json` (single run, with `rung` + `tier` on the run row).

## 6. Per-run results + scoring
- `node workbench/analyze/build-results.mjs workbench/trials/<trialId>/<runId> workbench/trials/<trialId>/<runId>/results.json`
- Render the generated component (`workbench/oracle/render-generated.mjs`) and score it: `scoreComponent({ generated, oracle }, { weights: weights.json, runGate })` -> write the result into that run's `results.json` run row `accuracy` field (replacing null). The `runGate` runs typecheck/build/test/a11y in the target dir.

## 6b. Quality scorecard (per run)
- Collect the generated artifacts for the rung: component source, `*.stories.tsx`, `*.test.tsx`, and the docs file.
- For each of the 5 dimensions (optimizedCode, dx, docs, testDepth, storybook), spawn a **3-vote judge panel**: 3 fresh judge agents, each given the artifacts + the HeroUI oracle reference + `workbench/oracle/rubric.md`, each returning `{ score, rationale }`. Wire them through `makeJudgeFor(deps, rubric)` from `workbench/oracle/judge-live.mjs`.
- Score the run with `scoreBoth(bundle, { fidelityWeights, runGate, qualityWeights: <oracle/quality-weights.json>, judgeFor, judgeVotes: 3 })`. Write the returned `{ fidelity, quality }` into the run row as `accuracy` (= fidelity) and `quality`.
- Deterministic metric overrides (optional): pass real tsc/coverage/bundler numbers into the metric layer instead of the heuristic defaults.

## 7. Aggregate + report
- `node workbench/analyze/aggregate-trialset.mjs workbench/reports/<trialId>/trialset.json workbench/trials/<trialId>/*/results.json --comparisons workbench/trials/<trialId>/comparisons.json` where `comparisons.json` names the iconFanIn / coldWarm / buildUpdate run ids.
- `npm run workbench:report -- workbench/reports/<trialId>/trialset.json`
- Open `workbench/reports/<trialId>/dashboard.html`; commit `report.md` + `trialset.json` (not the raw trial dumps or dashboard.html — already gitignored).
