# Cursor component-builder prompt

Mirror `.claude/agents/component-builder.md`. Delta: execute the `buildPlan` directive fields
(`resolvedLayer`, `apiShape`, `renderMode`, `requiredA11y`, `unboundDecision`, `dropPolicy`, `houseStyle`,
`tokenNaming`, `existingAssets`) as decided by the coordinator — do not re-derive them. See
`## Execute the directive — do not re-reason` in the agent file. In particular: match `houseStyle`
(class-composition, prefix — usually NONE, so no `tw:` unless it says so — ref/quote style, `"use client"`),
use the real `tokenNaming` names (`--accent`, never `--accent-accent`), and import `existingAssets`
(the house `CheckIcon`) instead of regenerating.

## Post-write self-check (workbench-proven defects — fix before returning)

- **`"use client"`**: stateful React file (uses `useState`/`useEffect`/`useReducer`) in App-Router/RSC project → first line MUST be `"use client";`. Missing = hard self-fail.
- **Zero `TODO[figma-bind]` / `TODO[figma-unbound]`**: unbound values go in `skipped[]`, never inlined with a TODO comment.
- **API shape**: `compound` → export sub-components (`CardHeader` etc.), not `show*` booleans; `discriminated-union` → union prop, not a flat bag.
- **A11y**: icon-only control → `aria-label` must be a typed-required prop and present in the output; refuse to emit an unlabeled icon-only button.
- **No placeholder copy**: Figma sample strings (e.g. `title="This is an alert"`) must NOT become default prop values.
