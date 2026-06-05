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
