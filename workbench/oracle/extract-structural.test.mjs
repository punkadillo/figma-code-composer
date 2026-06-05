// oracle/extract-structural.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractStructural } from './extract-structural.mjs';

const SRC = `
import { forwardRef } from 'react';
interface FooProps {
  variant?: string;
  size?: number;
  onClick?: () => void;
}
export const Foo = forwardRef<HTMLButtonElement, FooProps>((p, ref) => (
  <div role="group" className="x">
    <button ref={ref}>{p.label}</button>
    <span />
  </div>
));
`;

test('extractStructural collects host tags, role attrs, and prop names', () => {
  const { tree, props } = extractStructural(SRC);
  assert.equal(tree.tag, 'root');
  const tags = tree.children.map((c) => c.tag);
  assert.deepEqual(tags, ['div', 'button', 'span']);   // generic <HTMLButtonElement,...> skipped
  assert.equal(tree.children[0].role, 'group');
  assert.deepEqual(props.sort(), ['onClick', 'size', 'variant']);
});

test('extractStructural is empty-safe', () => {
  assert.deepEqual(extractStructural(''), { tree: { tag: 'root', children: [] }, props: [] });
});

test('de-noise: dom.X -> X, single-letter tags dropped, destructured props captured', () => {
  const NOISE = `
export const Thing = forwardRef<E, ThingProps>(({ alpha, beta, ...rest }, ref) => (
  <dom.div role="alert"><E/><span/></dom.div>
));`;
  const { tree, props } = extractStructural(NOISE);
  assert.deepEqual(tree.children.map((c) => c.tag), ['div', 'span']);  // dom.div->div, <E/> dropped
  assert.equal(tree.children[0].role, 'alert');
  assert.ok(props.includes('alpha') && props.includes('beta'));
});
