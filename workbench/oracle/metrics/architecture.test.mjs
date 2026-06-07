import { test } from 'node:test';
import assert from 'node:assert/strict';
import { architectureMetrics } from './architecture.mjs';

const W = {
  signals: { controlledProps: 25, statelessValue: 25, hookExtraction: 20, forwardRef: 15, sideEffectDiscipline: 15 },
  maxEffectsForFull: 1,
};

test('fully headless controlled component scores 100', () => {
  const src = `
    import { forwardRef } from 'react';
    import { useToggle } from '@react-aria/toggle';
    export const Switch = forwardRef(({ isSelected, onChange }, ref) => {
      const state = useToggle({ isSelected, onChange });
      return <button ref={ref} role="switch" aria-checked={isSelected} />;
    });`;
  const r = architectureMetrics(src, W);
  assert.equal(r.score, 100);
  assert.deepEqual(r.signals, {
    controlledProps: true, statelessValue: true, hookExtraction: true, forwardRef: true, sideEffectDiscipline: true,
  });
});

test('internal value state without controlled props loses both state signals', () => {
  const src = `
    import { useState } from 'react';
    export function Counter() {
      const [value, setValue] = useState(0);
      return <button onClick={() => setValue(value + 1)}>{value}</button>;
    }`;
  const r = architectureMetrics(src, W);
  assert.equal(r.signals.controlledProps, false);
  assert.equal(r.signals.statelessValue, false);
  assert.equal(r.stateCount, 1);
});

test('controlled component with one local state still counts as value-stateless', () => {
  const src = `
    import { useState } from 'react';
    export const Input = ({ value, onChange }) => {
      const [focused, setFocused] = useState(false);
      return <input value={value} onChange={onChange} onFocus={() => setFocused(true)} />;
    };`;
  const r = architectureMetrics(src, W);
  assert.equal(r.signals.controlledProps, true);
  assert.equal(r.signals.statelessValue, true);
});

test('too many effects fails side-effect discipline', () => {
  const src = `
    export const X = ({ value, onChange }) => {
      useEffect(() => {}, []);
      useEffect(() => {}, []);
      return null;
    };`;
  const r = architectureMetrics(src, W);
  assert.equal(r.effectCount, 2);
  assert.equal(r.signals.sideEffectDiscipline, false);
});

test('exported use* hook satisfies hookExtraction', () => {
  const src = `export function useDisclosure() { return {}; }\nexport const Modal = () => null;`;
  assert.equal(architectureMetrics(src, W).signals.hookExtraction, true);
});

test('empty source → stateless+effect-discipline only', () => {
  const r = architectureMetrics('', W);
  assert.equal(r.signals.statelessValue, true);
  assert.equal(r.signals.sideEffectDiscipline, true);
  assert.equal(r.signals.controlledProps, false);
  assert.equal(r.score, 25 + 15);
});
