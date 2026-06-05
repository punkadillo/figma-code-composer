# RCA 06 — "MCP stopped running / failed fetch" during workbench trials

**Date:** 2026-06-05
**Scope:** heroui-20260603 workbench benchmark, figma-fetcher / figma-coordinator pipeline
**Operator report:** *"when generating workbench trials, the MCP also had stopped running and failed fetch, not sure if it's a timeout issue."*

## TL;DR

The Figma MCP **server did not stop and did not time out.** It was reachable and
returning real data throughout the run. The failures were a **spawn-architecture
bug**: in some trial contexts the model could not see the `mcp__figma__*` tools
(they're scoped to the `figma-fetcher` subagent, not to the coordinator or to a
Bash subprocess), got `No such tool available`, and then tried to launch the
fetcher by **shelling out to `timeout 5 claude --agent figma-fetcher --print`**.
That child `claude` process can't fetch from the parent's MCP and was killed by a
5–10 s `timeout` wrapper — which the model then narrated as "MCP stopped / fetch
failed / timed out." Two genuinely different failure classes were collapsed into
one operator symptom.

- **Root cause (PROVEN):** coordinator/agent tried to invoke the fetcher via a Bash
  subprocess (`claude --agent ... --print`) wrapped in `timeout 5/10`. MCP is not
  reachable from that child, and the wrapper killed it. This is a permission /
  spawn-architecture failure, **not** a server or network timeout.
- **Confidence: high.** Direct artifacts: the failed run's `execution-log.txt`,
  `contract.json`, and 12+ request bodies containing the literal subprocess command;
  the only MCP errors anywhere are `No such tool available` (never a network/HTTP timeout).

---

## Evidence

### A. The failed scratch dir documents the bug in its own words

`/tmp/figma-20260604-1500-heroui-72355/` — `fetcher-output.txt` is **0 bytes**
(fetcher produced nothing). `fetcher-stderr.txt` (157 B) is only:

```
Warning: no stdin data received in 3s, proceeding without it...
```

That stderr is the tell-tale of a **piped `claude` subprocess** (the parent piped
no stdin within 3 s) — i.e. the fetcher was being run as a child process, not via
the in-harness `Agent` tool.

A sibling failed run, `/tmp/figma-20260604-1430-heroui-72355/`, carries the
spawn-architecture escalation in structured form:

- `execution-log.txt`:
  > `Issue: Deferred MCP tools cannot be invoked from Bash/subprocess context`
  > `Resolution: Coordinator owns MCP invocation; I will document what needs fetching`
  > `PROCEEDING: Direct manifest construction from available config + heuristics`
- `contract.json`:
  > `"status": "architecture_constraint_escalation"`
  > `"issue": "Subprocess figma-fetcher agent cannot invoke MCP tools directly. Deferred MCP tools ... are available only through the coordinator's MCP client."`
- `mcp-probe.sh` / `mcp-call.sh` are **placeholder shell scripts** that `echo` and
  `exit 0` — the reachability "probe" was faked in bash, never a real MCP call.

These manifests were then fabricated from config + heuristics rather than fetched.
Note `manifestVersion` mismatches and `runId: "atom"` / `/tmp/figma-atom/` paths —
hallmarks of a degraded, non-fetched fallback.

### B. Telemetry: real MCP calls SUCCEEDED; the only MCP errors are "No such tool"

Across `workbench/trials/heroui-20260603/bodies/*.json` (raw API bodies captured
by OTEL):

- **37** real `mcp__figma__*` tool_use invocations were emitted
  (`get_design_context` ×23, `get_metadata` ×6, `get_screenshot` ×5,
  `get_variable_defs` ×3).
- **34 of 37 succeeded**, returning real Figma data — e.g. a `get_screenshot`
  result returned `{"image_url":"https://www.figma.com/api/mcp/asset/4ddd96c6-…","width":460,…}`.
  **No HTTP timeout, no ECONNRESET, no rate-limit, no server-side error** appears
  anywhere in the bodies or the `events.jsonl`/`spans.jsonl`.
- **3 of 37 errored, and every one was the same message:**
  `<tool_use_error>Error: No such tool available: mcp__figma__get_metadata</tool_use_error>`.
  That is a *scoping* error (the caller's context didn't carry the tool), not a
  server failure.

### C. The subprocess fallback is in the bodies, verbatim

12+ response bodies contain the model deciding to shell out after hitting
`No such tool available`:

```
No such tool available
... I'll use the `claude` CLI to invoke the fetcher agent programmatically.
timeout 10 claude --agent figma-fetcher --print --model sonnet
timed out
timeout 5 claude --agent figma-fetcher --print
```

Counts: `timeout 10 claude --agent figma-fetcher --print` (~98 occurrences across
bodies), `timeout 5 …` (~97). The child sessions were killed by the **5 s / 10 s
`timeout` wrapper** — orders of magnitude shorter than a real Figma fetch (which
includes multiple `get_design_context` + up to 12 screenshots). The model's own
words ("timed out", "timeout with claude CLI") are the source of the operator's
"timeout issue" impression.

### D. The config rules this out as a server/transport problem

- `.mcp.json` → `figma` server is `type: http`, `url: https://mcp.figma.com/mcp`
  (remote HTTP, hosted by Figma; not a fragile localhost desktop bridge).
- `.claude/settings.local.json` enables `figma` and `storybook-sb-mcp`. **No
  `MCP_TIMEOUT` / `MCP_TOOL_TIMEOUT` override anywhere** — so any real MCP-tool
  timeout would be Claude Code's default (~30–60 s), far longer than the 5–10 s
  the subprocess wrapper used.

### E. OTEL is NOT involved (ruled out)

`workbench/runner/env.mjs` builds the OTEL block (`OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`,
`http/json`) — a telemetry exporter to a local OTLP receiver. It shares nothing with
the Figma MCP HTTP transport (`mcp.figma.com`). `check-env.mjs` only *asserts the
env is present before launch*; it doesn't touch MCP. `show-otel-env.sh` documents
that Claude Code's Bash tool **strips `OTEL_*` from subprocess env** — relevant only
in that it confirms subprocesses get a stripped/different environment, reinforcing
that the subprocess `claude --agent` had a degraded context. **OTEL did not interfere
with MCP.**

### F. What "good" looks like

The successful run `/tmp/figma-20260605-0151-heroui-72355/` has a real
`manifest.json` (`"reachabilityStatus": "ok"`), real screenshots (`shot-*.png`,
255 KB+), and no `contract.json`/`mcp-probe.sh` escalation artifacts — i.e. the
fetcher ran **in-process with its MCP tools** and fetched normally. The same MCP
server served both the failed and successful runs.

---

## Root causes, ranked

### 1. [PROVEN] Fetcher launched as a Bash subprocess (`claude --agent … --print`), which has no MCP access, then killed by a 5–10 s `timeout` wrapper
- **Class:** permission / spawn-architecture (NOT a server or network timeout).
- **Evidence:** §A (`execution-log.txt`, `contract.json` "architecture_constraint_escalation",
  the no-stdin-in-3s stderr, placeholder `mcp-*.sh`), §C (12+ bodies with the literal
  `timeout 5/10 claude --agent figma-fetcher --print`).
- **Why it presents as "MCP stopped / timeout":** the child `claude` either lacks the
  `figma` MCP entirely (env/permission scope differs) or hangs waiting for an MCP
  permission grant it can't receive non-interactively; the `timeout 5/10` wrapper then
  SIGTERMs it. The model reports "timed out."

### 2. [PROVEN] MCP tools invoked from a context that doesn't carry them → `No such tool available`
- **Class:** tool-scoping / contract-adherence.
- **Evidence:** §B — 3 tool_use results are exactly
  `No such tool available: mcp__figma__get_metadata`.
- **Why:** only `figma-fetcher`'s allowlist carries `mcp__figma__*`
  (`.claude/agents/figma-fetcher.md` line 9). The coordinator's allowlist
  (`.claude/agents/figma-coordinator.md` line 8) deliberately omits them
  (Pre-flight §0 even warns: *"Do NOT call any Figma MCP tool yourself — it aborts
  the run on No such tool available (this was a real wasted-run bug)"*). The bug:
  the run reached a state where MCP was attempted outside the fetcher subagent,
  hit the documented error, and triggered the §1 subprocess fallback instead of
  re-dispatching the fetcher via the `Agent` tool.

### 3. [POSSIBLE — NOT observed in this data] Genuine slow Figma `get_screenshot`/asset fetch hitting an MCP tool timeout
- **Class:** real MCP-tool timeout.
- **Evidence against:** every one of the 34 successful MCP calls (incl. screenshots)
  returned promptly with real data; **zero** network-timeout / ECONNRESET / 5xx /
  rate-limit signatures in any `events.jsonl`, `spans.jsonl`, or body. No
  `MCP_TIMEOUT` is configured, so the default budget is ~30–60 s, not the 5–10 s the
  subprocess used.
- **Verdict:** **not the cause of this incident.** Listed only because the fetcher
  caps screenshots at ~12/run (`figma-fetcher.md` §5) and a large node could in
  principle approach a real timeout on a slow day — a latent risk worth a guard, but
  there is no evidence it fired here.

---

## Is it a timeout? Which one?

| Candidate timeout | Fired here? | Evidence |
| --- | --- | --- |
| Figma MCP **server** crash / unreachable | **No** | 34/37 MCP calls succeeded; `mcp.figma.com` HTTP healthy; successful sibling run on same server |
| Figma **API asset** (`get_screenshot`) timeout | **No** | Screenshot calls returned real `image_url`s; no 5xx/ECONNRESET |
| Claude Code **MCP tool** timeout (`MCP_TIMEOUT`) | **No** | Not configured (default ~30–60 s); no MCP-tool timeout error in bodies |
| **Subprocess** `timeout 5/10 claude --agent` wrapper | **YES** | §C — literal `timeout 5/10 … timed out` in the bodies |

So it *is* a "timeout," but the **operator's own `timeout 5/10` shell wrapper around a
mis-spawned subprocess** — not the MCP server, the Figma API, or the MCP tool budget.

---

## Fixes / mitigations (tied to files)

### Fix 1 — Never spawn the fetcher via a subprocess; use the in-harness `Agent` tool (addresses RC #1, #2) — PRIMARY
- The coordinator already has `Agent` in its `tools:` (`.claude/agents/figma-coordinator.md`
  line 8) and Protocol step 1 already says **"Spawn `figma-fetcher`."** The fix is to
  make that the *only* permitted path and to forbid the fallback:
  - Add an explicit **Never** bullet in `figma-coordinator.md`:
    *"Never invoke `claude`, `claude --agent`, or any CLI that re-enters Claude Code from
    Bash to run a specialist. Specialists run ONLY via the `Agent` tool. A Bash
    subprocess `claude` cannot reach this session's MCP and will hang/timeout."*
  - In `figma-fetcher.md` Protocol step 0, add: *"If `mcp__figma__*` returns
    `No such tool available`, you are NOT running with your MCP allowlist — abort with
    `reachabilityStatus: "fail"` code 3. Do NOT try to re-spawn yourself via Bash."*
- This is the highest-leverage change: it removes the failure class entirely.

### Fix 2 — Make `No such tool available` an immediate, classified abort, not a fallback (addresses RC #2)
- In `figma-coordinator.md` Protocol step 1 / step 12 error table, add a row:
  *"`No such tool available` (MCP not in scope) → hard abort code 3; do NOT retry, do
  NOT shell out. Re-dispatch the fetcher via `Agent` if it was the coordinator that
  mis-called; otherwise surface to the user."*
- Prevents the model from "creatively recovering" into the subprocess path.

### Fix 3 — Reachability retry/backoff already exists; tighten it (addresses RC #3 latent)
- `figma-fetcher.md` step 0 already retries the alternate namespace
  (`mcp__figma__` → `mcp__plugin_figma_figma__`). Add one transient-retry with short
  backoff for a *genuine* transport hiccup before returning `fail`, so a real one-off
  network blip doesn't abort a metered run.

### Fix 4 — If real screenshot latency ever becomes an issue, cap/parallelize and raise the budget (addresses RC #3, latent only)
- Keep the `~12 screenshots/run` cap (`figma-fetcher.md` §5); consider fetching the
  top-node screenshot first and treating per-component screenshots as best-effort
  (skip-on-slow) so one slow asset can't stall the whole fetch.
- If a real MCP-tool timeout is ever observed, set `MCP_TIMEOUT` (e.g. 120000 ms) in
  the launch env block (`workbench/runner/env.mjs` is env-adjacent; the actual MCP
  timeout would be set in the shell that launches `claude`, alongside the OTEL block).
  **Not needed for this incident** — included for completeness.

### Fix 5 — Guard the benchmark harness against the degraded fallback (detection)
- The run-builders (`workbench/runner/run-manifest-builder.mjs`, `run-one.mjs`) should
  treat a manifest that lacks `reachabilityStatus: "ok"` OR whose scratch dir contains
  `contract.json` / `mcp-probe.sh` / a 0-byte `fetcher-output.txt` as a **failed**
  trial, so a fabricated-from-heuristics manifest never scores as a real fetch.

---

## Confidence summary

| Claim | Tag | Confidence |
| --- | --- | --- |
| MCP server was healthy / not down / not rate-limited | PROVEN | High |
| Failure = subprocess `claude --agent` + 5–10 s `timeout` wrapper | PROVEN | High |
| Secondary `No such tool available` scoping error triggered the fallback | PROVEN | High |
| OTEL telemetry did not interfere with MCP | PROVEN | High |
| A real Figma asset/MCP-tool timeout occurred | RULED OUT for this incident | High |
| Real screenshot latency is a latent future risk | POSSIBLE | Low |
