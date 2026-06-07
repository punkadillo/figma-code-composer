// oracle/render-harness.mjs
// IO: serve the pre-built Storybook static dirs over local http and screenshot
// each story's component root at a FIXED clip (scoreVisual requires equal dims).
// Exposes openShots() -> { targetShot(r), oracleShot(r), close() }.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';            // resolved from project-root node_modules
import { STYLE_PROPS } from './score-style.mjs';

const TRIAL = process.env.TRIAL || 'trials/heroui-20260606';
export const CLIP = { x: 0, y: 0, width: 360, height: 240 };
const TARGET_SB = join(TRIAL, 'target/storybook-static');
const ORACLE_SB = join(TRIAL, 'ref-heroui/packages/storybook/storybook-static');
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
  return { pngBuffer, style, dom };
}

export async function openShots() {
  if (!existsSync(TRIAL)) {
    throw new Error(`[render-harness] TRIAL dir "${TRIAL}" not found. Set TRIAL=trials/<id>.`);
  }
  const target = await serve(TARGET_SB, 6111);
  const oracle = existsSync(ORACLE_SB) ? await serve(ORACLE_SB, 6112) : null;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  return {
    targetShot: (r) => shoot(page, target.url, r.targetStoryId),
    oracleShot: (r) => {
      if (!oracle || !r.oracleStoryId) throw new Error('oracle storybook/story unavailable');
      return shoot(page, oracle.url, r.oracleStoryId);
    },
    close: async () => { await browser.close(); target.server.close(); oracle?.server.close(); },
  };
}
