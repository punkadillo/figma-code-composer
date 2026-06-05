# Tailwind v4 adapter

## When to use
`config.cssSystem.name == "tailwind-v4"`. Tailwind v4 is **CSS-only** — no `tailwind.config.{js,ts,cjs,mjs}` allowed.

## Token emission

Strategy: `tailwind-css-vars`. Each emitted file is plain CSS with one or more `@theme` blocks:

```css
/* {{tokens.outputDir}}/primitives.css */
@import "tailwindcss";

@theme {
  --color-brand-primary: #FF6E1D;
  --color-brand-secondary: #1A1A1A;
  --spacing-1: 0.25rem;
  --spacing-2: 0.5rem;
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  /* ...one declaration per token */
}
```

Theming (multi-mode tokens):

```css
/* {{tokens.outputDir}}/semantic.css */
@theme {
  --color-surface-bg: var(--color-neutral-100);
  --color-surface-fg: var(--color-neutral-900);
}

:root {
  --color-surface-bg: var(--color-neutral-100);
}
[data-theme="dark"] {
  --color-surface-bg: var(--color-neutral-900);
}
```

## Naming convention

Tailwind v4 derives utility names from `@theme` keys:

| Token in `@theme`                | Utility class                          |
| -------------------------------- | -------------------------------------- |
| `--color-brand-primary`          | `text-brand-primary`, `bg-brand-primary`, `border-brand-primary`, etc. |
| `--spacing-1`                    | `p-1`, `m-1`, `gap-1`, etc.            |
| `--radius-md`                    | `rounded-md`                           |
| `--font-display`                 | `font-display`                         |

The `tokens.prefix` config value (e.g. `--app-`) is recommended ONLY for namespaced custom tokens — Tailwind's built-in scales should keep canonical names.

## Component class attachment

`component-builder` emits utility classes with `cssSystem.config.prefix` (default empty; pass `tw:` when configured):

```tsx
<div className="tw:flex tw:items-center tw:gap-2 tw:bg-brand-primary tw:text-white">
```

**Prefix order is binding**: `<prefix>:<modifier>:<utility>`. Inverted (`hover:tw:bg-foo`) compiles to nothing.

## Custom token registration

When using `tailwind-merge` (the recommended class-merger for React), every custom token group MUST be registered via `extendTailwindMerge` at `config.cssSystem.config.extendTailwindMergePath`:

```ts
// src/lib/utils.ts (or wherever extendTailwindMergePath points)
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "text-color": ["text-brand-primary", "text-brand-secondary"],
      "bg-color": ["bg-brand-primary", "bg-brand-secondary"],
      "rounded": ["rounded-app-sm", "rounded-app-md"],
    }
  }
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Token-builder MUST update this file** when emitting tokens, or `tailwind-merge` will silently strip the new classes when combined with built-in classes of the same group.

## Gotchas

- **Prefer named scale utilities over arbitrary brackets.** Use token-backed scale utilities
  (`shadow-field`, `rounded-3xl`, `gap-4`) over arbitrary values (`shadow-[…]`, `rounded-[12px]`) whenever a
  scale utility exists for the value. Arbitrary brackets are a last resort for genuinely one-off BOUND
  values — never for unbound ones (those block per binding rule 4).
- **No config file**: `tailwind.config.{js,ts,cjs,mjs}` is always blocked. All configuration goes in CSS.
- **Prefix order**: see above. Grep before declaring done.
- **Prefer the spacing scale over arbitrary brackets (ALL sizing/spacing utilities).** v4's spacing scale is dynamic — `<utility>-<n>` compiles to `calc(var(--spacing) * n)` for ANY `n`, decimals included — so a raw px value should become a scale utility, not an arbitrary `[…px]` value. Convert with `n = px ÷ baseSpacingPx`, where `baseSpacingPx` is the project's `--spacing` base in px (Tailwind default `0.25rem` = **4px**; read the project's `@theme` in case it's customized — this is project-specific). Applies to `w/h`, `min-/max-w/h`, `p*`, `m*`, `gap*`, `inset/top/right/bottom/left`, `space-*`, `size-*`, etc. Examples (default 4px base, honoring the configured prefix e.g. `tw:`):
  - `184px` → `w-46` (184 ÷ 4) — **not** `w-[184px]`
  - `447px` → `max-w-111.75` (447 ÷ 4; decimals are fine)
  - `14px` → `p-3.5` (14 ÷ 4)
  Reserve arbitrary `[…px]` brackets ONLY for values that don't divide cleanly into the base (and aren't worth a decimal), or non-spacing one-offs. This holds even when inlining a user-approved unbound value — inline it as the scale utility, not a bracket. (A stray `[184px]` is harmless and a dev can hand-fix it; don't trigger `/figma-update` just for this.)
- **`tailwind-merge` silent stripping**: unregistered tokens get dropped when collided with built-ins (e.g. setting both `text-foo` and `text-red-500` when `text-foo` isn't registered → only `text-red-500` survives).
- **Token name collisions across modes**: same name, different value across `:root` / `[data-theme=…]` is correct. Same name DEFINED inside `@theme` twice across files is undefined behaviour — emit only once.
