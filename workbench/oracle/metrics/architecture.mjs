// workbench/oracle/metrics/architecture.mjs
// "Stateless & Headless" architecture score from static source analysis.
// Pure: takes the component source string, returns a 0..100 score + the signals.
// Rewards controlled (prop-driven) APIs, no internal value state, extracted/headless
// logic, forwardRef composability, and side-effect discipline.
import { readFileSync } from 'node:fs';

export const HEADLESS_WEIGHTS = JSON.parse(
  readFileSync(new URL('../headless-weights.json', import.meta.url), 'utf8'),
);

const count = (src, re) => (src.match(re) || []).length;

export function architectureMetrics(src = '', weights = HEADLESS_WEIGHTS) {
  const stateCount = count(src, /\buseState\s*[<(]/g);
  const effectCount = count(src, /\buse(Effect|LayoutEffect)\s*\(/g);

  const controlledProps =
    /\b(value|checked|selected|isSelected|open|isOpen)\b/.test(src) &&
    /\b(onChange|onValueChange|onSelectionChange|onOpenChange|onCheckedChange|on[A-Z]\w*Change)\b/.test(src);

  // Stateless = holds no internal value state. A controlled component with at most
  // one piece of local UI state (e.g. focus) still counts as value-stateless.
  const statelessValue = stateCount === 0 || (controlledProps && stateCount <= 1);

  const hookExtraction =
    /export\s+(?:function|const)\s+use[A-Z]\w*/.test(src) ||
    /from\s+['"](?:react-aria|@react-aria|@ariakit|downshift|@headlessui)/.test(src);

  const forwardRef = /\bforwardRef\b/.test(src);

  const sideEffectDiscipline = effectCount <= (weights.maxEffectsForFull ?? 1);

  const signals = { controlledProps, statelessValue, hookExtraction, forwardRef, sideEffectDiscipline };
  const w = weights.signals || {};
  let score = 0;
  for (const [k, on] of Object.entries(signals)) if (on) score += w[k] ?? 0;

  return { score: Math.max(0, Math.min(100, Math.round(score))), signals, stateCount, effectCount };
}
