// workbench/oracle/score-component.mjs
import { scoreVisual } from './score-visual.mjs';
import { scoreStyle } from './score-style.mjs';
import { scoreStructural } from './score-structural.mjs';
import { scoreGates } from './score-gates.mjs';
import { composeAccuracy } from './score.mjs';

// bundle: { generated: { image, style, dom }, oracle: { image, style, dom } }
// opts: { weights, runGate }
export async function scoreComponent(bundle, { weights, runGate }) {
  const visual = scoreVisual(bundle.generated.image, bundle.oracle.image);
  const style = scoreStyle(bundle.generated.style, bundle.oracle.style);
  const structural = scoreStructural(bundle.generated.dom, bundle.oracle.dom);
  const gates = await scoreGates({ runGate });
  return composeAccuracy({ visual, style, structural, gates }, weights);
}
