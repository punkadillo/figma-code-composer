import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  typeStrictness, complexity, dependencyFootprint, cssHygiene, dangerousApi,
  serverClientBoundary, rtlReadiness, commentEconomy, composability,
  namingAdherence, propTypeCompleteness, staticSourceMetrics,
} from './source-static.mjs';

test('typeStrictness penalizes any / ts-ignore / assertions; null for non-ts', () => {
  assert.equal(typeStrictness('const x = 1', 'js').score, null);
  assert.equal(typeStrictness('const x: number = 1').score, 100);
  const r = typeStrictness('const a: any = x as any; // @ts-ignore\nconst b = y as Foo');
  assert.ok(r.anys >= 1 && r.ignores === 1 && r.assertions >= 1);
  assert.ok(r.score < 100);
});

test('complexity counts branches and scores high when simple', () => {
  assert.equal(complexity('const C = () => <div/>').score, 100);
  assert.ok(complexity('if(a){} if(b){} for(;;){} while(x){} a&&b||c').branches >= 5);
});

test('dependencyFootprint ignores react + relative imports', () => {
  const src = `import React from 'react';\nimport { cn } from './utils';\nimport x from 'clsx';\nimport y from 'date-fns';`;
  const r = dependencyFootprint(src);
  assert.equal(r.externalCount, 2); // clsx + date-fns
});

test('cssHygiene flags !important and inline style', () => {
  const r = cssHygiene('<div style={{color:"red"}} className="x !important" />');
  assert.equal(r.important, 1);
  assert.equal(r.inlineStyle, 1);
  assert.ok(r.score < 100);
});

test('dangerousApi is 0 when present, 100 when clean', () => {
  assert.equal(dangerousApi('<div dangerouslySetInnerHTML={{__html:x}} />').score, 0);
  assert.equal(dangerousApi('const f = () => 1; eval(s)').score, 0);
  assert.equal(dangerousApi('<div/>').score, 100);
});

test('serverClientBoundary flags unnecessary use client', () => {
  assert.equal(serverClientBoundary('"use client";\nexport const X = () => <div/>').unnecessary, true);
  assert.equal(serverClientBoundary('"use client";\nconst [s] = useState()').unnecessary, false);
  assert.equal(serverClientBoundary('export const X = () => <div/>').score, 100);
});

test('rtlReadiness rewards logical properties', () => {
  assert.equal(rtlReadiness('className="ps-4 pe-2"').score, 100);
  assert.ok(rtlReadiness('className="pl-4 pr-2"').score === 0);
  assert.equal(rtlReadiness('<div/>').score, 100); // nothing positional → neutral 100
});

test('commentEconomy flags >80-char + narrative blocks, ignores urls', () => {
  assert.equal(commentEconomy('const x = 1; // see https://example.com/very/long/url/that/keeps/going/and/going').overLength, 0);
  const long = '// ' + 'x'.repeat(90);
  assert.equal(commentEconomy(long).overLength, 1);
  const r = commentEconomy('/* a\n b\n c */');
  assert.equal(r.narrativeBlocks, 1);
  assert.ok(r.score < 100);
});

test('commentEconomy EXEMPTS JSDoc doc-comments (no contradiction with propTypeCompleteness)', () => {
  const jsdoc = '/**\n * Color variant.\n * @default "primary"\n */\ninterface Props { x: string }';
  const r = commentEconomy(jsdoc);
  assert.equal(r.jsdocBlocks, 1);
  assert.equal(r.narrativeBlocks, 0);
  assert.equal(r.score, 100); // JSDoc must not be penalized
});

test('composability rewards forwardRef + rest spread + className', () => {
  const r = composability('const X = forwardRef(({className, ...props}, ref) => <div className={className} {...props} ref={ref}/>)');
  assert.equal(r.score, 100);
  assert.equal(composability('const X = () => <div/>').score, 0);
});

test('namingAdherence checks PascalCase + expected name', () => {
  assert.equal(namingAdherence('export const Button = () => <div/>', 'Button').matchesExpected, true);
  assert.equal(namingAdherence('export const Button = () => <div/>', 'Chip').score, 80); // pascal but wrong name
  assert.ok(namingAdherence('export const myThing = () => <div/>').score <= 40);
});

test('namingAdherence detects re-export and default-export styles', () => {
  assert.equal(namingAdherence('const Button = () => <div/>;\nexport { Button };', 'Button').matchesExpected, true);
  assert.equal(namingAdherence('function Card(){}\nexport default Card;', 'Card').matchesExpected, true);
  assert.equal(namingAdherence('export { Foo as Tabs };', 'Tabs').matchesExpected, true);
});

test('propTypeCompleteness rewards typed Props + JSDoc', () => {
  const r = propTypeCompleteness('/** doc */\ninterface ButtonProps { x: string }\nexport const Button = (p: ButtonProps) => <div/>');
  assert.ok(r.hasPropsType && r.jsdoc && r.score === 100);
});

test('staticSourceMetrics returns all sub-metrics', () => {
  const all = staticSourceMetrics('export const Button = () => <div/>', { exportName: 'Button' });
  for (const k of ['typeStrictness', 'complexity', 'dependencyFootprint', 'cssHygiene', 'dangerousApi', 'serverClientBoundary', 'rtlReadiness', 'commentEconomy', 'composability', 'namingAdherence', 'propTypeCompleteness']) {
    assert.ok(k in all, `missing ${k}`);
  }
});
