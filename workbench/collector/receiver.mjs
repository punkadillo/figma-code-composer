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
