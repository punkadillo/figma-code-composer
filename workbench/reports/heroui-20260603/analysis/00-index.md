# Workbench Analysis — `heroui-20260603`

Index of the analysis reports produced from the 7-run HeroUI live trial, comparing the agent-generated `target/` against the HeroUI v3.1.0 oracle (`ref-heroui/`).

> Scope note: this trial ran with `designSystem: none` / atomic methodology. The oracle (HeroUI) is a `react-aria-components` + `tailwind-variants` design system. Several "differences" below are therefore **by-design divergence**, not defects — the reports flag which is which.

## Reports

| # | Report | Question it answers |
|---|---|---|
| 01 | [Accuracy feasibility](./01-accuracy-feasibility.md) | Can an accuracy report be generated from the on-disk source? (Partially — see below.) |
| 02 | [Oracle component mapping](./02-oracle-component-mapping.md) | What is each rung's oracle, and is it usable for scoring? |
| 03 | [Generation vs ref differences](./03-generation-vs-ref-differences.md) | How does the agent build each component vs how HeroUI does? |
| 04 | [Improvements & agent tuning](./04-improvements-and-agent-tuning.md) | What to fix, and which agent lever changes it? |
| 05 | [Figma tokens setup comparison](./05-figma-tokens-setup-comparison.md) | Which Figma tokens are missing/mis-wired vs the oracle DS? |
| 06 | [MCP fetch-failure RCA](./06-mcp-fetch-failure-rca.md) | Why did the MCP "stop / fail fetch" during trials? |
| 07 | [Source-fidelity & quality scorecard](./07-source-scorecard.md) | The accuracy/quality that **was** computed this run (gates + 5-dim quality + rationales). |
| 08 | [Render harness & computed accuracy](./08-render-harness-notes.md) | **Update:** accuracy is now computed live (visual/style/struct·dom vs HeroUI Storybook) — scores, harness, and the build-fixes applied to render. |

Cost/telemetry rollup (the deterministic half) lives in the parent dir: [`../report.md`](../report.md) and [`../trialset.json`](../trialset.json).

## Headline findings

- **Accuracy is computable only in part from source.** Quality (5-dim judge), build-gates, and structural can run on the on-disk source; **visual + style (~65% of composite weight) need live rendering** (Playwright/Storybook). `page` has no source oracle at all. → see the **Source-fidelity scorecard** added to [`../report.md`](../report.md).
- **Architecture divergence is the cross-cutting theme.** Oracle = react-aria + `tailwind-variants` recipes + `@heroui/styles`; agent = hand-rolled inline-Tailwind. Legitimate under `designSystem: none`, but it means strict visual/style fidelity scoring would penalize a deliberate choice.
- **Real bugs the agent shipped:** `Input.tsx` uses `useState` with no `"use client"`; Card/Form inline unbound values with `TODO[figma-bind]` (violates binding rule 4 — Alert obeyed it); `Form` has a failing className-merge test.
- **Tokens collapsed:** the 3-file split is physically present but logically empty below `primitives.css`; single-node Alert fetch captured ~20–25% of one mode vs the oracle's 140+ vars across 2 modes.
- **MCP "failure" was self-inflicted [PROVEN]:** the fetcher was launched as a `timeout 5/10 claude --agent … --print` subprocess with no MCP access, then killed by the wrapper — not a server/network timeout. 34/37 real MCP calls succeeded.

## Provenance
- Generated artifacts under scoring: `workbench/trials/heroui-20260603/target/src/components/`
- Oracle: `workbench/trials/heroui-20260603/ref-heroui/packages/react/src/components/` + `…/packages/styles/`
- Manifest the Alert run consumed: `/tmp/figma-20260605-0151-heroui-72355/manifest.json`
- Nothing in these reports has been committed.
