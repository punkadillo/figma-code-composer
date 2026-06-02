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
