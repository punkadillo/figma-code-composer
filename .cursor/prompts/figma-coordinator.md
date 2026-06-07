# Cursor figma-coordinator prompt

When Cursor needs to act as the coordinator, follow `.claude/agents/figma-coordinator.md` verbatim — the protocol, write scope, error handling, and report format apply identically.

Cursor deltas:

- No `Agent` tool. Run each specialist agent inline in a single conversation thread, including its agent file as the system prompt for the segment. **Never try to spawn a specialist (or yourself) as a separate model-pinned agent** — on the Free plan that aborts the run with `Named models unavailable — Free plans can only use Auto` before any work happens. Inline on the current model is the only path (see `model-preference.mdc`, `pipeline-roles.mdc`).
- **Never invoke `claude`, `claude --agent`, or any CLI that re-enters Claude Code from Bash.** Specialists run ONLY inline (Cursor) or via the `Agent` tool (Claude Code). (A subprocess has no MCP tools in scope and gets killed by any `timeout` wrapper — this was the proven cause of a fully wasted trial run.)
- Use Cursor's MCP server entries (configured via Cursor settings) for `figma:*` tool calls.
- **Pre-flight framework-setup check (Pre-flight 1.5, applies identically).** Read `config.setup` (wizard Step 7.6 / Cursor Step 11.56). For every enabled track, confirm its artifact exists on disk (Tailwind entry CSS `@import`, unit-runner config + e2e exclusion, `playwright.config` + browsers, `.storybook/`). Missing or `config.setup.pending[]` non-empty → **abort at pre-flight** (zero specialists run): `"Framework setup incomplete — run /init-figma-compose to finish setup, then retry."` A clean pre-flight stop, never a half-built tree mid-run. Absent `config.setup` (older scaffold) → warn + proceed.
- **MCP reachability:** the Claude tool-split (coordinator has no MCP tools, only the fetcher does) does NOT apply — Cursor runs inline in one thread that has the Figma MCP tools. So: confirm `config.figma.mcpVerifiedAt` is stamped (else abort, "run /init-figma-compose"), then as the first action of the inline fetch role call `get_metadata` once (retry the alternate `mcp__plugin_figma_figma__` prefix on `unknown tool`). Both fail → abort with `"Figma MCP unreachable. Re-run /init-figma-compose, or restart your MCP server / Figma desktop app, then retry."` Never skip straight to the fetch without this probe.
- **`No such tool available` (MCP not in scope):** HARD ABORT code 3. Do NOT retry, do NOT shell out to a CLI. Surface verbatim. (Mirrors the new error-classification row in `.claude/agents/figma-coordinator.md`.)
- **Cost ledger (`costs.jsonl`) does NOT apply.** The Claude coordinator writes one cost line per `Agent` spawn from the harness's per-spawn `total_tokens`. Cursor runs everything inline in one thread with no sub-spawns, so there's no per-specialist token total to observe — do **not** write `costs.jsonl` and do **not** fabricate per-role numbers you can't measure. The handover's Cost section degrades gracefully ("No per-specialist cost ledger found").

## Complexity routing — Cursor specifics

The coordinator's routing table resolves each tier to an abstract size (`sm` / `md` / `lg`). **Cursor agents inherit the user's currently-selected model from the Cursor settings UI; there is no per-call model override.**

What this means in practice:

| Tier      | Abstract size | What changes in Cursor                                       |
| --------- | ------------- | ------------------------------------------------------------ |
| trivial   | `sm`          | Skill set narrowed; model unchanged                          |
| moderate  | `md`          | Skill set partial; model unchanged                           |
| complex   | `lg`          | Full skill set; model unchanged                              |
| extreme   | `lg`          | Full skill set + final `code-reviewer` pass; model unchanged |

**The skill-set, second-pass-review, KG-query, KG-merge, and handover behaviors all apply identically to Cursor** — only the model column is a no-op.

The coordinator MUST surface the recommended size as a chat prefix so the user can switch model if they want:

```
[fcc routing] tier=complex, recommended size=lg (e.g. Claude Opus 4.7).
Current Cursor model will be used — switch in Settings → Models if you want a different size.
```

This prefix appears before any specialist is invoked. Do not block on the user's response — proceed with the current model.

## Step 4.5 — Cold-start inventory + reuse signal (Cursor delta)

Applies identically to Cursor (it runs inline in the one thread). Before routing or planning, take one read-only pass and write `/tmp/figma-<runId>/inventory.json`:

- **Existing assets** — glob component/icon/token dirs; record reusable on-disk icons (e.g. house `CheckIcon`), token files, component names.
- **Real token naming** — parse on-disk token files for the actual prefix + names (real `--accent`, never a guessed `--accent-accent`).
- **Figma↔disk token delta** — diff manifest-needed Figma-bound tokens against on-disk tokens; schedule a token-builder delta for the missing ones BEFORE the component build (so `hover:`/`disabled:` classes resolve).
- **House style** — inspect 1–2 existing components: class-composition (`cva` vs `cn` filter-join vs `tailwind-merge`), prefix, ref style, quote style, `"use client"` discipline. Pass as a directive — builders execute it, never re-infer it.
- **Reuse ratio** — disk-based `tokenReuseRatio`; same signal that decides token-builder skip.

**Routing (Step 5): overwrite `manifest.complexity.signals.tokenReuseRatio` with this real ratio, then re-run score+tier per `protocols/complexity.md` before applying `tierOverrides`.** The fetcher's `tokenReuseRatio: 0` is a placeholder — using it raw fires the false `reusePenalty` +15 and over-tiers every component (it tipped Tabs complex→extreme on a KG-off artifact).

## Step 9 — re-pass configSnapshot + token delta (Cursor delta)

- Dispatch the Step 4.5 `tokenDelta[]` (a token-builder delta for missing-on-disk bound tokens) first.
- **Re-pass the frozen `configSnapshot` in EVERY inline builder role — including follow-up/fix passes** (e.g. the extreme-tier a11y-fix after `code-reviewer`). Omitting it makes the role infer config from the project name and return a wrong `configSnapshotEcho` (`custom/heroui` vs `flat/none`), defeating the tamper-check.

## Step 8.5 — Think-once buildPlan (Cursor delta)

Step 8.5 applies identically to Cursor: before dispatching any builder, produce the full `buildPlan`
for every scheduled component and icon (see `protocols/figma-manifest.md` § buildPlan for the schema:
`resolvedLayer`, `layerConfidence`, `apiShape`, `renderMode`, `requiredA11y`, `tokenBindings`,
`unboundDecision`, `dropPolicy`, `compose`, plus the Step 4.5–derived `houseStyle`, `tokenNaming` (real
on-disk token names), and `existingAssets`). Write the canonical JSON to
`/tmp/figma-<runId>/build-plan.json`.

Cursor delta: **no sub-spawn cost ledger**, but Step 8.5 reasoning still executes inline in the same
thread. The buildPlan is the output of that inline reasoning pass — builders (also inline) receive only
their directive entry, not the full plan.

## Step 9 dispatch — Brevit-encoded directive slices (Cursor delta)

After the think-once pass, for each component/icon to build:
1. Build the per-component slice (manifest slice + its `buildPlan` entry + `adapterExcerpts`) and write
   it to `/tmp/figma-<runId>/slice-<name>.json` (canonical JSON).
2. Run `fcc brevit:encode /tmp/figma-<runId>/slice-<name>.json` via Cursor's terminal. `fcc brevit:encode`
   emits Brevit wire form ONLY when it round-trips AND is smaller than the JSON, else the raw JSON
   (`protocols/brevit.md` — opportunistic + size-guarded, never inflates, never loses a variable path).
3. Inject the encoded (or raw-JSON fallback) into the inline builder context. Builders read whichever
   form they receive; the canonical JSON slice stays on disk.

## KG / handover CLI calls

These work identically under Cursor because they're plain shell — `npx fcc kg:query`, `npx fcc kg:stage`, `npx fcc kg:merge`, `npx fcc handover` all run via Cursor's terminal-execution capability. Same exit codes apply.

The pipeline is invoked via the slash commands mirrored in `.cursor/prompts/commands/`.
