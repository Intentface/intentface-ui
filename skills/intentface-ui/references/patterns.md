# @intentface/ui patterns

Code examples for the rules in `SKILL.md`. The examples carry only the classes the behavior needs, written in Tailwind v4. Colors, spacing, radii, type and timing are the app's, so take them from its design system, never from here.

## Chat skeleton

```tsx
<Thread.Root
  autoScroll="follow"
  className="h-full [--chat-column:48rem] [--thread-inset-top:1rem] [--thread-composer-gap:1rem]"
>
  <Thread.Viewport className="h-full scroll-pt-(--thread-inset-top) scroll-pb-(--thread-inset-bottom) [scrollbar-gutter:stable]">
    <Thread.Content className="mx-auto w-full max-w-(--chat-column) pt-(--thread-inset-top) pb-(--thread-inset-bottom) [&>*:last-child]:min-h-(--thread-turn-min-height)">
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
      <Composer.Attachments maxFiles={0} />
      <Composer.Container>
        <Composer.Textarea aria-label="Message" placeholder="Ask anything" />
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

- `Thread.Content` sits inside `Thread.Viewport`, and the turns are its direct children, one `Message.Turn` per question and its replies.
- `Thread.Root` sets the two insets. `--thread-inset-top` is the space a landed turn keeps below the top edge, only a spacing token here because nothing floats over the thread. `--thread-composer-gap` is the room between the last line and the composer.
- `Thread.Composer` measures the room it takes at the root's bottom edge, adds the gap and writes the sum as `--thread-inset-bottom`. The thread positions nothing, so the slot sits absolute over the viewport's bottom edge and the transcript scrolls under it.
- `Thread.Content` carries both paddings, and its last turn's minimum height leaves room for a new turn to land at the top. The paddings and the minimum height read the same variables, so the turn lands exactly `--thread-inset-top` below the edge. Any other padding, margin or gap between the viewport and the turns shifts it.
- `Thread.Viewport` is a size container, so it needs a definite height, here the root's full height. Its `scroll-padding` keeps both insets clear wherever a row scrolls into view, such as through `scrollToMessage`, keyboard paging or a focus move.
- The composer slot keeps to the column's width, `--chat-column`, so it never covers the viewport's scrollbar. `scrollbar-gutter: stable` keeps the column from shifting when the scrollbar appears. The slot is click-through, and only the composer catches the pointer, so clicks and drags around the composer reach the transcript and its scrollbar.
- `<Composer.Attachments maxFiles={0} />` turns files off. The composer accepts dropped and pasted files by default, and this skeleton has no strip to show them. `references/attachments.md` builds a chat that takes files.
- The textarea needs its own `aria-label`. Its `placeholder` draws the hint and sets `aria-placeholder`, which describes the field but doesn't name it.
- The textarea carries the padding and the type, and the placeholder takes only a color. The package lays the placeholder over the editor, so any position or padding on it shifts it away from the caret.
- `"submitted"` counts as generating, so the button turns to stop the moment the message is sent, before the first token.
- `48rem` and `1rem` stand for the app's own tokens.
- `Row` is the app's memoized message row, shown in the section after next.

## A floating header and fades

The top inset is everything that covers the thread's top, plus a spacing token. Here the header floats over the thread, as in the docs site's own playground, so the inset includes its height.

```tsx
<Thread.Root
  autoScroll="follow"
  className="h-full [--chat-column:48rem] [--header-height:3.25rem] [--thread-inset-top:calc(var(--header-height)+--spacing(3))] [--thread-composer-gap:--spacing(4)]"
>
  <header className="absolute top-0 left-0 z-20 flex h-(--header-height) items-center">…</header>
  <div
    aria-hidden
    className="pointer-events-none absolute inset-x-0 top-0 z-1 mx-auto h-(--thread-inset-top) w-full max-w-(--chat-column) bg-linear-to-b from-background"
  />
  <Thread.Viewport className="h-full scroll-pt-(--thread-inset-top) scroll-pb-(--thread-inset-bottom) [scrollbar-gutter:stable]">
    <Thread.Content className="mx-auto flex w-full max-w-(--chat-column) flex-col gap-6 pt-(--thread-inset-top) pb-(--thread-inset-bottom) [&>*:last-child]:min-h-(--thread-turn-min-height)">
      {turns}
    </Thread.Content>
  </Thread.Viewport>
  <div
    aria-hidden
    className="pointer-events-none absolute inset-x-0 bottom-0 z-1 mx-auto h-(--thread-inset-bottom) w-full max-w-(--chat-column) bg-linear-to-t from-background"
  />
  <Thread.Composer className="pointer-events-none absolute inset-x-0 bottom-0 z-2 mx-auto w-full max-w-(--chat-column)">
    {composer}
  </Thread.Composer>
</Thread.Root>
```

- **The header sets the inset.** `--thread-inset-top` is the header's height plus a spacing token, so a landed turn stops below the header. A header in flow above `Thread.Root` covers nothing, so the inset is only the spacing token. A chat in a side panel or a tab, with nothing over it, keeps an inset equal to the panel's inner spacing.
- **Fades are plain `div`s.** Each one is `aria-hidden` and `pointer-events-none`, and its inset sets its height. The composer sits above the bottom fade, so it stays sharp. Both are optional, and their gradients are the app's look.
- **The inset and the turn spacing are separate.** When `--thread-inset-top` is larger than the gap between turns, the end of the previous turn shows above a landed turn. The top fade covers it.
- **Off the scrollbar.** The header spans only its own contents from the left edge, as in the playground, and the fades and the composer slot keep to the column's width, so none of them covers the viewport's scrollbar. A header that must span the full width belongs in flow above `Thread.Root`, where it covers nothing.
- **The numbers are the app's.** `3.25rem`, `--spacing(3)`, `--spacing(4)`, `gap-6` and `background` stand for the app's own tokens.

## Turns and segments

```ts
import {
  type FilePart,
  isFilePart,
  isReasoningPart,
  isTextPart,
  isToolPart,
  type ReasoningPart,
  type TextPart,
  type ToolPart,
  type UnknownPart,
} from "@intentface/ui/types";

export type MessageSegment =
  | { type: "reasoning"; parts: ReasoningPart[] }
  | { type: "tool"; parts: ToolPart[] }
  | { type: "text"; parts: TextPart[] }
  | { type: "file"; parts: FilePart[] };

const getSegmentType = (part: UnknownPart): MessageSegment["type"] | null => {
  if (isReasoningPart(part)) return "reasoning";
  if (isTextPart(part)) return "text";
  if (isFilePart(part)) return "file";
  if (isToolPart(part)) return "tool";
  return null;
};

export const getSegmentedParts = (parts: readonly UnknownPart[]) => {
  const segments: MessageSegment[] = [];
  for (const part of parts) {
    const type = getSegmentType(part);
    if (!type) continue;
    const last = segments.at(-1);
    if (last?.type === type) (last.parts as UnknownPart[]).push(part);
    else segments.push({ type, parts: [part] } as MessageSegment);
  }
  return segments;
};

export const groupTurns = <M extends { id: string; role: string }>(messages: readonly M[]) => {
  const turns: { key: string; messages: M[] }[] = [];
  for (const message of messages) {
    const turn = turns.at(-1);
    if (message.role === "user" || !turn) turns.push({ key: message.id, messages: [message] });
    else turn.messages.push(message);
  }
  return turns;
};
```

- These helpers are the app's own, in a module such as `messages.ts`. The package ships the part types and guards they use.
- A turn starts at each user message. Its key is the first message's id, so the key stays put while a reply streams.
- A part no guard matches, such as a source, starts no segment, so the text on either side of it merges into one segment.

## A message row from AI SDK parts

```tsx
"use client";

import { Message } from "@intentface/ui/message";
import { Reasoning, useReasoning } from "@intentface/ui/reasoning";
import { Steps } from "@intentface/ui/steps";
import type { ToolUIPart, UIMessage } from "ai";
import { memo } from "react";
import { getSegmentedParts } from "./messages";

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
  <Message.Root role={message.role} isLast={isLast} isError={isError} data-message-id={message.id}>
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
                  <Steps.Status />
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

- The segments keep the parts' order, so reasoning, tool calls and text interleave the way the model produced them. `getSegmentedParts` drops `dynamic-tool` parts, which MCP tools produce, and merges the text on either side of one, so this row never shows them. A chat with dynamic tools renders `message.parts` in one pass instead.
- Each reasoning segment streams on its own parts' `state`, so an earlier block settles while a later one is still thinking. `Reasoning.Root` reflects it as `data-streaming`.
- The map covers every AI SDK tool state. A state left out gives `undefined`, and `Steps.Item` shows it as complete.
- The step status is the app's own vocabulary. `Steps.Item` reflects it as `data-status` on the item, its icon and its label, which is where the per-status styles go. `data-status` reaches no screen reader, so `Steps.Status` reads the status out in a visually hidden span. Pass it children to word each status in the app's copy.
- `data-message-id` on each row is what `scrollToMessage` and `useThreadVisibility` find.
- The label reads `useReasoning()`, because the trigger ships no copy. The duration is in seconds.
- The visually hidden prefix names the speaker for screen readers, since `data-role` reaches none.
- A real row renders the assistant's text through the app's markdown, the tool's label through copy of the app's own, and file segments through the app's preview.

## Chat lifecycle

```tsx
"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { Message } from "@intentface/ui/message";
import { Thread } from "@intentface/ui/thread";
import type { UIMessage } from "ai";
import { getSegmentedParts, groupTurns } from "./messages";
import { Row } from "./row";

const PendingIndicator = () => <span aria-hidden="true">•••</span>;

export const Transcript = <M extends UIMessage>({ chat }: { chat: UseChatHelpers<M> }) => {
  const { messages, status, regenerate } = chat;
  const turns = groupTurns(messages);
  const last = messages.at(-1);
  const lastId = last?.id;
  const isGenerating = status === "submitted" || status === "streaming";
  const isWaiting =
    status === "submitted" ||
    (status === "streaming" && last?.role === "assistant" && getSegmentedParts(last.parts).length === 0);

  return (
    <>
      <Thread.Content className="pt-(--thread-inset-top) pb-(--thread-inset-bottom) [&>*:last-child]:min-h-(--thread-turn-min-height)">
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

- `chat` is the one `useChat()` result the page also hands its composer. A second `useChat()` call creates a separate chat, which the composer's messages never reach. `Transcript` is generic over the message type, so a chat with typed metadata, data parts or tools passes too.
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
    <Composer.Attachments maxFiles={0} />
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
      <Composer.Textarea aria-label="Message" placeholder="Type @ to mention a file" />
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
