# Cursor token-builder prompt

Mirror `.claude/agents/token-builder.md`.

## Delta — workbench report 05 fixes

Three rules added to step 6 and step 8 of the agent (see the canonical file for full text):

1. **Three-layer emission** — DS builds MUST emit `primitives.css` (raw values), `semantic.css` (aliases via `var()`), and an `@theme inline` bridge. Never collapse all layers into one flat `@theme` block; never emit `semantic.css` as a hollow `:root {}`.
2. **Token-type coverage** — every fetched variable type must be mapped (`color`, `dimension/spacing`, `radius`, `effect/shadow`, `blur`, `easing`, `fontWeight`, `letterSpacing`). Unmappable types go to `skipped[]` — never silently dropped.
3. **Per-mode theming** — a DS build that captured `light`+`dark` MUST emit BOTH modes: `default` → `:root`, each other Figma mode → `[data-theme="<mode>"]`. Never emit only the default mode.

Protocol counterpart: `.figma-pipeline/protocols/token-strategy.md` § Three-layer DS emission.
