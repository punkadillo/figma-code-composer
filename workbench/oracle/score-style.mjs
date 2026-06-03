// workbench/oracle/score-style.mjs
// Compare two computed-style maps over a fixed property set.
// A property is "compared" only if present on at least one side.

export const STYLE_PROPS = [
  'color', 'background-color',
  'padding', 'margin', 'gap',
  'font-size', 'font-weight', 'font-family', 'line-height',
  'border-radius', 'border-width', 'border-color',
];

const norm = (v) => (v ?? '').toString().toLowerCase().replace(/\s+/g, '');

export function scoreStyle(generated = {}, reference = {}, props = STYLE_PROPS) {
  const properties = {};
  let compared = 0, matched = 0;
  for (const p of props) {
    const g = generated[p], r = reference[p];
    if (g === undefined && r === undefined) continue;
    compared++;
    const ok = norm(g) === norm(r);
    properties[p] = ok;
    if (ok) matched++;
  }
  const matchRate = compared === 0 ? 0 : Math.round((matched / compared) * 100);
  return { matchRate, properties };
}
