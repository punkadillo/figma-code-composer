# Workbench Trial Report — heroui-20260606

> Generated: 2026-06-07T00:00:00.000Z · Rungs: 13

## Accuracy by ladder rung

| rung | tier | composite | visual | style | struct·src | struct·dom | build gate |
| --- | --- | ---: | ---: | ---: | ---: | ---: | :--: |
| trivial-icon | trivial | — | — | — | — | — | — |
| tokens | moderate | — | — | — | — | — | — |
| trivial-button | trivial | 42 | 0 | 75 | 29 | 22 | ✓ |
| trivial-chip | trivial | 47 | 0 | 75 | 61 | 45 | ✓ |
| moderate-input | moderate | 30 | 2 | 33 | 12 | 23 | ✓ |
| moderate-switch | moderate | 46 | 0 | 75 | 26 | 43 | ✓ |
| complex-card | complex | 47 | 27 | 50 | 22 | 39 | ✓ |
| complex-alert | complex | 56 | 48 | 75 | 21 | 8 | ✓ |
| complex-tabs | complex | 49 | 7 | 83 | 12 | 31 | ✓ |
| complex-dashboard | complex | 45 | — | — | 4 | — | ✓ |
| extreme-calendar | extreme | 45 | 0 | 83 | 3 | 24 | ✓ |
| moderate-input | moderate | — | — | — | — | — | — |
| moderate-input | moderate | — | — | — | — | — | — |

> Accuracy sub-scores are computed live: **visual** = pixel-diff of the component rendered in the target Storybook vs the HeroUI oracle Storybook (fixed clip); **style** = `getComputedStyle` match over a fixed prop set; **struct·src** = source-tree similarity and **struct·dom** = rendered-DOM similarity (the composite uses dom when available, else src). A cell reads `—` when that sub-score was not computed (no HeroUI story for the rung, or rendering unavailable); its weight is then **renormalised** across the remaining sub-scores, so the composite reflects only what was measured (see `availability` in `results.json`). The target is `designSystem: none` (plain Tailwind) vs the HeroUI design system, so **visual/style read low by design** — they measure divergence from HeroUI's look, not code quality; `struct·dom` and the cross-rung trend are the meaningful signals. The **build gate** column is deterministic; a11y is not in the gate set (axe unavailable). "(capped)" marks a build-fail-capped composite.

## Quality by ladder rung

| rung | composite | optimizedCode | dx | docs | testDepth | storybook |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| trivial-icon | — | — | — | — | — | — |
| tokens | — | — | — | — | — | — |
| trivial-button | 64 | 57 | 67 | 5 | 87 | 89 |
| trivial-chip | 65 | 63 | 70 | 5 | 87 | 84 |
| moderate-input | 63 | 39 | 78 | 7 | 94 | 90 |
| moderate-switch | 64 | 57 | 63 | 7 | 94 | 87 |
| complex-card | 64 | 39 | 74 | 13 | 92 | 95 |
| complex-alert | 65 | 56 | 67 | 7 | 89 | 92 |
| complex-tabs | 64 | 36 | 77 | 7 | 96 | 94 |
| complex-dashboard | 61 | 66 | 65 | 13 | 87 | 51 |
| extreme-calendar | 67 | 41 | 86 | 7 | 96 | 94 |
| moderate-input | — | — | — | — | — | — |
| moderate-input | — | — | — | — | — | — |

> Quality = source-based judge, **3-vote median panel** per dimension (15 judge agents across the 5 scored rungs) over `target` + `ref-heroui` against `oracle/rubric.md`, weighted by `oracle/quality-weights.json`. `icon-only`/`page` are out of scope (no full component). Dimensions are the per-dimension median of the panel; the deterministic metric-blend layer is not yet applied.

## Build gates by rung (deterministic)

| rung | tsc | build | unit tests | gate |
| --- | :--: | :--: | ---: | :--: |
| trivial-icon | — | — | — | — |
| tokens | — | — | — | — |
| trivial-button | ✓ | ✓ | 26/26 | ✓ |
| trivial-chip | ✓ | ✓ | 21/21 | ✓ |
| moderate-input | ✓ | ✓ | 26/26 | ✓ |
| moderate-switch | ✓ | ✓ | 15/15 | ✓ |
| complex-card | ✓ | ✓ | 59/59 | ✓ |
| complex-alert | ✓ | ✓ | 22/22 | ✓ |
| complex-tabs | ✓ | ✓ | 40/40 | ✓ |
| complex-dashboard | ✓ | ✓ | 14/14 | ✓ |
| extreme-calendar | ✓ | ✓ | 130/130 | ✓ |
| moderate-input | — | — | — | — |
| moderate-input | — | — | — | — |

> The build-gate is the source-derivable slice of accuracy. Visual (pixel-diff) and style (computed-style) scoring require live rendering and are not included here — see `analysis/01-accuracy-feasibility.md`.

## Cost & token ladder by rung

| rung | tier | requests | total tokens | output | cacheRead | cacheCreate | model time (ms) | cost (USD) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| trivial-icon | trivial | 33 | 863,776 | 11,669 | 786,741 | 65,279 | 218,195 | 0.4799 |
| tokens | moderate | 45 | 2,698,071 | 30,256 | 2,408,440 | 246,777 | 438,763 | 1.8344 |
| trivial-button | trivial | 62 | 2,639,200 | 37,260 | 2,374,335 | 227,188 | 487,717 | 1.7249 |
| trivial-chip | trivial | 28 | 1,080,183 | 32,286 | 882,126 | 154,089 | 451,103 | 1.5703 |
| moderate-input | moderate | 59 | 1,854,861 | 35,710 | 1,645,419 | 172,110 | 563,080 | 1.6796 |
| moderate-switch | moderate | 59 | 2,011,494 | 38,532 | 1,807,428 | 162,064 | 659,384 | 1.7384 |
| complex-card | complex | 65 | 2,651,209 | 52,711 | 2,327,711 | 261,340 | 776,601 | 3.0498 |
| complex-alert | complex | 60 | 1,851,206 | 39,582 | 1,628,412 | 180,671 | 618,461 | 1.7063 |
| complex-tabs | complex | 70 | 2,687,211 | 54,195 | 2,303,346 | 301,930 | 773,696 | 3.6641 |
| complex-dashboard | complex | 115 | 4,755,778 | 78,038 | 4,169,330 | 483,928 | 1,267,845 | 5.2541 |
| extreme-calendar | extreme | 150 | 7,514,924 | 118,206 | 6,629,644 | 713,051 | 1,706,533 | 8.3542 |
| moderate-input | moderate | 74 | 2,077,667 | 37,128 | 1,852,695 | 185,633 | 608,442 | 1.7168 |
| moderate-input | moderate | 10 | 292,379 | 11,192 | 212,612 | 67,733 | 163,536 | 0.4882 |
| **total** | — | — | **32,977,959** | — | — | — | — | **33.2609** |

> Tokens are OTEL-reported per run, summed across that run's agents. `cacheRead` typically dominates `total` (prompt-cache hits are billed cheap but counted). `model time` is summed request duration, not wall-clock.

## Scenario comparisons

- **Cold → warm cache:** token change 12% (run `moderate-input-cold` → `moderate-input-warm`).
- **Build → update:** token change -84% (run `moderate-input-cold` → `moderate-input-update`).

## Dominance (all rungs)

- **Token-dominant agent:** custom
- **Time-dominant agent:** custom
  - tier `trivial`: custom
  - tier `moderate`: custom
  - tier `complex`: custom
  - tier `extreme`: custom

## Cross-check (OTEL vs costs.jsonl)

- OTEL total tokens: 32,977,959
- costs.jsonl total tokens: 32,977,959
- delta: 0%

## NEW measurables (heroui-20260606 baseline)

Source: `workbench/trials/heroui-20260606/measurables.json` (computed by `workbench/oracle/tokens-measurables.mjs`).

### `tokens` rung
| signal | value | verdict |
| --- | --- | :--: |
| `semantic.css` non-empty | 90 tokens | ✓ |
| semantic aliases primitives | 90/90 refs `var(--…)` | ✓ |
| token count (primitives) | **91** vs oracle ~87 | ✓ close |
| total tokens (prim+sem+comp) | 185 (91 + 90 + 4) | — |
| light + dark modes emitted | **light only — no dark mode** | ✗ |

### Stateful `"use client"` directive
| component | stateful | `"use client"` | verdict |
| --- | :--: | :--: | :--: |
| moderate-input | yes | ✓ | ✓ |
| moderate-switch | yes (`useState`) | ✗ | **✗ missing** |
| (also present: Card, Tabs, Alert ✓) | | | |

### Compound / discriminated APIs (not prop-bags)
- **complex-card** → ✓ `Card + CardHeader + CardFooter` (composable sub-components)
- **complex-tabs** → ✓ `Tabs + Tab` (compound)

### Think-once token cost
- **complex-dashboard vs complex-alert baseline:** 4,755,778 vs 1,851,206 → **2.57× (+157%)**
- **cold → warm input cache:** 1,854,861 → 2,077,667 → **+12%** (warm cost *more* — cache did not reduce tokens)
- **build → update input:** 1,854,861 → 292,379 → **−84%** (update is dramatically cheaper)

### Tokens-per-agent baseline (per rung, OTEL collapsed each run to a single agent bucket → = per-run total)
trivial-icon 0.86M · tokens 2.70M · trivial-button 2.64M · trivial-chip 1.08M · moderate-input-cold 1.85M · moderate-switch 2.01M · complex-card 2.65M · complex-alert 1.85M · complex-tabs 2.69M · complex-dashboard 4.76M · extreme-calendar 7.51M · input-warm 2.08M · input-update 0.29M
