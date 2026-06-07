// oracle/render-harness.mjs
// IO: serve the pre-built Storybook static dirs over local http and screenshot
// each story's component root at a FIXED clip (scoreVisual requires equal dims).
// Exposes openShots() -> { targetShot(r), oracleShot(r), close() }.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';            // resolved from project-root node_modules
import { STYLE_PROPS } from './score-style.mjs';

// axe-core is optional at runtime; render still works (a11y → null) if it's absent.
let AXE_PATH = null;
try { AXE_PATH = createRequire(import.meta.url).resolve('axe-core/axe.min.js'); } catch { AXE_PATH = null; }

// Installed via page.addInitScript — runs in page context before page scripts on
// EVERY navigation, so the accumulators reset per story. Captures LCP / CLS / TBT.
function cwvInit() {
  window.__cwv = { lcp: 0, cls: 0, tbt: 0 };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__cwv.lcp = e.startTime; })
      .observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cwv.cls += e.value; })
      .observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__cwv.tbt += Math.max(0, e.duration - 50); })
      .observe({ type: 'longtask', buffered: true });
  } catch { /* observer types unsupported — leave zeros */ }
}

const TRIAL = process.env.TRIAL || 'trials/example';
export const CLIP = { x: 0, y: 0, width: 360, height: 240 };
const TARGET_SB = join(TRIAL, 'target/storybook-static');
const ORACLE_SB = join(TRIAL, 'ref-oracle/packages/storybook/storybook-static');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.map': 'application/json' };

function serve(root, port) {
  const server = createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/') p = '/index.html';
    let f = join(root, p);
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
    if (!existsSync(f)) { res.statusCode = 404; res.end('not found'); return; }
    res.setHeader('content-type', MIME[extname(f)] || 'application/octet-stream');
    res.end(readFileSync(f));
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ url: `http://localhost:${port}`, server })));
}

async function shoot(page, baseUrl, storyId) {
  await page.goto(`${baseUrl}/iframe.html?id=${storyId}&viewMode=story`, { waitUntil: 'networkidle' });
  const root = page.locator('#storybook-root > *, #root > *').first();
  await root.waitFor({ state: 'visible', timeout: 15000 });
  const pngBuffer = await page.screenshot({ clip: CLIP });
  const style = await root.evaluate((el, props) => {
    const cs = getComputedStyle(el); const out = {};
    for (const p of props) out[p] = cs.getPropertyValue(p);
    return out;
  }, STYLE_PROPS);
  // Rendered DOM tree for structuralDom (real HTML elements on both sides).
  const dom = await root.evaluate((el) => {
    const walk = (n) => ({
      tag: (n.tagName || 'node').toLowerCase(),
      role: n.getAttribute && n.getAttribute('role') ? n.getAttribute('role') : undefined,
      children: [...(n.children || [])].map(walk),
    });
    return walk(el);
  });

  // Core Web Vitals from the per-navigation observers (cwvInit).
  const cwv = await page.evaluate(() => (window.__cwv
    ? { lcpMs: Math.round(window.__cwv.lcp), cls: Math.round(window.__cwv.cls * 1000) / 1000, tbtMs: Math.round(window.__cwv.tbt) }
    : null));

  // Accessibility audit (axe-core) over the story root. Null when axe is absent.
  let axe = null;
  if (AXE_PATH) {
    try {
      await page.addScriptTag({ path: AXE_PATH });
      axe = await page.evaluate(async () => {
        const res = await window.axe.run('#storybook-root, #root', { resultTypes: ['violations', 'passes'] });
        return {
          violations: res.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
          passes: res.passes.length,
        };
      });
    } catch { axe = null; }
  }

  // Render signals (focus-visible, keyboard reachability, interaction-ok) — oracle-independent.
  const signals = await root.evaluate((el) => {
    const focusable = el.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])');
    const interactive = el.querySelectorAll('a,button,input,select,textarea,[role="button"],[role="tab"],[role="switch"],[role="checkbox"],[role="menuitem"]');
    let focusVisible = null;
    const first = focusable[0];
    if (first) {
      const cs0 = getComputedStyle(first);
      const before = cs0.outlineStyle + '|' + cs0.boxShadow;
      first.focus();
      const cs1 = getComputedStyle(first);
      focusVisible = (cs1.outlineStyle + '|' + cs1.boxShadow) !== before || cs1.outlineStyle !== 'none';
    }
    return {
      focusVisible,
      keyboard: { reached: focusable.length, total: Math.max(focusable.length, interactive.length) },
      interactionOk: true,
      reducedMotionRespected: null, // gated — not reliably detectable in one pass
    };
  }).catch(() => null);

  // Runtime perf — mount proxy from paint timing; inp/reRenders/memory gated.
  const perf = await page.evaluate(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const nav = performance.getEntriesByType('navigation')[0];
    const mountMs = fcp ? Math.round(fcp.startTime) : (nav ? Math.round(nav.domContentLoadedEventEnd) : null);
    return { mountMs, inpMs: null, reRenders: null, memoryMB: null };
  }).catch(() => null);

  return { pngBuffer, style, dom, cwv, axe, signals, perf };
}

export async function openShots() {
  if (!existsSync(TRIAL)) {
    throw new Error(`[render-harness] TRIAL dir "${TRIAL}" not found. Set TRIAL=trials/<id>.`);
  }
  const target = await serve(TARGET_SB, 6111);
  const oracle = existsSync(ORACLE_SB) ? await serve(ORACLE_SB, 6112) : null;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  await page.addInitScript(cwvInit); // CWV observers, re-armed on every navigation
  return {
    targetShot: (r) => shoot(page, target.url, r.targetStoryId),
    oracleShot: (r) => {
      if (!oracle || !r.oracleStoryId) throw new Error('oracle storybook/story unavailable');
      return shoot(page, oracle.url, r.oracleStoryId);
    },
    close: async () => { await browser.close(); target.server.close(); oracle?.server.close(); },
  };
}
