# Message

A single chat message and its parts — bubbles, markdown, attachments, action buttons, status markers, sources, and a selection toolbar. Headless-ish: you choose which parts to render per role. Single component (`components/ai/message.tsx`), exposed as a compound API via `Message.X`. This guide also covers the assistant-turn parts it's usually paired with: [Steps](#steps), [Reasoning](#reasoning), and [Chip](#chip).

Import from `@/components/ai/message`.

## Minimal usage

A turn with a user bubble and an assistant reply:

```tsx
import { Message } from "@/components/ai/message";

<Message.Turn>
  <Message role="user" isLast={false} isError={false}>
    <Message.Content>
      <Message.Text text="How do I center a div?" />
    </Message.Content>
  </Message>

  <Message role="assistant" isLast isError={false}>
    <Message.Content>
      <Message.Markdown>{reply}</Message.Markdown>
    </Message.Content>
    <Message.Actions>
      <Message.Copy value={reply} />
    </Message.Actions>
  </Message>
</Message.Turn>;
```

`Message.Turn` groups a user message with its trailing assistant reply (it's the unit auto-scroll lands on). `Message` itself just sets role/state and the entrance animation; the parts inside do the rendering.

## Root props

`<Message>` extends `motion.div` and adds:

| Prop | Type | Notes |
|---|---|---|
| `role` | `"user" \| "assistant" \| "system"` | Drives alignment + bubble styling via `data-role`. |
| `isLast` | `boolean` | Marks the last message (`data-last`). |
| `isError` | `boolean` | Applies error styling (`data-error`). |

Sets `data-message` and fades in on mount. All three props are required.

## Compound parts

### Layout
- **`Message.Turn`** — wraps a user message + its assistant reply. `div` props + `sticky?: boolean` — when set, pins the turn's user message at the top, above the blur overlay, so the assistant reply fades under the blur as it scrolls up; releases at the turn boundary. Pure CSS; pairs with any `Thread` `autoScroll` mode.
- **`Message.Content`** — the message body. Role-styled: user → rounded primary bubble (max-width 80%), assistant → full-width borderless, error → destructive tint. `div` props.

### Text
- **`Message.Text`** — plain text with inline mention chips. `{ text: string; chips?: ChipData[] }`. Parses chip markdown in `text` and renders matching `chips` inline.
- **`Message.Markdown`** — renders markdown (full width). `Markdown` props.
- **`Message.Chip`** — a single inline chip. `{ label: string; chip?: ChipData }`. See [Chip](#chip).

### Attachments (read-only history)
- **`Message.Attachments`** — wrapper for attachment thumbnails. `div` props.
- **`Message.Attachment`** — one attachment. `{ attachment: FileUIPart }`. Images show a hover preview; other files show a type icon. No remove button (read-only).

### Actions (hover-revealed)
- **`Message.Actions`** — action row, hidden until the message is hovered or focused. `div` props.
- **`Message.Action`** — an icon button with optional tooltip. `{ tooltip?: string } & IconButton` props.
- **`Message.Copy`** — copy-to-clipboard button (shows a check on success). `{ value: string } & IconButton` props (no `children`).

### Status
- **`Message.Loading`** — animated "Loading…" indicator.
- **`Message.Stopped`** — centered "Stopped" badge for an aborted assistant turn.
- **`Message.Error`** — destructive error block with icon. `div` props.
- **`Message.Timestamp`** — formatted time. `{ timestamp: Date | string | number } & span` props.

### Sources
- **`Message.Sources`** — wrapper for source pills. `div` props.
- **`Message.Source`** — a source pill with favicon + domain. `{ url: string; domain: string } & a` props (opens in a new tab).

### Selection
- **`Message.SelectionToolbar`** — a floating "Add to chat" toolbar that appears above a text selection inside this message's `Message.Content`. `{ onAdd: (text: string) => void }`. It's scoped to the message content, so selecting markers, sources, or actions never raises it. Mount one per message you want quotable.

```tsx
<Message role="assistant" isLast isError={false}>
  <Message.Content>
    <Message.Markdown>{reply}</Message.Markdown>
  </Message.Content>
  <Message.SelectionToolbar onAdd={(text) => addQuote(text)} />
</Message>;
```

---

## Steps

Renders an assistant turn's reasoning + tool activity as a collapsible timeline (`components/ai/steps.tsx`). Import from `@/components/ai/steps`.

```tsx
<Steps defaultOpen={isStreaming}>
  <Steps.Header>Thinking…</Steps.Header>
  <Steps.Content>
    <Steps.Step label="Searching" status="complete" icon={SearchIcon}>
      <Steps.Body>{markdown}</Steps.Body>
    </Steps.Step>
    <Steps.ToolCall part={toolPart} />
  </Steps.Content>
</Steps>;
```

Parts:
- **`Steps`** (root) — controlled/uncontrolled open state. `{ open?; defaultOpen?; onOpenChange?; toolLabels? }` + `div` props.
- **`Steps.Header`** — toggle row (animated chevron). `Collapsible.Trigger` props.
- **`Steps.Content`** — the collapsible timeline. `Collapsible.Panel` props.
- **`Steps.Step`** — one timeline row. `{ label: string; status?: "complete" | "active" | "pending"; icon?; children? }`.
- **`Steps.Body`** — markdown inside a step. `Markdown` props.
- **`Steps.Summary`** — compact result text in a step. `span` props.
- **`Steps.ToolCall`** — renders a tool invocation from `{ part: ToolPart }` (auto-derives label/status/summary/sources).
- **`Steps.SearchResults`** / **`Steps.SearchResult`** — search-result badges.

## Reasoning

A collapsible "Thinking…/Thought for N seconds" block for reasoning text (`components/ai/reasoning.tsx`). Import from `@/components/ai/reasoning`.

```tsx
<Reasoning isStreaming={isStreaming} duration={seconds}>
  <Reasoning.Trigger />
  <Reasoning.Content>{reasoningText}</Reasoning.Content>
</Reasoning>;
```

Parts:
- **`Reasoning`** (root) — `{ isStreaming?: boolean; duration?: number; onOpenChange? }` + `Collapsible` props. Auto-computes elapsed time.
- **`Reasoning.Trigger`** — shows a shimmering "Thinking…" while streaming, "Thought for N seconds" when done. `{ label?: string[]; getThinkingMessage? }` + `Collapsible.Trigger` props.
- **`Reasoning.Content`** — markdown reasoning, split by headers. `children: string | string[]` + `Collapsible.Panel` props.

## Chip

A small inline pill — used by `Message.Text` / `Message.Chip` for mentions and by the composer's command lists (`components/ai/chip.tsx`). Import from `@/components/ai/chip`.

```tsx
<Chip variant="accent">
  <Chip.Icon><AtIcon /></Chip.Icon>
  <Chip.Label>alice</Chip.Label>
</Chip>;
```

Parts:
- **`Chip`** (root) — `{ variant?: ChipVariant }` + `span` props. `variant`: `"primary"` (default) | `"accent"` | `"warning"`.
- **`Chip.Icon`** — leading icon (aria-hidden). `{ children }`.
- **`Chip.Label`** — the text. `{ children }`.
- **`Chip.Preview`** — marker whose children populate a hover-card preview shown on hover. `{ children }`.

## Reference: types

Most prop types are inline (see the parts above). What the modules export:

- **Message** — `Message` only. Prop types aren't re-exported; reach for `ComponentProps<typeof Message>` if you need them.
- **Steps** — `Steps` only.
- **Reasoning** — `Reasoning`, the `useReasoning` hook, and `ReasoningRootProps`, `ReasoningTriggerProps`, `ReasoningContentProps`.
- **Chip** — `Chip`, `ChipVariant`, and `CHIP_SURFACE_CLASS` (the shared inline text-flow surface; reuse it for custom inline chips or editor decorations that must align with committed chips).

`ChipData` (used by `Message.Text`, `Message.Chip`, and chips throughout) is exported from `@/components/ai/composer`.
