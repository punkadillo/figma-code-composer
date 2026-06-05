# Cursor wizard prompt — `/init-figma-compose` mirror

When the user types `/init-figma-compose` (or asks to "set up figma-pipeline" / "configure the pipeline" / "run the figma wizard"), follow the protocol below — it is the Cursor mirror of `.claude/agents/wizard.md`. (Renamed from `/init` to avoid clashing with built-in `/init` commands.)

Read these first:

- `.figma-pipeline/config.schema.json` — binding contract for the output
- `.figma-pipeline/protocols/figma-manifest.md`
- `.figma-pipeline/protocols/token-strategy.md`
- `.figma-pipeline/protocols/component-layout.md`
- `.figma-pipeline/protocols/allowlist.md`

## Prompt cadence — ONE question at a time

Every prompt is a single chat question. Wait for the user's reply before posing the next one — even when a step lists multiple things to confirm. Each answer can affect what gets asked next (picking the Atomic DS skips the methodology question; high-confidence detector results skip their confirmation entirely). Never batch multiple questions into a single message.

Concretely: where a step describes multiple questions (`Q1` + `Q2` in Project identity, the four detection confirmations in Stack detection, etc.), issue **N separate chat prompts in sequence**. Multi-select (e.g., test tracks, tools) is one question phrased as "pick any of …" and accepts a comma-separated reply.

## Protocol (same as `.claude/agents/wizard.md`)

Steps:

1. **Pre-flight** — handle existing `.figma-pipeline/config.json`: ask overwrite vs incremental vs abort.
2. **Project identity** — ask `name`, wait for reply, then ask `description`. Two separate prompts.
3. **Figma MCP verify (HARD GATE)** — assume the user has already followed `README § Prerequisites § Required — Figma MCP` for Cursor (`/add-plugin figma` OR manual `mcp.json` paste in Settings → Tools & MCP). Run any low-cost MCP read (e.g., metadata) — try `mcp__figma__*` first, fall back to `mcp__plugin_figma_figma__*`. **If MCP is unreachable, abort before writing `config.json` with: "Figma MCP not configured. See README § Prerequisites for Cursor setup, then re-run."** Record `config.figma.mcpToolNamespace` with the working prefix. Per § Step 2 in `.claude/agents/wizard.md`. (Cursor does not expose programmatic auth — the user owns the install + sign-in via Prerequisites.)
4. **Stack detection** — invoke the `project-detector` workflow inline: run the `Glob`/`Read`/`Grep` checks listed in `.claude/agents/project-detector.md` § Detection rules. Then confirm with the user **one prompt at a time** (Q3a framework, Q3b language, Q3c CSS system, Q3d stories framework — skip any whose detected value was `confidence: high`). See `.claude/agents/wizard.md` § Step 3 for the exact sequence.
5. **Design system OR methodology** — ask design system first per `.claude/agents/wizard.md` § Step 3.5. If `none`, then ask design methodology. Picking a DS sets `designMethodology = "custom"` automatically (or `atomic` when DS=atomic).
6. **CSS choice** — present the CSS-system options per `.claude/agents/wizard.md` § Step 4.
7. **Derive paths** — ask the user to confirm or override the path defaults.
8. **Stories + Tests** — Storybook yes/no; unit-test framework (vitest/jest/karma); E2E enabled toggle (Playwright is set automatically — never asked). Per § Step 5.5.
8.5. **Output-structure details** — token file layout (split/combined/framework-native), prefix, naming; story layout; **unit-test layout AND E2E location (Q-e2e-location: co-located default / `e2e/` / `tests/e2e/` / custom)**; icon fill model + barrel. Skip questions whose values came back high-confidence from the detector — including **token prefix when the detector found an existing `--hk-`-style convention** (use it, don't impose a new one). Per § Step 5.6.
9. **Tools** — multi-select; toggle `tools.claudeCode` / `tools.cursor`.
10. **Compose + validate** — write `.figma-pipeline/config.json`; validate against the schema (use `npx ajv-cli validate` if available; else structural check).
11. **Install / strip skills** — apply the install + per-tool surface pass per `.figma-pipeline/protocols/skills.md` § _Resolution algorithm — Wizard (install phase)_:
    a. Prune canonical `.figma-pipeline/skills/<name>/` to the resolved install set via `fcc skills:prune --keep "<installSet>" --json` (the vetted, guarded command) — never a hand-authored `rm -rf` over a shell-expanded list. It refuses to run if the keep-set is empty or disjoint from on-disk (the guard against a full-catalog wipe).
    b. If `tools.claudeCode`: ensure `.claude/skills/<name>` symlinks → `../../.figma-pipeline/skills/<name>` for each name in installSet; remove wizard-owned symlinks not in installSet. Else: remove all wizard-owned symlinks under `.claude/skills/`.
    c. If `tools.cursor`: write `.cursor/rules/use-skills.mdc` from the canonical template. Else: delete it.
    d. Update `config.skillsInstall.installed[]` / `missing[]` / `resolvedAt`.
11.55. **Brevit install (project dependency)** — detect the project's package manager from the lockfile (`package-lock.json`→npm, `pnpm-lock.yaml`→pnpm, `yarn.lock`→yarn, `bun.lockb`→bun; default npm) and run e.g. `npm install brevit`. Record `config.brevit = { installed: true, version: <from node_modules/brevit/package.json>, enabled: true, mode: "flatten", abbreviation: false }`. On failure → record `{ installed: false, enabled: false }` and surface: `"brevit not installed — agent payloads will use raw JSON. Run npm install brevit later and re-run /init-figma-compose."` Do NOT abort. Per § Step 7.55 in `.claude/agents/wizard.md`. Unlike Figma MCP and Graphify (user-level tools), Brevit is a project npm dependency and thus in-scope for the wizard to install.
11.6. **Graphify detection** — `command -v graphify`; record `config.graphify = { installed, version, outputDir, detectedAt }`. Detect-only: never install the binary, never run `graphify install`, never build the graph. If absent, surface a one-line pointer: `"Graphify not installed (optional — codebase knowledge graph). See README § Prerequisites § Optional — Graphify."` Registration (`graphify install --platform cursor`) and the build (`/graphify .` in Cursor's agent chat) are the user's to run. Per § Step 7.7.
11.7. **Patch project `.gitignore`** — idempotently append `.figma-pipeline/config.json`, `.figma-pipeline/scratch/`, `/tmp/figma-*/`, `graphify-out/`, `.mcp.json`. Record `config.gitignorePatch`. Per § Step 7.8.
11.8. **Build the design system from Figma (opt-in)** — on greenfield projects (no existing tokens on disk), ask two questions one at a time: (1) "Figma design-system URL? (builds your token system from Figma variables — leave blank to skip)" — blank skips the rest; non-blank records `config.figma.dsUrl`. (2) "Build the token system now?" yes / no — yes invokes `figma-coordinator` with `{ url: dsUrl, intent: "create", scope: "tokens-only" }` and surfaces the token-builder report; no records the URL only and the final report ends with `Next: /figma-tokens <dsUrl>`. Skip on non-greenfield projects. Per § Step 7.9 in `.claude/agents/wizard.md`.
12. **Report** — print the summary block from `.claude/agents/wizard.md` § Step 8 (includes Graphify, KG, Complexity, Brevit, Design system, .gitignore lines).

## Write scope

Cursor in agent mode may write only:

- `.figma-pipeline/config.json`
- `.mcp.json` (merge `figma` only)
- `/tmp/figma-wizard-*` (scratch)
- `.figma-pipeline/skills/<name>/` — **delete only**, at Step 11(a), via `fcc skills:prune` (never free-form `rm -rf`)
- `.claude/skills/<name>` — symlink create/delete, at Step 11(b), only when `tools.claudeCode`
- `.cursor/rules/use-skills.mdc` — write/delete, at Step 11(c)
- `<projectRoot>/.gitignore` — append-only, at Step 11.7
- `<projectRoot>/graphify-out/` — written indirectly by the `graphify` binary at Step 11.6
- `node_modules/brevit/` + `package.json` / lockfile — written indirectly by `npm install brevit` at Step 11.55

Any other write → stop and tell the user. The Cursor rule `.cursor/rules/frozen-paths.mdc` enforces this in agent mode.

## Differences from Claude Code

- No `AskUserQuestion` tool — present each question as a normal chat prompt, wait for an explicit answer, and confirm before moving on. (Aligns naturally with the "one question at a time" cadence above.)
- No `Agent` tool to spawn `project-detector` as a sub-agent — inline its detection logic.
- MCP auth is user-driven via Cursor settings — guide the user, don't try to call `mcp__figma__authenticate`.

The output (`.figma-pipeline/config.json`) MUST be byte-identical regardless of which tool ran the wizard.
