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
