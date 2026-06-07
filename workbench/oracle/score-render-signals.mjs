// workbench/oracle/score-render-signals.mjs
// Dynamic, oracle-independent render signals (categories C/G). Pure: scores the
// booleans/counts captured in the render harness. Returns per-signal scores + a
// composite over whatever was captured. null when no capture.
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const mean = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

// cap: { focusVisible: bool, reducedMotionRespected: bool,
//        keyboard: { reached: n, total: n } | null, interactionOk: bool }
export function scoreRenderSignals(cap) {
  if (cap == null) return { score: null, source: null };
  const focusVisible = cap.focusVisible == null ? null : (cap.focusVisible ? 100 : 0);
  const reducedMotion = cap.reducedMotionRespected == null ? null : (cap.reducedMotionRespected ? 100 : 0);
  const keyboard = cap.keyboard && cap.keyboard.total
    ? clamp((cap.keyboard.reached / cap.keyboard.total) * 100)
    : (cap.keyboard && cap.keyboard.total === 0 ? 100 : null);
  const interaction = cap.interactionOk == null ? null : (cap.interactionOk ? 100 : 0);
  const parts = [focusVisible, reducedMotion, keyboard, interaction].filter((x) => x != null);
  return {
    score: mean(parts),
    source: 'playwright',
    focusVisible, reducedMotion, keyboard, interaction,
    keyboardReached: cap.keyboard ? `${cap.keyboard.reached}/${cap.keyboard.total}` : null,
  };
}
