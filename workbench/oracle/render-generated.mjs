// workbench/oracle/render-generated.mjs
// LIVE capture of the generated component from the scratch target (operator
// phase). Mirrors captureOracle's output shape. IO-only; deps injected.
import { decodePng } from './png.mjs';

// deps.targetShot(componentName) -> { pngBuffer, style, dom }
export async function renderGenerated(componentName, deps) {
  const raw = await deps.targetShot(componentName);
  return { image: decodePng(raw.pngBuffer), style: raw.style, dom: raw.dom };
}
