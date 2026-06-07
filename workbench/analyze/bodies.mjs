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
