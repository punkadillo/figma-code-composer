// oracle/extract-structural.mjs
// Pure, dependency-free structural extraction from a .tsx source string.
// Produces the { tree, props } shape score-structural.mjs consumes. We do NOT
// build a perfectly-nested JSX tree (fragile against expressions/fragments).
// Instead we collect the JSX element vocabulary in document order as a FLAT
// tree (root -> [elements]); score-structural.flattenTree turns that into a
// `tag:role` multiset and seqOverlap compares vocabularies — a robust,
// comparative structural signal. Generic type args (forwardRef<...>) are
// skipped via a negative lookbehind: a JSX `<` is never preceded by an
// identifier char, whereas `forwardRef<` always is.

const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// <Tag ...> or <Tag ... />, not a closing tag, not a generic.
const TAG_RE = /(?<![A-Za-z0-9_])<([A-Za-z][A-Za-z0-9._]*)((?:[^>"']|"[^"]*"|'[^']*')*?)\/?>/g;
const ROLE_RE = /\brole\s*=\s*"([^"]*)"/;

function extractProps(source) {
  // First `interface XxxProps {...}` or `type XxxProps = {...}` block.
  const m = source.match(/(?:interface|type)\s+\w*Props\b[^{]*\{([\s\S]*?)\n\}/);
  if (!m) return [];
  const names = new Set();
  for (const line of m[1].split('\n')) {
    const k = line.match(/^\s*(?:readonly\s+)?([A-Za-z_]\w*)\s*\??\s*:/);
    if (k) names.add(k[1]);
  }
  return [...names];
}

export function extractStructural(source = '') {
  const code = stripComments(source);
  const children = [];
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(code))) {
    const node = { tag: m[1] };
    const role = (m[2] || '').match(ROLE_RE);
    if (role) node.role = role[1];
    children.push(node);
  }
  return { tree: { tag: 'root', children }, props: extractProps(source) };
}
