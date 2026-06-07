// workbench/analyze/otlp.mjs
// Pure walkers over OTLP/JSON export payloads (http/json protocol).

export function attrsToObject(attributes = []) {
  const out = {};
  for (const a of attributes) {
    const v = a.value || {};
    if ('stringValue' in v) out[a.key] = v.stringValue;
    else if ('intValue' in v) out[a.key] = Number(v.intValue);
    else if ('doubleValue' in v) out[a.key] = v.doubleValue;
    else if ('boolValue' in v) out[a.key] = v.boolValue;
    else out[a.key] = undefined;
  }
  return out;
}

function* logRecords(payloads) {
  for (const p of payloads)
    for (const rl of p.resourceLogs || [])
      for (const sl of rl.scopeLogs || [])
        for (const r of sl.logRecords || []) yield r;
}

export function extractApiRequestEvents(payloads) {
  const out = [];
  for (const r of logRecords(payloads)) {
    const a = attrsToObject(r.attributes);
    if (a['event.name'] !== 'api_request') continue;
    out.push({
      agent: a['agent.name'] ?? null,
      querySource: a['query_source'] ?? null,
      model: a['model'] ?? null,
      inputTokens: a['input_tokens'] ?? 0,
      outputTokens: a['output_tokens'] ?? 0,
      cacheReadTokens: a['cache_read_tokens'] ?? 0,
      cacheCreationTokens: a['cache_creation_tokens'] ?? 0,
      costUsd: a['cost_usd'] ?? 0,
      durationMs: a['duration_ms'] ?? 0,
      requestId: a['request_id'] ?? null,
      sequence: a['event.sequence'] ?? null,
      tsNs: r.timeUnixNano ? BigInt(r.timeUnixNano) : null,
    });
  }
  return out;
}

export function extractLlmSpans(payloads) {
  const out = [];
  for (const p of payloads)
    for (const rs of p.resourceSpans || [])
      for (const ss of rs.scopeSpans || [])
        for (const s of ss.spans || []) {
          if (s.name !== 'claude_code.llm_request') continue;
          const a = attrsToObject(s.attributes);
          out.push({
            querySource: a['query_source'] ?? null,
            agentId: a['agent_id'] ?? null,
            parentAgentId: a['parent_agent_id'] ?? null,
            ttftMs: a['ttft_ms'] ?? 0,
            startNs: s.startTimeUnixNano ? BigInt(s.startTimeUnixNano) : null,
            endNs: s.endTimeUnixNano ? BigInt(s.endTimeUnixNano) : null,
          });
        }
  return out;
}

export function extractTokenDataPoints(payloads) {
  const out = [];
  for (const p of payloads)
    for (const rm of p.resourceMetrics || [])
      for (const sm of rm.scopeMetrics || [])
        for (const m of sm.metrics || []) {
          if (m.name !== 'claude_code.token.usage') continue;
          const dps = (m.sum && m.sum.dataPoints) || (m.gauge && m.gauge.dataPoints) || [];
          for (const dp of dps) {
            const a = attrsToObject(dp.attributes);
            const value = dp.asInt !== undefined ? Number(dp.asInt) : (dp.asDouble ?? 0);
            out.push({ agent: a['agent.name'] ?? null, type: a['type'] ?? null, value });
          }
        }
  return out;
}
