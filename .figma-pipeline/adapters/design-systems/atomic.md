# Atomic Design adapter

> Pure Atomic Design (Brad Frost) — no third-party UI library. Components are built from framework + CSS-system primitives and organised into the canonical atomic layers (atoms / molecules / organisms / templates / pages).

## When to use

`config.designSystem.name == "atomic"`. Pair with `config.components.designMethodology == "atomic"` for the cleanest result; the wizard auto-aligns when both are picked.

Pick this option when you want:

- Atomic-design discipline applied to component placement and composition.
- No external UI-lib dependency — the project owns 100% of its component layer.
- Full control over markup, styling, and accessibility primitives.

Compared to `designSystem.name == "none"`: identical generated code, but the explicit `atomic` choice tells the pipeline to **enforce the atomic-layer rules at build time** (composition direction, no-orphan rule, naming conventions).

## Dependencies

None beyond what the chosen `framework` + `cssSystem` already require. The pipeline does NOT install any UI library.

## Layer model (binding)

| Layer       | What lives here                                            | Composes                          |
| ----------- | ---------------------------------------------------------- | --------------------------------- |
| **Atoms**     | Smallest UI primitives: `Button`, `Input`, `Label`, `Icon`, `Badge`, `Avatar`, `Heading`, `Text`, `Link`. Single concern; no composed children. | Pure HTML primitives + tokens. |
| **Molecules** | Single-purpose composites: `SearchBar`, `FormField`, `Card`, `Breadcrumb`, `PillTabs`. | Atoms only. |
| **Organisms** | Multi-concern sections: `Header`, `ProductCard`, `Footer`, `CommentList`, `CheckoutSummary`. | Molecules + atoms. |
| **Templates** | Page-level layout without data: `ArticleTemplate`, `DashboardTemplate`. | Organisms + slots. |
| **Pages**     | Concrete pages: `HomePage`, `ProductDetailPage`. | Templates + real data. |

**Composition direction is strict** — atoms never import molecules; molecules never import organisms; organisms never import templates. The `component-builder` refuses to emit an upward import and flags it.

## Token mapping

Atomic Design has no opinion on tokens. The `token-builder` runs per its normal `tokens.strategy` (whatever CSS system the project picked — Tailwind v4, vanilla-extract, etc.). No override.

## Component mapping (component-builder)

The component-builder treats this DS as a **methodology overlay** on top of the framework + CSS-system adapters. It does NOT swap in any external components.

What it DOES enforce:

1. **Placement** — `manifest.components[].layer` MUST map 1:1 to the configured `atomicLayout.*Dir`. The fetcher classifies; the builder writes accordingly.
2. **Composition direction** — when emitting an import in a molecule, verify the target is an atom (in `atomsDir`). Refuse + flag on upward import.
3. **Single-concern atoms** — atoms with ≥2 distinct concerns (e.g. a `Card` containing a `Button`) are flagged as misclassified; the coordinator escalates.
4. **No orphan files** — every emitted component must be referenced from a barrel (`atoms/index.ts` etc.). The barrel re-exports alphabetically.

## File template

Standard framework adapter applies — no DS-specific wrapper. For React + Tailwind v4 + atomic:

> The `tw:` prefix in the example below is **illustrative** (shows a configured prefix). Emit it only when `config.cssSystem.config.prefix` is set; most projects have none → emit plain `flex gap-2 items-center`. See `adapters/css/tailwind-v4.md`.

```tsx
// src/components/molecules/SearchBar/SearchBar.tsx
import { Input } from "../../atoms/Input";
import { Button } from "../../atoms/Button";
import { Icon } from "../../atoms/Icon";
import { cn } from "../../../lib/utils";

export interface SearchBarProps {
  placeholder?: string;
  onSearch: (query: string) => void;
  className?: string;
}

export function SearchBar({ placeholder = "Search…", onSearch, className }: SearchBarProps) {
  return (
    <form
      role="search"
      className={cn("tw:flex tw:gap-2 tw:items-center", className)}
      onSubmit={(e) => {
        e.preventDefault();
        const value = (new FormData(e.currentTarget).get("q") ?? "").toString();
        onSearch(value);
      }}
    >
      <Icon name="search" aria-hidden />
      <Input name="q" placeholder={placeholder} aria-label="Search query" />
      <Button type="submit">Search</Button>
    </form>
  );
}
```

## Story idiom

Standard framework + stories-framework adapters apply. No provider decorator required (no UI library means no provider). Story title convention defaults to `Components/{Layer}/{Name}` — `Layer` resolves to one of `Atoms` / `Molecules` / `Organisms` / `Templates` / `Pages`.

```tsx
// SearchBar.stories.tsx
import type { Meta, StoryObj } from "@storybook/react";
import { SearchBar } from "./SearchBar";

const meta = {
  title: "Components/Molecules/SearchBar",
  component: SearchBar,
  tags: ["autodocs"],
  parameters: {
    design: { type: "figma", url: "{{figmaDesignUrl}}" },
    a11y: { test: "error" }
  },
  argTypes: {
    placeholder: { control: "text" },
    onSearch: { action: "search" }
  }
} satisfies Meta<typeof SearchBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
```

## Test idiom

Standard framework + testing-library adapters apply. No DS-specific render wrapper.

## Icon mapping

`icon-generator` falls back to its default behaviour: emit framework-native icon components inside `config.icons.outputDir` (an atom-layer directory by convention). No DS-provided icon set.

## Token-builder behaviour

No override. Tokens are emitted per `tokens.strategy` exactly as if `designSystem.name == "none"`. The Atomic adapter only governs component shape + placement.

## Gotchas

- **`designMethodology` MUST be `atomic`.** The wizard enforces this when `designSystem.name == "atomic"`. Mixing `atomic` DS with `feature-sliced` methodology is rejected at validate-time.
- **Atom granularity drift.** Easy trap: a button that grows into a card. Re-classify and move the file when it stops being single-concern; the builder flags candidates.
- **No upward imports.** Strict rule. If a molecule needs to compose another molecule, lift the shared piece out as an atom or organise it as an organism.
- **Templates are data-less.** Don't fetch in templates; that's the page's job. Component-builder flags any data fetching inside `templatesDir`.
- **One file per atom.** Resist the urge to ship a `Buttons.tsx` with `Primary` + `Secondary` + `Tertiary`. Use variants on a single `Button.tsx` instead.
