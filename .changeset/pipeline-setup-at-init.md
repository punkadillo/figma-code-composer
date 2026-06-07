---
"figma-code-composer": minor
---

Push detection, provisioning, and validation upstream so builders assemble against a complete, grounded plan instead of discovering project reality mid-build. Applies to both Claude Code agents and Cursor prompts.

- **Setup-at-init (no command-time failures).** The wizard now provisions each enabled track's one-time framework setup (Tailwind entry CSS + `@source`, `vitest.config` with the e2e separation already correct — including a `projects`/`.e2e` split for co-located e2e — `playwright.config`, `.storybook/`) and installs project devDeps; Playwright browsers stay user-run/verify-after. It never edits user-authored config files (greenfield write / brownfield instruct-and-verify). The coordinator verifies setup at pre-flight and aborts cleanly before spawning any specialist rather than failing mid-run.
- **Complexity scoring fix.** The coordinator feeds the real (disk- or ledger-based) `tokenReuseRatio` into the scorer before resolving the tier, eliminating the false reuse penalty that over-tiered components; the fetcher now emits canonical tiers only (`trivial|moderate|complex|extreme`), never ad-hoc labels.
- **Plan-mode inventory.** A cold-start inventory grounds existing assets, real on-disk token names, Figma↔disk token deltas, and house style, passed to builders as buildPlan directives.
- **Dark mode.** token-builder emits `[data-theme]` blocks from manifest dark values on component builds too; the fetcher hardens dark-alias resolution (flag, never fabricate).
- **Docs.** story-author emits a lightweight component MDX doc per component.
- **Fetcher reliability.** Resume output is disk-validated before use; the manifest root `configSnapshot` is always populated; the coordinator re-passes `configSnapshot` to every follow-up spawn.
- **Icons.** Vector-before-raster extraction, raster flagged as a fidelity gap, correct `{...props}`/`style` spread order, and type-only imports for `verbatimModuleSyntax`.
- **Config.** The wizard wires a `knowledgeGraph` block (opt-in, default off) and a `setup` audit block; schema adds `writeScope.setupFiles`, `stories.testUtilsImport`, and `tests.unit.{excludeE2E,setupFile}`. The frozen-paths hook authorizes wizard-provisioned setup files via `writeScope.setupFiles`.
