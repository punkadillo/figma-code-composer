import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = new URL('../figma-code-composer.js', import.meta.url).pathname;
const run = (args, input) => execFileSync('node', [CLI, ...args], { input, encoding: 'utf8' });

test('brevit:encode then brevit:decode round-trips a JSON file through stdin', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fcc-brevit-'));
  const f = join(dir, 'in.json');
  writeFileSync(f, JSON.stringify({ a: { b: 'color/surface/x' }, n: true }));
  const encoded = run(['brevit:encode', f]);
  const decoded = run(['brevit:decode'], encoded); // decode reads stdin
  const obj = JSON.parse(decoded);
  assert.equal(obj.a.b, 'color/surface/x');
  assert.equal(String(obj.n), 'true'); // scalar->string drift is documented
});

test('brevit:encode reads a file arg and writes non-empty output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fcc-brevit-'));
  const f = join(dir, 'in.json');
  writeFileSync(f, JSON.stringify({ ok: 1 }));
  const out = run(['brevit:encode', f]);
  assert.ok(out.length > 0);
});
