# Cursor figma-fetcher prompt

Mirror `.claude/agents/figma-fetcher.md`. Cursor reads Figma MCP via its own server config; everything else identical.

Cursor deltas (MCP failure path):

- **Never self-respawn via Bash.** If MCP tools are unreachable, do NOT attempt `claude --agent figma-fetcher --print` or any subprocess — you have no MCP scope there and the run wrapper will kill it. Return `reachabilityStatus: "fail"` (code 3) and stop.
- **One transient retry.** Before declaring `fail`, retry the `get_metadata` probe once after a short backoff (covers a genuine transport hiccup); only a second failure returns `fail`.

Cursor delta (full-variable mode for DS / token builds):

- **Node-scoped (default — component builds):** `get_variable_defs` for the variables the walked nodes bind only.
- **Full-variable mode (`scope ∈ {tokens-only, full}` on a design-system build):** enumerate ALL collections and ALL modes — not just the variables the selected node binds. This fixes the "~25% of one mode" token collapse seen in workbench analysis (oracle: 140+ variables across 2 modes; node-scoped fetch: ~33 tokens in one mode). A DS/token build must capture the whole variable space (every mode, every collection — colors, spacing, radius, shadows/effects, easing, typography, blur). For each variable emit `{ type, value (default mode), modes: { <mode>: <value>, … } }`. Cap at ≈1000 variables; if a collection would exceed it, emit a non-blocking ambiguity recording the collection name + count rather than truncating silently.
- **Never resolve a variable to a hex/rem yourself — preserve the path** (binding rule 3).

Cursor delta (layer classification):

- **Classify by INTENT signals, not node depth alone** — see `protocols/component-layout.md` § Layer resolution. Record `layerConfidence` (`high|medium|low`) for every atomic-methodology component. Surface `low` confidence as a non-blocking ambiguity so the coordinator's think-once pass (Step 8.5) resolves it rather than silently down-grading the tier.

Cursor delta (complexity tier — canonical enum only):

- **Compute `score`/`tier` strictly from `protocols/complexity.md` — never emit ad-hoc labels.** `tier ∈ {trivial, moderate, complex, extreme}` only; NEVER `high`/`medium`/`low`. Run the formula; don't eyeball a label (a fabricated `tier:"high", score:94` for a 44.9/moderate component was a real defect). Emit `tokenReuseRatio: 0` as a placeholder — the coordinator overwrites it with the real disk/ledger ratio before routing.

Cursor delta (dark-mode alias resolution):

- **Per-mode capture is mandatory; a missing dark value is a flag, not a silent drop.** When a non-default mode resolves to an unfollowable alias, re-resolve once via the variables API; still unresolvable → emit the mode value as `null` + a non-blocking ambiguity. Never fabricate a dark value (the Switch `foreground/*` dark-alias gap).

Cursor delta (resume discipline — untrusted until disk-validated):

- A resumed fetch after a socket drop is **untrusted**. Before emitting: confirm `fileKey` equals the original URL's, `intent` equals the request, and `components[]` decompose the *requested* node (not a list of on-disk components). Token/hex values produced by a resume are suspect — prefer `null` + ambiguity over a hallucinated value. Any mismatch → discard, request a fresh focused re-fetch. (A Calendar resume once confabulated a wrong `fileKey` + `intent:update` + hallucinated hex.)

Cursor delta (self-describing manifest):

- **Embed the `configSnapshot` in the manifest root — never `null`.** The on-disk manifest must be self-describing; don't rely on the chat-return echo alone.
