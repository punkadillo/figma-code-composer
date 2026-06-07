// workbench/oracle/capture.mjs
// LIVE oracle capture (operator phase). Component rungs → HeroUI Storybook;
// template/page rungs → Figma screenshot. Returns { image, style, dom }.
// IO-only orchestration: all scoring logic lives in the tested pure modules.
import { decodePng } from './png.mjs';
import { oracleSourceFor } from './ladder.mjs';

// deps is injected so this stays driver-agnostic and the operator can wire
// Playwright + the figma MCP without this file importing them directly:
//   deps.storybookShot(rung) -> { pngBuffer, style, dom }
//   deps.figmaShot(nodeId)   -> { pngBuffer, style, dom }
export async function captureOracle(rung, nodeId, deps) {
  const source = oracleSourceFor(rung);
  const raw = source === 'storybook'
    ? await deps.storybookShot(rung)
    : await deps.figmaShot(nodeId);
  return { image: decodePng(raw.pngBuffer), style: raw.style, dom: raw.dom, source };
}
