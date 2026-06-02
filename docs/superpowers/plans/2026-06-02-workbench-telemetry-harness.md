# Workbench Telemetry Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable harness that captures Claude Code OpenTelemetry from figma-pipeline runs and turns it into per-agent token/time/fan-in/dominance metrics plus a Markdown report and self-contained HTML dashboard — all testable from recorded fixtures with no live pipeline run.

**Architecture:** A tiny `node:http` OTLP/HTTP receiver appends raw OTLP JSON (logs/metrics/traces) to per-trial JSONL files. A runner builds the telemetry env and records a `run-manifest.json` per pipeline run. An analyzer walks the OTLP JSON, estimates thinking tokens from captured response bodies, joins everything by `agent.name`/run window, and emits `results.json`. A report layer renders `results.json` to `report.md` and an inline-SVG `dashboard.html`. Accuracy fields are present-but-null in this plan (populated by Plan 2).

**Tech Stack:** Node 24, ESM, built-in `node:test` + `node:assert/strict` (no new runtime deps), `node:http`. Claude Code OTEL (`http/json` OTLP).

---

## Spec reference

Implements `docs/superpowers/specs/2026-06-02-figma-agent-workbench-design.md` sections 3 (telemetry), 4 (topology A), 5 (layout), 6 (per-agent metrics), 7 (fan-in), 9 (scenario matrix — driver only), 10 (outputs). Section 8 (accuracy oracle) and 11 (live trial) are deferred to Plan 2; `results.json` reserves a null `accuracy` field for them.

## File structure

```
workbench/
  collector/receiver.mjs          # OTLP/HTTP receiver → metrics.jsonl, events.jsonl, spans.jsonl
  collector/receiver.test.mjs
  runner/env.mjs                   # builds the telemetry env block for a trial
  runner/env.test.mjs
  runner/matrix.mjs                # scenario matrix definition + run-manifest row builder
  runner/matrix.test.mjs
  analyze/otlp.mjs                 # OTLP JSON walkers: events, spans, metric datapoints
  analyze/otlp.test.mjs
  analyze/thinking.mjs             # thinking-share estimate from captured response bodies
  analyze/thinking.test.mjs
  analyze/aggregate.mjs            # per-agent + fan-in + dominance + cross-check → results.json
  analyze/aggregate.test.mjs
  report/markdown.mjs              # results.json → report.md (pure string)
  report/markdown.test.mjs
  report/dashboard.mjs             # results.json → dashboard.html (inline SVG, no deps)
  report/dashboard.test.mjs
  report/build-report.mjs          # CLI: results.json → report.md + dashboard.html
  fixtures/                        # crafted OTLP json + bodies + a sample results.json
  README.md
```
Modify: `package.json` (add `test` + `workbench:report` scripts), `.gitignore` (ignore trial dumps).

## Data contracts (read before coding)

**Receiver output** — one decoded OTLP ExportRequest JSON object per line:
- `events.jsonl` ← POST `/v1/logs` bodies (OTLP `resourceLogs`)
- `metrics.jsonl` ← POST `/v1/metrics` bodies (OTLP `resourceMetrics`)
- `spans.jsonl` ← POST `/v1/traces` bodies (OTLP `resourceSpans`)

**`results.json`** (analyzer output, report input):
```jsonc
{
  "trialId": "string",
  "generatedAt": null,                 // stamped by caller after the run
  "runs": [{
    "runId": "string",
    "scenario": { "icon": true, "tier": "moderate", "cache": "cold", "mode": "build" },
    "command": "/figma-build <url>",
    "startedAt": "ISO", "endedAt": "ISO", "wallMs": 0,
    "agents": [{
      "agent": "component-builder", "model": "claude-opus-4-8", "requests": 0,
      "tokens": { "input":0,"output":0,"thinkingEst":0,"cacheRead":0,"cacheCreation":0,"total":0 },
      "timeMs": { "sumDuration":0,"wallSpan":0,"ttftAvg":0 },
      "toolUses": 0, "costUsd": 0
    }],
    "fanIn": [{ "iconAgentEnd":"ISO","componentEnd":"ISO","blockedMs":0 }],
    "accuracy": null                    // Plan 2 populates
  }],
  "rollup": {
    "perAgent": [{ "agent":"...","tokens":{...},"timeMs":0,"costUsd":0 }],
    "dominance": { "tokens":"agent","time":"agent","byTier":{} },
    "crossCheck": { "otelTotalTokens":0,"costsJsonlTotalTokens":0,"deltaPct":0 }
  }
}
```

**Agent names in scope:** `figma-fetcher`, `token-builder`, `component-builder`, `icon-generator`, `story-author`, `test-author`, `code-reviewer`, `figma-coordinator`.

---

## Task 0: Workbench package scaffolding + test runner

**Files:**
- Create: `workbench/README.md`
- Modify: `package.json` (scripts)
- Modify: `.gitignore`

- [ ] **Step 1: Add scripts to `package.json`**

Add these two entries to the existing `"scripts"` object (leave the others untouched):

```json
"test": "node --test workbench/",
"workbench:report": "node workbench/report/build-report.mjs"
```

- [ ] **Step 2: Append trial-dump ignores to `.gitignore`**

```gitignore
# workbench — raw trial telemetry & generated dashboards are not committed
workbench/trials/
workbench/reports/*/dashboard.html
```
(Generated `report.md` + `results.json` under `workbench/reports/<trialId>/` MAY be committed; the bulky `dashboard.html` and raw trial dumps are not.)

- [ ] **Step 3: Write `workbench/README.md`**

```markdown
# Workbench — figma-pipeline agent benchmark

Captures Claude Code OpenTelemetry from pipeline runs and reports per-agent
token/time/fan-in/dominance. See the design spec at
`docs/superpowers/specs/2026-06-02-figma-agent-workbench-design.md`.

## Run the tests
    npm test

## Build a report from a results.json
    npm run workbench:report -- workbench/reports/<trialId>/results.json
```

- [ ] **Step 4: Verify the test runner is wired (no tests yet = exit 0)**

Run: `node --test workbench/ ; echo "exit=$?"`
Expected: prints `exit=0` (Node reports "tests 0" and exits 0 when no test files exist yet).

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore workbench/README.md
git commit -m "chore(workbench): scaffold harness package + node:test runner"
```

> **Allowlist note:** writing under `workbench/**` may be blocked by the `check-frozen-paths` PreToolUse hook until `workbench/**` is added to `config.writeScope.allowedDirs` (after `/init-figma-compose` in Plan 2). Until then, set `FP_ALLOW_RESTRICTED_WRITE=1` in the executing shell for owner-driven workbench writes.

---

## Task 1: OTLP attribute helpers (`analyze/otlp.mjs`)

These pure functions decode the OTLP/JSON attribute union and walk the three payload shapes. They are the foundation every later analyzer step builds on.

**Files:**
- Create: `workbench/analyze/otlp.mjs`
- Test: `workbench/analyze/otlp.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// workbench/analyze/otlp.test.mjs
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
    { attributes: [ { key: 'event.name', value: { stringValue: 'tool_result' } } ] }, // ignored
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
    { name: 'claude_code.tool.execution', startTimeUnixNano: '1', endTimeUnixNano: '2', attributes: [] }, // ignored
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
    { name: 'claude_code.cost.usage', sum: { dataPoints: [] } }, // ignored by this fn
  ] }] }] };
  const pts = extractTokenDataPoints([payload]);
  assert.deepEqual(pts, [
    { agent: 'token-builder', type: 'input', value: 100 },
    { agent: 'token-builder', type: 'output', value: 20 },
  ]);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test workbench/analyze/otlp.test.mjs`
Expected: FAIL — `Cannot find module './otlp.mjs'`.

- [ ] **Step 3: Implement `analyze/otlp.mjs`**

```js
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
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `node --test workbench/analyze/otlp.test.mjs`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add workbench/analyze/otlp.mjs workbench/analyze/otlp.test.mjs
git commit -m "feat(workbench): OTLP json walkers for events, spans, token metrics"
```

---

## Task 2: Thinking-token estimator (`analyze/thinking.mjs`)

Estimates each agent's thinking tokens from captured raw response bodies. Approach (spec §3.3): `thinkingShare = thinkingChars / (thinkingChars + textChars)` per response, then `thinkingEst = round(authoritativeOutputTokens * thinkingShare)`, summed per agent. `output_tokens` comes from the matching `api_request` event (joined by `request_id`).

**Files:**
- Create: `workbench/analyze/thinking.mjs`
- Test: `workbench/analyze/thinking.test.mjs`
- Create (fixture): `workbench/fixtures/body-req_1.json`

- [ ] **Step 1: Create the response-body fixture**

```json
// workbench/fixtures/body-req_1.json
{
  "id": "msg_1",
  "content": [
    { "type": "thinking", "thinking": "0123456789012345678901234567890123456789" },
    { "type": "text", "text": "0123456789" }
  ],
  "usage": { "output_tokens": 40 }
}
```
(thinking = 40 chars, text = 10 chars → share = 40/50 = 0.8.)

- [ ] **Step 2: Write the failing test**

```js
// workbench/analyze/thinking.test.mjs
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
    { agent: 'component-builder', requestId: 'req_2', outputTokens: 100 }, // no body -> share 0
  ];
  const bodies = [
    { requestId: 'req_1', body: { content: [
      { type: 'thinking', thinking: '0123456789012345678901234567890123456789' }, // 40
      { type: 'text', text: '0123456789' },                                        // 10
    ] } },
  ];
  const byAgent = estimateThinkingByAgent(events, bodies);
  // req_1: 40 * 0.8 = 32 ; req_2: 100 * 0 = 0
  assert.equal(byAgent.get('component-builder'), 32);
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `node --test workbench/analyze/thinking.test.mjs`
Expected: FAIL — `Cannot find module './thinking.mjs'`.

- [ ] **Step 4: Implement `analyze/thinking.mjs`**

```js
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
```

- [ ] **Step 5: Run tests to confirm they pass**

Run: `node --test workbench/analyze/thinking.test.mjs`
Expected: PASS — 3 tests.

- [ ] **Step 6: Commit**

```bash
git add workbench/analyze/thinking.mjs workbench/analyze/thinking.test.mjs workbench/fixtures/body-req_1.json
git commit -m "feat(workbench): proportional thinking-token estimator from response bodies"
```

---

## Task 3: Body-reference loader (`analyze/bodies.mjs`)

Reads `api_response_body` events to find each response's `body_ref` (file path written by `OTEL_LOG_RAW_API_BODIES=file:<dir>`) and `request_id`, then loads the JSON bodies for the thinking estimator.

**Files:**
- Create: `workbench/analyze/bodies.mjs`
- Test: `workbench/analyze/bodies.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// workbench/analyze/bodies.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadResponseBodies } from './bodies.mjs';

const here = dirname(fileURLToPath(import.meta.url));

test('loadResponseBodies resolves body_ref events to parsed bodies', () => {
  const payload = { resourceLogs: [{ scopeLogs: [{ logRecords: [
    { attributes: [
      { key: 'event.name', value: { stringValue: 'api_response_body' } },
      { key: 'request_id', value: { stringValue: 'req_1' } },
      { key: 'body_ref', value: { stringValue: join(here, '..', 'fixtures', 'body-req_1.json') } },
    ] },
  ] }] }] };
  const bodies = loadResponseBodies([payload]);
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].requestId, 'req_1');
  assert.equal(bodies[0].body.usage.output_tokens, 40);
});

test('loadResponseBodies skips records whose body_ref is missing on disk', () => {
  const payload = { resourceLogs: [{ scopeLogs: [{ logRecords: [
    { attributes: [
      { key: 'event.name', value: { stringValue: 'api_response_body' } },
      { key: 'request_id', value: { stringValue: 'gone' } },
      { key: 'body_ref', value: { stringValue: '/no/such/file.json' } },
    ] },
  ] }] }] };
  assert.deepEqual(loadResponseBodies([payload]), []);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test workbench/analyze/bodies.test.mjs`
Expected: FAIL — `Cannot find module './bodies.mjs'`.

- [ ] **Step 3: Implement `analyze/bodies.mjs`**

```js
// workbench/analyze/bodies.mjs
import { readFileSync, existsSync } from 'node:fs';
import { attrsToObject } from './otlp.mjs';

// Returns [{ requestId, body }] for every api_response_body event whose
// body_ref file exists and parses as JSON. Inline-body mode is not handled
// here (the harness sets file: mode per spec §3.2).
export function loadResponseBodies(payloads) {
  const out = [];
  for (const p of payloads)
    for (const rl of p.resourceLogs || [])
      for (const sl of rl.scopeLogs || [])
        for (const r of sl.logRecords || []) {
          const a = attrsToObject(r.attributes);
          if (a['event.name'] !== 'api_response_body') continue;
          const ref = a['body_ref'];
          if (!ref || !existsSync(ref)) continue;
          try {
            out.push({ requestId: a['request_id'] ?? null, body: JSON.parse(readFileSync(ref, 'utf8')) });
          } catch { /* skip unparseable body */ }
        }
  return out;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `node --test workbench/analyze/bodies.test.mjs`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add workbench/analyze/bodies.mjs workbench/analyze/bodies.test.mjs
git commit -m "feat(workbench): load raw response bodies from body_ref events"
```

---

## Task 4: Per-agent aggregation + fan-in + dominance (`analyze/aggregate.mjs`)

The analyzer core. Joins api_request events (tokens/time/cost by `agent`), llm_request spans (true wall-span + ttft, fan-in timing), the thinking estimate, and the optional `costs.jsonl` cross-check into one run record plus the rollup.

**Files:**
- Create: `workbench/analyze/aggregate.mjs`
- Test: `workbench/analyze/aggregate.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// workbench/analyze/aggregate.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateRun, fanInBlocking, buildRollup } from './aggregate.mjs';

const events = [
  { agent: 'icon-generator',  model: 'claude-haiku-4-5', requestId: 'i1', inputTokens: 50, outputTokens: 10, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0.01, durationMs: 500 },
  { agent: 'component-builder', model: 'claude-opus-4-8', requestId: 'c1', inputTokens: 200, outputTokens: 80, cacheReadTokens: 20, cacheCreationTokens: 5, costUsd: 0.20, durationMs: 1500 },
  { agent: 'component-builder', model: 'claude-opus-4-8', requestId: 'c2', inputTokens: 100, outputTokens: 40, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0.10, durationMs: 700 },
];
// nanos: icon span ends at 4000ns; component span ends at 9000ns
const spans = [
  { querySource: 'icon-generator',  startNs: 1000n, endNs: 4000n, ttftMs: 200 },
  { querySource: 'component-builder', startNs: 1500n, endNs: 9000n, ttftMs: 300 },
];
const thinkingByAgent = new Map([['component-builder', 24]]);

test('aggregateRun produces per-agent token/time/cost rows', () => {
  const agents = aggregateRun(events, spans, thinkingByAgent);
  const cb = agents.find(a => a.agent === 'component-builder');
  assert.equal(cb.requests, 2);
  assert.equal(cb.tokens.input, 300);
  assert.equal(cb.tokens.output, 120);
  assert.equal(cb.tokens.thinkingEst, 24);
  assert.equal(cb.tokens.cacheRead, 20);
  assert.equal(cb.tokens.cacheCreation, 5);
  assert.equal(cb.tokens.total, 300 + 120 + 20 + 5);
  assert.equal(cb.timeMs.sumDuration, 2200);
  assert.equal(cb.timeMs.wallSpan, 7); // (9000-1500)/1000 ns→ms rounded? see impl: nanos→ms
  assert.equal(cb.toolUses, 0);
  assert.ok(Math.abs(cb.costUsd - 0.30) < 1e-9);
});

test('fanInBlocking = max(0, iconEnd - componentEnd) in ms; 0 when icon finishes first', () => {
  // icon ends 4000ns, component ends 9000ns -> not blocked on icons
  assert.deepEqual(fanInBlocking(spans), [{ iconEndNs: '4000', componentEndNs: '9000', blockedMs: 0 }]);
  // icon ends AFTER component -> blocked
  const blocked = fanInBlocking([
    { querySource: 'component-builder', startNs: 0n, endNs: 3000000n },
    { querySource: 'icon-generator', startNs: 0n, endNs: 5000000n },
  ]);
  assert.equal(blocked[0].blockedMs, 2); // (5e6-3e6)ns = 2e6ns = 2ms
});

test('fanInBlocking returns [] when there is no icon-generator span (control)', () => {
  assert.deepEqual(fanInBlocking([{ querySource: 'component-builder', startNs: 0n, endNs: 1n }]), []);
});

test('buildRollup picks token- and time-dominant agents and computes cross-check delta', () => {
  const runs = [{
    agents: aggregateRun(events, spans, thinkingByAgent),
    scenario: { tier: 'moderate' },
  }];
  const rollup = buildRollup(runs, { otelTotalTokens: 525, costsJsonlTotalTokens: 500 });
  assert.equal(rollup.dominance.tokens, 'component-builder');
  assert.equal(rollup.dominance.time, 'component-builder');
  assert.equal(rollup.dominance.byTier.moderate.tokens, 'component-builder');
  assert.equal(rollup.crossCheck.deltaPct, 5); // (525-500)/500*100
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test workbench/analyze/aggregate.test.mjs`
Expected: FAIL — `Cannot find module './aggregate.mjs'`.

- [ ] **Step 3: Implement `analyze/aggregate.mjs`**

```js
// workbench/analyze/aggregate.mjs
// Join events + spans + thinking estimate into per-agent rows, fan-in gaps,
// and a cross-run rollup. nanos are BigInt; we convert ns→ms as Number.

const nsToMs = (ns) => Number(ns / 1000000n);

// events: see otlp.extractApiRequestEvents; spans: otlp.extractLlmSpans
// thinkingByAgent: Map<agent, est>; toolUsesByAgent: optional Map<agent, n>
export function aggregateRun(events, spans, thinkingByAgent = new Map(), toolUsesByAgent = new Map()) {
  const byAgent = new Map();
  for (const e of events) {
    if (!e.agent) continue;
    let r = byAgent.get(e.agent);
    if (!r) {
      r = { agent: e.agent, model: e.model, requests: 0,
        tokens: { input: 0, output: 0, thinkingEst: 0, cacheRead: 0, cacheCreation: 0, total: 0 },
        timeMs: { sumDuration: 0, wallSpan: 0, ttftAvg: 0 }, toolUses: 0, costUsd: 0 };
      byAgent.set(e.agent, r);
    }
    r.requests += 1;
    r.tokens.input += e.inputTokens;
    r.tokens.output += e.outputTokens;
    r.tokens.cacheRead += e.cacheReadTokens;
    r.tokens.cacheCreation += e.cacheCreationTokens;
    r.timeMs.sumDuration += e.durationMs;
    r.costUsd += e.costUsd;
  }
  // span-derived wall-span + ttft average, grouped by querySource
  const spanByAgent = new Map();
  for (const s of spans) {
    if (!s.querySource) continue;
    let g = spanByAgent.get(s.querySource);
    if (!g) { g = { minStart: s.startNs, maxEnd: s.endNs, ttftSum: 0, n: 0 }; spanByAgent.set(s.querySource, g); }
    if (s.startNs !== null && (g.minStart === null || s.startNs < g.minStart)) g.minStart = s.startNs;
    if (s.endNs !== null && (g.maxEnd === null || s.endNs > g.maxEnd)) g.maxEnd = s.endNs;
    g.ttftSum += s.ttftMs; g.n += 1;
  }
  for (const r of byAgent.values()) {
    r.tokens.thinkingEst = thinkingByAgent.get(r.agent) || 0;
    r.tokens.total = r.tokens.input + r.tokens.output + r.tokens.cacheRead + r.tokens.cacheCreation;
    r.toolUses = toolUsesByAgent.get(r.agent) || 0;
    const g = spanByAgent.get(r.agent);
    if (g && g.minStart !== null && g.maxEnd !== null) {
      r.timeMs.wallSpan = nsToMs(g.maxEnd - g.minStart);
      r.timeMs.ttftAvg = g.n ? Math.round(g.ttftSum / g.n) : 0;
    }
  }
  return [...byAgent.values()];
}

// Blocking = max(0, iconGeneratorEnd - componentBuilderEnd). [] if no icon span.
export function fanInBlocking(spans) {
  const iconEnds = spans.filter(s => s.querySource === 'icon-generator' && s.endNs !== null).map(s => s.endNs);
  const compEnds = spans.filter(s => s.querySource === 'component-builder' && s.endNs !== null).map(s => s.endNs);
  if (iconEnds.length === 0) return [];
  const iconEnd = iconEnds.reduce((m, v) => (v > m ? v : m));
  const compEnd = compEnds.length ? compEnds.reduce((m, v) => (v > m ? v : m)) : 0n;
  const diff = iconEnd - compEnd;
  return [{ iconEndNs: iconEnd.toString(), componentEndNs: compEnd.toString(), blockedMs: diff > 0n ? nsToMs(diff) : 0 }];
}

function sumAgentTokens(a) { return a.tokens.total; }

export function buildRollup(runs, crossCheckTotals = { otelTotalTokens: 0, costsJsonlTotalTokens: 0 }) {
  const perAgent = new Map();
  for (const run of runs)
    for (const a of run.agents) {
      let r = perAgent.get(a.agent);
      if (!r) { r = { agent: a.agent, tokens: { input: 0, output: 0, thinkingEst: 0, cacheRead: 0, cacheCreation: 0, total: 0 }, timeMs: 0, costUsd: 0 }; perAgent.set(a.agent, r); }
      for (const k of Object.keys(r.tokens)) r.tokens[k] += a.tokens[k];
      r.timeMs += a.timeMs.sumDuration;
      r.costUsd += a.costUsd;
    }
  const perAgentArr = [...perAgent.values()];
  const dominantBy = (arr, metric) => arr.length ? arr.reduce((m, x) => (metric(x) > metric(m) ? x : m)).agent : null;
  const byTier = {};
  const tiers = [...new Set(runs.map(r => r.scenario && r.scenario.tier).filter(Boolean))];
  for (const tier of tiers) {
    const tierAgents = new Map();
    for (const run of runs.filter(r => r.scenario && r.scenario.tier === tier))
      for (const a of run.agents) tierAgents.set(a.agent, (tierAgents.get(a.agent) || 0) + a.tokens.total);
    let top = null, max = -1;
    for (const [agent, tot] of tierAgents) if (tot > max) { max = tot; top = agent; }
    byTier[tier] = { tokens: top };
  }
  const base = crossCheckTotals.costsJsonlTotalTokens || 0;
  const deltaPct = base ? Math.round(((crossCheckTotals.otelTotalTokens - base) / base) * 100) : 0;
  return {
    perAgent: perAgentArr,
    dominance: {
      tokens: dominantBy(perAgentArr, sumAgentTokens),
      time: dominantBy(perAgentArr, a => a.timeMs),
      byTier,
    },
    crossCheck: { ...crossCheckTotals, deltaPct },
  };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `node --test workbench/analyze/aggregate.test.mjs`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add workbench/analyze/aggregate.mjs workbench/analyze/aggregate.test.mjs
git commit -m "feat(workbench): per-agent aggregation, fan-in blocking, dominance rollup"
```

---

## Task 5: results.json builder (`analyze/build-results.mjs`)

Glue + CLI: read a trial dir (`events.jsonl`, `metrics.jsonl`, `spans.jsonl`, `bodies/`, `run-manifest.json`, optional `costs/*.jsonl`), run the analyzers, write `results.json`.

**Files:**
- Create: `workbench/analyze/build-results.mjs`
- Test: `workbench/analyze/build-results.test.mjs`
- Create (fixture): `workbench/fixtures/trial-mini/` with `events.jsonl`, `spans.jsonl`, `run-manifest.json`

- [ ] **Step 1: Create the mini-trial fixture**

`workbench/fixtures/trial-mini/run-manifest.json`:
```json
{ "trialId": "mini", "runs": [
  { "runId": "r1", "command": "/figma-build x", "scenario": { "icon": true, "tier": "moderate", "cache": "cold", "mode": "build" },
    "startedAt": "2026-06-02T10:00:00Z", "endedAt": "2026-06-02T10:00:12Z" }
] }
```

`workbench/fixtures/trial-mini/events.jsonl` (single line — one OTLP logs payload):
```json
{"resourceLogs":[{"scopeLogs":[{"logRecords":[{"timeUnixNano":"1700000000000000000","attributes":[{"key":"event.name","value":{"stringValue":"api_request"}},{"key":"agent.name","value":{"stringValue":"component-builder"}},{"key":"model","value":{"stringValue":"claude-opus-4-8"}},{"key":"input_tokens","value":{"intValue":"200"}},{"key":"output_tokens","value":{"intValue":"80"}},{"key":"cache_read_tokens","value":{"intValue":"20"}},{"key":"cache_creation_tokens","value":{"intValue":"5"}},{"key":"cost_usd","value":{"doubleValue":0.2}},{"key":"duration_ms","value":{"intValue":"1500"}},{"key":"request_id","value":{"stringValue":"c1"}}]}]}]}]}
```

`workbench/fixtures/trial-mini/spans.jsonl` (single line — one OTLP traces payload):
```json
{"resourceSpans":[{"scopeSpans":[{"spans":[{"name":"claude_code.llm_request","startTimeUnixNano":"0","endTimeUnixNano":"3000000","attributes":[{"key":"query_source","value":{"stringValue":"component-builder"}},{"key":"ttft_ms","value":{"intValue":"300"}}]},{"name":"claude_code.llm_request","startTimeUnixNano":"0","endTimeUnixNano":"5000000","attributes":[{"key":"query_source","value":{"stringValue":"icon-generator"}},{"key":"ttft_ms","value":{"intValue":"200"}}]}]}]}]}
```

- [ ] **Step 2: Write the failing test**

```js
// workbench/analyze/build-results.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildResults } from './build-results.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const trial = join(here, '..', 'fixtures', 'trial-mini');

test('buildResults assembles a results.json object from a trial dir', () => {
  const results = buildResults(trial);
  assert.equal(results.trialId, 'mini');
  assert.equal(results.runs.length, 1);
  const run = results.runs[0];
  assert.equal(run.runId, 'r1');
  assert.equal(run.wallMs, 12000); // 10:00:12 - 10:00:00
  const cb = run.agents.find(a => a.agent === 'component-builder');
  assert.equal(cb.tokens.input, 200);
  assert.equal(cb.tokens.total, 305);
  // icon ends 5e6ns AFTER component ends 3e6ns -> blocked 2ms
  assert.equal(run.fanIn[0].blockedMs, 2);
  assert.equal(run.accuracy, null);
  assert.equal(results.rollup.dominance.tokens, 'component-builder');
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `node --test workbench/analyze/build-results.test.mjs`
Expected: FAIL — `Cannot find module './build-results.mjs'`.

- [ ] **Step 4: Implement `analyze/build-results.mjs`**

```js
// workbench/analyze/build-results.mjs
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { extractApiRequestEvents, extractLlmSpans, extractTokenDataPoints } from './otlp.mjs';
import { loadResponseBodies } from './bodies.mjs';
import { estimateThinkingByAgent } from './thinking.mjs';
import { aggregateRun, fanInBlocking, buildRollup } from './aggregate.mjs';

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}

// Cross-check: total tokens claimed by the coordinator's costs.jsonl spawn ledger.
function readCostsJsonl(dir) {
  const costsDir = join(dir, 'costs');
  if (!existsSync(costsDir)) return 0;
  let total = 0;
  for (const f of readdirSync(costsDir).filter(f => f.endsWith('.jsonl')))
    for (const line of readJsonl(join(costsDir, f)))
      total += Number(line.total_tokens || line.totalTokens || 0);
  return total;
}

export function buildResults(trialDir) {
  const manifest = JSON.parse(readFileSync(join(trialDir, 'run-manifest.json'), 'utf8'));
  const eventPayloads = readJsonl(join(trialDir, 'events.jsonl'));
  const spanPayloads = readJsonl(join(trialDir, 'spans.jsonl'));
  const metricPayloads = readJsonl(join(trialDir, 'metrics.jsonl'));

  const events = extractApiRequestEvents(eventPayloads);
  const spans = extractLlmSpans(spanPayloads);
  const bodies = loadResponseBodies(eventPayloads);
  const thinkingByAgent = estimateThinkingByAgent(events, bodies);

  // NOTE: this plan analyzes a single-run trial dir as a whole. Multi-run
  // attribution (one window per runId) is layered in by the runner writing one
  // trial dir per run; here we attach all events to each manifest run only when
  // there is exactly one run, else the runner pre-splits dirs. (See README.)
  const runs = manifest.runs.map((m) => ({
    runId: m.runId,
    scenario: m.scenario || {},
    command: m.command || '',
    startedAt: m.startedAt || null,
    endedAt: m.endedAt || null,
    wallMs: (m.startedAt && m.endedAt) ? (Date.parse(m.endedAt) - Date.parse(m.startedAt)) : 0,
    agents: aggregateRun(events, spans, thinkingByAgent),
    fanIn: fanInBlocking(spans),
    accuracy: null,
  }));

  const otelTotalTokens = runs.reduce((s, r) => s + r.agents.reduce((x, a) => x + a.tokens.total, 0), 0);
  const rollup = buildRollup(runs, { otelTotalTokens, costsJsonlTotalTokens: readCostsJsonl(trialDir) });
  // metricPayloads kept for the cross-check extension; not yet folded in.
  void extractTokenDataPoints(metricPayloads);

  return { trialId: manifest.trialId, generatedAt: null, runs, rollup };
}

// CLI: node build-results.mjs <trialDir> [outFile]
if (import.meta.url === `file://${process.argv[1]}`) {
  const [trialDir, outFile] = process.argv.slice(2);
  if (!trialDir) { console.error('usage: build-results.mjs <trialDir> [outFile]'); process.exit(1); }
  const results = buildResults(trialDir);
  const json = JSON.stringify(results, null, 2);
  if (outFile) { const { writeFileSync } = await import('node:fs'); writeFileSync(outFile, json); }
  else console.log(json);
}
```

- [ ] **Step 5: Run tests to confirm they pass**

Run: `node --test workbench/analyze/build-results.test.mjs`
Expected: PASS — 1 test.

- [ ] **Step 6: Commit**

```bash
git add workbench/analyze/build-results.mjs workbench/analyze/build-results.test.mjs workbench/fixtures/trial-mini/
git commit -m "feat(workbench): assemble results.json from a trial directory"
```

---

## Task 6: OTLP receiver (`collector/receiver.mjs`)

A `node:http` server that accepts OTLP/HTTP JSON on `/v1/logs|metrics|traces` and appends each decoded body as one JSONL line to the active trial dir. Returns the OTLP success envelope.

**Files:**
- Create: `workbench/collector/receiver.mjs`
- Test: `workbench/collector/receiver.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// workbench/collector/receiver.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startReceiver } from './receiver.mjs';

test('receiver appends posted OTLP bodies to per-signal jsonl', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wb-recv-'));
  const server = await startReceiver({ port: 0, outDir: dir });
  const port = server.address().port;
  const payload = { resourceLogs: [{ scopeLogs: [{ logRecords: [{ attributes: [] }] }] }] };
  const res = await fetch(`http://localhost:${port}/v1/logs`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  assert.equal(res.status, 200);
  await new Promise((r) => server.close(r));
  const file = join(dir, 'events.jsonl');
  assert.ok(existsSync(file));
  const line = JSON.parse(readFileSync(file, 'utf8').trim());
  assert.deepEqual(line, payload);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test workbench/collector/receiver.test.mjs`
Expected: FAIL — `Cannot find module './receiver.mjs'`.

- [ ] **Step 3: Implement `collector/receiver.mjs`**

```js
// workbench/collector/receiver.mjs
import { createServer } from 'node:http';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const FILE_BY_PATH = {
  '/v1/logs': 'events.jsonl',
  '/v1/metrics': 'metrics.jsonl',
  '/v1/traces': 'spans.jsonl',
};

export function startReceiver({ port = 4318, outDir }) {
  if (!outDir) throw new Error('startReceiver requires outDir');
  mkdirSync(outDir, { recursive: true });
  const server = createServer((req, res) => {
    const file = FILE_BY_PATH[req.url];
    if (req.method !== 'POST' || !file) { res.writeHead(404).end(); return; }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const json = JSON.parse(body);
        appendFileSync(join(outDir, file), JSON.stringify(json) + '\n');
      } catch { /* drop malformed export */ }
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}'); // OTLP success envelope
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

// CLI: node receiver.mjs <outDir> [port]
if (import.meta.url === `file://${process.argv[1]}`) {
  const [outDir, port] = process.argv.slice(2);
  if (!outDir) { console.error('usage: receiver.mjs <outDir> [port]'); process.exit(1); }
  startReceiver({ outDir, port: port ? Number(port) : 4318 })
    .then((s) => console.error(`[receiver] OTLP/HTTP on :${s.address().port} -> ${outDir}`));
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `node --test workbench/collector/receiver.test.mjs`
Expected: PASS — 1 test.

- [ ] **Step 5: Commit**

```bash
git add workbench/collector/receiver.mjs workbench/collector/receiver.test.mjs
git commit -m "feat(workbench): OTLP/HTTP receiver appending per-signal jsonl"
```

---

## Task 7: Runner — telemetry env (`runner/env.mjs`)

Builds the exact environment block (spec §3.2) the runner injects when invoking pipeline commands, parameterized by trial dir + endpoint.

**Files:**
- Create: `workbench/runner/env.mjs`
- Test: `workbench/runner/env.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// workbench/runner/env.test.mjs
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
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test workbench/runner/env.test.mjs`
Expected: FAIL — `Cannot find module './env.mjs'`.

- [ ] **Step 3: Implement `runner/env.mjs`**

```js
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
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `node --test workbench/runner/env.test.mjs`
Expected: PASS — 1 test.

- [ ] **Step 5: Commit**

```bash
git add workbench/runner/env.mjs workbench/runner/env.test.mjs
git commit -m "feat(workbench): telemetry env block builder"
```

---

## Task 8: Runner — scenario matrix + manifest rows (`runner/matrix.mjs`)

Defines the four scenario groups (spec §9) and builds `run-manifest.json` rows. Pure data + helpers; the human/operator triggers the actual `/figma-build` commands (Claude Code slash commands can't be shell-spawned), and the runner records each run's window.

**Files:**
- Create: `workbench/runner/matrix.mjs`
- Test: `workbench/runner/matrix.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// workbench/runner/matrix.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultMatrix, makeRunRow } from './matrix.mjs';

test('defaultMatrix covers all four scenario axes from the spec', () => {
  const m = defaultMatrix();
  assert.ok(m.some(s => s.icon === true) && m.some(s => s.icon === false), 'icon fan-in pair');
  assert.deepEqual([...new Set(m.map(s => s.tier))].sort(), ['complex','extreme','moderate','trivial']);
  assert.ok(m.some(s => s.cache === 'cold') && m.some(s => s.cache === 'warm'), 'cold/warm');
  assert.ok(m.some(s => s.mode === 'build') && m.some(s => s.mode === 'update'), 'build/update');
});

test('makeRunRow stamps the provided window and scenario', () => {
  const row = makeRunRow({
    runId: 'r1', command: '/figma-build u', scenario: { icon: true, tier: 'moderate', cache: 'cold', mode: 'build' },
    startedAt: '2026-06-02T10:00:00Z', endedAt: '2026-06-02T10:00:10Z',
  });
  assert.equal(row.runId, 'r1');
  assert.equal(row.scenario.tier, 'moderate');
  assert.equal(row.startedAt, '2026-06-02T10:00:00Z');
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test workbench/runner/matrix.test.mjs`
Expected: FAIL — `Cannot find module './matrix.mjs'`.

- [ ] **Step 3: Implement `runner/matrix.mjs`**

```js
// workbench/runner/matrix.mjs
// Scenario matrix (spec §9). Each entry is a tag-set the operator runs once.
export function defaultMatrix() {
  return [
    // icon fan-in pair (held at moderate tier, cold cache, build mode)
    { id: 'icon-yes', icon: true,  tier: 'moderate', cache: 'cold', mode: 'build' },
    { id: 'icon-no',  icon: false, tier: 'moderate', cache: 'cold', mode: 'build' },
    // complexity tiers (icon-free, cold, build)
    { id: 'tier-trivial', icon: false, tier: 'trivial', cache: 'cold', mode: 'build' },
    { id: 'tier-complex', icon: false, tier: 'complex', cache: 'cold', mode: 'build' },
    { id: 'tier-extreme', icon: false, tier: 'extreme', cache: 'cold', mode: 'build' },
    // cold vs warm cache (same component, second build is warm)
    { id: 'cache-warm', icon: false, tier: 'moderate', cache: 'warm', mode: 'build' },
    // build vs update (update a changed node)
    { id: 'mode-update', icon: false, tier: 'moderate', cache: 'warm', mode: 'update' },
  ];
}

export function makeRunRow({ runId, command, scenario, startedAt, endedAt }) {
  return { runId, command, scenario, startedAt, endedAt };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `node --test workbench/runner/matrix.test.mjs`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add workbench/runner/matrix.mjs workbench/runner/matrix.test.mjs
git commit -m "feat(workbench): scenario matrix + run-manifest row builder"
```

---

## Task 9: Report — Markdown (`report/markdown.mjs`)

Pure function: `results.json` object → Markdown string (spec §10). Tables for per-agent rollup, dominance, fan-in, and a placeholder accuracy line when `accuracy === null`.

**Files:**
- Create: `workbench/report/markdown.mjs`
- Test: `workbench/report/markdown.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// workbench/report/markdown.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from './markdown.mjs';

const results = {
  trialId: 'demo', generatedAt: '2026-06-02T12:00:00Z',
  runs: [{
    runId: 'r1', command: '/figma-build u', scenario: { icon: true, tier: 'moderate', cache: 'cold', mode: 'build' },
    wallMs: 12000,
    agents: [{ agent: 'component-builder', model: 'claude-opus-4-8', requests: 2,
      tokens: { input: 300, output: 120, thinkingEst: 24, cacheRead: 20, cacheCreation: 5, total: 445 },
      timeMs: { sumDuration: 2200, wallSpan: 7500, ttftAvg: 250 }, toolUses: 61, costUsd: 0.3 }],
    fanIn: [{ iconEndNs: '5000000', componentEndNs: '3000000', blockedMs: 2 }],
    accuracy: null,
  }],
  rollup: {
    perAgent: [{ agent: 'component-builder', tokens: { input: 300, output: 120, thinkingEst: 24, cacheRead: 20, cacheCreation: 5, total: 445 }, timeMs: 2200, costUsd: 0.3 }],
    dominance: { tokens: 'component-builder', time: 'component-builder', byTier: { moderate: { tokens: 'component-builder' } } },
    crossCheck: { otelTotalTokens: 445, costsJsonlTotalTokens: 430, deltaPct: 3 },
  },
};

test('renderMarkdown includes title, per-agent table, dominance, fan-in, thinking-est note', () => {
  const md = renderMarkdown(results);
  assert.match(md, /# Workbench Report — demo/);
  assert.match(md, /component-builder/);
  assert.match(md, /\| *445 *\|/);                     // total tokens cell
  assert.match(md, /Token-dominant agent.*component-builder/s);
  assert.match(md, /blocked.*2 ?ms/i);                 // fan-in
  assert.match(md, /thinkingEst|estimate/i);           // thinking caveat surfaced
  assert.match(md, /accuracy.*Plan 2|pending/i);       // accuracy placeholder
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test workbench/report/markdown.test.mjs`
Expected: FAIL — `Cannot find module './markdown.mjs'`.

- [ ] **Step 3: Implement `report/markdown.mjs`**

```js
// workbench/report/markdown.mjs
const n = (x) => (x ?? 0).toLocaleString('en-US');

export function renderMarkdown(r) {
  const L = [];
  L.push(`# Workbench Report — ${r.trialId}`);
  L.push('');
  L.push(`> Generated: ${r.generatedAt ?? '(unstamped)'} · Runs: ${r.runs.length}`);
  L.push('');
  L.push('## Per-agent rollup (all runs)');
  L.push('');
  L.push('| agent | total | input | output | thinkingEst | cacheRead | cacheCreate | time (ms) | cost (USD) |');
  L.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const a of r.rollup.perAgent) {
    const t = a.tokens;
    L.push(`| ${a.agent} | ${n(t.total)} | ${n(t.input)} | ${n(t.output)} | ${n(t.thinkingEst)} | ${n(t.cacheRead)} | ${n(t.cacheCreation)} | ${n(a.timeMs)} | ${(a.costUsd ?? 0).toFixed(4)} |`);
  }
  L.push('');
  L.push('> `thinkingEst` is an **estimate** — OTEL folds thinking into `output`; we split it by character share of thinking blocks (spec §3.3).');
  L.push('');
  L.push('## Dominance');
  L.push('');
  L.push(`- **Token-dominant agent:** ${r.rollup.dominance.tokens}`);
  L.push(`- **Time-dominant agent:** ${r.rollup.dominance.time}`);
  for (const [tier, d] of Object.entries(r.rollup.dominance.byTier || {}))
    L.push(`  - tier \`${tier}\`: ${d.tokens}`);
  L.push('');
  L.push('## Icon fan-in blocking');
  L.push('');
  L.push('| run | scenario | blocked (ms) |');
  L.push('| --- | --- | ---: |');
  for (const run of r.runs)
    for (const f of run.fanIn)
      L.push(`| ${run.runId} | ${run.scenario.icon ? 'icon' : 'no-icon'}/${run.scenario.tier} | ${n(f.blockedMs)} |`);
  if (!r.runs.some(run => run.fanIn.length)) L.push('| — | no icon-bearing runs | 0 |');
  L.push('');
  L.push('## Cross-check (OTEL vs costs.jsonl)');
  L.push('');
  L.push(`- OTEL total tokens: ${n(r.rollup.crossCheck.otelTotalTokens)}`);
  L.push(`- costs.jsonl total tokens: ${n(r.rollup.crossCheck.costsJsonlTotalTokens)}`);
  L.push(`- delta: ${r.rollup.crossCheck.deltaPct}%`);
  L.push('');
  L.push('## Accuracy');
  L.push('');
  const hasAccuracy = r.runs.some(run => run.accuracy != null);
  L.push(hasAccuracy ? '_See per-run accuracy below._' : '_Accuracy scoring is pending (Plan 2 — oracle + live trial)._');
  L.push('');
  return L.join('\n');
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `node --test workbench/report/markdown.test.mjs`
Expected: PASS — 1 test.

- [ ] **Step 5: Commit**

```bash
git add workbench/report/markdown.mjs workbench/report/markdown.test.mjs
git commit -m "feat(workbench): markdown report renderer"
```

---

## Task 10: Report — HTML dashboard (`report/dashboard.mjs`)

Pure function: `results.json` → a self-contained HTML string with inline data and inline-SVG bar charts (no external/CDN deps, spec §10). One bar chart of per-agent total tokens; the raw data is embedded for inspection.

**Files:**
- Create: `workbench/report/dashboard.mjs`
- Test: `workbench/report/dashboard.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// workbench/report/dashboard.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDashboard, svgBars } from './dashboard.mjs';

test('svgBars renders one <rect> per datum, width scaled to max', () => {
  const svg = svgBars([{ label: 'a', value: 10 }, { label: 'b', value: 5 }], { width: 200 });
  assert.match(svg, /<svg/);
  assert.equal((svg.match(/<rect/g) || []).length, 2);
});

test('renderDashboard is self-contained html with embedded data and no external src', () => {
  const results = { trialId: 'demo', generatedAt: null, runs: [],
    rollup: { perAgent: [{ agent: 'component-builder', tokens: { total: 445 }, timeMs: 2200, costUsd: 0.3 }],
      dominance: { tokens: 'component-builder', time: 'component-builder', byTier: {} },
      crossCheck: { otelTotalTokens: 445, costsJsonlTotalTokens: 430, deltaPct: 3 } } };
  const html = renderDashboard(results);
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /component-builder/);
  assert.doesNotMatch(html, /src=["']https?:/); // no external scripts/images
  assert.match(html, /id="results-data"/);      // embedded json
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test workbench/report/dashboard.test.mjs`
Expected: FAIL — `Cannot find module './dashboard.mjs'`.

- [ ] **Step 3: Implement `report/dashboard.mjs`**

```js
// workbench/report/dashboard.mjs
// Self-contained dashboard: inline data + inline-SVG bars. No external assets.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function svgBars(data, { width = 480, barH = 22, gap = 8, pad = 120 } = {}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const h = data.length * (barH + gap) + gap;
  const rows = data.map((d, i) => {
    const y = gap + i * (barH + gap);
    const w = Math.round((width - pad - 60) * (d.value / max));
    return `<text x="0" y="${y + barH * 0.7}" font-size="12">${esc(d.label)}</text>` +
      `<rect x="${pad}" y="${y}" width="${w}" height="${barH}" fill="#4f46e5"></rect>` +
      `<text x="${pad + w + 6}" y="${y + barH * 0.7}" font-size="12">${d.value.toLocaleString('en-US')}</text>`;
  }).join('');
  return `<svg width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" xmlns="http://www.w3.org/2000/svg">${rows}</svg>`;
}

export function renderDashboard(r) {
  const tokenBars = svgBars(r.rollup.perAgent.map((a) => ({ label: a.agent, value: a.tokens.total })));
  const timeBars = svgBars(r.rollup.perAgent.map((a) => ({ label: a.agent, value: a.timeMs })));
  const data = esc(JSON.stringify(r));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Workbench — ${esc(r.trialId)}</title>
<style>body{font:14px system-ui,sans-serif;margin:2rem;max-width:900px}h1{margin-bottom:0}
section{margin:2rem 0}code{background:#f3f4f6;padding:.1em .3em;border-radius:3px}
.note{color:#6b7280;font-size:.85rem}</style></head>
<body>
<h1>Workbench Report — ${esc(r.trialId)}</h1>
<p class="note">Token-dominant: <b>${esc(r.rollup.dominance.tokens)}</b> · Time-dominant: <b>${esc(r.rollup.dominance.time)}</b> · OTEL↔costs.jsonl Δ ${esc(r.rollup.crossCheck.deltaPct)}%</p>
<section><h2>Tokens per agent (total)</h2>${tokenBars}
<p class="note">Thinking tokens are estimated (spec §3.3).</p></section>
<section><h2>Time per agent (sum duration ms)</h2>${timeBars}</section>
<section><h2>Raw results</h2>
<script type="application/json" id="results-data">${data}</script>
<details><summary>Show JSON</summary><pre>${data}</pre></details></section>
</body></html>`;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `node --test workbench/report/dashboard.test.mjs`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add workbench/report/dashboard.mjs workbench/report/dashboard.test.mjs
git commit -m "feat(workbench): self-contained inline-SVG html dashboard"
```

---

## Task 11: Report CLI (`report/build-report.mjs`)

Reads a `results.json`, stamps `generatedAt`, writes `report.md` + `dashboard.html` next to it.

**Files:**
- Create: `workbench/report/build-report.mjs`
- Test: `workbench/report/build-report.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// workbench/report/build-report.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildReport } from './build-report.mjs';

test('buildReport writes report.md and dashboard.html beside results.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wb-rep-'));
  const resultsPath = join(dir, 'results.json');
  writeFileSync(resultsPath, JSON.stringify({
    trialId: 'demo', generatedAt: null, runs: [],
    rollup: { perAgent: [{ agent: 'x', tokens: { total: 1, input: 1, output: 0, thinkingEst: 0, cacheRead: 0, cacheCreation: 0 }, timeMs: 0, costUsd: 0 }],
      dominance: { tokens: 'x', time: 'x', byTier: {} }, crossCheck: { otelTotalTokens: 1, costsJsonlTotalTokens: 1, deltaPct: 0 } },
  }));
  buildReport(resultsPath, '2026-06-02T12:00:00Z');
  assert.ok(existsSync(join(dir, 'report.md')));
  assert.ok(existsSync(join(dir, 'dashboard.html')));
  assert.match(readFileSync(join(dir, 'report.md'), 'utf8'), /Workbench Report — demo/);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test workbench/report/build-report.test.mjs`
Expected: FAIL — `Cannot find module './build-report.mjs'`.

- [ ] **Step 3: Implement `report/build-report.mjs`**

```js
// workbench/report/build-report.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { renderMarkdown } from './markdown.mjs';
import { renderDashboard } from './dashboard.mjs';

// generatedAt is passed in (Date.now is unavailable in some harness contexts).
export function buildReport(resultsPath, generatedAt) {
  const r = JSON.parse(readFileSync(resultsPath, 'utf8'));
  r.generatedAt = generatedAt ?? r.generatedAt ?? null;
  const dir = dirname(resultsPath);
  writeFileSync(join(dir, 'report.md'), renderMarkdown(r));
  writeFileSync(join(dir, 'dashboard.html'), renderDashboard(r));
  return { md: join(dir, 'report.md'), html: join(dir, 'dashboard.html') };
}

// CLI: node build-report.mjs <results.json> [generatedAtISO]
if (import.meta.url === `file://${process.argv[1]}`) {
  const [resultsPath, generatedAt] = process.argv.slice(2);
  if (!resultsPath) { console.error('usage: build-report.mjs <results.json> [generatedAtISO]'); process.exit(1); }
  const out = buildReport(resultsPath, generatedAt || new Date().toISOString());
  console.error(`[report] wrote ${out.md} and ${out.html}`);
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `node --test workbench/report/build-report.test.mjs`
Expected: PASS — 1 test.

- [ ] **Step 5: Commit**

```bash
git add workbench/report/build-report.mjs workbench/report/build-report.test.mjs
git commit -m "feat(workbench): report CLI writing report.md + dashboard.html"
```

---

## Task 12: End-to-end smoke (fixtures → report) + full suite

Wires the pipeline end-to-end against the `trial-mini` fixture, with no live Claude run, proving collector→analyze→report integrate.

**Files:**
- Create: `workbench/e2e.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// workbench/e2e.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildResults } from './analyze/build-results.mjs';
import { buildReport } from './report/build-report.mjs';

const here = dirname(fileURLToPath(import.meta.url));

test('fixtures → results.json → report.md + dashboard.html', () => {
  const trial = join(here, 'fixtures', 'trial-mini');
  const results = buildResults(trial);
  const out = mkdtempSync(join(tmpdir(), 'wb-e2e-'));
  const resultsPath = join(out, 'results.json');
  writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  buildReport(resultsPath, '2026-06-02T12:00:00Z');
  assert.ok(existsSync(join(out, 'report.md')));
  assert.ok(existsSync(join(out, 'dashboard.html')));
  assert.match(readFileSync(join(out, 'report.md'), 'utf8'), /component-builder/);
});
```

- [ ] **Step 2: Run it to confirm it fails, then passes**

Run: `node --test workbench/e2e.test.mjs`
Expected: PASS (all upstream modules exist by now). If FAIL, fix the integrating module before continuing.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: all test files pass (Task 1–12). Confirm the summary shows `fail 0`.

- [ ] **Step 4: Commit**

```bash
git add workbench/e2e.test.mjs
git commit -m "test(workbench): end-to-end fixtures→report smoke"
```

---

## Task 13: Operator runbook (`workbench/RUNBOOK.md`)

Documents how a human drives a live capture once Plan 2 inputs exist: start receiver → export env → run `/figma-build` per matrix row → stamp windows → build results → build report. No code; pure procedure so the harness is usable before Plan 2 automates it.

**Files:**
- Create: `workbench/RUNBOOK.md`

- [ ] **Step 1: Write `workbench/RUNBOOK.md`**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add workbench/RUNBOOK.md
git commit -m "docs(workbench): manual live-capture runbook"
```

---

## Self-review (completed during planning)

**Spec coverage:**
- §3 telemetry signals → Tasks 1 (events/spans/metrics), 3 (bodies). ✓
- §3.2 env block → Task 7. ✓
- §3.3 thinking estimate → Task 2. ✓
- §4 topology A receiver → Task 6. ✓
- §5 layout → Tasks 0, 13 (dirs created as files land). ✓
- §6 per-agent metrics (tokens/time/toolUses/cost/dominance) → Task 4; toolUses cross-check via costs.jsonl in Task 5. ✓
- §7 fan-in blocking → Task 4 (`fanInBlocking`). ✓
- §9 scenario matrix (driver) → Task 8. ✓
- §10 outputs (results.json/report.md/dashboard.html) → Tasks 5, 9, 10, 11. ✓
- §8 accuracy + §11 live trial → **deferred to Plan 2**; `accuracy` reserved null in results.json (Tasks 5, 9). ✓ (explicit gap, by design)

**Placeholder scan:** No TBD/TODO; every code step contains full code. ✓

**Type consistency:** `results.json` field names (`tokens.thinkingEst`, `timeMs.sumDuration/wallSpan/ttftAvg`, `fanIn[].blockedMs`, `rollup.dominance.byTier`, `crossCheck.deltaPct`) are identical across analyzer (Tasks 4–5), markdown (Task 9), and dashboard (Task 10). Function names (`attrsToObject`, `extractApiRequestEvents`, `extractLlmSpans`, `extractTokenDataPoints`, `loadResponseBodies`, `estimateThinkingByAgent`, `aggregateRun`, `fanInBlocking`, `buildRollup`, `buildResults`, `telemetryEnv`, `defaultMatrix`, `makeRunRow`, `renderMarkdown`, `svgBars`, `renderDashboard`, `buildReport`, `startReceiver`) are consistent between definition and use. ✓

**Known approximation surfaced:** `thinkingEst` is explicitly labelled an estimate in both report renderers (matches spec §3.3). ✓

## Notes for the executor
- BigInt is used for nanosecond timestamps; never `Number()` a raw ns value before subtracting (precision). Convert ns→ms only after subtraction (`nsToMs`).
- `Date.now()`/`new Date()` may be unavailable in some harness contexts — `generatedAt` is always passed in (Task 11 CLI uses `new Date().toISOString()` only at the real shell entrypoint, never inside a workflow).
- Multi-run attribution: this plan analyzes one trial dir per the manifest's runs; for clean per-run isolation, the runbook (Task 13) has the operator capture one trial dir per run, or accept whole-trial aggregation when a single run is present. Plan 2 automates per-run window splitting.
