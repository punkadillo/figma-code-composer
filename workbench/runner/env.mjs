// workbench/runner/env.mjs
import { join } from 'node:path';

// Build the OTEL env block (spec §3.2). http/json so the receiver parses bodies.
export function telemetryEnv({ trialDir, endpoint = 'http://localhost:4318' }) {
  return {
    CLAUDE_CODE_ENABLE_TELEMETRY: '1',
    CLAUDE_CODE_ENHANCED_TELEMETRY_BETA: '1',
    OTEL_METRICS_EXPORTER: 'otlp',
    OTEL_LOGS_EXPORTER: 'otlp',
    OTEL_TRACES_EXPORTER: 'otlp',
    OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
    OTEL_EXPORTER_OTLP_ENDPOINT: endpoint,
    OTEL_METRIC_EXPORT_INTERVAL: '5000',
    OTEL_LOGS_EXPORT_INTERVAL: '2000',
    OTEL_TRACES_EXPORT_INTERVAL: '2000',
    OTEL_METRICS_INCLUDE_SESSION_ID: 'true',
    OTEL_LOG_RAW_API_BODIES: `file:${join(trialDir, 'bodies')}`,
  };
}
