# Complexity scoring + tier routing — v1.0

> `@`-imported by `figma-fetcher` (writer) and `figma-coordinator` (consumer). Drives skill-set and model selection per build. See [knowledge-graph.md](./knowledge-graph.md) for the `tokenReuseRatio` input.

## Purpose

Every Figma manifest carries a deterministic complexity score (0–100) and a tier (`trivial | moderate | complex | extreme`). The coordinator uses the tier to:

1. Pick the minimum skill set per agent (full list lives in [skills.md](./skills.md)).
2. Route to an appropriately-sized model (Haiku / Sonnet / Opus) — saves token cost on simple builds without sacrificing quality on hard ones.
3. Decide whether to run a second-pass code review.

## Where complexity lives

In the manifest (see [figma-manifest.md](./figma-manifest.md) v1.1):

```jsonc
"complexity": {
  "score": 47,                    // 0–100, deterministic
  "tier": "moderate",             // resolved against config.complexity.thresholds
  "signals": {
    "nodeCount": 84,
    "variantCount": 6,
    "compositionDepth": 4,
    "unboundValueCount": 2,
    "iconCount": 5,
    "tokenReuseRatio": 0.78       // tokens-in-ledger / tokens-used; 1.0 = full reuse, 0 = all new
  }
}
```

## Score formula

```
score = clamp(0, 100,
    nodeScore        * 0.20    // log-scaled node count
  + variantScore     * 0.20    // 0 → 1 mapping over [0, 16] variants
  + depthScore       * 0.15    // composition depth saturating at 6
  + unboundPenalty   * 0.25    // every unbound value is friction
  + iconPenalty      * 0.05    // icons add a small amount of work
  + reusePenalty     * 0.15    // (1 - tokenReuseRatio) — low reuse = more new ground
)
```

Component normalizations:

| Signal             | Formula                                            |
| ------------------ | -------------------------------------------------- |
| `nodeScore`        | `100 * min(1, log10(1 + nodeCount) / log10(500))`  |
| `variantScore`     | `100 * min(1, variantCount / 16)`                  |
| `depthScore`       | `100 * min(1, compositionDepth / 6)`               |
| `unboundPenalty`   | `100 * min(1, unboundValueCount / 5)`              |
| `iconPenalty`      | `100 * min(1, iconCount / 20)`                     |
| `reusePenalty`     | `100 * max(0, 1 - tokenReuseRatio)`                |

The weights sum to 1.0.

**`tokenReuseRatio` is supplied by the coordinator, not the fetcher.** The fetcher emits `tokenReuseRatio: 0` only as a *placeholder* (it has no reuse view at fetch time). Before it resolves the routed tier, the coordinator MUST overwrite this signal with the **real** reuse ratio it computes in its cold-start inventory (see `figma-coordinator.md` § Cold-start inventory):

- `config.knowledgeGraph.enabled = true` → the ledger query supplies the ratio.
- `config.knowledgeGraph.enabled = false` → use the **disk-based** ratio (existing tokens/components on disk that satisfy the manifest's needs ÷ total needed). This is the same signal that decides whether `token-builder` is skipped — they MUST agree.

**Do NOT hard-code `tokenReuseRatio = 0` when KG is off.** Treating KG-off as zero reuse fires `reusePenalty` at its **max +15** on every run even when on-disk reuse is near-total — which over-scores every component and tips borderline ones (e.g. a 69.8 → 84.8 component) up a routing tier on a false signal. KG-off is the common path; the disk-based ratio keeps it honest. Only fall back to `0` when there is genuinely no reuse view at all (no KG, no on-disk inventory).

## Tier resolution

```
tier =
    score < config.complexity.thresholds.trivial  ? "trivial"
  : score < config.complexity.thresholds.moderate ? "moderate"
  : score < config.complexity.thresholds.complex  ? "complex"
                                                  : "extreme"
```

Defaults: trivial < 20, moderate < 50, complex < 80, extreme ≥ 80.

`config.complexity.tierOverrides` can force-bump (never demote): `{ "trivial": "moderate" }` means even a 5-score build runs the moderate playbook.

## Routing table (default)

Tier → **abstract size** (`sm` / `md` / `lg`) + skill set + review flag. The abstract size is resolved to a concrete model per tool.

| Tier      | Skills invoked per agent                                | Size    | Second-pass review |
| --------- | ------------------------------------------------------- | ------- | ------------------ |
| trivial   | minimum: `figma-icons` OR `figma-tokens` only           | `sm`    | no                 |
| moderate  | + skip `tdd-guide`; `senior-frontend` only              | `md`    | no                 |
| complex   | full: `senior-frontend` + `tdd-guide` + `senior-qa`     | `lg`    | no                 |
| extreme   | full + `code-reviewer` final pass on every component    | `lg`    | yes (`lg`)         |

### Per-tool size → model mapping

The abstract `sm` / `md` / `lg` resolves differently per tool because each tool exposes a different model surface:

| Size | Claude Code (default)    | Cursor                          |
| ---- | ------------------------ | ------------------------------- |
| `sm` | `claude-haiku-4-5`       | user-selected model (no override) |
| `md` | `claude-sonnet-4-6`      | user-selected model (no override) |
| `lg` | `claude-opus-4-7`        | user-selected model (no override) |

**Override rules:**

- **Claude Code** — `config.complexity.model.<tier>` accepts any Claude model ID; coordinator passes it via the `Agent` tool's model param.
- **Cursor** — Cursor agents inherit the user's currently-selected model from the Cursor UI; there is no per-call override, and the coordinator MUST NOT attempt to set or change the model. The preference is **plan-aware and advisory** (see `.cursor/rules/model-preference.mdc` + `.cursor/settings.json` `fcc.cursor.model`):
  - **Free plan** — model selection is locked to **Auto**. Do nothing; the pipeline runs on Auto. The coordinator surfaces the size hint for info but adds no "switch model" nudge.
  - **Paid plan** — prefer **Composer 2.5** (default), fall back to a **Claude model** for `lg`-size (complex/extreme) runs. The coordinator's `lg` size hint is the signal to switch, if the user wants.

Skill-set overrides are coordinator-only (not user-configurable) — they're a function of correctness, not preference.

## What the coordinator does with this

1. Spawns `figma-fetcher`; reads `manifest.complexity.tier`.
2. Applies `config.complexity.tierOverrides` if present.
3. For each spawned builder agent, includes a routing block in the prompt:
   ```
   complexity.tier = moderate
   active skills = senior-frontend
   model = claude-sonnet-4-6
   second-pass review = false
   ```
4. If `tier == extreme`, schedules a `code-reviewer` second pass after the build completes; the reviewer receives the build diff + the manifest.
5. Records the resolved tier in the run's handover (see [handover.md](./handover.md)).

## Safe defaults

- When `config.complexity.enabled = false`, coordinator always uses tier `complex` (the prior pipeline's effective behavior — full skills, Opus, no review pass). Predictable cost, no regressions.
- When the manifest lacks a `complexity` block (e.g., a fetcher from an older scaffold), coordinator treats it as `complex` with a one-line `ambiguity` note.

## Tradeoffs

- **Optimistic on tokenReuseRatio**: if the KG has stale entries (component was deleted from source but ledger still has it), `tokenReuseRatio` may be inflated. The reuse-penalty term tolerates this — the score moves at most ±15 points.
- **No semantic complexity**: this score sees only structural signals from the manifest. A semantically tricky component (animation states, complex interactions) with a flat tree will score low. Mitigation: the `unboundValueCount` signal acts as a proxy — complex behavior usually correlates with unbound design intent.
- **Per-agent override missing**: today the tier applies to every agent for the run. A future v1.1 could let `icon-generator` always run as `trivial` regardless. Out of scope here.
