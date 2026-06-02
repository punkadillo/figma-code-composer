# Workbench runbook (manual live capture)

> Automated end-to-end orchestration arrives in Plan 2. Until then, capture a
> trial manually.

## 1. Start the receiver
    node workbench/collector/receiver.mjs workbench/trials/<trialId> 4318
Leave it running in its own terminal.

## 2. Export the telemetry env in the terminal that runs Claude Code
Mirror `workbench/runner/env.mjs` (telemetryEnv):
    export CLAUDE_CODE_ENABLE_TELEMETRY=1 CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1 \
      OTEL_METRICS_EXPORTER=otlp OTEL_LOGS_EXPORTER=otlp OTEL_TRACES_EXPORTER=otlp \
      OTEL_EXPORTER_OTLP_PROTOCOL=http/json OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
      OTEL_METRIC_EXPORT_INTERVAL=5000 OTEL_LOGS_EXPORT_INTERVAL=2000 OTEL_TRACES_EXPORT_INTERVAL=2000 \
      OTEL_METRICS_INCLUDE_SESSION_ID=true \
      OTEL_LOG_RAW_API_BODIES=file:workbench/trials/<trialId>/bodies

## 3. Run each matrix row (workbench/runner/matrix.mjs → defaultMatrix())
For each scenario, note start/end ISO timestamps and run the command, e.g.
`/figma-build <figma-url>` (or `/figma-update <figma-url>` for the update row).
Snapshot the coordinator's `/tmp/figma-<runId>/costs.jsonl` into
`workbench/trials/<trialId>/costs/<runId>.jsonl` for the cross-check.

## 4. Write run-manifest.json
Create `workbench/trials/<trialId>/run-manifest.json` with `{ trialId, runs: [...] }`
where each run uses `makeRunRow(...)` fields (runId, command, scenario, startedAt, endedAt).

## 5. Build results + report
    node workbench/analyze/build-results.mjs workbench/trials/<trialId> workbench/reports/<trialId>/results.json
    npm run workbench:report -- workbench/reports/<trialId>/results.json
Open `workbench/reports/<trialId>/dashboard.html`.
