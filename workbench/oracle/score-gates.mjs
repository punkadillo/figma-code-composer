// workbench/oracle/score-gates.mjs
// Run the four quality gates via an injectable runner so this is unit-testable.
// runGate(gateName) must resolve to { ok: boolean }; a throw counts as failure.

export const GATES = ['typecheck', 'build', 'tests', 'a11y'];

export async function scoreGates({ runGate, gates = GATES }) {
  const result = {};
  for (const g of gates) {
    try {
      const { ok } = await runGate(g);
      result[g] = !!ok;
    } catch {
      result[g] = false;
    }
  }
  return result;
}
