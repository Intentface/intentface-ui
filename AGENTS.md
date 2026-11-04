# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

### Tech Stack

- Framework: Next.js 16 with App Router
- AI: Vercel AI SDK (`ai` package) with OpenAI GPT via `@ai-sdk/openai`
- UI Libraries:
  - Base UI (`@base-ui/react`) for headless accessible components
  - Motion (`motion/react`) for animations
  - Streamdown for animated markdown rendering
- Styling: Tailwind CSS v4 with `@tailwindcss/postcss`, custom design tokens
- Forms: TanStack Form (`@tanstack/react-form`)
- Utilities: `class-variance-authority`, `clsx`, `tailwind-merge`
- Theming: `next-themes` for dark/light mode

### Component Architecture

Two layers, two different mechanisms for the same compound-component shape. Which one applies depends on where the component lives.

#### App layer — `components/ai/`, `components/ui/`

**Every component here must follow the compound component pattern**, exposing sub-components as static properties via `Object.assign`. These are single-file, copy-pasteable shadcn-style components, and one file to copy is worth more than server-component reach. They are the interactive layer; consumers render them from client components.

```tsx
// Usage — consumer composes the pieces
<Message role="user" messageId="1">
  <Message.Content>
    <Message.Text>Hello</Message.Text>
  </Message.Content>
  <Message.Actions>
    <Message.Action tooltip="Copy">
      <CopyIcon />
    </Message.Action>
  </Message.Actions>
</Message>;

// Implementation — Root + sub-components, single named export
const MessageRoot = (props) => {
  /* ... */
};
const MessageContent = (props) => {
  /* ... */
};
export const Message = Object.assign(MessageRoot, {
  Content: MessageContent,
  Actions: MessageActions,
  // ...
});
```

Rules for compound components:

- **One named export per file** — the compound object (e.g. `export const Message = Object.assign(...)`)
- **Root component** is the provider/container; sub-components consume context or accept props
- **No monolithic render-all components** — break UI into composable pieces (container, item, action, etc.) so consumers can reorder, omit, or extend parts
- **Accept `children`** where possible instead of hardcoding internal structure
- **Accept `className`** on every sub-component for style overrides
- **Convenience wrappers are fine** — a higher-level component can compose the primitives with default behavior (e.g. `Composer.Attachments` composes `Attachments`, `Attachments.Item`, `Attachments.Remove`)

#### Package layer — `packages/ui/`

Published primitives use **namespace exports**, not `Object.assign`, and the root is explicit: `<Composer.Root>`, never `<Composer>`. Three modules per primitive:

```
src/message/message.tsx        "use client" — MessageRoot, MessageText, …
src/message/index.parts.ts     no directive — export { MessageRoot as Root, … } from "./message"
src/message/index.ts           no directive — export * as Message from "./index.parts"
                                            + flat type / hook re-exports
```

`Object.assign` puts sub-components on an exported *value*. A server component importing a `"use client"` module receives a proxy of its **named exports** and cannot read properties off a value, so `Message.Text` resolves to `undefined` and React throws `Element type is invalid… but got: undefined`. Named exports cross the boundary; property access does not. Namespace re-export through a directive-free layer keeps `Message.Text` statically resolvable.

Two constraints follow, and both are load-bearing:

- **`index.ts` and `index.parts.ts` must never carry `"use client"`.** The directive belongs on the component module one level down. Adding it to either barrel silently reintroduces the bug.
- **The build must not bundle.** One file gets one top-level directive, so bundling collapses the boundary. `tsconfig.build.json` emits per-module via tsc for exactly this reason — see the comment there before changing it.

This pattern is used throughout: `Message`, `Composer`, `Attachments`, `Chip`, `Thread`, `Steps`, `Reasoning`.

A change to the package needs a changeset, and a changeset is one short line per change, not a write-up: see [`.changeset/README.md`](./.changeset/README.md). The reasoning goes in the PR body.

### AI Integration

The chat API follows Vercel AI SDK conventions

### TypeScript Configuration

- Strict mode enabled
- Path alias: `@/*` maps to root directory
- React 19 with new JSX transform (`jsx: "react-jsx"`)
- React 19 passes `ref` as a regular prop — do not use `forwardRef`. Accept `ref` directly in the props type instead.

## Important Patterns

1. Prefer `type` over `interface` for type definitions. Prefer arrow functions over `function` keyword for components, handlers, and utilities.
2. Avoid `useEffect` for syncing/deriving state. Use it only for true side effects (subscriptions, DOM integrations).
3. Use standard size naming: `xs`, `sm`, `md`, `lg`, `xl`.
4. Organize CVA base classes with arrays/comments when classes are long.
5. Every component must use the compound component pattern — via `Object.assign` in `components/ai/` and `components/ui/`, via namespace exports in `packages/ui/` (see Component Architecture above).
6. Use `cn()` from `lib/utils.ts` for className merging.
7. Follow Biome rules and formatting.
8. Use data attributes for styling and state selectors: app components (`components/ai`, `components/ui`) stamp `data-slot` / `data-role`; package primitives (`packages/ui`) emit bespoke part attributes instead (`data-composer-editor`, `data-command-badge`) — `data-slot` belongs to the consumer layer.
9. Leverage Motion for entrance/exit animations.
10. Rich text editing goes through `Composer` from `@intentface/ui/composer` — no editor framework; don't add one.
11. Follow AI SDK patterns (`useChat()`, `streamText()`, `toUIMessageStreamResponse()`).
12. No monolithic components — always decompose into composable sub-components. Consumers compose the pieces; components never hardcode their own layout.
13. Do not use index/barrel files (`index.ts` that re-exports from other files). Import directly from the specific module instead. **Exception:** each `packages/ui/src/<primitive>/` has exactly two barrels — `index.parts.ts` and `index.ts` — which are required for server-component reach and must stay directive-free.

## Environment Variables

None. The playground chat runs on the visitor's own OpenAI key, supplied through the Key tab in playground settings and held in an HttpOnly cookie (`lib/api-key.ts`). `app/api/chat/route.ts` reads it per request via `createOpenAI({ apiKey })` and returns 401 when it is absent — there is deliberately no server-side fallback, so no code path goes unexercised.
