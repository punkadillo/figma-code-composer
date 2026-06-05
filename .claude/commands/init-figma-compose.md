---
description: Configure the figma-to-code orchestration scaffold in this project. Runs the wizard, writes .figma-pipeline/config.json, verifies Figma MCP, optionally registers /graphify, and emits the derived write allowlist.
argument-hint: "[--re-detect]"
---

# /init-figma-compose — figma-pipeline setup wizard

(Renamed from `/init` so it doesn't shadow Claude Code's built-in `/init`. Trigger phrases: `/init-figma-compose`, "set up figma-pipeline", "configure the pipeline", "run the figma wizard".)

**Before running this:** complete `README § Prerequisites` for your tool — at minimum the required Figma MCP setup, optionally Graphify. The wizard verifies these; it does not install them.

**Run the wizard INLINE in this (main) thread — do NOT spawn it as a subagent.** Follow `.claude/agents/wizard.md` as your step-by-step recipe and own every `AskUserQuestion` prompt yourself, here in the main conversation. Honour `$ARGUMENTS` (e.g. `--re-detect`). Rationale: the wizard is interactive and answer-dependent (each answer can change the next question). A spawned subagent that calls `AskUserQuestion` returns control to ask, and **cannot be resumed for the follow-up answers** (`SendMessage` to a returned subagent isn't available) — so a spawned wizard stalls after the first question. The main thread has no such limit. The **only** delegation is the read-only, non-interactive stack scan: spawn `project-detector` (it runs once and returns; nothing to resume).

The wizard recipe:

1. **Project identity** — asks for project name + one-line description.
2. **Figma MCP verify (hard gate)** — probes both namespaces (`mcp__figma__*` and `mcp__plugin_figma_figma__*`), records the working prefix in `config.figma.mcpToolNamespace`. **If MCP isn't reachable, the wizard aborts and points at `README § Prerequisites § Required — Figma MCP`** — no `config.json` is written. Result: every subsequent `/figma-build` starts with a known-good MCP.
3. **Stack detection** — spawns `project-detector` to identify framework + CSS system + relevant paths. User confirms or overrides.
4. **Design system OR methodology** — design system first; if `none`, then design methodology (atomic / feature-sliced / component-based / flat).
5. **CSS choice** — Tailwind v4/v3 / UnoCSS / vanilla CSS vars / CSS Modules / Sass / vanilla-extract / Panda / styled-components — with examples and a guided migration plan when the detected system differs.
6. **Paths + stories + tests + output-structure** — derived per stack, with confirmation prompts.
7. **Tools** — Claude Code / Cursor multi-select.
8. **Skills install/strip** — prunes canonical `.figma-pipeline/skills/` to the resolved install set and refreshes per-tool surfaces.
9. **Graphify detection (optional)** — `command -v graphify`; records status in `config.graphify`. Detect-only: never installs the binary, never runs `graphify install`, never builds the graph. If absent, surfaces a one-line pointer to `README § Prerequisites § Optional — Graphify`. Registration (`graphify install --platform <tool>`) and the build (`/graphify .`) are yours to run.
10. **Patch target `.gitignore`** — appends the scaffold-generated paths (`.figma-pipeline/config.json`, `graphify-out/`, `/tmp/figma-*/`) so consumers never accidentally commit local-only state. Idempotent.

Final output:

- `.figma-pipeline/config.json` — validated against `.figma-pipeline/config.schema.json`.
- `.mcp.json` — Figma MCP entry confirmed AND proven reachable.
- `.gitignore` — patched at the project root (idempotent).
- `graphify-out/` — **not** built by the wizard. Present only after the user types `/graphify .` in their assistant.
- Summary printed listing: project, framework + variant, CSS system, methodology, write allowlist, tools enabled, graphify status.

The wizard NEVER writes outside the default allowlist (`.figma-pipeline/**`, `.mcp.json`, `/tmp/**`, `.gitignore`, `graphify-out/`). The post-wizard allowlist takes effect only after step 7 confirms.

Do not edit any other file. Do not commit. Do not push.
