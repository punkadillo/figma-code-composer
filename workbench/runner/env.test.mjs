import { test } from 'node:test';
import assert from 'node:assert/strict';
import { telemetryEnv } from './env.mjs';

test('telemetryEnv emits the documented OTEL variables', () => {
  const env = telemetryEnv({ trialDir: '/tmp/t1', endpoint: 'http://localhost:4318' });
  assert.equal(env.CLAUDE_CODE_ENABLE_TELEMETRY, '1');
  assert.equal(env.CLAUDE_CODE_ENHANCED_TELEMETRY_BETA, '1');
  assert.equal(env.OTEL_METRICS_EXPORTER, 'otlp');
  assert.equal(env.OTEL_LOGS_EXPORTER, 'otlp');
  assert.equal(env.OTEL_TRACES_EXPORTER, 'otlp');
  assert.equal(env.OTEL_EXPORTER_OTLP_PROTOCOL, 'http/json');
  assert.equal(env.OTEL_EXPORTER_OTLP_ENDPOINT, 'http://localhost:4318');
  assert.equal(env.OTEL_LOG_RAW_API_BODIES, 'file:/tmp/t1/bodies');
  assert.equal(env.OTEL_METRICS_INCLUDE_SESSION_ID, 'true');
});
