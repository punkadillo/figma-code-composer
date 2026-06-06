# workbench/trials/heroui-20260606/resume-trial.sh
# SOURCE this (do not execute) in EVERY terminal used for the trial:
#   cd /Users/allan/Projects/figma-to-code-orchestration
#   source workbench/trials/heroui-20260606/resume-trial.sh
#
# It exports the full OTEL telemetry env (must be set BEFORE `claude` launches —
# it cannot be set mid-session) plus the workbench write override, then verifies.

REPO_ROOT="/Users/allan/Projects/figma-to-code-orchestration"
TRIAL_DIR="workbench/trials/heroui-20260606"

cd "$REPO_ROOT" || { echo "✖ repo root not found: $REPO_ROOT"; return 1; }

# --- OTEL telemetry (12 vars — must match runner/env.mjs telemetryEnv) ---
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1
export OTEL_METRICS_EXPORTER=otlp
export OTEL_LOGS_EXPORTER=otlp
export OTEL_TRACES_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=http/json
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_METRIC_EXPORT_INTERVAL=5000
export OTEL_LOGS_EXPORT_INTERVAL=2000
export OTEL_TRACES_EXPORT_INTERVAL=2000
export OTEL_METRICS_INCLUDE_SESSION_ID=true
export OTEL_LOG_RAW_API_BODIES="file:${REPO_ROOT}/${TRIAL_DIR}/bodies"

# --- workbench write override (agents write under workbench/trials/.../target) ---
export FP_ALLOW_RESTRICTED_WRITE=1

# --- scoring convenience: point the oracle harness at this trial ---
export TRIAL="${TRIAL_DIR}"

# --- PATH sanity: node (nvm) + claude (~/.local/bin) must be in THIS shell ---
command -v node  >/dev/null || echo "⚠ node not on PATH — did this shell load your ~/.zshrc? (nvm)"
command -v claude >/dev/null || echo "⚠ claude not on PATH — expected in ~/.local/bin"

mkdir -p "${TRIAL_DIR}/bodies"

# --- verify (writes .env-proof.json; prints '✔ env complete (12 vars set)') ---
node workbench/runner/check-env.mjs "${TRIAL_DIR}"
