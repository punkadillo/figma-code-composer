// workbench/oracle/quality/dimensions.mjs
// Map raw metrics → per-dimension metric sub-scores, then blend with judges.
import { blendDimension } from './blend.mjs';

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

// raw: { code: codeMetrics(...), surface: surfaceMetrics(...) }
export function metricSubScores({ code, surface }) {
  const optimizedCode = code.metricScore;
  const dx = clamp(
    (surface.hasTypes ? 50 : 0) +
    (surface.namedExports > 0 ? 20 : 0) +
    Math.min(30, surface.propCount * 10)
  );
  const docs = clamp(
    Math.min(60, surface.docWords) +
    (surface.hasPropTable ? 40 : 0)
  );
  const testDepth = clamp((Math.min(6, surface.testCount) / 6) * 100);
  const storybook = clamp((Math.min(4, surface.storyCount) / 4) * 100);
  return { optimizedCode, dx, docs, testDepth, storybook };
}

const DIMS = ['optimizedCode', 'dx', 'docs', 'testDepth', 'storybook'];

// sub: metricSubScores output; judges: { dim: {score,rationales} }; blend: weights.blend
export function scoreDimensions(sub, judges, blend) {
  const out = {};
  for (const d of DIMS) {
    out[d] = blendDimension(sub[d], judges[d] ?? { score: 0, rationales: [] }, blend[d]);
  }
  return out;
}

export { DIMS };
