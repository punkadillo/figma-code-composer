# Cursor icon-generator prompt

Mirror `.claude/agents/icon-generator.md`. Cursor reads Figma MCP via its own server config. Delta:
execute the `buildPlan` directive fields (`fillModel`, `a11y`) as decided by the coordinator — do not
re-derive them. See `## Execute the directive — do not re-reason` in the agent file.

## A11y + barrel fixes (report-04/08)

- **A11y — resolve the `aria-hidden`/`aria-label` contradiction.** An icon is decorative OR labelled,
  never both: if `aria-label`/`title` is provided → set `role="img"` and OMIT `aria-hidden`; otherwise →
  `aria-hidden="true"` with no `role`. Do NOT hardcode `aria-hidden="true"` on a component that also
  accepts `aria-label` (the report-04 dead-label defect).
- **Barrel export consistency.** Every icon export uses the SAME form in the barrel (`index.ts`): named
  re-exports — `export { CircleCheckIcon } from "./CircleCheckIcon";` (and `export type { … }` if types are
  exported). Mixing default and named re-exports broke the render build (report-08). Pick named, apply
  uniformly.

## Delta — heroui trial fixes

- **Vector first, always (steps 1–2).** Extract a clean `<path>` even when the MCP's first render is a raster `img` — a simple `currentColor`-bound glyph (e.g. a checkmark) MUST be vector so theming works. Raster fallback (`<image href>`) is for genuinely vector-less sources only (multicolour logos). When a Figma source is raster but reconstructable, emit a geometry-faithful vector approximation and record it in `flags` as a KNOWN fidelity gap — never a silent exact substitution.
- **Prop-spread order (currentColor icons).** Spread `{...props}` FIRST, then the merged `style` — `<svg {...props} style={{ color, ...props.style }} />`. Spreading after `style` lets a caller passing `color` + `style` clobber the injected color.
- **Type-only imports for `verbatimModuleSyntax`.** `import React, { type SVGProps } from 'react'`, not `import { SVGProps }` — a value-import of a type passes vitest but breaks `tsc -b` (a prior `CheckIcon.tsx` broke the whole app typecheck this way).
