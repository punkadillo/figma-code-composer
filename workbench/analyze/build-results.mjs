// workbench/analyze/build-results.mjs
import { readFileSync, existsSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { extractApiRequestEvents, extractLlmSpans } from './otlp.mjs';
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
      total += Number(line.total_tokens ?? line.totalTokens ?? 0);
  return total;
}

function readReachability(dir) {
  let reachabilityStatus = null;
  const fm = join(dir, 'figma-manifest.json');
  if (existsSync(fm)) {
    try { reachabilityStatus = JSON.parse(readFileSync(fm, 'utf8')).reachabilityStatus ?? null; }
    catch { reachabilityStatus = null; }
  }
  const MARKERS = ['contract.json', 'mcp-probe.sh', 'mcp-call.sh'];
  const degradedMarkers = [];
  for (const base of [dir, join(dir, 'scratch')]) {
    for (const m of MARKERS) if (existsSync(join(base, m))) degradedMarkers.push(m);
  }
  let zeroByteFetcherOutput = false;
  for (const base of [dir, join(dir, 'scratch')]) {
    const fo = join(base, 'fetcher-output.txt');
    if (existsSync(fo) && statSync(fo).size === 0) { zeroByteFetcherOutput = true; break; }
  }
  return { reachabilityStatus, degradedMarkers, zeroByteFetcherOutput };
}

export function buildResults(trialDir) {
  const manifest = JSON.parse(readFileSync(join(trialDir, 'run-manifest.json'), 'utf8'));
  if ((manifest.runs?.length ?? 0) > 1) {
    throw new Error(`build-results: multi-run trial dir not supported in Plan 1 (got ${manifest.runs.length} runs). Capture one trial dir per run — see workbench/RUNBOOK.md. Per-run window splitting is a Plan 2 task.`);
  }
  const eventPayloads = readJsonl(join(trialDir, 'events.jsonl'));
  const spanPayloads = readJsonl(join(trialDir, 'spans.jsonl'));

  const events = extractApiRequestEvents(eventPayloads);
  const spans = extractLlmSpans(spanPayloads);
  const bodies = loadResponseBodies(eventPayloads);
  const thinkingByAgent = estimateThinkingByAgent(events, bodies);

  const runs = manifest.runs.map((m) => ({
    runId: m.runId,
    rung: m.rung ?? null,
    tier: m.tier ?? (m.scenario && m.scenario.tier) ?? null,
    scenario: m.scenario || {},
    command: m.command || '',
    startedAt: m.startedAt || null,
    endedAt: m.endedAt || null,
    wallMs: (m.startedAt && m.endedAt) ? (Date.parse(m.endedAt) - Date.parse(m.startedAt)) : 0,
    agents: aggregateRun(events, spans, thinkingByAgent),
    fanIn: fanInBlocking(spans),
    accuracy: null,
    ...readReachability(trialDir),
  }));

  const otelTotalTokens = runs.reduce((s, r) => s + r.agents.reduce((x, a) => x + a.tokens.total, 0), 0);
  const rollup = buildRollup(runs, { otelTotalTokens, costsJsonlTotalTokens: readCostsJsonl(trialDir) });

  return { trialId: manifest.trialId, generatedAt: null, runs, rollup };
}

// CLI: node build-results.mjs <trialDir> [outFile]
if (import.meta.url === `file://${process.argv[1]}`) {
  const [trialDir, outFile] = process.argv.slice(2);
  if (!trialDir) { console.error('usage: build-results.mjs <trialDir> [outFile]'); process.exit(1); }
  const results = buildResults(trialDir);
  const json = JSON.stringify(results, null, 2);
  if (outFile) writeFileSync(outFile, json);
  else console.log(json);
}
