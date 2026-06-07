import { test } from 'node:test';
import assert from 'node:assert/strict';
import { responseThinkingShare, estimateThinkingByAgent } from './thinking.mjs';

test('responseThinkingShare = thinkingChars / (thinking+text)', () => {
  const body = { content: [
    { type: 'thinking', thinking: 'aaaa' },
    { type: 'text', text: 'bb' },
  ] };
  assert.equal(responseThinkingShare(body), 4 / 6);
});

test('responseThinkingShare is 0 when no thinking blocks', () => {
  assert.equal(responseThinkingShare({ content: [{ type: 'text', text: 'hi' }] }), 0);
  assert.equal(responseThinkingShare({ content: [] }), 0);
});

test('estimateThinkingByAgent multiplies output_tokens by share, sums per agent', () => {
  const events = [
    { agent: 'component-builder', requestId: 'req_1', outputTokens: 40 },
    { agent: 'component-builder', requestId: 'req_2', outputTokens: 100 },
  ];
  const bodies = [
    { requestId: 'req_1', body: { content: [
      { type: 'thinking', thinking: '0123456789012345678901234567890123456789' },
      { type: 'text', text: '0123456789' },
    ] } },
  ];
  const byAgent = estimateThinkingByAgent(events, bodies);
  assert.equal(byAgent.get('component-builder'), 32);
});
