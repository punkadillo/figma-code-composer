// workbench/oracle/judge.mjs
// Pure judge-panel aggregation. The vote producer is injected by the caller
// (live phase spawns 3 judge agents); this only reduces votes to a median.

export function judgePanel(votes = []) {
  if (votes.length === 0) return { score: 0, rationales: [] };
  const scores = votes.map((v) => v.score).slice().sort((a, b) => a - b);
  const mid = Math.floor(scores.length / 2);
  const score = scores.length % 2
    ? scores[mid]
    : Math.round((scores[mid - 1] + scores[mid]) / 2);
  return { score, rationales: votes.map((v) => v.rationale) };
}
