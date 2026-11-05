# @intentface/ui patterns

Code examples for the rules in `SKILL.md`. The examples carry only the classes the behavior needs, written in Tailwind v4. Colors, spacing, radii, type and timing are the app's, so take them from its design system, never from here.

## Chat skeleton

```tsx
<Thread.Root
  autoScroll="follow"
  className="h-full [--chat-column:48rem] [--chat-landing-gap:1rem]"
>
  <Thread.Overlay
    direction="top"
    className="inset-x-0 top-0 mx-auto h-(--chat-landing-gap) w-full max-w-(--chat-column)"
  />
  <Thread.Viewport className="h-full pt-(--chat-landing-gap) pb-(--thread-overlay-bottom-height) [scrollbar-gutter:stable]">
    <Thread.Content className="mx-auto w-full max-w-(--chat-column) [&>*:last-child]:min-h-(--thread-turn-min-height,0px)">
      {groupTurns(messages).map((turn) => (
        <Message.Turn key={turn.key}>
          {turn.messages.map((message) => (
            <Row key={message.id} message={message} />
          ))}
        </Message.Turn>
      ))}
    </Thread.Content>
  </Thread.Viewport>
  <Thread.Composer className="pointer-events-none absolute inset-x-0 bottom-0 mx-auto w-full max-w-(--chat-column)">
    <Composer.Root onSubmit={handleSubmit} className="pointer-events-auto">
      <Composer.Container>
        <Composer.Textarea>
          <Composer.Placeholder placeholder="Ask anything" />
        </Composer.Textarea>
        <Composer.Actions>
          <Composer.Submit
            isGenerating={status === "submitted" || status === "streaming"}
            onStop={stop}
          />
        </Composer.Actions>
      </Composer.Container>
    </Composer.Root>
  </Thread.Composer>
</Thread.Root>
```

- `Thread.Content` sits directly inside `Thread.Viewport`, and the turns are its direct children, one `Message.Turn` per question and its replies.
- `Thread.Viewport` pads its bottom by the composer's measured height, so no message hides behind the composer.
- The last turn's minimum height leaves room for a new turn to land at the top of the viewport. The `0px` fallback covers the frames before the thread measures.
- One app variable, `--chat-landing-gap`, is the landing gap. The top overlay's height reads it, which is where a landed turn stops, and `Thread.Viewport`'s top padding reads it, which places the first turn. Without the overlay the gap is 0, and every new turn touches the top edge.
- The padding sits on `Thread.Viewport`, never inside `Thread.Content`, and needs no element between the two.
- The gap depends on the layout around the chat. Here a header sits in flow above the thread, so the gap is only a spacing token. A header that floats over the thread adds its own height to it, as the next section shows.
- The composer sits over the viewport's bottom edge, which is what the thread measures.
- The overlay and the composer dock keep to the column's width, `--chat-column`, so they never cover the viewport's scrollbar. `scrollbar-gutter: stable` keeps the column from shifting when the scrollbar appears. The dock is click-through, and only the composer catches the pointer, so the scrollbar stays draggable behind it.
- The textarea carries the padding and the type, and the placeholder takes only a color. The package lays the placeholder over the editor, so any position or padding on it shifts it away from the caret.
- `"submitted"` counts as generating, so the button turns to stop the moment the message is sent, before the first token.
- `48rem` and `1rem` stand for the app's own tokens.
- `Row` is the app's memoized message row, shown in the section after next.

## Landing gap

A landed turn stops at the bottom of the top overlay. The landing gap is everything that covers the thread's top, plus a spacing token. Here the header floats over the thread, as in the docs site's own playground, so the gap includes its height.

```tsx
<Thread.Root
  autoScroll="follow"
  className="h-full [--chat-column:48rem] [--header-height:3.25rem] [--chat-landing-gap:calc(var(--header-height)+--spacing(3))]"
>
  <header className="absolute top-0 left-0 z-20 flex h-(--header-height) items-center">…</header>
  <Thread.Overlay
    direction="top"
    className="inset-x-0 top-0 mx-auto h-(--chat-landing-gap) w-full max-w-(--chat-column)"
  />
  <Thread.Viewport className="h-full pt-(--chat-landing-gap) pb-(--thread-overlay-bottom-height) [scrollbar-gutter:stable]">
    <Thread.Content className="mx-auto w-full max-w-(--chat-column) [&>*:last-child]:min-h-(--thread-turn-min-height,0px)">
      {turns}
    </Thread.Content>
  </Thread.Viewport>
</Thread.Root>
```

- **One source for the gap.** `Thread.Root` defines `--chat-landing-gap` from the header's height plus a spacing token. The overlay and `Thread.Viewport`'s top padding both read it, so the gap can't drift from the header.
- **Two values, one gap.** The overlay's height is where a landed turn stops. `Thread.Viewport`'s top padding is the same height, so the first turn starts there too, before anything has scrolled.
- **Measure, never guess.** Add up everything that floats over the thread's top, such as a header, a toolbar or a banner. A header in flow above `Thread.Root` covers nothing, so the gap is only the spacing token.
- **A panel or a dock.** A chat in a side panel, a popover or a tab, with no header over it, keeps a gap equal to the panel's own inner spacing.
- **Off the scrollbar.** The header spans only its own contents from the left edge, as in the playground, and the overlay keeps to the column's width, so neither one covers the viewport's scrollbar. A header that must span the full width belongs in flow above `Thread.Root`, where it covers nothing.
- **The numbers are the app's.** `3.25rem` and `--spacing(3)` stand for the app's own tokens. A fade on the overlay is optional, and it is the app's look.

## A message row from AI SDK parts

```tsx
"use client";

import { Message } from "@intentface/ui/message";
import { getSegmentedParts } from "@intentface/ui/message-utils";
import { Reasoning, useReasoning } from "@intentface/ui/reasoning";
import { Steps } from "@intentface/ui/steps";
import type { ToolUIPart, UIMessage } from "ai";
import { memo } from "react";

const STEP_STATUS = {
  "input-streaming": "active",
  "input-available": "active",
  "approval-requested": "waiting",
  "approval-responded": "active",
  "output-available": "complete",
  "output-error": "error",
  "output-denied": "denied",
} satisfies Record<ToolUIPart["state"], string>;

const ReasoningLabel = () => {
  const { isStreaming, duration } = useReasoning();
  if (isStreaming) return "Thinking…";
  return duration === undefined ? "Reasoning" : `Thought for ${duration}s`;
};

type RowProps = { message: UIMessage; isLast?: boolean; isError?: boolean };

export const Row = memo(({ message, isLast, isError }: RowProps) => (
  <Message.Root role={message.role} isLast={isLast} isError={isError}>
    <span className="sr-only">{message.role === "user" ? "You said" : "The assistant said"}</span>
    {getSegmentedParts(message.parts).map((segment, index) => {
      switch (segment.type) {
        case "text":
          return (
            <Message.Text key={index}>{segment.parts.map((part) => part.text).join("")}</Message.Text>
          );
        case "reasoning":
          return (
            <Reasoning.Root
              key={index}
              isStreaming={segment.parts.some((part) => part.state === "streaming")}
            >
              <Reasoning.Trigger>
                <ReasoningLabel />
              </Reasoning.Trigger>
              <Reasoning.Content>{segment.parts.map((part) => part.text).join("\n\n")}</Reasoning.Content>
            </Reasoning.Root>
          );
        case "tool":
          return (
            <Steps.Root key={index}>
              {segment.parts.map((part) => (
                <Steps.Item key={part.toolCallId} status={STEP_STATUS[part.state]}>
                  <Steps.Label>{part.type.slice("tool-".length)}</Steps.Label>
                </Steps.Item>
              ))}
            </Steps.Root>
          );
        default:
          return null;
      }
    })}
  </Message.Root>
));
```

- The segments keep the parts' order, so reasoning, tool calls and text interleave the way the model produced them.
- Each reasoning segment streams on its own parts' `state`, so an earlier block settles while a later one is still thinking. `Reasoning.Root` reflects it as `data-streaming`.
- The map covers every AI SDK tool state. A state left out gives `undefined`, and `Steps.Item` shows it as complete.
- The step status is the app's own vocabulary. `Steps.Item` reflects it as `data-status` on the item, its icon and its label, which is where the per-status styles go.
- The label reads `useReasoning()`, because the trigger ships no copy. The duration is in seconds.
- The visually hidden prefix names the speaker for screen readers, since `data-role` reaches none.
- A real row renders the assistant's text through the app's markdown, the tool's label through copy of the app's own, and file segments through the app's preview.

## Chat lifecycle

```tsx
"use client";

import { useChat } from "@ai-sdk/react";
import { Message } from "@intentface/ui/message";
import { getSegmentedParts, groupTurns } from "@intentface/ui/message-utils";
import { Thread } from "@intentface/ui/thread";
import { Row } from "./row";

const PendingIndicator = () => <span aria-hidden="true">•••</span>;

export const Transcript = () => {
  const { messages, status, regenerate } = useChat();
  const turns = groupTurns(messages);
  const last = messages.at(-1);
  const lastId = last?.id;
  const isGenerating = status === "submitted" || status === "streaming";
  const isWaiting =
    status === "submitted" ||
    (status === "streaming" && last?.role === "assistant" && getSegmentedParts(last.parts).length === 0);

  return (
    <>
      <Thread.Content className="[&>*:last-child]:min-h-(--thread-turn-min-height,0px)">
        {turns.map((turn, index) => {
          const isLastTurn = index === turns.length - 1;
          return (
            <Message.Turn key={turn.key}>
              {turn.messages.map((message) => (
                <Row
                  key={message.id}
                  message={message}
                  isLast={message.id === lastId}
                  isError={status === "error" && message.id === lastId}
                />
              ))}
              {isLastTurn && isWaiting && <PendingIndicator />}
              {isLastTurn && status === "error" && (
                <div role="alert">
                  <p>The reply didn't arrive.</p>
                  <button type="button" onClick={() => regenerate()}>
                    Try again
                  </button>
                </div>
              )}
            </Message.Turn>
          );
        })}
      </Thread.Content>
      <p role="status" className="sr-only">
        {isGenerating ? "The assistant is replying" : ""}
      </p>
    </>
  );
};
```

- The pending indicator and the error row live inside the last turn, so the thread doesn't treat either one as a new turn to land.
- `"submitted"` ends at the first stream chunk that changes the message, which can come before any text. The indicator stays until the reply has a segment to show, then the assistant's own message takes over.
- Only the newest message gets `isError`, and `Message.Root` reflects it as `data-error`. When the request fails before any reply, that's the user's own message.
- The status region stays mounted and only its text changes, so screen readers announce it. The error row announces itself through `role="alert"`.
- The copy and the indicator's look are the app's.

## Commands and chips

```tsx
"use client";

import { Chip } from "@intentface/ui/chip";
import {
  type CommandItemData,
  Composer,
  type ComposerCommandsMap,
  type ComposerSubmitData,
} from "@intentface/ui/composer";
import { Message } from "@intentface/ui/message";

const FILES: CommandItemData[] = [
  { value: "readme", label: "README.md", description: "Project overview" },
  { value: "package", label: "package.json", description: "Dependencies and scripts" },
];

const COMMANDS: ComposerCommandsMap = {
  "@": { kind: "insert", trigger: "word-boundary", items: FILES },
  "/": {
    kind: "execute",
    trigger: "doc-start",
    items: [{ value: "clear", label: "Clear", onSelect: ({ editor }) => editor.clear() }],
  },
};

const CommandMenu = ({ prefix, empty }: { prefix: string; empty: string }) => (
  <Composer.Command prefix={prefix} className="group/command">
    <Composer.CommandEmpty className="hidden group-data-empty/command:block">{empty}</Composer.CommandEmpty>
    <Composer.CommandList className="group-data-empty/command:hidden">
      {(item) => (
        <Composer.CommandItem value={item.value}>
          <Composer.CommandItemLabel>{item.label}</Composer.CommandItemLabel>
          {item.description && (
            <Composer.CommandItemDescription>{item.description}</Composer.CommandItemDescription>
          )}
        </Composer.CommandItem>
      )}
    </Composer.CommandList>
  </Composer.Command>
);

export const ChatInput = ({ onSubmit }: { onSubmit: (data: ComposerSubmitData) => void }) => (
  <Composer.Root commands={COMMANDS} onSubmit={onSubmit}>
    <Composer.Popover className="data-closed:hidden">
      {(composer) =>
        composer.commands.active && (
          <>
            <CommandMenu prefix="@" empty="No files found." />
            <CommandMenu prefix="/" empty="No commands." />
          </>
        )
      }
    </Composer.Popover>
    <Composer.Container>
      <Composer.Textarea>
        <Composer.Placeholder placeholder="Type @ to mention a file" />
      </Composer.Textarea>
      <Composer.Actions>
        <Composer.Submit />
      </Composer.Actions>
    </Composer.Container>
  </Composer.Root>
);

export const UserText = ({ text }: { text: string }) => (
  <Message.Text
    renderChip={(chip) => (
      <Chip.Root>
        <Chip.Label>{chip.label}</Chip.Label>
      </Chip.Root>
    )}
  >
    {text}
  </Message.Text>
);
```

- `commands` maps each prefix to its config. `"word-boundary"` opens the `@` list after a space or at a line's start, so the `@` in an email address doesn't. `"doc-start"` opens the `/` list only as the first character.
- An `"insert"` item becomes a chip in the editor. An `"execute"` item removes the typed trigger and runs its `onSelect` instead.
- `items` can also be an async function of the query, given an `AbortSignal`. While it loads, `Composer.Command` carries `data-loading`.
- Each `Composer.Command` renders only while its own prefix is active, so both menus sit in the popover and one shows at a time.
- The chip travels in the sent text as `[README.md](chip:@:readme)`. `Message.Text` turns that token back into a chip, and `renderChip` draws it with the same `Chip` parts the editor uses.
- Inside the editor, committed chips carry `data-mention-chip`, and the trigger being completed carries `data-command-badge`.

## Collapsible height animation

```tsx
<Steps.Item>
  <Steps.Trigger className="group/steps-trigger">
    <span>Worked for 3 seconds</span>
    <ChevronDown className="-rotate-90 transition-transform group-data-open/steps-trigger:rotate-0" />
  </Steps.Trigger>
  <Steps.Panel className="h-(--panel-height) overflow-hidden transition-[height] data-starting-style:h-0 data-ending-style:h-0">
    {children}
  </Steps.Panel>
</Steps.Item>
```

- The trigger names its own group, so the chevron inside reads the trigger's `data-open`.
- `--panel-height` exists only while the panel opens or closes. The starting and ending styles pin the height to 0 on the first and last frames, so the transition runs between 0 and the measured height.
- Between transitions the variable is gone, so an open panel takes its natural height and grows with streamed content.
- A panel laid out as a flex column also needs `[&>*]:shrink-0`, or its children shrink while it is clamped to 0 and it measures itself as empty.
- `Reasoning.Content` works the same way.
