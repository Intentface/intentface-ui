# Design System & Theme

A reference for the token system, theming mechanism, and component conventions used in this project. Aimed at agents bootstrapping a similar setup in another codebase.

## Stack

- **Tailwind CSS v4** — tokens declared in CSS via `@theme inline`, no `tailwind.config.js`
- **next-themes** — dark/light switching by toggling a `.dark` class on `<html>`
- **Base UI** (`@base-ui/react`) — headless accessible primitives
- **CVA** (`class-variance-authority`) — variant matrices for component styling
- **`cn()`** helper (`lib/utils.ts`) — `clsx` + `tailwind-merge` for class merging

## Token Architecture

Three layers, each cascading into the next:

```
Seeds (4 vars)  →  Derived semantic tokens  →  Tailwind utility classes
```

### Layer 1 — Seeds

Four variables in `:root`. Everything else is computed from them.

```css
:root {
  --bg: oklch(1 0 0); /* #ffffff, background hue */
  --fg: oklch(0.2103 0.0059 285.89); /* #18181b, foreground hue */
  --acc: oklch(0.5286 0.1734 254.97); /* #0169cc, accent hue */
  --con: 0.3; /* contrast multiplier (0–1) — scales every state delta */
}
```

Write the color seeds in `oklch()`, never hex. Surfaces derive from the seeds with `oklch(from var(--bg) … c h)`, and Chrome 157 converts a near-gray hex such as `#18181b` to OKLCH with a `none` hue, which resolves to 0°. The seed keeps its chroma, so every derived surface turns pink while the seed itself still looks gray. An `oklch()` seed keeps its hue as written. The theme configurator picks hex, so `hooks/use-theme-overrides.ts` converts it with `formatOklch` (`lib/oklch.ts`) before setting the seed. The `browserslist` in `package.json` keeps Firefox at 113 or later for the same reason: Next's CSS compiler rewrites `oklch()` as hex and `lab()` for any target without `oklch()` support.

`.dark` overrides the seeds, several surface base values, and two of the deltas — dark mode isn't just "swapped seeds":

```css
.dark {
  --bg: oklch(0.2103 0.0059 285.89); /* #18181b */
  --fg: oklch(0.9674 0.0013 286.38); /* #f4f4f5 */
  --acc: oklch(0.6754 0.1409 250.69); /* #4c9bea */

  /* Surface bases retuned for dark — see the table below */
  --base-bg: var(--bg);
  --primary-bg: color-mix(in oklch, var(--bg), var(--fg) calc(12% * var(--con)));
  --secondary-bg: color-mix(in oklch, var(--bg), var(--fg) calc(3% * var(--con)));
  --tertiary-bg: color-mix(in oklch, var(--bg), var(--fg) calc(20% * var(--con)));
  --quaternary-bg: color-mix(
    in oklch,
    var(--bg),
    var(--fg) calc(56% * var(--con))
  );

  /* Subtler state deltas in dark */
  --mix-active: calc(18% * var(--con));
  --mix-border: calc(20% * var(--con));
}
```

The `-bg-hover`, `-bg-active`, and `-border*` derivatives don't need redefining — their `:root` formulas reference `var(--primary-bg)`, `var(--mix-hover)`, etc., so they automatically pick up the dark base values. The `--accent-*` family also cascades from `:root` (only the `--acc` seed changes).

Two structural shifts to be aware of:

- **`--base-bg` and `--primary-bg` swap roles between modes.** In light, `--primary-bg` _is_ `--bg` and `--base-bg` is slightly darker; in dark, `--base-bg` _is_ `--bg` and `--primary-bg` is slightly lifted. The body background stays anchored to `--base-bg` in both modes.
- **Quaternary is much stronger in dark** (56% vs 24%) so it stays visible against the dark base.

### Layer 2 — Derived semantic tokens

All surfaces and text colors are mixed from the seeds via `color-mix(in oklch, ...)`. Every surface family has six states: `-bg`, `-bg-hover`, `-bg-active`, `-border`, `-border-hover`, `-border-active`. Border states stack from the border token (border delta first, then the state delta on top), so a hovered border keeps its separation from the hovered background.

**Shared deltas** scale with `--con`:

```css
--mix-hover: calc(16% * var(--con));
--mix-active: calc(20% * var(--con));
--mix-border: calc(24% * var(--con));
```

**Surface families** (each with `-bg-hover`, `-bg-active`, `-border`, `-border-hover`, `-border-active` variants):

| Token             | Role                               | Light mix from `--bg` | Dark mix from `--bg` |
| ----------------- | ---------------------------------- | --------------------- | -------------------- |
| `--base-bg`       | body background                    | `fg 10% × con`        | `var(--bg)`          |
| `--primary-bg`    | cards, inputs, dropdowns, composer | `var(--bg)`           | `fg 12% × con`       |
| `--secondary-bg`  | panels, sidebar                    | `fg 4% × con`         | `fg 3% × con`        |
| `--tertiary-bg`   | filled controls (buttons, tags)    | `fg 2% × con`         | `fg 20% × con`       |
| `--quaternary-bg` | subtle fills, dividers             | `fg 24% × con`        | `fg 56% × con`       |
| `--accent-bg`     | branded interactive elements       | `acc + fg 28% × con`  | _(same formula)_     |

**State deltas** (apply to all surfaces; the `--accent-*` states mix from the `--acc` seed):

| Delta          | Light       | Dark        |
| -------------- | ----------- | ----------- |
| `--mix-hover`  | `16% × con` | `16% × con` |
| `--mix-active` | `20% × con` | `18% × con` |
| `--mix-border` | `24% × con` | `20% × con` |

**Text tokens** (fixed mix, independent of `--con`):

```css
--text-primary: color-mix(in oklch, var(--bg), var(--fg) 85%);
--text-secondary: color-mix(in oklch, var(--bg), var(--fg) 58%);
--text-tertiary: color-mix(in oklch, var(--bg), var(--fg) 40%);
```

**Layout / sizing tokens**:

```css
--radius: 8px;
--sidebar-width: 224px;
```

### Layer 3 — Tailwind mapping

The `@theme inline` block maps CSS vars to Tailwind utility classes. The naming flips from `--surface-*` (CSS) to `bg-surface` / `border-surface-border` (Tailwind), and text variables get an `ink-*` namespace:

```css
@theme inline {
  --color-base-bg: var(--base-bg);
  --color-base-bg-hover: var(--base-bg-hover);
  --color-base-border: var(--base-border);
  --color-base-border-hover: var(--base-border-hover);
  /* …same pattern for secondary, primary, tertiary, quaternary, accent… */

  --color-ink-primary: var(--text-primary);
  --color-ink-secondary: var(--text-secondary);
  --color-ink-tertiary: var(--text-tertiary);

  --radius-xs: calc(var(--radius) - 4px);
  --radius-sm: calc(var(--radius) - 2px);
  --radius-md: var(--radius);
  --radius-lg: calc(var(--radius) + 2px);
  /* …through --radius-4xl */

  --text-2xs: 11px;
  --text-xs: 12px;
  --text-sm: 13px;
  --text-md: 14px; /* note: project default is 14px, not 16px */
  --text-lg: 15px;
  --text-xl: 16px;
}
```

Resulting classes used throughout the app:

- Surfaces — `bg-base-bg`, `bg-primary-bg`, `bg-secondary-bg-hover`, `border-primary-border`, `hover:border-primary-border-hover`, …
- Text — `text-ink-primary`, `text-ink-secondary`, `text-ink-tertiary`
- Radii — `rounded-md`, `rounded-2xl`, …
- Type scale — `text-sm`, `text-md`, `text-lg`, …

### Tailwind dark variant

Because `next-themes` toggles a class (not a `data-*` attribute), the `dark:` Tailwind variant is enabled with a custom variant declaration at the top of `globals.css`:

```css
@custom-variant dark (&:is(.dark *));
```

## Theme Switching

`components/providers.tsx` wraps the tree:

```tsx
<ThemeProvider
  attribute="class"
  defaultTheme="system"
  enableSystem
  disableTransitionOnChange
>
  <ThemeOverridesApplier />
  {children}
</ThemeProvider>
```

A `ThemeButton` (`components/theme-button.tsx`) calls `setTheme("dark" | "light")` from `useTheme()`. Render is gated on a `mounted` flag to avoid hydration mismatch.

### Per-mode seed overrides (live customization)

Users can override any of the four seeds (`bg`, `fg`, `acc`, `con`) per mode through a settings UI (`components/theme-configurator.tsx`). The flow:

1. UI mutates a Zustand store (`lib/store/settings.ts`) with `persist` middleware → stored in localStorage as `settings-store`.
2. `useThemeOverrides()` (`hooks/use-theme-overrides.ts`) watches the store and the active mode, then writes `style.setProperty("--bg", value)` etc. on `document.documentElement`.
3. Removing an override calls `style.removeProperty(...)`, falling back to the `:root` / `.dark` defaults.

Because everything cascades from the seeds, mutating one CSS var live-recomputes all surfaces. The contrast slider works the same way — it just writes a number to `--con`.

## Component Conventions

### 1. Compound components via `Object.assign`

**Every** component in `components/ui/` and `components/ai/` is a compound component. The root is exported with sub-components attached as static properties. Consumers compose the parts.

```tsx
// Implementation
const MessageRoot = (props) => {
  /* ... */
};
const MessageContent = (props) => {
  /* ... */
};
const MessageActions = (props) => {
  /* ... */
};

export const Message = Object.assign(MessageRoot, {
  Content: MessageContent,
  Actions: MessageActions,
});

// Usage
<Message role="user">
  <Message.Content>
    <Message.Text>Hello</Message.Text>
  </Message.Content>
  <Message.Actions>…</Message.Actions>
</Message>;
```

Rules:

- One named export per file (the compound object).
- Root is the provider/container; sub-components consume context or accept props directly.
- No monolithic "render-everything" components — break UI into pieces (container, item, action, …) so consumers reorder, omit, or extend.
- Every sub-component accepts `className` for overrides, merged with `cn()`.
- Accept `children` instead of hardcoding internal layout where reasonable.

### 2. CVA for variants

Components with multiple visual variants declare a CVA matrix and a `defaultVariants` block. The base classes can be long — they're written as a single string but kept on a dedicated line for diff readability.

```tsx
const iconButtonVariants = cva(
  "inline-flex items-center justify-center rounded-lg border ... [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary:
          "bg-primary-bg border-primary-border text-ink-primary hover:bg-primary-bg-hover",
        secondary: "bg-secondary-bg text-ink-primary hover:bg-secondary-bg-hover",
        ghost: "hover:bg-primary-bg-hover hover:text-ink-primary",
        accent: "bg-accent text-white hover:bg-accent-hover",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        xs: "size-6 rounded-[min(var(--radius-md),10px)]",
        sm: "size-7",
        md: "size-8",
        lg: "size-9",
        xl: "size-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);
```

The icon-sizing rule `[&_svg:not([class*='size-'])]:size-4` means: if a child SVG hasn't been given an explicit `size-*` class, force it to 4 units. Consumers can still override per icon.

### 3. `data-slot` attributes

Every primitive renders a `data-slot="..."` attribute on its root DOM node. This is the canonical hook for ancestor-driven styling, e.g.:

```tsx
<ButtonPrimitive data-slot="button" className={...} />
```

Combined with Tailwind's `in-data-[...]` selector, it lets parents adjust child styles contextually (e.g. `in-data-[slot=button-group]:rounded-lg`).

### 4. Other conventions

- Prefer `type` over `interface`.
- Prefer arrow functions for components, handlers, and utilities.
- React 19: `ref` is a regular prop — no `forwardRef`.
- No barrel files (`index.ts` re-exports). Import from the specific module.
- Use Motion (`motion/react`) for entrance/exit animations.
- Standard size names: `xs`, `sm`, `md`, `lg`, `xl` (and `2xs` where needed).
- Icons: lucide for generic ones, hand-rolled SVG components in `components/icons/` for branded/custom (always use `fill="currentColor"`).

## How to replicate in a new project

1. **Install:** `tailwindcss@4`, `next-themes`, `class-variance-authority`, `clsx`, `tailwind-merge`, `@base-ui/react`.
2. **`globals.css`:** copy the three layers — seeds, derived tokens, `@theme inline` block — and the `@custom-variant dark (&:is(.dark *));` declaration at the top.
3. **`cn()` helper:** thin wrapper around `clsx` + `tailwind-merge`.
4. **Providers:** wrap the app in `next-themes` `ThemeProvider` with `attribute="class"`.
5. **First component:** write any primitive as a CVA-driven compound with `data-slot`, then expand from there.

Once the seeds and derivation rules are in place, adding a new surface family is a matter of picking a mix percentage and exposing the four states (`-hover`, `-active`, `-border`) — both in the derivation block and in `@theme inline`.
