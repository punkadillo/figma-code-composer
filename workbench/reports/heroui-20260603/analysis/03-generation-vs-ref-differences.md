# Report 3 — Agent-Generated Components vs. HeroUI v3 Oracle: Per-Component Differences

**Trial:** `heroui-20260603`
**Generated tree:** `workbench/trials/heroui-20260603/target/src/components/`
**Oracle (HeroUI v3.1.0):** `workbench/trials/heroui-20260603/ref-heroui/packages/react/src/components/`
**Config target:** `framework: react`, `cssSystem: tailwind-v4`, `designMethodology: atomic`, `designSystemName: none`

> Scope note: the agent ran against a `designSystemName: "none"` / atomic config, so it was *never told* to reproduce HeroUI's architecture. This report documents the gap factually; Report 4 argues which parts of the gap are defects vs. legitimate divergence.

---

## 0. The two architectures at a glance

| Axis | Oracle (ref-heroui) | Agent output |
| --- | --- | --- |
| Primitive layer | `react-aria-components` (`Button`, `Input`, `Form`, …) | raw `<button>`/`<input>`/`<div>`/`<form>` |
| Styling | `tailwind-variants` recipe (`buttonVariants` from `@heroui/styles`) → emits **BEM class names** (`button`, `button--primary`); actual CSS in `@heroui/styles/components/*.css` | inline Tailwind utility strings composed with `cn()` |
| Token binding | CSS custom properties indirected through component CSS (`--button-bg: var(--accent)`) | utilities resolving to `var(--color-*)` + arbitrary-value brackets |
| Structure | compound / slotted (`Alert.Root`, `Alert.Title`, `Card.Header`, …) exported via `Object.assign` | monolithic single component with a flat boolean-prop API |
| Client directive | `"use client";` on every component | present only where `useState` used (Input); absent elsewhere |
| Ref / props typing | `ComponentPropsWithRef<typeof Primitive>` + `VariantProps` | hand-written flat interface extending `*HTMLAttributes` + `forwardRef` |
| State naming | react-aria idiom (`isDisabled`, `isInvalid`, `isIconOnly`) | DOM idiom (`disabled`, `isInvalid`, `iconOnly`) |
| Composition | reuses shared `Label`/`Description`/`FieldError`/`CloseButton` primitives | re-rolls each affordance inline (own close `<svg>`, own label, own caret) |

The single most consequential difference: **the oracle is a library of composable primitives; the agent emits self-contained, prop-configured widgets.** Every per-component finding below is a facet of that one split.

---

## 1. Button

**Generated:** `target/src/components/atoms/Button/Button.tsx`
**Oracle:** `ref-heroui/packages/react/src/components/button/button.tsx` + `button.styles.ts` + `@heroui/styles/components/button.css`

### Architecture & dependencies
- **Oracle** (`button.tsx:8`) wraps `react-aria-components/Button`, pulls `buttonVariants` from `@heroui/styles` (`:6`), composes class via `composeTwRenderProps` (`:55`), and participates in a `ButtonGroupContext` for inherited `size`/`variant`/`isDisabled`/`fullWidth` (`:33-44`). The visual styling lives entirely outside the `.tsx` — `button.styles.ts` maps props → BEM class names, and `button.css` defines them with CSS custom properties (`--button-bg`, `--button-bg-hover`, `--button-bg-pressed`).
- **Agent** (`Button.tsx:141`) renders a native `<button>`, no react-aria, no group context, no recipe. Variant/size/icon-only classes are three inline `Record<…, string>` maps (`:89`, `:99`, `:106`) merged with `cn()`.

### Public API / props surface

| Concern | Oracle | Agent |
| --- | --- | --- |
| variant | `variant` (`primary\|secondary\|tertiary\|ghost\|outline\|danger\|danger-soft`) | `variant` (`…\|dangerSoft`) — same 7, but camelCase `dangerSoft` vs kebab `danger-soft` |
| size | `size` (`sm\|md\|lg`) | `size` (`sm\|md\|lg`) ✅ |
| icon-only | `isIconOnly` | `iconOnly` |
| full width | `fullWidth` | ❌ **missing** (oracle has `button--full-width`) |
| disabled | `isDisabled` (react-aria) | native `disabled` |
| icon slots | render-prop children / arbitrary children | `prefix` / `suffix` (ReactNode) + `showPrefix`/`showSuffix` booleans + `label` string |
| pending/loading | `data-pending` state in CSS | ❌ missing |
| ref | `ComponentPropsWithRef` | `forwardRef<HTMLButtonElement>` ✅ |

The agent invented a Figma-flavored slot API (`label`, `prefix`, `suffix`, `showPrefix`, `showSuffix`, `iconOnly`) where the oracle simply accepts `children` and lets the user place icons. The agent dropped `fullWidth` and pending state.

### Styling & token binding
Oracle indirects every color through a CSS variable so themes/group-context can re-point it:
```css
/* button.css */
.button--primary { --button-bg: var(--accent); --button-bg-hover: var(--accent-hover); --button-fg: var(--accent-foreground); }
.button { background-color: var(--button-bg); color: var(--button-fg); }
```
Agent binds tokens directly as Tailwind utilities:
```ts
// Button.tsx:107
primary: "bg-accent text-accent-foreground hover:bg-accent-hover",
```
Functionally equivalent colors, but the agent loses the `--button-bg-pressed` active-state layer and the `transform: scale(0.97)` press animation the oracle ships (`button.css` `&:active`).

### Variants & states
- Oracle states are driven by react-aria data-attributes (`data-focus-visible`, `data-pressed`, `data-hovered`, `data-pending`) **and** pseudo-class fallbacks. Agent uses pseudo-classes only: `focus-visible:ring-4` (`:82`), `disabled:opacity-50` (`:85`), `hover:bg-*` per variant. No pressed/active scale, no pending.
- Size note: oracle `button.css` uses responsive heights `h-10 md:h-9` (base) with empty `.button--md`; the agent hardcodes `h-9` for md (`:91`), losing the responsive bump.

### Accessibility
- Oracle inherits react-aria's full button semantics (keyboard, `aria-pressed` for toggles, focus management).
- Agent uses a native `<button>` (keyboard-accessible by default), defaults `type="button"` to avoid form submits (`:151`, good), and **documents** that `iconOnly` needs an `aria-label` (`:43-46`) but does **not enforce** it — it will render an unlabeled icon button. Oracle's react-aria + the doc convention (use external `Label`) sidestep this.

### TypeScript quality
- Agent: clean. `Omit<ButtonHTMLAttributes, "prefix"|"suffix">` to reclaim the slot names (`:31`) is a genuinely nice touch; full JSDoc.
- Oracle: derives props from the primitive (`ComponentPropsWithRef<typeof ButtonPrimitive> & ButtonVariants`), so it stays in sync with react-aria automatically. Stronger by construction, but only meaningful because react-aria is the base.

---

## 2. Input

**Generated:** `target/src/components/atoms/Input/Input.tsx`
**Oracle:** `ref-heroui/.../input/input.tsx` + `input.styles.ts` + `@heroui/styles/components/input.css`

### Architecture & dependencies
- **Oracle** (`input.tsx`) is *just the input box*: wraps `react-aria-components/Input`, reads `variant` from `TextFieldContext`/`ComboBoxContext` (`:19-24`) so it inherits config from a parent field, applies `inputVariants({fullWidth, variant})`. **22 lines, zero local state.**
- **Agent** (`Input.tsx`) is a `<div>` wrapper around an `<input>` plus **bespoke behavior**: a password show/hide toggle with `useState` (`:26`), an inline eye `<svg>` (`:48-78`), and a number-stepper caret icon (`:37-39`). It conflated "input primitive" with "input affordances."

### Public API / props surface

| Oracle | Agent |
| --- | --- |
| `variant` (`primary\|secondary`), `fullWidth`, all native input attrs via `ComponentPropsWithRef` | `variant` (`primary\|secondary`), `type` (`text\|number\|password` — **narrowed from native** via `Omit<…,"type">`, `:6`), `className` |

The agent's `type` narrowing is actively harmful: it **removes** `email`, `tel`, `url`, `search`, `date`, etc. The Form organism needs `type="email"` and passes it through `TextField` → native input, but a consumer using this `Input` directly cannot type an email field. The oracle keeps the full native surface.

### Styling & token binding
- Oracle: `input.css` `.input` uses semantic field tokens via `@apply` (`bg-field`, `text-field-foreground`, `shadow-field`, `rounded-field`) plus `border-color: var(--field-border)`, with `--input-bg` indirection for the secondary variant.
- Agent: arbitrary-value brackets everywhere — `border-[color:var(--color-field-border)]`, `shadow-[0px_2px_2px_var(--color-field-shadow),…]` (`:13-17`). This works but bypasses the Tailwind scale (the tailwind-v4 adapter explicitly says prefer scale utilities over brackets) and bakes a multi-layer shadow inline.

### Variants & states
- Oracle encodes `hover`/`focus`/`focus-visible`/`invalid`/`disabled` in CSS with both pseudo-class and `data-*` forms, including a distinct **invalid** state (`status-invalid-field`).
- Agent has **no focus, invalid, hover, or disabled styling at all** on the input itself — `inputBase` is `flex-1 bg-transparent outline-none placeholder:…` (`:21`). It dropped every interactive state.

### Accessibility
- Oracle: react-aria `Input` is meant to be wired by a parent `TextField` (label, description, error association handled there).
- Agent: bare `<input>` with no label association; the password toggle button does have a correct dynamic `aria-label` (`:45`).

### TypeScript quality
- Agent narrows away native types (the `type` union), interface is small but lossy.
- Oracle's `ComponentPropsWithRef<typeof InputPrimitive>` keeps full fidelity.

---

## 3. Card

**Generated:** `target/src/components/molecules/Card/Card.tsx` (+ `atoms/CardHeader`, `atoms/CardFooter`)
**Oracle:** `ref-heroui/.../card/card.tsx` + `card.styles.ts` + `@heroui/styles/components/card.css`

### Architecture & dependencies
- **Oracle** is a **slotted compound** built purely from `dom.*` elements + a `CardContext` carrying `cardVariants` slots: `CardRoot`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` (`card.tsx:205`). Root provides a `SurfaceContext` so descendants get on-surface contrast (`:51-64`). Each part reads its slot class from context (`composeSlotClassName(slots?.header, className)`). The user *composes* the card they need.
- **Agent** is a **mega-monolith**: one `Card` component with a 6-value `type` union (`basic\|basic-full\|basic-img\|side\|item\|item-full`, `:18`) and a giant `if (type === …)` ladder rendering six entirely different layouts inline (`:207-467`). It composes the agent's own `CardHeader`/`CardFooter` atoms. 473 lines vs the oracle's 215.

### Public API / props surface
- Oracle: `variant` (`default\|secondary\|tertiary\|transparent`) on Root; everything else is composition. ~1 meaningful prop per part.
- Agent: **~30 props** on one interface (`:26-86`) — `type`, `showClose`, `closeLabel`, `onClose`, `showFooter`, `footerType`, `showBlur`, `showIcon`, `icon`, `tagline`/`showTagline`, `title`/`showTitle`, `description`/`showDescription`, `image`, `imageAlt`, `linkLabel`, `href`, `ctaLabel`, `onCtaClick`, `primaryLabel`, `secondaryLabel`, `avatar`, `footerBody`. This is a direct transcription of Figma variant properties + visibility toggles into a flat prop bag. **The `variant` axis the oracle exposes (`default/secondary/tertiary/transparent` surface tint) is entirely absent**; the agent's `type` is a *layout* axis the oracle doesn't model at all (it expects layout via composition).

### Styling & token binding
- Oracle `card.css`: `.card { @apply relative flex flex-col gap-3 overflow-visible p-4; @apply shadow-surface; border-radius: min(32px, var(--radius-3xl)); }` + `.card--default { @apply bg-surface; }`.
- Agent `cardBase` (`:113`): `relative overflow-hidden bg-surface rounded-3xl shadow-[var(--shadow-card)] backdrop-blur-sm`. Note divergences: `overflow-hidden` vs oracle `overflow-visible`; `rounded-3xl` vs the oracle's clamped `min(32px, var(--radius-3xl))`; a `backdrop-blur-sm` the oracle doesn't have.
- The agent's file is littered with **`// TODO[figma-bind]` inlined raw px** (e.g. `h-6`, `right-2.5`, `size-14`, `h-28` at `:99-107`, `:169-185`, `:392`), and two `style={{ borderRadius: "var(--radius-card-item)" }}` inline styles (`:392`, `:436`). Per `component-builder.md` § Mandatory pre-flight rule 1 and CLAUDE.md rule 4, unbound values should have **blocked** the component, not been inlined with TODO markers — this is a contract violation the agent shipped anyway.

### Variants & states
- Oracle: 4 surface variants via `tv()` slots; no interactive states needed (static container).
- Agent: 6 layout types via JSX branching; close button has hover/focus states hand-rolled (`:179-181`).

### Accessibility
- Oracle: semantic `dom.h3` title, `dom.p` description, slots; users add roles as needed.
- Agent: close button is labeled (`aria-label={closeLabel}`, `:165`); chevron and blur are `aria-hidden` (`:409`, `:255`). CardHeader uses `<h3>` for title (`:74` of CardHeader.tsx) — reasonable. But the close/chevron `<svg>`s are hand-inlined rather than reusing an icon component.

### TypeScript quality
- Oracle uses a polymorphic `DOMRenderProps<E>` generic so any part can change its element (`as` pattern). Sophisticated.
- Agent: a single fat `CardProps extends HTMLAttributes<HTMLDivElement>`. Many props are mutually exclusive by `type` but the type system doesn't express that (e.g. `showBlur` only applies to `basic-full`) — no discriminated union. A consumer can pass nonsensical combinations.

---

## 4. Alert

**Generated:** `target/src/components/molecules/Alert/Alert.tsx`
**Oracle:** `ref-heroui/.../alert/alert.tsx` + `alert.styles.ts` + `@heroui/styles/components/alert.css`
**Manifest:** `/tmp/figma-20260605-0151-heroui-72355/manifest.json` (Alert = node `2852:11850`, `layer: molecule`)

### Architecture & dependencies
- **Oracle** is a slotted compound: `AlertRoot`, `AlertIndicator`, `AlertContent`, `AlertTitle`, `AlertDescription` (`alert.tsx:194`), context carries `status` + `slots` from `alertVariants`. `AlertIndicator` auto-selects a default icon by status (`:79-92`). Notably the oracle has **no built-in action button or close button** — those are composed by the user (and a separate `CloseButton` component exists at `components/close-button/`).
- **Agent** is a single function `Alert` (not even `forwardRef` — `:163`) with a flat prop API and inline everything: a `variantIconMap` of 5 imported icon components (`:88-94`), title/description spans, an embedded `<Button>` action, and a hand-rolled close `<button>` (`:242`).

### Public API / props surface

| Oracle | Agent |
| --- | --- |
| `status` (`default\|accent\|success\|warning\|danger`) on Root; children compose the rest | `variant` (same 5 values, **renamed** `status`→`variant`), `title`, `description`, `showIcon`, `showDescription`, `showAction`, `actionLabel`, `onAction`, `showDiscard`, `onDiscard`, `className` |

The agent again flattens a compound into ~11 props with `show*` toggles and **default string content** (`title = "This is an alert"`, `:165`) — those Figma placeholder strings are baked in as defaults, which is a smell (renders dummy copy if the consumer forgets a title).

### Styling & token binding
- Oracle `alert.css`: `.alert { @apply flex w-full flex-row items-start justify-start gap-4 bg-surface px-4 py-3 shadow-surface; border-radius: min(32px, var(--radius-3xl)); }` with per-status `.alert--<status> .alert__title { @apply text-<status>-soft-foreground; }`.
- Agent: inline utilities `flex w-full items-center gap-2 px-4 py-3 bg-surface rounded-3xl … backdrop-blur-sm` (`:184-195`) with per-variant `titleColorMap`/`actionBgMap` records (`:110`, `:124`). Divergences vs oracle: `items-center` vs `items-start`, `gap-2` vs `gap-4`, `backdrop-blur-sm` (not in oracle), `rounded-3xl` vs clamped radius. Token *names* match the oracle's semantic tokens (good — `text-<status>-soft-foreground`).

### Variants & states
- Oracle: 5 statuses via `tv()` slots; icon chosen in `AlertIndicator`.
- Agent: 5 variants via maps; icon chosen via `variantIconMap`. Equivalent coverage.

### Accessibility
- **Agent is actually *better* here than a naive port:** it derives a live-region role — `role="alert" aria-live="assertive"` for danger/warning, `role="status" aria-live="polite"` otherwise (`:177`, `:181-183`), plus `aria-atomic`. The oracle's static `dom.div` alert doesn't add live-region semantics at the Root (it leaves that to the consumer). This is a genuine win for the agent.
- Discard button is labeled `aria-label="Dismiss alert"` (`:244`); icons are `aria-hidden`.

### TypeScript quality
- Agent: clean flat interface, good JSDoc, but **not** `forwardRef` (can't take a ref — inconsistent with every other agent component).
- Oracle: per-part prop types + `AlertVariants`.

### Notable contract behavior
- The manifest's only unbound value is `width: 460px` (`intentionalLiteral: null`). The agent correctly **did not inline it** and documented why (`:103-106`: renders fluid, caller can cap via className). This is the rule-4 behavior the Card component *failed* to follow — so the agent is inconsistent run-to-run on the unbound-value rule.

---

## 5. Form

**Generated:** `target/src/components/organisms/Form/Form.tsx`
**Oracle:** `ref-heroui/.../form/form.tsx`

### Architecture & dependencies
- **Oracle is a 22-line pass-through**: `FormRoot` wraps `react-aria-components/Form` and spreads props (`form.tsx:13-15`). It is a *primitive* — react-aria's `Form` gives validation propagation, native submit handling, and `validationBehavior`. It contains **no fields** — the user composes fields inside it.
- **Agent's Form is a fully-furnished contact form**: hardcoded `TextField "Your name"`, `TextField "Your email"`, `TextArea "Additional notes"`, a Terms-of-Service paragraph with two `<a>` links, and a Back/Confirm button row (`Form.tsx:69-134`). It is a *concrete instance*, not a primitive.

This is the **largest semantic divergence** of the five. The oracle `Form` and the agent `Form` are not the same kind of object: one is a reusable wrapper, the other is one specific screen captured from Figma node `14065:36430`. The agent transcribed the design literally (fields, copy, links and all) rather than producing a composable Form primitive.

### Public API / props surface
- Oracle: full `react-aria-components/Form` surface (`onSubmit`, `validationBehavior`, `validationErrors`, …) via `ComponentPropsWithRef`.
- Agent: `onBack`, `onConfirm`, `className` (`:8-23`). The fields and copy are **not** parameterized — you cannot change the labels, add a field, or remove the Terms text without editing source.

### Styling & token binding
- Agent: `flex flex-col gap-4 pt-8 pb-4` root (`:63`); literal copy and `text-foreground-inverted` link color. Comments (`:96-98`, `:117-119`) admit several values were **unbound literals auto-mapped to nearest tokens** in a prior run (`gap-2`, `pt-2`, `#fcfcfc`) — again the inline-unbound behavior the spec forbids.
- Oracle: no styling; that's the user's job.

### Variants & states / Accessibility
- Oracle: react-aria handles field error propagation and submit semantics.
- Agent: native `<form onSubmit>` calling `onConfirm` (`:55-57`); fields delegate a11y to `TextField`/`TextArea` (which do associate labels via `htmlFor`/`useId` — see `TextField.tsx:67-84`). Reasonable, but no validation wiring.

### TypeScript quality
- Both fine; agent `forwardRef<HTMLFormElement>`, oracle `ComponentPropsWithRef`.

---

## 6. Icons (short note)

**Generated:** `target/src/components/icons/*.tsx`
**Oracle:** HeroUI uses **Iconify + gravity-ui** (per `ref-heroui/CLAUDE.md` § Icon Library); there are no per-icon `.tsx` files in the oracle to diff against — Alert's icons come from `../icons` re-exports (`alert.tsx:13`).

- Agent emits standalone function components, default-exported, with a `{ size, className, 'aria-label', title }` prop shape (e.g. `CircleCheckIcon.tsx:10`). Reasonable and self-contained.
- **Bug:** every icon hardcodes `aria-hidden="true"` **and** accepts an `aria-label` prop (`CircleCheckIcon.tsx:25-26`) — `aria-hidden` always wins, so a caller-supplied `aria-label` is dead. The `role="img"` + `aria-hidden` combination is contradictory.
- **Inconsistent barrel style:** `icons/index.ts` mixes `export { default as X }; export type { XProps }` (most icons) with a combined `export { default as Check2, type Check2Props }` form, and `CaretsExpandVertical` exports no type. Cosmetic but uneven.
- Versus the oracle's approach (pull from an icon set), the agent's hand-drawn SVG paths (e.g. the eye/eye-off in `Input.tsx:48-78`, the close `M4 4L12 12…` in `Card.tsx:193`) are approximations, not the design's actual gravity-ui glyphs.

---

## 7. Summary differences matrix

| Dimension | Button | Input | Card | Alert | Form |
| --- | --- | --- | --- | --- | --- |
| Oracle base | `react-aria Button` | `react-aria Input` | `dom.*` + context | `dom.*` + context | `react-aria Form` |
| Agent base | `<button>` | `<div><input>` | `<div>` ladder | `<div>` | `<form>` |
| Oracle = primitive/compound | compound | primitive (context-fed) | compound (6 slots) | compound (5 slots) | primitive |
| Agent = monolith | yes | yes (+behavior) | yes (6-way `type`) | yes | **concrete instance** |
| Recipe system used | ❌ inline maps | ❌ inline | ❌ inline | ❌ inline | ❌ none |
| Variant-prop name parity | `dangerSoft`≠`danger-soft`; `iconOnly`≠`isIconOnly`; no `fullWidth` | `type` narrowed (loses email/url/…) | `variant` axis missing; invented `type` | `variant`≠`status` | n/a |
| Interactive states | hover/focus only (no pressed/pending) | **none** | close-btn only | none on root | none |
| Token binding | utility (direct) | arbitrary-value brackets | utility + inline `style` + raw px TODOs | utility (semantic names ✅) | utility + auto-mapped literals |
| Unbound-value rule honored | n/a | n/a | ❌ inlined w/ TODO | ✅ width left fluid | ❌ inlined w/ auto-map |
| a11y | doc-only iconOnly label | bare input | labeled close/hidden chevron | ✅ live-region role (better than oracle) | delegates to TextField |
| `forwardRef` | ✅ | ✅ | ✅ | ❌ | ✅ |
| `"use client"` | ❌ (not needed) | ❌ (has useState! ⚠️) | ❌ | ❌ | ❌ |
| Lines (.tsx) | 191 | 87 | 473 | 263 | 140 |
| Oracle lines (.tsx) | 73 | 41 | 215 | 203 | 22 |

> ⚠️ **`Input.tsx` uses `useState` (`:26`) but has no `"use client"` directive** — under Next.js App Router (a supported `frameworkVariant`) this is a build error. The react adapter (`adapters/frameworks/react.md` § Gotchas) explicitly calls this out, and `component-builder.md` Protocol step says the builder "must detect interactive props and emit the directive." It did not.

---

## 8. The layer-classification mismatch (call-out)

The benchmark ladder (`workbench/trials/heroui-20260603/ladder-nodes.json`) assigns each node a `rung`:

| Node | Ladder `rung` | Agent placed in | Off by |
| --- | --- | --- | --- |
| Button (`5375:69211`) | `atom` | `atoms/Button` | ✅ correct |
| Input (`17293:26222`) | `molecule` | **`atoms/Input`** | −1 tier |
| Card (`5375:72791`) | `organism` | **`molecules/Card`** | −1 tier |
| Form (`14065:36430`) | `template` | **`organisms/Form`** | −1 tier |
| Alert (`5375:72355`) | (`all-icons` run) | `molecules/Alert` | matches manifest |

Everything except Button (and Alert) is filed **exactly one atomic tier lower** than the ladder expects. The agent's own Alert manifest (`/tmp/figma-…/manifest.json`) shows the *fetcher* stamped all six Alert-run nodes as `layer: molecule` with `targetDir: …/molecules`, so the misclassification originates in **`figma-fetcher`'s `layer` heuristic**, not the builder (the builder faithfully writes to whatever `targetDir` the manifest hands it — `component-builder.md` Protocol step 1).

Why it drifts down a tier: the heuristic in `protocols/component-layout.md` § Layer resolution is structural — "composes ≥1 atom → molecule," "composes molecules → organism." HeroUI's Figma nodes for Input/Card/Form are largely *self-contained* in the design file (their sub-parts aren't separate Figma components the fetcher recognizes as atoms), so the fetcher sees "primitive-looking" trees and classifies conservatively low. The ladder, by contrast, ranks by *intended composite complexity*. The two definitions of "tier" simply disagree — see Report 4 § layer rules for the fix.

Consequence: story titles (`Components/{Layer}/{Name}`) and any downstream tier-based routing inherit the wrong layer, and `Form` — a `template` in the ladder — was emitted as a fully-built `organism` instance, compounding the "concrete instance vs primitive" problem in §5.
