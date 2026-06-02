// workbench/analyze/thinking.mjs
// Estimate thinking tokens (spec §3.3). thinking is folded into output_tokens
// by the API; we split it proportionally by character share of thinking blocks.

export function responseThinkingShare(body) {
  let thinkingChars = 0, textChars = 0;
  for (const block of (body && body.content) || []) {
    if (block.type === 'thinking') thinkingChars += (block.thinking || '').length;
    else if (block.type === 'text') textChars += (block.text || '').length;
  }
  const denom = thinkingChars + textChars;
  return denom === 0 ? 0 : thinkingChars / denom;
}

// events: [{ agent, requestId, outputTokens }]
// bodies: [{ requestId, body }]  (body = parsed Anthropic response JSON)
// returns Map<agent, thinkingEstTokens>
export function estimateThinkingByAgent(events, bodies) {
  const shareByReq = new Map();
  for (const b of bodies) shareByReq.set(b.requestId, responseThinkingShare(b.body));
  const byAgent = new Map();
  for (const e of events) {
    const share = shareByReq.get(e.requestId) ?? 0;
    const est = Math.round((e.outputTokens || 0) * share);
    byAgent.set(e.agent, (byAgent.get(e.agent) || 0) + est);
  }
  return byAgent;
}
