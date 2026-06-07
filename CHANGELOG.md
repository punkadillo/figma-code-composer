# figma-code-composer

## 1.1.0

### Minor Changes

- [#5](https://github.com/raveracker/figma-code-composer/pull/5) [`41b4984`](https://github.com/raveracker/figma-code-composer/commit/41b49844b88cc092a4fc50991aa453a7a9c48452) Thanks [@raveracker](https://github.com/raveracker)! - Push detection, provisioning, and validation upstream so builders assemble against a complete, grounded plan instead of discovering project reality mid-build. Applies to both Claude Code agents and Cursor prompts.

  - **Setup-at-init (no command-time failures).** The wizard now provisions each enabled track's one-time framework setup (Tailwind entry CSS + `@source`, `vitest.config` with the e2e separation already correct — including a `projects`/`.e2e` split for co-located e2e — `playwright.config`, `.storybook/`) and installs project devDeps; Playwright browsers stay user-run/verify-after. It never edits user-authored config files (greenfield write / brownfield instruct-and-verify). The coordinator verifies setup at pre-flight and aborts cleanly before spawning any specialist rather than failing mid-run.
  - **Complexity scoring fix.** The coordinator feeds the real (disk- or ledger-based) `tokenReuseRatio` into the scorer before resolving the tier, eliminating the false reuse penalty that over-tiered components; the fetcher now emits canonical tiers only (`trivial|moderate|complex|extreme`), never ad-hoc labels.
  - **Plan-mode inventory.** A cold-start inventory grounds existing assets, real on-disk token names, Figma↔disk token deltas, and house style, passed to builders as buildPlan directives.
  - **Dark mode.** token-builder emits `[data-theme]` blocks from manifest dark values on component builds too; the fetcher hardens dark-alias resolution (flag, never fabricate).
  - **Docs.** story-author emits a lightweight component MDX doc per component.
  - **Fetcher reliability.** Resume output is disk-validated before use; the manifest root `configSnapshot` is always populated; the coordinator re-passes `configSnapshot` to every follow-up spawn.
  - **Icons.** Vector-before-raster extraction, raster flagged as a fidelity gap, correct `{...props}`/`style` spread order, and type-only imports for `verbatimModuleSyntax`.
  - **Config.** The wizard wires a `knowledgeGraph` block (opt-in, default off) and a `setup` audit block; schema adds `writeScope.setupFiles`, `stories.testUtilsImport`, and `tests.unit.{excludeE2E,setupFile}`. The frozen-paths hook authorizes wizard-provisioned setup files via `writeScope.setupFiles`.

## 1.0.1

### Patch Changes

- Update Github workflow to use node 24

## 1.0.0

### Major Changes

- [#1](https://github.com/raveracker/figma-code-composer/pull/1) [`3c73755`](https://github.com/raveracker/figma-code-composer/commit/3c73755b5ced0978f2a4d0b00890745bf112bef6) Thanks [@raveracker](https://github.com/raveracker)! - First release — a drop-in, framework-agnostic Figma→code pipeline scaffold for **Claude Code** and **Cursor**.

  `npx figma-code-composer` copies a multi-agent pipeline into any frontend repo: a Figma file becomes design tokens, framework-native components, icons, Storybook stories, and tests — with a built-in knowledge graph that reuses components across screens instead of duplicating them. Nothing is bundled into your app; the CLI runs on demand.

  **Pipeline output**

  - Design tokens in your CSS system's native format (CSS vars, Tailwind theme, Panda config, …), with Figma variable names preserved (never resolved to raw values).
  - Framework-native components (React TSX / Vue SFC / Angular standalone / Svelte) with cva-style variants and accessibility baked in.
  - Icons: SVG → component with `currentColor` / literal fills + barrel re-exports.
  - Storybook stories + unit tests (Vitest / Jest / Karma) and optional Playwright E2E.

  **Coverage**

  - **Frameworks** — React (Next · Vite · Remix · Astro · CRA), Vue 3 (Nuxt · Vite · Astro), Angular ≥17 (standalone + signals), Svelte 5 (runes).
  - **CSS** — Tailwind v4/v3, UnoCSS, vanilla CSS-vars, CSS Modules, Sass/SCSS, vanilla-extract, Panda, styled-components.
  - **Design systems** — Atomic, Ant Design, Chakra, Hero UI, Mantine, MUI, Radix, shadcn/ui, or none/custom.
  - **Methodologies** — Atomic Design, Feature-Sliced, Component-Based, Flat/custom.

  **Pipeline intelligence**

  - Knowledge graph records every built component and reuses it across screens (exact + semantic match) instead of rebuilding duplicates.
  - Complexity routing picks the smallest viable model + skill set per build — saving tokens on easy designs without sacrificing quality on hard ones.
  - Handover summaries let you `/clear` between runs and re-hydrate from the handover + KG.
  - ~137 bundled skills, auto-pruned to your chosen stack by the wizard.
  - `fcc` CLI: knowledge-graph query/stage/merge, handover, complexity, and `doctor` health check.

  **Setup & safety**

  - One-time `/init-figma-compose` wizard detects your stack, hard-gates on a reachable Figma MCP, derives the write allowlist, and writes `.figma-pipeline/config.json` (the single source of truth every agent reads).
  - A `config.json`-driven write allowlist plus lifecycle hooks keep generation scoped to your configured output directories; `.env` is hard-blocked, and all Figma-derived strings are treated as data (prompt-injection guard).
  - `CLAUDE.md` / `AGENTS.md` get a managed marker block only — your own instructions survive updates.
  - Optional, detect-only (never auto-installed): Graphify knowledge graph.

  Tooling note: this release supports **Claude Code and Cursor**. Codex CLI was evaluated and removed — its Figma plugin tools are not available to `codex exec`, so the pipeline could not run there.
