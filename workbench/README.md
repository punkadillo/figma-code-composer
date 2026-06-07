# Workbench — figma-pipeline agent benchmark

Captures Claude Code OpenTelemetry from pipeline runs and reports per-agent
token/time/fan-in/dominance. See the design spec at
`docs/superpowers/specs/2026-06-02-figma-agent-workbench-design.md`.

## Run the tests
    npm test

## Build a report from a results.json
    npm run workbench:report -- workbench/reports/<trialId>/results.json
