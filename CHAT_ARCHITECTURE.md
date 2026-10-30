# Chat Components

A reference for the chat surface in this project — the UI primitives (`Composer`, `Thread`, `Message`, `Reasoning`, `Steps`), the hooks and stores that glue them to the AI SDK message stream, and the streaming `/api/chat` endpoint behind them. Aimed at someone composing a chat surface from these parts or porting them to another codebase.

## Stack

- **Vercel AI SDK** (`ai@^6`) and **`@ai-sdk/react@^3`** — `Chat` class, `useChat()`, `DefaultChatTransport`, `UIMessage` parts as the wire format
- **`@ai-sdk/openai@^3`** — the only model provider; chat models are selectable demo ids (`gpt-5.5` / `gpt-5.4` / `gpt-5.4-mini` / `gpt-5.4-nano`, default `gpt-5.4-mini`)
- **No editor framework** — the composer's contenteditable engine (inline chips, prefix-triggered command lists) is hand-rolled in `packages/ui/src/composer/`
- **Zustand** (`^5`, with `persist`) — chat-list metadata, model selection, and settings
- **Streamdown** (`^2`) — streaming-safe markdown renderer used by `Message.Markdown`
- **Base UI** (`@base-ui/react`) + **motion** — popovers, collapsibles, transitions
- **`use-stick-to-bottom`** — auto-scroll engine behind `Thread`
- **Zod** (`^4`) — tool input schemas
- **Next.js App Router** (`16.x`, React `19.x`) — POST `/api/chat` is the streaming endpoint
- **Biome** — lint (`biome check`) and format (`biome format --write`)

## Mental model

Three ideas keep the surface coherent:

1. **AI SDK parts are the wire format.** Every turn is a list of `UIMessage["parts"]` — `text`, `reasoning`, `tool-{name}`, `source-url`, `file`. Components read parts; they don't own message state. The only custom metadata is `{ stopped?: boolean }` (`AppUIMessage` in `lib/ai/types.ts`); there are no custom `data-*` parts.
2. **A single `Chat` instance per chat id owns streaming and persistence.** UI primitives are stateless renderers around it. The instance is cached in a module-level `Map`, so navigating between chats reuses in-flight streams.
3. **The composer panel reflects derived state.** `useActiveComposerState(messages, status)` collapses messages + chat status into one of `idle | active | ask-user`, and the consumer feeds that to `Composer.Panel`.

```
[Composer] → onSubmit(data)
   ↓
chat.sendMessage(parts, { body: { webSearch, thinking } })   (Chat instance from @ai-sdk/react)
   ↓
DefaultChatTransport          (POST /api/chat, body carries the selected model)
   ↓
streamText → toUIMessageStreamResponse({ sendReasoning, sendSources })
   ↓
useChat() aggregates parts → messages: AppUIMessage[]
   ↓
Chat.onFinish → useChatStore.setMessages(chatId, …)  [localStorage]
   ↓
<Thread.Root> renders grouped <Message.Turn>s; the panel reflects derived state
```

## UIMessage parts

| Part type     | Notes                                                                     |
| ------------- | ------------------------------------------------------------------------- |
| `text`        | Final assistant prose / user input. User text is rendered by `Message.Text`, assistant text by `Message.Markdown` |
| `reasoning`   | Streamed model reasoning (`sendReasoning: true`)                          |
| `tool-{name}` | One per tool call. `state` cycles `input-streaming` → `input-available` → `output-available` → `output-error`. `tool-askUser` and `tool-createArtifact` are special-cased; the rest render as `Steps.ToolCall` |
| `source-url`  | Citations (`sendSources: true`), deduped by hostname                      |
| `file`        | User-uploaded attachments                                                 |

Helpers in `lib/message-utils.ts` group consecutive parts into segments and expose derived flags so renderers don't reach into part shapes directly.

---

## Composer — `components/ai/composer.tsx`

A single-file compound component (~2900 lines) exporting one namespace:

```tsx
export const Composer = Object.assign(ComposerRoot, {
  Container, Attachments, AttachmentTrigger, ContextWindow, Actions, Placeholder, Submit,
  Panel, PanelItem,
  Textarea,
  AskUser, AskUserHints, AskUserDismiss, AskUserContinue,
  Commands, CommandList, CommandItems, CommandLoading, CommandEmpty, CommandDismiss,
  CommandItem, CommandItemIcon, CommandItemLabel, CommandItemDescription,
  CommandGroup, CommandGroupLabel, CommandCollection,
});
```

### Skeleton

The nesting hierarchy at a glance:

```tsx
<Composer.Root>
  <Composer.Panel>
    <Composer.PanelItem>
      <Composer.CommandList>
        <Composer.CommandItems>
          <Composer.CommandItem>
            <Composer.CommandItemIcon />
            <Composer.CommandItemLabel />
            <Composer.CommandItemDescription />
          </Composer.CommandItem>
        </Composer.CommandItems>
        <Composer.CommandLoading />
        <Composer.CommandEmpty />
      </Composer.CommandList>
      <Composer.AskUser />
    </Composer.PanelItem>
  </Composer.Panel>

  <Composer.ContextWindow />
  <Composer.Container>
    <Composer.Attachments />
    <Composer.AttachmentTrigger />
    <Composer.Textarea>
      <Composer.Placeholder />
    </Composer.Textarea>
    <Composer.Actions>
      <Composer.AskUserHints />
      <Composer.AskUserDismiss />
      <Composer.AskUserContinue />
      <Composer.Submit />
    </Composer.Actions>
  </Composer.Container>
</Composer.Root>
```

### Root — `<Composer.Root>`

Owns the editor, attachment state, command/mention popovers, and the ask-user (questionnaire) state machine. `<Composer.Root>` is itself the provider: each mount creates and owns a store, and parts resolve it from context via `useComposer()` — there is **no `ref`**. To drive a composer from outside its tree (toolbars, shortcut handlers), create the store yourself with `Composer.createStore()`, pass it as the `store` prop, and read it with `useComposerStore(store, selector)` or imperatively through `store.controller`.

```tsx
export type ComposerRootProps = Omit<ComponentProps<"form">, "onSubmit" | "ref"> & {
  onSubmit?: (data: ComposerSubmitData) => void | Promise<void>;
  isSubmitting?: boolean;
  commands?: ComposerCommandsMap;
  questions?: AskUserQuestion[];          // present → drives the ask-user flow
  defaultValue?: ComposerSnapshot;        // uncontrolled editor doc
  value?: ComposerSnapshot;               // controlled editor doc
  onValueChange?: (snapshot: ComposerSnapshot) => void;
};
```

> Tool toggles (web search, thinking) are **not** a Composer concern. The consumer owns them and rides them in the `sendMessage` request body — see [Submission flow](#submission-flow).

`ComposerSubmitData` is a discriminated union:

```ts
type ComposerMessageSubmit = {
  kind: "message";
  text: string;          // inline chips ride inside this string as chip: markdown tokens
  files: FileUIPart[];
};

type ComposerAnswersSubmit = {
  kind: "answers";
  answers: ComposerAnswerEntry[];          // emitted by the ask-user flow
};
```

Parent components dispatch on `data.kind`: a `"message"` submit goes to `chat.sendMessage`, an `"answers"` submit goes to `addToolOutput` (resolving the open `askUser` tool call).

**`ComposerSnapshot`** is an opaque, branded wrapper around the editor's paragraph JSON (`{ __doc, __brand }`) used by the controlled `value` / `defaultValue` API — distinct from `Composer.Textarea`'s plain-string `value`. Treat it as a token: persist it and hand it back, but don't read into `__doc`.

### `useComposer()`

A selector hook over a module-singleton store (`useSyncExternalStore`); no context needed. Slices are identity-stable — a slice's reference changes only when its data does.

```ts
const { textarea, attachments, askUser, panel, commands, isSubmitting } = useComposer();
```

| Slice         | Shape                                                                       |
| ------------- | --------------------------------------------------------------------------- |
| `textarea`    | The editor controller (`focus/blur/clear/insertText/insertChip/getText/setText/serialize/ensureFocus`) plus reactive `hasContent` |
| `attachments` | `{ items, add, remove, openFileDialog, error, isDragging, fileInputRef, … }` |
| `askUser`     | `{ questions, step, answers, toggleOption, continueStep, dismissStep, isLastStep, isSingle, goBack, goNext, … }` |
| `panel`       | `{ isOpen, value }` — which panel item is open                              |
| `commands`    | `{ isOpen, trigger, query }` — prefix-popover state                         |
| `isSubmitting`| Boolean mirror of the root's `isSubmitting` prop                            |

The same controller surface is also exported as the module singleton **`composerController`** (`ComposerEditorState`) for callers outside the tree (e.g. thread message actions inserting a selection).

### Layout primitives

| Primitive                    | What it renders                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `Composer.Container`         | The visible shell — clicking it focuses the editor (unless the click lands on a button/link/input) |
| `Composer.Attachments`       | Hidden file input + animated tray of pending uploads + dropzone + error. Props: `accept`, `maxFiles`, `maxFileSize`, `multiple`, `globalDrop` |
| `Composer.AttachmentTrigger` | Icon button that opens the file dialog                                          |
| `Composer.Textarea`          | The contenteditable editor surface; finds a child `Placeholder` and overlays it while empty |
| `Composer.Placeholder`       | Shown over an empty editor. `placeholder` is `string \| string[]` — an array cycles every 3s with an animated transition |
| `Composer.Actions`           | Trailing flex row for the bottom action bar                                     |
| `Composer.Submit`            | Send button; auto-disabled with no content and no attachments. With `isGenerating` it morphs into a Stop control (cross-fades to a stop icon; click or Escape calls `onStop`) |
| `Composer.ContextWindow`     | A peeking strip behind the container's top edge; collapses when a panel opens   |

### Panel — derived overlay above the input

`Composer.Panel` is a crossfading container; `Composer.PanelItem` selects the active child by string `value`. The consumer drives `value` from `useActiveComposerState`. When a command popover is open, the panel internally overrides `value` with `"command-list"`, so an active prefix always wins over the consumer's state.

```tsx
<Composer.Panel value={panelState.type}>
  <Composer.PanelItem value="command-list">…</Composer.PanelItem>
  <Composer.PanelItem value="active">…</Composer.PanelItem>
  <Composer.PanelItem value="ask-user"><Composer.AskUser /></Composer.PanelItem>
</Composer.Panel>
```

The matched item animates in (spring height via `useMeasure`, blur-in); only one is visible at a time.

### Ask-user — `Composer.AskUser` / `AskUserHints` / `AskUserDismiss` / `AskUserContinue`

Active when the root receives a non-empty `questions` prop (driven by the open `askUser` tool call). It's a multi-step state machine over the `askUser` store slice.

- `Composer.AskUser` — renders the current question with its options and a free-text fallback; handles single- and multi-select, plus prev/next navigation across questions.
- `Composer.AskUserHints` — keyboard-hint pills (↑↓ navigate, ↵ select, ←→ between questions, esc skip).
- `Composer.AskUserDismiss` — skips the current question (`askUser.dismissStep`).
- `Composer.AskUserContinue` — submits the form; labeled `"Continue"`, or `"Submit"` on the last step. The form handler routes it through `askUser.continueStep`, which compiles per-question answers into the `ComposerAnswerEntry` union and fires `onSubmit({ kind: "answers", answers })`.

When in ask-user mode, swap the `Actions` row from the standard layout to `<AskUserHints /> <AskUserDismiss /> <AskUserContinue />`.

### Commands — prefix-triggered popovers

Pass a `commands` map to the root:

```tsx
<Composer.Root
  commands={{
    "@": { kind: "insert",  trigger: "word-boundary", items: MENTION_ITEMS },
    "/": { kind: "execute", trigger: "doc-start",        items: COMMAND_ITEMS },
  }}
>
```

| Field     | Meaning                                                                          |
| --------- | -------------------------------------------------------------------------------- |
| `kind`    | `"insert"` (selecting an item inserts a chip) or `"execute"` (runs the item's `onSelect`) |
| `trigger` | `"doc-start"` (prefix only at position 0) or `"word-boundary"` (anywhere after a space) |
| `items`   | `CommandItemData[]` **or** an async `(query, { signal }) => CommandItemData[]` for remote search |

`CommandItemData` is `{ value, label, description?, icon?, variant?, keywords?, disabled?, onSelect? }`. A `disabled` item renders `aria-disabled`/`data-disabled` and is skipped by the highlight and selection. There is **no `filter` field** — array items are fuzzy-scored on `label + keywords` internally; async `items` filter themselves (and receive an `AbortSignal`).

`Composer.Commands` is the zero-config default: it renders one `CommandList` per registered prefix. For custom layouts, render lists yourself inside `Composer.PanelItem value="command-list"`:

```tsx
<Composer.CommandList prefix="@">
  <Composer.CommandItems>
    {(item: CommandItemData) => (
      <Composer.CommandItem value={item.value}>
        {item.icon && <Composer.CommandItemIcon>{CHIP_ICONS[item.icon]}</Composer.CommandItemIcon>}
        <Composer.CommandItemLabel>{item.label}</Composer.CommandItemLabel>
        {item.description && (
          <Composer.CommandItemDescription>{item.description}</Composer.CommandItemDescription>
        )}
      </Composer.CommandItem>
    )}
  </Composer.CommandItems>
  <Composer.CommandLoading />
  <Composer.CommandEmpty />
</Composer.CommandList>
```

`Composer.CommandItems` is the render-prop loop over resolved items; `CommandLoading` shows while an async fetch is in flight; `CommandEmpty` is the selectable "No results" row (Tab/Enter on it dismisses). `CommandGroup` + `CommandGroupLabel` group items under headers; `CommandCollection` is the low-level generic loop for interleaving groups with custom JSX.

### Editor engine

The composer runs on a purpose-built contenteditable engine (`packages/ui/src/composer/`), not an editor framework:

- **Document model** (`segments.ts`) — a flat list of text and chip segments. Every mutation reduces to one contiguous range replacement (`TextChange`), which makes position mapping a single arithmetic rule.
- **DOM reconciliation** (`editor-dom.ts`) — renders the canonical child list, reusing chip spans by id so a moved chip keeps its React portal instead of remounting.
- **Command triggers** (`prefix-detection.ts` + `trigger-tracker.ts`) — a pure scan derives the active token from the text around the caret; the tracker layers sticky range tracking and dismissal memory on top, mapping positions forward through each edit. Fuzzy scoring favours prefix matches over scattered matches, and consecutive-character runs over single matches.

Chips are atomic inline `contenteditable=false` spans carrying `prefix` / `label` / `value` / `icon`; a React portal renders a `<Chip.Root>` into each.

#### Chip wire format

A chip segment serializes to a self-describing markdown-link token (`packages/ui/src/chip-markdown.ts`):

```
[Label](chip:prefix:value?variant=…&icon=…)
```

The `variant`/`icon` ride in the query string, so the token carries everything needed to re-render the badge — there is no sidecar array or `data-chip` part. `serializeEditorContent` emits these inline into the single `text` string on submit (via `encodeChipMarkdown`); `parseChipSegments` walks the same format on render (`Message.Text`) and on paste (`chipSegmentsToParagraphJSON` rebuilds the nodes). `value` is `encodeURIComponent`-encoded so it can't collide with the `?` delimiter. Legacy tokens without a query string still parse — their chips fall back to the default variant with no icon.

### Submission flow

1. `Composer.Submit` (or Enter in the editor) triggers form submit.
2. If `questions` is active and the user is mid-flow → `askUser.continueStep()` advances or finalises (emitting `{ kind: "answers" }`).
3. Otherwise → `serializeEditorContent` produces `{ text }` (chips already inlined), attachments become `FileUIPart[]`, the editor and attachments reset, and the root calls `onSubmit({ kind: "message", text, files })`. No `chips` or `tools` field — chips live in `text`, tool toggles live in the consumer.
4. The parent maps that to `chat.sendMessage({ parts: [...files, { type: "text", text }] }, { body: { webSearch, thinking } })`.

---

## Thread — `components/ai/thread.tsx`

```tsx
export const Thread = Object.assign(ThreadRoot, {
  Overlay, Viewport, Composer, Placeholder, ScrollButton,
});
```

### Skeleton

```tsx
<Thread.Root>
  <Thread.Overlay direction="top" />
  <Thread.Viewport>
    <Thread.Placeholder />
    {/* messages render here */}
  </Thread.Viewport>
  <Thread.Composer>
    <Thread.ScrollButton />
    {/* <Composer.Root> goes here */}
  </Thread.Composer>
  <Thread.Overlay direction="bottom" />
</Thread.Root>
```

| Primitive             | Role                                                                          |
| --------------------- | ----------------------------------------------------------------------------- |
| `Thread`              | Layout shell + scroll/auto-scroll owner (`role="log"`). Props add `autoScroll?: "off" \| "bottom" \| "jump" \| "follow"` (default `"follow"`) |
| `Thread.Viewport`     | Scroll container. Place mapped messages here                                  |
| `Thread.Composer`     | Bottom-anchored composer dock (`absolute inset-x-0 bottom-0`)                 |
| `Thread.ScrollButton` | "Jump to latest" pill; hides when the bottom sentinel is in view              |
| `Thread.Overlay`      | One component with a required `direction: "top" \| "bottom"` — progressive-blur fade masks at the viewport edges |
| `Thread.Placeholder`  | Empty-state slot (renders its children)                                       |

There is **no `Thread.Spacer`**. The end-of-list reserve that lets the newest turn land at the top is applied by the package: while an `autoScroll` mode lands at the top, `Thread.Content` sets `min-height: var(--thread-turn-min-height, 0px)` inline on its last child, a measured visible-area value (`root.clientHeight − the space above the content − the dock inset`). Auto-scroll behavior is driven by `use-stick-to-bottom`; `ScrollButton` reads `isAtBottom` from an `IntersectionObserver` on a bottom sentinel.

---

## Message — `components/ai/message.tsx`

```tsx
export const Message = Object.assign(MessageRoot, {
  Turn, Content, Text, Markdown, Chip,
  Attachments, Attachment,
  Sources, Source,
  Actions, Action, Copy,
  Error, Stopped, Loading, Timestamp,
  SelectionToolbar,
});
```

### Skeleton

```tsx
<Message.Turn>
  <Message.Root role="user" isLast isError={false}>
    <Message.Attachments>
      <Message.Attachment />
    </Message.Attachments>
    <Message.Content>
      <Message.Text />
    </Message.Content>
  </Message.Root>

  <Message.Root role="assistant" isLast isError={false}>
    <Message.Content>
      <Message.Markdown>
        <Message.Chip />
      </Message.Markdown>
      <Message.Loading />
    </Message.Content>
    <Message.Stopped />
    <Message.Sources>
      <Message.Source />
    </Message.Sources>
    <Message.Actions>
      <Message.Action />
      <Message.Copy />
    </Message.Actions>
    <Message.SelectionToolbar onAdd={…} />
  </Message.Root>
</Message.Turn>
```

`Message` requires `role: UIMessage["role"]`, `isLast`, and `isError`, and switches styling/alignment off `data-role` / `data-last` / `data-error`.

| Primitive             | Role                                                                       |
| --------------------- | -------------------------------------------------------------------------- |
| `Message.Turn`        | Groups a user message with its trailing assistant reply. `sticky?: boolean` pins the turn's user bubble to the top while the turn scrolls |
| `Message.Content`     | Bubble container — role-specific spacing, background, alignment            |
| `Message.Text`        | User-turn body. Takes the raw string as `children` and parses inline `chip:` tokens into badges itself — no chip props |
| `Message.Markdown`    | Streamdown wrapper — citations, code-block styling, inline chip support    |
| `Message.Chip`        | Inline chip badge (`{ label, chip? }`)                                     |
| `Message.Attachments` / `Message.Attachment` | Read-only attachment thumbnails (image hover-card or file icon) |
| `Message.Sources` / `Message.Source` | Citation row (deduped favicon + domain pills)               |
| `Message.Actions` / `Message.Action` | Hover/focus-revealed action bar (regenerate, …)             |
| `Message.Copy`        | Pre-wired "copy to clipboard" action                                       |
| `Message.Error`       | Error banner (e.g. when `chat.status === "error"`)                         |
| `Message.Stopped`     | Centered "Stopped" badge on an assistant turn the user aborted mid-stream  |
| `Message.Loading`     | Lightweight inline loader                                                  |
| `Message.Timestamp`   | Localised timestamp                                                        |
| `Message.SelectionToolbar` | Floating "Add to chat" bar above a text selection inside this message's content; `onAdd(text)` feeds the selection back into the composer |

The renderer walks a message's parts: user `text` → `Message.Text`, assistant `text` → `Message.Markdown`, `file` → `Message.Attachment`, `source-url` → `Message.Source`, `reasoning`/`tool-*` → `Reasoning` or `Steps` (see below). `Message.Sources`, `Message.Stopped`, and `Message.Actions` sit outside `Message.Content`.

---

## Reasoning — `components/ai/reasoning.tsx`

Collapsible block for `reasoning` parts.

```tsx
<Reasoning.Root isStreaming={…} duration={…}>
  <Reasoning.Trigger label={headers} />
  <Reasoning.Content>{texts}</Reasoning.Content>
</Reasoning.Root>
```

| Piece                | Notes                                                                        |
| -------------------- | ---------------------------------------------------------------------------- |
| `Reasoning`          | Controlled/uncontrolled `Collapsible`. Props: `isStreaming?`, `duration?`, plus collapsible props. Computes the streaming elapsed time |
| `Reasoning.Trigger`  | `label?: string[]` (uses the last entry as the active label); an injectable `getThinkingMessage` builds the shimmer "Thinking…" / "Thought for N seconds" line |
| `Reasoning.Content`  | `children: string \| string[]`; splits text into sections by bold `**Header**` lines via `splitReasoningByHeaders` and renders each as Markdown |

The consumer derives these props from `getReasoningInfo(segments, isStreaming)` so `Reasoning` never reads parts itself.

---

## Steps — `components/ai/steps.tsx`

```tsx
export const Steps = Object.assign(StepsRoot, {
  Header, Content, Step, Body, ToolCall, AskUser, Summary, SearchResults, SearchResult,
});
```

### Skeleton

```tsx
<Steps.Root>
  <Steps.Header />
  <Steps.Content>
    <Steps.Step>
      <Steps.Body />
      <Steps.Summary />
      <Steps.SearchResults>
        <Steps.SearchResult />
      </Steps.SearchResults>
    </Steps.Step>
    <Steps.ToolCall />
    <Steps.AskUser />
  </Steps.Content>
</Steps.Root>
```

`Steps` is a `Collapsible` that renders a chronological list of in-flight or completed work items. `Steps.Step` takes a `label` + `status` (`"complete" | "active" | "pending"`) and is a static row when it has no children, a nested collapsible when it does.

The active-vs-complete label is resolved in `Steps.ToolCall`, not `Steps.Step`: it reads the `toolLabels` map from context (default `DEFAULT_TOOL_LABELS` in `lib/message-utils.ts`) and calls `labelConfig.active(input)` while a tool runs / `labelConfig.complete(input)` once it finishes (fallback `Running ${name}` / `Ran ${name}`). `Steps.AskUser` renders an answered ask-user exchange.

`InterleavedSteps` (in `chat.tsx`) drives the historical/inline case where reasoning and tool calls are mixed in one assistant turn. The **live** in-flight version is `StepQueue`, rendered above the composer inside `Composer.PanelItem value="active"`.

---

## Hooks

### `useChatInstance(chatId)` — `hooks/use-chat-instance.ts`

Resolves (or lazily creates) the cached `Chat` for an id, wires `useChat({ chat })`, and rehydrates persisted messages on mount:

```ts
export const useChatInstance = (chatId: string) => {
  const chat = useMemo(() => getChatInstance(chatId), [chatId]);
  const helpers = useChat<AppUIMessage>({ chat });

  const { setMessages } = helpers;
  useEffect(() => {
    const stored = useChatStore.getState().getMessages(chatId);
    if (stored.length > 0) setMessages(stored);
  }, [chatId, setMessages]);

  return helpers;
};
```

SSR can't read localStorage, so server and first client render both start empty; the effect rehydrates after mount, avoiding hydration mismatches.

`getChatInstance(chatId)` (in `lib/chat-instance.ts`) keeps a `Map<chatId, Chat>` so navigation reuses in-flight streams. Each instance is configured with:

- `transport: new DefaultChatTransport({ body: () => ({ model: useModelStore.getState().model }) })` — the function form re-reads the current model per request.
- `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls` — auto-continues after a tool result lands, so multi-step tool chains don't need user re-submission. (There is no `stopWhen` here — step-count limiting happens server-side; see [Server](#server--apichatroutets).)
- `onFinish` — persists via `useChatStore.setMessages`, bumping the chat's `updatedAt`. Errors are skipped; aborts run through `applyStopToMessages`, which tags the partial turn `{ stopped: true }` (or drops it if empty).

### `useActiveComposerState(messages, status)` — `hooks/use-active-composer-state.ts`

A function-over-state hook that decides what the panel above the composer should show:

```ts
type ComposerPanelState =
  | { type: "idle" }
  | { type: "active"; steps: ComposerStepItem[] }
  | { type: "ask-user"; toolCallId: string; questions: AskUserQuestion[]; isAnswered: boolean };
```

Logic, in order:

1. If the last assistant message has a `tool-askUser` part `state: "input-available"` → **ask-user** (detected even though the chat reports `ready` while the tool waits).
2. If `status === "ready" | "error"` → **idle**.
3. If `status === "submitted"`, or streaming with no assistant message yet → **active** with a single "Thinking…" step.
4. If `status === "streaming"`:
   - Collect in-flight/recent tool parts → one step per tool (labeled via `toolLabels[name].active(input)`), prepending a "Thinking" step if reasoning is present.
   - If the last part is `reasoning` → one "Thinking…" step labeled from its last bold header.
   - If only text follows → **idle**.

Memoised by structural ref-comparison (not `useMemo`) so streaming token-by-token returns a stable identity and doesn't churn React.

> `Composer.Panel` additionally surfaces a `"command-list"` state internally whenever a command popover is open, layered on top of whichever state this hook returns.

---

## Stores — `lib/store/`

| Store              | Persisted?                | Holds                                                                 |
| ------------------ | ------------------------- | -------------------------------------------------------------------- |
| `useChatStore`     | metadata only (`chat-store`) | `chats: { id, title, createdAt, updatedAt }[]` + `createChat` / `deleteChat` / `updateChatTimestamp`. **Message bodies are stored separately** under raw `chat-messages:<chatId>` localStorage keys, accessed via `getMessages` / `setMessages` (SSR-guarded) |
| `useModelStore`    | no (in-memory)            | `model: ModelId` + `setModel`. Read by the transport body            |
| `useSettingsStore` | yes (`settings-store`)    | `scrollMode` (feeds `Thread autoScroll`), `stickyMessages` (feeds `Message.Turn sticky`), theme overrides |

Keeping message bodies out of the Zustand `persist` state (a thin localStorage facade instead) avoids serializing large arrays through the persisted store.

---

## Helpers — `lib/message-utils.ts`

| Helper                          | What it does                                                              |
| ------------------------------- | ------------------------------------------------------------------------- |
| `getSegmentedParts(parts)`      | Group consecutive parts into `text` / `reasoning` / `tool` / `file` segments |
| `partSegmentType(part)`         | Map one part to its segment type (or `null` for separately-rendered parts) |
| `groupTurns(messages)`          | Split messages into turns at each user message (key = first message id)   |
| `getTextInfo(segments)`         | Concatenated text + the text parts                                        |
| `getFileParts(segments)`        | All file attachment parts                                                 |
| `getChainInfo(segments)`        | `hasTools`, `onlyReasoning`, and the reasoning+tool segments              |
| `getReasoningInfo(segs, isStr)` | Reasoning parts, texts, bold headers, streaming flag                      |
| `getAskUserInfo(parts)`         | Whether an answer is awaited; previously answered tool calls              |
| `getSourcesInfo(parts)`         | `source-url` parts deduped by hostname                                    |
| `splitReasoningByHeaders(…)`    | Split reasoning text into `{ header, body }` sections                     |
| `DEFAULT_TOOL_LABELS` / `toolLabels` | Per-tool `{ active, complete }` label generators (12 analytics tools) |

These exist so the renderer, the panel-state hook, and `Steps` share derivation logic and stay decoupled from AI SDK part shapes.

---

## Server — `app/api/chat/route.ts`

A single `POST` handler. It reads `{ messages, model, webSearch, thinking }` from the body and streams a response:

```ts
const result = streamText({
  model: openai(modelId),                  // demo gpt-5.x ids; default gpt-5.4-mini
  system: SYSTEM_PROMPT,
  messages: await convertToModelMessages(messages),
  tools: { askUser, createArtifact, /* …analytics tools… */ ...(webSearchEnabled && { webSearch }) },
  stopWhen: stepCountIs(15),
  ...(thinkingEnabled && { providerOptions: { openai: { reasoningEffort: "medium" } } }),
  experimental_transform: smoothStream({ chunking: "word", delayInMs: 20 }),
});

return result.toUIMessageStreamResponse({ sendReasoning: true, sendSources: true });
```

- **Step cap** is server-side (`stepCountIs(15)`); thinking maps to OpenAI `reasoningEffort`; `smoothStream` paces tokens for the typing feel.
- **Tools** live in `tools/` (imported, not inline). `askUser` has **no `execute`** — it's resolved on the client via `addToolOutput`. `webSearch` is registered only when the flag is on, and internally runs a nested `generateText` (with `gpt-5-mini` + the OpenAI web-search tool) returning structured `{ claim, sources[] }` findings. The analytics tools (`listDataSources`, `connectDataSource`, `queryData`, `filterData`, `aggregateData`, `sortData`, `computeStats`, `detectAnomalies`, `createVisualization`, `exportReport`) operate over mock fixtures in `tools/analytics-data.ts`.

---

## Putting it together

The real consumer is `components/chat.tsx`, which exposes a `Chat = Object.assign(ChatRoot, { Messages, Input, Artifacts })` compound and shares the `useChatInstance` helpers via a `ChatContext`. A minimal surface uses the primitives like this:

```tsx
const ChatSurface = ({ chatId }: { chatId: string }) => {
  const { messages, status, sendMessage, addToolOutput } = useChatInstance(chatId);
  const panelState = useActiveComposerState(messages, status);
  const [tools, setTools] = useState({ webSearch: false, thinking: false });

  return (
    <Thread.Root autoScroll="follow">
      <Thread.Overlay direction="top" />
      <Thread.Viewport>
        {groupTurns(messages).map((turn) => (
          <Message.Turn key={turn.key}>
            {turn.messages.map((m, i) => (
              <Message.Root key={m.id} role={m.role} isLast={i === turn.messages.length - 1} isError={false}>
                {/* render m.parts → Message.Text / Markdown / Steps / Sources / … */}
              </Message.Root>
            ))}
          </Message.Turn>
        ))}
      </Thread.Viewport>
      <Thread.Composer>
        <Thread.ScrollButton />
        <Composer.Root
          onSubmit={(data) => {
            if (data.kind === "answers") {
              if (panelState.type !== "ask-user") return;
              addToolOutput({
                tool: "askUser",
                toolCallId: panelState.toolCallId,
                output: JSON.stringify(data.answers),
              });
              return;
            }
            sendMessage(
              { parts: [...data.files, { type: "text", text: data.text }] },
              { body: tools },
            );
          }}
          questions={panelState.type === "ask-user" ? panelState.questions : undefined}
          commands={{ "@": { kind: "insert", trigger: "word-boundary", items: MENTIONS } }}
        >
          <Composer.Panel value={panelState.type}>
            <Composer.PanelItem value="command-list">{/* CommandLists */}</Composer.PanelItem>
            <Composer.PanelItem value="active">{/* StepQueue */}</Composer.PanelItem>
            <Composer.PanelItem value="ask-user"><Composer.AskUser /></Composer.PanelItem>
          </Composer.Panel>

          <Composer.Container>
            <Composer.Attachments />
            <Composer.Textarea autoFocus>
              <Composer.Placeholder placeholder="Ask anything…" />
            </Composer.Textarea>
            <Composer.Actions>
              {panelState.type === "ask-user" ? (
                <>
                  <Composer.AskUserHints />
                  <Composer.AskUserDismiss />
                  <Composer.AskUserContinue />
                </>
              ) : (
                <Composer.Submit />
              )}
            </Composer.Actions>
          </Composer.Container>
        </Composer.Root>
      </Thread.Composer>
      <Thread.Overlay direction="bottom" />
    </Thread.Root>
  );
};
```

The composition reads top-down: `Thread` lays out the surface and owns scrolling, `Message.Turn` groups each exchange, `Composer` collects the next turn, and `useActiveComposerState` keeps the panel above the composer in sync with whatever the assistant is currently doing.
