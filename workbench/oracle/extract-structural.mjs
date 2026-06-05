// oracle/extract-structural.mjs
// Pure, dependency-free structural extraction from a .tsx source string.
// Produces the { tree, props } shape score-structural.mjs consumes. We do NOT
// build a perfectly-nested JSX tree (fragile against expressions/fragments).
// Instead we collect the JSX element vocabulary in document order as a FLAT
// tree (root -> [elements]); score-structural.flattenTree turns that into a
// `tag:role` multiset and seqOverlap compares vocabularies — a structural
// signal. Generic type args (forwardRef<...>) are skipped via a negative
// lookbehind: a JSX `<` is never preceded by an identifier char, whereas
// `forwardRef<` always is. Note: attribute parsing operates on the
// comment-stripped source; tag-shaped content inside string literals may still
// cause false positives.

const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// <Tag ...> or <Tag ... />, not a closing tag, not a generic.
const TAG_RE = /(?<![A-Za-z0-9_])<([A-Za-z][A-Za-z0-9._]*)((?:[^>"']|"[^"]*"|'[^']*')*?)\/?>/g;
const ROLE_RE = /\brole\s*=\s*["']([^"']*)["']/;
const normTag = (t) => (t.startsWith('dom.') ? t.slice(4) : t);

function extractDestructuredProps(source) {
  // First object-destructured function/arrow param: ({ a, b, ...rest })
  const m = source.match(/\(\s*\{([^{}]*)\}\s*(?::[^)]*)?[,)]/);
  if (!m) return [];
  return m[1].split(',')
    .map((s) => s.trim().split(/[:=]/)[0].trim().replace(/^\.\.\./, ''))
    .filter((n) => /^[A-Za-z_]\w*$/.test(n) && n !== 'ref');
}

function extractProps(source) {
  // First `interface XxxProps {...}` or `type XxxProps = {...}` block.
  // Handles both multiline and single-line forms.
  const m = source.match(/(?:interface|type)\s+\w*Props\b[^{]*\{([\s\S]*?)\}/);
  if (!m) return [];
  const names = new Set();
  for (const entry of m[1].split(/[;,\n]/)) {
    const k = entry.match(/^\s*(?:readonly\s+)?([A-Za-z_]\w*)\s*\??\s*:/);
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
    const tag = normTag(m[1]);
    if (/^[A-Z]$/.test(tag)) continue;            // drop single-letter noise (generic <E,...>)
    const node = { tag };
    const role = (m[2] || '').match(ROLE_RE);
    if (role) node.role = role[1];
    children.push(node);
  }
  const props = [...new Set([...extractProps(code), ...extractDestructuredProps(code)])];
  return { tree: { tag: 'root', children }, props };
}
