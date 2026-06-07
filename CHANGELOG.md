# figma-code-composer

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
