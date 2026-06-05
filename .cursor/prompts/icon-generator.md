# Cursor icon-generator prompt

Mirror `.claude/agents/icon-generator.md`. Cursor reads Figma MCP via its own server config. Delta:
execute the `buildPlan` directive fields (`fillModel`, `a11y`) as decided by the coordinator — do not
re-derive them. See `## Execute the directive — do not re-reason` in the agent file.
