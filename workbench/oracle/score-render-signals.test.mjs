import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreRenderSignals } from './score-render-signals.mjs';

test('null capture → null score', () => {
  assert.equal(scoreRenderSignals(null).score, null);
});

test('all-good signals → 100', () => {
  const r = scoreRenderSignals({ focusVisible: true, reducedMotionRespected: true, keyboard: { reached: 3, total: 3 }, interactionOk: true });
  assert.equal(r.score, 100);
  assert.equal(r.keyboardReached, '3/3');
});

test('composite averages only captured signals', () => {
  const r = scoreRenderSignals({ focusVisible: false, reducedMotionRespected: true, keyboard: { reached: 1, total: 2 }, interactionOk: null });
  // focus 0, motion 100, keyboard 50 → mean 50
  assert.equal(r.score, 50);
  assert.equal(r.interaction, null);
});

test('zero focusable elements scores keyboard 100 (nothing to trap)', () => {
  const r = scoreRenderSignals({ focusVisible: true, reducedMotionRespected: true, keyboard: { reached: 0, total: 0 } });
  assert.equal(r.keyboard, 100);
});
