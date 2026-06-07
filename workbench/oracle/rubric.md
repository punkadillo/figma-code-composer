# Quality judge rubric

Each judge agent scores ONE dimension 0–100 for the generated component, given:
its source, stories, tests, docs, and the HeroUI reference (oracle). Return
`{ score, rationale }`. Score against these criteria; be calibrated, not generous.

## optimizedCode (0–100)
- 90–100: idiomatic React, no dead code, memoized where it matters, no needless re-renders, minimal/clean deps.
- 50–89: works and is readable but has redundancy, missed memoization, or awkward structure.
- 0–49: copy-paste bloat, dead code, obvious performance foot-guns, or non-idiomatic patterns.

## dx (developer experience) (0–100)
- 90–100: clear typed props, intuitive names, composable API, sensible defaults, matches React conventions.
- 50–89: usable but with unclear prop names, weak types, or awkward composition.
- 0–49: untyped/any-typed, confusing API, hard to consume.

## docs (0–100)
- 90–100: clear purpose, prop table, at least one usage example, accurate.
- 50–89: present but thin or missing a prop table / example.
- 0–49: absent, placeholder, or misleading.

## testDepth (edge-case coverage) (0–100)
- 90–100: covers default + disabled/loading/error + empty + boundary + a11y/role assertions.
- 50–89: covers the happy path and a couple of states.
- 0–49: trivial render-only test or none.

## storybook (0–100)
- 90–100: a story per meaningful state/variant, controls/args wired, renders cleanly.
- 50–89: a few stories, some states missing.
- 0–49: single default story or broken render.
