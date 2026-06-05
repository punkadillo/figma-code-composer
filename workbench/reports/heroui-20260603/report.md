# Workbench Trial Report — heroui-20260603

> Generated: 2026-06-05T00:00:00Z · Rungs: 7

## Accuracy by ladder rung

| rung | tier | composite | visual | style | struct·src | struct·dom | build gate |
| --- | --- | ---: | ---: | ---: | ---: | ---: | :--: |
| icon-only | trivial | — | — | — | — | — | ✓ |
| atom | trivial | 24 | 0 | 17 | 28 | 20 | ✓ |
| molecule | moderate | 42 | 2 | 50 | 29 | 54 | ✓ |
| organism | complex | 48 | 27 | 58 | 11 | 30 | ✓ |
| template | complex | 31 | — | — | 5 | — | ✗ |
| page | extreme | — | — | — | — | — | — |
| all-icons | complex | 43 | 48 | 33 | 20 | 7 | ✓ |

> Accuracy sub-scores are computed live: **visual** = pixel-diff of the component rendered in the target Storybook vs the HeroUI oracle Storybook (fixed clip); **style** = `getComputedStyle` match over a fixed prop set; **struct·src** = source-tree similarity and **struct·dom** = rendered-DOM similarity (the composite uses dom when available, else src). A cell reads `—` when that sub-score was not computed (no HeroUI story for the rung, or rendering unavailable); its weight is then **renormalised** across the remaining sub-scores, so the composite reflects only what was measured (see `availability` in `results.json`). The target is `designSystem: none` (plain Tailwind) vs the HeroUI design system, so **visual/style read low by design** — they measure divergence from HeroUI's look, not code quality; `struct·dom` and the cross-rung trend are the meaningful signals. The **build gate** column is deterministic; a11y is not in the gate set (axe unavailable). "(capped)" marks a build-fail-capped composite.

## Quality by ladder rung

| rung | composite | optimizedCode | dx | docs | testDepth | storybook |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| icon-only | — | — | — | — | — | — |
| atom | 86 | 88 | 90 | 87 | 78 | 90 |
| molecule | 62 | 62 | 55 | 42 | 72 | 74 |
| organism | 56 | 52 | 55 | 62 | 48 | 70 |
| template | 50 | 52 | 38 | 55 | 55 | 52 |
| page | — | — | — | — | — | — |
| all-icons | 90 | 88 | 91 | 89 | 90 | 93 |

> Quality = source-based judge, **3-vote median panel** per dimension (15 judge agents across the 5 scored rungs) over `target` + `ref-heroui` against `oracle/rubric.md`, weighted by `oracle/quality-weights.json`. `icon-only`/`page` are out of scope (no full component). Dimensions are the per-dimension median of the panel; the deterministic metric-blend layer is not yet applied.

## Build gates by rung (deterministic)

| rung | tsc | build | unit tests | gate |
| --- | :--: | :--: | ---: | :--: |
| icon-only | ✓ | ✓ | — | ✓ |
| atom | ✓ | ✓ | 17/17 | ✓ |
| molecule | ✓ | ✓ | 10/10 | ✓ |
| organism | ✓ | ✓ | 26/26 | ✓ |
| template | ✓ | ✓ | 12/13 | ✗ |
| page | — | — | — | — |
| all-icons | ✓ | ✓ | 25/25 | ✓ |

> The build-gate is the source-derivable slice of accuracy. Visual (pixel-diff) and style (computed-style) scoring require live rendering and are not included here — see `analysis/01-accuracy-feasibility.md`.

## Cost & token ladder by rung

| rung | tier | requests | total tokens | output | cacheRead | cacheCreate | model time (ms) | cost (USD) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| icon-only | trivial | 25 | 511,229 | 6,661 | 455,176 | 49,063 | 135,902 | 0.2963 |
| atom | trivial | 65 | 1,462,330 | 27,247 | 1,296,426 | 129,189 | 439,672 | 1.2853 |
| molecule | moderate | 40 | 2,126,177 | 20,438 | 1,977,804 | 127,893 | 379,583 | 1.3796 |
| organism | complex | 69 | 3,224,471 | 37,482 | 3,021,931 | 164,310 | 777,409 | 2.0872 |
| template | complex | 95 | 5,037,086 | 45,002 | 4,797,606 | 194,379 | 804,674 | 2.8435 |
| page | extreme | 66 | 4,076,456 | 19,196 | 3,866,037 | 191,155 | 452,054 | 2.1648 |
| all-icons | complex | 318 | 18,981,027 | 107,534 | 17,994,773 | 876,974 | 2,374,205 | 9.8700 |
| **total** | — | — | **35,418,776** | — | — | — | — | **19.9267** |

> Tokens are OTEL-reported per run, summed across that run's agents. `cacheRead` typically dominates `total` (prompt-cache hits are billed cheap but counted). `model time` is summed request duration, not wall-clock.

## Scenario comparisons

- **Icon fan-in:** rung `all-icons` blocked 0 ms longer than control `organism`.

## Dominance (all rungs)

- **Token-dominant agent:** custom
- **Time-dominant agent:** custom
  - tier `trivial`: custom
  - tier `moderate`: custom
  - tier `complex`: custom
  - tier `extreme`: custom

## Cross-check (OTEL vs costs.jsonl)

- OTEL total tokens: 35,418,776
- costs.jsonl total tokens: 35,418,776
- delta: 0%
