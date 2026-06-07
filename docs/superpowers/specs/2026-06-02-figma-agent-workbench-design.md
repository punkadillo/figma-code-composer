# Figma-Pipeline Agent Workbench — Design Spec

- **Date:** 2026-06-02
- **Status:** Approved (brainstorming) — pending implementation plan
- **Owner:** repo owner
- **Topic:** A reusable workbench that benchmarks every figma-code-composer agent for token consumption (input/output/thinking), wall-clock time, icon fan-in blocking, and component accuracy — plus a first live trial driven through it.

---

## 1. Goal

Measure, per pipeline agent and per scenario:

1. **Token consumption** — input, output, cache-read, cache-creation, and an *estimated* thinking split.
2. **Time** — wall-clock per agent to produce a component, plus time-to-first-token.
3. **Accuracy** — how close each generated component is to a known-good hosted reference (the "oracle").
4. **Agent dominance** — which agent costs the most tokens / time, broken out by complexity tier.
5. **Icon fan-in blocking** — when a component has icons, how long dependent agents are blocked waiting on `icon-generator` before parallel fan-in completes.
6. **Scenario effects** — icon vs no-icon, complexity tiers, cold vs warm cache, build vs update.

Deliverable shape (chosen): **C** — build a reusable harness, then run one live trial through it.

## 2. Inputs (provided by the user)

| Role | Provided as | Used for |
| --- | --- | --- |
| **Pipeline input** | Figma design URL | Fed to `/figma-build` / `/figma-update` — what the agents consume |
| **Accuracy oracle** | Hosted component website **+ its source repo** | Ground truth the generated output is scored against |
| **Write target** | A clone of the hosted-site repo, configured via `/init-figma-compose` | Where the agents emit generated code |

Stack of the write target is determined by **(A) auto-detecting the hosted site** *and* **(C) using the site's source repo**, with detection verified to match.

## 3. Telemetry — source of truth

Claude Code OpenTelemetry (verified against code.claude.com/docs/en/monitoring-usage, fetched 2026-06-02). Per-agent attribution is **native** — no timeline-correlation hack required.

### 3.1 Signals used

- **Metric `claude_code.token.usage`** — broken down by `type` (input/output), `model`, and **`agent.name`**.
- **Metric `claude_code.cost.usage`** — `cost_usd`, attributable by `agent.name`.
- **Event `claude_code.api_request`** (logs/events exporter) — per request: `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`, `cost_usd`, `duration_ms`, `model`, `event.timestamp` (ISO 8601), `event.sequence`, `query_source` (`main`/`subagent`/`auxiliary` or subagent name), and `agent.name`.
- **Trace spans (beta)** `claude_code.llm_request` — `agent_id`, `parent_agent_id`, `duration_ms`, `ttft_ms`, `input_tokens`, `query_source`, `llm_request.context`. Reconstructs the coordinator→specialist spawn tree and gives true span overlap timing for fan-in analysis.
- **Event `claude_code.api_request_body` / `api_response_body`** (gated by `OTEL_LOG_RAW_API_BODIES=file:<dir>`) — full request/response JSON on disk with a `body_ref` pointer. Used to estimate thinking tokens.

### 3.2 Environment the runner exports

```bash
CLAUDE_CODE_ENABLE_TELEMETRY=1
CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1          # enables llm_request spans
OTEL_METRICS_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp
OTEL_TRACES_EXPORTER=otlp
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf      # or http/json for the local receiver
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_METRIC_EXPORT_INTERVAL=5000               # tighten for short trials
OTEL_LOGS_EXPORT_INTERVAL=2000
OTEL_METRICS_INCLUDE_SESSION_ID=true
OTEL_LOG_RAW_API_BODIES=file:workbench/trials/<trialId>/bodies   # thinking-split capture (heavier; bodies include full conversation)
```

### 3.3 Known limitation — thinking tokens

OTEL exposes input / output / cache-read / cache-creation tokens but **no dedicated thinking-token field** — thinking is billed *inside* `output_tokens`. The harness estimates thinking by tokenizing the `thinking` blocks in the captured raw response bodies (`OTEL_LOG_RAW_API_BODIES=file:…`). This is an **approximation**, reported as `thinking_tokens_est` alongside the authoritative `output_tokens`. Raw-body capture writes full conversation bodies to disk — acceptable here because the trial runs against a throwaway example, not sensitive code. Bodies live only under `workbench/trials/<trialId>/bodies` and are git-ignored.

## 4. Telemetry topology — local OTLP receiver (chosen: A)

A tiny Node OTLP/HTTP receiver listens on `:4318`, accepts OTLP metrics, logs, and traces, and appends each record to newline-delimited JSON under the active trial dir. Zero external install; self-contained in the repo.

```
workbench/collector/receiver.mjs   # OTLP/HTTP server → metrics.jsonl, events.jsonl, spans.jsonl
```

The receiver is started by the runner before any pipeline command and stopped after. It tags nothing itself — run boundaries are reconstructed in analysis (Section 7) from `event.timestamp` windows + the runner's run-manifest.

## 5. Directory layout

```
workbench/
  collector/        # OTLP/HTTP receiver (receiver.mjs)
  runner/           # drives the scenario matrix; sets env; snapshots costs.jsonl; writes run-manifest.json
  oracle/           # hosted-site reference capture + the four accuracy scorers
  analyze/          # joins telemetry (metrics/events/spans) + oracle → results.json
  report/           # results.json → report.md + dashboard.html
  trials/<trialId>/ # raw: metrics.jsonl, events.jsonl, spans.jsonl, bodies/, screenshots/, run-manifest.json
  reports/<trialId>/# generated: results.json, report.md, dashboard.html
```

**Write-allowlist:** `workbench/**` and `docs/**` are not in the bootstrap allowlist and are not under `.figma-pipeline/**`. The implementation plan must add `workbench/**` to `config.writeScope.allowedDirs` once `/init-figma-compose` has produced a `config.json` for the trial target, and decide where the workbench tooling physically lives relative to the configured target (it may live in this scaffold repo while the pipeline writes into the cloned example's component dirs). Until then, owner-driven writes use the `FP_ALLOW_RESTRICTED_WRITE=1` escape hatch.

## 6. Metrics captured per agent

Agents in scope: `figma-fetcher`, `token-builder`, `component-builder`, `icon-generator`, `story-author`, `test-author`, `code-reviewer`, `figma-coordinator`.

Per `agent.name`, per run:

- **Tokens:** input, output (thinking-inclusive), `thinking_tokens_est`, cache-read, cache-creation, total.
- **Time:** Σ `duration_ms` from events; true wall-clock from span start→end; `ttft_ms` (first token latency).
- **Tool uses:** cross-checked against `/tmp/figma-<runId>/costs.jsonl` (coordinator spawn ledger: agent name + model + tool uses) and tool spans.
- **Cost:** Σ `cost_usd`.
- **Rankings:** token-dominant and time-dominant agent, overall and per complexity tier.

Cross-check: the existing `costs.jsonl` (one line per spawn) and `handover.md` cost table validate the OTEL-derived per-agent totals; large divergence is itself a finding.

## 7. Icon fan-in blocking analysis

From `llm_request` spans (`agent_id` / `parent_agent_id`) and span start/end timestamps:

1. Identify the fan-out: coordinator spawns `icon-generator` ∥ `component-builder`.
2. Identify the fan-in: `story-author` / `test-author` (and any builder step that consumes an icon) cannot start until `icon-generator` output exists.
3. **Blocking gap** = `max(0, icon_generator.end − dependent.start_of_wait)` — how long the dependent consumer sat idle waiting on icon output.
4. Reported as a per-component waterfall, compared against an icon-free control component.

## 8. Accuracy oracle (all four dimensions → composite score)

For each built component, render it in the write target (Storybook/Playwright) and compare to the hosted site:

| Dimension | Method | Output |
| --- | --- | --- |
| **Visual** | Playwright screenshot of generated vs hosted, same viewport/props | % pixel/structural difference |
| **Computed-style** | Resolved CSS (color, spacing, typography, radius) generated vs hosted | per-property match rate |
| **Structural / props** | DOM tree shape, semantic tags, ARIA, prop/variant surface generated vs hosted | structural match score |
| **Gates** | typecheck, build, generated tests pass, a11y scan clean | pass/fail per gate |

Composite `accuracyScore` (0–100) with per-dimension breakdown and explicit weights surfaced in the report. Gates are pass/fail and can hard-cap the score (e.g., a build failure caps accuracy).

## 9. Scenario matrix (all four)

Each row is a tagged run the runner executes against the same Figma source:

1. **Icon fan-in** — an icon-bearing component vs an icon-free control (paired).
2. **Complexity tiers** — trivial / moderate / complex / extreme, binned by the manifest's deterministic complexity score.
3. **Cold vs warm cache** — first build (cold KG, no token reuse) vs immediate rebuild (warm — ledger + cache populated). Quantifies cache-read savings and `tokenReuseRatio` effect.
4. **Build vs update** — `/figma-build` (create) vs `/figma-update` (patch a changed node) for the same component.

The runner records a `run-manifest.json` row per run: `runId`, scenario tags, Figma node, start/end wall-clock, and the `costs.jsonl` snapshot path — the join key for analysis.

## 10. Outputs

- **`results.json`** — full machine-readable dataset: every run × agent × metric × accuracy dimension, plus scenario tags and fan-in gaps.
- **`report.md`** — committed. Exec summary; per-agent token/time tables; token- and time-dominance rankings (overall + per tier); fan-in waterfalls; accuracy scorecard (composite + per dimension); scenario comparisons (icon vs none, tier scaling, cold vs warm, build vs update); the OTEL-vs-costs.jsonl cross-check.
- **`dashboard.html`** — self-contained (inline data + chart lib): token bars per agent, time waterfalls, fan-in timeline, accuracy radar, scenario comparison charts.

## 11. Trial execution flow (the live half of C)

1. User provides **Figma URL** + **hosted-site repo**.
2. Clone repo → detect stack (framework, CSS system) → `/init-figma-compose` against it; verify detection matches the hosted site.
3. Add `workbench/**` to `config.writeScope.allowedDirs`.
4. Capture the oracle: screenshot + computed-style + DOM snapshots of the hosted components.
5. Start the OTLP receiver (`workbench/collector/receiver.mjs`).
6. Runner executes the scenario matrix via `/figma-build` / `/figma-update`, exporting the telemetry env and writing `run-manifest.json` per run.
7. `analyze/` joins telemetry (metrics + events + spans) + oracle → `results.json`.
8. `report/` emits `report.md` + `dashboard.html` under `workbench/reports/<trialId>/`.

## 12. Components & boundaries (for the implementation plan)

| Unit | Responsibility | Depends on |
| --- | --- | --- |
| `collector/receiver.mjs` | Accept OTLP, append metrics/events/spans JSONL | nothing (stdlib http) |
| `runner/` | Set env, start/stop receiver, drive matrix, write run-manifest | collector, the pipeline commands |
| `oracle/capture` | Snapshot hosted-site visual/style/DOM references | Playwright, hosted URL |
| `oracle/score` | Four scorers → composite accuracy | oracle/capture, write-target render |
| `analyze/` | Join telemetry + run-manifest + oracle → results.json | receiver output, runner manifest, oracle |
| `report/` | results.json → report.md + dashboard.html | analyze |

Each unit has one clear purpose, a JSON/file interface, and is independently testable (the analyzer and report generator can be tested against recorded fixtures with no live pipeline run).

## 13. Open questions for the plan

- Exact tokenizer for `thinking_tokens_est` (the harness should use the same tokenizer family the API bills against, or a documented approximation).
- Whether the workbench tooling lives in this scaffold repo or inside the cloned target; resolve once the target stack is known.
- Visual-diff thresholds and per-dimension accuracy weights (defaults proposed in the plan, tunable in a workbench config).
