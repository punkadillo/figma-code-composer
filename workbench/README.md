# Workbench — figma-pipeline agent benchmark

Captures Claude Code OpenTelemetry from pipeline runs and reports per-agent
token/time/fan-in/dominance. See the design spec at
`docs/superpowers/specs/2026-06-02-figma-agent-workbench-design.md`.

## Run the tests
    npm test

## Build a report from a results.json
    npm run workbench:report -- workbench/reports/<trialId>/results.json

## Measurement tracks (per rung)

Each ladder rung carries these tracks in the trialset; the dashboard renders one
panel per track and the markdown report mirrors them.

| Track | Source | Module | Notes |
| --- | --- | --- | --- |
| Accuracy | render + source | `oracle/run-accuracy.mjs` | visual / style / structural / gates composite |
| Build Gate | source | `oracle/score-gates.mjs` | tsc / build / unit tests |
| Quality | source judge | `oracle/quality-*.mjs` | 3-vote median panel over `rubric.md` |
| **Token Consumption** | OTEL | derived in `analyze/otel-report.mjs` | per-rung token totals (measurable, lower is better) |
| **Cost to Build** | OTEL `costUsd` | `analyze/otel-report.mjs` | per-rung USD, reconciled vs `costs.jsonl` |
| **Accessibility** | axe-core in render | `oracle/score-a11y.mjs` | WCAG audit; 100 minus per-impact penalties |
| **Stateless & Headless** | static source | `oracle/metrics/architecture.mjs` | controlled API / no value state / hook split / forwardRef / effect discipline |
| **Core Web Vitals** | `PerformanceObserver` in render | `oracle/score-cwv.mjs` | LCP / CLS / TBT vs Google bands |
| **Token binding** | static source | `oracle/score-token-binding.mjs` | literal-freedom — hardcoded hex/rgb/px vs tokens (binding rule 4) |
| **Efficiency** | OTEL (derived) | `analyze/efficiency.mjs` | latency, cache-hit ratio, tool-calls, ttft, cost/tokens-per-accuracy-point |
| **OpenTelemetry report** | OTEL stream | `analyze/otel-report.mjs` | per-agent cost / tokens / ttft + cross-check |

Token/Cost/OTEL are derived from the OTEL agent data present in every trial.
Accessibility and Core Web Vitals require the render pass; Stateless & Headless is
static. Re-score to populate them:

    # static (headless) only
    TRIAL=trials/<id> node workbench/oracle/run-accuracy.mjs
    # + a11y + Core Web Vitals (needs the built target Storybook + axe-core)
    TRIAL=trials/<id> node workbench/oracle/run-accuracy.mjs --render

Per-track weights/thresholds live in `oracle/{a11y,cwv,headless}-weights.json`.
