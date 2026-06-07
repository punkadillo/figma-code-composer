# React adapter

## When to use
`config.framework.name == "react"`. Sub-variants (`next`, `vite`, `cra`, `remix`, `astro`) share the same templates.

## File template (component)

```tsx
// {{componentDir}}/{{Name}}/{{Name}}.tsx
import { forwardRef } from "react";
{{#if useCva}}import { cva, type VariantProps } from "class-variance-authority";{{/if}}
{{#if classMerger}}import { cn } from "{{classMergerImport}}";{{/if}}

{{#if useCva}}
const {{nameCamel}}Variants = cva(
  "{{baseClasses}}",
  {
    variants: {{variantsObject}},
    defaultVariants: {{defaultVariants}}
  }
);
{{/if}}

export interface {{Name}}Props
  extends React.HTMLAttributes<HTMLDivElement>{{#if useCva}}, VariantProps<typeof {{nameCamel}}Variants>{{/if}} {
  {{propsList}}
}

export const {{Name}} = forwardRef<HTMLDivElement, {{Name}}Props>(
  ({ className, {{destructuredProps}}, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn({{nameCamel}}Variants({ {{variantProps}} }), className)}
      {...rest}
    >
      {{renderBody}}
    </div>
  )
);
{{Name}}.displayName = "{{Name}}";
```

## Props convention
- Figma `variants[]` → `cva` variants object (`size: { sm: "...", md: "...", lg: "..." }`).
- Figma `states[]` (hover, focus, disabled) → pseudo-class variants (`hover:`, `focus:`, `disabled:`) within `baseClasses`.
- Boolean props (`isLoading`, `disabled`) → use `data-*` attributes for styling hooks when CSS system doesn't have a `:has()` workaround.
- **Never narrow a native HTML attribute union.** Extend native props; do NOT
  `Omit<…, "type">`-and-re-add a subset — that silently deletes valid values
  (`email`/`url`/`tel`/`search`/`date`/… — the report-04 `Input` defect). To *react* to a specific value,
  branch on it internally (`if (type === "password") …`) WITHOUT removing the other values from the public
  type. Extend, never replace.

## State idiom
- **`"use client"` is mandatory (hard rule, not a gotcha).** Any file using `useState`/`useEffect`/
  `useReducer`/a stateful event handler under an App-Router/RSC default MUST have `"use client";` as its
  FIRST line. This is a build-breaking omission (report-03 `Input.tsx`), not a style preference.
- Local state: `useState`. Derived values: inline. Never mirror props into state via `useEffect`.
- Controlled component pattern: optional `value` prop + `onValueChange` callback; internal `useState` only when uncontrolled.
- Forwarded refs by default for any leaf-rendering component.

## Style attachment
| `cssSystem.name`       | Attachment                                                     |
| ---------------------- | -------------------------------------------------------------- |
| `tailwind-v4`          | `className` with `{cssSystem.config.prefix}` prefix on utilities |
| `tailwind-v3`          | `className`, no prefix unless configured                        |
| `unocss`               | `className`                                                    |
| `css-modules`          | `import styles from "./{{Name}}.module.css"`; `styles.root`    |
| `css-vars`             | Global classes referenced as plain strings                     |
| `vanilla-extract`      | `import { root } from "./{{Name}}.css"; <div className={root}>`|
| `panda`                | `css()` from `styled-system/css`                               |
| `styled-components`    | `styled.div\`…\`` template with `theme` accessed via `${({ theme }) => …}` |

## Story idiom
```tsx
// {{Name}}.stories.tsx
import type { Meta, StoryObj } from "@storybook/react";
import { {{Name}} } from "./{{Name}}";

const meta = {
  title: "{{storyTitle}}",
  component: {{Name}},
  tags: ["autodocs"],
  parameters: {
    design: { type: "figma", url: "{{figmaDesignUrl}}" },
    a11y: { test: "error" }
  },
  argTypes: {{argTypesObject}},
  args: {{argsObject}}
} satisfies Meta<typeof {{Name}}>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
{{additionalStories}}
```

## Test idiom
```tsx
// {{Name}}.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { {{Name}} } from "./{{Name}}";

describe("{{Name}}", () => {
  it("renders", () => {
    render(<{{Name}} />);
    expect(screen.getByRole("{{role}}")).toBeInTheDocument();
  });
  {{additionalTests}}
});
```

## Gotchas
- **Server Components (Next.js App Router)**: a component with `useState` / `useEffect` needs `"use client";` at the top. Component-builder must detect interactive props and emit the directive.
- **`cva` + `tailwind-merge`**: when both are used, custom token groups MUST be registered in `extendTailwindMerge` or `tailwind-merge` will silently strip them.
- **`useEffect` for prop sync**: forbidden — always derive inline.
- **`React.FC`**: avoid; use explicit return-type-less function components or `forwardRef`.
- **Tailwind v4 prefix order**: always `<prefix>:<modifier>:<utility>`, e.g. `tw:hover:bg-foo`. Inverted (`hover:tw:bg-foo`) compiles to nothing. (**`tw:` is illustrative** — it only applies when `config.cssSystem.config.prefix` is set; most projects have no prefix and emit `hover:bg-foo`. See `adapters/css/tailwind-v4.md`.)
