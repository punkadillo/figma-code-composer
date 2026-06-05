# Source-fidelity & quality scorecard — `heroui-20260603`

The portion of the accuracy/quality scorecard that **is** computable from the on-disk `target` + `ref-heroui` source, generated this run (see [`01-accuracy-feasibility.md`](./01-accuracy-feasibility.md) for what's excluded and why). Summary tables are wired into [`../report.md`](../report.md); full per-dimension rationales are here.

## Method
- **Build gates** — deterministic. `tsc --noEmit` and `vite build` run once over the target; unit tests (`vitest`) counted per rung. tsc and build are whole-target (both clean).
- **Quality** — the canonical **3-vote median panel**: 15 independent judge agents (3 per rung × 5 scored rungs) each scored all five dimensions 0–100 over `oracle/rubric.md`, given the `target` component + its `ref-heroui` oracle. Each dimension cell is the **median of the 3 votes** (`oracle/judge.mjs` `judgePanel`); the composite is the weighted blend (`oracle/quality-weights.json`: optimizedCode .25, dx .20, docs .15, testDepth .25, storybook .15, `composeQuality`). The deterministic metric-blend layer (tsc/coverage/bundler numbers) is not applied; cells are judge medians. Panel spread was tight — most dimensions varied ≤6 points across the 3 votes.
- **Excluded:** visual (pixel-diff) and style (computed-style) — need live rendering (~65% of the fidelity composite). `icon-only` (not a full component) and `page` (no component produced) are out of quality scope.
- **Judged as standalone idiomatic React**, NOT as HeroUI/react-aria fidelity — the trial ran `designSystem: none`.

## Build gates

| rung | component | tsc | build | unit tests | gate |
|---|---|:--:|:--:|---:|:--:|
| icon-only | (icons) | ✓ | ✓ | — | ✓ |
| atom | Button | ✓ | ✓ | 17/17 | ✓ |
| molecule | Input | ✓ | ✓ | 10/10 | ✓ |
| organism | Card | ✓ | ✓ | 26/26 | ✓ |
| template | Form | ✓ | ✓ | 12/13 | ✗ |
| page | (none) | — | — | — | — |
| all-icons | Alert | ✓ | ✓ | 25/25 | ✓ |

Only `Form` fails its gate: the test `merges custom className onto the root form` (`Form.test.tsx:96`) queries `getByRole("form")`, but a `<form>` only exposes the implicit `form` role when it has an accessible name — the generated form has none, so the query throws. A shipped failing test = correctness gap.

> Separately, `vitest` mis-collects the Playwright `e2e/Alert.spec.ts` (it errors on load under the unit runner). That's a runner-config issue (e2e glob not excluded), not a component defect.

## Quality (weighted composite + dimensions)

| rung | component | composite | optimizedCode | dx | docs | testDepth | storybook |
|---|---|---:|---:|---:|---:|---:|---:|
| all-icons | Alert | **90** | 88 | 91 | 89 | 90 | 93 |
| atom | Button | **86** | 88 | 90 | 87 | 78 | 90 |
| molecule | Input | **62** | 62 | 55 | 42 | 72 | 74 |
| organism | Card | **56** | 52 | 55 | 62 | 48 | 70 |
| template | Form | **50** | 52 | 38 | 55 | 55 | 52 |

Cells are the per-dimension median of the 3-vote panel; composite is the weighted blend. Clear split: **Alert and Button are strong** (idiomatic, well-tested, well-documented — Alert edges ahead on its a11y/story depth); **Input, Card, Form land 50–62**, each for a different structural reason below. Form's **dx 38** is the single lowest cell in the trial.

## Per-rung rationales

Each bullet is the panel median; the parenthetical shows the 3-vote spread.

### all-icons — Alert — 90
- **optimizedCode 88** _(88/88/88)_ — Static class maps respecting Tailwind static-detection, `cn()` merge, unbound 460px width **correctly flagged-not-inlined** (rewarded). Minor deductions: `variantIconMap` builds JSX at module level, and the action Button's border-radius is patched via a className override (couples to Button internals).
- **dx 91** _(90/91/91)_ — Fully typed props with an exported `AlertVariant` union, JSDoc + `@default` on each, `show*` toggles that mirror the Figma variants faithfully, `className` passthrough, `displayName` set. Could expose a children slot for richer content, but no foot-guns.
- **docs 89** _(88/89/89)_ — JSDoc on component + every prop, two `@example` blocks, Figma node ref + token-provenance comments throughout; only a standalone markdown prop table is missing (autodocs covers it).
- **testDepth 90** _(90/90/90)_ — Unanimous: default + live-region role, content, `showDescription` toggle, per-variant icon identity via SVG path `d`, `showIcon=false`, action/discard render+click+hide, role/`aria-live` for all 5 variants, `aria-atomic`, `className` merge. Only an empty/undefined-title edge missing.
- **storybook 93** _(92/93/93)_ — 12–13 stories (one per variant + feature toggles + interaction + full-featured + playground), each with a `play()` assertion block, full argTypes, chromatic on the kitchen-sink story.

### atom — Button — 86
- **optimizedCode 88** _(82/88/88)_ — Idiomatic forwardRef, base classes computed once outside render, correct `cn()` merge, sensible defaults, no dead code; no client hooks so `"use client"` isn't needed.
- **dx 90** _(88/90/90)_ — Strongly typed `ButtonVariant`/`ButtonSize` unions, full prop JSDoc, children-over-label precedence, thoughtful `Omit` of conflicting prefix/suffix; the `showPrefix/showSuffix` dual-gate is slightly unusual but documented.
- **docs 87** _(86/87/88)_ — JSDoc on every prop, three `@example` blocks, autodocs prop table; no standalone prop-table doc.
- **testDepth 78** _(78/78/80)_ — Render, label/children precedence, type attr, click fired/suppressed-when-disabled, variant/size class assertions, iconOnly (3 cases), prefix/suffix slot presence+absence, ref forwarding; no keyboard (Enter/Space), no loading (not modelled), no boundary/empty-children.
- **storybook 90** _(90/90/91)_ — 8–9 stories (variants/sizes/prefix-suffix/iconOnly/disabled/danger/playground), argTypes + controls + a11y + Figma link wired; only a busy/loading story missing.

### molecule — Input — 62
- **optimizedCode 62** _(62/62/68)_ — Clean forwardRef wrapper, but two real foot-guns: `useState` with **no `"use client"`** (RSC crash) and password-toggle eye SVGs inlined+duplicated in JSX; `className` lands on the wrapper, not the native input.
- **dx 55** _(55/55/62)_ — Typed + ref forwarding + accessible password toggle, but the **narrowed `type` union** (drops email/url/tel/search) is a regression vs the native input, and there are no error/label/helperText slots for a molecule-level field.
- **docs 42** _(40/42/52)_ — No JSDoc, no purpose statement, no prop table; only the Storybook autodocs tag + a Figma link. Near-absent.
- **testDepth 72** _(72/72/74)_ — Render, role, variants, password reveal/hide round-trip, number caret, placeholder/value, disabled, ref; no error/invalid, focus, `className`-passthrough, or a11y/axe.
- **storybook 74** _(68/74/75)_ — Six stories (default/secondary/number/password/disabled/AllVariants) with controls + a11y param; no controlled-value, error/invalid, or readOnly story.

### organism — Card — 56
- **optimizedCode 52** _(52/52/55)_ — The anti-pattern the oracle avoids: a single large component with a **6-way `type` ladder** duplicating near-identical CardHeader+CardFooter JSX across 5 of 6 arms. Inlined unbound magic numbers (`h-6`, `right-2.5`, `h-28`, `size-14`) behind `TODO[figma-bind]` still ship, plus inline-`style` borderRadius escapes; forwardRef is correct.
- **dx 55** _(48/55/55)_ — ~30 flat props (`show*` toggles + content) form a giant prop bag — exactly the API the oracle rejects; internal CardHeader/CardFooter aren't re-exported for composition; `imageAlt` is declared but unused and `footerBody`/`body` naming is inconsistent.
- **docs 62** _(62/62/62)_ — Unanimous: `CardType` JSDoc lists all 6 variants with Figma node IDs + a thorough token-mapping block; but no prop table or usage example and many props lack descriptions.
- **testDepth 48** _(48/48/52)_ — Close-button a11y, show/hide toggles, all 6 variant smoke-renders, but several **brittle Tailwind-class assertions** (`h-6`, `right-2.5`, `h-28`, `size-14`) test implementation detail; no keyboard/role-structure or boundary tests.
- **storybook 70** _(68/70/70)_ — 9 stories (all 6 variants + close/blur/footer permutations), argTypes wired; missing side-with-footer and disabled/loading states, and one story uses a deprecated placeholder URL.

### template — Form — 50
- **optimizedCode 52** _(52/52/58)_ — Clean forwardRef + real field composition and tsc clean, but the dominant defect is **conceptual**: it hardcodes a specific contact screen (fixed fields/labels/copy/hrefs) instead of the reusable pass-through the oracle is; `handleSubmit` is a trivial passthrough. Right craft, wrong abstraction.
- **dx 38** _(35/38/42)_ — The trial's lowest cell. The API exposes only `onBack`/`onConfirm`/`className`; a consumer **cannot change fields, labels, validation, or copy without forking the source** — a dead-end for any form but this exact screen.
- **docs 55** _(55/55/62)_ — JSDoc names the organism, lists composed sub-components, documents layout tokens with their source variables, and has an `@example`; no prop table and the example is thin (the API is so narrow there's little to show).
- **testDepth 55** _(48/55/58)_ — Good breadth (fields, button types, callbacks, ToS links, aria-required, typing, ref, className merge) but **one shipped test fails** — `getByRole('form')` with no accessible name; a failing test is a correctness gap, and tests validate fixed copy, reinforcing the brittle design.
- **storybook 52** _(42/52/55)_ — Oracle has no Form story, so any working story is incremental credit; Default + OnDarkSurface with actions wired, but only one shape to show and the dark variant hardcodes a hex.

## Headline takeaways
1. **Token-binding discipline correlates with score.** Alert (obeyed binding rule 4, flagged the unbound width) tops the panel at **90**; Card/Form (inlined unbound values with `TODO[figma-bind]`) and Input (missing `"use client"`) land **50–62**. The agent is *inconsistent* between runs — fixing that is the highest-leverage quality win (see [`04-improvements-and-agent-tuning.md`](./04-improvements-and-agent-tuning.md)).
2. **API shape is the organism/template weakness.** Card's prop-bag explosion and Form's hardcoded-screen-as-component both lose on `dx` (Card 55, Form **38** — the lowest cell in the trial) — the agent doesn't infer "slot/compound" or "reusable primitive" from a composed Figma node.
3. **Tests/stories are consistently a strength** — the test-author/story-author stages produce real coverage; the one gate failure is a component bug, not a thin test.
