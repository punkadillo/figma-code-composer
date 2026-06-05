# 02 — Per-rung oracle ↔ generated-artifact mapping

**Trial:** `heroui-20260603`
**Goal:** For each of the 7 ladder rungs, locate (a) its oracle in `ref-heroui` (or note Figma-only), and (b) the matching generated artifact in `target/`, and judge whether the pair is usable for scoring.

Ladder source: `workbench/trials/heroui-20260603/ladder-nodes.json` (`runs[]`).
Oracle-source rule: `workbench/oracle/ladder.mjs:4-12` — component rungs → Storybook; `template`/`page` → Figma.

All paths below are under `workbench/trials/heroui-20260603/`. Oracle dir = `ref-heroui/packages/react/src/components/<name>/`; oracle CSS = `ref-heroui/packages/styles/components/<name>.css`.

---

## Mapping table

| Rung | Tier | Figma node | Component (ladder name) | Generated file(s) in `target/` | Ref oracle path | Oracle type — story? css? | Usable for scoring? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **icon-only** | trivial | `13354:830` | check icon | `src/components/icons/Check2.tsx` | **no standalone export** in `react/src/components/icons.tsx`; closest source = inline `<svg>` checkmark in `react/src/components/checkbox/checkbox.tsx` (`:107-134`) | storybook story: **no** (icon is not its own story). css: **no** | **Partial** — structural SVG compare vs checkbox glyph; no Storybook oracle, no per-icon CSS. Visual oracle is the Figma node only |
| **atom** | trivial | `5375:69211` | Button | `src/components/atoms/Button/{Button.tsx, Button.stories.tsx, Button.test.tsx, index.ts}` | `ref-heroui/packages/react/src/components/button/button.tsx` | story: **yes** (`button.stories.tsx`, 6.5K). css: **yes** (`styles/components/button.css`, 3.5K) + `buttonVariants` recipe | **Yes — richest atom oracle** |
| **molecule** | moderate | `17293:26222` | Input | `src/components/atoms/Input/{Input.tsx, …}` ⚠️ filed under **atoms**, not molecules | `ref-heroui/packages/react/src/components/input/input.tsx` | story: **yes** (`input.stories.tsx`, 2.9K). css: **yes** (`input.css`, 2.1K) | **Yes** (note layer mismatch — see flags) |
| **organism** | complex | `5375:72791` | Card | `src/components/molecules/Card/{Card.tsx, …}` ⚠️ filed under **molecules**, not organisms | `ref-heroui/packages/react/src/components/card/card.tsx` (6.4K) | story: **yes** (`card.stories.tsx`, **19.5K** — richest) . css: **yes** (`card.css`) | **Yes — most story data points** |
| **template** | complex | `14065:36430` | Form | `src/components/organisms/Form/{Form.tsx, …}` ⚠️ filed under **organisms** | `ref-heroui/packages/react/src/components/form/form.tsx` (**810B**, thin) | story: **NO** (`form/` has only `form.tsx` + `index.ts`). css: **no** dedicated form.css | **Figma-only per ladder.** Source structural compare possible vs the 810B `form.tsx`, but visual/style oracle is strictly the Figma node |
| **page** | extreme | `18351:18784` | mail (1440×1024) | *(none — no `Mail`/page component generated; the closest target output is the Vite app `target/src/assets/hero.png` + app shell, not a ladder component)* | **NONE** — no `mail`/dashboard/inbox demo exists anywhere in `ref-heroui` | **Figma-only.** Closest *source* is composite demos: `packages/storybook/.storybook/stories/demos/login-demo.tsx` / `ui-components-demo.tsx` (not the mail page) | **No reusable source oracle** — strictly a Figma screenshot oracle |
| **all-icons** | complex | `5375:72355` | Alert | `src/components/molecules/Alert/{Alert.tsx, …}` + status icons in `src/components/icons/` | `ref-heroui/packages/react/src/components/alert/alert.tsx` (6.2K) + status icons `CloseIcon/InfoIcon/WarningIcon/DangerIcon/SuccessIcon` in `icons.tsx` | story: **yes** (`alert.stories.tsx`, 4.4K). css: **yes** (`alert.css`, 1.3K) | **Yes — best for icon fan-in** (Alert + 4 status icons both sides) |

---

## Per-rung detail & oracle-choice justification

The user asked to *"choose recommended options along with the one that gives the most data points."* Where the oracle is ambiguous, the richest usable oracle is picked below.

### icon-only — check icon → `Check2.tsx`
The generated artifact is `icons/Check2.tsx` (`export … Check2, type Check2Props`, see `icons/index.ts`), a 16×16 currentColor check glyph. `ref-heroui/packages/react/src/components/icons.tsx` exports **no** standalone Check icon (full export list: chevrons, ExternalLink, CircleDashed, Close, Info, Warning, Danger, Success, Minus, Plus, Search, Calendar — no Check). **Recommended oracle:** the inline checkmark `<svg>` in `checkbox.tsx:107-134` for a structural/path comparison; the Figma node `13354:830` for the visual oracle. There is no Storybook story and no CSS for a lone check icon, so only structural (SVG path/viewBox) + Figma-visual apply.

### atom — Button → `atoms/Button/Button.tsx`
**Cleanest pair in the trial.** Oracle ships source + a 6.5K stories file + a 3.5K CSS recipe (`buttonVariants`). Target declares `ButtonProps` with a 7-value `ButtonVariant` union and `ButtonSize` (`Button.tsx:15-26`). Note the **architecture divergence**: oracle Button is built on `react-aria-components` + `tailwind-variants` recipe from `@heroui/styles`; target is hand-rolled inline Tailwind via a local `cn` helper (`Button.tsx:1-3`, no react-aria, no tailwind-variants in `target/package.json`). Structural/style scores will reflect that gap honestly. **Recommended:** Storybook oracle (most data points) for the full accuracy quad once rendered; source-structural + quality now.

### molecule — Input → filed under `atoms/Input/`
Oracle `input/` has source + `input.stories.tsx` + `input.css`. Usable. **Layer mismatch flagged:** the ladder classifies Input as a *molecule*, but the generator filed it under `atoms/Input/`. This is a classification mismatch, not a missing artifact — scoring just needs to resolve by component name, not by folder.

### organism — Card → filed under `molecules/Card/`
**Most story data points of any rung** — `card.stories.tsx` is **19.5K** (vs Button's 6.5K), plus `card.tsx` (6.4K) and `card.css`. **Recommended oracle for the richest organism comparison.** Layer mismatch flagged: ladder says *organism*, generator filed it under `molecules/Card/`.

### template — Form → filed under `organisms/Form/`
Ladder oracle = **Figma** (`oracle: "figma"` in `ladder-nodes.json` and `ladder.mjs:9`). Confirmed there is **no `form.stories.tsx`** — the `form/` dir holds only `form.tsx` (810B) + `index.ts`. So even the source oracle is thin: a small structural compare against an 810B wrapper is possible, but the authoritative visual/style oracle is the Figma node `14065:36430`. Layer mismatch flagged: ladder says *template*, generator filed it under `organisms/Form/`.

### page — mail (1440×1024) → no component oracle, no generated component
Ladder oracle = **Figma** (`18351:18784`). Searched the entire `ref-heroui` tree (`packages/`, `apps/docs/`, `packages/storybook/`) for `mail`/`inbox`/`mailbox`/`dashboard` composite demos: **none exist** (the `mail` string matches are only placeholder email text inside unrelated stories like `dropdown`/`drawer`/`input-otp`). The richest *source* artifacts that resemble a full-page composite are the Storybook demos `login-demo.tsx` (40 lines) and `ui-components-demo.tsx` (45 lines) under `packages/storybook/.storybook/stories/demos/` — but **neither is the mail page**; they are different layouts and would be an invalid oracle. **Conclusion / recommended: `page` is strictly a Figma screenshot oracle with no on-disk source equivalent.** For scoring, only the quality judge panel (needs no oracle ref) and build-gates apply; visual/style/structural require the Figma render. There is also **no generated `Mail`/page component** in `target/src/components/` — the page run produced the Vite app shell (`target/src/assets/hero.png` etc.), not a ladder component, so there is no clean component artifact to score either.

### all-icons — Alert → filed under `molecules/Alert/`
**Best icon-fan-in oracle.** Oracle ships `alert.tsx` (6.2K) + `alert.stories.tsx` (4.4K) + `alert.css`, and the status icons exist on both sides: oracle `icons.tsx` exports `CloseIcon/InfoIcon/WarningIcon/DangerIcon/SuccessIcon`; target generated `CircleCheckIcon`, `CircleExclamationIcon`, `CircleInfoIcon`, `CircleInfoAccentIcon`, `TriangleExclamationIcon`, `CloseIcon` (`icons/index.ts`). This rung is the `iconFanIn` comparison vs the `organism` control (`ladder-nodes.json:19`). **Recommended:** Storybook Alert oracle + the icon set — maximal data points for the fan-in analysis.

---

## Flags

### Missing / mis-located generated artifacts

- **`page` has no generated component** — no `Mail` or page-level component under `target/src/components/`. The page run produced the app shell, not a scorable ladder component. Combined with the absent ref oracle, `page` is the weakest rung for accuracy scoring (Figma-only oracle, no source artifact on either side).
- **Layer-classification mismatches vs the ladder** (artifact exists, folder disagrees):
  - Input → ladder *molecule*, filed under `atoms/Input/`
  - Card → ladder *organism*, filed under `molecules/Card/`
  - Form → ladder *template*, filed under `organisms/Form/`
  - Alert → ladder *all-icons* (complex), filed under `molecules/Alert/`
  These do not block scoring (resolve by component name), but a folder-based mapper would mis-pair them.

### Extra generated components in `target/` that are NOT ladder rungs

| Extra artifact | Path | Likely origin | Has a ref oracle? |
| --- | --- | --- | --- |
| **TextField** | `molecules/TextField/` | spun off from the Input/Form build | yes — `react/src/components/textfield/` (+ `textfield.css`, 493B) |
| **TextArea** | `molecules/TextArea/` | spun off from the Form build | yes — `react/src/components/textarea/` (+ `textarea.css`, 2.3K) |
| **CardHeader** | `atoms/CardHeader/` | Card sub-slot extracted as its own component | partial — oracle Card keeps header as a slot inside `card.tsx`, no separate `card-header` dir |
| **CardFooter** | `atoms/CardFooter/` | Card sub-slot extracted | partial — same as above (slot, not a standalone oracle) |

These four are **not ladder rungs** and should be excluded from the per-rung accuracy scorecard (or scored only as quality extras). TextField/TextArea do have clean ref oracles if a broader comparison is wanted; CardHeader/CardFooter have no standalone oracle (the oracle composes them inside `card.tsx`), so they would only ever get a structural/quality score, never a clean 1:1.

---

## Bottom line for scoring

- **Best, most-data-points oracles (recommended):** atom→Button, organism→Card (19.5K stories), all-icons→Alert+status-icons. These three give the richest Storybook + CSS + source triple and are the strongest candidates for a defensible per-rung scorecard.
- **Usable with caveats:** molecule→Input (clean oracle, layer mismatch), template→Form (Figma-primary; thin 810B source for structural only).
- **Weakest:** icon-only (no story/CSS; structural-vs-checkbox-glyph + Figma only) and page (no ref source oracle, no generated component — Figma screenshot only).
- Per `oracle/ladder.mjs`, only `template` and `page` are intended Figma oracles; the other five are Storybook — and four of those five (Button, Input, Card, Alert) have complete story+CSS+source oracles on disk right now. The check-icon rung is the lone Storybook-classified rung with no actual story/CSS oracle.
