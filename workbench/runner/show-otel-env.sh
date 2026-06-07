#!/usr/bin/env bash
# workbench/runner/show-otel-env.sh
#
# Recover the live OTEL_* telemetry vars for the current Claude Code session.
#
# Claude Code's Bash tool strips every variable with the `OTEL_` prefix from the
# environment it hands to subprocesses (a denylist: CLAUDE_CODE_*, FP_*, and all
# other vars pass through untouched). So a plain `echo $OTEL_*` / `env | grep OTEL`
# inside a tool call always comes back empty — the vars are NOT unset, they just
# aren't inherited by the child.
#
# They DO live in the `claude` process that spawned this subprocess, which
# inherited them from the launching terminal. Proven on darwin 2026-06-04:
# `ps eww -p <claude-pid>` prints the full OTEL_* block. (The earlier assumption
# that "ps eww is blind on this Mac" was wrong.)
#
# This script walks up the parent-process chain to the nearest `claude` ancestor
# and reads its environment. Walking (vs. a fixed $PPID) keeps it correct whether
# it's run inline, as `bash show-otel-env.sh`, or nested another level deep.
#
# Usage:  bash workbench/runner/show-otel-env.sh
# Output: the OTEL_* + telemetry-toggle vars as KEY=VALUE, one per line, sorted.
# Exit 1 if no `claude` ancestor is found (i.e. not inside a Claude Code session).

set -euo pipefail

find_claude_pid() {
  local pid=$PPID comm
  while [ -n "$pid" ] && [ "$pid" -gt 1 ]; do
    comm=$(ps -o comm= -p "$pid" 2>/dev/null || true)
    case "$comm" in
      */claude | claude)
        echo "$pid"
        return 0
        ;;
    esac
    pid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
  done
  return 1
}

claude_pid=$(find_claude_pid) || {
  echo "✖  No 'claude' ancestor process found — not inside a Claude Code session?" >&2
  exit 1
}

# `ps eww` renders the target process's argv + env space-separated. Split on
# spaces and keep only the telemetry-relevant assignments. (OTEL values here are
# endpoints / config constants / a spaceless file path, so naive space-splitting
# is safe for this set.)
matches=$(
  ps eww -p "$claude_pid" \
    | tr ' ' '\n' \
    | grep -E '^(OTEL_|CLAUDE_CODE_ENABLE_TELEMETRY=|CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=|FP_OTEL_VERIFIED=)' \
    | sort
) || true

if [ -z "$matches" ]; then
  echo "✖  Found claude (pid $claude_pid) but no OTEL_* vars in its env." >&2
  echo "   Telemetry was NOT configured before launch — runs would capture nothing." >&2
  exit 1
fi

echo "# OTEL telemetry env (live, read from claude pid $claude_pid):"
echo "$matches"
