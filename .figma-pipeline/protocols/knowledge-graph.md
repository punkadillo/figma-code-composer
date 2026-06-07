# Knowledge Graph — shared data contract (v1.0)

> `@`-imported by `figma-coordinator` and every builder agent (`token-builder`, `icon-generator`, `component-builder`). Single-writer discipline matches the [figma-manifest](./figma-manifest.md) protocol — the CLI (`fcc kg:merge`) is the only writer to `ledger.jsonl`.

## Purpose

A local, repo-resident graph of every component, icon, and token set the pipeline has produced. The KG enables:

- **Reuse** — coordinator queries before each build to retrieve similar prior components and inject their ledger entries (not source) into builders' context.
- **Skip-when-unchanged** — manifest's `figmaHash` matched against ledger entries means an unchanged Figma node never re-runs the builder.
- **Prop-shape alignment** — builders look up prior components with matching layer + token usage and prefer their prop names/shapes.
- **Token-reuse ratio** — feeds into [complexity scoring](./complexity.md).

## Where it lives

Under `config.knowledgeGraph.storeDir` (default `.figma-pipeline/kg/`):

```
.figma-pipeline/kg/
  ledger.jsonl              # append-only, one JSON object per line
  graph.json                # derived view (nodes + edges); rebuilt from ledger by `fcc kg:rebuild`
  embeddings.sqlite         # sqlite-vec table: (component_id, vector, summary)
  handovers/<runId>.md      # per-run handover notes (see ./handover.md)
  staging/<runId>/          # parallel-subagent staging area; emptied by `fcc kg:merge`
    component-builder.jsonl
    icon-generator.jsonl
    token-builder.jsonl
```

The `kg/` directory is added to `writeScope.allowedDirs` by the wizard.

## Ledger entry schemas (per kind)

### `kind: "component"`

```jsonc
{
  "id": "ProductCtaBar",                       // REQUIRED — component PascalCase name
  "kind": "component",                         // REQUIRED
  "figmaNodeId": "1315:40760",                 // REQUIRED — for a top-level (non-instance) component, this is its own node id; for a component that *is* an instance, this is the MAIN component's node id (so all instances dedup to the same ledger entry)
  "figmaMainComponentId": "1315:40760",        // OPTIONAL — when the source was a Figma INSTANCE, the main-component node id (= figmaNodeId for the canonical build)
  "figmaHash": "sha256:<64 hex>",              // REQUIRED — hash of the manifest slice (see § Hashing)
  "layer": "molecule",                         // OPTIONAL — atomic layer when methodology=atomic
  "framework": "react",                        // REQUIRED — frozen from configSnapshot at build time
  "cssSystem": "tailwind-v4",                  // REQUIRED
  "filePath": "src/components/molecules/ProductCtaBar/index.tsx",  // REQUIRED — relative to repo root
  "exportName": "ProductCtaBar",               // REQUIRED — named export to import (matches `id` in typical cases)
  "tokensUsed": ["color.brand.primary", "spacing.4"],              // REQUIRED — preserved Figma variable names
  "iconsUsed": ["ChevronRight"],               // REQUIRED — may be empty []
  "composes": [                                // REQUIRED — list of ledger ids THIS entry composes; may be []
    { "id": "Button", "via": "instance" },     // via: "instance" (Figma instance reuse) | "import" (manual composition)
    { "id": "Text", "via": "import" }
  ],
  "props": [                                   // REQUIRED for components — may be []
    { "name": "label", "type": "string", "required": true }
  ],
  "variantOptions": [                          // OPTIONAL — Figma variant axes when component has variants
    { "name": "size", "values": ["sm", "md", "lg"] }
  ],
  "storyPath": "src/components/molecules/ProductCtaBar/ProductCtaBar.stories.tsx",
  "testPath":  "src/components/molecules/ProductCtaBar/ProductCtaBar.test.tsx",
  "summary": "CTA bar with label + chevron, used in product list rows.",  // REQUIRED — 1–2 sentences; used as embedding text
  "buildRunId": "20260527-1407-product-cta",   // REQUIRED — matches manifest.runId
  "agentVersions": {                           // REQUIRED — versions of the agents that produced this entry
    "component-builder": "1.0",
    "story-author": "1.0",
    "test-author": "1.0"
  },
  "createdAt": "2026-05-27T14:07:33Z",         // REQUIRED — ISO-8601
  "updatedAt": "2026-05-27T14:07:33Z"          // REQUIRED — ISO-8601; equals createdAt for fresh entries
}
```

### `kind: "icon"`

```jsonc
{
  "id": "ChevronRight",
  "kind": "icon",
  "figmaNodeId": "1315:40761",
  "figmaHash": "sha256:...",
  "framework": "react",
  "cssSystem": "tailwind-v4",
  "filePath": "src/components/icons/ChevronRight.tsx",
  "exportName": "ChevronRight",
  "tokensUsed": [],
  "iconsUsed": [],
  "composes": [],
  "props": [],
  "fillModel": "currentColor",
  "viewBox": "0 0 24 24",
  "summary": "chevron-right icon, currentColor, viewBox 0 0 24 24",
  "buildRunId": "...",
  "agentVersions": { "icon-generator": "1.0" },
  "createdAt": "...",
  "updatedAt": "..."
}
```

### `kind: "tokenSet"` — first-class design tokens

The token set carries a **per-token manifest** so that token-builder can skip-when-unchanged at the granularity of an individual design token (not just the whole set) and so cross-run lineage of Figma variables → emitted token names is traceable.

```jsonc
{
  "id": "tokens@tailwind-css-vars@src/styles/tokens",  // REQUIRED — stable ID per strategy+outputDir
  "kind": "tokenSet",
  "figmaHash": "sha256:...",                  // REQUIRED — hash of the full per-token manifest (sorted)
  "framework": "react",
  "cssSystem": "tailwind-v4",
  "tokenStrategy": "tailwind-css-vars",       // REQUIRED — frozen from configSnapshot.tokenStrategy
  "fileLayout": "split",                      // REQUIRED — config.tokens.fileLayout at build time
  "outputDir": "src/styles/tokens",
  "files": [                                  // REQUIRED — emitted files
    "src/styles/tokens/primitives.css",
    "src/styles/tokens/semantic.css",
    "src/styles/tokens/components.css"
  ],
  "namingConvention": "kebab-case",
  "prefix": "--app-",
  "tokens": [                                 // REQUIRED — per-token records, the lineage
    {
      "name": "color.brand.primary",          // REQUIRED — Figma variable path (preserved verbatim)
      "figmaVariableId": "VariableID:1234:5678",  // REQUIRED — Figma's stable variable identifier
      "type": "color",                        // "color" | "spacing" | "typography" | "radius" | "shadow" | "opacity" | "duration" | "easing" | "number" | "string"
      "defaultValue": "#FF6E1D",              // value in the default mode
      "modes": { "default": "#FF6E1D", "dark": "#FF8A4A" },  // mode → value
      "emittedAs": "--app-color-brand-primary",  // resolved identifier in the output (per namingConvention + prefix)
      "emittedIn": "src/styles/tokens/primitives.css",  // which file holds it
      "tokenHash": "sha256:..."               // REQUIRED — hash of { name, type, modes, emittedAs }; stable when the token is semantically unchanged
    }
  ],
  "tokenCount": 47,                           // REQUIRED — convenience field; must equal tokens.length
  "summary": "Tailwind v4 CSS-vars token set: 47 tokens across 3 files, prefix --app-.",
  "buildRunId": "...",
  "agentVersions": { "token-builder": "1.0" },
  "createdAt": "...",
  "updatedAt": "..."
}
```

**Why per-token records.** A design system is alive — tokens are added, renamed, retired, re-themed. The per-token list is the closest thing to a source of truth besides Figma itself, and it enables three things:
- **Granular skip-when-unchanged**: token-builder compares incoming Figma variables against `tokens[].tokenHash`; emits only added + modified.
- **`tokenReuseRatio` in complexity scoring**: ratio = `(incomingTokens ∩ ledgerTokens by name) / incomingTokens`. A 90% reuse build is much simpler than a 0% greenfield set.
- **Drift detection**: `fcc doctor` can verify `emittedIn` files still exist and contain `emittedAs` identifiers. Missing → flag.

**One tokenSet per `(tokenStrategy, outputDir)`.** The `id` collapses runs that target the same strategy+output into a single evolving entry. Re-running `/figma-tokens` updates the entry (new `updatedAt`, new `tokenHash`, new `tokens[]`). Use `replacedBy` only when the strategy or outputDir changes.

### Hashing

`figmaHash` is `sha256(JSON.stringify(canonicalSlice))` where `canonicalSlice` is:

- The component/icon's node entry from the manifest, with `existsOnDisk` and `diskPath` removed (they're build-time outputs, not source state).
- All `tokensUsed` resolved to their full variable paths (already canonical in the manifest).
- Keys sorted alphabetically at every level.

The hash is the cache key for skip-when-unchanged. Bump the canonical-slice algorithm only with a `version` field in the ledger entry (forward-compatible).

## Edges (derived)

`graph.json` is rebuilt from `ledger.jsonl` by `fcc kg:rebuild`. Edges:

| Edge type           | From → To                        | Source field                          | Notes                                  |
| ------------------- | -------------------------------- | ------------------------------------- | -------------------------------------- |
| `composes-instance` | component → component            | `composes[].id` where `via=instance`  | Figma instance reuse — strongest reuse |
| `composes-import`   | component → component            | `composes[].id` where `via=import`    | Manual composition via import          |
| `uses-token`        | component → tokenSet→token       | `tokensUsed[]` matched against tokenSet `tokens[].name` | Per-token edge inside the tokenSet |
| `uses-icon`         | component → icon                 | `iconsUsed[]`                         |                                        |
| `instance-of`       | (Figma instance) → component     | `figmaMainComponentId` match          | Drives skip-when-instance              |
| `built-with`        | component → agentVersion         | `agentVersions{}`                     |                                        |
| `replaced-by`       | entry → entry                    | mutation-history                      | Survives a delete                      |

`replaced-by` is the only edge that survives a delete — when an entry is removed (e.g., `/figma-update` produces a fresh ID for what was previously a different component), the prior entry stays in the ledger with a `replacedBy: "<newId>"` field.

## Component reuse — when "build" actually means "import"

When `figma-fetcher` walks a screen and encounters a Figma **INSTANCE** node, it records the node in the manifest with a `componentInstance` block (see `protocols/figma-manifest.md` v1.2). The coordinator's resolve phase then takes one of three paths:

1. **Instance + ledger hit (framework + cssSystem match)** — DO NOT spawn a builder for this entry. Hand the consuming component (the screen) the ledger entry's `filePath` + `exportName` so it imports the existing component. Record a `componentsReused[]` entry in the run report; record a `composes-instance` edge in the new component's ledger entry (when the screen itself becomes a ledger entry).

2. **Instance + ledger hit but framework or cssSystem mismatch** — the existing entry was built for a different stack. DO NOT reuse silently. `interactive` → surface a blocking ambiguity: *"Component X exists in the ledger built for `react/tailwind-v4`, but the current config is `vue/css-modules` — should I rebuild for the current stack, or leave both?"* The user decides. `autonomous` → resolve via `config.autonomy.onStackMismatch` (default `update-current` patches toward the active stack via the update flow rather than a from-scratch rebuild) and record an Autonomous-decision entry. See `figma-coordinator.md` § Autonomy policy.

3. **Instance + no ledger hit** — the main component has never been built. Build it FIRST (so subsequent instance references in the same run can be resolved as reuse), then mark all instance sites as reuse.

This is the load-bearing reuse mechanism. Without it, every screen built independently would re-emit its own `Button` and `Card`. With it, the ledger becomes the single source of truth for what's been built; every screen composes from it.

### Why match on `figmaMainComponentId` and not name

Figma component names are user-editable. A user renaming "Button" to "Btn" should not break reuse. `figmaMainComponentId` is Figma's stable internal identifier — same across renames, same across file moves within the same Figma library. Ledger lookup is `figmaNodeId == manifest.componentInstance.mainComponentId`.

### Reuse criteria (must ALL match for silent reuse)

- `ledgerEntry.figmaNodeId == manifest.componentInstance.mainComponentId`
- `ledgerEntry.framework == configSnapshot.framework`
- `ledgerEntry.cssSystem == configSnapshot.cssSystem`
- `ledgerEntry.filePath` still exists on disk (verified via `fs.stat` before reuse — see § Drift detection)

If any check fails → not silent reuse; either the alternate path (above) or a blocking ambiguity.

### Drift detection (`fcc kg:verify`)

Before any silent reuse, the coordinator MUST call `fcc kg:verify --component-id <id>` (a new subcommand — spec in `protocols/cli.md`). It checks:

- `filePath` exists on disk and contains a named export matching `exportName`
- `storyPath` and `testPath` (when set) exist
- For tokenSet entries: each `tokens[].emittedIn` file exists and contains `tokens[].emittedAs`

Failures surface as `orphaned: true` flags on the ledger entry (kept in the ledger; coordinator avoids reuse until the user runs `fcc kg:repair` or rebuilds). The user is informed in the run report so they can decide whether the orphan is intentional (deleted) or accidental (moved).

### Updates propagate from the main component

When `/figma-update` rebuilds Component X, every screen that composes X via `via=instance` automatically picks up the change at next render — because they all import from the same `filePath`. No screen needs to be rebuilt for the update to take effect. The coordinator records the update in the run report so users know which downstream screens are affected.

### Instance overrides → props

Figma instance overrides (variant prop changes, text overrides) MUST surface as **props passed at the call site**, not as new component variants. The component-builder is responsible for exposing prop surface area on the main component that covers the override axes seen in instances. When an instance has an override that the main component doesn't support: `interactive` → flag it as a blocking ambiguity ("override sets `disabled=true` but Button has no `disabled` prop — extend the prop surface?"). `autonomous` → resolve via `config.autonomy.onUnsupportedOverride` (default `extend-props` adds the prop to cover the override axis) and record an Autonomous-decision entry.

## Drift detection & policies

A KG that drifts from disk is worse than no KG — silent reuse will compose files that no longer exist. These are the policies and the tools to enforce them.

### Verification points (when the coordinator MUST call `fcc kg:verify`)

1. **Before any silent reuse** — Step 6b in `figma-coordinator.md`. Verifies `filePath`, `exportName`, and (for components) `storyPath`/`testPath` if set.
2. **At end of every successful run** — coordinator runs `fcc kg:verify --all` and includes orphan count in the run report.
3. **On user demand** — `npx fcc doctor` invokes verify as part of its checks.

A failed verify marks the ledger entry with `orphaned: true` AND `orphanedAt: <ISO-8601>`. The entry is NOT deleted (the user may want to recover); it's flagged so silent reuse skips it.

### Repair (`fcc kg:repair`)

The user-driven cleanup command. Subcommands:

- `fcc kg:repair --prune-orphans` — removes orphaned entries from the ledger after a confirmation prompt. Writes a `.deleted.jsonl` archive so removals are auditable.
- `fcc kg:repair --rebuild-from-source` — re-runs `figma-fetcher` + component-builder for orphaned components using their last-known Figma node IDs.
- `fcc kg:repair --resolve-path <id> <newPath>` — for moved files (rename, move). Updates `filePath` after verifying `newPath` contains `exportName`.

### Known edge cases + policy

| Case                                                | Policy                                                                 |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| Component composes itself via instance (recursion)  | Blocking ambiguity — **always a hard stop**, no `config.autonomy` key (no safe default for a cyclic graph). The coordinator refuses to topo-sort cycles even in `autonomous` mode. |
| Variant-set reuse — one main, many variants         | Each variant is its own ledger entry (separate `figmaNodeId`), sharing `mainComponentSetId`. Reuse keys on the specific variant id, not the set. |
| Library swap (`fromLibrary` changes for same id)    | The id is stable but the source is not. `interactive` → blocking ambiguity (user decides rebuild vs. accept-as-is). `autonomous` → resolve via `config.autonomy.onLibrarySwap` (default `accept-and-flag`) + record. |
| Renamed main component, same Figma ID               | Silent reuse (we key on ID, never name).                               |
| Component deleted from Figma, ledger entry still exists | Orphan-on-disk-but-source-gone. `kg:verify` doesn't catch this (it checks disk, not Figma). `kg:repair --prune-orphans` lets the user delete.  |
| Token unused by any component                       | Kept in the tokenSet entry. Orphan tokens are fine — design systems often pre-publish.                                                          |
| Instance with NO mainComponentId (broken link)      | Fetcher emits ambiguity `blocking: false` (warn). Coordinator dispatches as a fresh build but records the broken-link flag in the run report.    |
| Stories/tests deleted for a reused component        | `kg:verify` flags the entry. Silent reuse still works (the component file is the load-bearing artifact), but the run report surfaces "Button has no stories anymore — regenerate?". |
| Manual edit to a component file (`filePath` content drifted from build) | Out of scope — we trust user edits. `kg:verify` only checks existence + `exportName`, not content equivalence. If you want content-level drift detection, run the visual-regression pipeline (`config.knowledgeGraph.visualRegression.enabled`). |
| `framework` change project-wide (e.g. react → vue)  | All prior-framework entries are stale. Coordinator surfaces them en masse on first build under the new framework; user runs `kg:repair --prune-orphans --where 'framework != "vue"'` to clear. |
| `cssSystem` change                                  | Same as framework change — silent reuse blocked, surfaced for user decision. |
| Reused component's tokens no longer exist (token removed) | Surfaced when token-builder's per-token diff reports `removed` for any token in `ledgerEntry.tokensUsed`. `interactive` → blocking flag (re-add the token or rebuild dependents). `autonomous` → resolve via `config.autonomy.onRemovedToken` (default `update-if-replaced-else-keep-raw`): a value-matched successor in the run's `added` tokens → batched `intent:update` token-rename patch to dependents (preserves the link, stories/tests untouched); no successor → keep last-known raw value as a fallback + flag. See `figma-coordinator.md` § Token-rename update. |

### What `kg:verify` does NOT check

- Whether the emitted code is *correct* (it just checks the file + export exist).
- Whether the Figma source still exists (would require Figma MCP calls — out of scope for verify; use `/figma-update` to refresh from Figma).
- Whether props in the file match props in the ledger (added in v1.1 if it proves needed).

## Single-writer discipline

Mirrors the [figma-manifest](./figma-manifest.md) discipline:

1. **Only `fcc kg:merge` writes to `ledger.jsonl`.** It uses `flock(2)` on the file for atomic append.
2. **Builders write to `staging/<runId>/<agent>.jsonl`** via `fcc kg:stage`. Each staging file is owned by exactly one agent — no cross-agent writes.
3. **`fcc kg:merge` is invoked once per run** by `figma-coordinator` after all parallel builders return. Steps:
   - Acquire `flock` on `ledger.jsonl`.
   - For each `staging/<runId>/*.jsonl`, append entries.
   - Rebuild `graph.json` from the new state.
   - Re-embed any new `summary` fields into `embeddings.sqlite`.
   - Delete `staging/<runId>/`.
   - Release lock.
4. **Failure**: if any staged entry fails validation, the whole merge aborts. Staging files stay on disk; coordinator retries or surfaces the error. The ledger never reflects a half-built run.

## CLI surface (subset relevant to this protocol)

See [cli.md](./cli.md) for the full surface. KG-relevant subcommands:

| Subcommand                                          | Caller             | Side effects                                  |
| --------------------------------------------------- | ------------------ | --------------------------------------------- |
| `fcc kg:query --slice <path> --top-k 5`             | figma-coordinator  | Read-only; returns JSON of top-K ledger entries (similarity mode) |
| `fcc kg:query --figma-node-id <id>`                 | figma-coordinator  | Read-only; exact instance-reuse lookup (no embeddings) |
| `fcc kg:query --used-by <token> [--match prefix]`   | figma-coordinator  | Read-only; **reverse index** — entries whose `tokensUsed[]` contains the token (its dependents). Inverts the `uses-token` edge. Used by the `onRemovedToken` token-rename path to find which components to patch. No embeddings; linear ledger scan. |
| `fcc kg:stage --run-id <id> --agent <name> --entry <json>` | each builder       | Appends one line to `staging/<runId>/<agent>.jsonl` |
| `fcc kg:merge --run-id <id>`                        | figma-coordinator  | Atomic merge → `ledger.jsonl`; rebuilds graph + embeddings; deletes staging |
| `fcc kg:rebuild`                                    | user (or doctor)   | Rebuilds `graph.json` + re-embeds all summaries from `ledger.jsonl` |

## RAG retrieval contract

`fcc kg:query` retrieves the top-K most-similar prior ledger entries to a manifest slice. Similarity is computed on the `summary` field embeddings.

**Input**: `--slice <path>` points to a one-component JSON file with `{ name, layer, tokensUsed, iconsUsed, summaryHint }`. `summaryHint` is the builder's best-guess summary before code generation — typically derived from the component name + Figma layer description.

**Output**: JSON array, length ≤ `--top-k`, sorted descending by similarity:

```jsonc
[
  {
    "id": "ProductHeroBar",
    "similarity": 0.87,
    "filePath": "src/components/organisms/ProductHeroBar/index.tsx",
    "summary": "Hero bar with title + CTA + dismiss action.",
    "tokensUsed": ["color.brand.primary", "spacing.6"],
    "composes": ["Button", "Heading"],
    "props": [{ "name": "title", "type": "string", "required": true }]
  }
]
```

The coordinator injects these entries (NOT the source files) into the builder's context. The builder reads source on demand via its `Read` tool when it decides a retrieved component is worth composing from.

## When the KG is disabled

When `config.knowledgeGraph.enabled = false`:

- Coordinator skips `fcc kg:query` and `fcc kg:merge` calls entirely.
- Builders skip `fcc kg:stage` calls.
- Skip-when-unchanged still works if the builder hashes the slice and compares against an in-memory cache for the run — but cross-run reuse is gone.

This is the safe-mode default for projects that don't want a persistent KG (e.g., the scaffold's own self-tests).

## Cursor parity

All KG operations are CLI calls — they work identically in Claude Code and Cursor. The instructions for **when** to call them live in each agent's `.md` definition under `.claude/agents/`, `.cursor/prompts/`. The CLI is the only single-source enforcement layer.
