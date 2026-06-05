# Component layout — per framework & methodology

> Read by `component-builder`, `story-author`, and `test-author` to resolve where files go and what they look like. The figma-fetcher reads this to assign `layer` and `targetDir` in the manifest.

## Layer resolution (manifest → disk)

The fetcher classifies each Figma component into a `layer` based on `config.components.designMethodology`:

### `designMethodology: atomic`

Resolve `layer` from INTENT signals, not node depth alone:
- A leaf control (button, input, single icon+label) → **atom**.
- Contains ≥1 form-control child (input/select/checkbox/switch) OR composes ≥2 atoms → **molecule**.
- Contains a button-row, multiple distinct regions, or a labelled section → **organism**.
- A full-canvas frame (page-sized) or a composed multi-organism screen → **template**.
- A routed screen with navigation/layout chrome → **page**.

Emit `layerConfidence`: `high` when one signal clearly dominates; `medium` when two adjacent tiers are
both plausible; `low` when the structure is flat/ambiguous. A `low` confidence is a FLAG for the
coordinator's think-once pass (Step 8.5) to resolve — it is NOT a silent down-grade. (The Input/Card/Form
off-by-one came from grading flat trees down a tier without this signal.)

| `layer`     | Intent signals (above)                                                 | `targetDir` (default)                |
| ----------- | ---------------------------------------------------------------------- | ------------------------------------ |
| `atom`      | Leaf control; no composed children                                     | `config.components.atomicLayout.atomsDir`     |
| `molecule`  | Form-control child(ren) OR ≥2 composed atoms; single concern           | `config.components.atomicLayout.moleculesDir` |
| `organism`  | Button-row, multiple distinct regions, or labelled section             | `config.components.atomicLayout.organismsDir` |
| `template`  | Full-canvas / page-sized frame; composed multi-organism screen         | `config.components.atomicLayout.templatesDir` |
| `page`      | Routed screen with navigation/layout chrome                            | `config.components.atomicLayout.templatesDir` (filed under `pages/` subdir) |

### `designMethodology: feature-sliced`

| `layer`    | `targetDir`                                |
| ---------- | ------------------------------------------ |
| `shared`   | `config.components.featureSlicedLayout.sharedDir`   |
| `entity`   | `config.components.featureSlicedLayout.entitiesDir` |
| `feature`  | `config.components.featureSlicedLayout.featuresDir` |
| `widget`   | `config.components.featureSlicedLayout.widgetsDir`  |
| `page`     | `config.components.featureSlicedLayout.pagesDir`    |

### `designMethodology: component-based`

| `layer`     | `targetDir`                                                                          |
| ----------- | ------------------------------------------------------------------------------------ |
| `shared`    | `config.components.componentBasedLayout.componentsDir` (e.g. `src/components`)       |
| `feature`   | `config.components.componentBasedLayout.featuresDir/<domain>/` (e.g. `src/features/auth/`) |
| `page`      | `config.components.componentBasedLayout.pagesDir` (e.g. `src/pages` or `app/`)        |

The fetcher infers `feature` placement by mapping a Figma frame's parent group / annotation to a domain folder. When a feature subdir doesn't exist, the builder creates it. No atom/molecule hierarchy enforced — every emitted file is just a component.

### `designMethodology: flat` / `custom`

All components → `config.components.flatLayout.componentsDir`. `layer` is recorded for tagging but does not influence placement.

### Override

Any Figma frame can override placement by adding a `figma-layer` description annotation: `layer:organism` overrides the heuristic. Recorded verbatim in the manifest and surfaced to the user as a flag (never silently honoured).

---

## File layout (per framework)

The component file extension + sibling file conventions vary by framework. The `component-builder` writes a folder per component containing the main file + barrel + story + test (when enabled). `fileNaming` controls the inner naming.

### React (`framework.name: react`)

```
<targetDir>/<Name>/
  ├─ <Name>.tsx           # main component (default export named <Name>)
  ├─ <Name>.module.css    # only if cssSystem.name == "css-modules"
  ├─ <Name>.stories.tsx   # if stories.enabled
  ├─ <Name>.test.tsx      # if tests.enabled
  └─ index.ts             # re-exports
```

Variants: with `fileNaming: index`, the main file becomes `index.tsx` and there is no barrel. With `fileNaming: match-folder`, folder + file are lowercase.

### Vue (`framework.name: vue`)

```
<targetDir>/<Name>/
  ├─ <Name>.vue            # SFC with <script setup lang="ts">
  ├─ <Name>.stories.ts     # CSF3
  ├─ <Name>.spec.ts        # vitest + vue-testing-library
  └─ index.ts
```

### Angular (`framework.name: angular`)

```
<targetDir>/<kebab-name>/
  ├─ <kebab-name>.component.ts     # standalone component
  ├─ <kebab-name>.component.html
  ├─ <kebab-name>.component.scss   # or .css depending on cssSystem
  ├─ <kebab-name>.component.spec.ts
  ├─ <kebab-name>.stories.ts
  └─ index.ts
```

Angular uses kebab-case folder + selector convention; selector = `<prefix>-<kebab-name>` (prefix configured via `framework.config.selectorPrefix`, default `app-`).

### Svelte (`framework.name: svelte`)

```
<targetDir>/<Name>/
  ├─ <Name>.svelte
  ├─ <Name>.stories.ts
  ├─ <Name>.test.ts
  └─ index.ts
```

---

## Naming

`components.namingConvention` controls the `<Name>` token above:

| Setting       | Example                |
| ------------- | ---------------------- |
| `PascalCase`  | `ProductCtaBar`        |
| `kebab-case`  | `product-cta-bar`      |
| `camelCase`   | `productCtaBar`        |

Angular always uses kebab-case for files + selectors regardless of this setting (framework convention wins). React/Vue/Svelte default to PascalCase.

---

## Barrel files

`index.ts` (or `index.js`) re-exports the named component + types:

```ts
// React
export { ProductCtaBar } from "./ProductCtaBar";
export type { ProductCtaBarProps } from "./ProductCtaBar";

// Vue
export { default as ProductCtaBar } from "./ProductCtaBar.vue";
```

When `fileNaming: index`, the inner file IS the barrel and no separate `index.ts` is emitted.

---

## Story title convention

`stories.titleConvention` is a template with placeholders:

- `{Layer}` — `Atoms`, `Molecules`, `Organisms`, `Templates` (atomic); `Shared`, `Entities`, `Features`, `Widgets`, `Pages` (feature-sliced); `Shared`, `Features`, `Pages` (component-based); `Components` (flat).
- `{Name}` — component name in PascalCase.
- `{Domain}` — subdirectory name (only resolves for nested layouts like `organisms/user/ProfileHeader` → `User`).

Default: `Components/{Layer}/{Name}` → `Components/Molecules/ProductCtaBar`.

---

## Update flow (`intent: "update"`)

When `existsOnDisk: true`:

1. `component-builder` MUST patch the file at `diskPath` — never blind-overwrite.
2. New props/states are added; removed props are kept with `@deprecated` JSDoc and a `// removed in <runId>` marker.
3. Story/test files are re-synced (Rule: stories rewritten on major prop-surface change; tests added-only never deleted).
4. Renames require `previousName` in the run-summary; coordinator escalates a missing previousName.
