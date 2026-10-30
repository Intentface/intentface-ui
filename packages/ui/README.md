# @intentface/ui

Headless UI primitives for React — the behavior, state, and wire formats for AI
chat interfaces and the app shells around them, with no styling of their own.

**The package owns behavior; you own every class.** There is no styled companion
package and no theme to opt out of.
The demos on each [docs](https://ui.intentface.com) page are self-contained
Tailwind, meant to be copied and restyled.

```tsx
"use client";
import { Composer } from "@intentface/ui/composer";
import { Message } from "@intentface/ui/message";
import { groupTurns } from "@intentface/ui/message-utils";
import { Thread } from "@intentface/ui/thread";

export const Chat = ({ messages, send }: ChatProps) => (
  <Thread.Root autoScroll="follow" className="h-dvh">
    <Thread.Viewport className="h-full">
      <div className="min-h-full pt-6 pb-(--thread-dock-inset)">
        <Thread.Content className="mx-auto flex max-w-2xl flex-col gap-4 px-4">
          {groupTurns(messages).map((turn) => (
            <Message.Turn key={turn.key} className="flex flex-col gap-4">
              {turn.messages.map((message) => (
                <Message.Root key={message.id} role={message.role}>
                  <Message.Text>{message.text}</Message.Text>
                </Message.Root>
              ))}
            </Message.Turn>
          ))}
        </Thread.Content>
      </div>
    </Thread.Viewport>

    <Thread.Composer className="mx-auto w-full max-w-2xl p-4">
      <Composer.Root onSubmit={send}>
        <Composer.Container className="rounded-xl border p-2">
          <Composer.Textarea placeholder="Ask anything" />
          <Composer.Actions>
            <Composer.Submit>Send</Composer.Submit>
          </Composer.Actions>
        </Composer.Container>
      </Composer.Root>
    </Thread.Composer>
  </Thread.Root>
);
```

Every class above is yours. The package docks `Thread.Composer` along the bottom
edge and publishes the room it takes as `--thread-dock-inset`, so the padding
wrapper uses it as bottom padding. It also reserves a visible area on the last
child of `Thread.Content`, which is why each child is a `Message.Turn`: the
newest question and its reply land together at the top. The `pt-6` above the
content is the gap a landed turn leaves.

## Status

Pre-1.0. The primitives are in real use, but the API is still settling and
minor releases may contain breaking changes — the usual `0.x` semver contract.
Pin an exact version if that matters to you, and check the
[changelog](https://github.com/Intentface/intentface-ui/blob/main/packages/ui/CHANGELOG.md)
when upgrading.

## Install

```bash
bun add @intentface/ui
```

`react` and `react-dom` (v19+) are peer dependencies. Nothing else ships with
it beyond one small runtime dep (`@floating-ui/dom` for anchored positioning) —
no editor framework, no animation library.

## What's inside

Each primitive is a separate entry point, exporting an unstyled compound
component that renders semantic DOM with `data-*` state attributes, context
hooks, and a `render` prop for swapping the underlying element. Shell, nav and
tabs are app-shell parts rather than chat parts, and are useful on their own:

| Import | What it is |
| --- | --- |
| `@intentface/ui/composer` | Rich-text input over a purpose-built contenteditable engine: `/` and `@` command palette, inline chips, attachments, ask-user flow. One store per `<Composer.Root>`, or bring your own via `Composer.createStore()`. |
| `@intentface/ui/thread` | Scroll container with at-bottom detection, auto-follow, and docked-composer measurement. |
| `@intentface/ui/message` | Message parts, turns, chip-segmented text, selection hooks. |
| `@intentface/ui/steps`, `/reasoning` | Tool-call timelines and reasoning disclosure. |
| `@intentface/ui/shell` | A collapsible, resizable sidebar beside the viewport it shares the screen with, with an edge hotspot. |
| `@intentface/ui/nav` | A nav tree with roving focus, typeahead, collapsible groups, and a guide ladder down the left edge. |
| `@intentface/ui/tabs` | An open-ended, closable tab collection whose panel renders in the layout or anchored to its own tab. |
| `@intentface/ui/chip`, `/attachments`, `/ask-user` | The remaining building blocks. |
| `@intentface/ui/generative` | Experimental. Typed helpers that check a model's UI tool call against a catalog, read it while it streams, resolve its data bindings, and write it as Markdown. |
| `@intentface/ui/types` | The structural message contract + part type guards. |
| `@intentface/ui/message-utils` | Part segmentation, turn grouping, reasoning/source derivation. |
| `@intentface/ui/chip-markdown` | The self-describing chip wire format. |

## AI SDK, structurally

The types are framework-agnostic. A Vercel AI SDK `UIMessage` satisfies
`ChatMessage` structurally, so there's no adapter — pass SDK messages straight
into the utilities and components:

```tsx
import { groupTurns } from "@intentface/ui/message-utils";
import type { UIMessage } from "ai";

const turns = groupTurns(messages); // messages: UIMessage[]
```

## React Server Components

Each primitive is a namespace, and the root is explicit — `Message.Root`, not
`Message`. Server components can reach every part:

```tsx
// A server component — no "use client" needed.
import { Message } from "@intentface/ui/message";

export const Transcript = ({ messages }: { messages: ChatMessage[] }) => (
  <>
    {messages.map((message) => (
      <Message.Root key={message.id} role={message.role}>
        <Message.Text>{text(message)}</Message.Text>
      </Message.Root>
    ))}
  </>
);
```

The parts are still client components — they carry their own `"use client"` — so
interactive props behave the way React requires. Pass an event handler from a
server component and you'll get React's usual error; move that piece into a
client component:

```tsx
"use client";
import { Composer } from "@intentface/ui/composer";

export const Chat = () => (
  <Composer.Root onSubmit={(data) => send(data)}>
    <Composer.Container>
      <Composer.Textarea />
    </Composer.Container>
  </Composer.Root>
);
```

Hooks (`useComposer`, `useThread`, `useReasoning`, …) are client-only, as usual.
The pure modules — `/types`, `/message-utils`, `/chip-markdown` — carry no
directive and import fine anywhere.

## Docs

Full guides, live demos, and the API reference at
[ui.intentface.com](https://ui.intentface.com).

## License

MIT
