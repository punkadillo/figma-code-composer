# Brevit wire-format protocol

Brevit (`npm install brevit`, JSON **Flatten** mode) is an **opportunistic, size-guarded** token-efficient
**wire format** for inter-agent payloads. It is NOT a storage format, and it is NOT applied blindly.

## How it works (measured reality)
Brevit's real Flatten mode mangles nested arrays-of-objects, so the wrapper pre-flattens JSON to a flat
dotted-path dict before encoding. That makes brevit **smaller than JSON only for flat, wide, scalar
payloads** (e.g. a large token dict); it **inflates** deep/sparse payloads (manifest slices, buildPlan).
Therefore the wrapper is **size-guarded**: `fcc brevit:encode` emits the wire form ONLY when it both
round-trips AND is strictly smaller than the JSON — otherwise it emits raw JSON. Callers can always pipe
through it safely; it never inflates and never loses data.

## Encode set (pipe these in-context handoffs through `fcc brevit:encode`)
- Builder directive slices passed in an `Agent` spawn prompt.
- The `buildPlan` (coordinator → builders).
- Specialist return contracts (builder → coordinator final message).
- In-context KG stage payloads.
(For most of these the size-guard will keep JSON; the flat-wide ones — e.g. token dicts — compress.)

## Never-encode set (stay raw JSON on disk — `jq`/`fcc` parse them)
- `/tmp/figma-<runId>/manifest.json` (canonical manifest), `build-plan.json`.
- `costs.jsonl`, `lessons.md`, KG ledger entries, all `config.*` files.

## Hard rules
1. **Flatten mode only. Abbreviation OFF.** Text (TextRank) and image (OCR) modes are FORBIDDEN on any
   pipeline payload — they are lossy and would destroy Figma variable paths.
2. **Size + round-trip guard.** `fcc brevit:encode` (via `safeEncode`) emits the wire form only when it
   round-trips AND is smaller than JSON; else raw JSON. Never inflates, never loses data.
3. **Binding-rule-3 guard.** Brevit must round-trip Figma variable paths (e.g.
   `color/surface/brand-primary`) byte-exact; a path that fails forces raw-JSON fallback — never a
   silently mangled path.
4. **Graceful degradation.** If `brevit` is absent/broken, `fcc brevit:*` is identity passthrough (raw
   JSON). A missing brevit never breaks a build.

## Usage
- Encode a slice: `fcc brevit:encode slice.json` → wire text (or JSON if not smaller) for the prompt.
- Decode for tooling: `fcc brevit:decode < payload` → JSON (scalars come back as strings — documented drift).
