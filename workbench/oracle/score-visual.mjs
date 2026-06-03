// workbench/oracle/score-visual.mjs
// Pure pixel-diff over two decoded RGBA buffers {width,height,data}.
// A pixel "differs" if any channel's absolute delta exceeds `tolerance`.
// diffPct = differing pixels / total * 100; score = 100 - diffPct.

export function scoreVisual(a, b, { tolerance = 8 } = {}) {
  if (!a || !b || a.width !== b.width || a.height !== b.height) {
    return { diffPct: 100, score: 0 };
  }
  const total = a.width * a.height;
  if (total === 0) return { diffPct: 0, score: 100 };
  let differing = 0;
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    if (
      Math.abs(a.data[o]   - b.data[o])   > tolerance ||
      Math.abs(a.data[o+1] - b.data[o+1]) > tolerance ||
      Math.abs(a.data[o+2] - b.data[o+2]) > tolerance ||
      Math.abs(a.data[o+3] - b.data[o+3]) > tolerance
    ) differing++;
  }
  const diffPct = Math.round((differing / total) * 100);
  return { diffPct, score: 100 - diffPct };
}
