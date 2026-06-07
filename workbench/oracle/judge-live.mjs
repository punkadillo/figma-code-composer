// workbench/oracle/judge-live.mjs
// LIVE judge vote producer (operator phase). Wraps a single judge-agent call
// into the { score, rationale } shape judgePanel consumes. The agent runner is
// injected so this file imports no agent SDK; the operator wires it to a real
// 3-vote spawn against oracle/rubric.md. IO-only orchestration.

// deps.runJudgeAgent({ dimension, artifacts, oracleRef, rubric }) -> { score, rationale }
export function makeJudgeFor(deps, rubric) {
  return async function judgeFor(dimension, bundle) {
    const out = await deps.runJudgeAgent({
      dimension,
      artifacts: bundle.generated.artifacts,
      oracleRef: bundle.oracle,
      rubric,
    });
    const score = Math.max(0, Math.min(100, Number(out?.score) || 0));
    return { score, rationale: out?.rationale ?? '' };
  };
}
