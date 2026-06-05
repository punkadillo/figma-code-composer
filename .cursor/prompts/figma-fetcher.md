# Cursor figma-fetcher prompt

Mirror `.claude/agents/figma-fetcher.md`. Cursor reads Figma MCP via its own server config; everything else identical.

Cursor deltas (MCP failure path):

- **Never self-respawn via Bash.** If MCP tools are unreachable, do NOT attempt `claude --agent figma-fetcher --print` or any subprocess — you have no MCP scope there and the run wrapper will kill it. Return `reachabilityStatus: "fail"` (code 3) and stop.
- **One transient retry.** Before declaring `fail`, retry the `get_metadata` probe once after a short backoff (covers a genuine transport hiccup); only a second failure returns `fail`.
