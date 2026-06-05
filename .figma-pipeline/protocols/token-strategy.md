# Token strategy — per CSS system

> Read by `token-builder` to translate `manifest.tokens` into the project's native token format. Each row is a complete recipe.

The token-builder receives `manifest.tokens` (a flat dict of `figma-variable-path → { type, value, modes? }`) and writes the result to `config.tokens.outputDir`.

| `cssSystem.name`        | `tokens.strategy`         | Output format                                             | File layout                                              | Theming model                                        |
| ----------------------- | ------------------------- | --------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| `tailwind-v4`           | `tailwind-css-vars`       | `@theme { --color-*: …; }` blocks; CSS Custom Properties  | `primitives.css` + `semantic.css` + `components.css`     | `:root` + `[data-theme=...]` overrides               |
| `tailwind-v3`           | `js-tokens`               | JS object exported from `tailwind.config.js`              | `tokens/index.{js,ts}` consumed by `theme.extend`        | `darkMode: 'class'` + JS object branching            |
| `unocss`                | `unocss-theme`            | UnoCSS `theme` extend (TS object)                         | `unocss.config.ts` `theme` block                         | UnoCSS shortcuts + variants                          |
| `css-modules`           | `css-custom-properties`   | `:root` CSS vars consumed via `var(--…)`                  | `styles/tokens/*.css`                                    | `[data-theme=…]` blocks                              |
| `css-vars` (vanilla)    | `css-custom-properties`   | `:root` CSS vars                                          | `styles/tokens/*.css`                                    | `[data-theme=…]` blocks                              |
| `sass`                  | `scss-variables`          | SCSS `$tokens` + optional CSS-var output                  | `styles/tokens/_*.scss`                                  | SCSS map + mixin per theme                           |
| `vanilla-extract`       | `js-tokens`               | TS `createGlobalTheme` exports                            | `styles/tokens.css.ts`                                   | `createTheme` per theme                              |
| `panda`                 | `js-tokens`               | Panda `defineTokens` + `defineSemanticTokens`             | `panda.config.ts` `theme.tokens`                         | Panda `conditions` for theming                       |
| `styled-components`     | `js-tokens`               | Typed theme object consumed via `<ThemeProvider theme={…}>` | `tokens/theme.ts` + `tokens/styled.d.ts`                | Multiple theme objects (e.g. `lightTheme`, `darkTheme`) switched at the provider |

## Token naming

The token-builder converts `figma-variable-path` → output identifier per `tokens.namingConvention`:

| Figma path                                | `kebab-case`                          | `camelCase`                       | `dot.path`                         | `slash/path`                       |
| ----------------------------------------- | ------------------------------------- | --------------------------------- | ---------------------------------- | ---------------------------------- |
| `color/surface/brand-primary`             | `color-surface-brand-primary`         | `colorSurfaceBrandPrimary`        | `color.surface.brandPrimary`       | `color/surface/brand-primary`      |
| `space/inline/lg`                         | `space-inline-lg`                     | `spaceInlineLg`                   | `space.inline.lg`                  | `space/inline/lg`                  |

Final identifier = `tokens.prefix` + converted-name. Default prefix: empty (`""`).

## Theming model

When Figma variables have multiple modes (e.g. `default`, `dark`, `brand-a`, `brand-b`), the token-builder emits:

- **CSS-property-based systems** (`tailwind-v4`, `css-vars`, `css-modules`): each mode → a `[data-theme="<mode>"]` block; `default` mode → `:root`.
- **JS-token-based systems** (`tailwind-v3`, `vanilla-extract`, `panda`, `styled-components`, `unocss`): emit one theme constant per mode; consumer is responsible for runtime switching.
- **SCSS systems**: emit one SCSS map per mode; emit a `@mixin theme($name)` that includes the matching map.

## Unbound + missing values

`token-builder` MUST:

1. Skip any Figma variable with `value == null` → record in `manifest.flags` as `Token '<path>' missing value`.
2. Skip any value with `type` it doesn't recognise → record in flags.
3. Never invent a value to fill a gap.

`component-builder` MUST refuse to write a component that references a token the token-builder skipped; the coordinator flags this to the user.

## Existing-token conflict resolution

When the project already has tokens at `config.tokens.outputDir`:

- **`intent: "create"`**: token-builder adds new tokens, leaves existing untouched, emits a flag if names collide.
- **`intent: "update"`**: token-builder updates values for existing names, adds new, emits a flag for any rename (old + new mapping required in the manifest's `tokens` dict; coordinator escalates if missing).

## CSS-system gotchas (record these per-row in the appropriate adapter file)

- **Tailwind v4**: utility classes must register custom token names via `extendTailwindMerge` to avoid silent class-merge stripping. The component-builder enforces this; see `adapters/css/tailwind-v4.md`.
- **Tailwind v3**: `theme.extend` is additive; `theme` is replacement. Always extend.
- **UnoCSS**: theme keys map to utility names; `colors.brand.primary` → `bg-brand-primary`. Update `safelist` if class names are computed.
- **CSS Modules**: tokens must be defined in a global stylesheet (not a module) so they cascade.
- **Sass**: native CSS vars and SCSS vars coexist; emit both when project uses modern Sass.

Adapter-specific notes live in `.figma-pipeline/adapters/css/<system>.md`.

## Three-layer DS emission

A design-system token build emits three real layers (never collapsed):
1. **primitives** — raw values (`--<prefix><id>: <value>`).
2. **semantic** — aliases referencing primitives via `var()` (`--color-surface-foreground: var(--<prefix>foreground)`); kept in their own file, never a hollow `:root {}`.
3. **`@theme inline` bridge** — maps tokens into Tailwind namespaces over the `var()` chain so utilities stay theme-reactive.

Per-mode theming: `default` mode → `:root`; each other Figma mode → `[data-theme="<mode>"]`. Every fetched variable type is mapped (color/spacing/radius/effect-shadow/blur/easing/fontWeight/letterSpacing); unmappable types go to `skipped[]`, never silently dropped.
