// workbench/oracle/score-token-binding.mjs
// Token-binding rate — the pipeline's core mandate: styled values should bind to
// design tokens, never inline raw literals (CLAUDE.md binding rule 4). Pure: takes
// the generated component source, returns a 0..100 "literal-freedom" score.
// 100 = no hardcoded design values; each hex / rgb()/hsl() / arbitrary-value / raw
// px·rem literal deducts. `var(--…)` references are reported as positive evidence.
import { readFileSync } from 'node:fs';

export const TOKEN_BINDING_WEIGHTS = JSON.parse(
  readFileSync(new URL('./token-binding-weights.json', import.meta.url), 'utf8'),
);

// One alternation so each literal is consumed once (no double counting between a
// hex inside an arbitrary Tailwind value and the hex pattern itself).
const LITERAL = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\b(?:rgba?|hsla?)\([^)]*\)|\b\d+(?:px|rem)\b/g;
const BOUND = /var\(\s*--/g;

const clamp = (n, floor = 0) => Math.max(floor, Math.min(100, Math.round(n)));

export function scoreTokenBinding(src = '', weights = TOKEN_BINDING_WEIGHTS) {
  const { perLiteralPenalty = 8, floor = 0 } = weights;
  const literalMatches = src.match(LITERAL) || [];
  const literals = literalMatches.length;
  const boundRefs = (src.match(BOUND) || []).length;
  return {
    score: literals === 0 ? 100 : clamp(100 - perLiteralPenalty * literals, floor),
    literals,
    boundRefs,
    samples: [...new Set(literalMatches)].slice(0, 5),
  };
}
