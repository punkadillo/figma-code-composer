// workbench/oracle/metrics/surface.mjs
// Pure surface-signal counts over an artifact bundle. All heuristic/regex —
// documented proxies, not full parsing.

export function surfaceMetrics({ component = '', stories = '', tests = '', docs = '' } = {}) {
  const hasTypes = /\b(interface|type)\b/.test(component) || /:\s*\w+/.test(component);
  const propsMatch = component.match(/interface\s+\w*Props\s*\{([^}]*)\}/s)
    || component.match(/type\s+\w*Props\s*=\s*\{([^}]*)\}/s);
  const propCount = propsMatch
    ? propsMatch[1].split(/[\n;]/).map((l) => l.trim()).filter((l) => /^\w+\??\s*:/.test(l)).length
    : 0;
  const namedExports = (component.match(/export\s+(const|function|class)\s+\w+/g) || []).length;
  const storyCount = (stories.match(/export\s+const\s+\w+/g) || []).length;
  const testCount = (tests.match(/\b(test|it)\s*\(/g) || []).length;
  const docWords = docs.trim() ? docs.trim().split(/\s+/).length : 0;
  const hasPropTable = /\|\s*prop\s*\|/i.test(docs) || /\|[-\s|]+\|/.test(docs);
  return { hasTypes, propCount, namedExports, storyCount, testCount, docWords, hasPropTable };
}
