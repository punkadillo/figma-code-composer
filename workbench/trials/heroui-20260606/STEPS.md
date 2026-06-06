# heroui-20260606 — live trial run steps

> Validates the agent redesign (think-once `buildPlan`, MCP-subprocess ban, full-variable token fetch +
> 3-layer token-builder, intent-based layer classification, opportunistic Brevit) against the
> `heroui-20260603` baseline. Ladder selected in
> `workbench/docs/2026-06-06-heroui-trial-component-selection-review.md`.
> Figma kit: `qGjFwr9ZWpLk8xsgskwEHe` · Oracle: heroui `v3` @ `bf7e58f`.

Keep this open beside your terminals. Two terminals, repo root:
`/Users/allan/Projects/figma-to-code-orchestration`

## Mental model
- **Terminal B is the conductor.** `run-one` starts the OTLP receiver, prints ONE slash command, and waits.
- **The Claude session (Terminal A) is a passive executor.** It does NOTHING on its own. You paste one
  command, it runs that single command, prints ✅, then waits.

> ⚠️ The first thing you type into the new Claude session is a STAND-BY instruction — NOT "resume the
> trial" (that makes Claude auto-run builds, which is wrong here).

---

## Step 0 — One-time prerequisites (do once before the first run)

1. **Build the oracle Storybook** (only needed for the `--render` visual/style pass; structural + quality +
   gates do not need it):
   ```bash
   cd workbench/trials/heroui-20260606/ref-heroui && pnpm install && pnpm --filter @heroui/storybook build-storybook && cd -
   ```
   (Skip if you are scoring source-fidelity + quality only.)
2. **Confirm the target shell builds clean** (it was reset to an empty shell with `node_modules` preserved):
   ```bash
   cd workbench/trials/heroui-20260606/target && npm run build && cd -
   ```
   Expect a green `tsc -b && vite build`. If it fails, the agents still build into it — but a clean baseline
   should compile.
3. **Confirm Figma MCP reachability** for the kit `qGjFwr9ZWpLk8xsgskwEHe` (the wizard's `config.figma`
   stamp covers init; the fetcher re-probes live as Protocol step 1).

## Step 1 — Quit any old session
`/exit`

## Step 2 — Open TWO terminals; in EACH:
> Use a **normal interactive terminal tab** (node via nvm, claude in ~/.local/bin — both need your
> ~/.zshrc). `source` and `claude` must run in the **same shell instance**.
```bash
cd /Users/allan/Projects/figma-to-code-orchestration
source workbench/trials/heroui-20260606/resume-trial.sh
```
Both must print `✔ OTEL telemetry env complete (12 vars set)`. If not, fix before continuing.

## Step 3 — Terminal A: launch Claude
```bash
claude
```
Paste this EXACT message as the first input (this prevents auto-start):

> Stand by for the heroui-20260606 live trial. Do NOT run any figma command, build, or tool on your own.
> I will paste one slash command at a time from the run-one conductor. When I paste one, run exactly that
> single command once, then stop and wait for the next. Acknowledge and wait.

Wait for the acknowledgement. It must NOT run anything.

## Step 4 — Terminal B: start run #1
```bash
node workbench/runner/run-one.mjs workbench/trials/heroui-20260606 icon-only
```
It boots the receiver and prints a slash command + "press Enter when Claude prints ✅".

## Step 5 — Loop, one runId at a time
For the current run:
1. Copy the slash command Terminal B printed → paste into Terminal A. Wait for ✅.
2. **Capture the fetched manifest for the scorability guard:** after the build, copy the figma manifest into
   the run dir so the producer can read `reachabilityStatus`:
   ```bash
   cp /tmp/figma-*/manifest.json workbench/trials/heroui-20260606/<runId>/figma-manifest.json
   ```
   (A run whose manifest lacks `reachabilityStatus: "ok"` — or whose scratch shows `contract.json` /
   `mcp-probe.sh` / a 0-byte `fetcher-output.txt` — is treated as a FAILED trial and is not scored.)
3. Back in Terminal B: press **Enter**. It stamps `run-manifest.json`, waits ~8s for the OTEL flush, stops
   the receiver, prints capture counts (events/metrics/spans must be **non-zero**).
4. Start the next run in Terminal B:
   ```bash
   node workbench/runner/run-one.mjs workbench/trials/heroui-20260606 <runId>
   ```

runIds IN THIS EXACT ORDER (cold must precede warm + update — they form the comparison pairs):
```
icon-only  tokens  atom  chip  molecule-cold  switch  organism  all-icons  tabs  template  extreme  molecule-warm  molecule-update
```

| runId            | command        | node         | name            | tier     |
|------------------|----------------|--------------|-----------------|----------|
| icon-only        | /figma-icons   | 13354:830    | check icon      | trivial  |
| tokens           | /figma-tokens  | 0:1          | design tokens   | moderate |
| atom             | /figma-build   | 5375:69211   | Button          | trivial  |
| chip             | /figma-build   | 5375:71211   | Chip            | trivial  |
| molecule-cold    | /figma-build   | 17293:26222  | Input           | moderate |
| switch           | /figma-build   | 5375:71127   | Switch          | moderate |
| organism         | /figma-build   | 5375:72791   | Card            | complex  |
| all-icons        | /figma-build   | 5375:72355   | Alert           | complex  |
| tabs             | /figma-build   | 5375:79785   | Tabs            | complex  |
| template         | /figma-build   | 4672:32646   | Dashboard demo  | complex  |
| extreme          | /figma-build   | 5375:71626   | Calendar        | extreme  |
| molecule-warm    | /figma-build   | 17293:26222  | Input (warm)    | moderate |
| molecule-update  | /figma-update  | 17293:26222  | Input (update)  | moderate |

(Exact slash-command string is whatever `run-one` prints — paste that, don't hand-type.)

## Step 6 — Reconcile target paths, then score

Before scoring, the intent-based classifier decides where each component lands, so **reconcile
`workbench/oracle/rung-map.mjs` `targetTsx` to the actual build output**:
```bash
for c in Button Chip Input Switch Card Alert Tabs Calendar Dashboard; do
  find workbench/trials/heroui-20260606/target/src/components -path "*/$c/$c.tsx";
done
```
Update any `targetTsx` that differs from the prediction.

Then, in Terminal A, tell Claude: **"All runs captured — score and aggregate."** Claude:
1. builds per-run `results.json` (`workbench/analyze/build-results.mjs` — now threads `reachabilityStatus`),
2. scores fidelity (`run-accuracy.mjs` — gated by `isScorableTrial`; degraded runs are skipped) + quality
   (3-vote judge panels) against the oracle (`ref-heroui` source + `*.stories.tsx` + `packages/styles`),
3. aggregates → `trialset.json`, renders `report.md` + dashboard.
   `export TRIAL=workbench/trials/heroui-20260606` is set by `resume-trial.sh`.

## Review criteria (unchanged) + new measurables
- **Accuracy** (visual/style/struct/gates), **Quality** (5-dim judge), **Build gates**, **Tokens-per-agent** —
  same rubric as `heroui-20260603`. Generated code reviewed against the hero-ui `v3` repo.
- **NEW:** `tokens` rung — `semantic.css` non-empty + aliases primitives? token count vs oracle's ~87? both
  light+dark modes emitted? · stateful `switch`/`molecule` ship `"use client"`? · `organism`/`tabs` use
  compound/discriminated APIs (not prop-bags)? · `template` think-once token cost vs the `all-icons`
  baseline · **cross-trial:** tokens-per-agent vs `heroui-20260603` (the ~80% target).

---

## Quick reference
|            | Terminal A (Claude)            | Terminal B (conductor)            |
|------------|--------------------------------|-----------------------------------|
| Role       | Passive executor               | Drives `run-one`, owns receiver   |
| You do     | Paste the one command, wait ✅ | Run `run-one`, press Enter after ✅|
| Per run    | 1 paste + copy figma-manifest  | 1 command + 1 Enter               |

## Troubleshooting
- `run-one` aborts "env incomplete" → that terminal wasn't sourced (Step 2).
- Capture counts = 0 → Claude in Terminal A wasn't launched from the sourced shell; redo Steps 2–3 for A.
- Accuracy scoring throws "TRIAL dir not found" → `export TRIAL=workbench/trials/heroui-20260606`.
- A rung shows `accuracy.unscorable` → its run was degraded (no `reachabilityStatus: ok`); re-run that node.
- Claude starts doing things on its own → it skipped the stand-by message; re-send the Step 3 message verbatim.
