# 05 — Design-token setup: HeroUI v3 oracle vs agent target

Trial: `heroui-20260603` · Component fetched: **Alert** (single COMPONENT_SET, node `2852:11850`) · Run `20260605-0151-heroui-72355`.

This report compares how design tokens are wired in the HeroUI v3 oracle (`ref-heroui`) against what the agent's `token-builder` emitted into the scratch `target`, and quantifies which Figma-derived tokens are missing or mis-wired. The headline finding: the fetch was a **single-node Alert pull**, so the 34 captured tokens are partial *by construction* — but on top of that constraint, the builder also **collapsed all three token layers into one flat `@theme` block**, dropped the only effect token, and produced **zero theming (no dark mode, no semantic indirection)**, which is exactly the layer a reusable design system needs.

---

## 1. How `ref-heroui` sets up tokens (the oracle)

HeroUI v3 is a **three-layer, two-stage** token system. The layering and theming are explicit and load-ordered via CSS cascade layers.

### 1a. Cascade-layer ordering

`ref-heroui/packages/styles/index.css:1` declares the layer order up front:

```css
@layer theme, base, components, utilities;   /* index.css:1 */
```

Imports are then assigned to layers (`index.css:9-23`): base reset → unstyled component structures (`layer(components)`) → **default theme** (`layer(theme)`) → utilities → variants. This is what lets a downstream consumer override theme vars without specificity wars.

### 1b. Layer 1 — primitive + semantic *values* (`themes/default/variables.css`)

Raw values live as plain CSS custom properties on `:root`/`.light`/`[data-theme]` selectors, **not** in `@theme`. A small primitive palette is defined once and never changes across modes (`variables.css:13-16`):

```css
--white: oklch(100% 0 0);
--black: oklch(0% 0 0);
--snow:  oklch(0.9911 0 0);
--eclipse: oklch(0.2103 0.0059 285.89);
```

Semantic colors then reference those primitives by `var()` indirection (`variables.css:44-96`):

```css
--surface: var(--white);            /* variables.css:44 */
--surface-foreground: var(--foreground);
--accent: oklch(0.6204 0.195 253.83);
--accent-foreground: var(--snow);   /* variables.css:69-70 */
```

A large band of colors is **computed**, not literal — `color-mix()` derives hover/soft/border states from the base semantic token (`variables.css:108-155`):

```css
--accent-hover:           color-mix(in oklab, var(--accent) 90%, var(--accent-foreground) 10%);  /* :109 */
--accent-soft-foreground: color-mix(in oklab, var(--accent) 70%, var(--foreground) 30%);          /* :136 */
--success-soft-foreground:color-mix(in oklab, var(--success) 80%, var(--foreground) 60%);          /* :148 */
```

### 1c. Theming mechanism — light / dark / palette modes

The same variable *names* are redefined under different selectors:
- `:root, .light, [data-theme="light"]` → light values (`variables.css:3-7`)
- `.dark, [data-theme="dark"]` → dark values (`variables.css:173-289`)
- `[data-vibrant-palette="true"]` → palette tweak of the soft-foregrounds (`variables.css:292-305`)

Components never branch on theme; they reference one name and the cascade resolves the mode.

### 1d. Layer 2 — Tailwind bridge (`themes/shared/theme.css`)

A single `@theme inline { … }` block (`theme.css:1`) maps each raw `--<token>` into Tailwind's `--color-*` / `--radius-*` / `--shadow-*` namespace so utilities (`bg-surface`, `text-accent-soft-foreground`, `rounded-3xl`, `shadow-surface`) compile:

```css
--color-surface: var(--surface);                       /* theme.css:5 */
--color-accent-soft-foreground: var(--accent-soft-foreground); /* theme.css:80 */
--radius-3xl: calc(var(--radius) * 3);                 /* theme.css:110 */
--shadow-surface: var(--surface-shadow);               /* theme.css:45 */
```

`@theme inline` is the key: it emits utilities that point *back* at the `var(--…)` chain, so dark mode keeps working through the utility classes. The radius scale is fully derived from one `--radius: 0.5rem` knob (`variables.css:34`, scaled at `theme.css:104-111`).

### 1e. Layer 3 — component CSS consumes the bridge (BEM + `@apply`)

Components never touch raw hex. They `@apply` the Tailwind utilities the bridge generated (`components/alert.css`):

```css
.alert            { @apply ... gap-4 bg-surface px-4 py-3 shadow-surface;  /* alert.css:5 */
                    border-radius: min(32px, var(--radius-3xl)); }          /* alert.css:6 */
.alert__title     { @apply text-sm leading-6 font-medium; }                 /* alert.css:23 */
.alert__description { @apply text-sm text-muted; }                          /* alert.css:27 */
.alert--accent .alert__title { @apply text-accent-soft-foreground; }        /* alert.css:43 */
.alert--danger .alert__title { @apply text-danger-soft-foreground; }        /* alert.css:67 */
```

Same pattern in `card.css:4-22` (`bg`-less, `shadow-surface`, `text-foreground`, `text-muted`) and `button.css:4`/`close-button.css:5` (`rounded-3xl`/`rounded-xl`, `var(--cursor-interactive)`, `var(--ease-*)`). Note `button.css:20-26` adds a *component-scoped* indirection tier (`--button-bg`, `--button-fg` with fallbacks) — a 4th, component-local override layer the target has no analogue for.

**Summary of the oracle chain:** `primitive value → semantic var() (+ color-mix derivations) → @theme inline bridge → Tailwind utility → BEM component class`, with theme modes swapped at the `:root`/`[data-theme]` selector level.

---

## 2. How the `target` sets up tokens (the agent output)

The builder was configured for `strategy: tailwind-css-vars`, `tailwind-v4`, kebab-case, split `primitives/semantic/components.css` (`.figma-pipeline/config.json` tokens block; `manifest.json:14`). It honored the **file split physically** but **collapsed the layering logically**.

### 2a. What landed where

| File | What it contains | Lines |
| --- | --- | --- |
| `target/src/index.css` | `@import "tailwindcss"` + 3 token imports | `index.css:1-4` |
| `target/src/styles/tokens/primitives.css` | **All ~33 tokens** in five `@theme` blocks (colors, spacing, radius, typography, other) | `primitives.css:8-71` |
| `target/src/styles/tokens/semantic.css` | **Empty** — only a comment-justified no-op `:root {}` | `semantic.css:12-14` |
| `target/src/styles/tokens/components.css` | **Empty** — header comment only | `components.css:1-8` |

So the three-file scaffold exists but two of the three layers are hollow.

### 2b. Naming — direct kebab of the Figma leaf, hex inlined

The builder resolved Figma paths to flat Tailwind keys and **inlined raw hex** (no `var()` indirection, no primitive/semantic split):

```css
--color-foreground:      #18181b;            /* primitives.css:10  ← foreground/foreground */
--color-foreground-muted:#71717a;            /* primitives.css:11  ← foreground/muted */
--color-accent-soft-foreground: #1d63ae;     /* primitives.css:23  ← accent/accent-soft-foreground */
--color-danger-soft-foreground: #a43532;     /* primitives.css:38 */
--spacing-1: 0.25rem;  --spacing-2: 0.5rem;  /* primitives.css:43-44 */
--radius-3xl: 1.5rem;  --radius-xl: 0.75rem; /* primitives.css:54-55 */
--font-size-text-sm: 0.875rem;               /* primitives.css:60 */
```

Naming choices vs oracle: the Figma leaf `foreground/muted` became `--color-foreground-muted` (`primitives.css:11`), whereas the oracle exposes this as a top-level `--color-muted` / utility `text-muted` (`theme.css:18`, `alert.css:27`). So even the names that *exist* don't match the utility surface the real component CSS uses.

### 2c. Layers collapsed, not built

`semantic.css:5-9` states the design decision explicitly: *"HeroUI tokens are themselves semantic, so no indirection layer is needed"* and dimensional tokens "that coincide with Tailwind v4 native defaults are intentionally OMITTED." `components.css:4-8` defers all component overrides to "as the design system grows."

The net effect: **everything is a primitive.** There is no `@theme inline` bridge (the target writes values *directly* into `@theme`, conflating the oracle's value-layer and bridge-layer), no `color-mix` derivations, and no `[data-theme]` blocks anywhere. The result compiles and the Alert can render light-mode, but the token file is a flat value sheet, not a design system.

---

## 3. Which Figma tokens are missing or not properly wired

### 3a. Captured-but-mis-wired (within the 34)

| Figma token (`manifest.json`) | Issue | Evidence |
| --- | --- | --- |
| `blur` → `BACKGROUND_BLUR` (`manifest.json:199-203`) | **Dropped entirely.** It's an `effect` type; the builder emits no var for it. The Alert's `backdropBlur` styled-prop *binds* to it (`manifest.json:411-414`) so the binding now points at a non-existent token. | absent from `primitives.css`; `token-strategy.md:42` only mandates skipping `null`/unknown types, but `effect` had a value and was silently lost |
| `letter-spacing` = `0` (`manifest.json:174-177`) | Emitted as `--letter-spacing: 0` (`primitives.css:69`) — **not a Tailwind tracking key**, so no `tracking-*` utility is generated; the component prop `letterSpacing` (`manifest.json:530-535`) has nothing to consume. | `primitives.css:69` |
| `font-medium` / `font-regular` (`manifest.json:184-193`) | Captured as `fontWeight` "Medium"/"Regular" strings; emitted as `--font-weight-medium:500` / `--font-weight-regular:400` (`primitives.css:64-65`). Functional but the *names* don't round-trip (`font-regular` is not a Tailwind weight key; oracle uses bare `font-medium`/`font-normal` utilities, `alert.css:23`). | `primitives.css:64-65` |
| `border-width` = `1` (`manifest.json:194-198`) | Emitted `--border-width:1px` (`primitives.css:70`) but **the Alert never uses a border** (no border in `alert.css`); captured from the design but unwired. | `primitives.css:70` |
| Semantic foreground/background **pairings flattened** | `foreground/foreground`, `surface/surface`, `default/default-foreground`, the `*/​*-foreground` and `*/​*-soft-foreground` triplets all became sibling primitives with no surface↔foreground relationship. The oracle keeps `--surface-foreground: var(--foreground)` (`variables.css:45`) so contrast pairs travel together across themes; the target cannot. | `primitives.css:10-38` |

### 3b. Missing by construction — single-node Alert fetch

`scope` is `full` in the manifest (`manifest.json:9`) but the captured node set is one COMPONENT_SET (`manifest.json:347-350`). The 34 tokens are only those the Alert references. Relative to the oracle's full variable collection, the target is missing roughly the following (counts from `variables.css` + `theme.css`):

| Category | Oracle has | Target captured | Missing |
| --- | --- | --- | --- |
| Theme modes | light + dark + vibrant-palette (`variables.css:3,173,292`) | **light only** | dark + palette entirely |
| Derived state colors (`*-hover`, `*-soft`, `*-soft-hover`) | ~30 via `color-mix` (`variables.css:108-149`) | 0 (only the 5 `*-soft-foreground` leaves) | all hover/soft/soft-hover states |
| Surface tiers | `surface`, `-secondary`, `-tertiary`, `overlay`, `background`, `-secondary`, `-tertiary`, `-inverse` (`variables.css:44-106`) | `surface` only | 11 surface/background tokens |
| Border / separator / focus / link / backdrop | `--border`, `-secondary`, `-tertiary`, `--separator(+lvls)`, `--focus`, `--link`, `--backdrop` (`variables.css:93-99`, `theme.css:26-29,96-101`) | none (only an unused `--border-width`) | ~10 tokens |
| Shadows | `--surface-shadow`, `--overlay-shadow`, `--field-shadow` (`variables.css:159-168`, bridged `theme.css:45-47`) | none | all 3 (and Alert *uses* `shadow-surface`, `alert.css:5`) |
| Radius scale | xs→4xl, derived from `--radius` (`theme.css:104-111`) | `3xl`, `xl` only (`primitives.css:54-55`) | 6 radius steps + the `--radius` knob |
| Spacing base knob | `--spacing: 0.25rem` single source (`variables.css:19`) | 7 hard-coded steps (`primitives.css:43-49`) | the parametric base (target hard-codes rem) |
| Form-field token family | `--field-*` ×8 (`theme.css:50-56,70-72`) | none | all (not in Alert) |
| Easing / animation | ~25 `--ease-*` + `--animate-*` (`theme.css:114-153`) | none | all motion tokens |
| Cursor / opacity / ring | `--cursor-*`, `--disabled-opacity`, `--ring-offset-width` (`variables.css:24-30`) | none | all |

**Quantified:** the oracle's default theme defines on the order of **140+ design-system variables** (values + bridge) across light/dark; the target emitted **~33 single-mode primitives** — roughly **20–25% of one mode**, and **0%** of the second mode.

---

## 4. Design-system scaffolding gap

The user's note is the right frame: when scaffolding into a **new** project the goal is to *build a design system* from the Figma token graph; here the target is a scratch render of one component, so a thin token sheet is arguably "enough to compile." But measured against a reusable DS token layer, the output is far short, and the gaps are structural, not just quantitative:

1. **No indirection tier.** Hex is inlined directly into `@theme` (`primitives.css:10-38`). A DS needs `primitive value → semantic alias` so that re-theming touches one layer. The builder even argues against it (`semantic.css:5-9`) — defensible for a single node, fatal for a DS.
2. **No theme modes.** Zero `[data-theme="dark"]` blocks despite the adapter and protocol explicitly prescribing them (`token-strategy.md:34`, `tailwind-v4.md:34-40`). A DS is theme-first; this output is single-mode.
3. **No derivations.** The oracle generates ~30 state colors with `color-mix` from a handful of bases; the target would have to capture each hover/soft state as its own Figma variable — which a full variable-collection fetch would surface, but the single-node fetch never sees.
4. **No bridge separation.** The target conflates value and Tailwind-namespace into one `@theme`. The oracle's `@theme inline` over a `var()` chain (`theme.css:1`) is what keeps utilities theme-reactive; flattening loses that.
5. **Dropped non-color token types.** The `effect`/blur loss (§3a) shows the pipeline has no path for shadow/blur/easing token types into Tailwind keys.

**What the pipeline would need to close the gap** (for the DS-scaffolding case, not this trial):
- **Full variable-collection fetch** (all modes, all collections) instead of node-scoped — this is the single biggest lever; it would supply dark mode, surface tiers, state colors, shadows, field tokens.
- **Semantic-indirection emission**: write primitives as raw values in `primitives.css`, then `--color-*: var(--primitive)` aliases in `semantic.css`, mirroring `variables.css` → `theme.css inline`.
- **Theme-mode blocks** from Figma modes per `token-strategy.md:32-36` (`:root` = default, `[data-theme="x"]` per mode).
- **Token-type coverage** for `effect`/`shadow`/`easing` → `--shadow-*` / `--ease-*` keys, so bindings like `backdropBlur`→`blur` resolve.
- **Derivation policy** (optional): either capture derived states from Figma or re-emit `color-mix` recipes to match the oracle's runtime model.

---

## 5. Side-by-side mapping — Figma token → target CSS var → nearest ref-heroui token

All 34 captured tokens (`manifest.json:33-203`). "Ref" cites the nearest oracle equivalent.

| Figma path | Target CSS var (`primitives.css`) | Nearest ref-heroui token |
| --- | --- | --- |
| `foreground/foreground` | `--color-foreground` `#18181b` (:10) | `--foreground: var(--eclipse)` (`variables.css:41`) → `--color-foreground` (`theme.css:3`) |
| `foreground/muted` | `--color-foreground-muted` (:11) | `--muted` (`variables.css:57`) → `--color-muted` / `text-muted` (`theme.css:18`) — **name mismatch** |
| `surface/surface` | `--color-surface` (:14) | `--surface: var(--white)` (`variables.css:44`) → `--color-surface` (`theme.css:5`) |
| `default/default` | `--color-default` (:17) | `--default` (`variables.css:66`) → `--color-default` (`theme.css:31`) |
| `default/default-foreground` | `--color-default-foreground` (:18) | `--default-foreground` (`variables.css:67`) (`theme.css:32`) |
| `accent/accent` | `--color-accent` (:21) | `--accent` (`variables.css:69`) (`theme.css:20`) |
| `accent/accent-foreground` | `--color-accent-foreground` (:22) | `--accent-foreground` (`variables.css:70`) (`theme.css:21`) |
| `accent/accent-soft-foreground` | `--color-accent-soft-foreground` (:23) | `--accent-soft-foreground` (color-mix, `variables.css:136`) (`theme.css:80`) |
| `success/success` | `--color-success` (:26) | `--success` (`variables.css:79`) (`theme.css:34`) |
| `success/success-foreground` | `--color-success-foreground` (:27) | `--success-foreground` (`variables.css:80`) (`theme.css:35`) |
| `success/success-soft-foreground` | `--color-success-soft-foreground` (:28) | `--success-soft-foreground` (color-mix, `variables.css:148`) (`theme.css:92`) |
| `warning/warning` | `--color-warning` (:31) | `--warning` (`variables.css:82`) (`theme.css:37`) |
| `warning/warning-foreground` | `--color-warning-foreground` (:32) | `--warning-foreground` (`variables.css:83`) (`theme.css:38`) |
| `warning/warning-soft-foreground` | `--color-warning-soft-foreground` (:33) | `--warning-soft-foreground` (color-mix, `variables.css:144`) (`theme.css:88`) |
| `danger/danger` | `--color-danger` (:36) | `--danger` (`variables.css:85`) (`theme.css:40`) |
| `danger/danger-foreground` | `--color-danger-foreground` (:37) | `--danger-foreground` (`variables.css:86`) (`theme.css:41`) |
| `danger/danger-soft-foreground` | `--color-danger-soft-foreground` (:38) | `--danger-soft-foreground` (color-mix, `variables.css:140`) (`theme.css:84`) |
| `dimensions/spacing/1` | `--spacing-1` (:43) | derived from `--spacing:0.25rem` (`variables.css:19`) — target hard-codes |
| `dimensions/spacing/2` | `--spacing-2` (:44) | ″ |
| `dimensions/spacing/3` | `--spacing-3` (:45) | ″ |
| `dimensions/spacing/4` | `--spacing-4` (:46) | ″ |
| `dimensions/spacing/6` | `--spacing-6` (:47) | ″ |
| `dimensions/spacing/9` | `--spacing-9` (:48) | ″ |
| `dimensions/spacing/10` | `--spacing-10` (:49) | ″ |
| `dimensions/radius/rounded-3xl` | `--radius-3xl` (:54) | `--radius-3xl: calc(var(--radius)*3)` (`theme.css:110`) |
| `dimensions/radius/rounded-xl` | `--radius-xl` (:55) | `--radius-xl: calc(var(--radius)*1.5)` (`theme.css:108`) |
| `dimensions/font/text-sm` | `--font-size-text-sm` (:60) | Tailwind built-in `text-sm` (oracle uses `@apply text-sm`, `alert.css:23`) |
| `dimensions/leading/text-sm` | `--leading-text-sm` (:61) | built-in `leading-6` in oracle (`alert.css:23`) — **value mismatch** (target 20px / oracle leading-6=24px) |
| `letter-spacing` | `--letter-spacing:0` (:69) | no equivalent (not a `tracking-*` key; oracle never sets it) |
| `font` | `--font-family: Inter…` (:62) | no DS token; oracle relies on app font stack |
| `font-medium` | `--font-weight-medium:500` (:64) | built-in `font-medium` (`alert.css:23`) |
| `font-regular` | `--font-weight-regular:400` (:65) | built-in `font-normal` — **name mismatch** |
| `border-width` | `--border-width:1px` (:70) | `--border-width:1px` (`variables.css:22`) — but **unused** in Alert |
| `blur` (`BACKGROUND_BLUR`) | **— (dropped)** | no direct equivalent; oracle uses `--backdrop`/`--overlay-shadow`, not a blur token. Binding `backdropBlur→blur` (`manifest.json:411`) now dangling |

---

### Bottom line
The target is a **flat, single-mode value sheet** that compiles the Alert but is not a design-system token layer: three files, one populated; primitives only; hex inlined; no dark mode, no semantic indirection, no derived states, and the `blur` effect token dropped (leaving a dangling binding). The oracle, by contrast, runs `primitive → semantic var()(+color-mix) → @theme inline bridge → utility → BEM`, themed at the `[data-theme]` selector level. Most absence is *by construction* (single-node Alert fetch ≈ 20–25% of one mode), but the structural choices (flattening the layers, omitting `semantic.css`, dropping non-color types) are pipeline gaps independent of fetch scope.
