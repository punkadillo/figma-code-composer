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
