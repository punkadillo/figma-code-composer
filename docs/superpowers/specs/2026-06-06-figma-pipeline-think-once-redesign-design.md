# Figma Pipeline Redesign — "Fetch once, think once, execute mechanically"

> Spec date: 2026-06-06 · Status: **Draft for review** · Owner: pipeline maintainers
> Evidence base: `workbench/reports/<trial-id>/report.md` + `analysis/00-index.md` … `08-render-harness-notes.md`

## 1. Problem statement

The HeroUI workbench trial (7 rungs, $19.93, 35.4M tokens) exposed four systemic failures in the
figma-to-code multi-agent pipeline:

1. **Token blowout from re-reasoning + coordination collapse.** Every builder re-derives layer,
   API shape, render-mode, token mapping. When MCP scoping failed, the coordinator *improvised* a
   `timeout 5/10 claude --agent figma-fetcher --print` Bash subprocess (~195 occurrences in the run
   bodies) that has no MCP tools and got killed by the wrapper. The `all-icons` rung alone burned
   18.9M tokens / $9.87 largely on this flailing.
2. **MCP "failure" was self-inflicted** (RCA 06, PROVEN). 34/37 real MCP calls succeeded; zero
   transport timeouts. The failure was a spawn-architecture bug + a `No such tool available` scoping
   error that triggered the subprocess fallback instead of a clean abort.
3. **Tokens collapsed** (report 05). A single-node fetch captured ~33 tokens — roughly **20–25% of
   one mode, 0% of the second** — vs the oracle's **140+ variables across 2 modes**. The
   `semantic.css`/`components.css` layers were emitted hollow; the `effect`/blur token was silently
   dropped.
4. **Accuracy defects** (reports 03/04/07). Layer classification off-by-one for Input/Card/Form;
   `Input.tsx` shipped `useState` with no `"use client"`; Card/Form inlined `TODO[figma-bind]` raw
   values (binding-rule-4 violation); native HTML `type` union narrowed; icon `aria-hidden`+`aria-label`
   contradiction; inconsistent icon barrel exports that broke the build.

## 2. Goals & non-goals

### Goals (success criteria)
- **Accuracy 98–100%** on the source-derivable + structural metrics, via full-DS token capture,
  intent-based layer classification, and binding/a11y enforcement.
- **~80% fewer tokens** via (a) a single coordinator "think-once" reasoning pass that replaces
  per-builder re-reasoning, (b) Brevit token-efficient wire format for inter-agent payloads, and
  (c) elimination of the subprocess-fallback flailing.
- **Faster orchestration** — builders become near-mechanical emitters; one reasoning turn, parallel
  dispatch unchanged.
- **Zero MCP-fallback failures** — subprocess re-entry banned; scoping error becomes a clean abort.
- **Think-first execution** — a `buildPlan` artifact decided once, executed deterministically.

### Non-goals
- Building a HeroUI-fidelity design-system adapter (`adapters/design-systems/heroui.md`) — that is a
  separate Bar-B workstream (report 04 §B6). The target stays `designSystem: none` unless the user
  picks a DS.
- Scrubbing historical trial telemetry (`workbench/trials/**/bodies/`).
- Touching user-level/global config (`~/.claude/*`).
- Rewriting the render/scoring harness (report 08 already built it).

## 3. Locked design decisions

| Decision | Choice | Rationale |
|---|---|---|
| Think-once layer | **Coordinator-embedded** (no new agent) | Manifest is already in the coordinator's cached context; the plan costs ~one reasoning turn with zero extra spawn / zero context re-hydration — that is where the 80% comes from. |
| Init DS build | **Opt-in toggle** (URL + "build now?") | Preserves the wizard's verify-don't-build posture when declined; one-shot themed tokens when accepted. |
| Inter-agent serialization | **Brevit** (`npm install brevit`), JSON **Flatten** mode only, abbreviation OFF | 38–46% reduction on JSON payloads; lossy text/image modes banned to protect Figma variable paths (binding rule 3). |

## 4. Architecture

```
/figma-build <url>
  │
  ▼
figma-coordinator
  1 Fetch ───────────────► figma-fetcher  (OWNS MCP; full-variable mode on token/DS scope)
  2 Validate manifest (canonical JSON on disk; jq/fcc parse it)
  3 Gate ambiguities + unbound styled props
  5 Route by complexity tier
  ╔══════════════════════════════════════════════╗
  ║ 8.5 THINK ONCE  →  buildPlan (per-component   ║  ← NEW. coordinator-embedded reasoning pass
  ║      directives; no builder re-derives)       ║
  ╚══════════════════════════════════════════════╝
  9 Dispatch (Brevit-encoded directive slices)
        ├─ token-builder   (3 real layers + theme modes)
        ├─ component-builder (mechanical exec of directive)
        ├─ icon-generator
        └─ story-author / test-author
 15 Report
```

**Wire format vs canonical store.** `manifest.json`, `costs.jsonl`, KG ledger entries, and anything
`jq`/`fcc` parses stay **raw JSON on disk**. Brevit compresses only the **in-context handoffs**:
the directive slices injected into builder prompts, the `buildPlan`, and specialist return contracts
— i.e. the bytes that are actually billed as tokens. Every Brevit encode is paired with a
round-trip self-check (`decode(encode(x)) == x`); failure → silent fallback to raw JSON + a flag.

## 5. Workstreams

### WS-A — Brevit dependency + wrapper (foundation)
- **Wizard** (greenfield): `npm install brevit`; record
  `config.brevit = { installed, version, enabled:true, mode:"flatten", abbreviation:false }`.
- **`fcc brevit:encode` / `fcc brevit:decode`** subcommands (`bin/figma-code-composer.js` +
  `protocols/cli.md`): thin wrappers over brevit's JS API. Contract:
  - Input: a JSON file/string. Output: Brevit-flattened text (encode) or JSON (decode).
  - `--check` runs the round-trip guard and exits non-zero on mismatch.
  - **Absent/error → identity passthrough** (emit raw JSON, exit 0, print a one-line `brevit
    unavailable — using raw JSON` notice). Never fatal. Same graceful-degradation posture as graphify.
- **Acceptance:** `fcc brevit:encode manifest.json | fcc brevit:decode | jq .` round-trips a real
  manifest byte-identical; absent-brevit path still produces valid JSON.

### WS-B — Brevit protocol (`protocols/brevit.md`, new)
Defines:
- **Encode set:** builder directive slices, `buildPlan`, specialist return contracts, in-context KG
  stage payloads.
- **Never-encode set:** on-disk `manifest.json`, `costs.jsonl`, `lessons.md`, KG ledger, config files.
- **Mandate:** Flatten mode only; abbreviation OFF; text/image modes forbidden on any pipeline payload.
- **Round-trip guard:** every encode verified; mismatch → raw-JSON fallback + flag.
- **Binding-rule-3 guard:** Brevit MUST round-trip Figma variable paths (e.g.
  `color/surface/brand-primary`) byte-exact; a path that fails the guard aborts encoding for that
  payload (falls back to JSON), never silently mangles it.
- Cross-reference added to `protocols/figma-manifest.md` (the manifest's *wire* form may be Brevit;
  its *canonical* form is JSON).

### WS-C — Think-once layer (`figma-coordinator.md`, new Step 8.5)
After Step 5 (route) and before Step 9 (dispatch), the coordinator produces **`buildPlan`** —
one directive per component/icon. Schema (`protocols/figma-manifest.md` § buildPlan, new):

```jsonc
{
  "runId": "20260606-1200-heroui",
  "components": [{
    "name": "Card",
    "resolvedLayer": "organism",          // final, post-think (not the fetcher's raw guess)
    "layerConfidence": "high",
    "apiShape": "compound",               // "props" | "compound" | "discriminated-union"
    "renderMode": "server",               // "client" if state/effects/handlers detected
    "requiredA11y": ["labelledby-on-region"],
    "tokenBindings": ["color/surface/brand-primary", "radius/lg"],
    "unboundDecision": "skip",            // "bind" | "skip" | "approved-inline" (per Step 3 gate)
    "dropPolicy": "surface-to-attention", // how to report collapsed affordances
    "compose": []                         // reuse imports, if KG hit
  }],
  "tokens": { "scope": "full-variable", "modes": ["light","dark"] }
}
```

- The directive is **decided once** here; builders execute it. Builder agent files
  (`component-builder`, `icon-generator`, `story-author`, `test-author`) gain a rule:
  *"Execute the `buildPlan` directive. Do NOT re-derive layer / apiShape / renderMode / unbound
  decisions — they are decided. Re-derive only what the directive omits."*
- `buildPlan` is Brevit-encoded into each slice (WS-A/B).
- **Acceptance:** a build produces exactly one reasoning pass before dispatch; builder transcripts
  contain no layer/API re-derivation; token total on the `organism`/`all-icons` rungs drops sharply
  vs the 20260603 baseline.

### WS-D — MCP hardening (kills the wasted-run bug)
- **`figma-coordinator.md`:**
  - New **Never** bullet: *"Never invoke `claude`, `claude --agent`, or any CLI that re-enters
    Claude Code from Bash. Specialists run ONLY via the `Agent` tool."*
  - Error-classification table: add row `No such tool available → hard abort code 3; do NOT retry,
    do NOT shell out.`
- **`figma-fetcher.md` step 0:** on `No such tool available` after the alternate-namespace retry,
  return `reachabilityStatus:"fail"` and **never self-respawn via Bash**; add one transient
  retry+backoff before declaring `fail` (covers a genuine transport hiccup).
- **`workbench/runner/*` guard:** treat a manifest lacking `reachabilityStatus:"ok"`, or a scratch
  dir containing `contract.json` / `mcp-probe.sh` / a 0-byte `fetcher-output.txt`, as a **failed
  trial** — never scored. (run-manifest-builder.mjs / run-one.mjs.)
- **Acceptance:** a forced scoping error aborts cleanly with the actionable message and produces no
  subprocess spawn and no fabricated manifest.

### WS-E — Full-DS token capture + real layering
- **`figma-fetcher.md`:** add **full variable-collection mode** for `scope ∈ {tokens-only, full}` on
  a DS build — enumerate all collections + all modes via `get_variable_defs`, not node-scoped. Cap
  + flag if a collection exceeds a sane variable ceiling.
- **`token-builder.md` + `protocols/token-strategy.md`:** emit the **three real layers**:
  1. `primitives.css` — raw values.
  2. `semantic.css` — `--color-*: var(--primitive)` aliases (kill the hollow no-op).
  3. `@theme inline { … }` bridge so utilities stay theme-reactive.
  Plus `[data-theme="<mode>"]` blocks per Figma mode, and token-type coverage for
  `effect`/`shadow`/`easing` (the dropped `blur`). Remove the "semantic indirection argued against"
  comment.
- **Acceptance:** a full DS fetch emits ≥ the oracle's variable count across all modes; `semantic.css`
  is non-empty and aliases primitives; no token type is silently dropped (every fetched variable is
  either emitted or in `skipped[]` with a reason).

### WS-F — Accuracy fixes
- **`protocols/component-layout.md` + `figma-fetcher.md`:** replace the structural layer heuristic
  with intent-based signals — child-node count/depth, form-control children → molecule+, button-row /
  multi-region → organism+, full-canvas frame → template. Record `layerConfidence`; low confidence
  surfaces as a flag for the coordinator's think-once pass to resolve. Document in
  `protocols/figma-manifest.md` that `layer` is advisory and `layerConfidence` is new.
- **`component-builder.md`:**
  - Mandatory `"use client"` self-grep (`useState`/`useEffect`/`useReducer`/stateful handler) →
    prepend directive's `renderMode` decision.
  - **Zero `TODO[figma-bind]` invariant** — unbound (non-`intentionalLiteral`) → `skipped[]`, never
    inline. (Reinforces existing rule; add Card negative example.)
  - Slot/compound detection (export `CardHeader`/`CardFooter` as compound, not `show*` booleans);
    discriminated unions for mutually-exclusive variant props.
  - Drop placeholder Figma copy from defaults; enforce icon-only `aria-label` (refuse to emit
    unlabeled).
- **`adapters/frameworks/react.md`:** never narrow a native HTML attribute union (extend, don't
  `Omit`-and-replace); promote `"use client"` to a hard checklist item.
- **`icon-generator.md`:** fix the `aria-hidden`+`aria-label` contradiction (label present →
  `role="img"`, omit `aria-hidden`; else `aria-hidden="true"`, no role); normalize barrel exports
  (consistent named re-exports — the inconsistency broke the render build).
- **`adapters/css/tailwind-v4.md`:** prefer named scale utilities over arbitrary `[…]` brackets.
- **Acceptance:** the five 20260603 defects (Input client, Card/Form inline TODO, narrowed type,
  icon a11y, barrel) do not reproduce on a re-run; build gate passes on all rungs.

### WS-G — Wizard opt-in init DS build (goal #5)
- New greenfield step (after config write, before final report): **Q-ds-url** "Figma design-system
  URL? (builds your token system from Figma variables)" + **Q-build-now** toggle.
  - **Yes** → run full-variable fetch → token-builder as the closing onboarding step (the one place
    the wizard orchestrates a build; gated behind explicit opt-in).
  - **No** → record `config.figma.dsUrl`; final report ends with `Next: /figma-tokens <url>`.
- `config.schema.json` gains `figma.dsUrl` (optional) + the `brevit` block (WS-A).
- **Acceptance:** declining leaves the wizard's verify-don't-build behavior intact; accepting yields
  a populated, multi-layer token system on a fresh scaffold.

## 6. Sequencing (phased, each independently testable)

1. **WS-A + WS-B** — Brevit wrapper + protocol (foundation; everything else can use it).
2. **WS-D** — MCP hardening (stops the bleeding; smallest, highest-safety).
3. **WS-C** — think-once layer.
4. **WS-E** — fetcher full-mode + token layering.
5. **WS-F** — accuracy fixes.
6. **WS-G** — wizard step.

Cursor mirrors (`.cursor/prompts/*`, `.cursor/rules/*`) updated alongside each agent/protocol change.

## 7. Files touched

`.claude/agents/`: `figma-coordinator.md`, `figma-fetcher.md`, `token-builder.md`,
`component-builder.md`, `icon-generator.md`, `story-author.md`, `test-author.md`, `wizard.md`.
`.figma-pipeline/protocols/`: `brevit.md` (new), `figma-manifest.md`, `component-layout.md`,
`token-strategy.md`, `cli.md`.
`.figma-pipeline/adapters/`: `frameworks/react.md`, `css/tailwind-v4.md`.
`.figma-pipeline/`: `config.schema.json`, `config.example.json`.
`bin/figma-code-composer.js` (fcc brevit subcommands + wizard install hook surface).
`workbench/runner/*` (degraded-trial guard).
`.cursor/` mirrors as needed.

## 8. Risks & mitigations
- **Brevit is a young hard dependency.** Isolated behind `fcc brevit:*` + round-trip guard + raw-JSON
  fallback; never a hard gate. A broken/absent brevit degrades to JSON, never breaks a build.
- **Flatten round-trip on edge values** (colons, newlines in values). The round-trip guard catches it
  per-payload and falls back to JSON for that payload only.
- **Think-once underspecifies a directive.** Builders re-derive only what the directive *omits*; a
  missing field is a defined fallback, not an error.
- **Full-variable fetch latency/size.** Cap + flag oversized collections; screenshots already capped.

## 9. Validation
Re-run the HeroUI workbench ladder and compare against `<trial-id>`:
- Tokens per rung ↓ (target ~80% on the re-reasoning-heavy rungs).
- Build gate ✓ on all rungs (Form className-merge + Input client fixed).
- `semantic.css` non-empty; token count ≥ oracle across modes.
- No subprocess spawn / no `reachabilityStatus != ok` manifest scored.
- Brevit round-trip guard green on every encoded payload.

## 10. Out of scope / follow-ups
- HeroUI-fidelity DS adapter (Bar-B).
- a11y gate wiring (axe-core install) — render harness follow-up.
- Optional: remove RTK from the user's global `~/.claude` config (RTK.md, the duplicate ZAP.md, the
  Bash hook) — user-level, requires explicit go-ahead.
