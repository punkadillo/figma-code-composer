---
"figma-code-composer": minor
---

Coordinator resilience + autonomy, and generated-code comment economy.

- **Crash-recovery & resume.** The figma-coordinator now writes a durable per-run checkpoint and can resume a crashed run — restoring the manifest + buildPlan, validating against disk (anti-confabulation), and re-dispatching only the unbuilt components/icons. Adds bounded backoff on API overload (HTTP 529) before the single retry.
- **Token reverse-lookup.** New `fcc kg:query --used-by <token>` mode lists a token's dependent components (with a graceful in-context fallback for older `fcc`), powering surgical token-rename updates.
- **Autonomy policy (`config.autonomy`).** An opt-in `autonomous` level resolves mid-run decision gates — unbound values, framework/CSS or library mismatch, removed tokens, ambiguous selection — from a pre-recorded policy instead of blocking, logging every decision to the handover for async review. Token/stack changes prefer an in-place `update` over a from-scratch rebuild. Defaults to `interactive`, so existing projects see no behavior change; genuinely unsafe gates (page-selected, recursion cycle, MCP/setup aborts) always stop.
- **Comment economy in generated files.** Builders now emit minimal, single-line inline comments capped at 80 characters (no narrative block/banner/restating comments), while concise `/** … */` JSDoc on the public component/prop API stays encouraged. Cuts output tokens on every build without sacrificing API docs.
