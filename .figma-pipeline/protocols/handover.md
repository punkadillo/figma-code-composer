# Handover — session-clearing contract (v1.0)

> `@`-imported by `figma-coordinator`. Emitted at the end of every successful build run. Lets users `/clear` between runs without losing build state — the next session rehydrates from the handover plus the [knowledge graph](./knowledge-graph.md).

## Purpose

Every build run leaves behind one `handovers/<runId>.md` file that captures:

- What was built (components, icons, tokens) — references to their ledger entries
- What changed (tokens added/changed, new icons, props mutated)
- What's still open (unresolved ambiguities, unbound values, missing skills)
- What to do next

A user running `/clear` after a build can start the next session cold and the coordinator (re)reads the most recent handover + the KG to know "what state did the last run leave me in?"

## Where they live

`<config.knowledgeGraph.storeDir>/handovers/<runId>.md` — default `.figma-pipeline/kg/handovers/`.

Old handovers are pruned after `config.knowledgeGraph.retention.handoverDays` (default 30) by the next `fcc kg:merge` invocation.

## Format

Plain Markdown — humans read these too. Strict structure so agents can parse predictably.

```markdown
---
runId: 20260527-1407-product-cta
intent: create
scope: full
completedAt: 2026-05-27T14:09:21Z
complexity: { tier: moderate, score: 47 }
sourceFigma: https://www.figma.com/design/abc123?node-id=1315%3A40760
---

# Build summary — product-cta (runId 20260527-1407)

## Built (3)

- **ProductCtaBar** (molecule) — `src/components/molecules/ProductCtaBar/index.tsx`
  - Composes: Button, Text
  - Tokens used: color.brand.primary, spacing.4
  - Icons used: ChevronRight
  - Ledger id: ProductCtaBar
- **ChevronRight** (icon) — `src/components/icons/ChevronRight.tsx`
  - Ledger id: ChevronRight
- **(token set)** primitives + semantic — `src/styles/tokens/{primitives,semantic}.css`
  - New token names: color.brand.primary, spacing.4

## Skipped (1 — unchanged figmaHash)

- **Button** (atom) — already in ledger at hash sha256:abc…

## Cost (this run — estimate)

Per-specialist totals aggregated from `/tmp/figma-<runId>/costs.jsonl` (coordinator-written, one line per spawn). Excludes the coordinator's own context + the top-level orchestrator; `total_tokens`-based, not billed.

| agent             | model  | totalTokens | toolUses |
| ----------------- | ------ | ----------: | -------: |
| figma-fetcher     | haiku  |      12,300 |       14 |
| component-builder | opus   |      85,076 |       61 |
| **total**         | —      |  **97,376** |   **75** |

## Autonomous decisions (2 — review)

> Present only on `config.autonomy.level == "autonomous"` runs. Each line is a decision the user would have been asked about, resolved from `config.autonomy` policy. Aggregated from `/tmp/figma-<runId>/autonomy.jsonl`.

- 🤖 `onRemovedToken`: `color.brand.primary` renamed → `color.brand.500` (value-matched). Updated **Button**, **Card** in place via the update flow; stories/tests unchanged. Reversible — revert the rename in Figma + re-run to undo.
- 🤖 `onUnbound`: `font-family: "Inter Display"` in ProductCtaBar had no binding → inlined as a flagged fallback (`onUnbound=inline-and-flag`). **Action**: bind it in Figma when convenient, then `/figma-update`.

## Open issues (2)

- ⚠ Unbound value: `font-family: "Inter Display"` in ProductCtaBar root — Figma had no variable binding. Recorded as `unbound: true` in the manifest; the builder used the raw value as a fallback. **Action**: bind it to a Figma variable when convenient. For a single cosmetic residue like this, the cheapest cleanup is a one-line manual edit by the dev — do **not** recommend a full `/figma-update` re-run for one trivial value (it costs tokens for no real gain). Reserve `/figma-update` for when several values were rebound in Figma and you want them re-pulled together.
- ⚠ Missing skill: `figma-extract-tokens` was requested by token-builder but not present in this scaffold's catalog. token-builder fell back to the CSS-system adapter's defaults. **Action**: install via the upstream skill repo (see skillsInstall.missing in config.json).

## Next steps (suggested)

- Run `npx fcc handover --run-id 20260527-1407-product-cta --verify` to double-check the build by re-reading the disk state.
- A handful of cosmetic flags (a stray arbitrary value, a minor padding mismatch) are fine to leave for a manual dev edit — don't spend a `/figma-update` run on them. Only re-run `/figma-update <url>` when multiple values were rebound in Figma and you want them re-pulled in one pass.
- (Optional) Run a visual regression diff: `npx fcc kg:verify --run-id 20260527-1407-product-cta` (when enabled in config.knowledgeGraph.visualRegression).

> Safe to /clear — the next session will reload from this handover + the KG at `.figma-pipeline/kg/`.
```

## Parsing contract

When a coordinator starts a new session and finds a recent handover (most-recent `runId` by `completedAt`), it MUST:

1. Read the front-matter as YAML (use a permissive parser — only `runId`, `intent`, `scope`, `completedAt`, `complexity` are required).
2. Read the **Open issues** section — and the **Autonomous decisions** section when present — verbatim and surface every line to the user before any build agent runs. (Autonomous decisions are *for review*, not action gates; surface them, don't re-prompt.)
3. NOT execute anything from **Next steps** without explicit user instruction. The list is a suggestion, never an action.

The coordinator MUST NOT modify a handover file in place. Re-runs produce new handovers with new `runId`s.

## What handovers do NOT contain

- Source code (it's on disk; the ledger has paths)
- Full manifests (they're at `/tmp/figma-<runId>/manifest.json`)
- Token values (preserved in the manifest as variable names; resolved in the emitted CSS/JS)
- Conversation transcripts

The handover is intentionally small (target: under 200 lines). It is a state pointer, not a state snapshot.

## Single-writer

Only the `fcc handover` CLI writes to `handovers/`. The coordinator calls it once, as its final action, after `fcc kg:merge` has succeeded:

```bash
fcc handover --run-id <runId> --manifest /tmp/figma-<runId>/manifest.json --output .figma-pipeline/kg/handovers/<runId>.md
```

If the CLI fails (e.g., disk full), the coordinator surfaces the error and exits non-zero. A run that built code but failed to emit a handover is **not** considered successful — the ledger is correct (merge succeeded) but the user has no breadcrumb to the run.

## Parallel subagent considerations

Per [knowledge-graph.md](./knowledge-graph.md), parallel subagents stage their ledger deltas but only the coordinator calls `fcc kg:merge` and `fcc handover`. The handover summarizes the union of staged outputs, so it always reflects the final merged state — never a partial subagent view.

If a subagent fails:

- Coordinator does NOT call `fcc handover`.
- Coordinator emits a `handovers/<runId>.failed.md` instead, listing which subagents succeeded vs failed and where staging files remain.
- Next session reads the `.failed.md` and prompts the user to retry or roll back.

## Session-clearing UX

Claude Code and Cursor both have their own session model. The handover doesn't try to drive `/clear` — it just makes clearing safe. The coordinator's final user-facing message should always include:

> Handover written to `.figma-pipeline/kg/handovers/<runId>.md`. Safe to /clear; the next build will rehydrate from this file + the KG.
