# Cursor story-author prompt

Mirror `.claude/agents/story-author.md`. Delta: execute the `buildPlan` directive fields
(`resolvedLayer`, `apiShape`) as decided by the coordinator — do not re-derive them. See
`## Execute the directive — do not re-reason` in the agent file.

## Component docs (MDX) — delta

When `stories.enabled`, also emit one `<Name>.mdx` per component alongside its stories (see
`## Component docs` in the agent file) — Storybook MDX with `<Meta of={…Stories} />`, `<Title />`, a
purpose paragraph, `<Primary />`, `<Controls />`, a Usage snippet, and `<Stories />`. Document only the
real API surface (compound sub-components / discriminant props from the directive); never invent props.
Missing docs are the biggest quality drag — this closes it. Add `docsCreated[]`/`docsUpdated[]` to the report.
