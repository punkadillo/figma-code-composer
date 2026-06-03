// workbench/oracle/score-both.mjs
import { scoreComponent } from './score-component.mjs';
import { codeMetrics } from './metrics/code.mjs';
import { surfaceMetrics } from './metrics/surface.mjs';
import { metricSubScores, scoreDimensions, DIMS } from './quality/dimensions.mjs';
import { judgePanel } from './judge.mjs';
import { composeQuality } from './quality-score.mjs';

// bundle.generated.artifacts: { component, stories, tests, docs }
// opts: { fidelityWeights, runGate, qualityWeights, judgeFor, judgeVotes=3 }
export async function scoreBoth(bundle, opts) {
  const fidelity = await scoreComponent(bundle, { weights: opts.fidelityWeights, runGate: opts.runGate });

  const artifacts = bundle.generated.artifacts || {};
  const sub = metricSubScores({ code: codeMetrics(artifacts.component || ''), surface: surfaceMetrics(artifacts) });

  const votes = opts.judgeVotes ?? 3;
  const judges = {};
  for (const d of DIMS) {
    const cast = [];
    for (let i = 0; i < votes; i++) cast.push(await opts.judgeFor(d, bundle));
    judges[d] = judgePanel(cast);
  }

  const dims = scoreDimensions(sub, judges, opts.qualityWeights.blend);
  const quality = composeQuality(dims, opts.qualityWeights.dimensions);
  return { fidelity, quality };
}
