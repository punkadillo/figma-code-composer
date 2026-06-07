import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attrsToObject, extractApiRequestEvents, extractLlmSpans, extractTokenDataPoints } from './otlp.mjs';

test('attrsToObject coerces the OTLP value union', () => {
  const attrs = [
    { key: 'agent.name', value: { stringValue: 'component-builder' } },
    { key: 'input_tokens', value: { intValue: '120' } },
    { key: 'cost_usd', value: { doubleValue: 0.42 } },
    { key: 'speed', value: { boolValue: true } },
  ];
  assert.deepEqual(attrsToObject(attrs), {
    'agent.name': 'component-builder', input_tokens: 120, cost_usd: 0.42, speed: true,
  });
});

test('extractApiRequestEvents pulls api_request log records flat', () => {
  const payload = { resourceLogs: [{ scopeLogs: [{ logRecords: [
    { timeUnixNano: '1700000000000000000', attributes: [
      { key: 'event.name', value: { stringValue: 'api_request' } },
      { key: 'agent.name', value: { stringValue: 'figma-fetcher' } },
      { key: 'model', value: { stringValue: 'claude-haiku-4-5' } },
      { key: 'input_tokens', value: { intValue: '100' } },
      { key: 'output_tokens', value: { intValue: '40' } },
      { key: 'cache_read_tokens', value: { intValue: '10' } },
      { key: 'cache_creation_tokens', value: { intValue: '5' } },
      { key: 'cost_usd', value: { doubleValue: 0.01 } },
      { key: 'duration_ms', value: { intValue: '900' } },
      { key: 'request_id', value: { stringValue: 'req_1' } },
    ] },
    { attributes: [ { key: 'event.name', value: { stringValue: 'tool_result' } } ] },
  ] }] }] };
  const ev = extractApiRequestEvents([payload]);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].agent, 'figma-fetcher');
  assert.equal(ev[0].inputTokens, 100);
  assert.equal(ev[0].outputTokens, 40);
  assert.equal(ev[0].cacheReadTokens, 10);
  assert.equal(ev[0].cacheCreationTokens, 5);
  assert.equal(ev[0].durationMs, 900);
  assert.equal(ev[0].requestId, 'req_1');
  assert.equal(ev[0].tsNs, 1700000000000000000n);
});

test('extractLlmSpans pulls claude_code.llm_request spans with timing', () => {
  const payload = { resourceSpans: [{ scopeSpans: [{ spans: [
    { name: 'claude_code.llm_request', startTimeUnixNano: '1000', endTimeUnixNano: '4000',
      attributes: [
        { key: 'query_source', value: { stringValue: 'icon-generator' } },
        { key: 'agent_id', value: { stringValue: 'a2' } },
        { key: 'parent_agent_id', value: { stringValue: 'a0' } },
        { key: 'ttft_ms', value: { intValue: '300' } },
      ] },
    { name: 'claude_code.tool.execution', startTimeUnixNano: '1', endTimeUnixNano: '2', attributes: [] },
  ] }] }] };
  const spans = extractLlmSpans([payload]);
  assert.equal(spans.length, 1);
  assert.equal(spans[0].querySource, 'icon-generator');
  assert.equal(spans[0].agentId, 'a2');
  assert.equal(spans[0].parentAgentId, 'a0');
  assert.equal(spans[0].startNs, 1000n);
  assert.equal(spans[0].endNs, 4000n);
  assert.equal(spans[0].ttftMs, 300);
});

test('extractTokenDataPoints sums claude_code.token.usage points by agent+type', () => {
  const payload = { resourceMetrics: [{ scopeMetrics: [{ metrics: [
    { name: 'claude_code.token.usage', sum: { dataPoints: [
      { asInt: '100', attributes: [ { key: 'agent.name', value: { stringValue: 'token-builder' } }, { key: 'type', value: { stringValue: 'input' } } ] },
      { asInt: '20', attributes: [ { key: 'agent.name', value: { stringValue: 'token-builder' } }, { key: 'type', value: { stringValue: 'output' } } ] },
    ] } },
    { name: 'claude_code.cost.usage', sum: { dataPoints: [] } },
  ] }] }] };
  const pts = extractTokenDataPoints([payload]);
  assert.deepEqual(pts, [
    { agent: 'token-builder', type: 'input', value: 100 },
    { agent: 'token-builder', type: 'output', value: 20 },
  ]);
});
