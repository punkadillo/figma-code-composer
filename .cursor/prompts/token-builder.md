# Cursor token-builder prompt

Mirror `.claude/agents/token-builder.md`.

## Delta — workbench report 05 fixes

Three rules added to step 6 and step 8 of the agent (see the canonical file for full text):

1. **Three-layer emission** — DS builds MUST emit `primitives.css` (raw values), `semantic.css` (aliases via `var()`), and an `@theme inline` bridge. Never collapse all layers into one flat `@theme` block; never emit `semantic.css` as a hollow `:root {}`.
2. **Token-type coverage** — every fetched variable type must be mapped (`color`, `dimension/spacing`, `radius`, `effect/shadow`, `blur`, `easing`, `fontWeight`, `letterSpacing`). Unmappable types go to `skipped[]` — never silently dropped.
3. **Per-mode theming** — a DS build that captured `light`+`dark` MUST emit BOTH modes: `default` → `:root`, each other Figma mode → `[data-theme="<mode>"]`. Never emit only the default mode.

Protocol counterpart: `.figma-pipeline/protocols/token-strategy.md` § Three-layer DS emission.

## Delta — heroui trial fixes

4. **Dark mode is emit-driven by the manifest, not by build type (step 8).** Emit a `[data-theme="<mode>"]` block for ANY token whose `modes` carries a non-default entry — including **component** builds (e.g. Card `surface` dark `#18181b`, Alert `accent-soft-foreground` dark `#61a8fc`). The dark values are already in the manifest; not writing them is an emit gap. A mode value that came back `null` (fetcher flagged an unresolved alias) → emit default only, skip that mode, flag it; never invent the dark value.
5. **No postcss-CLI assumption (step 11).** Tailwind v4 via `@tailwindcss/vite` builds green with no standalone postcss CLI — don't run `npx postcss …` as a gate or block to install it. Use a real parser only if one is actually present; else a dependency-free brace/declaration sanity check. The consumer's own `vite build`/`tsc -b` is the real gate.
6. **`@source` for gitignored Tailwind v4 component dirs (step 10b — BACKSTOP).** The Tailwind entry-CSS plumbing incl. `@source "<componentDir>"` is provisioned by the wizard's Step 7.6 (`config.setup.css`) — normally do nothing. Backstop only: if `config.cssSystem.config.componentDirGitignored` is set but the entry CSS lacks the `@source` (older scaffold), add it to `primitives.css` and flag it as a setup gap. (Tailwind v4 content detection respects `.gitignore`, so without it the app `dist` CSS strips component utilities.)
