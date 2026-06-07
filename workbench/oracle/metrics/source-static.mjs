// workbench/oracle/metrics/source-static.mjs
// A battery of static source-scan metrics over a generated component's source.
// Pure: takes the source string (+ light config), returns one sub-object per metric,
// each { score: 0..100, ...signals }. Covers categories B/C-static/G/H of the
// workbench metric menu. No deps, no render.

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const count = (src, re) => (src.match(re) || []).length;

// B — Type strictness (TS only). Penalize `any`, type-assertions, ts-ignores.
export function typeStrictness(src, language = 'ts') {
  if (language !== 'ts' && language !== 'tsx') return { score: null, reason: 'not-typescript' };
  const anys = count(src, /:\s*any\b|<any>|\bas\s+any\b|\bArray<any>|\bRecord<[^>]*any[^>]*>/g);
  const ignores = count(src, /@ts-(?:ignore|expect-error|nocheck)/g);
  const assertions = count(src, /\bas\s+[A-Z]\w+/g);
  return { score: clamp(100 - (anys * 12 + ignores * 15 + assertions * 4)), anys, ignores, assertions };
}

// B — Cyclomatic-ish complexity (branch + logical-operator proxy, but reported as a real count).
export function complexity(src) {
  const branches = count(src, /\b(if|for|while|case|catch)\b|\?\.|&&|\|\||\?(?=[^.])/g);
  // soft score: <=8 great, ramps down to 0 at ~40 branches
  return { branches, score: clamp(100 - Math.max(0, branches - 8) * (100 / 32)) };
}

// B — External dependency footprint (non-relative, non-react imports).
export function dependencyFootprint(src) {
  const imports = src.match(/^\s*import\b[\s\S]*?from\s*['"][^'"]+['"]/gm) || [];
  const external = imports.filter((l) => {
    const m = l.match(/from\s*['"]([^'"]+)['"]/);
    const spec = m && m[1];
    return spec && !spec.startsWith('.') && spec !== 'react' && spec !== 'react/jsx-runtime';
  });
  return { totalImports: imports.length, externalCount: external.length, score: clamp(100 - Math.max(0, external.length - 2) * 10) };
}

// B — CSS hygiene: !important and inline style usage.
export function cssHygiene(src) {
  const important = count(src, /!important/g);
  const inlineStyle = count(src, /\bstyle=\{\{/g);
  return { important, inlineStyle, score: clamp(100 - important * 15 - inlineStyle * 8) };
}

// G — Dangerous APIs.
export function dangerousApi(src) {
  const innerHtml = count(src, /dangerouslySetInnerHTML/g);
  const evals = count(src, /\beval\s*\(|new\s+Function\s*\(/g);
  const total = innerHtml + evals;
  return { dangerouslySetInnerHTML: innerHtml, evalUse: evals, score: total === 0 ? 100 : 0 };
}

// G — Server/Client boundary: an unnecessary "use client" (no state/effects/handlers) is RSC waste.
export function serverClientBoundary(src) {
  const hasUseClient = /^\s*['"]use client['"]\s*;?/m.test(src);
  const needsClient = /\buse(?:State|Effect|Ref|Reducer|Context|LayoutEffect|Callback|Memo|Id)\b/.test(src) || /\bon[A-Z]\w+\s*=/.test(src);
  const unnecessary = hasUseClient && !needsClient;
  return { hasUseClient, needsClient, unnecessary, score: unnecessary ? 60 : 100 };
}

// C — RTL readiness: logical properties vs physical left/right.
export function rtlReadiness(src) {
  const logical = count(src, /\b(?:padding|margin|border|inset)-(?:inline|block)(?:-(?:start|end))?\b|\b(?:ps|pe|ms|me|start|end)-(?:\d|\[)/g);
  const physical = count(src, /\b(?:padding|margin)-(?:left|right)\b|\b(?:pl|pr|ml|mr)-(?:\d|\[)/g);
  const total = logical + physical;
  return { logical, physical, score: total === 0 ? 100 : clamp((logical / total) * 100) };
}

// E/meta — Comment-economy compliance: the 80-char single-line rule (PIPELINE rule 8).
// JSDoc doc-comments (`/** … */`) are EXEMPT — they document the public API and are
// rewarded by propTypeCompleteness + the quality docs/dx dimensions; penalizing them
// here would send contradictory signals. We penalize narrative `/* … */` blocks and
// over-long `//` line comments only.
export function commentEconomy(src) {
  const deUrl = src.replace(/https?:\/\//g, 'https_'); // avoid // in URLs
  let lineComments = 0, overLength = 0;
  for (const line of deUrl.split('\n')) {
    const idx = line.indexOf('//');
    if (idx < 0) continue;
    lineComments++;
    if (line.slice(idx).length > 80) overLength++; // measured from // (indentation excluded)
  }
  const blocks = src.match(/\/\*[\s\S]*?\*\//g) || [];
  const jsdocBlocks = blocks.filter((b) => b.startsWith('/**')).length;
  const narrativeBlocks = blocks.filter((b) => b.includes('\n') && !b.startsWith('/**')).length;
  return {
    lineComments, overLength, jsdocBlocks, narrativeBlocks,
    score: clamp(100 - (overLength + narrativeBlocks) * 10),
  };
}

// H — Composability: forwardRef, rest-prop spread, className passthrough.
export function composability(src) {
  const forwardRef = /\bforwardRef\b/.test(src);
  const restSpread = /\.\.\.(?:props|rest)\b/.test(src);
  const classNamePass = /\bclassName\b/.test(src);
  const score = (forwardRef ? 40 : 0) + (restSpread ? 35 : 0) + (classNamePass ? 25 : 0);
  return { forwardRef, restSpread, classNamePass, score: clamp(score) };
}

// H — Naming adherence: exported component is PascalCase (matches expected name when provided).
export function namingAdherence(src, exportName = null) {
  const exports = [
    ...[...src.matchAll(/export\s+(?:const|function|class)\s+([A-Za-z_]\w*)/g)].map((m) => m[1]),
    ...[...src.matchAll(/export\s+default\s+(?:function\s+)?([A-Za-z_]\w*)/g)].map((m) => m[1]),
    // `export { Foo, Bar as Baz }` — take the exported (post-`as`) identifier.
    ...[...src.matchAll(/export\s*\{([^}]+)\}/g)].flatMap((m) =>
      m[1].split(',').map((part) => part.trim().split(/\s+as\s+/).pop().trim()).filter(Boolean)),
  ];
  const comp = exports.find((e) => /^[A-Z]/.test(e)) || null;
  const pascal = comp ? /^[A-Z][A-Za-z0-9]*$/.test(comp) : false;
  const matches = exportName ? comp === exportName : pascal;
  return { exportName: comp, pascalCase: pascal, matchesExpected: matches, score: matches ? 100 : (pascal ? 80 : 40) };
}

// H — Prop-type / JSDoc completeness: a typed Props surface + (bonus) JSDoc on it.
export function propTypeCompleteness(src) {
  const hasPropsType = /\b(?:interface|type)\s+\w*Props\b/.test(src) || /:\s*\{[^}]*\}\s*\)/.test(src);
  const implicitAny = count(src, /\(\s*\{\s*[^}]*\}\s*\)\s*=>/g) > 0 && !hasPropsType;
  const jsdoc = /\/\*\*[\s\S]*?\*\//.test(src);
  const score = (hasPropsType ? 70 : 0) + (jsdoc ? 30 : 0) - (implicitAny ? 30 : 0);
  return { hasPropsType, jsdoc, implicitAny, score: clamp(score) };
}

export function staticSourceMetrics(src = '', { language = 'ts', exportName = null } = {}) {
  return {
    typeStrictness: typeStrictness(src, language),
    complexity: complexity(src),
    dependencyFootprint: dependencyFootprint(src),
    cssHygiene: cssHygiene(src),
    dangerousApi: dangerousApi(src),
    serverClientBoundary: serverClientBoundary(src),
    rtlReadiness: rtlReadiness(src),
    commentEconomy: commentEconomy(src),
    composability: composability(src),
    namingAdherence: namingAdherence(src, exportName),
    propTypeCompleteness: propTypeCompleteness(src),
  };
}
