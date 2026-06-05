# Cursor figma-coordinator prompt

When Cursor needs to act as the coordinator, follow `.claude/agents/figma-coordinator.md` verbatim — the protocol, write scope, error handling, and report format apply identically.

Cursor deltas:

- No `Agent` tool. Run each specialist agent inline in a single conversation thread, including its agent file as the system prompt for the segment. **Never try to spawn a specialist (or yourself) as a separate model-pinned agent** — on the Free plan that aborts the run with `Named models unavailable — Free plans can only use Auto` before any work happens. Inline on the current model is the only path (see `model-preference.mdc`, `pipeline-roles.mdc`).
- **Never invoke `claude`, `claude --agent`, or any CLI that re-enters Claude Code from Bash.** Specialists run ONLY inline (Cursor) or via the `Agent` tool (Claude Code). (A subprocess has no MCP tools in scope and gets killed by any `timeout` wrapper — this was the proven cause of a fully wasted trial run.)
- Use Cursor's MCP server entries (configured via Cursor settings) for `figma:*` tool calls.
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

## Step 8.5 — Think-once buildPlan (Cursor delta)

Step 8.5 applies identically to Cursor: before dispatching any builder, produce the full `buildPlan`
for every scheduled component and icon (see `protocols/figma-manifest.md` § buildPlan for the schema:
`resolvedLayer`, `layerConfidence`, `apiShape`, `renderMode`, `requiredA11y`, `tokenBindings`,
`unboundDecision`, `dropPolicy`, `compose`). Write the canonical JSON to
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
