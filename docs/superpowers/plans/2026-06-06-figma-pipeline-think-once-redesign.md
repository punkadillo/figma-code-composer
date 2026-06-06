# Figma Pipeline "Think-Once" Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-engineer the figma-to-code agents so the pipeline fetches once, reasons once (a coordinator-embedded `buildPlan`), and executes mechanically — hitting 98–100% source/structural accuracy, ~80% fewer tokens, zero MCP-fallback failures, with Brevit as the token-efficient inter-agent wire format.

**Architecture:** The figma-coordinator gains a single "think-once" reasoning step (Step 8.5) that turns the validated manifest into per-component directives; builders execute the directive instead of re-deriving. Brevit (JSON Flatten mode) compresses the in-context handoffs while canonical JSON stays on disk for `jq`/`fcc`. The fetcher gains a full-variable-collection mode and the MCP subprocess escape hatch is removed.

**Tech Stack:** Node ESM CLI (`bin/figma-code-composer.js` = `fcc`), `node --test` + `node:assert`, agent instruction markdown (`.claude/agents/*.md`), protocol/adapter markdown (`.figma-pipeline/**`), JSON Schema config, `brevit` npm package, workbench runner (`workbench/runner/*.mjs`).

**Spec:** `docs/superpowers/specs/2026-06-06-figma-pipeline-think-once-redesign-design.md`

**Conventions for this plan:**
- Code changes (`.mjs`, `.js`, `.json`) follow strict TDD: failing test → run-fail → implement → run-pass → commit.
- Instruction-file changes (`.md`) are verified with **grep/jq assertions** (phrase-present / anti-pattern-absent), since their "behavior" is prompt text. Each such task ends: edit → verify → commit.
- Commit after every task. Branch is already `workbench-agent-benchmark`; commit there unless told otherwise.
- After each `.md` edit to a `.claude/agents/*` or `.figma-pipeline/protocols/*` file, mirror the change into the matching `.cursor/prompts/*` or `.cursor/rules/*` file **only if one exists for that surface** (check first; not every agent has a Cursor mirror).

---

## Phase 1 — Brevit foundation (WS-A, WS-B)

### Task 1: Install Brevit and capture its real API + output format

**Files:**
- Modify: `package.json` (add `brevit` dependency)
- Create: `/tmp/brevit-probe.mjs` (throwaway probe — not committed)

- [ ] **Step 1: Install the package**

Run:
```bash
npm install brevit
```
Expected: `brevit` appears in `package.json` `dependencies`; `node_modules/brevit/package.json` exists.

- [ ] **Step 2: Inspect the real export surface**

Run:
```bash
node -e "const b=require('brevit'); console.log(Object.keys(b))" 2>/dev/null \
  || node --input-type=module -e "import * as b from 'brevit'; console.log(Object.keys(b))"
cat node_modules/brevit/package.json | npx --yes json5 2>/dev/null || cat node_modules/brevit/package.json
```
Expected: prints the exported names (e.g. `BrevitClient`, `BrevitConfig`, `JsonOptimizationMode`) and `package.json` `main`/`module`/`exports`/`type`. **Record which names exist and whether the package is CJS or ESM** — Task 2 imports exactly these.

- [ ] **Step 3: Capture real encode output on a representative manifest-shaped object**

Create `/tmp/brevit-probe.mjs`:
```js
// Adjust the import to match the names found in Step 2.
import { BrevitClient, BrevitConfig, JsonOptimizationMode } from 'brevit';
const client = new BrevitClient(new BrevitConfig({ jsonMode: JsonOptimizationMode.Flatten }));
const sample = {
  manifestVersion: '1.2',
  components: [
    { name: 'Card', layer: 'molecule', styledProperties: [
      { figmaVariable: 'color/surface/brand-primary', unbound: false, rawValue: null },
      { figmaVariable: null, unbound: true, rawValue: '24px' },
    ] },
  ],
  tokens: { 'color/surface/brand-primary': { type: 'color', value: '#FF6E1D' } },
};
const encoded = await client.brevity(sample);
console.log('--- ENCODED ---'); console.log(encoded);
console.log('--- check for a decode/expand method ---');
console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(client)));
```
Run: `node /tmp/brevit-probe.mjs`
Expected: prints the flattened text (note the exact delimiters — `:` vs `=`, dotted paths, array tabular form) **and** the client's method names. **Record:** (a) does `color/surface/brand-primary` survive byte-exact in the output? (b) is there a decode/expand/inflate method? These two answers drive Task 2's decoder strategy.

- [ ] **Step 4: Commit the dependency**

```bash
git add package.json package-lock.json
git commit -m "build: add brevit dependency for token-efficient agent payloads"
```

---

### Task 2: Brevit wrapper module (`encode` + deterministic `decode` + round-trip guard)

**Files:**
- Create: `bin/lib/brevit.mjs`
- Test: `bin/lib/brevit.test.mjs`
- Modify: `package.json` (broaden the `test` glob to include `bin/**/*.test.mjs`)

**Design note — REVISED per Task 1 findings.** Task 1 proved: (1) `brevity()` is **async**; (2) brevit has **no decoder**; (3) `enableAbbreviations` defaults **true** (must be set false); (4) brevit **mangles nested arrays-of-objects to `"[object Object]"`** — so feeding a raw manifest slice loses data. Therefore the wrapper **pre-flattens** nested JSON into a flat scalar dict (`{ "components.0.styledProperties.0.figmaVariable": "color/surface/brand-primary", … }`), feeds THAT to brevit (clean `key:value` lines, no `[object Object]`), and owns a lossless `unflatten` for the round-trip guard + tooling decode. Scalars round-trip as strings (documented drift); `null`/empty-array/empty-object use sentinels so structure is exact. The guard compares `unflatten(parse(await encode(x)))` against a string-normalized twin of `x`; on any mismatch, `safeEncode` falls back to raw JSON. The decoder parses brevit's flat `key:value` output — calibrate value-escaping to the extra probe in Step 0 below.

- [ ] **Step 1: Write the failing test**

Create `bin/lib/brevit.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode, roundTrips, safeEncode } from './brevit.mjs';

test('encode produces non-JSON, shorter-or-equal text for a nested object', () => {
  const obj = { user: { name: 'John Doe', age: 30 } };
  const out = encode(obj);
  assert.equal(typeof out, 'string');
  assert.ok(!out.trim().startsWith('{'), 'should not be raw JSON');
});

test('decode is the inverse of encode for objects with figma variable paths (byte-exact path)', () => {
  const obj = { v: 'color/surface/brand-primary', unbound: true, raw: '24px' };
  const restored = decode(encode(obj));
  assert.equal(restored.v, 'color/surface/brand-primary'); // binding-rule-3 guard
  assert.equal(restored.unbound, true);
  assert.equal(restored.raw, '24px');
});

test('roundTrips returns true for a manifest-shaped payload', () => {
  const slice = { name: 'Card', layer: 'molecule',
    styledProperties: [{ figmaVariable: 'radius/lg', unbound: false }] };
  assert.equal(roundTrips(slice), true);
});

test('safeEncode falls back to raw JSON when the round-trip guard fails', () => {
  // A value containing the format delimiter is the classic failure case.
  const tricky = { note: 'has: a colon and\nnewline' };
  const out = safeEncode(tricky);
  // Either brevit handled it (guard passed) OR we fell back to valid JSON.
  const ok = roundTrips(tricky) || JSON.parse(out);
  assert.ok(ok);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test bin/lib/brevit.test.mjs`
Expected: FAIL — `Cannot find module './brevit.mjs'`.

- [ ] **Step 3: Implement the wrapper**

Create `bin/lib/brevit.mjs` (calibrate the import + `unflatten` delimiters to Task 1's findings):
```js
// Thin, dependency-isolated wrapper. Flatten mode ONLY; abbreviation OFF.
// decode() is our own deterministic un-flatten (brevit is encode-first).
import { BrevitClient, BrevitConfig, JsonOptimizationMode } from 'brevit';

const client = new BrevitClient(new BrevitConfig({
  jsonMode: JsonOptimizationMode.Flatten,
  abbreviation: false,
}));

/** Encode a JS value to Brevit flattened text. Throws only on a hard brevit error. */
export function encode(value) {
  // brevity() may be async in some builds; handle both.
  const out = client.brevity(value);
  return typeof out?.then === 'function' ? /* sync-callers use safeEncode */ JSON.stringify(value) : out;
}

/** Deterministic inverse of the Flatten format: `dotted.path:value` lines + `arr[N]{a,b}:` blocks. */
export function decode(text) {
  if (typeof text === 'string' && text.trim().startsWith('{')) return JSON.parse(text); // raw-JSON fallback payloads
  const root = {};
  const lines = text.split('\n').filter((l) => l.length > 0);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const arr = line.match(/^(.+)\[(\d+)\]\{([^}]*)\}:$/); // tabular array header
    if (arr) {
      const [, path, count, cols] = arr;
      const colNames = cols.split(',');
      const rows = [];
      for (let r = 0; r < Number(count); r++) {
        const cells = (lines[++i] ?? '').split(',');
        const row = {};
        colNames.forEach((c, idx) => { row[c] = coerce(cells[idx]); });
        rows.push(row);
      }
      setPath(root, path, rows);
      continue;
    }
    const idx = line.indexOf(':');
    const path = line.slice(0, idx);
    const val = line.slice(idx + 1);
    setPath(root, path, coerce(val));
  }
  return root;
}

function coerce(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  return v; // keep everything else as a string — type drift is documented, not invented
}

function setPath(obj, dotted, value) {
  const parts = dotted.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] ??= {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

/** Normalize for comparison: brevit stringifies scalars, so compare against a stringified twin. */
function normalize(value) {
  return JSON.parse(JSON.stringify(value), (k, v) =>
    typeof v === 'number' ? String(v) : v); // calibrate per Task 1 (drop if brevit preserves numbers)
}

/** True iff decode(encode(x)) reproduces x (modulo documented scalar→string drift). */
export function roundTrips(value) {
  try {
    const restored = decode(rawEncode(value));
    return deepEqual(restored, normalize(value));
  } catch { return false; }
}

function rawEncode(value) {
  const out = client.brevity(value);
  if (typeof out?.then === 'function') throw new Error('async brevity unsupported in sync path');
  return out;
}

/** Encode if it round-trips; otherwise fall back to raw JSON (never throws, never loses data). */
export function safeEncode(value) {
  try {
    if (roundTrips(value)) return rawEncode(value);
  } catch { /* fall through */ }
  return JSON.stringify(value);
}

function deepEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
```

> If Task 1 showed brevit's `brevity()` is **async**, change `encode`/`rawEncode`/`safeEncode`/`roundTrips` to `async` and `await` the call, and make the test functions `async`. If Task 1 showed brevit **does** ship a decoder, replace the body of `decode()` with a call to it and keep the same signature.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test bin/lib/brevit.test.mjs`
Expected: PASS (4 tests). If the `decode` byte-exact test fails, adjust the `unflatten` delimiters to match Task 1's captured output — the format, not the contract, is what calibrates.

- [ ] **Step 5: Wire `bin/**` into the test runner**

Modify `package.json` `scripts.test`:
```json
"test": "node --test 'workbench/**/*.test.mjs' 'bin/**/*.test.mjs'",
```

- [ ] **Step 6: Run the full suite + commit**

Run: `npm test`
Expected: existing workbench tests + the 4 brevit tests pass.
```bash
git add bin/lib/brevit.mjs bin/lib/brevit.test.mjs package.json
git commit -m "feat(fcc): brevit encode/decode wrapper with round-trip guard + JSON fallback"
```

---

### Task 3: `fcc brevit:encode` / `fcc brevit:decode` subcommands

**Files:**
- Modify: `bin/figma-code-composer.js` (KNOWN_COMMANDS list ~L113, HANDLERS map ~L127, help text ~L200, header comment ~L8)
- Test: `bin/lib/brevit-cli.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `bin/lib/brevit-cli.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = new URL('../figma-code-composer.js', import.meta.url).pathname;
const run = (args, input) =>
  execFileSync('node', [CLI, ...args], { input, encoding: 'utf8' });

test('brevit:encode then brevit:decode round-trips a JSON file through stdin', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fcc-brevit-'));
  const f = join(dir, 'in.json');
  writeFileSync(f, JSON.stringify({ a: { b: 'color/surface/x' }, n: true }));
  const encoded = run(['brevit:encode', f]);
  const decoded = run(['brevit:decode'], encoded); // decode reads stdin
  const obj = JSON.parse(decoded);
  assert.equal(obj.a.b, 'color/surface/x');
  assert.equal(obj.n, true);
});

test('brevit:encode --check exits 0 and is identity-safe when brevit is absent', () => {
  // Even if brevit import fails at runtime, the command must emit valid JSON and exit 0.
  const dir = mkdtempSync(join(tmpdir(), 'fcc-brevit-'));
  const f = join(dir, 'in.json');
  writeFileSync(f, JSON.stringify({ ok: 1 }));
  const out = run(['brevit:encode', '--check', f]);
  assert.ok(out.length > 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test bin/lib/brevit-cli.test.mjs`
Expected: FAIL — unknown command `brevit:encode`.

- [ ] **Step 3: Implement the handlers**

First read the exact dispatch block:
Run: `sed -n '108,155p' bin/figma-code-composer.js` (confirms KNOWN_COMMANDS array + HANDLERS map shape).

Add `"brevit:encode"` and `"brevit:decode"` to the KNOWN_COMMANDS array (~L113-122) and to HANDLERS (~L127-136):
```js
  "brevit:encode": runBrevitEncode,
  "brevit:decode": runBrevitDecode,
```

Add the handlers (near the other `run*` functions). Import at top of file:
```js
import { safeEncode, decode } from './lib/brevit.mjs';
import { readFileSync } from 'node:fs';

function readInput(argv) {
  const fileArg = argv.find((a) => !a.startsWith('-'));
  if (fileArg) return readFileSync(fileArg, 'utf8');
  return readFileSync(0, 'utf8'); // stdin
}

async function runBrevitEncode(argv) {
  let raw;
  try { raw = readInput(argv); } catch { console.error('brevit:encode — no input'); process.exit(2); }
  let value;
  try { value = JSON.parse(raw); }
  catch { process.stdout.write(raw); return; } // already non-JSON; pass through
  // Absent/broken brevit → safeEncode returns raw JSON. Never fatal.
  process.stdout.write(String(safeEncode(value)));
}

async function runBrevitDecode(argv) {
  let raw;
  try { raw = readInput(argv); } catch { console.error('brevit:decode — no input'); process.exit(2); }
  try { process.stdout.write(JSON.stringify(decode(raw))); }
  catch { process.stdout.write(raw); } // unparseable → pass through
}
```
> If `bin/lib/brevit.mjs` ended up async (Task 2 note), `await safeEncode(...)`.

Add help lines (header comment ~L8 and `printHelp` ~L200):
```
  brevit:encode              Flatten a JSON payload to Brevit wire format (round-trip-guarded)
  brevit:decode              Inflate a Brevit payload back to JSON (for tooling)
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test bin/lib/brevit-cli.test.mjs && node --check bin/figma-code-composer.js`
Expected: PASS + no syntax error.

- [ ] **Step 5: Commit**

```bash
git add bin/figma-code-composer.js bin/lib/brevit-cli.test.mjs
git commit -m "feat(fcc): brevit:encode / brevit:decode subcommands (graceful JSON fallback)"
```

---

### Task 4: Brevit protocol doc (`protocols/brevit.md`) + manifest cross-reference

**Files:**
- Create: `.figma-pipeline/protocols/brevit.md`
- Modify: `.figma-pipeline/protocols/figma-manifest.md` (add a "Wire format" note)
- Modify: `.figma-pipeline/protocols/cli.md` (document the two subcommands)

- [ ] **Step 1: Write the protocol**

Create `.figma-pipeline/protocols/brevit.md` with these exact sections:
```markdown
# Brevit wire-format protocol

Brevit (`npm install brevit`, JSON **Flatten** mode) is the token-efficient **wire format** for
inter-agent payloads. It is NOT a storage format.

## Encode set (Brevit-encode these in-context handoffs)
- Builder directive slices passed in an `Agent` spawn prompt.
- The `buildPlan` (coordinator → builders).
- Specialist return contracts (builder → coordinator final message).
- In-context KG stage payloads.

## Never-encode set (stay raw JSON on disk — `jq`/`fcc` parse them)
- `/tmp/figma-<runId>/manifest.json` (canonical manifest).
- `costs.jsonl`, `lessons.md`, KG ledger entries, all `config.*` files.

## Hard rules
1. **Flatten mode only. Abbreviation OFF.** Text (TextRank) and image (OCR) modes are FORBIDDEN on
   any pipeline payload — they are lossy and would destroy Figma variable paths.
2. **Round-trip guard.** Every encode goes through `fcc brevit:encode` (which uses `safeEncode`):
   if `decode(encode(x)) != x`, it falls back to raw JSON for that payload and the agent flags it.
3. **Binding-rule-3 guard.** Brevit MUST round-trip Figma variable paths (e.g.
   `color/surface/brand-primary`) byte-exact. A path that fails the guard forces raw-JSON fallback —
   never a silently mangled path.
4. **Graceful degradation.** If `brevit` is absent/broken, `fcc brevit:*` is identity passthrough
   (raw JSON). A missing brevit never breaks a build.

## Usage
- Encode a slice: `fcc brevit:encode slice.json` → wire text injected into the spawn prompt.
- Decode for tooling: `fcc brevit:decode < payload.brevit` → JSON.
```

- [ ] **Step 2: Cross-reference from the manifest protocol**

Add to `.figma-pipeline/protocols/figma-manifest.md` (near the top, after the single-source-of-truth statement) the line:
```markdown
> **Canonical vs wire form.** The manifest's canonical form is JSON on disk (`manifest.json`).
> Its *wire* form for in-context slices MAY be Brevit-flattened — see `protocols/brevit.md`.
> Brevit must round-trip variable paths byte-exact (binding rule 3); on guard failure, slices fall
> back to raw JSON.
```

- [ ] **Step 3: Document subcommands in cli.md**

Add to `.figma-pipeline/protocols/cli.md` a section:
```markdown
## `fcc brevit:encode [file]` / `fcc brevit:decode [file]`

Flatten/inflate a JSON payload to/from the Brevit wire format (`protocols/brevit.md`). Reads `file`
or stdin; writes to stdout. `--check` runs the round-trip guard. Absent/broken brevit → identity
passthrough (raw JSON), exit 0. Never mutates config.
```

- [ ] **Step 4: Verify + commit**

Run:
```bash
test -f .figma-pipeline/protocols/brevit.md && echo OK
grep -q "Flatten mode only" .figma-pipeline/protocols/brevit.md && echo RULES_OK
grep -q "Canonical vs wire form" .figma-pipeline/protocols/figma-manifest.md && echo XREF_OK
grep -q "brevit:encode" .figma-pipeline/protocols/cli.md && echo CLI_OK
```
Expected: `OK RULES_OK XREF_OK CLI_OK`.
```bash
git add .figma-pipeline/protocols/brevit.md .figma-pipeline/protocols/figma-manifest.md .figma-pipeline/protocols/cli.md
git commit -m "docs(protocols): brevit wire-format protocol + manifest/cli cross-references"
```

---

## Phase 2 — MCP hardening (WS-D)

### Task 5: Ban subprocess re-entry + clean abort on scoping error (coordinator + fetcher)

**Files:**
- Modify: `.claude/agents/figma-coordinator.md` (§ Never list ~L177-183; § Pre-flight step 0 ~L60; Protocol step 12 error table ~L117-125)
- Modify: `.claude/agents/figma-fetcher.md` (Protocol step 0 ~L36-39)
- Modify: `.cursor/prompts/*` mirror if a coordinator/fetcher mirror exists (check first)

- [ ] **Step 1: Add the hard "Never" to the coordinator**

In `.claude/agents/figma-coordinator.md` § Never, add a bullet:
```markdown
- **Never invoke `claude`, `claude --agent`, or any CLI that re-enters Claude Code from Bash.**
  Specialists run ONLY via the `Agent` tool. (A subprocess has no MCP tools in scope and gets killed
  by any `timeout` wrapper — this was the proven cause of a fully wasted trial run.)
```

- [ ] **Step 2: Add the scoping-error abort row to the error-classification table**

In `.claude/agents/figma-coordinator.md` Protocol step 12 table, add:
```markdown
    | `No such tool available` (MCP not in scope) | HARD ABORT code 3. Do NOT retry, do NOT shell out. |
```

- [ ] **Step 3: Harden the fetcher's reachability step**

In `.claude/agents/figma-fetcher.md` Protocol step 0, after the "Both fail → return reachabilityStatus: fail" bullet, add:
```markdown
   - **Never self-respawn via Bash.** If MCP tools are unreachable, do NOT attempt
     `claude --agent figma-fetcher --print` or any subprocess — you have no MCP scope there and the
     run wrapper will kill it. Return `reachabilityStatus: "fail"` (code 3) and stop.
   - **One transient retry.** Before declaring `fail`, retry the `get_metadata` probe once after a
     short backoff (covers a genuine transport hiccup); only a second failure returns `fail`.
```

- [ ] **Step 4: Verify**

Run:
```bash
grep -q "re-enters Claude Code from Bash" .claude/agents/figma-coordinator.md && echo NEVER_OK
grep -q "No such tool available" .claude/agents/figma-coordinator.md && echo ABORT_OK
grep -q "Never self-respawn via Bash" .claude/agents/figma-fetcher.md && echo FETCHER_OK
```
Expected: `NEVER_OK ABORT_OK FETCHER_OK`.

- [ ] **Step 5: Commit**

```bash
git add .claude/agents/figma-coordinator.md .claude/agents/figma-fetcher.md
git commit -m "fix(agents): ban subprocess MCP re-entry; clean abort on No such tool available"
```

---

### Task 6: Workbench guard — degraded manifests are failed trials, never scored

**Files:**
- Modify: `workbench/runner/run-manifest-builder.mjs`
- Test: `workbench/runner/run-manifest-builder.test.mjs` (existing)

- [ ] **Step 1: Read the existing builder + test to match style**

Run: `sed -n '1,60p' workbench/runner/run-manifest-builder.mjs` and `sed -n '1,40p' workbench/runner/run-manifest-builder.test.mjs`
Expected: learn the exported function name(s) and the manifest object shape the test uses.

- [ ] **Step 2: Write the failing test**

Append to `workbench/runner/run-manifest-builder.test.mjs` (use the real exported validator name found in Step 1 — shown here as `isScorableTrial`):
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isScorableTrial } from './run-manifest-builder.mjs';

test('manifest without reachabilityStatus:ok is not scorable', () => {
  assert.equal(isScorableTrial({ manifest: { manifestVersion: '1.2' } }), false);
  assert.equal(isScorableTrial({ manifest: { reachabilityStatus: 'fail' } }), false);
});

test('manifest with reachabilityStatus:ok is scorable', () => {
  assert.equal(isScorableTrial({ manifest: { reachabilityStatus: 'ok', manifestVersion: '1.2' } }), true);
});

test('scratch dir markers of a degraded fallback make a trial non-scorable', () => {
  assert.equal(isScorableTrial({
    manifest: { reachabilityStatus: 'ok' },
    scratchFiles: ['contract.json', 'mcp-probe.sh'],
  }), false);
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `node --test workbench/runner/run-manifest-builder.test.mjs`
Expected: FAIL — `isScorableTrial` not exported.

- [ ] **Step 4: Implement the guard**

Add to `workbench/runner/run-manifest-builder.mjs`:
```js
const DEGRADED_MARKERS = ['contract.json', 'mcp-probe.sh', 'mcp-call.sh'];

/** A trial is scorable only if the fetch reached MCP and left no degraded-fallback markers. */
export function isScorableTrial({ manifest, scratchFiles = [] } = {}) {
  if (!manifest || manifest.reachabilityStatus !== 'ok') return false;
  if (scratchFiles.some((f) => DEGRADED_MARKERS.includes(f))) return false;
  return true;
}
```
Then call it at the point where a trial's manifest is accepted for scoring (find where the builder returns/collects a trial; gate scoring on `isScorableTrial(...)`, logging skipped trials with a reason rather than scoring fabricated manifests).

- [ ] **Step 5: Run to verify it passes**

Run: `npm test`
Expected: all pass including the 3 new ones.

- [ ] **Step 6: Commit**

```bash
git add workbench/runner/run-manifest-builder.mjs workbench/runner/run-manifest-builder.test.mjs
git commit -m "feat(workbench): guard — degraded/non-reachable manifests are failed trials, never scored"
```

---

## Phase 3 — Think-once layer (WS-C)

### Task 7: Document the `buildPlan` schema in the manifest protocol

**Files:**
- Modify: `.figma-pipeline/protocols/figma-manifest.md` (new "§ buildPlan" section)

- [ ] **Step 1: Add the schema section**

Append to `.figma-pipeline/protocols/figma-manifest.md`:
```markdown
## § buildPlan (coordinator-produced, Step 8.5)

The coordinator's think-once pass emits ONE `buildPlan` per run, derived from the validated manifest.
It is the decided execution contract; builders execute it and do not re-derive its fields.

```jsonc
{
  "runId": "20260606-1200-heroui",
  "components": [{
    "name": "Card",
    "resolvedLayer": "organism",          // final layer (NOT the fetcher's raw guess)
    "layerConfidence": "high",            // "high" | "medium" | "low"
    "apiShape": "compound",               // "props" | "compound" | "discriminated-union"
    "renderMode": "server",               // "client" if state/effects/handlers present, else "server"
    "requiredA11y": ["labelledby-on-region"],
    "tokenBindings": ["color/surface/brand-primary", "radius/lg"],
    "unboundDecision": "skip",            // "bind" | "skip" | "approved-inline" (per Step 3 gate)
    "dropPolicy": "surface-to-attention", // how to report any collapsed affordance
    "compose": []                         // reuse imports when a KG hit resolved the component
  }],
  "icons":  [{ "name": "CircleCheck", "fillModel": "currentColor", "a11y": "decorative-or-labelled" }],
  "tokens": { "scope": "full-variable", "modes": ["light","dark"] }
}
```

Fields a directive omits are the builder's to derive; a present field is authoritative and MUST NOT
be re-decided. The buildPlan is passed to builders in Brevit wire form (`protocols/brevit.md`).
```

- [ ] **Step 2: Verify + commit**

Run: `grep -q "§ buildPlan" .figma-pipeline/protocols/figma-manifest.md && grep -q "resolvedLayer" .figma-pipeline/protocols/figma-manifest.md && echo OK`
Expected: `OK`.
```bash
git add .figma-pipeline/protocols/figma-manifest.md
git commit -m "docs(protocol): define buildPlan schema for the think-once layer"
```

---

### Task 8: Add Step 8.5 "think-once" to the coordinator

**Files:**
- Modify: `.claude/agents/figma-coordinator.md` (insert Step 8.5 between Step 8 ~L98 and Step 9 ~L100; update Step 9 to pass directive slices)

- [ ] **Step 1: Insert the think-once step**

In `.claude/agents/figma-coordinator.md`, immediately after Protocol Step 8 ("Branch by scope"), insert:
```markdown
8.5. **Think once — produce the `buildPlan` (the single reasoning pass; see `protocols/figma-manifest.md` § buildPlan).**
   This is the ONE place the pipeline reasons about *what each component is*. Do it here, in your
   already-cached context — do NOT push this thinking down into the builders.

   For every scheduled component and icon, decide and record:
   - `resolvedLayer` + `layerConfidence` — take the fetcher's `layer`/`layerConfidence`; if confidence
     is `low`, resolve it now using `protocols/component-layout.md` § Layer resolution (child depth,
     form-control children, button-rows, full-canvas). This is the off-by-one fix's decision point.
   - `apiShape` — `compound` when the node has repeated optional sub-regions (header/body/footer);
     `discriminated-union` when variant props are mutually exclusive; else `props`.
   - `renderMode` — `client` iff the component needs state/effects/handlers; else `server`.
   - `requiredA11y` — e.g. icon-only buttons need a label; labelled regions need `aria-labelledby`.
   - `tokenBindings` — the bound Figma variable paths the component consumes.
   - `unboundDecision` — `skip` by default (per the Step 3 unbound gate); `approved-inline` only if the
     user explicitly approved inlining this run; never `bind` a value you invented.
   - `dropPolicy` — `surface-to-attention` (collapsed affordances are reported, never silent).

   Write the `buildPlan` to `/tmp/figma-<runId>/build-plan.json` (canonical JSON). You pass it to
   builders in Brevit wire form (next step).
```

- [ ] **Step 2: Make dispatch pass directive slices (Brevit-encoded)**

In Step 9 ("Dispatch"), add a bullet under the adapter-excerpt bullet:
```markdown
   - **Pass each builder its `buildPlan` directive, Brevit-encoded.** Build the per-component slice
     (manifest slice + its `buildPlan` entry + adapterExcerpts), write it to
     `/tmp/figma-<runId>/slice-<name>.json`, then inject `fcc brevit:encode /tmp/figma-<runId>/slice-<name>.json`
     into the spawn prompt instead of raw JSON. Builders read the flattened directive directly
     (`protocols/brevit.md`); the canonical JSON slice stays on disk. If `fcc brevit:encode` reports a
     round-trip fallback, the raw JSON is used for that slice (still correct, just larger).
```

- [ ] **Step 3: Verify + commit**

Run:
```bash
grep -q "Think once — produce the" .claude/agents/figma-coordinator.md && echo STEP_OK
grep -q "Brevit-encoded" .claude/agents/figma-coordinator.md && echo SLICE_OK
```
Expected: `STEP_OK SLICE_OK`.
```bash
git add .claude/agents/figma-coordinator.md
git commit -m "feat(coordinator): Step 8.5 think-once buildPlan + Brevit directive slices"
```

---

### Task 9: Builders execute the directive — stop re-deriving

**Files:**
- Modify: `.claude/agents/component-builder.md`, `.claude/agents/icon-generator.md`, `.claude/agents/story-author.md`, `.claude/agents/test-author.md`

- [ ] **Step 1: Add the "execute the directive" rule to each builder**

To each of the four files, near the top of its Protocol / Inputs section, add (adjust the field list per agent — component-builder gets all; icon-generator gets `fillModel`/`a11y`; story/test get `resolvedLayer`/`apiShape`):
```markdown
## Execute the directive — do not re-reason

Your slice carries a `buildPlan` directive (`protocols/figma-manifest.md` § buildPlan), Brevit-encoded
(`protocols/brevit.md` — read the flattened `key.path:value` form directly; do not ask for JSON).
**The directive's fields are decided. Execute them; do NOT re-derive them:**
`resolvedLayer`, `apiShape`, `renderMode`, `requiredA11y`, `unboundDecision`, `dropPolicy`.
Re-derive ONLY what the directive omits. If a field you need is missing, derive it and note it in
your return `notes` — do not silently override a field that IS present.
```

- [ ] **Step 2: Verify + commit**

Run:
```bash
for f in component-builder icon-generator story-author test-author; do
  grep -q "Execute the directive" .claude/agents/$f.md && echo "$f OK" || echo "$f MISSING";
done
```
Expected: four `OK` lines.
```bash
git add .claude/agents/component-builder.md .claude/agents/icon-generator.md .claude/agents/story-author.md .claude/agents/test-author.md
git commit -m "feat(builders): execute buildPlan directive; stop re-deriving layer/api/render-mode"
```

---

## Phase 4 — Full-DS token capture + real layering (WS-E)

### Task 10: Fetcher full-variable-collection mode

**Files:**
- Modify: `.claude/agents/figma-fetcher.md` (Protocol step 4 "Variables" ~L43; add a mode branch)

- [ ] **Step 1: Add the full-variable mode**

In `.claude/agents/figma-fetcher.md`, replace/extend Protocol step 4 ("Variables") with:
```markdown
4. **Variables.**
   - **Node-scoped (default, component builds):** `get_variable_defs` for the variables the walked
     nodes bind. Preserve original paths verbatim. Per variable: `{ type, value (default mode), modes? }`.
   - **Full-variable mode (`scope ∈ {tokens-only, full}` on a design-system build):** enumerate ALL
     collections and ALL modes — not just the variables this node binds. This is the fix for the
     "~25% of one mode" token collapse: a DS build must capture the whole variable space (every mode,
     every collection: colors, spacing, radius, shadows/effects, easing, typography). Cap at a sane
     ceiling (e.g. 1000 variables); exceeding it emits a non-blocking ambiguity with the count.
   - **Never resolve a variable to a hex/rem — preserve the path** (binding rule 3).
```

- [ ] **Step 2: Verify + commit**

Run: `grep -q "Full-variable mode" .claude/agents/figma-fetcher.md && echo OK`
Expected: `OK`.
```bash
git add .claude/agents/figma-fetcher.md
git commit -m "feat(fetcher): full variable-collection mode for design-system token builds"
```

---

### Task 11: Token-builder emits three real layers + theme modes + all token types

**Files:**
- Modify: `.claude/agents/token-builder.md` (Protocol step 6 "Emit per strategy" ~L46; step 8 "Theming" ~L56)
- Modify: `.figma-pipeline/protocols/token-strategy.md`

- [ ] **Step 1: Replace the collapsed emission with three-layer emission**

In `.claude/agents/token-builder.md`, augment Protocol step 6 with a sub-section (for `tailwind-css-vars` / `css-custom-properties`):
```markdown
   **Three-layer emission (kill the hollow-file bug).** A design-system token build MUST emit, not collapse:
   1. `primitives.css` — raw values only (`--<prefix><id>: <value>;`).
   2. `semantic.css` — semantic aliases that reference primitives via `var()`:
      `--color-surface-foreground: var(--<prefix>foreground);`. NEVER emit this file as an empty
      `:root {}` no-op — that was the report-05 defect. If the manifest has no semantic layer, derive
      aliases from the Figma semantic variable names (they pair `surface`/`surface-foreground` etc.).
   3. `@theme inline { … }` bridge — maps each `--<token>` into the Tailwind `--color-*`/`--radius-*`/
      `--shadow-*` namespace over the `var()` chain so utilities stay theme-reactive.
```

- [ ] **Step 2: Cover all token types (the dropped `blur`/effect)**

In step 6, add:
```markdown
   **Token-type coverage.** Map every fetched variable `type`, not just colors:
   `color → --color-*`, `dimension/spacing → --spacing-*`, `radius → --radius-*`,
   `effect/shadow → --shadow-*`, `blur → --blur-*`, `easing → --ease-*`, `fontWeight → --font-weight-*`.
   A fetched variable that maps to none of these is recorded in `skipped[]` with a reason — NEVER
   silently dropped (the report-05 `blur` loss).
```

- [ ] **Step 3: Strengthen theming for multi-mode**

In step 8 ("Theming"), ensure:
```markdown
8. **Theming.** Single-mode → `:root`. Multi-mode (full-variable DS build) → `default` mode to
   `:root`, EACH other Figma mode to `[data-theme="<mode>"]` (CSS) or one JS export per mode. A DS
   build that captured `light`+`dark` MUST emit both — never just the default mode.
```

- [ ] **Step 4: Mirror into token-strategy.md**

Add a "Three-layer DS emission" note to `.figma-pipeline/protocols/token-strategy.md` summarizing the primitives → semantic(`var()`) → `@theme inline` chain and the per-mode `[data-theme]` blocks.

- [ ] **Step 5: Verify + commit**

Run:
```bash
grep -q "Three-layer emission" .claude/agents/token-builder.md && echo LAYERS_OK
grep -q "Token-type coverage" .claude/agents/token-builder.md && echo TYPES_OK
grep -q "data-theme" .claude/agents/token-builder.md && echo THEME_OK
```
Expected: `LAYERS_OK TYPES_OK THEME_OK`.
```bash
git add .claude/agents/token-builder.md .figma-pipeline/protocols/token-strategy.md
git commit -m "feat(token-builder): three real layers + per-mode theming + full token-type coverage"
```

---

## Phase 5 — Accuracy fixes (WS-F)

### Task 12: Intent-based layer classification

**Files:**
- Modify: `.figma-pipeline/protocols/component-layout.md` (§ Layer resolution)
- Modify: `.claude/agents/figma-fetcher.md` (step 6 classify; add `layerConfidence`)
- Modify: `.figma-pipeline/protocols/figma-manifest.md` (note `layer` advisory + `layerConfidence`)

- [ ] **Step 1: Rewrite the layer heuristic**

In `.figma-pipeline/protocols/component-layout.md` § Layer resolution, replace the structural heuristic with intent-based signals:
```markdown
Resolve `layer` from INTENT signals, not just node depth:
- A leaf control (button, input, single icon+label) → **atom**.
- Contains ≥1 form-control child (input/select/checkbox) OR composes ≥2 atoms → **molecule**.
- Contains a button-row / multiple distinct regions / a labelled section → **organism**.
- A full-canvas frame (page-sized) or a composed multi-organism screen → **template**.
- A routed screen with navigation/layout chrome → **page**.

Emit `layerConfidence`: `high` when one signal clearly dominates; `medium` when two tiers are
plausible; `low` when the structure is flat/ambiguous. A `low` confidence is a flag for the
coordinator's think-once pass to resolve — it is NOT a silent down-grade (the Input/Card/Form
off-by-one came from grading flat trees down).
```

- [ ] **Step 2: Record `layerConfidence` in the fetcher**

In `.claude/agents/figma-fetcher.md` step 6 (Components), add: "Record `layerConfidence` (`high|medium|low`) per `protocols/component-layout.md`; surface `low` as a non-blocking ambiguity."

- [ ] **Step 3: Note advisory status in the manifest protocol**

Add to `.figma-pipeline/protocols/figma-manifest.md`: "`components[].layer` is **advisory** — the coordinator's think-once pass (Step 8.5) sets the authoritative `resolvedLayer`. `components[].layerConfidence` is `high|medium|low`."

- [ ] **Step 4: Verify + commit**

Run:
```bash
grep -q "INTENT signals" .figma-pipeline/protocols/component-layout.md && echo LAYOUT_OK
grep -q "layerConfidence" .claude/agents/figma-fetcher.md && echo FETCHER_OK
grep -q "advisory" .figma-pipeline/protocols/figma-manifest.md && echo MANIFEST_OK
```
Expected: `LAYOUT_OK FETCHER_OK MANIFEST_OK`.
```bash
git add .figma-pipeline/protocols/component-layout.md .claude/agents/figma-fetcher.md .figma-pipeline/protocols/figma-manifest.md
git commit -m "fix(classification): intent-based layer resolution + layerConfidence (off-by-one fix)"
```

---

### Task 13: component-builder — client/server, zero-TODO, compound/union, a11y, no placeholder copy

**Files:**
- Modify: `.claude/agents/component-builder.md`

- [ ] **Step 1: Add the render-mode self-grep**

Add to `.claude/agents/component-builder.md` (a "Mandatory post-write self-check" sub-section, extending the existing unbound rule at ~L42):
```markdown
- **Render mode.** Honor `buildPlan.renderMode`. If `client` (or your emitted file contains
  `useState`/`useEffect`/`useReducer`/a stateful event handler) and the framework is React with an
  App-Router/RSC default, the FIRST line of the file MUST be `"use client";`. Self-grep your output
  before returning; a stateful file without the directive is a hard self-fail → fix before emit.
- **Zero `TODO[figma-bind]` / `TODO[figma-unbound]`.** Reaffirmed: an unbound (non-`intentionalLiteral`)
  value is `skipped[]`, never inlined with a TODO. (Negative example — the report-04 Card defect:
  `h-6`, `right-2.5`, `size-14` inlined with `// TODO[figma-bind]` is FORBIDDEN.)
- **API shape.** Honor `buildPlan.apiShape`: `compound` → export sub-components (e.g.
  `CardHeader`/`CardFooter`) and compose, do NOT hide regions behind `show*` booleans;
  `discriminated-union` → a discriminated prop union, not a 30-prop bag.
- **A11y.** Honor `buildPlan.requiredA11y`. An icon-only control MUST require/emit an accessible name
  (typed-required `aria-label`); refuse to emit an unlabeled icon-only button.
- **No placeholder copy.** Never bake Figma placeholder strings (e.g. `title="This is an alert"`) as
  default prop values — they are sample data, not defaults.
```

- [ ] **Step 2: Verify + commit**

Run:
```bash
grep -q '"use client";' .claude/agents/component-builder.md && echo CLIENT_OK
grep -q "Zero .TODO.figma-bind" .claude/agents/component-builder.md && echo TODO_OK
grep -q "No placeholder copy" .claude/agents/component-builder.md && echo COPY_OK
```
Expected: `CLIENT_OK TODO_OK COPY_OK`.
```bash
git add .claude/agents/component-builder.md
git commit -m "fix(component-builder): client-directive, zero-TODO, compound/union, a11y, no placeholder copy"
```

---

### Task 14: React adapter — never narrow native unions; `"use client"` hard rule

**Files:**
- Modify: `.figma-pipeline/adapters/frameworks/react.md`

- [ ] **Step 1: Read the adapter to find the Props/State sections**

Run: `grep -nE "Props|State|client|Omit|Gotcha" .figma-pipeline/adapters/frameworks/react.md`

- [ ] **Step 2: Add the two rules**

Add to the Props convention section:
```markdown
- **Never narrow a native HTML attribute union.** Extend native props; do NOT
  `Omit<…, "type">`-and-re-add a subset (that deletes `email`/`url`/`tel`/`search`/`date` — the
  report-04 Input defect). To *react* to a value, branch on it internally without removing it from the
  public type.
```
Promote the client rule to a hard checklist item:
```markdown
- **`"use client"` is mandatory** (App-Router/RSC) for any file using `useState`/`useEffect`/
  `useReducer`/stateful handlers — first line of the file. This is a checklist item, not a gotcha.
```

- [ ] **Step 3: Verify + commit**

Run:
```bash
grep -q "Never narrow a native HTML attribute union" .figma-pipeline/adapters/frameworks/react.md && echo UNION_OK
grep -q 'client.*is mandatory' .figma-pipeline/adapters/frameworks/react.md && echo CLIENT_OK
```
Expected: `UNION_OK CLIENT_OK`.
```bash
git add .figma-pipeline/adapters/frameworks/react.md
git commit -m "fix(react-adapter): never narrow native attribute unions; use-client hard checklist"
```

---

### Task 15: icon-generator a11y fix + barrel normalization; tailwind-v4 scale utilities

**Files:**
- Modify: `.claude/agents/icon-generator.md`
- Modify: `.figma-pipeline/adapters/css/tailwind-v4.md`

- [ ] **Step 1: Fix the icon a11y contradiction + barrel exports**

Add to `.claude/agents/icon-generator.md`:
```markdown
- **A11y (resolve the `aria-hidden`/`aria-label` contradiction).** An icon is decorative OR labelled,
  never both: if `aria-label`/`title` is provided → set `role="img"` and OMIT `aria-hidden`;
  otherwise → `aria-hidden="true"` with no `role`. Do NOT hardcode `aria-hidden="true"` on a component
  that also accepts `aria-label` (the report-04 dead-label defect).
- **Barrel export consistency.** Every icon export uses the SAME form in `index.ts` (named
  re-exports: `export { CircleCheckIcon } from "./CircleCheckIcon";`). Mixing default and named
  re-exports broke the render build (report-08).
```

- [ ] **Step 2: Tailwind-v4 scale-utility preference**

Add to `.figma-pipeline/adapters/css/tailwind-v4.md`:
```markdown
- **Prefer named scale utilities over arbitrary brackets.** Use `shadow-field`/`rounded-3xl` over
  `shadow-[…]`/arbitrary `[12px]` when a token-backed scale utility exists. Arbitrary brackets are a
  last resort for genuinely one-off values, and only when the value is bound (never for unbound).
```

- [ ] **Step 3: Verify + commit**

Run:
```bash
grep -q "decorative OR labelled" .claude/agents/icon-generator.md && echo A11Y_OK
grep -q "Barrel export consistency" .claude/agents/icon-generator.md && echo BARREL_OK
grep -q "named scale utilities" .figma-pipeline/adapters/css/tailwind-v4.md && echo TW_OK
```
Expected: `A11Y_OK BARREL_OK TW_OK`.
```bash
git add .claude/agents/icon-generator.md .figma-pipeline/adapters/css/tailwind-v4.md
git commit -m "fix(icons/tailwind): icon a11y + barrel consistency; prefer named scale utilities"
```

---

## Phase 6 — Wizard: Brevit install + opt-in DS build (WS-A install, WS-G)

### Task 16: config schema — add `brevit` block + `figma.dsUrl`

**Files:**
- Modify: `.figma-pipeline/config.schema.json`
- Modify: `.figma-pipeline/config.example.json`

- [ ] **Step 1: Add the `brevit` property + `figma.dsUrl`**

In `.figma-pipeline/config.schema.json`, add a `brevit` object property (sibling to where `rtk` used to be) and a `dsUrl` string under `figma`:
```jsonc
"brevit": {
  "type": "object",
  "description": "Brevit token-efficient wire format for inter-agent payloads (protocols/brevit.md). Flatten mode only.",
  "properties": {
    "installed":    { "type": "boolean", "description": "True when `brevit` is a project dependency." },
    "version":      { "type": "string" },
    "enabled":      { "type": "boolean", "default": true },
    "mode":         { "type": "string", "enum": ["flatten"], "default": "flatten" },
    "abbreviation": { "type": "boolean", "enum": [false], "default": false }
  }
}
```
Under the `figma` object's `properties`, add:
```jsonc
"dsUrl": { "type": "string", "description": "Optional Figma design-system URL recorded at init for the token-system build." }
```

- [ ] **Step 2: Mirror into the example config**

Add a matching `brevit` block to `.figma-pipeline/config.example.json`:
```json
"brevit": { "installed": true, "version": "0.0.0", "enabled": true, "mode": "flatten", "abbreviation": false }
```

- [ ] **Step 3: Validate + commit**

Run: `npm run validate:config`
Expected: ajv reports the example valid against the schema.
```bash
git add .figma-pipeline/config.schema.json .figma-pipeline/config.example.json
git commit -m "feat(config): add brevit block + figma.dsUrl to the schema"
```

---

### Task 17: Wizard — install Brevit + opt-in DS token build

**Files:**
- Modify: `.claude/agents/wizard.md` (new Step 7.55 Brevit install; new Step 7.9 DS-build toggle; Step 8 report line)
- Modify: `.claude/commands/init-figma-compose.md` (step list)
- Modify: `.cursor/prompts/wizard.md` (mirror)

- [ ] **Step 1: Add the Brevit install step**

In `.claude/agents/wizard.md`, after Step 7.5 (skills), add:
```markdown
### Step 7.55 — Brevit install (token-efficient wire format)

Unlike RTK/Graphify (user-level, detect-only), Brevit is a **project dependency** — install it:
1. `npm install brevit` (or the project's package manager — pnpm/yarn/bun — detected from the lockfile).
2. Record `config.brevit = { installed: true, version: <from package.json>, enabled: true, mode: "flatten", abbreviation: false }`.
3. Failure (no network / install error) → record `{ installed: false, enabled: false }` and surface:
   `"brevit not installed — agent payloads will use raw JSON (no token savings). Run npm install brevit later and re-run /init-figma-compose."` Do NOT abort the wizard.
```

- [ ] **Step 2: Add the opt-in DS-build toggle**

After Step 7.8 (.gitignore), before Step 8 (report), add:
```markdown
### Step 7.9 — Build the design system from Figma (opt-in)

Greenfield only (no existing tokens on disk). Two prompts (one `AskUserQuestion` each):
- **Q-ds-url** — "Figma design-system URL? (builds your token system from Figma variables — leave
  blank to skip)". Blank → skip the rest of this step. Non-blank → record `config.figma.dsUrl`.
- **Q-build-now** — "Build the token system now?" yes/no.
  - **Yes** → run the full-variable token build as the closing onboarding step: spawn `figma-fetcher`
    with `{ url: dsUrl, scope: "tokens-only" }` (full-variable mode), then `token-builder`. This is the
    ONE place the wizard orchestrates a build — gated behind explicit opt-in.
  - **No** → record `config.figma.dsUrl` only; the final report ends with `Next: /figma-tokens <dsUrl>`.

This preserves the wizard's verify-don't-build posture when declined.
```

- [ ] **Step 3: Add the Brevit + DS lines to the Step 8 report block**

In `.claude/agents/wizard.md` Step 8 report template, add lines:
```markdown
  Brevit:         <installed ? "✓ v<version> (flatten, wire-format)" : "not installed — payloads use raw JSON">
  Design system:  <dsUrl ? (builtNow ? "built from <dsUrl>" : "recorded — run /figma-tokens <dsUrl>") : "—">
```

- [ ] **Step 4: Mirror the step list into the command + cursor prompt**

In `.claude/commands/init-figma-compose.md`, add the Brevit-install and opt-in DS-build steps to the numbered list. In `.cursor/prompts/wizard.md`, add the matching `11.x` mirror steps.

- [ ] **Step 5: Verify + commit**

Run:
```bash
grep -q "Step 7.55 — Brevit install" .claude/agents/wizard.md && echo BREVIT_OK
grep -q "Step 7.9 — Build the design system" .claude/agents/wizard.md && echo DS_OK
grep -q "verify-don't-build posture when declined" .claude/agents/wizard.md && echo POSTURE_OK
```
Expected: `BREVIT_OK DS_OK POSTURE_OK`.
```bash
git add .claude/agents/wizard.md .claude/commands/init-figma-compose.md .cursor/prompts/wizard.md
git commit -m "feat(wizard): install brevit; opt-in design-system token build from Figma"
```

---

## Phase 7 — Sync docs + validate the whole

### Task 18: Refresh PIPELINE.md coverage + final repo validation

**Files:**
- Modify: `.figma-pipeline/PIPELINE.md` (repo map: add `brevit` to protocols list; mention think-once)

- [ ] **Step 1: Update the protocols list + a one-line think-once mention**

In `.figma-pipeline/PIPELINE.md` repo-map row for `protocols/`, add `brevit` to the parenthesized list. Add to the pipeline one-liner that the coordinator runs a single think-once `buildPlan` pass before dispatch.

- [ ] **Step 2: Full validation sweep**

Run:
```bash
npm test
npm run validate:config
node --check bin/figma-code-composer.js
jq . .figma-pipeline/config.schema.json >/dev/null && echo SCHEMA_OK
grep -rniI --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=trials --exclude-dir=bodies 'rtk' . | grep -vi 'redux\|RTK Query\|Legacy Redux\|next-app-router' || echo "NO_RTK_OK"
```
Expected: all tests pass, config valid, JS parses, `SCHEMA_OK`, `NO_RTK_OK`.

- [ ] **Step 3: Commit**

```bash
git add .figma-pipeline/PIPELINE.md
git commit -m "docs(pipeline): document brevit protocol + think-once buildPlan in coverage"
```

---

## Phase 8 — Validate against the workbench (acceptance)

### Task 19: Re-run the HeroUI ladder and compare to the 20260603 baseline

> This is the empirical proof of the goals. It needs a live Figma MCP + the workbench runner; treat as an operator step, not an automated unit test.

- [ ] **Step 1: Re-run a representative rung (e.g. `all-icons`, the token-heavy one)**

Run the workbench trial for the HeroUI Alert/all-icons rung per `workbench/trials/heroui-20260603/STEPS.md` (the resume script the user referenced: `source workbench/trials/heroui-20260603/resume-trial.sh`), into a NEW dated trial dir (do not overwrite `heroui-20260603`).

- [ ] **Step 2: Compare against the baseline**

Build the report (`npm run workbench:report`) and check, vs `workbench/reports/heroui-20260603/report.md`:
- Total tokens on the re-reasoning-heavy rungs ↓ (target ~80%).
- Build gate ✓ on all rungs (Input client + Form className-merge fixed).
- `semantic.css` non-empty; token count ≥ oracle across modes.
- No manifest with `reachabilityStatus != "ok"` was scored; no `claude --agent` subprocess in the bodies.
- Brevit round-trip guard green on every encoded payload (no unexpected raw-JSON fallbacks).

- [ ] **Step 3: Record results**

Write a short `workbench/reports/<new-date>/analysis/00-index.md` delta vs baseline. Commit the new report dir.

---

## Self-Review (completed by plan author)

- **Spec coverage:** WS-A→Tasks 1-3,16,17; WS-B→Task 4; WS-C→Tasks 7-9; WS-D→Tasks 5-6; WS-E→Tasks 10-11; WS-F→Tasks 12-15; WS-G→Task 17. Validation (spec §9)→Task 19. All workstreams mapped.
- **Placeholder scan:** No "TBD/TODO-later". The two calibration notes (brevit async/decoder in Tasks 1-2) are explicit discovery-then-implement instructions with concrete commands, not placeholders.
- **Type/name consistency:** `safeEncode`/`encode`/`decode`/`roundTrips` (Task 2) are the same names used in Tasks 3-4; `isScorableTrial` (Task 6) consistent; `buildPlan` field names identical across Tasks 7, 8, 9, 13.
- **Known calibration points (by design, not gaps):** brevit's exact Flatten delimiters and sync/async + decoder presence are captured in Task 1 and the wrapper is written to match — flagged inline.
