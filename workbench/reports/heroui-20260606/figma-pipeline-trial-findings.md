# Figma-to-Code Orchestration — Trial `heroui-20260606` Findings

## Objective

Review findings from the HeroUI benchmark trial and produce a remediation plan for the pipeline.

**Guiding thesis:** most defects are responsibilities executing at the **builder** level that belong in **scaffolding (`/init-figma-compose`)** or **plan mode**. The fix is to push detection, provisioning, and validation *upstream* so component-builders receive a complete, grounded plan — they should assemble, not discover.

Each finding below is tagged with a **Fix location** so it can be routed to the right layer of the redesign.

---

## Trial context

- **Target:** HeroUI design system, built into a project with **no design-system baseline** — so visual/style accuracy reads low by design; structural/source scores are the meaningful signal.
- **9 scored rungs** by declared tier: trivial (button, chip), moderate (input, switch), complex (card, alert, tabs, dashboard), extreme (calendar). The `tokens` and `trivial-icon` runs are captured as separate measurables, not scored component rungs; `moderate-input` is scored once (cold) — the warm/update runs exist only for the token-cost comparison.
- **Per-rung pipeline:** fetcher → (token-builder / icon-generator) → component-builder → story-author + test-author (parallel) → code-reviewer (extreme tier only, per `protocols/complexity.md`) → coordinator/arbiter. *Note: because the scorer misrouted some rungs to extreme (see §C), the 2nd-pass reviewer actually ran on complex-tabs too.*
- **Headline results:** all build gates green (`tsc -b` + `vite build` + 448/448 tests, 19 suites); accuracy 30–56; quality 61–67 (dragged by missing docs 5–13 and lean-code penalty; testDepth/storybook strong 84–96); cost 33.0M tokens / $33.26.
- **"Coordinator" = the main session, not a subagent.** This harness can't let a `figma-coordinator` subagent spawn specialists (nested spawning + MCP tools are unavailable to subagents), so the **main session played coordinator directly** — read `config.json`, ran the think-once `buildPlan`, and spawned each specialist via the `Agent` tool (confirmed in the dashboard + calendar handovers; see memory `figma-coordinator-cannot-spawn-subagents`). Every "coordinator does X" below means the main session, and is where plan-mode detection must live.
- **Evidence base.** Findings below are corroborated by the 8 per-run handovers in `.figma-pipeline/kg/handovers/` (cited as `[h:<node>]`): `1558-build`, `1533-71211` (chip), `1647-71127` (switch), `1728-72791` (card), `2000-72355` (alert), `2053-79785` (tabs), `2154-32646` (dashboard), `0024-71626` (calendar). Note these handovers were authored by the coordinator (KG disabled → `entriesThisRun: 0`, "list authored by coordinator"), not by the KG ledger.

---

## A. Scaffolding gaps — fix in `/init-figma-compose`

Everything here should be provisioned by the scaffolding wizard based on the framework/tooling the user selects, so no later run has to recover from a missing dependency.

1. **postcss CLI not installed.** Builders hit a tooling gap (not a CSS error) and fell back to manual brace-balance/declaration sanity checks. **Resolved for this stack:** the target uses Tailwind v4 via the `@tailwindcss/vite` plugin and builds green (`tsc -b && vite build`) with **no** standalone postcss CLI — so postcss is *not* required here. **Action:** drop the postcss-CLI expectation for tailwind-v4-on-Vite; if any postcss step is kept, gate it on CSS systems that actually need it.
2. **Storybook test utils — builders had to probe (outcome correct on disk).** `@storybook/test` is absent under Storybook 10 (test utils consolidated into the `storybook/test` subpath); builders probed and resolved correctly — all 17 story-test imports on disk use `from 'storybook/test'`, zero `@storybook/test`. **Action:** make this deterministic — when the user selects Storybook in the wizard, scaffold the version-aware test-utils import path so no run has to probe.
3. **KG reuse ledger not wired (dir exists; KG steps 6/7/10 skipped every run).** `.figma-pipeline/kg/` exists and `handovers/` was populated, but `config` has no `knowledgeGraph` block, so every handover records "KG disabled → 0 ledger entries" and skips `kg:query`/`kg:stage`/`kg:merge`. **Important nuance:** *component* reuse still worked via on-disk inspection (`existsOnDisk`) — dashboard reused Button/Card/Chip/Input, calendar reused Button/ChevronLeft/Right, alert+card reused Button `[h:32646, h:71626, h:72355, h:72791]`. What's missing is (a) the queryable ledger and (b) feeding *real* reuse into the complexity scorer (see §C, the decisive bug). **Action:** wire the ledger during scaffolding **and** route actual reuse into `tokenReuseRatio`.
4. **Graphify not run.** Codebase graph indexing was deferred to a manual `/graphify .`. Note this means the *complexity scorer* saw 0% reuse, not that builders rebuilt everything — they reused on-disk assets fine (A.3). **Action:** run Graphify during scaffolding **and** at the end of every `/figma-build` and `/figma-update` so the reuse ledger is always current.
5. **vitest unit/e2e separation — already correct in this target; generalize it.** The committed `vitest.config.ts` already excludes e2e (`exclude: [...configDefaults.exclude, "e2e/**"]`), and `e2e/input.spec.ts` exists, so `npx vitest run` is clean (19 suites / 448 tests, no Playwright collision). The earlier collision was recovered during the run. **Action:** ensure the wizard *always* scaffolds this exclude so a future stack can't regress into the collision.
6. **Tailwind v4 skips component utilities in the app `dist` CSS (env-wide, every run).** Because the whole `target/` subtree is `.gitignore`d and Tailwind v4's automatic content detection respects `.gitignore`, it never scans component source — so `dist/assets/*.css` omits `bg-surface`, `rounded-3xl`, `text-*-soft-foreground`, etc. The `@theme` keys are correct in `semantic.css`/`primitives.css`; **Storybook (which scans stories) is the styling oracle**, which is why visual/style scoring still works. Confirmed across alert/tabs/dashboard/calendar `[h:72355, h:79785, h:32646, h:71626]`. **Action:** when the target lives under a gitignored path, scaffold an explicit `@source` for the components dir in the entry CSS (or render components from `App.tsx`) so the app build is styled.

---

## B. Plan-mode gaps — detect before any builder runs

These are all cases where a builder *discovered* project reality mid-build. That discovery belongs in plan mode, ideally as a cold-start inventory pass.

1. **No existing-asset inventory.** Run from a fresh chat with no context, builders had to identify on-disk icons, tokens, and components themselves (e.g. spotting the existing `CheckIcon` for house style). **Action:** plan mode performs an inventory of existing icons/tokens/components up front and feeds it to builders.
2. **Naive token-name probing.** A builder guessed `--accent-accent` instead of the real `--accent` and had to read token files to recover. **Action:** resolve the real token naming convention in plan mode, not via builder-level probing.
3. **Token deltas discovered late.** The Button's hover-color family, a generic border, and disabled-opacity were *bound in Figma* but not yet materialized in the project token files, so `hover:`/`disabled:` classes would reference non-existent Tailwind colors. The builder had to detect this and trigger a token-builder delta. **Action:** plan mode diffs Figma-bound tokens against on-disk tokens and schedules a precise token-builder delta before the component build.
4. **House-style detection at the wrong layer.** Builders inferred the house style mid-build: no `cva`, no `tailwind-merge`, no prefix, a zero-dep `cn` filter-join, `forwardRef` + single quotes. **Action:** detect house style in plan/token-builder and pass it as an explicit directive.
5. **`tw:` prefix — origin identified (resolved).** `tw:` is the scaffold's *illustrative* prefix, not a project setting: `config.example.json:17` (`"prefix": "tw:"`) and the adapter templates use it throughout (`adapters/css/tailwind-v4.md:57-63`, `frameworks/react.md:120`, `design-systems/atomic.md:69`, `code-reviewer.md:38-42`). This project has **no prefix configured** (`config.cssSystem.config` has no `prefix`; `config.tokens.prefix` is undefined), and the generated code correctly uses **no** `tw:` — the KG handovers explicitly verify "no `tw:` prefix" (e.g. `kg/handovers/20260606-2053-heroui-79785.md:35`). **Action:** nothing to strip from this project; the only call is whether the adapter docs should keep `tw:` as the illustrative default (it can mislead a reader into thinking it's active).

---

## C. Complexity scorer & tier routing — highest-impact systemic bug

Tier routing decides builder model (sonnet vs opus) and whether the extreme-only `code-reviewer` 2nd pass runs, so misrouting is materially expensive and distorts the per-rung token baseline this trial is meant to establish. **Two distinct layers must be separated** (the handovers make this explicit): the **fetcher's emitted** `complexity` block (often garbage) vs the **coordinator's deterministic recompute** that actually drives routing.

- **The fetcher emits non-canonical / fabricated tiers — but the coordinator already recomputes.** The clearest case `[h:72355]`: the fetcher emitted `tier:"high", score:94` for Alert; the coordinator recomputed deterministically per `protocols/complexity.md` to **44.9 → moderate** (`nodeScore 63.3·.20 + variantScore 31.3·.20 + depthScore 66.7·.15 + unboundPenalty 0·.25 + iconPenalty 20·.05 + reusePenalty 100·.15`) and routed moderate (sonnet, no 2nd pass). So the recompute *saved* Alert from misrouting. `"high"`/`"medium"` are not in the canonical enum `trivial|moderate|complex|extreme`. **The fetcher should never emit a tier it didn't compute from the formula** — but this is a narrower bug than "every score is wrong end-to-end."

  | rung | declared | fetcher-emitted (manifest) | coordinator recompute → routed | source |
  |---|---|---|---|---|
  | trivial-button | trivial | score 80 / `extreme` | not documented (no detailed handover) | manifest only |
  | trivial-chip | trivial | score 62 / `medium` | routed to an opus tier (component-builder=opus) | `[h:71211]` |
  | moderate-switch | moderate | score 62 / `medium` | built on sonnet | `[h:71127]` |
  | complex-alert | complex | score 94 / `high` | **44.9 → moderate** (sonnet, no review) | `[h:72355]` |
  | complex-tabs | complex | score 85 / `extreme` | **84.84 → extreme** (opus + review) | `[h:79785]` |
  | moderate-input | moderate | score 38 / `moderate` | moderate | manifest |
  | complex-card | complex | score 72 / `complex` | complex (opus, no review) | `[h:72791]` |
  | complex-dashboard | complex | score 68 / `complex` | complex (opus, no review) | `[h:32646]` |
  | extreme-calendar | extreme | score 91 / `extreme` | extreme (opus + review) | `[h:71626]` |

- **The decisive bug: the scorer's `tokenReuseRatio` is pinned at 0 even when real reuse is ~100%.** Every manifest `complexity` block carries `tokenReuseRatio=0` (KG off), so `reusePenalty` fires at its **max +15** on every rung. But the build pipeline computed the *real* reuse and acted on it: token-builder was **skipped** at `tokenReuseRatio ≈ 1.0` for switch/card/alert/tabs/calendar `[h:71127, h:72791, h:72355, h:79785, h:71626]`, and ran for only 4 new tokens at `≈0.92` for dashboard `[h:32646]`. So the penalty is **false** — maxed precisely when reuse is near-total. This single decoupling is what tips borderline components up a tier.
- **It tipped Tabs complex→extreme (measured cost, link to §H).** Tabs recomputed to **84.84 → extreme** `[h:79785]`; subtract the false `reusePenalty` (15) and it's **69.84 → complex**. That +15 triggered the opus build + extreme 2nd-pass `code-reviewer`. The review *did* find and fix 3 real High a11y bugs (genuine value), but the routing trigger was a KG-off artifact, and Tabs booked extreme-tier review cost (≈2.69M tokens) against a component that's genuinely complex — inflating the "complex" baseline. Calendar (91) and Alert-after-recompute (44.9) were both routed correctly.

**Actions:**
1. **Fetcher:** compute `score`/`tier` strictly from `protocols/complexity.md` (canonical enum; defaults trivial<20, moderate<50, complex<80, extreme≥80) — never emit ad-hoc labels like `high`/`medium`.
2. **Feed real reuse into the scorer.** The pipeline already knows actual `tokenReuseRatio` (it skips token-builder on it); route that number into the complexity `reusePenalty` instead of the KG-off worst-case 0 — or enable KG so the ledger supplies it. Optionally set `config.complexity.thresholds`/`tierOverrides` (currently `config.complexity` is `null`) to pin per-rung tiers to declared intent.
3. **Model auto-switch already works** — the coordinator routes size `lg → opus` and gates the 2nd pass on extreme `[h:79785, h:71626]`. No human call is needed; the fix is upstream (1 + 2), so the *resolved* tier is correct.
4. Record the baseline finding: **with KG off, the false `reusePenalty` (+15) over-scores every rung; borderline components (Tabs) cross a routing boundary on it.**

---

## D. Dark mode — captured-capable but never emitted

No `[data-theme="dark"]` block was ever emitted — everything went to `:root` (verified: only light mode in the committed token CSS). It carried across every component. But the handovers show the failure is **not uniform** "only light was captured" — it splits three ways, which changes the fix:

1. **Captured-but-not-emitted (the common case).** Real dark values were present in the *manifest* and simply never written to CSS: Card `surface/surface` dark `#18181b`, `foreground/foreground` dark `#fafafa` `[h:72791]`; Alert `accent-soft-foreground` dark `#61a8fc` and the other `*-soft-foreground` families `[h:72355]`. → this is a **token-builder emit gap**, not a capture gap.
2. **Unresolvable aliases.** Switch's `foreground/foreground` and `foreground/muted` are Figma aliases whose *dark* values the fetcher couldn't resolve (light values were known) `[h:71127]`. → a **fetcher alias-resolution gap**.
3. **Hallucinated + discarded.** Calendar's resumed fetch produced dark values that were hallucinated, so they were correctly *not* used `[h:71626]` (see §E.1).

**Action:** (a) token-builder must emit a `[data-theme="dark"]` block from the dark values already in the manifest whenever present (closes case 1, the majority); (b) harden the fetcher's dark-alias resolution / re-fetch via the Figma REST variables API for case 2; (c) never trust resume-emitted token values (case 3). Tokenization must cover dark mode whenever it is present in the design.

---

## E. Fetcher reliability

1. **Confabulation on resume.** `[h:71626]` After a socket drop, the *first* Calendar fetcher resume confabulated a wrong-node manifest — wrong `fileKey` (`o8Xk…` instead of the trial's `qGjFwr9ZWpLk8xsgskwEHe`), `intent:update`, and it listed the on-disk components instead of a Calendar decomposition; token hex values were also hallucinated. It was caught by validating against disk and **discarded**; a fresh re-fetch + focused resume then emitted the valid manifest. **Action:** treat resume output as untrusted until validated against disk — never build from a resumed manifest's `fileKey`/intent/token values without a disk cross-check.
2. **Socket instability.** `[h:71626, h:32646]` The Figma MCP socket closed repeatedly at ~22–32 tool calls — on the Calendar fetcher (attempts 1 & 2) *and* component-builder spawn 1, and the Dashboard fetcher (attempt 1). The recovery that worked is `SendMessage`-resume of the same agent to finish from already-gathered context with minimal new MCP calls. **Action:** harden resume/retry so a mid-fetch drop doesn't corrupt the manifest (and pair it with E.1's disk validation).
3. **Null root `configSnapshot`.** `[h:72355, h:72791]` The manifest's root `configSnapshot` came back `null` (the fetcher embeds config only via its return echo); builders recovered via their slices and all `configSnapshotEcho`s matched, but the on-disk manifest isn't self-describing. Fetcher defect.
4. **configSnapshot not re-passed to follow-up spawns.** `[h:79785]` The Tabs a11y-fix builder returned a wrong `configSnapshotEcho` (`custom/heroui` instead of `flat/none`) because the follow-up prompt didn't re-pass the snapshot, so it inferred from the project name. Edits were correct (the coordinator's verification is the arbiter), but the tamper-check is defeated. **Action:** always re-pass `configSnapshot` in follow-up agent spawns.

---

## F. Icon handling

1. **Raster-over-vector defeats theming.** The MCP rendered a simple checkmark (bound to `currentColor`) as a raster `img` asset. **Action:** extract a clean vector SVG path and fall back to raster only when no vector is genuinely available.
2. **Source-raster fidelity.** `[h:72355, h:79785]` Several icons are stored as raster PNG in Figma with no vector paths: the 4 Alert glyphs → faithful FontAwesome-6-solid canonical paths; the Tabs chevrons → clean stroke approximations. Geometry-faithful but not byte-exact. Flag these as known fidelity gaps, not silent substitutions.
3. **Confirmed correctness bug (fixed).** In the icon component, `{...props}` was spread *after* the merged `style`, so passing `color` + `style` together clobbered the injected color. Fixed within write scope (verified on disk — `CheckIcon.tsx` now spreads `{...props}` then `style`).
4. **Expiring Figma asset URLs must not be baked.** `[h:32646]` Dashboard's ProgressiveBlur used a Figma asset `mask-image` URL that **expires in 7 days**; the builder correctly did *not* bake it and approximated with a CSS `linear-gradient` mask (tagged `approved: CSS-gradient mask`). The forbidden-pattern scan explicitly checks "no expiring Figma asset URL baked." **Action:** keep this guard; for assets that must persist, download + commit them rather than referencing the ephemeral URL.

---

## G. Cross-rung build hygiene

- **`CheckIcon.tsx` import — RESOLVED during the Switch run.** `[h:71127]` The Switch handover records it explicitly: "`components/icons/CheckIcon.tsx` had a `verbatimModuleSyntax` type-only import error (`import { SVGProps }` → `import { type SVGProps }`) from a prior rung that was breaking the whole app typecheck. Fixed in-place to make verification green." On disk now, `CheckIcon.tsx:1` reads `import React, { type SVGProps } from 'react'`, which is why the final build gate is green (`tsc -b && vite build` ✓, 448/448 tests). **No outstanding action** — this corrects the earlier "left untouched intentionally" claim. Keep as a regression note: the icon-generator should emit type-only imports for `verbatimModuleSyntax` projects so it can't recur.

---

## H. Per-component fidelity notes (documented, reversible)

- **Button:** `gap-2` in the base applies to all sizes; Figma `sm` specifies `gap-1` (cosmetic).
- **Chip:** `tertiary ≡ soft` collision — both captured as `bg-transparent` + `{color}-soft-foreground`. HeroUI's real soft variant uses a tinted `bg-{color}-soft`; rebind in Figma and re-run if intended.
- **Switch / SwitchGroup:** `[h:71127]` node named "SwitchGroup" models a single label+description+switch *row*, not a container of N switches (built as a row); dropped `_SwitchControl` instance-swap icon slot (add `icon?`/`showIcon?`); dark foreground aliases unresolved (light correct); **missing `"use client"` despite `useState`** — inconsistent with Input/Card/Tabs/Alert.
- **Card:** `[h:72791]` `apiShape: compound` with CardFooter as a `discriminated-union` on `type` (`link|cta|support|text`) — a strong API surface, not a prop-bag. ProgressiveBlur collapsed to a single full-surface `backdrop-blur` overlay; image cover is a generic `coverSrc` slot; `closeIcon` override not exposed (inline X); `--shadow-surface` not `@theme`-bridged (used `shadow-[var(--shadow-surface)]`); `--blur-field`=20px is a HeroUI-conventional default (Figma var resolved ambiguous).
- **Alert:** `[h:72355]` per-variant action-button tint dropped (the Figma action is one shared `primary` Button instance across all 5 variants → renders `primary` consistently; add `actionVariant?` to expose). Reuses the on-disk Button.
- **Tabs:** `[h:79785]` static `[mask-size:226px_80px]` is inert without a `mask-image` (real fade comes from width-adaptive gradient overlays — drop or bind a token); `scrollShadowColor(secondary) #f5f5f5` is the one un-themed color (inlined `from-[#f5f5f5]`). Extreme 2nd-pass code-reviewer fixed 3 High a11y/focus bugs (invalid `activeKey` tab stop, roving focus following selection, `aria-controls` → unrendered panels); reviewer pre-fix quality 82/100.
- **Dashboard:** `[h:32646]` 6 new components (Avatar, DropdownItem, ContentHeader, Sidebar, HeaderNav, DashboardDemo) + reuse of 4 on-disk (Button/Card/Chip/Input); section components expose slots (not baked Figma copy); card thumbnails are offline placeholders (pass real `coverSrc`); ProgressiveBlur is a CSS-gradient approximation (see §F.4).
- **Calendar:** `[h:71626]` built from scratch (no react-aria / `@internationalized`); `Calendar.tsx` uses **discriminated-union props** on `selectionMode` (`single|range`). Dropped time-selection field, preset sidebar, and `color="secondary"` (no secondary token family on disk). Extreme 2nd pass fixed 2 High focus-management bugs (roving `tabIndex` could vanish; off-view filler-day selection didn't recenter); reviewer pre-fix quality 84/100.

---

## What worked (keep — don't regress while fixing the above)

The handovers document several behaviours worth preserving:

- **Think-once `buildPlan` pays off.** One opus component-builder built all 3 coupled Card components in a single pass (69.6k tokens / 32 tool-uses) with no per-builder re-derivation `[h:72791]`; Calendar was decomposed once into utils + 5 components + barrel `[h:71626]`.
- **Deterministic recompute already saves misroutes.** The coordinator recomputed Alert from the fetcher's bogus `94/high` down to `44.9/moderate` and routed it correctly `[h:72355]` (see §C) — the recompute layer is sound; the inputs (fetcher labels, reuse signal) are the bug.
- **Disk-based reuse works without KG.** Builders reused on-disk components/icons/tokens via `existsOnDisk` and skipped token-builder at high reuse `[h:32646, h:71626]` — the redesign should feed this signal into the scorer, not replace the behaviour.
- **The extreme 2nd-pass review earns its cost when it runs.** It caught 3 real High a11y bugs in Tabs and 2 in Calendar that the test suites missed (every test seeded an in-view date) `[h:79785, h:71626]`.
- **Unbound-gate discipline held.** Across all rungs, unbound values were either bound to existing tokens or explicitly `approved-inline` with run-tagged comments — **no invented tokens, no raw hex, no blocking `TODO[figma-unbound]`** `[h:71127, h:72355, h:72791, h:79785, h:32646, h:71626]` (binding rule 4 respected).
- **Strong API shapes, not prop-bags.** Compound (Card, Tabs, ContentHeader, Sidebar) and discriminated unions (CardFooter, DropdownItem, Calendar `selectionMode`) were chosen where the design implied them.

---

## I. Trial reporting & measurement integrity

1. **Stale report boilerplate.** Template reads "15 judge agents across 5 rungs" — actual run was **27 judges across 9 rungs**. Data tables are correct; fix the prose template.
2. **Legacy captures scored, not skipped.** 4 runs missing `reachabilityStatus` (trivial-button, complex-alert, complex-tabs, complex-dashboard) were scored as "legacy captures" with no degraded markers. **Action:** re-run them to be fully trustworthy.
3. **Quality drag is structural, not random:** docs 5–13 (no docs generated) + lean-code penalty pull every rung to 61–67 despite strong test/storybook scores. Decide whether docs generation enters scope.
4. **Two very different "per-rung cost" numbers — be explicit which one the baseline uses.** The handovers' `specialistTokensThisRun` (sum of `costs.jsonl` per-spawn `total_tokens`, excluding the coordinator's own context) is an order of magnitude smaller than the OTEL per-run total this report uses: Calendar **424.8k specialist** `[h:71626]` vs **7.51M OTEL**; Dashboard **361k** `[h:32646]` vs **4.76M**. The gap is the main-session coordinator's context + `cacheRead` (which dominates `total`). The "tokens-per-agent baseline" in the report is therefore mostly coordinator-context/cache, not specialist work. **Action:** the baseline should report *both* — specialist-only (the work) and OTEL-total (the bill) — and label which is which, or the per-rung numbers aren't comparable across redesigns.

---

## Suggested remediation order

0. **Reconcile this doc with disk first.** G and A.5 were already fixed in the committed target; A.3/A.2 outcomes are correct on disk; the §"Trial context" rung list was wrong. These are now corrected here — do this before circulating so a reader who spot-checks G/A.5 against the repo doesn't discount the (well-supported) C/D sections by association.
1. **Fetcher tier emission + reuse signal into the scorer (C, E.1–E.2)** — the single highest-leverage fix: feed real `tokenReuseRatio` into `reusePenalty` (kills the false +15) and stop the fetcher emitting non-canonical tiers. The recompute layer is already correct, so this alone fixes routing. Pair with resume-manifest disk-validation (E.1) since both feed the baseline.
2. **Scaffolding provisioning (A)** — wire the KG ledger + Graphify, make the Storybook test path / vitest exclude deterministic, drop postcss for tailwind-v4, and add the `@source` for gitignored targets (A.6). Removes whole classes of builder-level recovery.
3. **Plan-mode inventory + token-delta + house-style detection (B)** — stops builders from discovering project reality. (Recall "plan mode" = the main session, per Trial context.)
4. **Dark-mode emit + capture (D)** and **icon vector extraction / no-expiring-URL (F)** — fidelity. D is mostly a token-builder *emit* fix (values are already in the manifest).
5. **Per-component reversible items (H)** — G is already resolved on disk; H items are opt-in API exposures.
6. **Reporting integrity (I)** — fix the stale prose, and report specialist-only vs OTEL-total cost separately (I.4).

## Open questions for the user

- ~~Is postcss actually required?~~ **Answered (A.1):** no — Tailwind v4 via `@tailwindcss/vite` builds green without a postcss CLI. Remaining call: confirm we drop the expectation for tailwind-v4-on-Vite entirely.
- ~~Where did the `tw:` prefix originate?~~ **Answered (B.5):** scaffold examples + `config.example.json`; this project has no prefix and emits none. Remaining call: keep or change `tw:` as the adapter docs' illustrative default.
- Should **docs generation** enter scope? It's the single biggest quality drag (docs 5–13 across all rungs; no `.md`/`.mdx` emitted) holding composites at 61–67. (I.3)
- Should the 4 missing-`reachabilityStatus` runs (trivial-button, complex-alert, complex-tabs, complex-dashboard) be **re-run** before the next trial, or is the current scoring (they passed gates and scored consistently) acceptable as a baseline? (I.2)
- Should the adapter docs continue to illustrate with `tw:` given it can read as an active setting? (B.5)
