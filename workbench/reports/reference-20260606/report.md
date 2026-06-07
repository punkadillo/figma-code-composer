# Workbench Trial Report — reference-20260606

> Generated: 2026-06-07T21:51:43.644Z · Rungs: 13

## Accuracy by ladder rung

| rung | tier | composite | visual | style | struct·src | struct·dom | build gate |
| --- | --- | ---: | ---: | ---: | ---: | ---: | :--: |
| complex-alert | complex | 56 | 48 | 75 | 21 | 8 | ✓ |
| complex-card | complex | 47 | 27 | 50 | 22 | 39 | ✓ |
| complex-dashboard | complex | 45 | — | — | 4 | — | ✓ |
| complex-tabs | complex | 49 | 7 | 83 | 12 | 31 | ✓ |
| extreme-calendar | extreme | 45 | 0 | 83 | 3 | 24 | ✓ |
| moderate-input (cold) | moderate | 30 | 2 | 33 | 12 | 23 | ✓ |
| moderate-input (update) | moderate | — | — | — | — | — | — |
| moderate-input (warm) | moderate | — | — | — | — | — | — |
| moderate-switch | moderate | 46 | 0 | 75 | 26 | 43 | ✓ |
| tokens | moderate | — | — | — | — | — | — |
| trivial-button | trivial | 42 | 0 | 75 | 29 | 22 | ✓ |
| trivial-chip | trivial | 47 | 0 | 75 | 61 | 45 | ✓ |
| trivial-icon | trivial | — | — | — | — | — | — |

> Accuracy sub-scores are computed live: **visual** = pixel-diff of the component rendered in the target Storybook vs the reference oracle Storybook (fixed clip); **style** = `getComputedStyle` match over a fixed prop set; **struct·src** = source-tree similarity and **struct·dom** = rendered-DOM similarity (the composite uses dom when available, else src). A cell reads `—` when that sub-score was not computed (no reference story for the rung, or rendering unavailable); its weight is then **renormalised** across the remaining sub-scores, so the composite reflects only what was measured (see `availability` in `results.json`). The target is `designSystem: none` (plain Tailwind) vs the reference design system, so **visual/style read low by design** — they measure divergence from the reference look, not code quality; `struct·dom` and the cross-rung trend are the meaningful signals. The **build gate** column is deterministic; a11y is not in the gate set (axe unavailable). "(capped)" marks a build-fail-capped composite.

## Quality by ladder rung

| rung | composite | optimizedCode | dx | docs | testDepth | storybook |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| complex-alert | 65 | 56 | 67 | 7 | 89 | 92 |
| complex-card | 64 | 39 | 74 | 13 | 92 | 95 |
| complex-dashboard | 61 | 66 | 65 | 13 | 87 | 51 |
| complex-tabs | 64 | 36 | 77 | 7 | 96 | 94 |
| extreme-calendar | 67 | 41 | 86 | 7 | 96 | 94 |
| moderate-input (cold) | 63 | 39 | 78 | 7 | 94 | 90 |
| moderate-input (update) | — | — | — | — | — | — |
| moderate-input (warm) | — | — | — | — | — | — |
| moderate-switch | 64 | 57 | 63 | 7 | 94 | 87 |
| tokens | — | — | — | — | — | — |
| trivial-button | 64 | 57 | 67 | 5 | 87 | 89 |
| trivial-chip | 65 | 63 | 70 | 5 | 87 | 84 |
| trivial-icon | — | — | — | — | — | — |

> Quality = source-based judge, **3-vote median panel** per dimension (15 judge agents across the 5 scored rungs) over `target` + the reference oracle against `oracle/rubric.md`, weighted by `oracle/quality-weights.json`. `icon-only`/`page` are out of scope (no full component). Dimensions are the per-dimension median of the panel; the deterministic metric-blend layer is not yet applied.

## Accessibility by rung (axe-core)

| rung | score | violations | nodes | top issues |
| --- | ---: | ---: | ---: | --- |
| complex-alert | 100 | 0 | 0 | — |
| complex-card | 100 | 0 | 0 | — |
| complex-dashboard | 100 | 0 | 0 | — |
| complex-tabs | 100 | 0 | 0 | — |
| extreme-calendar | 100 | 0 | 0 | — |
| moderate-input (cold) | 100 | 0 | 0 | — |
| moderate-input (update) | — | — | — | — |
| moderate-input (warm) | — | — | — | — |
| moderate-switch | 100 | 0 | 0 | — |
| tokens | — | — | — | — |
| trivial-button | 100 | 0 | 0 | — |
| trivial-chip | 100 | 0 | 0 | — |
| trivial-icon | — | — | — | — |

> axe-core WCAG audit over the rendered story root. Score starts at 100; each violation subtracts a per-impact penalty × min(nodes, cap) (`oracle/a11y-weights.json`). `—` = not rendered/scored.

## Stateless & Headless by rung

| rung | score | controlled | value-stateless | hook-extracted | forwardRef | effect-disc |
| --- | ---: | :--: | :--: | :--: | :--: | :--: |
| complex-alert | 55 | ✗ | ✓ | ✗ | ✓ | ✓ |
| complex-card | 55 | ✗ | ✓ | ✗ | ✓ | ✓ |
| complex-dashboard | 55 | ✗ | ✓ | ✗ | ✓ | ✓ |
| complex-tabs | 40 | ✓ | ✗ | ✗ | ✓ | ✗ |
| extreme-calendar | 55 | ✓ | ✗ | ✗ | ✓ | ✓ |
| moderate-input (cold) | 80 | ✓ | ✓ | ✗ | ✓ | ✓ |
| moderate-input (update) | — | — | — | — | — | — |
| moderate-input (warm) | — | — | — | — | — | — |
| moderate-switch | 80 | ✓ | ✓ | ✗ | ✓ | ✓ |
| tokens | — | — | — | — | — | — |
| trivial-button | 55 | ✗ | ✓ | ✗ | ✓ | ✓ |
| trivial-chip | 55 | ✗ | ✓ | ✗ | ✓ | ✓ |
| trivial-icon | — | — | — | — | — | — |

> Static source analysis (`oracle/metrics/architecture.mjs`): rewards controlled (prop-driven) APIs, no internal value state, extracted/headless logic, `forwardRef`, and side-effect discipline (`oracle/headless-weights.json`).

## Token binding by rung

| rung | score | literals | var(--) refs | sample literals |
| --- | ---: | ---: | ---: | --- |
| complex-alert | 100 | 0 | 0 | — |
| complex-card | 84 | 2 | 3 | 116px |
| complex-dashboard | 84 | 2 | 0 | 16px, 48px |
| complex-tabs | 44 | 7 | 0 | 2px, #f5f5f5, 16px, 226px, 80px |
| extreme-calendar | 100 | 0 | 0 | — |
| moderate-input (cold) | 84 | 2 | 2 | 6px |
| moderate-input (update) | — | — | — | — |
| moderate-input (warm) | — | — | — | — |
| moderate-switch | 92 | 1 | 0 | 16px |
| tokens | — | — | — | — |
| trivial-button | 100 | 0 | 0 | — |
| trivial-chip | 100 | 0 | 0 | — |
| trivial-icon | — | — | — | — |

> Literal-freedom (`oracle/score-token-binding.mjs`): 100 when no hardcoded design values (hex / `rgb()`·`hsl()` / arbitrary Tailwind values / raw px·rem) are inlined; each literal deducts. Directly tracks binding rule 4 — styled values should bind to tokens, not inline.

## Core Web Vitals by rung

| rung | score | LCP (ms) | CLS | TBT (ms) |
| --- | ---: | ---: | ---: | ---: |
| complex-alert | 100 | 60 | 0 | 0 |
| complex-card | 100 | 60 | 0 | 0 |
| complex-dashboard | 100 | 84 | 0 | 0 |
| complex-tabs | 100 | 64 | 0 | 0 |
| extreme-calendar | 100 | 72 | 0 | 0 |
| moderate-input (cold) | 100 | 64 | 0 | 0 |
| moderate-input (update) | — | — | — | — |
| moderate-input (warm) | — | — | — | — |
| moderate-switch | 100 | 0 | 0 | 0 |
| tokens | — | — | — | — |
| trivial-button | 100 | 152 | 0 | 16 |
| trivial-chip | 100 | 60 | 0 | 0 |
| trivial-icon | — | — | — | — |

> Captured in the render harness via `PerformanceObserver`. Scored against Google good/needs-improvement/poor bands (`oracle/cwv-weights.json`): LCP 0.4, CLS 0.3, TBT 0.3.

## Build gates by rung (deterministic)

| rung | tsc | build | unit tests | gate |
| --- | :--: | :--: | ---: | :--: |
| complex-alert | ✓ | ✓ | 22/22 | ✓ |
| complex-card | ✓ | ✓ | 59/59 | ✓ |
| complex-dashboard | ✓ | ✓ | 14/14 | ✓ |
| complex-tabs | ✓ | ✓ | 40/40 | ✓ |
| extreme-calendar | ✓ | ✓ | 130/130 | ✓ |
| moderate-input (cold) | ✓ | ✓ | 26/26 | ✓ |
| moderate-input (update) | — | — | — | — |
| moderate-input (warm) | — | — | — | — |
| moderate-switch | ✓ | ✓ | 15/15 | ✓ |
| tokens | — | — | — | — |
| trivial-button | ✓ | ✓ | 26/26 | ✓ |
| trivial-chip | ✓ | ✓ | 21/21 | ✓ |
| trivial-icon | — | — | — | — |

> The build-gate is the source-derivable slice of accuracy. Visual (pixel-diff) and style (computed-style) scoring require live rendering and are not included here — see `analysis/01-accuracy-feasibility.md`.

## Cost & token ladder by rung

| rung | tier | requests | total tokens | output | cacheRead | cacheCreate | model time (ms) | cost (USD) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| complex-alert | complex | 60 | 1,851,206 | 39,582 | 1,628,412 | 180,671 | 618,461 | 1.7063 |
| complex-card | complex | 65 | 2,651,209 | 52,711 | 2,327,711 | 261,340 | 776,601 | 3.0498 |
| complex-dashboard | complex | 115 | 4,755,778 | 78,038 | 4,169,330 | 483,928 | 1,267,845 | 5.2541 |
| complex-tabs | complex | 70 | 2,687,211 | 54,195 | 2,303,346 | 301,930 | 773,696 | 3.6641 |
| extreme-calendar | extreme | 150 | 7,514,924 | 118,206 | 6,629,644 | 713,051 | 1,706,533 | 8.3542 |
| moderate-input (cold) | moderate | 59 | 1,854,861 | 35,710 | 1,645,419 | 172,110 | 563,080 | 1.6796 |
| moderate-input (update) | moderate | 10 | 292,379 | 11,192 | 212,612 | 67,733 | 163,536 | 0.4882 |
| moderate-input (warm) | moderate | 74 | 2,077,667 | 37,128 | 1,852,695 | 185,633 | 608,442 | 1.7168 |
| moderate-switch | moderate | 59 | 2,011,494 | 38,532 | 1,807,428 | 162,064 | 659,384 | 1.7384 |
| tokens | moderate | 45 | 2,698,071 | 30,256 | 2,408,440 | 246,777 | 438,763 | 1.8344 |
| trivial-button | trivial | 62 | 2,639,200 | 37,260 | 2,374,335 | 227,188 | 487,717 | 1.7249 |
| trivial-chip | trivial | 28 | 1,080,183 | 32,286 | 882,126 | 154,089 | 451,103 | 1.5703 |
| trivial-icon | trivial | 33 | 863,776 | 11,669 | 786,741 | 65,279 | 218,195 | 0.4799 |
| **total** | — | — | **32,977,959** | — | — | — | — | **33.2609** |

> Tokens are OTEL-reported per run, summed across that run's agents. `cacheRead` typically dominates `total` (prompt-cache hits are billed cheap but counted). `model time` is summed request duration, not wall-clock.

## Scenario comparisons

- **Cold → warm cache:** token change 12% (run `moderate-input-cold` → `moderate-input-warm`).
- **Build → update:** token change -84% (run `moderate-input-cold` → `moderate-input-update`).

## Dominance (all rungs)

- **Token-dominant agent:** custom
- **Time-dominant agent:** custom
  - tier `complex`: custom
  - tier `extreme`: custom
  - tier `moderate`: custom
  - tier `trivial`: custom

## Cross-check (OTEL vs costs.jsonl)

- OTEL total tokens: 32,977,959
- costs.jsonl total tokens: 32,977,959
- delta: 0%

## OpenTelemetry report

- **Total cost:** $33.2610 · **Total tokens:** 32,977,959 · **Requests:** 830
- **Cost-dominant agent:** custom

| agent | requests | total tokens | output | cost (USD) | ttft avg (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| custom | 830 | 32,977,959 | 576,765 | 33.2609 | 0 |

### Cost to build by rung

| rung | tier | cost (USD) | tokens |
| --- | --- | ---: | ---: |
| complex-alert | complex | 1.7063 | 1,851,206 |
| complex-card | complex | 3.0498 | 2,651,209 |
| complex-dashboard | complex | 5.2541 | 4,755,778 |
| complex-tabs | complex | 3.6641 | 2,687,211 |
| extreme-calendar | extreme | 8.3542 | 7,514,924 |
| moderate-input (cold) | moderate | 1.6796 | 1,854,861 |
| moderate-input (update) | moderate | 0.4882 | 292,379 |
| moderate-input (warm) | moderate | 1.7168 | 2,077,667 |
| moderate-switch | moderate | 1.7384 | 2,011,494 |
| tokens | moderate | 1.8344 | 2,698,071 |
| trivial-button | trivial | 1.7249 | 2,639,200 |
| trivial-chip | trivial | 1.5703 | 1,080,183 |
| trivial-icon | trivial | 0.4799 | 863,776 |

> OTEL `costUsd`/token usage rolled per agent and per rung from `events.jsonl` (metered by Claude Code). `ttft avg` is request-weighted from `spans.jsonl`. The cross-check above reconciles OTEL totals against the coordinator `costs.jsonl` ledger.

## Efficiency by rung

| rung | tier | latency (ms) | cache-hit | tool-calls | ttft (ms) | $/acc-pt | tok/acc-pt |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| complex-alert | complex | 2,892,380 | 88% | 0 | 0 | 0.0305 | 33,057 |
| complex-card | complex | 2,545,903 | 88% | 0 | 0 | 0.0649 | 56,409 |
| complex-dashboard | complex | 8,947,980 | 88% | 0 | 0 | 0.1168 | 105,684 |
| complex-tabs | complex | 3,615,023 | 86% | 0 | 0 | 0.0748 | 54,841 |
| extreme-calendar | extreme | 31,224,328 | 88% | 0 | 0 | 0.1856 | 166,998 |
| moderate-input (cold) | moderate | 2,378,431 | 89% | 0 | 0 | 0.0560 | 61,829 |
| moderate-input (update) | moderate | 838,110 | 73% | 0 | 0 | — | — |
| moderate-input (warm) | moderate | 4,313,220 | 89% | 0 | 0 | — | — |
| moderate-switch | moderate | 2,231,946 | 90% | 0 | 0 | 0.0378 | 43,728 |
| tokens | moderate | 5,371,186 | 89% | 0 | 0 | — | — |
| trivial-button | trivial | 3,342,967 | 90% | 0 | 0 | 0.0411 | 62,838 |
| trivial-chip | trivial | 1,344,665 | 82% | 0 | 0 | 0.0334 | 22,983 |
| trivial-icon | trivial | 613 | 91% | 0 | 0 | — | — |

> All derived from telemetry already captured (`analyze/efficiency.mjs`). `cache-hit` = `cacheRead / total` tokens; `$/acc-pt` & `tok/acc-pt` normalise cost/tokens by the accuracy composite (— when the rung is unscored). `latency` is wall-clock; `ttft` is request-weighted.

## Static code-health by rung

| rung | health | types | complexity | css | dangerous | srv/client | rtl | comments | compose | naming | propTypes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| complex-alert | 95 | 100 | 59 | 100 | 100 | 100 | 100 | 90 | 100 | 100 | 100 |
| complex-card | 92 | 100 | 13 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| complex-dashboard | 94 | 100 | 100 | 100 | 100 | 60 | 100 | 90 | 100 | 80 | 100 |
| complex-tabs | 88 | 96 | 0 | 100 | 100 | 100 | 100 | 70 | 100 | 100 | 100 |
| extreme-calendar | 84 | 64 | 0 | 100 | 100 | 100 | 100 | 100 | 65 | 100 | 100 |
| moderate-input (cold) | 90 | 92 | 41 | 100 | 100 | 100 | 100 | 80 | 100 | 80 | 100 |
| moderate-input (update) | — | — | — | — | — | — | — | — | — | — | — |
| moderate-input (warm) | — | — | — | — | — | — | — | — | — | — | — |
| moderate-switch | 93 | 100 | 81 | 100 | 100 | 100 | 100 | 80 | 65 | 100 | 100 |
| tokens | — | — | — | — | — | — | — | — | — | — | — |
| trivial-button | 99 | 100 | 84 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| trivial-chip | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| trivial-icon | — | — | — | — | — | — | — | — | — | — | — |

> Static source scan (`oracle/metrics/source-static.mjs`): type strictness · cyclomatic-ish complexity · CSS hygiene · dangerous APIs · unnecessary `"use client"` · RTL logical-properties · comment economy (the 80-char rule) · composability · naming · prop-type/JSDoc completeness. `health` is the mean of available sub-scores.

## Design tokens by rung

| rung | semantic-alias | orphan refs | coverage |
| --- | ---: | ---: | ---: |
| complex-alert | 64% | 0 | — |
| complex-card | 64% | 0 | — |
| complex-dashboard | 64% | 0 | — |
| complex-tabs | 64% | 0 | — |
| extreme-calendar | 64% | 0 | — |
| moderate-input (cold) | 64% | 0 | — |
| moderate-input (update) | — | — | — |
| moderate-input (warm) | — | — | — |
| moderate-switch | 64% | 0 | — |
| tokens | — | — | — |
| trivial-button | 64% | 0 | — |
| trivial-chip | 64% | 0 | — |
| trivial-icon | — | — | — |

> `oracle/metrics/design-tokens.mjs`: semantic-alias = share of tokens that alias another via `var()`; orphan refs = `var(--x)` used but not defined; coverage (emitted ÷ Figma-needed) is `—` when the manifest needed-count is unavailable.

## DOM & render by rung

| rung | dom | nodes | depth | render | focus | keyboard | mount (ms) | perf |
| --- | ---: | ---: | ---: | ---: | :--: | ---: | ---: | ---: |
| complex-alert | 100 | 9 | 6 | 100 | — | 0/0 | 60 | 97 |
| complex-card | 100 | 9 | 6 | 100 | ✓ | 1/1 | 60 | 97 |
| complex-dashboard | 0 | 287 | 11 | 100 | ✓ | 29/29 | 84 | 90 |
| complex-tabs | 100 | 15 | 7 | 100 | ✓ | 6/6 | 64 | 96 |
| extreme-calendar | 0 | 113 | 9 | 100 | ✓ | 44/44 | 72 | 94 |
| moderate-input (cold) | 100 | 4 | 3 | 100 | ✓ | 1/1 | 64 | 96 |
| moderate-input (update) | — | — | — | — | — | — | — | — |
| moderate-input (warm) | — | — | — | — | — | — | — | — |
| moderate-switch | 100 | 5 | 4 | 100 | ✓ | 1/1 | 38 | 100 |
| tokens | — | — | — | — | — | — | — | — |
| trivial-button | 100 | 1 | 1 | 100 | — | 0/0 | 152 | 71 |
| trivial-chip | 100 | 1 | 1 | 100 | — | 0/0 | 60 | 97 |
| trivial-icon | — | — | — | — | — | — | — | — |

> DOM = nesting/bloat health (`metrics/dom-shape.mjs`). render = focus-visible + keyboard reachability + interaction-ok (`score-render-signals.mjs`). perf = mount-time band (`score-runtime-perf.mjs`); INP / re-renders / memory are capability-gated.

## Process & build meta

- **KG reuse rate:** — (no-resolution-data)
- **Update diff-size:** — (no-update-diff-data)
- **Retry/error rate:** — (no-retry-data)
- **HITL gate count:** — (no-hitl-data)
- **Tier-routing accuracy:** — (no-ideal-tier-data)
- **Prompt-injection resistance:** — (no-injection-data)
- **Import cycles:** 100 (0 cycles / 9 nodes)
- **Bundle size:** — (no-build) · **Lint:** — (no-lint-run) _(capability-gated — need a build / eslint run)_

> `—` with a reason = the signal was not captured in this trial (e.g. determinism needs two runs; reuse-rate needs KG `resolution` data). The scorers compute as soon as that data is present.
