# Reference Workbench Trial — Component & Demo Selection (for review)

> Date: 2026-06-06 · Status: **Draft for sign-off** · Proposed trial id: `reference-20260606`
> Figma kit: **Reference Figma Kit V3 (Community)** — fileKey `qGjFwr9ZWpLk8xsgskwEHe` (verified accessible via MCP `whoami` = Dev seat, Pro plan)
> Oracle repo: `github.com/reference-inc/reference` branch `v3` @ commit `bf7e58f`

This document is the **review gate** for a new live workbench trial. It picks the components and demo
examples to test **by complexity**, maps each to its Reference oracle, and defines what the generated code
is reviewed against. It exists to be approved/edited before any trial scaffolding or run.

---

## 1. Why a new trial

An earlier workbench trial exposed defects that drove the agent redesign (think-once buildPlan,
MCP-subprocess ban, full-variable token fetch + 3-layer token-builder, intent-based layer classification,
Brevit wire format, the component-builder/icon/react-adapter fixes). This trial **re-runs the ladder to
validate those fixes hit their targets** (98–100% source/structural accuracy, ~80% fewer tokens, zero
MCP-fallback failures) and **adds scenarios the old trial lacked** (a pure token build; stateful + compound
rungs that target specific fixes; a real composed demo).

Component placement is now **FLAT** (config `designMethodology: flat`); runs are named by complexity tier
(trivial / moderate / complex / extreme) — not atomic design. Review criteria use the established
four-axis rubric (accuracy · quality · build gates · tokens-per-agent); generated code is reviewed
**against the hero-ui v3 repo** (the oracle) — see §6.

---

## 2. Figma kit inventory (from live MCP read)

**Component pages — ~70**, each a top-level page with a stable node id. The ones in the proposed ladder:

| component | Figma node | component | Figma node |
|---|---|---|---|
| Button | `5375:69211` | Alert | `5375:72355` |
| Chip | `5375:71211` | Tabs | `5375:79785` |
| Input | `17293:26222` | Calendar | `5375:71626` |
| Switch | `5375:71127` | Card | `5375:72791` |

Full set also includes Accordion, Avatar, Badge, Breadcrumbs, Checkbox, ComboBox, DatePicker (`5375:72308`),
Drawer, Dropdown (`5375:70150`), Modal (`5375:77858`), Pagination, Popover, Select, Slider, Table
(`18729:23034`), TextArea, Toast, Tooltip, … (≈70 pages total).

**Icons page** `2217:823` — a **~675-icon library** with a consistent naming convention (`arrow-chevron-down`,
`archive`, `aperture`, `at`, `ban`, `bars-ascending-align-left`, …). Source for the icon-only + all-icons rungs.

**"Templates & Examples" canvas** `4672:32615` — 8 full-page composition demos:

| node | name | size | character |
|---|---|---|---|
| `4672:32646` | Desktop - 1 | 1440×1024 | **Dashboard app** — sidebar nav + top bar (search/Create/avatar) + card grid (verified by screenshot) |
| `4672:39367` | Desktop - 2 | 1440×1024 | full app layout |
| `4678:41087` | Desktop - 3 | 1440×1024 | full app layout |
| `21964:53878` | Desktop - 4 | 1440×1024 | full app layout |
| `5375:69212` | calendar demo | 1751×705 | calendar-centric composition |
| `18348:17007` | MacBook Air - 1 | 1280×832 | responsive layout |
| `18351:18784` | mail | 1440×1024 | mail client (was the old `page` rung) |
| `21989:151466` | Overview | 1632×2326 | tall marketing/overview page |

---

## 3. Reference v3 oracle mapping (from repo)

- **95 components** in `packages/react/src/components/`; **75 have a `*.stories.tsx`** (story oracle), 18 are
  leaf/structural or item-subcomponents without stories.
- **602 doc demos** in `apps/docs/src/demos/en/` + **15 composition demos** in
  `packages/storybook/.storybook/stories/demos/` (e.g. `login-demo`, `x-profile-demo`, `subtle-cards-demo`).
- **Design tokens**: `packages/styles/themes/default/` — **87 CSS variables**, **2 modes (light + dark)** plus a
  `[data-vibrant-palette]` variant; categories: primitives, status colors (+ hover/soft), form-field tokens,
  3 shadows, radius/spacing knobs, calculated `color-mix` states.
- **Reproduce the oracle**: `git clone --depth 1 --branch v3 https://github.com/reference-inc/reference.git`
  (pin to commit `bf7e58f`).

Story-oracle availability per proposed rung: Button ✓, Chip ✓, Input ✓, Switch ✓, Card ✓, Alert ✓, Tabs ✓,
Calendar ✓. Demo composition → storybook-demo oracle (`login-demo` / dashboard demos). Tokens →
`packages/styles` (no story; structural + count fidelity).

---

## 4. Proposed trial ladder (selection by complexity)

Each row is one run. `cmd` is the pipeline entry point. `oracle` is what the generated code is scored against.

| runId | tier | Figma node | component / target | cmd | oracle | what it validates |
|---|---|---|---|---|---|---|
| `trivial-icon` | trivial | from `2217:823` | a single glyph (e.g. `check`) | `/figma-icons` | storybook icon | icon a11y fix (role/aria-hidden), barrel consistency |
| `trivial-button` | trivial | `5375:69211` | **Button** | `/figma-build` | story | baseline trivial; tokens-per-agent floor |
| `trivial-chip` | trivial | `5375:71211` | **Chip** *(NEW)* | `/figma-build` | story | leaf w/ removable affordance; placeholder-copy rule |
| `moderate-input-cold` | moderate | `17293:26222` | **Input** | `/figma-build` | story | `"use client"` + native-union fixes; cold KG |
| `moderate-switch` | moderate | `5375:71127` | **Switch** *(NEW)* | `/figma-build` | story | **stateful → verifies `"use client"` lands** |
| `complex-card` | complex | `5375:72791` | **Card** | `/figma-build` | story | **`apiShape=compound`** (sub-components, not prop-bag) |
| `complex-alert` | complex | `5375:72355` | **Alert** | `/figma-build` | story | icon fan-in; unbound-width flag discipline |
| `complex-tabs` | complex | `5375:79785` | **Tabs** *(NEW)* | `/figma-build` | story | multi-region/panels; discriminated-union API |
| `complex-dashboard` | complex | `4672:32646` | **Dashboard demo** *(NEW)* | `/figma-build` | storybook-demo | **think-once on a real composed layout** |
| `extreme-calendar` | extreme | `5375:71626` | **Calendar** *(NEW)* | `/figma-build` | story | heavy stateful (date state, RAC), build-gate stress |
| `tokens` | — | full var collection | **design tokens** *(NEW)* | `/figma-tokens` | `packages/styles` | **full-variable fetch + non-hollow `semantic.css` + per-mode `[data-theme]`** |

**Comparison scenarios** (kept from the old trial — they isolate specific levers):

| pair | runs | measures |
|---|---|---|
| cold → warm | `moderate-input-cold` → `moderate-input-warm` (`17293:26222` rebuilt) | KG reuse / skip-unchanged token savings |
| build → update | `moderate-input-cold` → `moderate-input-update` (`/figma-update`) | patch-in-place vs rebuild |
| icon fan-in | `complex-alert` vs `complex-card` control | icon-set blocking cost |

---

## 5. New scenarios vs. the old trial (ask: "can new scenarios be added")

| # | New scenario | Not in old trial | Targets which redesign fix |
|---|---|---|---|
| 1 | **`tokens` rung** (`/figma-tokens`) | old trial had no pure-token run | full-variable fetch + 3-layer token-builder + per-mode theming + the dropped-`blur` fix |
| 2 | **`switch` rung** (stateful) | — | the `"use client"` self-check (the `Input.tsx` build-break) |
| 3 | **`tabs` rung** (multi-region) | — | `apiShape=discriminated-union`, drop-policy reporting |
| 4 | **`chip` rung** (extra trivial) | — | placeholder-copy rule, named scale utilities |
| 5 | **`complex-dashboard` = real dashboard demo** | prior trial's composed demo was a Figma-only Form | think-once buildPlan on a composed layout (the core token-savings lever) |
| 6 | **per-rung tokens-per-agent recorded as the NEW baseline** (the prior trial was removed) | — | proves the ~80% reduction target; becomes the reference for future trials |

---

## 6. Review criteria + what's reviewed against the repo

Established four-axis rubric:

- **Accuracy** — visual (pixel-diff vs Reference storybook), style (computed-style match), structural
  (source + rendered-DOM tree similarity), **build gate** (tsc + build + unit tests). Visual/style read low
  by design when target is `designSystem: none` — `struct·dom` + cross-rung trend are the meaningful signals.
- **Quality** — 5-dimension judge panel (optimizedCode · dx · docs · testDepth · storybook), 3-vote median.
- **Build gates** — deterministic (tsc/build/tests; a11y when axe is wired).
- **Tokens-per-agent** — OTEL per-agent totals; the headline efficiency metric.

**Reviewed against the hero-ui v3 repo (`ref-oracle/`):** each generated component's source + rendered story
is compared to the corresponding Reference component (`packages/react/src/components/<name>/`) and its
`*.stories.tsx`; generated tokens are compared to `packages/styles/themes/default/` (count, layer structure,
mode coverage). The dashboard demo is compared to the closest storybook composition (`login-demo` /
dashboard demos). This is **Bar-A vs Bar-B** as before: divergence from Reference's react-aria + tailwind-variants
architecture is expected under `designSystem: none` and is **flagged, not penalized**.

**New measurables this trial:**
- token-layer fidelity: is `semantic.css` non-empty and aliasing primitives? token count vs oracle's **87**? both modes emitted?
- think-once proof: tokens-per-agent on `complex-dashboard`/`complex-alert` recorded as the new baseline.
- no degraded trials scored: every run's manifest carries `reachabilityStatus: "ok"` (enforced by `isScorableTrial`).

---

## 7. Open items / notes

- **Figma source:** using the **accessible** kit `qGjFwr9ZWpLk8xsgskwEHe` (same kit the proven trial used). The
  link first provided (`ZmGWr2Jqedlfik5kZPLCAs`) is a *different* Community publication **not in this account** —
  MCP returns a permission error at its root. If that exact publication is required, duplicate it to your Figma
  drafts first; otherwise this kit is equivalent.
- **icon-only node:** the old trial pinned `13354:830` ("check icon"); the exact glyph node will be re-confirmed
  against the Icons page `2217:823` at scaffold time.
- **`complex-dashboard` oracle:** the dashboard demo has no 1:1 source component in the repo — it is scored
  structurally + by quality judge against the closest storybook composition, not pixel-diffed to a single oracle.
- **Node-id drift:** all node ids above were read live from `qGjFwr9ZWpLk8xsgskwEHe` on 2026-06-06; re-verify at
  scaffold time before the run.

## 8. Sign-off

Approve this selection (or edit the ladder rows) and the next steps are: scaffold `trials/example/`
(`ladder-nodes.json` + `rung-map.mjs` + `STEPS.md`), re-clone the `v3` oracle, then run the operator trial.
