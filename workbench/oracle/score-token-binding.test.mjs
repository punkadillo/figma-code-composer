import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreTokenBinding } from './score-token-binding.mjs';

const W = { perLiteralPenalty: 8, floor: 0 };

test('utility classes, no literals → 100', () => {
  const r = scoreTokenBinding('<button className="bg-brand-primary px-4 text-sm">Go</button>', W);
  assert.equal(r.score, 100);
  assert.equal(r.literals, 0);
});

test('var(--token) references counted as bound, score 100', () => {
  const r = scoreTokenBinding('const s = { color: "var(--color-fg)", padding: "var(--space-2)" };', W);
  assert.equal(r.score, 100);
  assert.equal(r.boundRefs, 2);
});

test('hex literals deduct per-literal penalty', () => {
  const r = scoreTokenBinding('style={{ color: "#3b82f6", background: "#fff" }}', W);
  assert.equal(r.literals, 2);
  assert.equal(r.score, 100 - 16);
});

test('arbitrary Tailwind value with a hex counts once (no double count)', () => {
  const r = scoreTokenBinding('<div className="bg-[#1e293b]" />', W);
  assert.equal(r.literals, 1);
  assert.equal(r.score, 92);
});

test('rgb()/hsl() functional colors and raw px both count', () => {
  const r = scoreTokenBinding('a{color:rgb(0,0,0)} b{margin:12px} c{gap:1rem}', W);
  assert.equal(r.literals, 3);
});

test('score floors at 0 for a literal-heavy component', () => {
  const src = Array.from({ length: 20 }, (_, i) => `#${i.toString(16).padStart(6, '0')}`).join(' ');
  assert.equal(scoreTokenBinding(src, W).score, 0);
});

test('samples are de-duplicated and capped at 5', () => {
  const r = scoreTokenBinding('#fff #fff #000 12px 1rem rgb(1,2,3) hsl(1,2%,3%)', W);
  assert.ok(r.samples.length <= 5);
  assert.ok(r.samples.includes('#fff'));
});
