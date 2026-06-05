# Report 4 — Improvements & Agent Tuning

**Trial:** `heroui-20260603`
**Companion:** see `03-generation-vs-ref-differences.md` for the evidence behind every claim here.
**Config target:** `framework: react`, `cssSystem: tailwind-v4`, `designMethodology: atomic`, `designSystemName: none`.

---

## 0. Framing: is matching HeroUI even the goal?

**No — and this matters for how we read the scores.** The agent ran with `designSystemName: "none"` and `designMethodology: "atomic"`. Per `component-builder.md` Protocol step 4, a `none` design system means the builder uses only `adapters/frameworks/react.md` + `adapters/css/tailwind-v4.md` and emits **idiomatic standalone components** — raw elements + inline Tailwind. It was *never instructed* to reproduce react-aria primitives, `tailwind-variants` recipes, the `@heroui/styles` CSS package, or the compound/slotted pattern. Those are HeroUI-internal architecture choices that only make sense when you're shipping HeroUI.

So there are **two different bars**, and a finding belongs to exactly one:

- **Bar A — "idiomatic standalone" (the contract the agent was actually given).** Judge the output as a self-contained Tailwind+React component library. Most of the architecture gap (no react-aria, no recipe system, no compound exports) is *acceptable divergence*, not a defect. The defects here are correctness/quality bugs the agent committed *against its own contract*.
- **Bar B — "match HeroUI."** Only relevant if we decide the benchmark wants design-system fidelity. Reaching it requires a **new `adapters/design-systems/heroui.md`** and flipping the config to `designSystemName: "heroui"`. That's a product decision, not a bug fix.

This report fixes Bar A first (cheap, high-impact, correct-by-the-agent's-own-rules), then describes what Bar B would take.

---

## Part A — Concrete improvements to the generated components

What "good" standalone output looks like, ranked by impact. Each item says whether it's a **bug** (violates the agent's existing contract) or a **polish** item.

### A1. [BUG, P0] `Input.tsx` must emit `"use client"` (or drop the state)
`Input.tsx:26` calls `useState` for the password toggle but the file has no `"use client";`. Under Next.js App Router this is a hard build failure. `adapters/frameworks/react.md` § Gotchas and `component-builder.md` Protocol both already require detecting interactive hooks and emitting the directive. **Fix:** prepend `"use client";`. (Better still — see A4 — the password toggle shouldn't live in the primitive at all.)

### A2. [BUG, P0] Stop inlining unbound values with `// TODO[figma-bind]`
`Card.tsx` inlines `h-6`, `right-2.5`, `size-14`, `h-28`, and two `style={{ borderRadius: "var(--radius-card-item)" }}` (`:99-107`, `:169-185`, `:392`, `:436`); `Form.tsx:96-119` auto-maps unbound `#fcfcfc`/`gap-2`/`pt-2` to "nearest tokens." Both violate **CLAUDE.md rule 4** and `component-builder.md` § Mandatory pre-flight rule 1 ("stop-and-flag means stop: do not write the file"). The agent followed the rule correctly for Alert's `width:460px` (`Alert.tsx:103-106`, left fluid) but broke it for Card and Form — it is **inconsistent run to run**. **Fix:** these components should have been `skipped[]` and escalated as blocking ambiguities so the unbound Figma values get rebound, *or* the value confirmed `intentionalLiteral`. "Good" output contains zero `TODO[figma-bind]` markers.

### A3. [BUG, P0] `Input` must not narrow the native `type` union
`Input.tsx:6` does `Omit<InputHTMLAttributes,"type">` then re-adds `type?: "text"|"number"|"password"`, deleting `email`/`url`/`tel`/`search`/`date`/… The Form needs `type="email"` (it currently only works because it routes through `TextField`'s un-narrowed input). **Fix:** keep the native `type`; if the component wants to *react* to `type==="password"|"number"`, branch internally without removing the other values from the public type.

### A4. [POLISH, P1] Split the Input primitive from its affordances
The oracle keeps `Input` a 41-line primitive and composes password-reveal / number-stepper elsewhere. The agent's `Input` bundles a stateful eye toggle and a caret. For standalone output that's a judgment call, but the cleaner shape is: a bare presentational `Input` (no state, full native props, with hover/focus/invalid/disabled classes — see A5) plus optional `PasswordInput` / `NumberInput` wrappers. This also removes the `"use client"` need from the base input.

### A5. [BUG, P1] Input has no focus/invalid/hover/disabled styling
`inputBase` (`Input.tsx:21`) is `flex-1 bg-transparent outline-none …` — it dropped **every** interactive state the oracle ships (`input.css` has hover, focus, `status-invalid-field`, disabled). A form input with no visible focus ring is an a11y regression. **Fix:** add focus-visible ring, invalid border, disabled opacity classes (the agent already knows how — see `TextField.tsx:104-107`).

### A6. [BUG, P1] Enforce the icon-only accessible name instead of documenting it
`Button.tsx:43-46` *documents* that `iconOnly` needs an `aria-label` but renders an unlabeled button anyway. `component-builder.md` § step 6 says "Refuse to emit a component missing required a11y attrs — flag it." **Fix:** when `iconOnly` and no `aria-label`/`aria-labelledby`, either require it via types (overload the props) or dev-warn; do not silently ship an inaccessible control.

### A7. [BUG, P1] Fix the icon `aria-hidden`/`aria-label` contradiction
Every icon (e.g. `CircleCheckIcon.tsx:25-26`) hardcodes `aria-hidden="true"` while also accepting `aria-label` — the label is dead and `role="img"`+`aria-hidden` is contradictory. **Fix:** if `aria-label`/`title` is provided, set `role="img"` and **omit** `aria-hidden`; otherwise `aria-hidden="true"` with no `role`.

### A8. [POLISH, P2] Restore dropped variant axes & states on Button
Add `fullWidth` and a pressed/pending state (oracle has `button--full-width`, `data-pending`, `:active{scale}`). Align the disabled idiom: the agent uses native `disabled` (fine for standalone) — keep it, just document the divergence from react-aria `isDisabled`.

### A9. [POLISH, P2] Card — model the right axis and use a discriminated union
The agent's `Card` is a 6-way `type` ladder (`Card.tsx:18,207-467`) with ~30 flat props, and it **dropped the oracle's surface `variant`** (`default/secondary/tertiary/transparent`). For standalone output the monolith is defensible, but: (a) the 30-prop bag should be a **discriminated union on `type`** so `showBlur` can't be set on a non-`basic-full` card; (b) consider exposing `CardHeader`/`CardFooter`/`CardContent` as composable sub-exports (the agent *already built* CardHeader/CardFooter as separate files — it should export and document them as a compound, not hide them behind props).

### A10. [BUG, P1] Form should be a parameterized primitive, not a hardcoded screen
`Form.tsx` bakes in two named fields, a Terms paragraph, two `<a>` links, and a Back/Confirm row from Figma node `14065:36430`. As shipped it's un-reusable: you can't change a label or add a field without editing source. **Fix (standalone):** emit a `Form` that takes `children` + `onSubmit`/`onBack` and let the *story* show the contact-form composition — OR, if the benchmark wants the literal screen, file it as a `template`/example, not a reusable `organisms/Form`. This ties directly to the layer mismatch (B-side, below).

### A11. [POLISH, P2] Drop placeholder Figma copy from prop defaults
`Alert.tsx:165-166` defaults `title="This is an alert"` / `description="Add description in this place"` — Figma placeholder strings leaking into runtime defaults. Make `title` required (or default to empty), so a forgotten prop renders nothing, not dummy copy.

### A12. [POLISH, P2] Prefer scale utilities over arbitrary-value brackets
`Input.tsx:13-17` uses `border-[color:var(--color-field-border)]`, `shadow-[0px_2px_2px_…]`. `adapters/css/tailwind-v4.md` § Component class attachment / Gotchas says prefer scale utilities (`border-field`, a named `shadow-field`) over brackets. Emit/consume a `--shadow-field` token and use `shadow-field` like the oracle does.

### A13. [POLISH, P3] Minor consistency
- `Alert` should be `forwardRef` like every other component (it isn't — `Alert.tsx:163`).
- Normalize the icons barrel (`icons/index.ts`) to one export form; add the missing `CaretsExpandVerticalProps` type export.
- Reconcile Card base vs oracle: `overflow-hidden`→consider `overflow-visible`, drop the gratuitous `backdrop-blur-sm` on Alert/Card unless the design actually specifies it.

---

## Part B — How to change the agent to produce that

Two distinct lever classes. **Most A-items are prompt/heuristic tweaks; only Bar-B fidelity needs a new adapter.**

### B1. Layer classification — fix `figma-fetcher` + `protocols/component-layout.md` (highest leverage)

**Problem (Report 3 §8):** Input→`atoms` (ladder says molecule), Card→`molecules` (organism), Form→`organisms` (template) — every non-trivial node lands **one tier low**. The Alert manifest (`/tmp/figma-…/manifest.json`) proves the wrong `layer` is stamped by the **fetcher**, not the builder; the builder just writes to the manifest's `targetDir`.

**Root cause:** `component-layout.md` § Layer resolution is a *structural* heuristic ("composes ≥1 atom → molecule"). HeroUI's Figma nodes are self-contained, so the fetcher sees no nested atom-components and grades down. The ladder grades by *intended composite role*.

**Levers (in priority order):**
1. **`protocols/component-layout.md` § Layer resolution** — rewrite the atomic heuristics so they don't depend solely on whether sub-parts are *separate Figma components*. Add signals: child-node count / depth, presence of form-control children (→ molecule+), presence of a button row or multiple sub-regions (→ organism+), full-canvas frame with slots (→ template). Document that a flat-but-rich node (Card, Form) is still a molecule/organism/template.
2. **`figma-fetcher` agent** — apply the revised heuristic and, crucially, **surface low-confidence classifications as a flag** so the coordinator can ask rather than silently filing one tier low. The `figma-layer:` override annotation already exists (`component-layout.md` § Override) — the fetcher should *suggest* it when confidence is low.
3. **`protocols/figma-manifest.md` § "Layer drives placement"** — note that `layer` is advisory and may be overridden; record a `layerConfidence`.

This is a **heuristic/prompt fix**, no new files. It also fixes the Form §A10 problem at the source: if Form is correctly a `template`, the agent stops trying to ship it as a reusable `organisms/Form` and files it as an example.

### B2. Unbound-value discipline — `component-builder.md` (prompt fix)

The rule already exists (§ Mandatory pre-flight rule 1) — the agent **disobeyed it for Card/Form** while obeying it for Alert. Levers:
- Strengthen `component-builder.md` with an explicit **"zero `TODO[figma-bind]` in committed output"** invariant and an example of the Card-style violation as a negative case (the file already uses PDP-2026 negative examples this way).
- Add a **post-write self-check**: grep your own output for `TODO[figma-bind]` / inline `style={{` / arbitrary px brackets on spacing; if found on an unbound property, convert to a `skipped[]` abort. This catches the inconsistency mechanically rather than relying on the model remembering mid-generation.

### B3. `"use client"` + interactive-state coverage — `adapters/frameworks/react.md` (prompt/checklist fix)

- The directive rule is in the adapter § Gotchas but was missed. Promote it to a **hard checklist item** in `component-builder.md` Protocol: "if the emitted file contains `useState`/`useEffect`/`useReducer`/event-handler-with-state → first line is `\"use client\";`." Add a self-grep.
- Add an **"interactive elements must style focus/hover/disabled/invalid"** checklist item so primitives like Input don't ship stateless (A5).

### B4. Native-type preservation & a11y enforcement — `adapters/frameworks/react.md` + `component-builder.md`

- React adapter § "Props convention": add a rule **"never narrow a native HTML attribute union; extend, don't `Omit`-and-replace"** (fixes A3). Branch on a value internally without deleting it from the public type.
- `component-builder.md` § step 6 already mandates accessible names — make it **enforced in types** for icon-only controls (A6) and fix the icon `aria-hidden` template (A7). The icon template lives with `icon-generator`, not the builder, so A7's lever is the **icon-generator agent / its adapter**, not `component-builder.md`.

### B5. Prop-surface shaping (monolith vs compound vs slots) — `component-builder.md` slot-detection heuristic

The flat-prop-bag style (Card's 30 props, Alert's `show*` toggles, Button's `label`/`prefix`/`suffix`) is the agent's default for `designSystemName: none`. To get composable output:
- Add a **slot-detection heuristic** to `component-builder.md`: when a manifest node has repeated optional sub-regions (header/body/footer, icon+title+description), prefer **sub-component exports + composition** over `show*` booleans. The agent already half-does this (CardHeader/CardFooter are separate files) — it just needs to *export them as a compound* and stop hiding them behind `showFooter`-style flags.
- Add a **discriminated-union rule** for mutually-exclusive variant props (A9).
- This is a **heuristic/prompt tweak**, but it's the one that most changes the "feel" toward the oracle without adopting react-aria.

### B6. Bar B — a HeroUI design-system adapter (only if fidelity is the goal)

If the benchmark decides it wants HeroUI-architecture output, the **only correct lever** is a new `adapters/design-systems/heroui.md` plus flipping `config.designSystem.name` to `"heroui"`. Per `component-builder.md` step 4, a DS adapter *overrides* the framework+CSS adapters. That adapter would have to teach:
- Wrap `react-aria-components` primitives (`Button`, `Input`, `Form`, `TextField`); use react-aria state idiom (`isDisabled`, `isInvalid`, `isIconOnly`).
- Use `tailwind-variants` `tv()` recipes emitting BEM class names + a separate `@heroui/styles`-style CSS layer (this also implies the **token-builder / a CSS-emitting step** produces the `.css` recipes, not just `@theme` vars — a larger change).
- Compound/slotted exports via `Object.assign` (`Alert.Root/.Title/.Description`), `composeTwRenderProps`, `data-slot` attributes, `"use client"` on all.
- `ComponentPropsWithRef<typeof Primitive>` typing; reuse shared `Label`/`Description`/`FieldError`/`CloseButton` instead of re-rolling.

This is a **large, separate workstream** and arguably out of scope for a `none`/atomic benchmark — recommend doing it only as a deliberate "DS-fidelity" trial, not as a fix to this run.

---

## Priority summary

| # | Item | Type | Lever (file) | Priority |
| --- | --- | --- | --- | --- |
| A1 | `Input` missing `"use client"` | bug | `component-builder.md` + `adapters/frameworks/react.md` (self-grep) | **P0** |
| A2 | Card/Form inline unbound values w/ TODOs | bug (rule 4) | `component-builder.md` pre-flight + self-grep | **P0** |
| A3 | `Input` narrows native `type` | bug | `adapters/frameworks/react.md` props convention | **P0** |
| B1 | Layer one-tier-low (Input/Card/Form) | heuristic | `component-layout.md` + `figma-fetcher` + `figma-manifest.md` | **P0** |
| A5 | Input has no focus/invalid/disabled state | bug | `component-builder.md` checklist | P1 |
| A6 | icon-only accessible name not enforced | bug | `component-builder.md` §6 | P1 |
| A7 | icon `aria-hidden`/`aria-label` contradiction | bug | icon-generator adapter | P1 |
| A10 | Form is a hardcoded screen, not a primitive | bug/structural | resolved by B1 (template) + `component-builder.md` slot rule | P1 |
| A4/A9/B5 | split affordances; compound exports; discriminated unions | polish | `component-builder.md` slot-detection heuristic | P2 |
| A8/A11/A12/A13 | dropped variants, placeholder defaults, bracket utilities, forwardRef/barrel consistency | polish | `component-builder.md` + `tailwind-v4.md` | P2–P3 |
| B6 | HeroUI architecture fidelity | new capability | **new** `adapters/design-systems/heroui.md` + config flip | Optional (Bar B) |

**Bottom line:** the highest-value fixes (B1 layer heuristic, A1/A2/A3 correctness bugs) are all **prompt/heuristic/adapter-text edits** to existing files — no new infrastructure. They make the agent correct *against its own `none`/atomic contract*. Matching HeroUI's react-aria + tailwind-variants architecture (B6) is a separate, optional design-system-adapter project and should not be conflated with fixing this run.
