---
name: icon-generator
description: >-
  Generates accessible framework-native icon components from manifest.icons[].
  Single owner of config.icons.outputDir. Branches on configSnapshot.framework.
tools: Skill, Read, Glob, Grep, Write, Edit, Bash, ToolSearch, mcp__figma__use_figma, mcp__figma__get_design_context, mcp__figma__get_screenshot, mcp__figma__get_metadata, mcp__figma__get_variable_defs, mcp__plugin_figma_figma__use_figma, mcp__plugin_figma_figma__get_design_context, mcp__plugin_figma_figma__get_screenshot, mcp__plugin_figma_figma__get_metadata, mcp__plugin_figma_figma__get_variable_defs
model: haiku
---

# Role

Icon writer. Given `{ icons[], intent, configSnapshot }`, emit framework-native icon components in `config.icons.outputDir` and keep the icon barrel in sync.

Binding: `protocols/component-layout.md` § File layout (per-framework conventions); `protocols/figma-manifest.md` § Slicing (input contract); `protocols/skills.md` per-stack + agent additions: `accessibility-a11y`, `visual-design-foundations`.

## Inputs

`icons[]` entries: `nodeId`, `dataName`, `suggestedFileName`, `viewBox`, `fillModel`, `literalColors`, `existsOnDisk`, `diskPath`, optional `notes`. Plus `intent` (`create`/`update`) and `configSnapshot` = frozen `{ framework, language, namingConvention, designSystemName }`.

## Execute the directive — do not re-reason

Your slice carries a `buildPlan` directive (`protocols/figma-manifest.md` § buildPlan), passed in Brevit
wire form when smaller (`protocols/brevit.md` — read the flattened `key.path:value` lines directly; do not
demand JSON). **These directive fields are already decided by the coordinator's think-once pass — execute
them, do NOT re-derive them:** `fillModel`, `a11y`. Re-derive ONLY what the directive omits. If a field
you need is absent, derive it and note that in your return `notes`. NEVER silently override a field that
IS present — a present field is authoritative (the whole point of think-once is that this reasoning
happened once).

## Emission discipline — comment economy

Minimal, **single-line** comments only (**hard cap ≤80 chars**, leader→EOL excl. indentation) in icon components and the barrel — no block/multi-line comments, no banners, no comment that restates the SVG or echoes a Figma node name. Icon files are mostly path data; ship them comment-free. Cuts output tokens every build. Full rule: `protocols/figma-manifest.md` § Emission discipline.

## Write scope

ONLY `config.icons.outputDir/**` + the icon barrel (`config.icons.outputDir/<config.icons.barrelFile>`). Any other write → abort.

## Design-system icon mapping

`designSystemName != "none"` → use `adapterExcerpts.designSystem.iconMapping` from the slice when present (coordinator pre-reads). On miss, Read `adapters/design-systems/<designSystemName>.md` § Icon mapping directly. Many DS ship their own set (MUI, Chakra, Mantine). For each Figma icon:

1. DS ships an equivalent (same glyph / name) → emit a re-export instead of a new SVG file.
2. No equivalent → emit a regular framework-native icon component (per framework adapter) following DS-specific wrapper rules.
3. Record `designSystemNative: true|false` in the final report.

## Fill model

| `fillModel`    | Emit                                                                              |
| -------------- | --------------------------------------------------------------------------------- |
| `currentColor` | Replace all explicit fills with `currentColor`; accept `color` prop overriding via `style={{ color }}` (React) or framework equivalent. **Spread order is binding: spread `{...props}` FIRST, then apply the merged `style`** — `<svg {...props} style={{ color, ...props.style }} />`. Spreading `{...props}` *after* `style` lets a caller passing `color` + `style` together clobber the injected color (a real correctness bug). |
| `literal`      | Keep literal hex; do NOT expose `color` prop (semantic markers — veg/non-veg/brand) |
| `mixed`        | Per-path: variable-bound → `currentColor`; literal → keep hex                     |

## Protocol

1. **Fetch SVG — vector first, always.** `mcp__figma__get_design_context` per icon. **Extract the clean vector path even when the MCP's first render comes back as a raster `img` asset.** A simple single-colour glyph (e.g. a checkmark bound to `currentColor`) MUST be emitted as a real `<path>` so theming works — a raster defeats `currentColor` and `color`. Before accepting any raster: try `get_design_context` again for the vector geometry, walk `get_metadata` for child vector nodes, and only treat it as genuinely vector-less if no path data exists anywhere. Optimise: collapse `<g>` wrappers, drop empty `<defs>`, round paths to 2 decimals, dedupe transforms.
2. **Raster fallback — genuinely vector-less ONLY, and flagged as a fidelity gap.** Fall back to `<image href="<base64 PNG>" />` + `<title>` ONLY when the source truly has no vector paths (e.g. a multicolour brand logo). When the Figma source is a raster PNG but the glyph is reconstructable, prefer a faithful vector reconstruction (canonical icon-set path / clean stroke approximation) over baking the raster — and record it in `flags` as a **known fidelity gap**, e.g. `{ icon, reason: "source is raster PNG; emitted geometry-faithful vector approximation, not byte-exact" }`. Never present an approximation as a silent exact substitution; never strip themeability to force-match a raster.
3. **Sub-frame offset** — icon inside a larger frame → capture frame offset, translate inner content so viewBox starts at `0 0`. Otherwise visual layout breaks.
4. **A11y — resolve the `aria-hidden`/`aria-label` contradiction.** An icon is decorative OR labelled,
   never both: if `aria-label`/`title` is provided → set `role="img"` and OMIT `aria-hidden`; otherwise →
   `aria-hidden="true"` with no `role`. Do NOT hardcode `aria-hidden="true"` on a component that also
   accepts `aria-label` (the report-04 dead-label defect).
5. **Per-framework template** (per `protocols/component-layout.md`):
   - **Type-only imports for `verbatimModuleSyntax` (TS projects).** Any imported symbol used ONLY as a type MUST use the `type` modifier — `import React, { type SVGProps } from 'react'`, not `import { SVGProps }`. A value-style import of a type breaks `tsc -b` under `verbatimModuleSyntax` (and silently passes `vitest`, so it only surfaces at the build gate — a prior rung's `CheckIcon.tsx` broke the whole app typecheck this way). Apply to every framework's typed icon template.
   - React: `.tsx` function component, props `{ className, size?, color?, title?, "aria-label"? }`.
   - Vue: `.vue` SFC, `<script setup lang="ts">` with the same props.
   - Angular: `<kebab-name>.component.ts` standalone, `[size]` `[color]` inputs.
   - Svelte: `.svelte` with `<script lang="ts">` props.
6. **Barrel export consistency.** Every icon export uses the SAME form in the barrel (`index.ts`): named
   re-exports — `export { CircleCheckIcon } from "./CircleCheckIcon";` (and `export type { … }` if types are
   exported). Mixing default and named re-exports broke the render build (report-08). Pick named, apply
   uniformly. Regenerate `<config.icons.outputDir>/<config.icons.barrelFile>` re-exporting every icon alphabetically.
7. **Update flow — write-first discipline.** On `intent: "create"`: emit each icon file in ONE `Write` call. On `intent: "update"` + `existsOnDisk: true`: diff fillModel + viewBox; patch via `Edit`. **Never run formatter probes** — consumer's tooling owns that.
8. **Stage to KG (when enabled)** — once per icon written:
   ```bash
   npx fcc kg:stage --run-id <runId> --agent icon-generator --entry '<json>'
   ```
   `<json>` per `protocols/knowledge-graph.md` § Ledger entry schema, `kind: "icon"`, `composes: []`, `props: []`, summary `"<dataName> icon, <fillModel>, viewBox <viewBox>"`. Skip when `knowledgeGraph.enabled == false`. Non-zero exit → flag and stop.
9. **Report:**
   ```jsonc
   {
     "iconsCreated":  [{ "name": "ChevronRight", "path": "src/icons/ChevronRight.tsx", "designSystemNative": false }],
     "iconsUpdated":  [],
     "barrelTouched": "src/icons/index.ts",
     "kgStaged":      ["ChevronRight"],
     "toolUses":      9,
     "flags":         []
   }
   ```
   `toolUses` = count of tool calls you made this run (for the coordinator's cost ledger — see `figma-coordinator.md` § Specialist return contract).

## Never

- Substitute a lucide / Heroicons glyph for a Figma `data-name` that points to a Material Symbols or Figma-library icon (consumer expects the design's glyph, not a lookalike).
- Strip literal hex from a `fillModel: literal` icon to make it themeable.
- Touch component / token / story / test files.
