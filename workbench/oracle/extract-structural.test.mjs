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

// Fix 2: role with single quotes
test("role attribute with single quotes is captured", () => {
  const src = `export const C = () => <div role='alert' />;`;
  const { tree } = extractStructural(src);
  assert.equal(tree.children.length, 1);
  assert.equal(tree.children[0].role, 'alert');
});

// Fix 3: default-valued destructured props
test('extractStructural captures default-valued and aliased destructured props', () => {
  const src = `
export const Foo = ({ a = 1, b, c: alias }: FooProps) => <span />;
`;
  const { props } = extractStructural(src);
  assert.ok(props.includes('a'), 'a (with default) should be included');
  assert.ok(props.includes('b'), 'b should be included');
  assert.ok(props.includes('c'), 'c (aliased as alias) should be included');
  assert.ok(!props.includes('alias'), 'alias (rhs of rename) should NOT be included');
});

// Fix 4: single-line type XxxProps = { ... } extracts props
test('extractStructural handles single-line type alias Props', () => {
  const src = `type FooProps = { a: string; b: number };`;
  const { props } = extractStructural(src);
  assert.ok(props.includes('a'), 'prop a should be extracted');
  assert.ok(props.includes('b'), 'prop b should be extracted');
});

// Fix 7: commented-out interface contributes no props
test('extractStructural ignores props inside block comments', () => {
  // Multiline interface inside a /* ... */ block — must not leak phantom props
  const src = `
/*
interface GhostProps {
  phantom: string;
  specter: boolean
}
*/
export const Real = () => <div />;
`;
  const { props } = extractStructural(src);
  assert.ok(!props.includes('phantom'), 'commented-out prop should not appear');
  assert.ok(!props.includes('specter'), 'commented-out prop should not appear');
});
